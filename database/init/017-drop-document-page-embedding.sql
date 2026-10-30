DROP INDEX IF EXISTS document_page_embedding_model_idx;

ALTER TABLE document_page
    DROP CONSTRAINT IF EXISTS document_page_embedding_pair_check,
    DROP COLUMN IF EXISTS embedding,
    DROP COLUMN IF EXISTS embedding_model;