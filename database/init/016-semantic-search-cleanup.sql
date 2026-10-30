DROP INDEX IF EXISTS document_description_fts_fr_idx;
DROP INDEX IF EXISTS document_page_description_fts_fr_idx;
DROP INDEX IF EXISTS document_page_ocr_enriched_fts_fr_idx;
DROP INDEX IF EXISTS document_description_trgm_idx;
DROP INDEX IF EXISTS document_page_description_trgm_idx;
DROP INDEX IF EXISTS document_page_ocr_enriched_trgm_idx;
DROP INDEX IF EXISTS page_chunk_content_fts_fr_idx;
DROP INDEX IF EXISTS page_chunk_content_trgm_idx;

DROP EXTENSION IF EXISTS pg_trgm;