import assert from 'node:assert/strict';
import test from 'node:test';
import { createCanvas, loadImage } from 'canvas';
import { DocumentPage } from '../app/db/models/DocumentPage.js';

test('returns every block in hierarchical document order', () =>
{
    const page = new DocumentPage();
    page.blocks = { type: 'page', x: 0, y: 0, width: 1000, height: 800, children: [
        { type: 'text', content: 'Top', x: 20, y: 20, width: 200, height: 50 },
        { type: 'image', content: 'Diagram', x: 20, y: 100, width: 500, height: 400, children: [
            { type: 'text', content: 'Nested', x: 5, y: 5, width: 30, height: 10 },
        ] },
    ] };

    assert.deepEqual(page.getContentBlocks().map(({ content }) => content), ['Top', 'Diagram', 'Nested']);
    assert.equal(page.getBlockCount(), 3);
});

test('computes absolute bounds from nested local block coordinates', () =>
{
    const blocks = DocumentPage.addAbsoluteBlockPositions({
        type: 'page', x: 0, y: 0, width: 1000, height: 500, children: [{
            type: 'image', x: 100, y: 50, width: 800, height: 400, childWidth: 160, childHeight: 80, children: [{
                type: 'image', x: 40, y: 20, width: 80, height: 40, childWidth: 80, childHeight: 40, children: [{
                    type: 'text', content: 'Deep text', x: 20, y: 10, width: 40, height: 20,
                }],
            }],
        }],
    });
    const firstImage = blocks.children[0];
    const secondImage = firstImage.children[0];
    const text = secondImage.children[0];

    assert.deepEqual([firstImage.pageMinX, firstImage.pageMaxX, firstImage.pageMinY, firstImage.pageMaxY], [100, 900, 50, 450]);
    assert.deepEqual([secondImage.pageMinX, secondImage.pageMaxX, secondImage.pageMinY, secondImage.pageMaxY], [300, 700, 150, 350]);
    assert.deepEqual([text.pageMinX, text.pageMaxX, text.pageMinY, text.pageMaxY], [400, 600, 200, 300]);
    assert.equal([blocks, firstImage, secondImage, text].every((block) =>
        !['x', 'y', 'width', 'height', 'childWidth', 'childHeight'].some((property) => property in block)), true);
});

test('scales absolute bounds into the returned page raster', () =>
{
    const blocks = DocumentPage.addAbsoluteBlockPositions({
        type: 'page', x: 0, y: 0, width: 1000, height: 500, children: [{
            type: 'image', x: 100, y: 50, width: 800, height: 400, childWidth: 160, childHeight: 80, children: [{
                type: 'text', content: 'Nested', x: 40, y: 20, width: 80, height: 40,
            }],
        }],
    }, 0.25, 0.25);

    assert.deepEqual([blocks.pageMaxX, blocks.pageMaxY], [250, 125]);
    assert.deepEqual([blocks.children[0].pageMinX, blocks.children[0].pageMaxX], [25, 225]);
    assert.deepEqual([blocks.children[0].children[0].pageMinX, blocks.children[0].children[0].pageMaxX], [75, 175]);
});

test('downscales a returned page image and reports its actual geometry', async () =>
{
    const source = createCanvas(1200, 600).toBuffer('image/png');
    const result = await DocumentPage.preparePageResult({
        pageUuid: 'page', pageNumber: 1, description: null,
        blocks: { type: 'page', x: 0, y: 0, width: 1200, height: 600, children: [] },
        imageContent: source, imageMimeType: 'image/png', pixelWidth: 1200, pixelHeight: 600, dpi: 300,
    }, 75);
    const returnedImage = await loadImage(result.image.content);

    assert.deepEqual({ pixelWidth: result.pixelWidth, pixelHeight: result.pixelHeight, dpi: result.dpi },
        { pixelWidth: 300, pixelHeight: 150, dpi: 75 });
    assert.deepEqual({ width: returnedImage.width, height: returnedImage.height }, { width: 300, height: 150 });
    assert.deepEqual(result.blocks, { blockId: 'B001', x: 0, y: 0, width: 300, height: 150, children: [] });
});

test('does not upscale a returned page image above its stored DPI', async () =>
{
    const source = createCanvas(120, 60).toBuffer('image/png');
    const result = await DocumentPage.preparePageResult({
        pageUuid: 'page', pageNumber: 1, description: null,
        blocks: { type: 'page', x: 0, y: 0, width: 120, height: 60, children: [] },
        imageContent: source, imageMimeType: 'image/png', pixelWidth: 120, pixelHeight: 60, dpi: 150,
    }, 300);

    assert.equal(result.image.content, source);
    assert.deepEqual({ pixelWidth: result.pixelWidth, pixelHeight: result.pixelHeight, dpi: result.dpi },
        { pixelWidth: 120, pixelHeight: 60, dpi: 150 });
});

