import assert from 'node:assert/strict';
import test from 'node:test';
import { DocumentChunk } from '../app/db/models/DocumentChunk.js';
import { PageChunk } from '../app/db/models/PageChunk.js';
import { DocumentConfig } from '../rag/config/DocumentConfig.js';

const options = { embeddingChunkSize: 40, maxEmbeddingTokens: 40 };
const pageChunk = new PageChunk();

test('short page produces exactly one chunk', () =>
{
	assert.deepEqual(pageChunk.splitBlocks([{ type: 'text', content: 'Short page.' }], options), ['Short page.']);
});

test('titles start sections and stay with their content', () =>
{
	const chunks = pageChunk.splitBlocks([
		{ type: 'text', content: 'Introduction' },
		{ type: 'title', content: 'First title' },
		{ type: 'text', content: 'First content' },
		{ type: 'title', content: 'Second title' },
		{ type: 'text', content: 'Second content' },
	], { embeddingChunkSize: 30, maxEmbeddingTokens: 30 });
	assert.deepEqual(chunks, ['Introduction', 'First title\nFirst content', 'Second title\nSecond content']);
});

test('small consecutive sections are merged', () =>
{
	assert.deepEqual(pageChunk.splitBlocks([
		{ type: 'title', content: 'A' }, { type: 'text', content: 'one' },
		{ type: 'title', content: 'B' }, { type: 'text', content: 'two' },
	], { embeddingChunkSize: 100, maxEmbeddingTokens: 100 }), ['A\none\nB\ntwo']);
});

test('oversized isolated block is recursively split without text loss', () =>
{
	const content = 'First paragraph. Second sentence with several words. Final paragraph.';
	const chunks = pageChunk.splitBlocks([{ type: 'text', content }], { embeddingChunkSize: 20, maxEmbeddingTokens: 20 });
	assert.ok(chunks.length > 1);
	assert.ok(chunks.every((chunk) => chunk.length <= 20 && pageChunk.estimateTokenCount(chunk) <= 20));
	assert.equal(chunks.join(''), content);
});

test('builds chunk embeddings from chunk text only', async () =>
{
	const embedded = [];
	const drafts = await pageChunk.buildDrafts([{ type: 'text', content: 'Real chunk content' }], {
		embeddingChunkSize: 100, maxEmbeddingTokens: 100,
		embeddingClient: { async createEmbeddings(contents) { embedded.push(...contents); return contents.map(() => [3, 4]); } },
	});
	assert.deepEqual(embedded, ['Real chunk content']);
	assert.deepEqual(drafts[0].embedding, [0.6, 0.8]);
});

test('builds all page chunk embeddings in one request', async () =>
{
	const calls = [];
	const drafts = await pageChunk.buildDrafts([{ type: 'text', content: 'First sentence. Second sentence.' }], {
		embeddingChunkSize: 20, maxEmbeddingTokens: 20,
		embeddingClient: { async createEmbeddings(contents) { calls.push(contents); return contents.map(() => [3, 4]); } },
	});

	assert.equal(calls.length, 1);
	assert.deepEqual(calls[0], drafts.map((draft) => draft.content));
});

test('builds document chunks from four consecutive page chunks with a stride of two', async () =>
{
	const embedded = [];
	const pageChunks = Array.from({ length: 7 }, (_, index) => ({ uuid: `chunk-${index}`, pageUuid: index < 3 ? 'page-1' : 'page-2',
		chunkIndex: index < 3 ? index : index - 3, content: `Chunk ${index}` }));
	const drafts = await new DocumentChunk().buildDrafts(pageChunks, {
		embeddingClient: { async createEmbeddings(contents) { embedded.push(contents); return contents.map(() => [3, 4]); } },
	});

	assert.deepEqual(drafts.map((draft) => draft.pageChunkUuids), [
		['chunk-0', 'chunk-1', 'chunk-2', 'chunk-3'],
		['chunk-2', 'chunk-3', 'chunk-4', 'chunk-5'],
		['chunk-4', 'chunk-5', 'chunk-6'],
		['chunk-6'],
	]);
	assert.deepEqual(embedded, [drafts.map((draft) => draft.content)]);
});

