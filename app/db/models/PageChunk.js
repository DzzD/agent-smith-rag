/*
 * ONE-SHOT GENERATED FILE
 *
 * This file is generated once and can be freely modified.
 * You may add your own rules, methods, or overrides here.
 *
 * If this file is deleted, it can be generated again by re-running app-core.
 */

import { CorePageChunk } from '../../../core/db/models/CorePageChunk.js';

export class PageChunk extends CorePageChunk
{
	estimateTokenCount(content)
	{
		return Buffer.byteLength(content, 'utf8');
	}

	splitBlocks(blocks, { embeddingChunkSize, maxEmbeddingTokens })
	{
		const ordered = blocks.filter((block) => typeof block.content === 'string' && block.content.length > 0);
		const sections = [];
		let section = [];

		for (const block of ordered)
		{
			if (block.type === 'title' && section.length > 0)
			{
				sections.push(section);
				section = [];
			}

			section.push({ content: block.content, isTitle: block.type === 'title' });
		}

		if (section.length > 0 || sections.length === 0)
		{
			sections.push(section);
		}

		const fits = (content) => content.length <= embeddingChunkSize
			&& this.estimateTokenCount(content) <= maxEmbeddingTokens;
		const join = (parts) => parts.map((part) => part.content).join('\n');
		const splitText = (content, separators = [/\n\n+/g, /(?<=[.!?])\s+/gu, /\s+/gu]) =>
		{
			if (fits(content))
			{
				return [content];
			}

			for (const separator of separators)
			{
				const boundaries = [...content.matchAll(separator)].map((match) => match.index + match[0].length)
					.filter((index) => index > 0 && index < content.length);

				if (boundaries.length > 0)
				{
					const middle = content.length / 2;
					const boundary = boundaries.reduce((best, current) => Math.abs(current - middle) < Math.abs(best - middle) ? current : best);
					return [...splitText(content.slice(0, boundary), separators), ...splitText(content.slice(boundary), separators)];
				}
			}

			const maximumLength = Math.max(1, Math.min(embeddingChunkSize, maxEmbeddingTokens));
			const middle = Math.min(maximumLength, Math.ceil(content.length / 2));
			return [...splitText(content.slice(0, middle), []), ...splitText(content.slice(middle), [])];
		};
		const splitSection = (parts) =>
		{
			const content = join(parts);

			if (fits(content))
			{
				return [content];
			}

			if (parts.length === 1)
			{
				return splitText(parts[0].content);
			}

			if (parts.length === 2 && parts[0].isTitle)
			{
				const fragments = splitText(parts[1].content);
				const titledFragment = `${parts[0].content}\n${fragments[0]}`;

				if (fits(titledFragment))
				{
					fragments[0] = titledFragment;
					return fragments;
				}

				return splitText(content);
			}

			let splitIndex = Math.ceil(parts.length / 2);

			if (splitIndex === 1 && parts.length > 2)
			{
				splitIndex = 2;
			}

			return [...splitSection(parts.slice(0, splitIndex)), ...splitSection(parts.slice(splitIndex))];
		};
		const fragments = sections.flatMap(splitSection);
		const chunks = [];

		for (const fragment of fragments)
		{
			const merged = chunks.length > 0 ? `${chunks.at(-1)}\n${fragment}` : fragment;

			if (chunks.length > 0 && fits(merged))
			{
				chunks[chunks.length - 1] = merged;
			}
			else
			{
				chunks.push(fragment);
			}
		}

		return chunks.length > 0 ? chunks : [''];
	}

	normalizeVector(vector)
	{
		if (!Array.isArray(vector) || vector.length === 0 || vector.some((value) => !Number.isFinite(value)))
		{
			throw new Error('Embedding vectors must contain finite numeric values.');
		}

		const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));

		if (norm === 0)
		{
			throw new Error('Embedding vectors must have a positive L2 norm.');
		}

		return vector.map((value) => value / norm);
	}

	async buildDrafts(blocks, options)
	{
		const contents = this.splitBlocks(blocks, options)
			.map((content, chunkIndex) => ({ content, chunkIndex }))
			.filter(({ content }) => content.trim());

		if (contents.length === 0)
		{
			return [];
		}

		const embeddings = await options.embeddingClient.createEmbeddings(contents.map(({ content }) => content), options.logContext);
		return contents.map(({ content, chunkIndex }, index) => ({ chunkIndex, content, characterCount: content.length,
			tokenCount: this.estimateTokenCount(content), embedding: this.normalizeVector(embeddings[index]) }));
	}

	async replaceForPage(pageUuid, drafts, embeddingModel, connectionUid)
	{
		const existing = new PageChunk(connectionUid);
		const existingUuids = [];

		try
		{
			await existing.search('"page_uuid" = $1', [pageUuid]);

			while (await existing.next())
			{
				existingUuids.push(existing.uuid);
			}
		}
		catch (error)
		{
			throw error;
		}

		for (const uuid of existingUuids)
		{
			const chunk = new PageChunk(connectionUid);
			chunk.uuid = uuid;
			await chunk.delete();
		}

		const savedChunks = [];

		for (const draft of drafts)
		{
			const chunk = new PageChunk(connectionUid);
			chunk.pageUuid = pageUuid;
			chunk.chunkIndex = draft.chunkIndex;
			chunk.content = draft.content;
			chunk.characterCount = draft.characterCount;
			chunk.tokenCount = draft.tokenCount;
			chunk.embedding = `[${draft.embedding.join(',')}]`;
			chunk.embeddingModel = embeddingModel;
			chunk.metadata = {};
			await chunk.save(true);
			savedChunks.push({ uuid: chunk.uuid, pageUuid, chunkIndex: chunk.chunkIndex, content: chunk.content });
		}

		return savedChunks;
	}
}
