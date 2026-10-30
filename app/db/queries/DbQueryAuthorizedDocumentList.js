import { DbQueryObject } from '../DbQueryObject.js';
import { Document } from '../models/Document.js';

export class DbQueryAuthorizedDocumentList extends DbQueryObject
{
    constructor(connectionUid = 'default')
    {
        super('rag_server', connectionUid);
        this._query = `
            SELECT
                jsonb_build_object(
                    'uuid', document.uuid,
                    'original_filename', document.original_filename,
                    'page_count', document.page_count,
                    'created_at', document.created_at,
                    'updated_at', document.updated_at
                ) AS document,
                domain.uid AS domain_uid,
                COUNT(*) OVER() AS total_count
            FROM document
            INNER JOIN domain ON domain.uuid = document.domain_uuid
            INNER JOIN bearer_domain ON bearer_domain.domain_uuid = domain.uuid
            WHERE bearer_domain.bearer_uuid = $1
              AND ($2::text = '' OR document.original_filename ~* $2)
            ORDER BY document.original_filename, document.uuid
            LIMIT $3
            OFFSET $4
        `;
        this.addDbObject(Document, 'document', 'document');
    }
}