import assert from 'node:assert/strict';
import test from 'node:test';
import { createCanvas, loadImage } from 'canvas';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { PaddleOcrClient } from '../rag/client/PaddleOcrClient.js';

test('PaddleOcrClient returns blocks in deterministic reading order without Vision labeling', async () =>
{
    const originalFetch = globalThis.fetch;
    const requests = [];

    globalThis.fetch = async (url, options) =>
    {
        requests.push({ url: url.toString(), options });

        if (url.toString() === 'http://paddle.test/ocr')
        {
            return Response.json({ errorCode: 0, result: { ocrResults: [{ prunedResult: {
                rec_texts: ['Titre', 'Contenu'],
                rec_scores: [0.99, 0.98],
                rec_boxes: [[10, 10, 100, 30], [10, 50, 100, 70]],
            } }] } });
        }

        throw new Error(`Unexpected request: ${url}.`);
    };

    try
    {
        const client = new PaddleOcrClient({ paddleUrl: 'http://paddle.test', paddleApiKey: 'paddle-key',
            visionUrl: 'http://vision.test', visionApiKey: 'vision-key', visionModel: 'vision-model' });
        const canvas = createCanvas(120, 90);
        canvas.getContext('2d').fillStyle = '#ffffff';
        canvas.getContext('2d').fillRect(0, 0, canvas.width, canvas.height);
        const result = await client.analyze(canvas.toBuffer('image/png'));

        assert.equal(requests[0].options.headers.Authorization, 'Bearer paddle-key');
        assert.equal(requests.length, 1);
        assert.deepEqual(result, {
            markdown: 'Titre\n\nContenu\n',
            blocks: [
                { id: 'B001', type: 'text', content: 'Titre', pageMinX: 10, pageMinY: 10, pageMaxX: 100, pageMaxY: 30 },
                { id: 'B002', type: 'text', content: 'Contenu', pageMinX: 10, pageMinY: 50, pageMaxX: 100, pageMaxY: 70 },
            ],
        });
    }
    finally
    {
        globalThis.fetch = originalFetch;
    }
});

test('PaddleOcrClient uses a separate Vision image and scales OCR coordinates', async () =>
{
    const client = new PaddleOcrClient();
    let visionImage;

    client._extractLines = async (image) =>
    {
        assert.equal(image.toString(), 'OCR');
        return [{ id: 'L001', text: 'Texte', score: 1, box: [10, 20, 30, 40] }];
    };
    client.vision.saveResultImage = async ({ image, blocks }) =>
    {
        visionImage = image;
        assert.deepEqual(blocks[0].box, [20, 40, 60, 80]);
    };

    const result = await client.analyze(Buffer.from('OCR'), {
        visionImage: Buffer.from('VISION'),
        coordinateScaleX: 2,
        coordinateScaleY: 2,
    });

    assert.equal(visionImage.toString(), 'VISION');
    assert.deepEqual(result.blocks[0], {
        id: 'B001', type: 'text', content: 'Texte', pageMinX: 20, pageMinY: 40, pageMaxX: 60, pageMaxY: 80,
    });
});

test('PaddleOcrClient rounds scaled block coordinates before persistence', async () =>
{
    const client = new PaddleOcrClient();
    client._extractLines = async () => [{ id: 'L001', text: 'Texte', score: 1, box: [11, 22, 101, 202] }];

    const result = await client.analyze(Buffer.from('ocr'), { coordinateScaleX: 1.25, coordinateScaleY: 0.75 });

    assert.deepEqual(result.blocks[0], {
        id: 'B001', type: 'text', content: 'Texte', pageMinX: 14, pageMinY: 17, pageMaxX: 126, pageMaxY: 152,
    });
});

