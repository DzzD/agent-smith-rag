CREATE TABLE IF NOT EXISTS chunk_cluster
(
    uuid uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    page_uuid uuid NOT NULL REFERENCES document_page(uuid) ON DELETE CASCADE,
    cluster_index integer NOT NULL CHECK (cluster_index >= 0),
    first_chunk_index integer NOT NULL CHECK (first_chunk_index >= 0),
    last_chunk_index integer NOT NULL CHECK (last_chunk_index >= first_chunk_index),
    content text NOT NULL,
    character_count integer NOT NULL CHECK (character_count >= 0),
    token_count integer NOT NULL CHECK (token_count >= 0),
    embedding vector NOT NULL,
    embedding_model text NOT NULL,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (page_uuid, cluster_index)
);

ALTER TABLE page_chunk
    ADD COLUMN IF NOT EXISTS cluster_uuid uuid REFERENCES chunk_cluster(uuid) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS chunk_cluster_page_uuid_idx
    ON chunk_cluster(page_uuid, cluster_index);
CREATE INDEX IF NOT EXISTS chunk_cluster_embedding_model_idx
    ON chunk_cluster(embedding_model);
CREATE INDEX IF NOT EXISTS page_chunk_cluster_uuid_idx
    ON page_chunk(cluster_uuid);

DROP TRIGGER IF EXISTS set_updated_at_chunk_cluster ON chunk_cluster;
CREATE TRIGGER set_updated_at_chunk_cluster
BEFORE UPDATE ON chunk_cluster
FOR EACH ROW EXECUTE FUNCTION set_updated_at();