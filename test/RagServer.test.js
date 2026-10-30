import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createCanvas } from 'canvas';
import test from 'node:test';
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { RagServer } from '../rag/server/RagServer.js';
import { DbManager } from '../app/db/DbManager.js';
import { Domain } from '../app/db/models/Domain.js';
import { Bearer } from '../app/db/models/Bearer.js';
import { BearerDomain } from '../app/db/models/BearerDomain.js';
import { Document } from '../app/db/models/Document.js';
import { DocumentChunk } from '../app/db/models/DocumentChunk.js';
import { DocumentPage } from '../app/db/models/DocumentPage.js';
import { PageChunk } from '../app/db/models/PageChunk.js';
import { BearerAddCommand } from '../cli/commands/bearer/BearerAddCommand.js';

const baseDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: path.join(baseDirectory, '.env') });

const token = `test-token-${Date.now()}`;
const otherToken = `other-token-${Date.now()}`;
const rhUid = `RH-${Date.now()}`;
const dsiUid = `DSI-${Date.now()}`;
const thirdUid = `FIN-${Date.now()}`;
const embedding = [1, 0, 0];
const png = createCanvas(100, 100).toBuffer('image/png');
const mocks = {
    stirlingPdfClient: {
        async convertToPdf()
        {
            throw new Error('StirlingPDF must not be called for images.');
        },
        async convertPdfToImages()
        {
            return [png];
        },
    },
    mistralClient: {
        async describeDocument()
        {
            return 'Synthetic document description.';
        },
        async describePage()
        {
            return 'Synthetic page description.';
        },
    },
    ocrClient: {
        async analyze()
        {
            return { markdown: 'OCR raw\n\nÉlément graphique.', blocks: [
                { type: 'text', content: 'OCR raw', pageMinX: 0, pageMinY: 0, pageMaxX: 100, pageMaxY: 10 },
                { type: 'image', content: 'Élément graphique.', pageMinX: 10, pageMinY: 10, pageMaxX: 90, pageMaxY: 90 },
            ] };
        },
    },
    embeddingClient: {
        model: 'test-model',
        inputs: [],
        async createEmbedding(input)
        {
            this.inputs.push(input);
            return embedding;
        },
        async createEmbeddings(inputs)
        {
            this.inputs.push(...inputs);
            return inputs.map(() => embedding);
        },
    },
};

let server;
let endpoint;
let bearerUuid;
let otherBearerUuid;
let cliBearerUuid;
let rhUuid;
let dsiUuid;
let thirdUuid;
const documentUuids = [];

async function rpc(accessToken, id, method, params = {})
{
    return await fetch(endpoint, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
    });
}

async function callTool(accessToken, id, name, args)
{
    const response = await rpc(accessToken, id, 'tools/call', { name, arguments: args });
    const payload = await response.json();
    return { response, payload, result: payload.result };
}

async function createDomain(uid)
{
    const domain = new Domain();
    domain.uid = uid;
    domain.name = uid;
    await domain.save(true);
    return domain.uuid;
}

async function createBearer(name, accessToken)
{
    const bearer = new Bearer();
    bearer.name = name;
    bearer.tokenHash = createHash('sha256').update(accessToken).digest('hex');
    bearer.active = true;
    await bearer.save(true);
    return bearer.uuid;
}

async function authorize(bearer, domain)
{
    const authorization = new BearerDomain();
    authorization.bearerUuid = bearer;
    authorization.domainUuid = domain;
    await authorization.save(true);
}

async function removeWhere(ClassRef, where, params)
{
    const objects = new ClassRef();
    await objects.search(where, params);
    const loaded = [];

    while (await objects.next())
    {
        const snapshot = new ClassRef();

        for (const field of Object.values(objects._fields))
        {
            snapshot[field.attributeName] = objects[field.attributeName];
            snapshot[`_${field.attributeName}`] = objects[`_${field.attributeName}`];
        }

        loaded.push(snapshot);
    }

    objects.close();

    for (const object of loaded)
    {
        await object.delete();
    }
}

