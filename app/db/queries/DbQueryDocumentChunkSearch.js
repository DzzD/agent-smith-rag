import { DbQueryObject } from '../DbQueryObject.js';
import { PageChunk } from '../models/PageChunk.js';
import { DocumentPage } from '../models/DocumentPage.js';
import { Document } from '../models/Document.js';
import { Domain } from '../models/Domain.js';
import { BearerDomain } from '../models/BearerDomain.js';

export class DbQueryDocumentChunkSearch extends DbQueryObject
{
	constructor(connectionUid = 'default')
	{
		super('rag_server', connectionUid);

        this._query = `
WITH authorized_document_chunks AS
(
    SELECT document_chunk.*
    FROM document_chunk
    INNER JOIN document ON document.uuid = document_chunk.document_uuid
    INNER JOIN domain ON domain.uuid = document.domain_uuid
    INNER JOIN bearer_domain ON bearer_domain.domain_uuid = domain.uuid
    INNER JOIN bearer ON bearer.uuid = bearer_domain.bearer_uuid
        AND bearer.uuid = $3::uuid
        AND bearer.active = TRUE
),
semantic_source AS MATERIALIZED
(
    SELECT
        candidates.uuid,
        candidates.document_uuid,
        candidates.chunk_index,
        ARRAY_REMOVE(
            ARRAY[
                candidates.page_chunk_uuid_1,
                candidates.page_chunk_uuid_2,
                candidates.page_chunk_uuid_3,
                candidates.page_chunk_uuid_4
            ],
            NULL
        ) AS page_chunk_uuids,
        1 - (candidates.embedding <=> $1::vector) AS content_score
    FROM authorized_document_chunks AS candidates
    WHERE $1::vector IS NOT NULL
        AND candidates.embedding_model = $2
),
semantic_document_scores AS MATERIALIZED
(
    SELECT
        document.uuid AS document_uuid,
        CASE
            WHEN document.description_embedding_model = $2
            THEN 1 - (document.description_embedding <=> $1::vector)
            ELSE 0
        END AS document_description_score
    FROM document
    INNER JOIN
    (
        SELECT DISTINCT document_uuid
        FROM semantic_source
    ) AS selected_documents
        ON selected_documents.document_uuid = document.uuid
),
semantic_cluster_pages AS MATERIALIZED
(
    SELECT DISTINCT
        candidates.uuid AS document_chunk_uuid,
        page_chunk.page_uuid
    FROM semantic_source AS candidates
    CROSS JOIN LATERAL unnest(candidates.page_chunk_uuids)
        AS member(page_chunk_uuid)
    INNER JOIN page_chunk ON page_chunk.uuid = member.page_chunk_uuid
),
semantic_page_scores AS MATERIALIZED
(
    SELECT
        document_page.uuid AS page_uuid,
        CASE
            WHEN document_page.description_embedding_model = $2
            THEN 1 - (document_page.description_embedding <=> $1::vector)
            ELSE 0
        END AS page_description_score
    FROM document_page
    INNER JOIN
    (
        SELECT DISTINCT page_uuid
        FROM semantic_cluster_pages
    ) AS selected_pages
        ON selected_pages.page_uuid = document_page.uuid
),
semantic_cluster_page_scores AS
(
    SELECT
        semantic_cluster_pages.document_chunk_uuid,
        MAX(semantic_page_scores.page_description_score)
            AS page_description_score
    FROM semantic_cluster_pages
    INNER JOIN semantic_page_scores
        ON semantic_page_scores.page_uuid = semantic_cluster_pages.page_uuid
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
        COALESCE(page_scores.page_description_score, 0)
            AS page_description_score,
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
        row_number() OVER
        (
            ORDER BY
                content_score * $5
                + page_description_score * $6
                + document_description_score * $7 DESC
        ) AS semantic_rank
    FROM semantic_candidates
),
lexical_ranked AS
(
    SELECT
        candidates.uuid,
        candidates.document_uuid,
        candidates.chunk_index,
        ARRAY_REMOVE(
            ARRAY[
                candidates.page_chunk_uuid_1,
                candidates.page_chunk_uuid_2,
                candidates.page_chunk_uuid_3,
                candidates.page_chunk_uuid_4
            ],
            NULL
        ) AS page_chunk_uuids,
        ts_rank_cd(
            candidates.searchable_text,
            websearch_to_tsquery('simple', $8)
        ) AS lexical_score,
        row_number() OVER
        (
            ORDER BY ts_rank_cd(
                candidates.searchable_text,
                websearch_to_tsquery('simple', $8)
            ) DESC
        ) AS lexical_rank
    FROM authorized_document_chunks AS candidates
    WHERE $8::text IS NOT NULL
        AND candidates.searchable_text @@ websearch_to_tsquery('simple', $8)
),
ranked_candidates AS
(
    SELECT
        COALESCE(semantic_ranked.uuid, lexical_ranked.uuid)
            AS document_chunk_uuid,
        COALESCE(semantic_ranked.document_uuid, lexical_ranked.document_uuid)
            AS document_uuid,
        COALESCE(semantic_ranked.chunk_index, lexical_ranked.chunk_index)
            AS document_chunk_index,
        COALESCE(semantic_ranked.page_chunk_uuids, lexical_ranked.page_chunk_uuids)
            AS page_chunk_uuids,
        semantic_ranked.content_score,
        semantic_ranked.page_description_score,
        semantic_ranked.document_description_score,
        lexical_ranked.lexical_score,
        semantic_ranked.semantic_rank,
        lexical_ranked.lexical_rank
    FROM semantic_ranked
    FULL OUTER JOIN lexical_ranked
        ON lexical_ranked.uuid = semantic_ranked.uuid
),
scored_candidates AS
(
    SELECT
        ranked_candidates.*,
        COALESCE(1.0 / (60 + ranked_candidates.semantic_rank), 0)
            AS semantic_contribution,
        COALESCE(1.0 / (60 + ranked_candidates.lexical_rank), 0)
            AS lexical_contribution,
        COALESCE(1.0 / (60 + ranked_candidates.semantic_rank), 0)
            + COALESCE(1.0 / (60 + ranked_candidates.lexical_rank), 0)
            AS score
    FROM ranked_candidates
),
branch_extremes AS MATERIALIZED
(
    SELECT
        COALESCE(MAX(1.0 / (60 + semantic_rank)), 0)
            AS max_semantic_contribution,
        COALESCE(MAX(1.0 / (60 + lexical_rank)), 0)
            AS max_lexical_contribution
    FROM ranked_candidates
),
filtered_candidates AS
(
    SELECT scored_candidates.*
    FROM scored_candidates
    CROSS JOIN branch_extremes
    WHERE
        (
            branch_extremes.max_semantic_contribution > 0
            AND scored_candidates.semantic_contribution
                >= branch_extremes.max_semantic_contribution * $9
        )
        OR
        (
            branch_extremes.max_lexical_contribution > 0
            AND scored_candidates.lexical_contribution
                >= branch_extremes.max_lexical_contribution * $9
        )
),
expanded_page_chunks AS
(
    SELECT
        filtered_candidates.*,
        page_chunk.uuid AS page_chunk_uuid,
        row_number() OVER
        (
            PARTITION BY page_chunk.uuid
            ORDER BY
                filtered_candidates.score DESC,
                filtered_candidates.document_chunk_index
        ) AS page_chunk_rank
    FROM filtered_candidates
    CROSS JOIN LATERAL unnest(filtered_candidates.page_chunk_uuids)
        WITH ORDINALITY AS member(page_chunk_uuid, member_index)
    INNER JOIN page_chunk ON page_chunk.uuid = member.page_chunk_uuid
),
selected_page_chunks AS
(
    SELECT *
    FROM expanded_page_chunks
    WHERE page_chunk_rank = 1
    ORDER BY score DESC, page_chunk_uuid
    LIMIT $4
)
SELECT
    to_jsonb(page_chunk) AS page_chunk,
    jsonb_build_object(
        'uuid', document_page.uuid,
        'page_number', document_page.page_number,
        'description', document_page.description
    ) AS document_page,
    jsonb_build_object(
        'uuid', document.uuid,
        'original_filename', document.original_filename,
        'description', document.description
    ) AS document,
    jsonb_build_object(
        'uuid', domain.uuid,
        'uid', domain.uid
    ) AS domain,
    jsonb_build_object(
        'bearer_uuid', bearer_domain.bearer_uuid,
        'domain_uuid', bearer_domain.domain_uuid
    ) AS bearer_domain,
    candidates.content_score,
    candidates.page_description_score,
    candidates.document_description_score,
    candidates.lexical_score,
    candidates.score
FROM selected_page_chunks AS candidates
INNER JOIN page_chunk ON page_chunk.uuid = candidates.page_chunk_uuid
INNER JOIN document_page ON document_page.uuid = page_chunk.page_uuid
INNER JOIN document ON document.uuid = document_page.document_uuid
INNER JOIN domain ON domain.uuid = document.domain_uuid
INNER JOIN bearer_domain ON bearer_domain.domain_uuid = domain.uuid
    AND bearer_domain.bearer_uuid = $3::uuid
ORDER BY
    MAX(candidates.score) OVER (PARTITION BY document.uuid) DESC,
    document.uuid,
    document_page.page_number,
    page_chunk.chunk_index
	`;
		this.addDbObject(PageChunk, 'pageChunk', 'page_chunk');
		this.addDbObject(DocumentPage, 'documentPage', 'document_page');
		this.addDbObject(Document, 'document', 'document');
		this.addDbObject(Domain, 'domain', 'domain');
		this.addDbObject(BearerDomain, 'bearerDomain', 'bearer_domain');
	}
}
