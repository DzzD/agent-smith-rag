import assert from 'node:assert/strict';
import test from 'node:test';
import { DOCUMENT_REINDEX_VERSION, Document } from '../app/db/models/Document.js';

test('recognizes only documents completed with the current reindex version', () =>
{
	assert.equal(Document.isReindexCurrent(null), false);
	assert.equal(Document.isReindexCurrent({}), false);
	assert.equal(Document.isReindexCurrent({ reindex: { version: DOCUMENT_REINDEX_VERSION - 1 } }), false);
	assert.equal(Document.isReindexCurrent({ reindex: { version: DOCUMENT_REINDEX_VERSION } }), true);
});

test('recognizes stored-page-image reindex completion separately', () =>
{
	assert.equal(Document.isStoredPageImageReindexCurrent({ reindex: { version: DOCUMENT_REINDEX_VERSION } }), false);
	assert.equal(Document.isStoredPageImageReindexCurrent({
		reindex: { version: DOCUMENT_REINDEX_VERSION, source: 'stored-page-images' },
	}), true);
});