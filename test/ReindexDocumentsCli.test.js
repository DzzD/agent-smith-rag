import assert from 'node:assert/strict';
import test from 'node:test';
import { parseReindexArguments } from '../scripts/ReindexArguments.js';

test('parses one or several document UUIDs for reindexing', () =>
{
	assert.deepEqual(parseReindexArguments(['first']), {
		force: false, all: false, documentUuids: ['first'], maxPages: null, storedPageImages: false,
	});
	assert.deepEqual(parseReindexArguments(['first', 'second', 'first', '--force']), {
		force: true, all: false, documentUuids: ['first', 'second'], maxPages: null, storedPageImages: false,
	});
	assert.deepEqual(parseReindexArguments(['first', '--max-pages', '6', '--force']), {
		force: true, all: false, documentUuids: ['first'], maxPages: 6, storedPageImages: false,
	});
});

test('selects every document explicitly or when no UUID is supplied', () =>
{
	assert.deepEqual(parseReindexArguments([]), { force: false, all: true, documentUuids: [], maxPages: null, storedPageImages: false });
	assert.deepEqual(parseReindexArguments(['--all', '--force', '--stored-page-images']), {
		force: true, all: true, documentUuids: [], maxPages: null, storedPageImages: true,
	});
});

test('rejects ambiguous or unknown reindex options', () =>
{
	assert.throws(() => parseReindexArguments(['first', '--all']), /cannot be combined/);
	assert.throws(() => parseReindexArguments(['--unknown']), /Unknown option/);
	assert.throws(() => parseReindexArguments(['first', '--max-pages']), /positive integer/);
	assert.throws(() => parseReindexArguments(['first', '--max-pages', '0']), /positive integer/);
});