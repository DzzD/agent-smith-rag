-- Plan d'exécution de la requête actuelle de DbQueryDocumentChunkSearch (version CTE sémantiques décomposées)
-- Paramètres réels : $5/$6/$7 = 0.5/0.3/0.2, $9 = 0.6, $4 = 15, embedding repris d'un chunk existant
EXPLAIN (ANALYZE, BUFFERS, TIMING)
WITH q AS (SELECT embedding AS vec FROM document_chunk WHERE embedding_model = 'embeddings-small' LIMIT 1),
authorized_document_chunks AS
(
    SELECT document_chunk.*
    FROM document_chunk
    INNER JOIN document ON document.uuid = document_chunk.document_uuid
    INNER JOIN domain ON domain.uuid = document.domain_uuid
    INNER JOIN bearer_domain ON bearer_domain.domain_uuid = domain.uuid
    INNER JOIN bearer ON bearer.uuid = bearer_domain.bearer_uuid
        AND bearer.uuid = 'e0f1ae4e-f335-49ba-ace8-9dbe742fabce'
        AND bearer.active = TRUE
),
semantic_source AS MATERIALIZED
(
    SELECT
        candidates.uuid,
        candidates.document_uuid,
        candidates.chunk_index,
        ARRAY_REMOVE(ARRAY[candidates.page_chunk_uuid_1, candidates.page_chunk_uuid_2,
            candidates.page_chunk_uuid_3, candidates.page_chunk_uuid_4], NULL) AS page_chunk_uuids,
        1 - (candidates.embedding <=> q.vec) AS content_score
    FROM authorized_document_chunks AS candidates
    CROSS JOIN q
    WHERE candidates.embedding_model = 'embeddings-small'
),
semantic_document_scores AS MATERIALIZED
(
    SELECT
        document.uuid AS document_uuid,
        CASE WHEN document.description_embedding_model = 'embeddings-small'
            THEN 1 - (document.description_embedding <=> q.vec) ELSE 0 END AS document_description_score
    FROM document
    INNER JOIN (SELECT DISTINCT document_uuid FROM semantic_source) AS selected_documents
        ON selected_documents.document_uuid = document.uuid
    CROSS JOIN q
),
semantic_cluster_pages AS MATERIALIZED
(
    SELECT DISTINCT
        candidates.uuid AS document_chunk_uuid,
        page_chunk.page_uuid
    FROM semantic_source AS candidates
    CROSS JOIN LATERAL unnest(candidates.page_chunk_uuids) AS member(page_chunk_uuid)
    INNER JOIN page_chunk ON page_chunk.uuid = member.page_chunk_uuid
),
semantic_page_scores AS MATERIALIZED
(
    SELECT
        document_page.uuid AS page_uuid,
        CASE WHEN document_page.description_embedding_model = 'embeddings-small'
            THEN 1 - (document_page.description_embedding <=> q.vec) ELSE 0 END AS page_description_score
    FROM document_page
    INNER JOIN (SELECT DISTINCT page_uuid FROM semantic_cluster_pages) AS selected_pages
        ON selected_pages.page_uuid = document_page.uuid
    CROSS JOIN q
),
semantic_cluster_page_scores AS
(
    SELECT
        semantic_cluster_pages.document_chunk_uuid,
        MAX(semantic_page_scores.page_description_score) AS page_description_score
    FROM semantic_cluster_pages
    INNER JOIN semantic_page_scores ON semantic_page_scores.page_uuid = semantic_cluster_pages.page_uuid
    GROUP BY semantic_cluster_pages.document_chunk_uuid
),
semantic_candidates AS MATERIALIZED
(
    SELECT
        candidates.uuid,
        candidates.document_uuid,
        candidates.chunk_index,
        candidates.page_chunk_uuids,
        candidates.content_score,
        COALESCE(page_scores.page_description_score, 0) AS page_description_score,
        document_scores.document_description_score
    FROM semantic_source AS candidates
    INNER JOIN semantic_document_scores AS document_scores
        ON document_scores.document_uuid = candidates.document_uuid
    LEFT JOIN semantic_cluster_page_scores AS page_scores
        ON page_scores.document_chunk_uuid = candidates.uuid
),
semantic_ranked AS
(
    SELECT
        semantic_candidates.*,
        row_number() OVER (ORDER BY content_score * 0.5 + page_description_score * 0.3 + document_description_score * 0.2 DESC) AS semantic_rank
    FROM semantic_candidates
),
lexical_ranked AS
(
    SELECT
        candidates.uuid,
        candidates.document_uuid,
        candidates.chunk_index,
        ARRAY_REMOVE(ARRAY[candidates.page_chunk_uuid_1, candidates.page_chunk_uuid_2,
            candidates.page_chunk_uuid_3, candidates.page_chunk_uuid_4], NULL) AS page_chunk_uuids,
        ts_rank_cd(candidates.searchable_text, websearch_to_tsquery('simple', 'laboratoire numérique organigramme DNSI')) AS lexical_score,
        row_number() OVER
        (
            ORDER BY ts_rank_cd(candidates.searchable_text, websearch_to_tsquery('simple', 'laboratoire numérique organigramme DNSI')) DESC
        ) AS lexical_rank
    FROM authorized_document_chunks AS candidates
    WHERE candidates.searchable_text @@ websearch_to_tsquery('simple', 'laboratoire numérique organigramme DNSI')
),
ranked_candidates AS
(
    SELECT
        COALESCE(semantic_ranked.uuid, lexical_ranked.uuid) AS document_chunk_uuid,
        COALESCE(semantic_ranked.document_uuid, lexical_ranked.document_uuid) AS document_uuid,
        COALESCE(semantic_ranked.chunk_index, lexical_ranked.chunk_index) AS document_chunk_index,
        COALESCE(semantic_ranked.page_chunk_uuids, lexical_ranked.page_chunk_uuids) AS page_chunk_uuids,
        semantic_ranked.content_score,
        semantic_ranked.page_description_score,
        semantic_ranked.document_description_score,
        lexical_ranked.lexical_score,
        semantic_ranked.semantic_rank,
        lexical_ranked.lexical_rank
    FROM semantic_ranked
    FULL OUTER JOIN lexical_ranked ON lexical_ranked.uuid = semantic_ranked.uuid
),
scored_candidates AS
(
    SELECT
        ranked_candidates.*,
        COALESCE(1.0 / (60 + ranked_candidates.semantic_rank), 0) AS semantic_contribution,
        COALESCE(1.0 / (60 + ranked_candidates.lexical_rank), 0) AS lexical_contribution,
        COALESCE(1.0 / (60 + ranked_candidates.semantic_rank), 0)
            + COALESCE(1.0 / (60 + ranked_candidates.lexical_rank), 0) AS score
    FROM ranked_candidates
),
branch_extremes AS MATERIALIZED
(
    SELECT
        COALESCE(MAX(1.0 / (60 + semantic_rank)), 0) AS max_semantic_contribution,
        COALESCE(MAX(1.0 / (60 + lexical_rank)), 0) AS max_lexical_contribution
    FROM ranked_candidates
),
filtered_candidates AS
(
    SELECT scored_candidates.*
    FROM scored_candidates, branch_extremes
    WHERE scored_candidates.semantic_contribution >= branch_extremes.max_semantic_contribution * 0.6
        OR scored_candidates.lexical_contribution >= branch_extremes.max_lexical_contribution * 0.6
),
expanded_page_chunks AS
(
    SELECT
        filtered_candidates.*,
        page_chunk.uuid AS page_chunk_uuid,
        row_number() OVER (PARTITION BY page_chunk.uuid ORDER BY filtered_candidates.score DESC, filtered_candidates.document_chunk_index) AS page_chunk_rank
    FROM filtered_candidates
    CROSS JOIN LATERAL unnest(filtered_candidates.page_chunk_uuids) WITH ORDINALITY AS member(page_chunk_uuid, member_index)
    INNER JOIN page_chunk ON page_chunk.uuid = member.page_chunk_uuid
),
selected_page_chunks AS
(
    SELECT * FROM expanded_page_chunks
    WHERE page_chunk_rank = 1
    ORDER BY score DESC, page_chunk_uuid
    LIMIT 15
)
SELECT
    to_jsonb(page_chunk) AS page_chunk,
    document_page.page_number,
    document.original_filename,
    candidates.content_score, candidates.page_description_score, candidates.document_description_score,
    candidates.lexical_score, candidates.score
FROM selected_page_chunks AS candidates
INNER JOIN page_chunk ON page_chunk.uuid = candidates.page_chunk_uuid
INNER JOIN document_page ON document_page.uuid = page_chunk.page_uuid
INNER JOIN document ON document.uuid = document_page.document_uuid
ORDER BY MAX(candidates.score) OVER (PARTITION BY document.uuid) DESC,
    document.uuid, document_page.page_number, page_chunk.chunk_index;