ALTER TABLE document_page
    ADD COLUMN IF NOT EXISTS description text,
    ADD COLUMN IF NOT EXISTS description_embedding vector,
    ADD COLUMN IF NOT EXISTS description_embedding_model text;

ALTER TABLE document_page
    DROP CONSTRAINT IF EXISTS document_page_description_embedding_pair_check;

ALTER TABLE document_page
    ADD CONSTRAINT document_page_description_embedding_pair_check CHECK (
        (description_embedding IS NULL AND description_embedding_model IS NULL)
        OR (description_embedding IS NOT NULL AND description_embedding_model IS NOT NULL)
    );

UPDATE document_page
SET metadata = '{}'::jsonb;

CREATE INDEX IF NOT EXISTS document_description_embedding_model_idx
    ON document(description_embedding_model);
CREATE INDEX IF NOT EXISTS document_page_description_embedding_model_idx
    ON document_page(description_embedding_model);