INSERT INTO domain (uid, name)
VALUES ('DRH', 'Direction des ressources humaines')
ON CONFLICT (uid) DO UPDATE SET name = EXCLUDED.name;

INSERT INTO bearer_domain (bearer_uuid, domain_uuid)
SELECT bearer.uuid, domain.uuid
FROM bearer
CROSS JOIN domain
WHERE bearer.name = 'agent'
  AND bearer.active = true
  AND domain.uid = 'DRH'
ON CONFLICT (bearer_uuid, domain_uuid) DO NOTHING;