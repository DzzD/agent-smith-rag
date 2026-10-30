import assert from 'node:assert/strict';
import test from 'node:test';
import { createCanvas } from 'canvas';
import { Document } from '../app/db/models/Document.js';

test('accepts text and Markdown files for StirlingPDF conversion', async () =>
{
    for (const [name, expectedMimeType] of [['notes.txt', 'text/plain'], ['readme.md', 'text/markdown']])
    {
        const content = Buffer.from('Document text', 'utf8');
        const file = await Document.parseFile({ name, dataBase64: content.toString('base64') });

        assert.equal(file.name, name);
        assert.equal(file.mimeType, expectedMimeType);
        assert.deepEqual(file.content, content);
    }
});

test('lets StirlingPDF decide whether an unknown file format is supported', async () =>
{
    const content = Buffer.from('Unknown document format', 'utf8');
    const file = await Document.parseFile({ name: 'document.unknown', dataBase64: content.toString('base64') });
    let convertedFile;

    const images = await Document.buildPageImages(file, {
        dpi: 300,
        stirlingPdfClient: {
            async convertToPdf(inputFile)
            {
                convertedFile = inputFile;
                return Buffer.from('PDF');
            },
            async convertPdfToImages()
            {
                return [Buffer.from('PNG')];
            },
        },
    });

    assert.equal(file.mimeType, 'application/octet-stream');
    assert.equal(convertedFile, file);
    assert.deepEqual(images, [{ content: Buffer.from('PNG'), mimeType: 'image/png', dpi: 300 }]);
});

test('assigns 75 DPI to source images when no physical metadata is available', async () =>
{
    const content = createCanvas(1200, 800).toBuffer('image/png');
    const images = await Document.buildPageImages({ name: 'scan.png', content, mimeType: 'image/png' }, { dpi: 300 });

    assert.deepEqual(images, [{ content, mimeType: 'image/png', dpi: 75 }]);
});

test('renders PDFs at Stirling DPI independently from storage DPI', async () =>
{
    let requestedDpi;
    const images = await Document.buildPageImages({ name: 'document.pdf', content: Buffer.from('%PDF'), mimeType: 'application/pdf' }, {
        dpi: 300,
        stirlingDpi: 500,
        stirlingPdfClient: {
            async convertPdfToImages(pdf, options)
            {
                requestedDpi = options.dpi;
                return [Buffer.from('PNG')];
            },
        },
    });

    assert.equal(requestedDpi, 500);
    assert.deepEqual(images, [{ content: Buffer.from('PNG'), mimeType: 'image/png', dpi: 500 }]);
});