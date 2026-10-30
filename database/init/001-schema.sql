CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "vector";

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

CREATE TABLE IF NOT EXISTS domain
(
    uuid uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    uid text NOT NULL UNIQUE,
    name text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS bearer
(
    uuid uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL,
    token_hash text NOT NULL UNIQUE,
    active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS bearer_domain
(
    bearer_uuid uuid NOT NULL REFERENCES bearer(uuid) ON DELETE CASCADE,
    domain_uuid uuid NOT NULL REFERENCES domain(uuid) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (bearer_uuid, domain_uuid)
);

CREATE TABLE IF NOT EXISTS document
(
    uuid uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    domain_uuid uuid NOT NULL REFERENCES domain(uuid) ON DELETE RESTRICT,
    name text NOT NULL,
    mime_type text NOT NULL,
    original_content bytea NOT NULL,
    binary_sha256 text NOT NULL,
    page_count integer NOT NULL CHECK (page_count > 0),
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (domain_uuid, binary_sha256)
);

CREATE TABLE IF NOT EXISTS document_page
(
    uuid uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    document_uuid uuid NOT NULL REFERENCES document(uuid) ON DELETE CASCADE,
    page_number integer NOT NULL CHECK (page_number > 0),
    image_content bytea NOT NULL,
    image_mime_type text NOT NULL,
    ocr_raw text NOT NULL,
    ocr_enriched text NOT NULL,
    blocks jsonb,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (document_uuid, page_number)
);

CREATE INDEX IF NOT EXISTS bearer_domain_domain_uuid_idx ON bearer_domain(domain_uuid);
CREATE INDEX IF NOT EXISTS document_domain_uuid_idx ON document(domain_uuid);
CREATE INDEX IF NOT EXISTS document_page_document_uuid_idx ON document_page(document_uuid);

DROP TRIGGER IF EXISTS domain_set_updated_at ON domain;
CREATE TRIGGER domain_set_updated_at BEFORE UPDATE ON domain FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS bearer_set_updated_at ON bearer;
CREATE TRIGGER bearer_set_updated_at BEFORE UPDATE ON bearer FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS bearer_domain_set_updated_at ON bearer_domain;
CREATE TRIGGER bearer_domain_set_updated_at BEFORE UPDATE ON bearer_domain FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS document_set_updated_at ON document;
CREATE TRIGGER document_set_updated_at BEFORE UPDATE ON document FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS document_page_set_updated_at ON document_page;
CREATE TRIGGER document_page_set_updated_at BEFORE UPDATE ON document_page FOR EACH ROW EXECUTE FUNCTION set_updated_at();
