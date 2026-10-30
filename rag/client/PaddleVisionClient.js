import { Log } from '../../app/Log.js';
import { createCanvas, loadImage } from 'canvas';
import fs from 'node:fs/promises';
import path from 'node:path';

export class PaddleVisionClient
{
    constructor({ imageDirectory = '' } = {})
    {
        this.imageDirectory = imageDirectory;
    }

    async saveResultImage({ image, blocks, logContext })
    {
        if (!this.imageDirectory)
        {
            return;
        }

        const resultImage = await this._renderAnnotatedImage(image, blocks, (block) => block.id);
        await this._saveImage(resultImage, 'result', logContext);
    }

    async saveRawOcrBlocksImage({ image, blocks, logContext })
    {
        if (!this.imageDirectory)
        {
            return;
        }

        const blocksImage = await this._renderAnnotatedImage(image, blocks, (block) => block.id, () => '#ff9900');
        await this._saveImage(blocksImage, 'raw-ocr-blocks', logContext);
    }

    async saveLineGroupsImage({ image, groups, logContext })
    {
        if (!this.imageDirectory)
        {
            return;
        }

        const groupsImage = await this._renderAnnotatedImage(image, groups, (group) => group.id, () => '#00a050');
        await this._saveImage(groupsImage, 'line-groups', logContext);
    }

    async saveGroupsBeforeFlatteningImage({ image, groups, logContext })
    {
        if (!this.imageDirectory)
        {
            return;
        }

        const groupsImage = await this._renderAnnotatedImage(
            image,
            groups,
            (group) => `ROW ${group.row} / COL ${group.column}`,
            () => '#0066ff');
        await this._saveImage(groupsImage, 'groups-before-flattening', logContext);
    }

    async _renderAnnotatedImage(image, blocks, getLabel, getColor = () => '#ff0000')
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

        for (const block of blocks)
        {
            const [left, top, right, bottom] = block.box;
            const label = getLabel(block);
            const color = getColor(block);
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

    async _saveImage(image, operation, logContext = {})
    {
        if (!this.imageDirectory)
        {
            return;
        }

        const documentName = path.parse(logContext.fileName ?? 'unknown-document').name.replace(/[^a-zA-Z0-9._-]+/g, '-');
        const page = logContext.pageNumber ? `page-${String(logContext.pageNumber).padStart(3, '0')}` : 'document';
        const filePath = path.resolve(this.imageDirectory, `${documentName}-${page}-${operation}.png`);
        await fs.mkdir(path.dirname(filePath), { recursive: true });
        await fs.writeFile(filePath, image);
        Log.info(`[Vision] Saved ${operation} image: ${filePath}.`);
    }

    _formatLogTarget(logContext = {})
    {
        const page = logContext.pageNumber ? `page ${logContext.pageNumber}${logContext.pageCount ? `/${logContext.pageCount}` : ''}` : 'document';
        return `${logContext.fileName ?? 'unknown file'}, ${page}`;
    }
}