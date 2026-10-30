import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DbManager } from '../app/db/DbManager.js';
import { Document } from '../app/db/models/Document.js';
import { DocumentConfig } from '../rag/config/DocumentConfig.js';
import { parseReindexArguments } from './ReindexArguments.js';

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
const argumentsList = process.argv.slice(2);

if (argumentsList.includes('--help') || argumentsList.includes('-h'))
{
	console.log('Usage: npm run db:reindex-documents -- [documentUuid ...] [--all] [--force] [--max-pages count] [--stored-page-images]');
	console.log('Pass one or more document UUIDs, or use --all. Omitting UUIDs also selects every document.');
	console.log('Completed documents are skipped automatically. Use --force to reindex them again.');
	console.log('Use --stored-page-images to rebuild OCR, descriptions, embeddings and chunks without converting document originals.');
	process.exit(0);
}

const { force, all, documentUuids, maxPages, storedPageImages } = parseReindexArguments(argumentsList);
options.maxPages = maxPages;
const documents = new Document();
let processedCount = 0;
let skippedCount = 0;
let totalBlockCountBefore = 0;
let totalBlockCountAfter = 0;

try
{
	DbManager.addDatabase(database);
	await documents.search(all ? 'TRUE' : '"uuid" = ANY($1::uuid[])', all ? [] : [documentUuids], { order: '"created_at", "uuid"' });
	const documentsToProcess = [];
	const foundDocumentUuids = new Set();

	while (await documents.next())
	{
		foundDocumentUuids.add(documents.uuid);

		const isCurrent = storedPageImages
			? Document.isStoredPageImageReindexCurrent(documents.metadata)
			: Document.isReindexCurrent(documents.metadata);

		if (!force && isCurrent)
		{
			skippedCount += 1;
			console.log(`Skipping completed document ${documents.uuid} (${documents.originalFilename}).`);
			continue;
		}

		documentsToProcess.push(documents.uuid);
	}

	const missingDocumentUuids = documentUuids.filter((uuid) => !foundDocumentUuids.has(uuid));

	if (missingDocumentUuids.length > 0)
	{
		throw new Error(`Document not found: ${missingDocumentUuids.join(', ')}.`);
	}

	documents.close();

	for (const [index, uuid] of documentsToProcess.entries())
	{
		console.log(`Reindexing document ${uuid} (${index + 1}/${documentsToProcess.length}).`);
		let result;

		for (let attempt = 1; attempt <= 3; attempt += 1)
		{
			try
			{
				result = storedPageImages
					? await Document.reindexFromStoredPageImages(uuid, options)
					: await Document.reindex(uuid, options);
				break;
			}
			catch (error)
			{
				if (attempt === 3)
				{
					throw error;
				}

				console.warn(`Reindex attempt ${attempt}/3 failed for ${uuid}: ${error.message}. Retrying.`);
			}
		}

		processedCount += 1;
		totalBlockCountBefore += result.blockCountBefore;
		totalBlockCountAfter += result.blockCountAfter;
		console.log(`Reindexed ${result.originalFilename}: ${result.pageCount} page(s), ${result.blockCountBefore} block(s) before, `
			+ `${result.blockCountAfter} after.`);
	}
}
finally
{
	if (documents._searchConnector)
	{
		documents.close();
	}

	DbManager.releaseAllConnections();

	if (DbManager._databases.has(database.name))
	{
		await DbManager.removeDatabase(database.name);
	}
}

console.log(`Document reindexing complete: ${processedCount} processed, ${skippedCount} already complete, `
	+ `${totalBlockCountBefore} block(s) before, ${totalBlockCountAfter} after.`);