test('PaddleOcrClient exports every layout stage and the final result in debug export mode', async () =>
{
    const imageDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'paddle-vision-'));
    const client = new PaddleOcrClient({ visionImageDirectory: imageDirectory });
    const canvas = createCanvas(120, 90);
    canvas.getContext('2d').fillStyle = '#ffffff';
    canvas.getContext('2d').fillRect(0, 0, canvas.width, canvas.height);
    client._extractLines = async () => [
        { id: 'L001', text: 'Titre', score: 1, box: [10, 20, 100, 35] },
        { id: 'L002', text: 'Texte', score: 1, box: [10, 55, 80, 70] },
    ];
    try
    {
        await client.analyze(canvas.toBuffer('image/png'), { logContext: { fileName: 'document.pdf', pageNumber: 2 } });
        const files = await fs.readdir(imageDirectory);
        assert.deepEqual(files.sort(), [
            'document-page-002-groups-before-flattening.png',
            'document-page-002-line-groups.png',
            'document-page-002-raw-ocr-blocks.png',
            'document-page-002-result.png',
        ]);
        const groupsImage = await loadImage(path.join(imageDirectory, 'document-page-002-groups-before-flattening.png'));
        const groupsCanvas = createCanvas(groupsImage.width, groupsImage.height);
        const groupsContext = groupsCanvas.getContext('2d');
        groupsContext.drawImage(groupsImage, 0, 0);
        assert.deepEqual([...groupsContext.getImageData(100, 50, 1, 1).data], [0, 102, 255, 255]);
        assert.deepEqual([...groupsContext.getImageData(10, 20, 1, 1).data], [0, 102, 255, 255]);
        const lineGroupsImage = await loadImage(path.join(imageDirectory, 'document-page-002-line-groups.png'));
        const lineGroupsCanvas = createCanvas(lineGroupsImage.width, lineGroupsImage.height);
        const lineGroupsContext = lineGroupsCanvas.getContext('2d');
        lineGroupsContext.drawImage(lineGroupsImage, 0, 0);
        assert.deepEqual([...lineGroupsContext.getImageData(10, 20, 1, 1).data], [0, 160, 80, 255]);
        const rawImage = await loadImage(path.join(imageDirectory, 'document-page-002-raw-ocr-blocks.png'));
        const rawCanvas = createCanvas(rawImage.width, rawImage.height);
        const rawContext = rawCanvas.getContext('2d');
        rawContext.drawImage(rawImage, 0, 0);
        assert.deepEqual([...rawContext.getImageData(10, 20, 1, 1).data], [255, 153, 0, 255]);
        const resultImage = await loadImage(path.join(imageDirectory, 'document-page-002-result.png'));
        const resultCanvas = createCanvas(resultImage.width, resultImage.height);
        const resultContext = resultCanvas.getContext('2d');
        resultContext.drawImage(resultImage, 0, 0);
        assert.deepEqual([...resultContext.getImageData(10, 20, 1, 1).data], [255, 0, 0, 255]);
        assert.deepEqual([...resultContext.getImageData(10, 55, 1, 1).data], [255, 0, 0, 255]);
    }
    finally
    {
        await fs.rm(imageDirectory, { recursive: true, force: true });
    }
});

test('PaddleOcrClient renames groups according to the final reading order', async () =>
{
    const client = new PaddleOcrClient();
    client._extractLines = async () => [
        { id: 'L001', text: 'Second', score: 1, box: [10, 50, 100, 70] },
        { id: 'L002', text: 'First', score: 1, box: [10, 10, 100, 30] },
    ];
    const result = await client.analyze(Buffer.from('IMAGE'));

    assert.deepEqual(result.blocks.map((block) => ({ id: block.id, type: block.type, content: block.content })), [
        { id: 'B001', type: 'text', content: 'First' },
        { id: 'B002', type: 'text', content: 'Second' },
    ]);
});

test('PaddleOcrClient retries transient Paddle transport failures', async () =>
{
    const client = new PaddleOcrClient();
    let paddleCalls = 0;

    client._extractLines = async () =>
    {
        paddleCalls += 1;

        if (paddleCalls === 1)
        {
            throw new TypeError('fetch failed');
        }

        return [{ id: 'L001', text: 'Texte', score: 1, box: [1, 2, 3, 4] }];
    };

    const result = await client.analyze(Buffer.from('IMAGE'));

    assert.equal(paddleCalls, 2);
    assert.equal(result.blocks[0].content, 'Texte');
});

