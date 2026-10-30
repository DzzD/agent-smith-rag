import { DbQueryObject } from '../DbQueryObject.js';
import { DocumentPage } from '../models/DocumentPage.js';

export class DbQueryAuthorizedDocumentPage extends DbQueryObject
{
    constructor(connectionUid = 'default')
    {
        super('rag_server', connectionUid);
        this._query = `
            SELECT
                jsonb_build_object(
                    'uuid', document_page.uuid,
                    'document_uuid', document_page.document_uuid,
                    'page_number', document_page.page_number,
                    'image_mime_type', document_page.image_mime_type,
                    'blocks', document_page.blocks,
                    'pixel_width', document_page.pixel_width,
                    'pixel_height', document_page.pixel_height,
                    'dpi', document_page.dpi
                ) AS document_page,
                document_page.uuid AS page_uuid,
                bearer_domain.bearer_uuid AS bearer_uuid,
                document.original_filename AS source_file_name,
                document_page.image_content AS image_content
            FROM document_page
            INNER JOIN document ON document.uuid = document_page.document_uuid
            INNER JOIN bearer_domain ON bearer_domain.domain_uuid = document.domain_uuid
        `;
        this.addDbObject(DocumentPage, 'documentPage', 'document_page');
    }
}
