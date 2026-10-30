ALTER TABLE document_page
    ADD COLUMN IF NOT EXISTS blocks jsonb;

UPDATE document_page
SET blocks = metadata->'localization'->'blocks',
    metadata = jsonb_set(
        metadata #- '{localization}',
        '{dimensions}',
        jsonb_build_object(
            'width', (metadata->'localization'->>'sourceWidth')::integer,
            'height', (metadata->'localization'->>'sourceHeight')::integer
        ),
        true
    )
WHERE blocks IS NULL
  AND jsonb_typeof(metadata->'localization'->'blocks') = 'array';