ALTER TABLE document_page
    ADD COLUMN IF NOT EXISTS pixel_width integer,
    ADD COLUMN IF NOT EXISTS pixel_height integer,
    ADD COLUMN IF NOT EXISTS dpi integer;

UPDATE document_page
SET pixel_width = ROUND((blocks->>'width')::numeric),
    pixel_height = ROUND((blocks->>'height')::numeric)
WHERE pixel_width IS NULL OR pixel_height IS NULL;

ALTER TABLE document_page
    ALTER COLUMN pixel_width SET NOT NULL,
    ALTER COLUMN pixel_height SET NOT NULL,
    ADD CONSTRAINT document_page_pixel_width_positive CHECK (pixel_width > 0),
    ADD CONSTRAINT document_page_pixel_height_positive CHECK (pixel_height > 0),
    ADD CONSTRAINT document_page_dpi_positive CHECK (dpi IS NULL OR dpi > 0);