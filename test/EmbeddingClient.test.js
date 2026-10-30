import assert from 'node:assert/strict';
import test from 'node:test';
import { EmbeddingClient } from '../rag/client/EmbeddingClient.js';

test('EmbeddingClient calls the OpenAI-compatible embeddings route from its base URL', async () =>
{
    const originalFetch = globalThis.fetch;
    let requestedUrl;

    globalThis.fetch = async (url) =>
    {
        requestedUrl = url.toString();
        return new Response(JSON.stringify({
            model: 'embeddings-small',
            data: [{ index: 0, embedding: [0.1, 0.2] }],
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    };

    try
    {
        const client = new EmbeddingClient({
            url: 'https://example.test/',
            apiKey: 'test-key',
            model: 'embeddings-small',
        });

        assert.deepEqual(await client.createEmbedding('test'), [0.1, 0.2]);
        assert.equal(requestedUrl, 'https://example.test/v1/embeddings');
    }
    finally
    {
        globalThis.fetch = originalFetch;
    }
});

test('EmbeddingClient batches inputs and restores response index order', async () =>
{
    const originalFetch = globalThis.fetch;
    let requestedBody;

    globalThis.fetch = async (url, options) =>
    {
        requestedBody = JSON.parse(options.body);
        return new Response(JSON.stringify({
            model: 'embeddings-small',
            data: [{ index: 1, embedding: [0.3, 0.4] }, { index: 0, embedding: [0.1, 0.2] }],
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    };

    try
    {
        const client = new EmbeddingClient({ url: 'https://example.test/', apiKey: 'test-key', model: 'embeddings-small' });
        assert.deepEqual(await client.createEmbeddings(['first', 'second']), [[0.1, 0.2], [0.3, 0.4]]);
        assert.deepEqual(requestedBody.input, ['first', 'second']);
    }
    finally
    {
        globalThis.fetch = originalFetch;
    }
});

test('EmbeddingClient logs search embeddings without a fake document context', async () =>
{
    const originalFetch = globalThis.fetch;
    const originalInfo = console.info;
    const messages = [];

    globalThis.fetch = async () => new Response(JSON.stringify({
        model: 'embeddings-small',
        data: [{ index: 0, embedding: [0.1, 0.2] }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    console.info = (...args) => messages.push(args.join(' '));

    try
    {
        const client = new EmbeddingClient({ url: 'https://example.test/', apiKey: 'test-key', model: 'embeddings-small' });
        await client.createEmbedding('Bruno Augier', { operation: 'search' });

        assert.equal(messages.some(message => message.includes('[Embedding] Call: search.')), true);
        assert.equal(messages.some(message => message.includes('unknown file')), false);
    }
    finally
    {
        globalThis.fetch = originalFetch;
        console.info = originalInfo;
    }
});

test('EmbeddingClient splits inputs according to the provider batch limit', async () =>
{
    const originalFetch = globalThis.fetch;
    const requestedInputs = [];

    globalThis.fetch = async (url, options) =>
    {
        const inputs = JSON.parse(options.body).input;
        requestedInputs.push(inputs);
        return new Response(JSON.stringify({
            model: 'embeddings-small',
            data: inputs.map((input, index) => ({ index, embedding: [input.length] })),
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    };

    try
    {
        const client = new EmbeddingClient({ url: 'https://example.test/', apiKey: 'test-key', model: 'embeddings-small', batchSize: 2 });
        assert.deepEqual(await client.createEmbeddings(['one', 'two', 'three']), [[3], [3], [5]]);
        assert.deepEqual(requestedInputs, [['one', 'two'], ['three']]);
    }
    finally
    {
        globalThis.fetch = originalFetch;
    }
});