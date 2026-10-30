import { Log } from '../../app/Log.js';

export class MistralDocumentClient
{
    constructor({ visionUrl, visionApiKey, visionModel, chatUrl, chatApiKey, chatModel, descriptionLanguage } = {})
    {
        this.visionUrl = visionUrl;
        this.visionApiKey = visionApiKey;
        this.visionModel = visionModel;
        this.chatUrl = chatUrl;
        this.chatApiKey = chatApiKey;
        this.chatModel = chatModel;
        this.descriptionLanguage = descriptionLanguage;
    }

    async describeDocument({ originalFilename, mimeType, pages, userDescription }, logContext)
    {
        const inputs = pages.map((text, index) => `Page ${index + 1}:\n${text}`);
        const summaries = [];
        let batch = [];
        let batchLength = 0;
        const maxInputCharacters = 120000;

        for (const input of inputs)
        {
            if (batch.length > 0 && batchLength + input.length > maxInputCharacters)
            {
                summaries.push(await this._summarizeDocumentContent(originalFilename, mimeType, batch.join('\n\n'), true, logContext));
                batch = [];
                batchLength = 0;
            }

            if (input.length > maxInputCharacters)
            {
                for (let offset = 0; offset < input.length; offset += maxInputCharacters)
                {
                    summaries.push(await this._summarizeDocumentContent(originalFilename, mimeType, input.slice(offset, offset + maxInputCharacters), true, logContext));
                }
            }
            else
            {
                batch.push(input);
                batchLength += input.length;
            }
        }

        if (batch.length > 0)
        {
            summaries.push(batch.join('\n\n'));
        }

        while (summaries.join('\n\n').length > maxInputCharacters)
        {
            const nextSummaries = [];
            let summaryBatch = [];
            let summaryLength = 0;

            for (const summary of summaries)
            {
                if (summaryBatch.length > 0 && summaryLength + summary.length > maxInputCharacters)
                {
                    nextSummaries.push(await this._summarizeDocumentContent(originalFilename, mimeType, summaryBatch.join('\n\n'), true, logContext));
                    summaryBatch = [];
                    summaryLength = 0;
                }

                summaryBatch.push(summary);
                summaryLength += summary.length;
            }

            if (summaryBatch.length > 0)
            {
                nextSummaries.push(await this._summarizeDocumentContent(originalFilename, mimeType, summaryBatch.join('\n\n'), true, logContext));
            }

            summaries.splice(0, summaries.length, ...nextSummaries);
        }

        return await this._summarizeDocumentContent(originalFilename, mimeType, summaries.join('\n\n'), false, logContext, userDescription);
    }

    async describePage(image, mimeType, ocrContent, logContext)
    {
        const response = await this._post('/v1/chat/completions', {
            model: this.visionModel,
            temperature: 0,
            max_tokens: 180,
            messages: [{ role: 'system', content: `Réponds exclusivement en ${this.descriptionLanguage}. N'utilise aucun titre ni mot anglais.` }, {
                role: 'user',
                content: [
                    { type: 'text', text: 'Décris le contexte global de cette page pour la recherche sémantique en 2 phrases et 60 mots maximum. '
                        + 'Indique uniquement la nature de la page, son sujet principal, son objectif et, si utile, sa structure générale. '
                        + 'Ne retranscris pas le contenu, ne dresse aucune liste exhaustive de noms, dates, chiffres ou rubriques et ne répète pas le texte OCR. '
                        + 'Le texte OCR ci-dessous sert seulement à comprendre le contexte; l’image reste la source de vérité. N’invente rien.\n\n'
                        + `Texte OCR validé :\n${ocrContent}` },
                    { type: 'image_url', image_url: this._dataUrl(image, mimeType) },
                ],
            }],
        }, 'page vision description', this.visionUrl, this.visionApiKey, logContext);
        const description = response.choices?.[0]?.message?.content;

        if (typeof description !== 'string' || !description.trim())
        {
            throw new Error('Page description failed: no description returned.');
        }

        return this._limitDescription(description, 60);
    }

