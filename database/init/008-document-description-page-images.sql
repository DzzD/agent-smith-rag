ALTER TABLE document
    ADD COLUMN IF NOT EXISTS original_filename text,
    ADD COLUMN IF NOT EXISTS description text,
    ADD COLUMN IF NOT EXISTS description_embedding vector,
    ADD COLUMN IF NOT EXISTS description_embedding_model text;

UPDATE document
SET original_filename = name
WHERE original_filename IS NULL;

ALTER TABLE document
    ALTER COLUMN original_filename SET NOT NULL;

ALTER TABLE document
    DROP CONSTRAINT IF EXISTS document_description_embedding_pair_check;

ALTER TABLE document
    ADD CONSTRAINT document_description_embedding_pair_check CHECK (
        (description_embedding IS NULL AND description_embedding_model IS NULL)
        OR (description_embedding IS NOT NULL AND description_embedding_model IS NOT NULL)
    );

CREATE INDEX IF NOT EXISTS document_description_embedding_model_idx ON document(description_embedding_model);

CREATE TABLE IF NOT EXISTS document_page_image
(
    uuid uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    document_page_uuid uuid NOT NULL REFERENCES document_page(uuid) ON DELETE CASCADE,
    parent_image_uuid uuid REFERENCES document_page_image(uuid) ON DELETE CASCADE,
    block_id text NOT NULL,
    depth integer NOT NULL CHECK (depth >= 1 AND depth <= 4),
    page_order integer NOT NULL CHECK (page_order > 0),
    x1 double precision NOT NULL,
    y1 double precision NOT NULL,
    x2 double precision NOT NULL,
    y2 double precision NOT NULL,
    image_content bytea NOT NULL,
    image_mime_type text NOT NULL,
    description text,
    image_type text,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (document_page_uuid, block_id),
    CHECK (x2 > x1 AND y2 > y1)
);

CREATE INDEX IF NOT EXISTS document_page_image_page_uuid_idx ON document_page_image(document_page_uuid);
CREATE INDEX IF NOT EXISTS document_page_image_parent_uuid_idx ON document_page_image(parent_image_uuid);

DROP TRIGGER IF EXISTS document_page_image_set_updated_at ON document_page_image;
CREATE TRIGGER document_page_image_set_updated_at BEFORE UPDATE ON document_page_image FOR EACH ROW EXECUTE FUNCTION set_updated_at();
