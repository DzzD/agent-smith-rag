import { DbQueryObject } from '../DbQueryObject.js';
import { Document } from '../models/Document.js';
import { Domain } from '../models/Domain.js';
import { BearerDomain } from '../models/BearerDomain.js';

export class DbQueryAuthorizedDocument extends DbQueryObject
{
    constructor(connectionUid = 'default')
    {
        super('rag_server', connectionUid);
        this._query = `
            SELECT
                jsonb_build_object(
                    'uuid', document.uuid,
                    'domain_uuid', document.domain_uuid,
                    'name', document.name,
                    'mime_type', document.mime_type,
                    'binary_sha256', document.binary_sha256,
                    'page_count', document.page_count,
                    'metadata', document.metadata,
                    'created_at', document.created_at,
                    'updated_at', document.updated_at,
                    'original_filename', document.original_filename,
                    'description', document.description,
                    'description_embedding_model', document.description_embedding_model
                ) AS document,
                to_jsonb(domain) AS domain,
                to_jsonb(bearer_domain) AS bearer_domain,
                bearer_domain.bearer_uuid AS bearer_uuid,
                document.original_content AS original_content
            FROM document
            INNER JOIN domain ON domain.uuid = document.domain_uuid
            INNER JOIN bearer_domain ON bearer_domain.domain_uuid = domain.uuid
        `;
        this.addDbObject(Document, 'document', 'document');
        this.addDbObject(Domain, 'domain', 'domain');
        this.addDbObject(BearerDomain, 'bearerDomain', 'bearer_domain');
    }
}