    async _summarizeDocumentContent(originalFilename, mimeType, content, intermediate, logContext, userDescription)
    {
        const instruction = intermediate
            ? 'Condense le contenu fourni en conservant uniquement le contexte global nécessaire à une description ultérieure : nature, sujet principal, '
                + 'objectif, public et thèmes majeurs. Écarte les détails, exemples, listes, chiffres et répétitions.'
            : 'Décris le contexte global de ce document pour la recherche sémantique en 3 phrases et 100 mots maximum. Indique sa nature, son sujet principal, '
                + 'son objectif, son public et ses thèmes majeurs. Ne résume pas chaque page, ne retranscris pas le contenu et ne dresse aucune liste exhaustive '
                + 'de noms, dates, chiffres ou rubriques. N’invente rien.';
        const userContext = !intermediate && userDescription
            ? `\n\nContexte fourni par l'utilisateur :\n${userDescription}\nPrends ce contexte en compte sans le recopier aveuglément. `
                + 'Conserve explicitement et sans les reformuler les mots-clés pertinents qu’il contient, notamment les noms propres, acronymes, références, '
                + 'noms de projets et termes métier. Intègre ces mots-clés dans la description finale sans les diluer. '
                + 'Confronte les autres informations au contenu du document et n’ajoute pas d’information non étayée.'
            : '';
        const response = await this._post('/v1/chat/completions', {
            model: this.chatModel,
            temperature: 0,
            max_tokens: intermediate ? 600 : 260,
            messages: [{ role: 'system', content: `Réponds exclusivement en ${this.descriptionLanguage}. N'utilise aucun titre ni mot anglais.` }, {
                role: 'user',
                content: `${instruction}\n\nNom original du fichier : ${originalFilename}\nType du document : ${mimeType}${userContext}\n\n${content}`,
            }],
        }, intermediate ? 'intermediate document summary' : 'document description', this.chatUrl, this.chatApiKey, logContext);
        const description = response.choices?.[0]?.message?.content;

        if (typeof description !== 'string' || !description.trim())
        {
            throw new Error('Document description failed: no description returned.');
        }

        return this._limitDescription(description, intermediate ? 250 : 100);
    }

    _limitDescription(description, maxWords)
    {
        const words = description.trim().split(/\s+/);

        if (words.length <= maxWords)
        {
            return words.join(' ');
        }

        return `${words.slice(0, maxWords).join(' ').replace(/[.,;:!?]+$/u, '')}…`;
    }

    async _post(route, body, operation, url, apiKey, logContext = null)
    {
        if (url === this.visionUrl)
        {
            Log.info(`[Vision] Call ${operation}: ${this._formatLogTarget(logContext)}.`);
        }

        const request = {
            method: 'POST',
            headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        };
        let response = await this._fetch(route, request, operation, url);

        if (response.status === 429)
        {
            Log.warn(`[Mistral] ${operation} rate limited; retrying once in 30000 ms.`);
            await this._wait(30000);
            response = await this._fetch(route, request, operation, url);
        }

        if (!response.ok)
        {
            throw new Error(`Mistral ${operation} failed (${response.status}): ${await response.text()}`);
        }

        return await response.json();
    }

    async _fetch(route, request, operation, url)
    {
        try
        {
            return await fetch(new URL(route, url), request);
        }
        catch (error)
        {
            throw new Error(`Mistral ${operation} failed: ${error.message}`);
        }
    }

    async _wait(milliseconds)
    {
        await new Promise((resolve) => setTimeout(resolve, milliseconds));
    }

    _formatLogTarget(logContext = {})
    {
        const page = logContext?.pageNumber ? `page ${logContext.pageNumber}${logContext.pageCount ? `/${logContext.pageCount}` : ''}` : 'document';
        return `${logContext?.fileName ?? 'unknown file'}, ${page}`;
    }

    _dataUrl(buffer, mimeType)
    {
        return `data:${mimeType};base64,${buffer.toString('base64')}`;
    }

}
