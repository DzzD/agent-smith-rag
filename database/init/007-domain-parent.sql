ALTER TABLE domain
    ADD COLUMN IF NOT EXISTS parent_domain_uuid uuid REFERENCES domain(uuid) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS domain_parent_domain_uuid_idx ON domain(parent_domain_uuid);

ALTER TABLE domain
    DROP CONSTRAINT IF EXISTS domain_parent_not_self_check;

ALTER TABLE domain
    ADD CONSTRAINT domain_parent_not_self_check CHECK (parent_domain_uuid IS NULL OR parent_domain_uuid <> uuid);
