ALTER TABLE document_page
	ALTER COLUMN blocks TYPE jsonb
	USING NULL;