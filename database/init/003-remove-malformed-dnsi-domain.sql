DELETE FROM domain
WHERE name = 'DNSI'
  AND uid <> 'DNSI'
  AND NOT EXISTS (SELECT 1 FROM bearer_domain WHERE bearer_domain.domain_uuid = domain.uuid)
  AND NOT EXISTS (SELECT 1 FROM document WHERE document.domain_uuid = domain.uuid);