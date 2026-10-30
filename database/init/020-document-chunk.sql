ALTER TABLE page_chunk
    DROP COLUMN IF EXISTS cluster_uuid;

DROP TABLE IF EXISTS chunk_cluster;

CREATE TABLE document_chunk
(
    uuid uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    document_uuid uuid NOT NULL REFERENCES document(uuid) ON DELETE CASCADE,
    chunk_index integer NOT NULL CHECK (chunk_index >= 0),
    page_chunk_uuid_1 uuid NOT NULL REFERENCES page_chunk(uuid) ON DELETE CASCADE,
    page_chunk_uuid_2 uuid REFERENCES page_chunk(uuid) ON DELETE CASCADE,
    page_chunk_uuid_3 uuid REFERENCES page_chunk(uuid) ON DELETE CASCADE,
    page_chunk_uuid_4 uuid REFERENCES page_chunk(uuid) ON DELETE CASCADE,
    content text NOT NULL,
    character_count integer NOT NULL CHECK (character_count >= 0),
    token_count integer NOT NULL CHECK (token_count >= 0),
    embedding vector NOT NULL,
    embedding_model text NOT NULL,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CHECK (page_chunk_uuid_2 IS NOT NULL OR (page_chunk_uuid_3 IS NULL AND page_chunk_uuid_4 IS NULL)),
    CHECK (page_chunk_uuid_3 IS NOT NULL OR page_chunk_uuid_4 IS NULL),
    UNIQUE (document_uuid, chunk_index)
);

CREATE INDEX document_chunk_document_uuid_idx
    ON document_chunk(document_uuid, chunk_index);
CREATE INDEX document_chunk_embedding_model_idx
    ON document_chunk(embedding_model);
CREATE INDEX document_chunk_content_fts_simple_idx
    ON document_chunk USING GIN (to_tsvector('simple', content));

CREATE TRIGGER set_updated_at_document_chunk
BEFORE UPDATE ON document_chunk
FOR EACH ROW EXECUTE FUNCTION set_updated_at();