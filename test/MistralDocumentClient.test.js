import assert from 'node:assert/strict';
import test from 'node:test';
import { MistralDocumentClient } from '../rag/client/MistralDocumentClient.js';

test('MistralDocumentClient describes a document from all enriched pages through chat completion', async () =>
{
    const originalFetch = globalThis.fetch;
    let requestBody;

    globalThis.fetch = async (url, options) =>
    {
        requestBody = JSON.parse(options.body);
        return Response.json({ choices: [{ message: { content: 'Présentation d’Agent Smith.' } }] });
    };

    try
    {
        const client = new MistralDocumentClient({
            chatUrl: 'https://chat.example/', chatApiKey: 'chat-key', chatModel: 'chat-model', descriptionLanguage: 'FR-fr Français',
        });
        const description = await client.describeDocument({
            originalFilename: 'agent-smith.pdf',
            mimeType: 'application/pdf',
            pages: ['Première page enrichie', 'Deuxième page enrichie'],
        });

        assert.equal(description, 'Présentation d’Agent Smith.');
        assert.equal(requestBody.model, 'chat-model');
        assert.equal(requestBody.temperature, 0);
        assert.equal(requestBody.max_tokens, 260);
        assert.match(requestBody.messages[0].content, /exclusivement en FR-fr Français/);
        assert.match(requestBody.messages[1].content, /agent-smith\.pdf/);
        assert.match(requestBody.messages[1].content, /Première page enrichie/);
        assert.match(requestBody.messages[1].content, /Deuxième page enrichie/);
    }
    finally
    {
        globalThis.fetch = originalFetch;
    }
});

test('MistralDocumentClient includes optional user context in the document description request', async () =>
{
    const originalFetch = globalThis.fetch;
    let requestBody;

    globalThis.fetch = async (url, options) =>
    {
        requestBody = JSON.parse(options.body);
        return Response.json({ choices: [{ message: { content: 'Description générée avec contexte.' } }] });
    };

    try
    {
        const client = new MistralDocumentClient({
            chatUrl: 'https://chat.example/', chatApiKey: 'chat-key', chatModel: 'chat-model', descriptionLanguage: 'FR-fr Français',
        });
        const description = await client.describeDocument({
            originalFilename: 'image-extraite.png',
            mimeType: 'image/png',
            pages: ['Peu de contenu OCR'],
            userDescription: 'Schéma extrait du rapport annuel, présentant la gouvernance du programme.',
        });

        assert.equal(description, 'Description générée avec contexte.');
        assert.match(requestBody.messages[1].content, /Contexte fourni par l'utilisateur/);
        assert.match(requestBody.messages[1].content, /Schéma extrait du rapport annuel/);
        assert.match(requestBody.messages[1].content, /Conserve explicitement et sans les reformuler les mots-clés pertinents/);
    }
    finally
    {
        globalThis.fetch = originalFetch;
    }
});

test('MistralDocumentClient describes a page from its complete image and OCR', async () =>
{
    const originalFetch = globalThis.fetch;
    let requestUrl;
    let requestBody;

    globalThis.fetch = async (url, options) =>
    {
        requestUrl = url.toString();
        requestBody = JSON.parse(options.body);
        return Response.json({ choices: [{ message: { content: 'Description visuelle de la page.' } }] });
    };

    try
    {
        const client = new MistralDocumentClient({
            visionUrl: 'https://vision.example/', visionApiKey: 'vision-key', visionModel: 'vision-model', descriptionLanguage: 'FR-fr Français',
        });
        const result = await client.describePage(Buffer.from('FULL PAGE'), 'image/png', 'Texte OCR');

        assert.equal(result, 'Description visuelle de la page.');
        assert.equal(requestUrl, 'https://vision.example/v1/chat/completions');
        assert.equal(requestBody.model, 'vision-model');
        assert.equal(requestBody.temperature, 0);
        assert.equal(requestBody.max_tokens, 180);
        assert.match(requestBody.messages[1].content[0].text, /2 phrases et 60 mots maximum/);
        assert.match(requestBody.messages[1].content[0].text, /Texte OCR/);
        assert.equal(requestBody.messages[1].content[1].image_url, 'data:image/png;base64,RlVMTCBQQUdF');
    }
    finally
    {
        globalThis.fetch = originalFetch;
    }
});

test('MistralDocumentClient enforces description word limits', async () =>
{
    const originalFetch = globalThis.fetch;
    const longDescription = Array.from({ length: 120 }, (_, index) => `mot${index + 1}`).join(' ');
    globalThis.fetch = async () => Response.json({ choices: [{ message: { content: longDescription } }] });

    try
    {
        const client = new MistralDocumentClient({ visionUrl: 'https://vision.example/', visionApiKey: 'vision-key', visionModel: 'vision-model',
            chatUrl: 'https://chat.example/', chatApiKey: 'chat-key', chatModel: 'chat-model', descriptionLanguage: 'FR-fr Français' });
        const pageDescription = await client.describePage(Buffer.from('PAGE'), 'image/png', 'OCR');
        const documentDescription = await client.describeDocument({ originalFilename: 'document.pdf', mimeType: 'application/pdf', pages: ['OCR'] });

        assert.equal(pageDescription.split(/\s+/).length, 60);
        assert.equal(documentDescription.split(/\s+/).length, 100);
        assert.match(pageDescription, /mot60…$/);
        assert.match(documentDescription, /mot100…$/);
    }
    finally
    {
        globalThis.fetch = originalFetch;
    }
});