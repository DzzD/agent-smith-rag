-- Rejoue la branche lexicale de DbQueryDocumentChunkSearch avec bearer réel
EXPLAIN (ANALYZE, BUFFERS, TIMING)
WITH authorized_document_chunks AS
(
    SELECT
        document_chunk.uuid,
        document_chunk.document_uuid,
        document_chunk.chunk_index,
        document_chunk.page_chunk_uuid_1,
        document_chunk.page_chunk_uuid_2,
        document_chunk.page_chunk_uuid_3,
        document_chunk.page_chunk_uuid_4,
        document_chunk.content,
        document_chunk.embedding,
        document_chunk.embedding_model
    FROM document_chunk
    INNER JOIN document ON document.uuid = document_chunk.document_uuid
    INNER JOIN domain ON domain.uuid = document.domain_uuid
    INNER JOIN bearer_domain ON bearer_domain.domain_uuid = domain.uuid
    INNER JOIN bearer ON bearer.uuid = bearer_domain.bearer_uuid
        AND bearer.uuid = 'e0f1ae4e-f335-49ba-ace8-9dbe742fabce'
        AND bearer.active = TRUE
),
lexical_candidates AS
(
    SELECT
        candidates.uuid,
        candidates.document_uuid,
        candidates.chunk_index,
        ARRAY_REMOVE(ARRAY[candidates.page_chunk_uuid_1, candidates.page_chunk_uuid_2,
            candidates.page_chunk_uuid_3, candidates.page_chunk_uuid_4], NULL) AS page_chunk_uuids
    FROM authorized_document_chunks AS candidates
    WHERE candidates.uuid IN
    (
        SELECT document_chunk.uuid
        FROM document_chunk
        WHERE to_tsvector('simple', document_chunk.content) @@ websearch_to_tsquery('simple', 'laboratoire numérique organigramme DNSI')
        UNION
        SELECT document_chunk.uuid
        FROM document_chunk
        INNER JOIN document AS document ON document.uuid = document_chunk.document_uuid
        WHERE to_tsvector('simple', document.original_filename || ' ' || COALESCE(document.description, '')) @@ websearch_to_tsquery('simple', 'laboratoire numérique organigramme DNSI')
    )
),
lexical_enriched AS
(
    SELECT
        lexical_candidates.*,
        setweight(to_tsvector('simple', candidates.content), 'A')
            || setweight(to_tsvector('simple', document.original_filename), 'B')
            || setweight(to_tsvector('simple', COALESCE(document.description, '')), 'C')
            || setweight(COALESCE((
                SELECT to_tsvector('simple', STRING_AGG(COALESCE(document_page.description, ''), ' '))
                FROM unnest(lexical_candidates.page_chunk_uuids) AS member(page_chunk_uuid)
                INNER JOIN page_chunk ON page_chunk.uuid = member.page_chunk_uuid
                INNER JOIN document_page ON document_page.uuid = page_chunk.page_uuid
            ), to_tsvector('simple', '')), 'B') AS searchable_text
    FROM lexical_candidates
    INNER JOIN authorized_document_chunks AS candidates ON candidates.uuid = lexical_candidates.uuid
    INNER JOIN document ON document.uuid = lexical_candidates.document_uuid
),
lexical_ranked AS
(
    SELECT
        lexical_enriched.uuid,
        lexical_enriched.document_uuid,
        lexical_enriched.chunk_index,
        lexical_enriched.page_chunk_uuids,
        ts_rank_cd(lexical_enriched.searchable_text, websearch_to_tsquery('simple', 'laboratoire numérique organigramme DNSI')) AS lexical_score,
        row_number() OVER
        (
            ORDER BY ts_rank_cd(lexical_enriched.searchable_text, websearch_to_tsquery('simple', 'laboratoire numérique organigramme DNSI')) DESC
        ) AS lexical_rank
    FROM lexical_enriched
    WHERE lexical_enriched.searchable_text @@ websearch_to_tsquery('simple', 'laboratoire numérique organigramme DNSI')
)
SELECT document.original_filename, lexical_ranked.lexical_rank, lexical_ranked.lexical_score
FROM lexical_ranked
INNER JOIN document ON document.uuid = lexical_ranked.document_uuid
ORDER BY lexical_rank;