test.before(async () =>
{
    server = new RagServer({
        server: { host: '127.0.0.1', port: 0, jsonLimit: '100mb' },
        mcp: { path: '/mcp' },
        database: {
            name: process.env.RAG_PG_DB,
            host: process.env.RAG_PG_HOST,
            port: Number(process.env.RAG_PG_PORT),
            user: process.env.RAG_PG_USER,
            password: process.env.RAG_PG_PASSWORD,
            database: process.env.RAG_PG_DB,
            poolSize: Number(process.env.RAG_PG_POOL_SIZE || 20),
        },
        document: { ...mocks, dpi: 300, pageImageDpi: 100, pageProcessingBatchSize: 4, searchLimit: 10, maxSearchLimit: 50, maxEmbeddingTokens: 8192, embeddingChunkSize: 1024,
            searchDocumentDescriptionWeight: 0.2, searchPageDescriptionWeight: 0.3, searchContentWeight: 0.5, searchMinimumScoreRatio: 0.8 },
    });
    rhUuid = await createDomain(rhUid);
    dsiUuid = await createDomain(dsiUid);
    thirdUuid = await createDomain(thirdUid);
    bearerUuid = await createBearer('test bearer', token);
    otherBearerUuid = await createBearer('other bearer', otherToken);
    await authorize(bearerUuid, rhUuid);
    await authorize(bearerUuid, dsiUuid);
    await authorize(otherBearerUuid, thirdUuid);
    await server.start('127.0.0.1', 0);
    endpoint = `http://127.0.0.1:${server.httpServer.address().port}/mcp`;
});

test.after(async () =>
{
    for (const documentUuid of documentUuids)
    {
        const pages = new DocumentPage();
        await pages.search('"document_uuid" = $1', [documentUuid]);

        pages.close();
        await removeWhere(DocumentPage, '"document_uuid" = $1', [documentUuid]);
    }

    await removeWhere(Document, '"uuid" = ANY($1::uuid[])', [documentUuids]);
    await removeWhere(BearerDomain, '"bearer_uuid" = ANY($1::uuid[])', [[bearerUuid, otherBearerUuid, cliBearerUuid]]);
    await removeWhere(Bearer, '"uuid" = ANY($1::uuid[])', [[bearerUuid, otherBearerUuid, cliBearerUuid]]);
    await removeWhere(Domain, '"uuid" = ANY($1::uuid[])', [[rhUuid, dsiUuid, thirdUuid]]);
    await server.stop();
});

test('refuses requests without a Bearer token', async () =>
{
    const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }),
    });
    assert.equal(response.status, 401);
});

test('lists the requested MCP tools', async () =>
{
    const payload = await (await rpc(token, 2, 'tools/list')).json();
    assert.deepEqual(payload.result.tools.map((tool) => tool.name), ['document_add', 'document_list', 'document_search', 'document_get', 'page_highlight']);
    const listProperties = payload.result.tools.find((tool) => tool.name === 'document_list').inputSchema.properties;
    assert.deepEqual(Object.keys(listProperties), ['name', 'pageSize', 'pageNumber']);
    const searchSchema = payload.result.tools.find((tool) => tool.name === 'document_search').inputSchema;
    assert.deepEqual(Object.keys(searchSchema.properties), ['semanticQuery', 'lexicalQuery', 'limit', 'minimumScoreRatio']);
    assert.deepEqual(searchSchema.properties.minimumScoreRatio,
        { type: 'number', minimum: 0, maximum: 1, default: 0.8,
            description: 'Relative cluster-score cutoff. Lower values return broader results; higher values return fewer, more precise results.' });
    assert.deepEqual(searchSchema.anyOf, [{ required: ['semanticQuery'] }, { required: ['lexicalQuery'] }]);
    const searchOutputSchema = payload.result.tools.find((tool) => tool.name === 'document_search').outputSchema;
    assert.deepEqual(searchOutputSchema.properties.documents.items.properties.pages.items.properties.chunks,
        { type: 'array', items: { type: 'string' } });
    assert.deepEqual(payload.result.tools.find((tool) => tool.name === 'page_highlight').inputSchema, {
        type: 'object',
        properties: {
            pages: {
                type: 'array',
                minItems: 1,
                description: 'Pages to highlight in one call.',
                items: {
                    type: 'object',
                    properties: {
                        pageUuid: { type: 'string', format: 'uuid' },
                        blockIds: { type: 'array', minItems: 1,
                            items: { type: 'string', description: 'Page-local block ID returned by document_get, for example G012.' } },
                    },
                    required: ['pageUuid', 'blockIds'],
                    additionalProperties: false,
                },
            },
        },
        required: ['pages'],
        additionalProperties: false,
    });
});