test('PaddleOcrClient merges the closest compatible groups and orders fixed-reference rows', () =>
{
    const client = new PaddleOcrClient();
    const blocks = [
        { id: 'G001', text: 'Right top', box: [55, 10, 95, 20] },
        { id: 'G002', text: 'Left lower', box: [5, 60, 45, 70] },
        { id: 'G003', text: 'Left top', box: [5, 12, 45, 22] },
        { id: 'G004', text: 'Right lower', box: [55, 55, 95, 65] },
    ];

    const result = client._orderBlocks(blocks, {
        pageWidth: 100,
        pageHeight: 100,
        alignmentTolerance: 0.02,
        horizontalOverlapFactor: 0.5,
        rowTolerance: 0.05,
    });

    assert.deepEqual(result.map((block) => block.id), ['G003', 'G002', 'G001', 'G004']);
});

test('PaddleOcrClient leaves incompatible and zero-width groups separate', () =>
{
    const client = new PaddleOcrClient();
    const blocks = [
        { id: 'G001', text: 'Zero width', box: [10, 30, 10, 40] },
        { id: 'G002', text: 'Right', box: [60, 10, 90, 20] },
        { id: 'G003', text: 'Left', box: [5, 12, 35, 22] },
    ];
    const options = { pageWidth: 100, pageHeight: 100, alignmentTolerance: 0.02, horizontalOverlapFactor: 0.5, rowTolerance: 0.05 };

    assert.deepEqual(client._orderBlocks([], options), []);
    assert.deepEqual(client._orderBlocks(blocks, options).map((block) => block.id), ['G003', 'G002', 'G001']);
});

test('PaddleOcrClient preserves fusion order and keeps a merged column contiguous', () =>
{
    const client = new PaddleOcrClient();
    const blocks = [
        { id: 'G005', text: 'Cybersecurity service', box: [460, 613, 795, 688] },
        { id: 'G006', text: 'Infrastructure service', box: [957, 614, 1294, 634] },
        { id: 'G007', text: 'Infrastructure staff', box: [953, 667, 1283, 1016] },
        { id: 'G008', text: 'Compliance', box: [457, 698, 646, 782] },
        { id: 'G009', text: 'Cybersecurity', box: [456, 797, 631, 915] },
        { id: 'G010', text: 'Networks', box: [456, 932, 641, 1050] },
        { id: 'G011', text: 'Apprentices', box: [456, 1065, 654, 1117] },
    ];

    const result = client._orderBlocks(blocks, {
        pageWidth: 1754,
        pageHeight: 1240,
        alignmentTolerance: 0.02,
        horizontalOverlapFactor: 0.5,
        rowTolerance: 0.02,
    });

    assert.deepEqual(result.map((block) => block.id), ['G005', 'G008', 'G009', 'G010', 'G011', 'G006', 'G007']);
});

test('PaddleOcrClient does not extend compatibility through a merged bounding box', () =>
{
    const client = new PaddleOcrClient();
    const blocks = [
        { id: 'HEADER', text: 'Wide header', box: [0, 0, 100, 10] },
        { id: 'LEFT', text: 'Left column', box: [0, 20, 40, 30] },
        { id: 'RIGHT', text: 'Right column', box: [60, 40, 100, 50] },
    ];
    const mergedGroups = [];

    client._orderBlocks(blocks, {
        pageWidth: 100,
        pageHeight: 100,
        alignmentTolerance: 0.02,
        horizontalOverlapFactor: 0.5,
        rowTolerance: 0.05,
        mergedGroups,
    });

    assert.deepEqual(mergedGroups.map((group) => group.id), ['HEADER+LEFT', 'RIGHT']);
});