test('builds one trailing document chunk for short documents', async () =>
{
	const pageChunks = [{ uuid: 'chunk-0', content: 'Only chunk' }];
	const drafts = await new DocumentChunk().buildDrafts(pageChunks, {
		embeddingClient: { async createEmbeddings(contents) { return contents.map(() => [3, 4]); } },
	});

	assert.equal(drafts.length, 1);
	assert.deepEqual(drafts[0].pageChunkUuids, ['chunk-0']);
});

test('defaults embedding chunks to 1024 characters', () =>
{
	const config = DocumentConfig.create({});
	assert.equal(config.dpi, 300);
	assert.equal(config.pageImageDpi, 100);
	assert.equal(config.stirlingDpi, 300);
	assert.equal(config.embeddingChunkSize, 1024);
	assert.equal(config.pageProcessingBatchSize, 4);
	assert.deepEqual({ document: config.searchDocumentDescriptionWeight, page: config.searchPageDescriptionWeight,
		content: config.searchContentWeight }, { document: 0.2, page: 0.3, content: 0.5 });
	assert.equal(config.searchMinimumScoreRatio, 0.8);
	assert.equal(config.ocrMaximumEmptyToBlockRatio, 4);
});

test('validates configured semantic search weights', () =>
{
	assert.throws(() => DocumentConfig.create({ RAG_SEARCH_CONTENT_WEIGHT: '0.8' }), /sum is 1/);
	assert.throws(() => DocumentConfig.create({ RAG_SEARCH_CONTENT_WEIGHT: '-0.5', RAG_SEARCH_PAGE_DESCRIPTION_WEIGHT: '1.3' }), /non-negative/);
	assert.throws(() => DocumentConfig.create({ RAG_SEARCH_MINIMUM_SCORE_RATIO: '1.1' }), /between 0 and 1/);
});

test('validates PaddleOCR grouping factors', () =>
{
	assert.throws(() => DocumentConfig.create({ OCR_LINE_SPACING_FACTOR: '1.1' }), /between 0 and 1/);
	assert.throws(() => DocumentConfig.create({ OCR_HORIZONTAL_OVERLAP_FACTOR: 'invalid' }), /between 0 and 1/);
	assert.throws(() => DocumentConfig.create({ OCR_READING_ORDER_ALIGNMENT_TOLERANCE: '1.1' }), /between 0 and 1/);
	assert.throws(() => DocumentConfig.create({ OCR_READING_ORDER_HORIZONTAL_OVERLAP_FACTOR: '-0.1' }), /between 0 and 1/);
	assert.throws(() => DocumentConfig.create({ OCR_READING_ORDER_ROW_TOLERANCE: 'invalid' }), /between 0 and 1/);
	assert.throws(() => DocumentConfig.create({ OCR_MAXIMUM_EMPTY_TO_BLOCK_RATIO: '-1' }), /non-negative/);
	assert.equal(DocumentConfig.create({ OCR_MAXIMUM_EMPTY_TO_BLOCK_RATIO: '1.5' }).ocrMaximumEmptyToBlockRatio, 1.5);
});

test('validates the page processing batch size', () =>
{
	assert.throws(() => DocumentConfig.create({ RAG_PAGE_PROCESSING_BATCH_SIZE: '0' }), /page processing batch size/);
	assert.throws(() => DocumentConfig.create({ RAG_PAGE_PROCESSING_BATCH_SIZE: '1.5' }), /page processing batch size/);
});

test('defaults PaddleOCR to 150 DPI and validates it against storage DPI', () =>
{
	const defaultConfig = DocumentConfig.create({});
	assert.equal(defaultConfig.ocrDpi, 150);
	assert.equal(DocumentConfig.create({ RAG_PAGE_IMAGE_DPI: '75' }).pageImageDpi, 75);
	assert.throws(() => DocumentConfig.create({ RAG_PAGE_DPI: '300', RAG_PAGE_IMAGE_DPI: '301' }), /must not exceed page DPI/);
	assert.throws(() => DocumentConfig.create({ RAG_PAGE_DPI: '300', RAG_OCR_DPI: '301' }), /must not exceed page DPI/);
});

test('rejects invalid vectors', () =>
{
	assert.throws(() => pageChunk.normalizeVector([0, 0]), /positive L2 norm/);
});