test('adds a Bearer authorized on selected domains through the CLI command', async () =>
{
    const cliToken = `cli-token-${Date.now()}`;
    const originalLog = console.log;
    console.log = () => {};

    try
    {
        const created = await new BearerAddCommand().run(['--name', 'CLI bearer', '--domains', `${rhUid},${dsiUid}`, '--token', cliToken]);
        cliBearerUuid = created.uuid;
        assert.ok(created instanceof Bearer);
        assert.deepEqual(created.domainUids, [dsiUid, rhUid].sort());
        assert.equal(created.accessToken, cliToken);

        const persisted = new Bearer();
        await persisted.search('"uuid" = $1', [created.uuid], { limit: 1 });
        assert.equal(await persisted.next(), true);
        assert.equal(persisted.tokenHash, createHash('sha256').update(cliToken).digest('hex'));
        persisted.close();
    }
    finally
    {
        console.log = originalLog;
    }
});

test('refuses document_add for an unauthorized domain', async () =>
{
    const { result } = await callTool(token, 3, 'document_add', { file: { name: 'page.png', dataBase64: png.toString('base64') }, domain: thirdUid });
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /does not exist or is not authorized/);
});

test('adds a document and creates its page', async () =>
{
    mocks.embeddingClient.inputs.length = 0;
    const { result } = await callTool(token, 4, 'document_add', { file: { name: 'page.png', dataBase64: png.toString('base64') }, domain: rhUid });
    assert.equal(result.isError, undefined, result.content?.[0]?.text);
    const added = result.structuredContent.result;
    documentUuids.push(added.documentUuid);
    assert.equal(added.domain, rhUid);
    assert.equal(added.originalFilename, 'page.png');
    assert.equal(added.description, 'Synthetic document description.');
    assert.ok(mocks.embeddingClient.inputs.includes('page.png : Synthetic document description.'));
    assert.equal(added.pageCount, 1);
    assert.equal(added.sha256, createHash('sha256').update(png).digest('hex'));

    const page = new DocumentPage();
    await page.search('"document_uuid" = $1', [added.documentUuid]);
    assert.equal(await page.next(), true);
    assert.equal(page.pageNumber, 1);
    assert.equal(page.ocrEnriched, 'OCR raw\n\nÉlément graphique.');
    assert.equal(page.description, 'Synthetic page description.');
    assert.equal(page.descriptionEmbedding, '[1,0,0]');
    assert.deepEqual(page.metadata, { ocrDpi: 300, visionDpi: 300 });
    assert.equal(page.blocks.type, 'page');
    assert.equal(page.blocks.children.length, 2);
    assert.equal(page.blocks.children[0].type, 'text');
    const chunk = new PageChunk();
    await chunk.search('"page_uuid" = $1', [page.uuid], { order: '"chunk_index" ASC' });
    assert.equal(await chunk.next(), true);
    assert.equal(chunk.chunkIndex, 0);
    assert.equal(chunk.content, 'OCR raw\nÉlément graphique.');
    assert.equal(chunk.embeddingModel, 'test-model');
    assert.equal(await chunk.next(), false);
    chunk.close();
    const documentChunk = new DocumentChunk();
    await documentChunk.search('"document_uuid" = $1', [added.documentUuid], { order: '"chunk_index" ASC' });
    assert.equal(await documentChunk.next(), true);
    assert.equal(documentChunk.chunkIndex, 0);
    assert.equal(documentChunk.pageChunkUuid1, chunk.uuid);
    assert.equal(documentChunk.pageChunkUuid2, null);
    assert.equal(documentChunk.content, chunk.content);
    assert.equal(await documentChunk.next(), false);
    documentChunk.close();
    page.close();

	const document = new Document();
	await document.search('"uuid" = $1', [added.documentUuid], { limit: 1 });
	assert.equal(await document.next(), true);
	assert.equal(document.originalFilename, 'page.png');
	assert.equal(document.description, 'Synthetic document description.');
    assert.equal(document.descriptionEmbedding, '[1,0,0]');
	document.close();
});

