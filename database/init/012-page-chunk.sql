CREATE TABLE IF NOT EXISTS page_chunk
(
    uuid uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    page_uuid uuid NOT NULL REFERENCES document_page(uuid) ON DELETE CASCADE,
    chunk_index integer NOT NULL CHECK (chunk_index >= 0),
    content text NOT NULL,
    character_count integer NOT NULL CHECK (character_count >= 0),
    token_count integer NOT NULL CHECK (token_count >= 0),
    embedding vector NOT NULL,
    embedding_model text NOT NULL,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (page_uuid, chunk_index)
);

CREATE INDEX IF NOT EXISTS page_chunk_page_uuid_idx
    ON page_chunk(page_uuid, chunk_index);
CREATE INDEX IF NOT EXISTS page_chunk_embedding_model_idx
    ON page_chunk(embedding_model);

DROP TRIGGER IF EXISTS set_updated_at_page_chunk ON page_chunk;
CREATE TRIGGER set_updated_at_page_chunk
BEFORE UPDATE ON page_chunk
FOR EACH ROW EXECUTE FUNCTION set_updated_at();