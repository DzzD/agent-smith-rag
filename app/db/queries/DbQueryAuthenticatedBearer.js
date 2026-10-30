import { createHash } from 'node:crypto';
import { DbQueryObject } from '../DbQueryObject.js';
import { Bearer } from '../models/Bearer.js';
import { Domain } from '../models/Domain.js';
import { BearerDomain } from '../models/BearerDomain.js';

export class DbQueryAuthenticatedBearer extends DbQueryObject
{
    constructor(connectionUid = 'default')
    {
        super('rag_server', connectionUid);
        this._query = `
            SELECT
                jsonb_build_object(
                    'uuid', bearer.uuid,
                    'name', bearer.name,
                    'active', bearer.active,
                    'created_at', bearer.created_at,
                    'updated_at', bearer.updated_at
                ) AS bearer,
                to_jsonb(domain) AS domain,
                to_jsonb(bearer_domain) AS bearer_domain
            FROM bearer
            INNER JOIN bearer_domain ON bearer_domain.bearer_uuid = bearer.uuid
            INNER JOIN domain ON domain.uuid = bearer_domain.domain_uuid
            WHERE bearer.token_hash = $1 AND bearer.active = true
            ORDER BY domain.uid
        `;
        this.addDbObject(Bearer, 'bearer', 'bearer');
        this.addDbObject(Domain, 'domain', 'domain');
        this.addDbObject(BearerDomain, 'bearerDomain', 'bearer_domain');
    }

    async authenticate(token)
    {
        const tokenHash = createHash('sha256').update(token).digest('hex');
        await this.search(null, [tokenHash]);
        const domainUuids = [];
        const domainUids = [];
        let authenticatedBearer = null;

        while (await this.next())
        {
            authenticatedBearer = this.bearer;
            domainUuids.push(this.domain.uuid);
            domainUids.push(this.domain.uid);
        }

        this.close();

        if (!authenticatedBearer)
        {
            return null;
        }

        authenticatedBearer.domainUuids = domainUuids;
        authenticatedBearer.domainUids = domainUids;
        return authenticatedBearer;
    }
}
