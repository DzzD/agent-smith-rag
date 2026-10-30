import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { DbManager } from '../app/db/DbManager.js';
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
const filter = process.argv[2];
const sourcePages = new DocumentPage();
const documentPages = new Map();
let processedPageCount = 0;
let processedDocumentCount = 0;

try
{
	DbManager.addDatabase(database);
	const where = filter ? '("uuid" = $1 OR "document_uuid" = $1)' : 'TRUE';
	const params = filter ? [filter] : [];
	await sourcePages.search(where, params, { order: '"document_uuid", "page_number"' });
	const documentUuids = new Set();

	while (await sourcePages.next())
	{
		documentUuids.add(sourcePages.documentUuid);
	}

	sourcePages.close();
	await sourcePages.search('"document_uuid" = ANY($1::uuid[])', [[...documentUuids]], { order: '"document_uuid", "page_number"' });

	while (await sourcePages.next())
	{
		if (!documentPages.has(sourcePages.documentUuid))
		{
			documentPages.set(sourcePages.documentUuid, []);
		}

		documentPages.get(sourcePages.documentUuid).push({ uuid: sourcePages.uuid, blocks: sourcePages.getContentBlocks() });
	}

	for (const [documentUuid, pages] of documentPages)
	{
		const connectionUid = `document-chunk-reindex-${randomUUID()}`;
		const connector = DbManager.getConnector('rag_server', connectionUid);
		let transactionOpened = false;

		try
		{
			await connector.beginTransaction();
			transactionOpened = true;
			const savedChunks = [];

			for (const page of pages)
			{
				const pageChunk = new PageChunk(connectionUid);
				const drafts = await pageChunk.buildDrafts(page.blocks, options);
				savedChunks.push(...await pageChunk.replaceForPage(page.uuid, drafts, options.embeddingClient.model, connectionUid));
				processedPageCount += 1;
			}

			const documentChunks = await new DocumentChunk(connectionUid).replaceForDocument(documentUuid, savedChunks, options, connectionUid);
			await connector.commit();
			transactionOpened = false;
			processedDocumentCount += 1;
			console.log(`Reindexed ${savedChunks.length} page chunk(s) and ${documentChunks.length} document chunk(s) for document ${documentUuid}.`);
		}
		catch (error)
		{
			if (transactionOpened)
			{
				try
				{
					await connector.rollback();
				}
				catch (rollbackError)
				{
					if (!String(rollbackError.originalError?.message ?? rollbackError.message).includes('Aucune transaction ouverte'))
					{
						throw new AggregateError([error, rollbackError], 'Page chunk reindexing and rollback failed.');
					}
				}
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
	sourcePages.close();
	DbManager.releaseAllConnections();

	if (DbManager._databases.has(database.name))
	{
		await DbManager.removeDatabase(database.name);
	}
}

console.log(`Document chunk reindexing complete: ${processedDocumentCount} document(s), ${processedPageCount} page(s).`);