test('PaddleOcrClient rejects a merge that adds more empty height than the candidate block height', () =>
{
    const client = new PaddleOcrClient();
    const blocks = [
        { id: 'PARENT', text: 'Parent', box: [0, 0, 100, 20] },
        { id: 'SMALL_REMOTE', text: 'Small remote block', box: [0, 100, 20, 110] },
    ];
    const mergedGroups = [];

    client._orderBlocks(blocks, {
        pageWidth: 100,
        pageHeight: 120,
        alignmentTolerance: 0.02,
        horizontalOverlapFactor: 0.5,
        rowTolerance: 0.05,
        maximumEmptyToBlockRatio: 1,
        mergedGroups,
    });

    assert.deepEqual(mergedGroups.map((group) => group.id), ['PARENT', 'SMALL_REMOTE']);
});

test('PaddleOcrClient does not penalize a narrow aligned block for the width of its column', () =>
{
    const client = new PaddleOcrClient();
    const blocks = [
        { id: 'WIDE_COLUMN', text: 'Wide column', box: [0, 0, 100, 20] },
        { id: 'NARROW_BLOCK', text: 'Narrow block', box: [0, 30, 20, 40] },
    ];
    const mergedGroups = [];

    client._orderBlocks(blocks, {
        pageWidth: 100,
        pageHeight: 100,
        alignmentTolerance: 0.02,
        horizontalOverlapFactor: 0.5,
        rowTolerance: 0.05,
        maximumEmptyToBlockRatio: 1,
        mergedGroups,
    });

    assert.deepEqual(mergedGroups.map((group) => group.id), ['WIDE_COLUMN+NARROW_BLOCK']);
});

test('PaddleOcrClient chooses the merge with the lowest empty-height-to-block-height ratio first', () =>
{
    const client = new PaddleOcrClient();
    const blocks = [
        { id: 'TOP', text: 'Top', box: [0, 0, 100, 20] },
        { id: 'NEAR', text: 'Near', box: [0, 30, 100, 50] },
        { id: 'FAR', text: 'Far', box: [0, 80, 100, 100] },
    ];
    const mergedGroups = [];

    client._orderBlocks(blocks, {
        pageWidth: 100,
        pageHeight: 100,
        alignmentTolerance: 0.02,
        horizontalOverlapFactor: 0.5,
        rowTolerance: 0.05,
        mergedGroups,
    });

    assert.deepEqual(mergedGroups.map((group) => group.id), ['TOP+NEAR+FAR']);
    assert.deepEqual(mergedGroups[0].box, [0, 0, 100, 100]);
});

test('PaddleOcrClient rejects a merge whose new empty area overlaps another group', () =>
{
    const client = new PaddleOcrClient();
    const blocks = [
        { id: 'TOP', text: 'Top', box: [0, 0, 40, 20] },
        { id: 'BOTTOM', text: 'Bottom', box: [0, 80, 40, 100] },
        { id: 'MIDDLE', text: 'Middle', box: [25, 40, 60, 60] },
    ];
    const mergedGroups = [];

    client._orderBlocks(blocks, {
        pageWidth: 100,
        pageHeight: 100,
        alignmentTolerance: 0.02,
        horizontalOverlapFactor: 0.5,
        rowTolerance: 0.05,
        maximumEmptyToBlockRatio: Number.POSITIVE_INFINITY,
        mergedGroups,
    });

    assert.deepEqual(mergedGroups.map((group) => group.id), ['TOP', 'BOTTOM', 'MIDDLE']);
});

