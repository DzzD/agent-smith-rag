CREATE INDEX IF NOT EXISTS page_chunk_content_fts_simple_idx
    ON page_chunk USING GIN (to_tsvector('simple', content));

CREATE INDEX IF NOT EXISTS chunk_cluster_content_fts_simple_idx
    ON chunk_cluster USING GIN (to_tsvector('simple', content));