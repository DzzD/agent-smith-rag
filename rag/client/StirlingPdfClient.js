import JSZip from 'jszip';
import { Log } from '../../app/Log.js';

export class StirlingPdfClient
{
    constructor({ url, convertToPdfRoute, convertPdfToImagesRoute } = {})
    {
        this.url = url;
        this.convertToPdfRoute = convertToPdfRoute;
        this.convertPdfToImagesRoute = convertPdfToImagesRoute;
    }

    async convertToPdf(file)
    {
        const startedAt = Date.now();
        Log.debug(`[StirlingPDF] Converting ${file.name} (${file.content.length} bytes) to PDF.`);
        const response = await this._postFile(this.convertToPdfRoute, file, {}, { fileName: file.name });
        const contentType = response.headers.get('content-type') || '';

        if (!contentType.includes('application/pdf'))
        {
            throw new Error('StirlingPDF does not support this document format.');
        }

        const pdf = Buffer.from(await response.arrayBuffer());
        Log.debug(`[StirlingPDF] PDF conversion completed in ${Date.now() - startedAt} ms (${pdf.length} bytes).`);
        return pdf;
    }

    async convertPdfToImages(pdf, { dpi = 300, fileName = 'document.pdf' } = {})
    {
        const startedAt = Date.now();
        Log.debug(`[StirlingPDF] Rendering PDF (${pdf.length} bytes) to page images at ${dpi} DPI.`);
        const response = await this._postFile(this.convertPdfToImagesRoute, {
            name: 'document.pdf',
            mimeType: 'application/pdf',
            content: pdf,
        }, {
            imageFormat: 'png',
            singleOrMultiple: 'multiple',
            dpi: String(dpi),
        }, { fileName });
        const contentType = response.headers.get('content-type') || '';
        const body = Buffer.from(await response.arrayBuffer());

        if (contentType.includes('application/zip') || body.subarray(0, 2).toString() === 'PK')
        {
            const extractionStartedAt = Date.now();
            const archive = await JSZip.loadAsync(body);
            const entries = Object.values(archive.files).filter((entry) => !entry.dir).sort((left, right) => left.name.localeCompare(right.name, undefined, { numeric: true }));
            const images = await Promise.all(entries.map(async (entry) => Buffer.from(await entry.async('uint8array'))));
            Log.debug(`[StirlingPDF] Extracted ${images.length} page image(s) in ${Date.now() - extractionStartedAt} ms.`);
            Log.debug(`[StirlingPDF] PDF rendering completed in ${Date.now() - startedAt} ms.`);
            return images;
        }

        if (contentType.startsWith('image/'))
        {
            Log.debug(`[StirlingPDF] PDF rendering completed in ${Date.now() - startedAt} ms (1 page image).`);
            return [body];
        }

        throw new Error('StirlingPDF PDF-to-image conversion returned an unsupported response.');
    }

    async _postFile(route, file, fields, logContext)
    {
        const form = new FormData();
        form.append('fileInput', new Blob([file.content], { type: file.mimeType }), file.name);

        for (const [name, value] of Object.entries(fields))
        {
            form.append(name, value);
        }

        let response;
        const startedAt = Date.now();
        Log.info(`[Stirling] Call ${route}: ${logContext.fileName}.`);

        try
        {
            response = await fetch(new URL(route, this.url), { method: 'POST', body: form });
        }
        catch (error)
        {
            throw new Error(`StirlingPDF conversion failed: ${error.message}`);
        }

        if (!response.ok)
        {
            const details = await response.text();
            throw new Error(`StirlingPDF conversion failed (${response.status}): ${details || response.statusText}`);
        }

        Log.debug(`[StirlingPDF] POST ${route} responded ${response.status} in ${Date.now() - startedAt} ms.`);
        return response;
    }
}