test('PaddleOcrClient orders existing groups from vertical overlap without contradictory comparisons', () =>
{
    const client = new PaddleOcrClient();
    const options = { pageWidth: 200, pageHeight: 200, alignmentTolerance: 0.02, horizontalOverlapFactor: 0.5, rowTolerance: 0.5 };
    const cyclicBlocks = [
        { id: 'A', text: 'Top right', box: [60, 0, 100, 40] },
        { id: 'B', text: 'Middle', box: [0, 20, 40, 100] },
        { id: 'C', text: 'Bottom left', box: [-60, 80, -20, 120] },
    ];
    const limitedOverlapBlocks = [
        { id: 'TOP', text: 'Top right', box: [100, 0, 140, 50] },
        { id: 'LEFT', text: 'Lower left', box: [0, 40, 40, 90] },
    ];
    const separatedBlocks = [
        { id: 'ABOVE', text: 'Above right', box: [100, 0, 140, 30] },
        { id: 'BELOW', text: 'Below left', box: [0, 40, 40, 70] },
    ];
    const pageHeaderBlocks = [
        { id: 'SIDE', text: 'Side heading', box: [20, 70, 70, 90] },
        { id: 'TITLE', text: 'Page title', box: [90, 10, 180, 20] },
        { id: 'HEAD', text: 'Head', box: [100, 30, 160, 50] },
    ];
    const overlappingColumns = [
        { id: 'LOWER_LEFT', text: 'Lower left column', box: [20, 70, 120, 150] },
        { id: 'UPPER_RIGHT', text: 'Upper overlapping column', box: [100, 10, 180, 100] },
    ];
    const tallCentralColumn = [
        { id: 'EXPERT', text: 'Expert', box: [140, 75, 180, 85] },
        { id: 'LOWER_LEFT', text: 'Lower left column', box: [0, 120, 40, 190] },
        { id: 'CENTRAL', text: 'Tall central column', box: [50, 10, 130, 180] },
    ];

    const cyclicOrder = client._orderBlocks(cyclicBlocks, options).map((block) => block.id);
    const reversedCyclicOrder = client._orderBlocks([...cyclicBlocks].reverse(), options).map((block) => block.id);
    assert.deepEqual(reversedCyclicOrder, cyclicOrder);
    assert.ok(cyclicOrder.indexOf('A') < cyclicOrder.indexOf('C'));
    assert.deepEqual(client._orderBlocks(separatedBlocks, options).map((block) => block.id), ['ABOVE', 'BELOW']);
    assert.deepEqual(client._orderBlocks([...separatedBlocks].reverse(), options).map((block) => block.id), ['ABOVE', 'BELOW']);
    assert.deepEqual(client._orderBlocks(pageHeaderBlocks, options).map((block) => block.id), ['TITLE', 'HEAD', 'SIDE']);
    assert.deepEqual(client._orderBlocks(overlappingColumns, options).map((block) => block.id), ['UPPER_RIGHT', 'LOWER_LEFT']);
    assert.deepEqual(client._orderBlocks(tallCentralColumn, options).map((block) => block.id), ['CENTRAL', 'EXPERT', 'LOWER_LEFT']);
    assert.deepEqual(client._orderBlocks(limitedOverlapBlocks, options).map((block) => block.id), ['TOP', 'LEFT']);
    assert.deepEqual(client._orderBlocks(limitedOverlapBlocks, { ...options, rowTolerance: 0.1 }).map((block) => block.id), ['TOP', 'LEFT']);
});

test('PaddleOcrClient labels final groups with global geometric rows and columns', () =>
{
    const client = new PaddleOcrClient();
    const mergedGroups = [];
    const blocks = [
        { id: 'HEADER', text: 'Header', box: [0, 0, 200, 20] },
        { id: 'RIGHT', text: 'Right column', box: [110, 45, 200, 140] },
        { id: 'LEFT', text: 'Left column', box: [0, 40, 90, 150] },
    ];

    client._orderBlocks(blocks, {
        pageWidth: 200,
        pageHeight: 200,
        alignmentTolerance: 0.02,
        horizontalOverlapFactor: 0.5,
        rowTolerance: 0.02,
        maximumEmptyToBlockRatio: 4,
        mergedGroups,
    });

    assert.deepEqual(Object.fromEntries(mergedGroups.map(({ id, row, column }) => [id, { row, column }])), {
        HEADER: { row: 1, column: 1 },
        RIGHT: { row: 2, column: 2 },
        LEFT: { row: 2, column: 1 },
    });
});