test('lists authorized documents with name filtering and pagination', async () =>
{
    const all = await callTool(token, 12, 'document_list', {});
    assert.equal(all.result.isError, undefined, all.result.content?.[0]?.text);
    assert.equal(all.result.structuredContent.pageSize, 50);
    assert.equal(all.result.structuredContent.pageNumber, 1);
    assert.equal(all.result.structuredContent.documents.length, 1);
    assert.deepEqual(Object.keys(all.result.structuredContent.documents[0]), ['uuid', 'name', 'domain', 'pageCount', 'createdAt', 'updatedAt']);
    assert.equal(all.result.structuredContent.documents[0].domain, rhUid);

    const matched = await callTool(token, 12.1, 'document_list', { name: '^page\\.png$', pageSize: 1, pageNumber: 1 });
    assert.equal(matched.result.structuredContent.documents[0].uuid, documentUuids[0]);

    const secondPage = await callTool(token, 12.2, 'document_list', { pageSize: 1, pageNumber: 2 });
    assert.deepEqual(secondPage.result.structuredContent.documents, []);

    const unauthorized = await callTool(otherToken, 12.3, 'document_list', {});
    assert.deepEqual(unauthorized.result.structuredContent.documents, []);
});

test('returns search results grouped by document and page', async () =>
{
    const search = await callTool(token, 14, 'document_search', { semanticQuery: 'OCR' });
    const document = search.result.structuredContent.documents[0];
    const page = document.pages[0];
    const chunk = page.chunks[0];

    assert.equal(chunk, 'OCR raw\nÉlément graphique.');
    assert.equal(search.result.structuredContent.documents
        .every((resultDocument) => resultDocument.pages
            .every((resultPage) => resultPage.chunks.every((resultChunk) => typeof resultChunk === 'string'))), true);
    assert.ok(page.uuid);
    assert.equal(page.pageNumber, 1);
    assert.equal(page.description, 'Synthetic page description.');
    assert.ok(Number.isFinite(page.score));
    assert.equal(document.uuid, documentUuids[0]);
    assert.equal(document.name, 'page.png');
    assert.equal(document.description, 'Synthetic document description.');
    assert.equal(document.domain, rhUid);
    assert.equal(document.score, page.score);
});

test('does not embed empty or whitespace-only OCR text', async () =>
{
    for (const enriched of ['', ' \n\t '])
    {
        let embeddingCallCount = 0;
        const page = new DocumentPage();
        await page.processImage({ content: png, mimeType: 'image/png' }, {
            ocrClient: {
                async analyze()
                {
                    return { markdown: enriched, blocks: [] };
                },
            },
            mistralClient: {},
            embeddingClient: {
                async createEmbedding()
                {
                    embeddingCallCount += 1;
                    return embedding;
                },
            },
        });

        assert.equal(embeddingCallCount, 0);
        assert.equal(page._descriptionEmbeddingVector, null);
        assert.equal(page.ocrEnriched, enriched);
    }
});

test('replaces the same binary in the same domain', async () =>
{
    const { result } = await callTool(token, 5, 'document_add', { file: { name: 'duplicate.png', dataBase64: png.toString('base64') }, domain: rhUid });
    const replacement = result.structuredContent.result;
    assert.notEqual(replacement.documentUuid, documentUuids[0]);
    documentUuids[0] = replacement.documentUuid;
});

test('accepts the same binary in another domain', async () =>
{
    const { result } = await callTool(token, 6, 'document_add', { file: { name: 'same.png', dataBase64: png.toString('base64') }, domain: dsiUid });
    const added = result.structuredContent.result;
    documentUuids.push(added.documentUuid);
    assert.equal(added.domain, dsiUid);
});

