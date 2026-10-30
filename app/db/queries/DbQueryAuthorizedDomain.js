import { DbQueryObject } from '../DbQueryObject.js';
import { Domain } from '../models/Domain.js';
import { BearerDomain } from '../models/BearerDomain.js';

export class DbQueryAuthorizedDomain extends DbQueryObject
{
    constructor(connectionUid = 'default')
    {
        super('rag_server', connectionUid);
        this._query = `
            SELECT
                to_jsonb(domain) AS domain,
                to_jsonb(bearer_domain) AS bearer_domain,
                domain.uid AS domain_uid,
                bearer_domain.bearer_uuid AS bearer_uuid
            FROM domain
            INNER JOIN bearer_domain ON bearer_domain.domain_uuid = domain.uuid
        `;
        this.addDbObject(Domain, 'domain', 'domain');
        this.addDbObject(BearerDomain, 'bearerDomain', 'bearer_domain');
    }
}