test('PaddleOcrClient exhausts strongly overlapping columns from left to right', () =>
{
    const client = new PaddleOcrClient();
    const blocks = [
        { id: 'RIGHT_1', text: 'Right 1', box: [220, 35, 300, 70] },
        { id: 'LEFT_1', text: 'Left 1', box: [0, 40, 80, 75] },
        { id: 'CENTER_1', text: 'Center 1', box: [110, 30, 190, 65] },
        { id: 'RIGHT_2', text: 'Right 2', box: [220, 80, 300, 115] },
        { id: 'LEFT_2', text: 'Left 2', box: [0, 85, 80, 120] },
        { id: 'CENTER_2', text: 'Center 2', box: [110, 75, 190, 110] },
    ];

    const orderedIds = client._orderBlocks(blocks, {
        pageWidth: 300,
        pageHeight: 150,
        alignmentTolerance: 0.02,
        horizontalOverlapFactor: 0.5,
        rowTolerance: 0.02,
        maximumEmptyToBlockRatio: 4,
    }).map((block) => block.id);

    assert.deepEqual(orderedIds, ['LEFT_1', 'LEFT_2', 'CENTER_1', 'CENTER_2', 'RIGHT_1', 'RIGHT_2']);
});

test('PaddleOcrClient measures line spacing between vertical centers', () =>
{
    const client = new PaddleOcrClient();
    const groups = client._groupLines([
        { id: 'L001', text: 'Première ligne', score: 1, box: [0, 0, 100, 20] },
        { id: 'L002', text: 'Deuxième ligne', score: 1, box: [0, 25, 100, 35] },
        { id: 'L003', text: 'Bloc suivant', score: 1, box: [0, 43, 100, 73] },
    ], { lineSpacingFactor: 0.75, horizontalOverlapFactor: 0.75 });

    assert.deepEqual(groups.map((group) => group.text), ['Première ligne\nDeuxième ligne\nBloc suivant']);
});

test('PaddleOcrClient splits an exceptional spacing after four regularly spaced lines', () =>
{
    const client = new PaddleOcrClient();
    const groups = client._groupLines([
        { id: 'L001', text: 'Ligne 1', score: 1, box: [0, 0, 100, 20] },
        { id: 'L002', text: 'Ligne 2', score: 1, box: [0, 25, 100, 45] },
        { id: 'L003', text: 'Ligne 3', score: 1, box: [0, 50, 100, 70] },
        { id: 'L004', text: 'Ligne 4', score: 1, box: [0, 75, 100, 95] },
        { id: 'L005', text: 'Ligne isolée', score: 1, box: [0, 110, 100, 130] },
    ], { lineSpacingFactor: 0.75, horizontalOverlapFactor: 0.75 });

    assert.deepEqual(groups.map((group) => group.text), ['Ligne 1\nLigne 2\nLigne 3\nLigne 4', 'Ligne isolée']);
});

test('PaddleOcrClient reinjects a contained orphan group at its original OCR position', () =>
{
    const client = new PaddleOcrClient();
    const groups = client._groupLines([
        { id: 'L001', text: 'Début justifié', score: 1, box: [0, 0, 100, 20] },
        { id: 'L002', text: 'mot orphelin', score: 1, box: [40, 30, 60, 40] },
        { id: 'L003', text: 'Fin justifiée', score: 1, box: [0, 25, 100, 50] },
    ], { lineSpacingFactor: 0.75, horizontalOverlapFactor: 0.75 });

    assert.equal(groups.length, 1);
    assert.equal(groups[0].text, 'Début justifié\nmot orphelin\nFin justifiée');
    assert.deepEqual(groups[0].box, [0, 0, 100, 50]);
});

test('PaddleOcrClient reinjects an orphan group covered at 95 percent', () =>
{
    const client = new PaddleOcrClient();
    const groups = client._groupLines([
        { id: 'L001', text: 'Début justifié', score: 1, box: [0, 0, 100, 20] },
        { id: 'L002', text: 'mot presque contenu', score: 1, box: [40, 30, 102, 40] },
        { id: 'L003', text: 'Fin justifiée', score: 1, box: [0, 25, 100, 50] },
    ], { lineSpacingFactor: 0.75, horizontalOverlapFactor: 0.75 });

    assert.equal(groups.length, 1);
    assert.equal(groups[0].text, 'Début justifié\nmot presque contenu\nFin justifiée');
    assert.deepEqual(groups[0].box, [0, 0, 102, 50]);
});