test('limits search to bearer authorized domains', async () =>
{
    const unauthorizedBearer = { uuid: otherBearerUuid, domainUids: [thirdUid] };
    const unauthorized = await Document.add(
        { file: { name: 'other.png', dataBase64: png.toString('base64') }, domain: thirdUid },
        unauthorizedBearer,
        server.config.document
    );
    documentUuids.push(unauthorized.documentUuid);
    const { result } = await callTool(token, 7, 'document_search', { semanticQuery: 'chart', limit: 10 });
    assert.equal(result.isError, undefined, result.content?.[0]?.text);
    const documents = result.structuredContent.documents;
    assert.ok(documents.length > 0);
    assert.ok(documents.every((document) => [rhUid, dsiUid].includes(document.domain)));
    assert.ok(documents.every((document) => document.domain !== thirdUid));
});

test('keeps page search results lightweight', async () =>
{
    const search = await callTool(token, 11, 'document_search', { semanticQuery: 'chart', limit: 1 });
    const document = search.result.structuredContent.documents[0];
    const page = document.pages[0];
    const chunk = page.chunks[0];
    const returnedChunkCount = search.result.structuredContent.documents
        .flatMap((resultDocument) => resultDocument.pages)
        .flatMap((resultPage) => resultPage.chunks).length;
    assert.equal(returnedChunkCount, 1);
    assert.ok(document.uuid);
    assert.ok(page.uuid);
    assert.equal(typeof chunk, 'string');
    assert.ok(chunk);
});

test('hides a document outside the Bearer domains', async () =>
{
    const { result } = await callTool(token, 8, 'document_get', { documentUuid: documentUuids.at(-1) });
    assert.equal(result.isError, true);
    assert.equal(result.content[0].text, 'Document not found.');
});

test('returns selected page images and the optional original', async () =>
{
    const { result } = await callTool(token, 9, 'document_get', { documentUuid: documentUuids[0], pageNumbers: [1], includeOriginal: true });
    assert.equal(result.structuredContent.documents[0].pages.length, 1);
    assert.deepEqual(Object.keys(result.structuredContent.documents[0].pages[0]),
        ['pageUuid', 'pageNumber', 'description', 'pixelWidth', 'pixelHeight', 'dpi', 'blocks']);
    const pageMetadata = result.structuredContent.documents[0].pages[0];
    assert.equal(pageMetadata.dpi, 100);
    assert.equal(pageMetadata.pixelWidth, pageMetadata.pixelHeight);
    const returnedBlocks = result.structuredContent.documents[0].pages[0].blocks;
    assert.equal([returnedBlocks, ...returnedBlocks.children].every((block) => typeof block.blockId === 'string'), true);
    assert.equal([returnedBlocks, ...returnedBlocks.children].every((block) =>
        !['type', 'childWidth', 'childHeight', 'pageMinX', 'pageMinY', 'pageMaxX', 'pageMaxY'].some((property) => property in block)), true);
    assert.equal([returnedBlocks, ...returnedBlocks.children].every((block) =>
        ['x', 'y', 'width', 'height'].every((property) => Number.isFinite(block[property]))), true);
    assert.equal(result.content.filter((entry) => entry.type === 'image').length, 1);
    const returnedImage = await import('canvas').then(({ loadImage }) =>
        loadImage(Buffer.from(result.content.find((entry) => entry.type === 'image').data, 'base64')));
    assert.deepEqual({ width: returnedImage.width, height: returnedImage.height },
        { width: pageMetadata.pixelWidth, height: pageMetadata.pixelHeight });
    assert.equal(result.content.filter((entry) => entry.type === 'resource').length, 1);
});

test('returns page images and coordinates at a requested lower DPI', async () =>
{
    const { result } = await callTool(token, 25, 'document_get', { documentUuid: documentUuids[0], pageNumbers: [1], pageImageDpi: 75 });
    assert.equal(result.isError, undefined, result.content?.[0]?.text);
    const page = result.structuredContent.documents[0].pages[0];
    const image = await import('canvas').then(({ loadImage }) => loadImage(Buffer.from(result.content.find(entry => entry.type === 'image').data, 'base64')));

    assert.equal(page.dpi, 75);
    assert.equal(page.pixelWidth, page.pixelHeight);
    assert.deepEqual({ width: image.width, height: image.height }, { width: page.pixelWidth, height: page.pixelHeight });
    assert.equal(['x', 'y', 'width', 'height'].every((property) => Number.isFinite(page.blocks[property])), true);
});