test('stores the flat ordered blocks returned by PaddleOCR', async () =>
{
    const image = createCanvas(100, 100).toBuffer('image/png');
    const page = new DocumentPage();
    const paddleBlocks = [
        { type: 'title', content: 'Titre', pageMinX: 10, pageMinY: 10, pageMaxX: 80, pageMaxY: 30 },
        { type: 'text', content: 'Texte', pageMinX: 10, pageMinY: 40, pageMaxX: 80, pageMaxY: 60 },
    ];

    await page.processImage({ content: image, mimeType: 'image/png', dpi: 300 }, {
        dpi: 300,
        ocrDpi: 150,
        visionDpi: 75,
        ocrLineSpacingFactor: 0.75,
        ocrHorizontalOverlapFactor: 0.75,
        ocrClient: {
            async analyze(content, options)
            {
                const ocrImage = await loadImage(content);
                const visionImage = await loadImage(options.visionImage);
                assert.deepEqual({ width: ocrImage.width, height: ocrImage.height }, { width: 50, height: 50 });
                assert.deepEqual({ width: visionImage.width, height: visionImage.height }, { width: 25, height: 25 });
                assert.deepEqual({ ...options, visionImage: undefined }, {
                    mimeType: 'image/png',
                    visionImage: undefined,
                    visionMimeType: 'image/png',
                    coordinateScaleX: 2,
                    coordinateScaleY: 2,
                    visionCoordinateScaleX: 0.5,
                    visionCoordinateScaleY: 0.5,
                    lineSpacingFactor: 0.75,
                    horizontalOverlapFactor: 0.75,
                    readingOrderAlignmentTolerance: undefined,
                    readingOrderHorizontalOverlapFactor: undefined,
                    maximumEmptyToBlockRatio: undefined,
                    readingOrderRowTolerance: undefined,
                    pageWidth: 50,
                    pageHeight: 50,
                });
                return { markdown: '# Titre\n\nTexte\n', blocks: paddleBlocks };
            },
        },
        mistralClient: {
            async describePage(content, mimeType, markdown)
            {
				const visionImage = await loadImage(content);
				assert.deepEqual({ width: visionImage.width, height: visionImage.height }, { width: 50, height: 50 });
                assert.equal(mimeType, 'image/png');
                assert.equal(markdown, '# Titre\n\nTexte\n');
                return 'Description.';
            },
        },
        embeddingClient: { async createEmbedding() { return [1]; } },
    });

    assert.deepEqual(page.blocks.children, paddleBlocks);
    assert.deepEqual(page.getContentBlocks(), [{ type: 'title', content: 'Titre' }, { type: 'text', content: 'Texte' }]);
    assert.equal(page.ocrRaw, '# Titre\n\nTexte\n');
    assert.equal(page.ocrEnriched, '# Titre\n\nTexte\n');
    assert.deepEqual(page.metadata, {
        ocrDpi: 150,
        visionDpi: 75,
    });
});

test('scales flat PaddleOCR page coordinates for a requested image DPI', () =>
{
    const blocks = DocumentPage.addAbsoluteBlockPositions({
        type: 'page', pageMinX: 0, pageMinY: 0, pageMaxX: 1000, pageMaxY: 500, children: [
            { type: 'text', content: 'Texte', pageMinX: 100, pageMinY: 50, pageMaxX: 900, pageMaxY: 450 },
        ],
    }, 0.5, 0.5);

    assert.deepEqual(blocks, {
        type: 'page', pageMinX: 0, pageMinY: 0, pageMaxX: 500, pageMaxY: 250, children: [
            { type: 'text', content: 'Texte', pageMinX: 50, pageMinY: 25, pageMaxX: 450, pageMaxY: 225 },
        ],
    });
});

