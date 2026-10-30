import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DbManager } from '../app/db/DbManager.js';
import { Document } from '../app/db/models/Document.js';
import { DocumentPage } from '../app/db/models/DocumentPage.js';
import { DocumentConfig } from '../rag/config/DocumentConfig.js';

const baseDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: path.join(baseDirectory, '.env') });

if (process.env.RAG_VISION_IMAGE_DIRECTORY)
{
	process.env.RAG_VISION_IMAGE_DIRECTORY = path.resolve(baseDirectory, process.env.RAG_VISION_IMAGE_DIRECTORY);
}

const documentName = String(process.argv[2] ?? '').trim();
const pageNumber = Number(process.argv[3]);

if (!documentName || !Number.isInteger(pageNumber) || pageNumber < 1)
{
	throw new Error('Usage: node scripts/diagnose-stored-page-ocr.js <document-name-fragment> <page-number>');
}

const database = {
	name: process.env.RAG_PG_DB,
	host: process.env.RAG_PG_HOST,
	port: Number(process.env.RAG_PG_PORT),
	user: process.env.RAG_PG_USER,
	password: process.env.RAG_PG_PASSWORD,
	database: process.env.RAG_PG_DB,
	poolSize: Number(process.env.RAG_PG_POOL_SIZE || 20),
};
const document = new Document();
const page = new DocumentPage();

try
{
	DbManager.addDatabase(database);
	await document.search('"original_filename" ILIKE $1', [`%${documentName}%`], { limit: 2 });

	if (!(await document.next()))
	{
		throw new Error(`Document not found: ${documentName}.`);
	}

	const selectedDocument = { uuid: document.uuid, originalFilename: document.originalFilename };

	if (await document.next())
	{
		throw new Error(`Several documents match: ${documentName}.`);
	}

	await page.search('"document_uuid" = $1 AND "page_number" = $2', [selectedDocument.uuid, pageNumber], { limit: 1 });

	if (!(await page.next()))
	{
		throw new Error(`Page ${pageNumber} not found in ${selectedDocument.originalFilename}.`);
	}

	const options = DocumentConfig.create();
	await page.processImage({ content: page.imageContent, mimeType: page.imageMimeType, dpi: page.dpi }, {
		...options,
		logContext: { fileName: selectedDocument.originalFilename, pageNumber },
	});
	console.log(`OCR diagnostics exported for ${selectedDocument.originalFilename}, page ${pageNumber}.`);
}
finally
{
	if (document._searchConnector)
	{
		document.close();
	}

	if (page._searchConnector)
	{
		page.close();
	}

	DbManager.releaseAllConnections();

	if (DbManager._databases.has(database.name))
	{
		await DbManager.removeDatabase(database.name);
	}
}