test('rejects an invalid requested page image DPI', async () =>
{
    const { result } = await callTool(token, 26, 'document_get', { documentUuid: documentUuids[0], pageImageDpi: 0 });

    assert.equal(result.isError, true);
    assert.equal(result.content[0].text, 'pageImageDpi must be a positive integer.');
});

test('returns a clear error for a missing page', async () =>
{
    const { result } = await callTool(token, 10, 'document_get', { documentUuid: documentUuids[0], pageNumbers: [2] });
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /pages were not found/);
});

test('supports lightweight page retrieval without image binaries', async () =>
{
    const { result } = await callTool(token, 16, 'document_get', { documentUuid: documentUuids[0], includePageImages: false });
    assert.equal(result.content.some((entry) => entry.type === 'image'), false);
    assert.deepEqual(Object.keys(result.structuredContent.documents[0].pages[0]),
    ['pageUuid', 'pageNumber', 'description', 'pixelWidth', 'pixelHeight', 'dpi', 'blocks']);
});

test('retrieves multiple documents in one document_get call', async () =>
{
    const { result } = await callTool(token, 20, 'document_get', {
        documents: [
            { documentUuid: documentUuids[0], pageNumbers: [1] },
            { documentUuid: documentUuids[1], pageNumbers: [1] },
        ],
        includePageImages: false,
    });
    assert.equal(result.isError, undefined, result.content?.[0]?.text);
    assert.equal(result.structuredContent.documents.length, 2);
    assert.deepEqual(result.structuredContent.documents.map(document => document.documentUuid), documentUuids.slice(0, 2));
    assert.deepEqual(result.structuredContent.documents.map(document => document.pages.length), [1, 1]);
    assert.equal(result.structuredContent.documents.every(document => document.pages[0].pageNumber === 1), true);
    assert.equal(result.content.some(entry => entry.type === 'image'), false);
});

test('ranks chunks by semantic score', async () =>
{
    const { result } = await callTool(token, 17, 'document_search', { semanticQuery: 'OCR' });
    assert.equal(result.isError, undefined, result.content?.[0]?.text);
    const document = result.structuredContent.documents[0];
    assert.equal(document.pages[0].pageNumber, 1);
    assert.equal(typeof document.pages[0].chunks[0], 'string');
    assert.ok(Number.isFinite(document.score));
});

test('supports lexical-only search without creating an embedding', async () =>
{
    const exactMatch = 'Bruno Augier';
    const exactEmbedding = [0, 1, 0];
    const originalCreateEmbedding = server.config.document.embeddingClient.createEmbedding;
    const exactDocumentUuid = documentUuids[0];
    const exactPage = new DocumentPage();

    try
    {
        await exactPage.search('"document_uuid" = $1', [exactDocumentUuid], { limit: 1 });
        assert.equal(await exactPage.next(), true);

        const exactChunk = new PageChunk();
        exactChunk.pageUuid = exactPage.uuid;
        exactChunk.chunkIndex = 1;
        exactChunk.content = `Responsable : ${exactMatch}`;
        exactChunk.characterCount = exactChunk.content.length;
        exactChunk.tokenCount = 3;
        exactChunk.embedding = `[${exactEmbedding.join(',')}]`;
        exactChunk.embeddingModel = mocks.embeddingClient.model;
        exactChunk.metadata = {};
        await exactChunk.save(true);
        const exactDocumentChunk = new DocumentChunk();
        exactDocumentChunk.documentUuid = exactDocumentUuid;
        exactDocumentChunk.chunkIndex = 100;
        exactDocumentChunk.pageChunkUuid1 = exactChunk.uuid;
        exactDocumentChunk.content = exactChunk.content;
        exactDocumentChunk.characterCount = exactChunk.characterCount;
        exactDocumentChunk.tokenCount = exactChunk.tokenCount;
        exactDocumentChunk.embedding = exactChunk.embedding;
        exactDocumentChunk.embeddingModel = exactChunk.embeddingModel;
        exactDocumentChunk.metadata = {};
        await exactDocumentChunk.save(true);

        server.config.document.embeddingClient.createEmbedding = async () =>
        {
            throw new Error('Lexical-only search must not create an embedding.');
        };
        const { result } = await callTool(token, 33, 'document_search', { lexicalQuery: '"Bruno Augier"', limit: 10 });

        assert.equal(result.isError, undefined, result.content?.[0]?.text);
        assert.equal(result.structuredContent.documents[0].uuid, exactDocumentUuid);
        assert.equal(result.structuredContent.documents[0].pages[0].chunks[0], `Responsable : ${exactMatch}`);
        assert.ok(result.structuredContent.documents[0].score > 0);
    }
    finally
    {
        server.config.document.embeddingClient.createEmbedding = originalCreateEmbedding;
        exactPage.close();
    }
});

