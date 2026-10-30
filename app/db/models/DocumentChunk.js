/*
 * ONE-SHOT GENERATED FILE
 *
 * This file is generated once and can be freely modified.
 * You may add your own rules, methods, or overrides here.
 *
 * If this file is deleted, it can be generated again by re-running app-core.
 */

import { CoreDocumentChunk } from '../../../core/db/models/CoreDocumentChunk.js';
import { PageChunk } from './PageChunk.js';
import { DbManager } from '../DbManager.js';

export class DocumentChunk extends CoreDocumentChunk
{
	// Recalcule le tsvector lexical enrichi (searchable_text) des clusters d'un document.
	// À rappeler après toute écriture modifiant le contenu d'un cluster, ses références de
	// chunks, le nom du document, sa description ou les descriptions des pages associées.
	// Recalcule le tsvector lexical enrichi (searchable_text) d'un cluster après chaque écriture,
	// quel que soit le chemin (replaceForDocument, save direct). Le calcul inclut le nom et la
	// description du document ainsi que les descriptions des pages référencées, comme dans la recherche.
	async save(forceInsert = false)
	{
		const result = await super.save(forceInsert);

		if (result && this.uuid && this.documentUuid)
		{
			await DocumentChunk.refreshSearchableTextForChunk(this.uuid, this._connectionUid);
		}

		return result;
	}

	static async refreshSearchableTextForChunk(chunkUuid, connectionUid = 'default')
	{
		const connector = DbManager.getConnector('rag_server', connectionUid);

		await connector.query(`
			UPDATE document_chunk
			SET searchable_text =
				setweight(to_tsvector('simple', document_chunk.content), 'A')
				|| setweight(to_tsvector('simple', document.original_filename), 'B')
				|| setweight(to_tsvector('simple', COALESCE(document.description, '')), 'C')
				|| setweight(to_tsvector('simple', COALESCE((
					SELECT STRING_AGG(COALESCE(document_page.description, ''), ' ')
					FROM unnest(ARRAY[document_chunk.page_chunk_uuid_1, document_chunk.page_chunk_uuid_2,
						document_chunk.page_chunk_uuid_3, document_chunk.page_chunk_uuid_4]) WITH ORDINALITY AS member(page_chunk_uuid, unnestIdx)
					INNER JOIN page_chunk ON page_chunk.uuid = member.page_chunk_uuid
					INNER JOIN document_page ON document_page.uuid = page_chunk.page_uuid
				), '')), 'B')
			FROM document
			WHERE document.uuid = document_chunk.document_uuid
				AND document_chunk.uuid = $1::uuid
		`, [chunkUuid]);
	}

	static async refreshSearchableText(documentUuid, connectionUid = 'default')
	{
		const connector = DbManager.getConnector('rag_server', connectionUid);

		await connector.query(`
			UPDATE document_chunk
			SET searchable_text =
				setweight(to_tsvector('simple', document_chunk.content), 'A')
				|| setweight(to_tsvector('simple', document.original_filename), 'B')
				|| setweight(to_tsvector('simple', COALESCE(document.description, '')), 'C')
				|| setweight(to_tsvector('simple', COALESCE((
					SELECT STRING_AGG(COALESCE(document_page.description, ''), ' ')
					FROM unnest(ARRAY[document_chunk.page_chunk_uuid_1, document_chunk.page_chunk_uuid_2,
						document_chunk.page_chunk_uuid_3, document_chunk.page_chunk_uuid_4]) WITH ORDINALITY AS member(page_chunk_uuid, unnestIdx)
					INNER JOIN page_chunk ON page_chunk.uuid = member.page_chunk_uuid
					INNER JOIN document_page ON document_page.uuid = page_chunk.page_uuid
				), '')), 'B')
			FROM document
			WHERE document.uuid = document_chunk.document_uuid
				AND document_chunk.document_uuid = $1::uuid
		`, [documentUuid]);
	}

	buildWindows(pageChunks)
	{
		const windows = [];

		for (let start = 0; start < pageChunks.length; start += 2)
		{
			windows.push(pageChunks.slice(start, start + 4));
		}

		return windows;
	}

	async buildDrafts(pageChunks, options)
	{
		const normalizer = new PageChunk();
		const windows = this.buildWindows(pageChunks).map((chunks, chunkIndex) => ({ chunks, chunkIndex,
			content: chunks.map((chunk) => chunk.content).join('\n') }));

		if (windows.length === 0)
		{
			return [];
		}

		const embeddings = await options.embeddingClient.createEmbeddings(windows.map(({ content }) => content), options.logContext);
		return windows.map(({ chunks, chunkIndex, content }, index) => ({ chunkIndex, pageChunkUuids: chunks.map((chunk) => chunk.uuid), content,
			characterCount: content.length, tokenCount: normalizer.estimateTokenCount(content), embedding: normalizer.normalizeVector(embeddings[index]) }));
	}

	async replaceForDocument(documentUuid, pageChunks, options, connectionUid)
	{
		const existing = new DocumentChunk(connectionUid);
		const existingUuids = [];
		await existing.search('"document_uuid" = $1', [documentUuid]);

		while (await existing.next())
		{
			existingUuids.push(existing.uuid);
		}

		for (const uuid of existingUuids)
		{
			const documentChunk = new DocumentChunk(connectionUid);
			documentChunk.uuid = uuid;
			await documentChunk.delete();
		}

		const drafts = await this.buildDrafts(pageChunks, options);

		for (const draft of drafts)
		{
			const documentChunk = new DocumentChunk(connectionUid);
			documentChunk.documentUuid = documentUuid;
			documentChunk.chunkIndex = draft.chunkIndex;
			for (let memberIndex = 0; memberIndex < 4; memberIndex++)
			{
				documentChunk[`pageChunkUuid${memberIndex + 1}`] = draft.pageChunkUuids[memberIndex] ?? null;
			}
			documentChunk.content = draft.content;
			documentChunk.characterCount = draft.characterCount;
			documentChunk.tokenCount = draft.tokenCount;
			documentChunk.embedding = `[${draft.embedding.join(',')}]`;
			documentChunk.embeddingModel = options.embeddingClient.model;
			documentChunk.metadata = {};
			await documentChunk.save(true);
		}

		await DocumentChunk.refreshSearchableText(documentUuid, connectionUid);

		return drafts;
	}
}
