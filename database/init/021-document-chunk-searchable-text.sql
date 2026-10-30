-- Stockage du tsvector lexical enrichi pour la recherche document_chunk.
-- Construction identique à celle calculée dynamiquement dans DbQueryDocumentChunkSearch :
--   A : document_chunk.content
--   B : document.original_filename
--   C : document.description
--   B : concaténation des document_page.description des pages référencées
--       par page_chunk_uuid_1..4 via page_chunk.page_uuid (ordre des uuid_1..4 conservé, sans déduplication).

ALTER TABLE document_chunk
    ADD COLUMN IF NOT EXISTS searchable_text tsvector;

CREATE INDEX IF NOT EXISTS document_chunk_searchable_text_fts_idx
    ON document_chunk USING GIN (searchable_text);

-- Backfill des clusters existants. L'ordre des descriptions de pages suit l'ordre
-- page_chunk_uuid_1..4 (comme dans la requête de recherche d'origine, jointures filtrées par unnestIdx).
UPDATE document_chunk
SET searchable_text =
    setweight(to_tsvector('simple', document_chunk.content), 'A')
    || setweight(to_tsvector('simple', document.original_filename), 'B')
    || setweight(to_tsvector('simple', COALESCE(document.description, '')), 'C')
    || setweight(to_tsvector('simple', COALESCE((
        SELECT STRING_AGG(COALESCE(document_page.description, ''), ' ')
        FROM unnest(ARRAY[document_chunk.page_chunk_uuid_1, document_chunk.page_chunk_uuid_2,
            document_chunk.page_chunk_uuid_3, document_chunk.page_chunk_uuid_4]) WITH ORDINALITY AS member(page_chunk_uuid, unnestIdx)
        INNER JOIN page_chunk ON page_chunk.uuid = member.page_chunk_uuid
        INNER JOIN document_page ON document_page.uuid = page_chunk.page_uuid
    ), '')), 'B')
FROM document
WHERE document.uuid = document_chunk.document_uuid
    AND (document_chunk.searchable_text IS NULL OR document_chunk.updated_at < document.updated_at);

-- L'ancien index lexical content-only devient redondant mais reste utile pour les requêtes
-- ne portant que sur le contenu : on le conserve.