test('exposes compact stable block IDs with x, y, width, and height in document_get blocks', async () =>
{
    const source = createCanvas(100, 100).toBuffer('image/png');
    const page = {
        pageUuid: '11111111-1111-4111-8111-111111111111', pageNumber: 1, description: null,
        blocks: { type: 'page', pageMinX: 0, pageMinY: 0, pageMaxX: 100, pageMaxY: 100, children: [
            { id: 'G001', type: 'title', content: 'Title', pageMinX: 10, pageMinY: 10, pageMaxX: 90, pageMaxY: 30 },
            { id: 'G002', type: 'text', content: 'Text', pageMinX: 10, pageMinY: 40, pageMaxX: 90, pageMaxY: 60 },
        ] },
        imageContent: source, imageMimeType: 'image/png', pixelWidth: 100, pixelHeight: 100, dpi: 300,
    };

    const first = await DocumentPage.preparePageResult(page, 100);
    const second = await DocumentPage.preparePageResult(page, 100);
    const blocks = [first.blocks, ...first.blocks.children];

    assert.deepEqual(first.blocks, second.blocks);
    assert.deepEqual(blocks.map((block) => block.blockId), [
        'B001', 'G001', 'G002',
    ]);
    assert.equal(blocks.every((block) => !('type' in block)), true);
    assert.equal(blocks.every((block) => !['pageMinX', 'pageMinY', 'pageMaxX', 'pageMaxY'].some((property) => property in block)), true);
    assert.deepEqual(blocks.map((block) => [block.x, block.y, block.width, block.height]), [
        [0, 0, 33, 33], [3, 3, 27, 7], [3, 13, 27, 7],
    ]);
});

test('builds a normalized highlight for one valid block', async () =>
{
    const page = createHighlightPage();
    const blocks = DocumentPage.addBlockIds(page.blocks, page.uuid);
    const result = await DocumentPage.buildHighlight(page, [blocks.children[0].blockId]);

    assert.deepEqual(result, {
        pageUuid: page.uuid,
        blockIds: [blocks.children[0].blockId],
        pageImageWidth: 200,
        pageImageHeight: 100,
        highlight: { x1: 0.1, y1: 0.1, x2: 0.4, y2: 0.3 },
    });
});

test('unions multiple blocks and removes duplicate IDs', async () =>
{
    const page = createHighlightPage();
    const blocks = DocumentPage.addBlockIds(page.blocks, page.uuid);
    const firstId = blocks.children[0].blockId;
    const secondId = blocks.children[1].blockId;
    const result = await DocumentPage.buildHighlight(page, [firstId, secondId, firstId]);

    assert.deepEqual(result.blockIds, [firstId, secondId]);
    assert.deepEqual(result.highlight, { x1: 0.1, y1: 0.1, x2: 0.9, y2: 0.8 });
    assert.equal(Object.values(result.highlight).every((coordinate) => coordinate >= 0 && coordinate <= 1), true);
});

test('rejects invalid page highlight inputs', async () =>
{
    const page = createHighlightPage();
    const blocks = DocumentPage.addBlockIds(page.blocks, page.uuid);

    await assert.rejects(DocumentPage.buildHighlight(page, []), /at least one/);
    await assert.rejects(DocumentPage.buildHighlight(page, ['G999']), /Block not found/);
    await assert.rejects(DocumentPage.buildHighlight(page, [blocks.children[2].blockId]), /type is not allowed/);

    const invalidCoordinates = createHighlightPage();
    invalidCoordinates.blocks.children[0].pageMaxX = invalidCoordinates.blocks.children[0].pageMinX;
    const invalidCoordinateId = DocumentPage.addBlockIds(invalidCoordinates.blocks, invalidCoordinates.uuid).children[0].blockId;
    await assert.rejects(DocumentPage.buildHighlight(invalidCoordinates, [invalidCoordinateId]), /invalid original page coordinates/);

    const invalidDimensions = createHighlightPage();
    invalidDimensions.pixelWidth = 0;
    await assert.rejects(DocumentPage.buildHighlight(invalidDimensions,
        [DocumentPage.addBlockIds(invalidDimensions.blocks, invalidDimensions.uuid).children[0].blockId]), /dimensions are missing or invalid/);

    const outsidePage = createHighlightPage();
    outsidePage.blocks.children[0].pageMaxX = 201;
    const outsidePageId = DocumentPage.addBlockIds(outsidePage.blocks, outsidePage.uuid).children[0].blockId;
    await assert.rejects(DocumentPage.buildHighlight(outsidePage, [outsidePageId]), /outside the complete page image/);
});

function createHighlightPage()
{
    return {
        uuid: '11111111-1111-4111-8111-111111111111',
        imageContent: createCanvas(200, 100).toBuffer('image/png'),
        pixelWidth: 200,
        pixelHeight: 100,
        blocks: { type: 'page', pageMinX: 0, pageMinY: 0, pageMaxX: 200, pageMaxY: 100, children: [
            { id: 'G001', type: 'title', content: 'Title', pageMinX: 20, pageMinY: 10, pageMaxX: 80, pageMaxY: 30 },
            { id: 'G002', type: 'text', content: 'Text', pageMinX: 100, pageMinY: 50, pageMaxX: 180, pageMaxY: 80 },
            { id: 'G003', type: 'image', content: 'Image', pageMinX: 0, pageMinY: 0, pageMaxX: 200, pageMaxY: 100 },
        ] },
    };
}

