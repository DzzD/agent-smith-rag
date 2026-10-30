import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { DbManager } from '../app/db/DbManager.js';
import { Document } from '../app/db/models/Document.js';
import { DocumentChunk } from '../app/db/models/DocumentChunk.js';
import { DocumentPage } from '../app/db/models/DocumentPage.js';
import { PageChunk } from '../app/db/models/PageChunk.js';
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
let processedPageChunkCount = 0;
let processedDocumentChunkCount = 0;

try
{
	DbManager.addDatabase(database);
	await documents.search(requestedDocumentUuids.length > 0 ? '"uuid" = ANY($1::uuid[])' : 'TRUE',
		requestedDocumentUuids.length > 0 ? [requestedDocumentUuids] : [], { order: '"created_at", "uuid"' });
	const documentUuids = [];

	while (await documents.next())
	{
		documentUuids.push(documents.uuid);
	}

	const foundDocumentUuids = new Set(documentUuids);
	const missingDocumentUuids = requestedDocumentUuids.filter((uuid) => !foundDocumentUuids.has(uuid));

	if (missingDocumentUuids.length > 0)
	{
		throw new Error(`Document not found: ${missingDocumentUuids.join(', ')}.`);
	}

	documents.close();

	for (const documentUuid of documentUuids)
	{
		const pages = new DocumentPage();
		const pageChunks = [];

		try
		{
			await pages.search('"document_uuid" = $1', [documentUuid], { order: '"page_number", "uuid"' });

			while (await pages.next())
			{
				const chunks = new PageChunk();

				try
				{
					await chunks.search('"page_uuid" = $1', [pages.uuid], { order: '"chunk_index", "uuid"' });

					while (await chunks.next())
					{
						pageChunks.push({ uuid: chunks.uuid, pageUuid: pages.uuid, chunkIndex: chunks.chunkIndex, content: chunks.content });
					}
				}
				finally
				{
					chunks.close();
				}
			}
		}
		finally
		{
			pages.close();
		}

		const connectionUid = `document-chunk-backfill-${randomUUID()}`;
		const connector = DbManager.getConnector('rag_server', connectionUid);
		let transactionOpened = false;

		try
		{
			await connector.beginTransaction();
			transactionOpened = true;
			const drafts = await new DocumentChunk(connectionUid).replaceForDocument(documentUuid, pageChunks, options, connectionUid);
			await connector.commit();
			transactionOpened = false;
			processedDocumentCount += 1;
			processedPageChunkCount += pageChunks.length;
			processedDocumentChunkCount += drafts.length;
			console.log(`Backfilled ${drafts.length} document chunk(s) from ${pageChunks.length} page chunk(s) for document ${documentUuid}.`);
		}
		catch (error)
		{
			if (transactionOpened)
			{
				await connector.rollback();
			}

			throw error;
		}
		finally
		{
			connector.close();
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

console.log(`Document chunk backfill complete: ${processedDocumentCount} document(s), ${processedPageChunkCount} page chunk(s), ${processedDocumentChunkCount} document chunk(s).`);