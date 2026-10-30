import { Log } from '../../app/Log.js';

export class EmbeddingClient
{
    constructor({ url, apiKey, model, batchSize = 64 } = {})
    {
        this.url = url;
        this.apiKey = apiKey;
        this.model = model;
        this.batchSize = batchSize;
    }

    async createEmbedding(input, logContext)
    {
        return (await this.createEmbeddings([input], logContext))[0];
    }

    async createEmbeddings(inputs, logContext)
    {
        if (!Array.isArray(inputs) || inputs.length === 0 || inputs.some((input) => typeof input !== 'string' || !input.trim()))
        {
            throw new Error('Embedding inputs must be a non-empty array of non-empty strings.');
        }

        const embeddings = [];

        for (let offset = 0; offset < inputs.length; offset += this.batchSize)
        {
            embeddings.push(...await this._createEmbeddingBatch(inputs.slice(offset, offset + this.batchSize), logContext));
        }

        return embeddings;
    }

    async _createEmbeddingBatch(inputs, logContext)
    {
        const startedAt = Date.now();
        const characterCount = inputs.reduce((total, input) => total + input.length, 0);
        Log.debug(`[Embedding] Request started with model ${this.model} (${inputs.length} inputs, ${characterCount} characters).`);
        let target = logContext?.operation ?? 'content';

        if (logContext?.fileName)
        {
            const page = logContext.pageNumber ? `page ${logContext.pageNumber}${logContext.pageCount ? `/${logContext.pageCount}` : ''}` : 'document';
            target = `${logContext.fileName}, ${page}`;
        }

        Log.info(`[Embedding] Call: ${target}.`);

        try
        {
            const response = await fetch(new URL('/v1/embeddings', this.url), {
                method: 'POST',
                headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ model: this.model, input: inputs, encoding_format: 'float' }),
            });

            Log.debug(`[Embedding] Response ${response.status} received in ${Date.now() - startedAt} ms.`);

            if (!response.ok)
            {
                throw new Error(`Embedding failed (${response.status}): ${await response.text()}`);
            }

            const payload = await response.json();
            const data = payload.data;

            if (!Array.isArray(data) || data.length !== inputs.length)
            {
                throw new Error(`Embedding failed: expected ${inputs.length} vectors, received ${data?.length ?? 0}.`);
            }

            const embeddings = [...data].sort((left, right) => left.index - right.index).map((item) => item.embedding);

            if (embeddings.some((embedding) => !Array.isArray(embedding) || embedding.length === 0
                || embedding.some((value) => !Number.isFinite(value))))
            {
                throw new Error('Embedding failed: one or more invalid embeddings returned.');
            }

            const returnedModel = payload.model ?? this.model;

            if (returnedModel !== this.model)
            {
                throw new Error(`Embedding model mismatch: expected "${this.model}", received "${returnedModel}".`);
            }

            Log.debug(`[Embedding] Generated ${embeddings.length} ${embeddings[0].length}-dimension vector(s) with model ${this.model}.`);
            return embeddings;
        }
        catch (error)
        {
            throw new Error(`Embedding failed: ${error.message}`, { cause: error });
        }
    }
}
