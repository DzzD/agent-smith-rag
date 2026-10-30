UPDATE document_page
SET metadata = metadata - 'blocks'
WHERE metadata ? 'blocks';