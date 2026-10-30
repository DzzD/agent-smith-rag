import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DbManager } from '../app/db/DbManager.js';
import { Document } from '../app/db/models/Document.js';
import { DocumentPage } from '../app/db/models/DocumentPage.js';
import { DocumentConfig } from '../rag/config/DocumentConfig.js';

const baseDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: path.join(baseDirectory, '.env') });

const database = {
	name: process.env.RAG_PG_DB,
	host: process.env.RAG_PG_HOST,
	port: Number(process.env.RAG_PG_PORT),
	user: process.env.RAG_PG_USER,
	password: process.env.RAG_PG_PASSWORD,
	database: process.env.RAG_PG_DB,
	poolSize: Number(process.env.RAG_PG_POOL_SIZE || 20),
};
const options = DocumentConfig.create();
const requestedDocumentUuids = [...new Set(process.argv.slice(2))];
const documents = new Document();
let processedDocumentCount = 0;
let processedPageCount = 0;

try
{
	DbManager.addDatabase(database);
	await documents.search(requestedDocumentUuids.length > 0 ? '"uuid" = ANY($1::uuid[])' : 'TRUE',
		requestedDocumentUuids.length > 0 ? [requestedDocumentUuids] : [], { order: '"created_at", "uuid"' });
	const selectedDocuments = [];

	while (await documents.next())
	{
		selectedDocuments.push({ uuid: documents.uuid, originalFilename: documents.originalFilename, pageCount: documents.pageCount });
	}

	const foundDocumentUuids = new Set(selectedDocuments.map((document) => document.uuid));
	const missingDocumentUuids = requestedDocumentUuids.filter((uuid) => !foundDocumentUuids.has(uuid));

	if (missingDocumentUuids.length > 0)
	{
		throw new Error(`Document not found: ${missingDocumentUuids.join(', ')}.`);
	}

	documents.close();

	for (const document of selectedDocuments)
	{
		const pages = new DocumentPage();

		try
		{
			await pages.search('"document_uuid" = $1', [document.uuid], { order: '"page_number"' });
			const pageUuids = [];

			while (await pages.next())
			{
				pageUuids.push(pages.uuid);
			}

			pages.close();

			for (let offset = 0; offset < pageUuids.length; offset += options.pageProcessingBatchSize)
			{
				const batch = pageUuids.slice(offset, offset + options.pageProcessingBatchSize);
				await Promise.all(batch.map(async (pageUuid, batchIndex) =>
				{
					const page = new DocumentPage();
					const pageNumber = offset + batchIndex + 1;

					try
					{
						await page.load(pageUuid);
						await page.regenerateDescription(options, { fileName: document.originalFilename, pageNumber, pageCount: pageUuids.length });
					}
					finally
					{
						page.close();
					}
				}));
				processedPageCount += batch.length;
				console.log(`Regenerated page descriptions for ${document.originalFilename}: ${Math.min(offset + batch.length, pageUuids.length)}/${pageUuids.length}.`);
			}

			await Document.regenerateDescription(document.uuid, options);
			processedDocumentCount += 1;
			console.log(`Regenerated document description for ${document.originalFilename} (${processedDocumentCount}/${selectedDocuments.length}).`);
		}
		finally
		{
			pages.close();
		}
	}
}
finally
{
	documents.close();
	DbManager.releaseAllConnections();

	if (DbManager._databases.has(database.name))
	{
		await DbManager.removeDatabase(database.name);
	}
}

console.log(`Description regeneration complete: ${processedDocumentCount} document(s), ${processedPageCount} page(s).`);