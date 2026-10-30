import { Log } from '../../app/Log.js';
import { createCanvas, loadImage } from 'canvas';
import fs from 'node:fs/promises';
import path from 'node:path';

export class OcrDiagnosticImageExporter
{
    constructor({ imageDirectory = '' } = {})
    {
        this.imageDirectory = imageDirectory;
    }

    async export(image, layout, logContext)
    {
        if (!this.imageDirectory)
        {
            return;
        }

        const stages = [
            { name: '01-ocr-blocks', items: layout.blocks, color: '#ff9900' },
            { name: '02-line-groups', items: layout.lineGroups, color: '#00a050' },
            { name: '03-column-groups', items: layout.columnGroups, color: '#0066ff' },
            { name: '04-rows-columns', items: layout.rowGroups, color: '#b000b5',
                getLabel: (group) => `row ${group.row} col ${group.col}` },
            { name: '05-reading-order', items: layout.groups, color: '#ff0000' },
        ];

        await Promise.all(stages.map(async ({ name, items, color, getLabel }) =>
        {
            const renderedImage = await this._render(image, items, color, getLabel);
            await this._save(renderedImage, name, logContext);
        }));
    }

    async _render(image, items, color, getLabel = (item) => item.id)
    {
        const source = await loadImage(image);
        const canvas = createCanvas(source.width, source.height);
        const context = canvas.getContext('2d');
        const lineWidth = Math.max(2, Math.round(Math.min(source.width, source.height) / 500));
        const fontSize = Math.max(12, Math.round(Math.min(source.width, source.height) / 60));
        context.drawImage(source, 0, 0);
        context.font = `bold ${fontSize}px sans-serif`;
        context.textBaseline = 'top';
        context.lineWidth = lineWidth;

        for (const item of items)
        {
            const [left, top, right, bottom] = item.box;
            const label = getLabel(item);
            const labelWidth = Math.ceil(context.measureText(label).width) + 6;
            const labelHeight = fontSize + 4;
            context.strokeStyle = color;
            context.strokeRect(left, top, right - left, bottom - top);
            context.fillStyle = color;
            context.fillRect(left, top, labelWidth, labelHeight);
            context.fillStyle = '#ffffff';
            context.fillText(label, left + 3, top + 2);
        }

        return canvas.toBuffer('image/png');
    }

    async _save(image, stage, logContext = {})
    {
        const documentName = path.parse(logContext.fileName ?? 'unknown-document').name.replace(/[^a-zA-Z0-9._-]+/g, '-');
        const page = logContext.pageNumber ? `page-${String(logContext.pageNumber).padStart(3, '0')}` : 'document';
        const documentDirectory = path.resolve(this.imageDirectory, documentName);
        const filePath = path.join(documentDirectory, `${page}-${stage}.png`);
        await fs.mkdir(documentDirectory, { recursive: true });
        await fs.writeFile(filePath, image);
        Log.info(`[OCR diagnostics] Saved ${stage} image: ${filePath}.`);
    }
}