test('fuses semantic and lexical rankings', async () =>
{
    const { result } = await callTool(token, 34, 'document_search', { semanticQuery: 'OCR', lexicalQuery: 'OCR' });
    assert.equal(result.isError, undefined, result.content?.[0]?.text);
    assert.equal(result.structuredContent.documents[0].uuid, documentUuids[0]);
    assert.ok(result.structuredContent.documents[0].score > 1 / 60);
});

test('filters document chunks relative to the best cluster score before expansion', async () =>
{
    const { result } = await callTool(token, 34.1, 'document_search',
        { semanticQuery: 'OCR', lexicalQuery: 'OCR', limit: 50, minimumScoreRatio: 1 });
    const documents = result.structuredContent.documents;
    const pageScores = documents.flatMap((document) => document.pages.map((page) => page.score));

    assert.equal(result.isError, undefined, result.content?.[0]?.text);
    assert.ok(documents.length > 0);
    assert.equal(pageScores.every((score) => score === pageScores[0]), true);
    assert.equal(documents.every((document) => document.pages.length > 0), true);
    assert.equal(documents.every((document) => document.pages.every((page) => page.chunks.length > 0)), true);
    assert.equal(documents.every((document) => document.score === Math.max(...document.pages.map((page) => page.score))), true);
});

test('rejects an invalid document search score ratio', async () =>
{
    const { result } = await callTool(token, 34.2, 'document_search', { semanticQuery: 'OCR', minimumScoreRatio: 1.1 });

    assert.equal(result.isError, true);
    assert.equal(result.content[0].text, 'minimumScoreRatio must be a number between 0 and 1.');
});

test('returns overlapping document chunk members once in reading order', async () =>
{
    const page = new DocumentPage();

    try
    {
        await page.search('"document_uuid" = $1', [documentUuids[0]], { limit: 1 });
        assert.equal(await page.next(), true);

        const chunks = [];

        for (let index = 100; index < 106; index++)
        {
            const chunk = new PageChunk();
            chunk.pageUuid = page.uuid;
            chunk.chunkIndex = index;
            chunk.content = `Unique clustered lexical phrase ${index}`;
            chunk.characterCount = chunk.content.length;
            chunk.tokenCount = 5;
            chunk.embedding = '[1,0,0]';
            chunk.embeddingModel = mocks.embeddingClient.model;
            chunk.metadata = {};
            await chunk.save(true);
            chunks.push(chunk);
        }

        for (let index = 0; index < 2; index++)
        {
            const documentChunk = new DocumentChunk();
            documentChunk.documentUuid = documentUuids[0];
            documentChunk.chunkIndex = 200 + index;
            const members = chunks.slice(index * 2, index * 2 + 4);

            for (const [memberIndex, chunk] of members.entries())
            {
                documentChunk[`pageChunkUuid${memberIndex + 1}`] = chunk.uuid;
            }

            documentChunk.content = members.map((chunk) => chunk.content).join('\n');
            documentChunk.characterCount = documentChunk.content.length;
            documentChunk.tokenCount = 20;
            documentChunk.embedding = '[1,0,0]';
            documentChunk.embeddingModel = mocks.embeddingClient.model;
            documentChunk.metadata = {};
            await documentChunk.save(true);
        }

        const { result } = await callTool(token, 35, 'document_search', { lexicalQuery: '"Unique clustered lexical phrase"', limit: 10 });
        const matchingResults = result.structuredContent.documents
            .flatMap(document => document.pages)
            .flatMap(documentPage => documentPage.chunks)
            .filter(resultChunk => chunks.some((chunk) => chunk.content === resultChunk));

        assert.deepEqual(matchingResults, chunks.map((chunk) => chunk.content));
    }
    finally
    {
        page.close();
    }
});

