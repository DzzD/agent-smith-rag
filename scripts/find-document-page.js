import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DbManager } from '../app/db/DbManager.js';
import { DocumentPage } from '../app/db/models/DocumentPage.js';

const baseDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: path.join(baseDirectory, '.env') });

const documentUuid = process.argv[2];
const pageNumber = Number(process.argv[3]);
const database = {
	name: process.env.RAG_PG_DB,
	host: process.env.RAG_PG_HOST,
	port: Number(process.env.RAG_PG_PORT),
	user: process.env.RAG_PG_USER,
	password: process.env.RAG_PG_PASSWORD,
	database: process.env.RAG_PG_DB,
	poolSize: Number(process.env.RAG_PG_POOL_SIZE || 20),
};
const page = new DocumentPage();

try
{
	DbManager.addDatabase(database);
	await page.search('"document_uuid" = $1 AND "page_number" = $2', [documentUuid, pageNumber], { limit: 1 });

	if (!(await page.next()))
	{
		throw new Error('Document page not found.');
	}

	console.log(page.uuid);
}
finally
{
	page.close();
	DbManager.releaseAllConnections();

	if (DbManager._databases.has(database.name))
	{
		await DbManager.removeDatabase(database.name);
	}
}