test('calculates grouped page highlights and rejects unknown pages and block IDs', async () =>
{
    const firstGet = await callTool(token, 27, 'document_get', { documentUuid: documentUuids[0], pageNumbers: [1], includePageImages: false });
    const secondGet = await callTool(token, 28, 'document_get', { documentUuid: documentUuids[1], pageNumbers: [1], includePageImages: false });
    const firstPage = firstGet.result.structuredContent.documents[0].pages[0];
    const secondPage = secondGet.result.structuredContent.documents[0].pages[0];
    const validBlock = firstPage.blocks.children[0];
    const foreignBlock = secondPage.blocks.children[0];
    assert.equal(validBlock.blockId, foreignBlock.blockId);
    const success = await callTool(token, 29, 'page_highlight', { pages: [
        { pageUuid: firstPage.pageUuid, blockIds: [validBlock.blockId, validBlock.blockId] },
        { pageUuid: secondPage.pageUuid, blockIds: [foreignBlock.blockId] },
    ] });

    assert.equal(success.result.isError, undefined, success.result.content?.[0]?.text);
    assert.deepEqual(success.result.structuredContent.pages.map((page) => page.pageUuid), [firstPage.pageUuid, secondPage.pageUuid]);
    assert.equal(success.result.structuredContent.pages.every((page) => typeof page.sourceFileName === 'string' && Number.isInteger(page.pageNumber)), true);
    assert.deepEqual(success.result.structuredContent.pages[0].blockIds, [validBlock.blockId]);
    assert.equal(success.result.structuredContent.pages.every((page) => page.dpi === 100), true);
    assert.equal(success.result.structuredContent.pages.every((page) => page.pageImageWidth > 0 && page.pageImageHeight > 0), true);
    assert.equal(success.result.structuredContent.pages.every((page) =>
        Object.values(page.highlight).every((coordinate) => coordinate >= 0 && coordinate <= 1)), true);
    assert.equal(success.result.content.filter((content) => content.type === 'image').length, 2);
    assert.equal(success.result.content.filter((content) => content.type === 'image')
        .every((content) => content.mimeType === 'image/png' && Buffer.from(content.data, 'base64').length > 0), true);
    const highlightedImage = await import('canvas').then(({ loadImage }) =>
        loadImage(Buffer.from(success.result.content.find((content) => content.type === 'image').data, 'base64')));
    assert.deepEqual(
        { width: highlightedImage.width, height: highlightedImage.height },
        { width: success.result.structuredContent.pages[0].pageImageWidth, height: success.result.structuredContent.pages[0].pageImageHeight },
    );

    const unknownPage = await callTool(token, 30, 'page_highlight', { pages: [{
        pageUuid: '33333333-3333-4333-8333-333333333333', blockIds: [validBlock.blockId],
    }] });
    assert.equal(unknownPage.result.isError, true);
    assert.equal(unknownPage.result.content[0].text, 'Document page not found.');

    const unknownBlock = await callTool(token, 31, 'page_highlight', { pages: [{
        pageUuid: firstPage.pageUuid, blockIds: ['G999'],
    }] });
    assert.equal(unknownBlock.result.isError, true);
    assert.match(unknownBlock.result.content[0].text, /Block not found/);

    const empty = await callTool(token, 33, 'page_highlight', { pages: [{ pageUuid: firstPage.pageUuid, blockIds: [] }] });
    assert.equal(empty.result.isError, true);
    assert.match(empty.result.content[0].text, /at least one/);
});