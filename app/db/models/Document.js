/*
 * ONE-SHOT GENERATED FILE
 *
 * This file is generated once and can be freely modified.
 * You may add your own rules, methods, or overrides here.
 *
 * If this file is deleted, it can be generated again by re-running app-core.
 */

import { CoreDocument } from '../../../core/db/models/CoreDocument.js';
import { DocumentPage } from './DocumentPage.js';
import { DocumentChunk } from './DocumentChunk.js';
import { PageChunk } from './PageChunk.js';
import { Log } from '../../Log.js';
import { createHash, randomUUID } from 'node:crypto';
import { fileTypeFromBuffer } from 'file-type';
import { DbManager } from '../DbManager.js';
import { DbQueryAuthorizedDomain } from '../queries/DbQueryAuthorizedDomain.js';
import { DbQueryAuthorizedDocument } from '../queries/DbQueryAuthorizedDocument.js';
import { DbQueryAuthorizedDocumentList } from '../queries/DbQueryAuthorizedDocumentList.js';
import { DbQueryDocumentChunkSearch } from '../queries/DbQueryDocumentChunkSearch.js';

export const DOCUMENT_REINDEX_VERSION = 5;

export class Document extends CoreDocument
{
	static async list({ name = '', pageSize = 50, pageNumber = 1 }, bearer)
	{
		if (typeof name !== 'string')
		{
			throw new Error('name must be a string.');
		}

		if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 200)
		{
			throw new Error('pageSize must be an integer between 1 and 200.');
		}

		if (!Number.isInteger(pageNumber) || pageNumber < 1)
		{
			throw new Error('pageNumber must be a positive integer.');
		}

		try
		{
			new RegExp(name, 'i');
		}
		catch
		{
			throw new Error('name must be a valid regular expression.');
		}

		const query = new DbQueryAuthorizedDocumentList();

		try
		{
			await query.search(null, [bearer.uuid, name, pageSize, (pageNumber - 1) * pageSize]);
			const documents = [];
			let totalCount = 0;
			let row;

			while ((row = await query.next()))
			{
				const document = query.document;
				totalCount = Number(row.total_count);
				documents.push({
					uuid: document.uuid,
					name: document.originalFilename,
					domain: row.domain_uid,
					pageCount: document.pageCount,
					createdAt: document.createdAt,
					updatedAt: document.updatedAt,
				});
			}

			return { documents, pageSize, pageNumber, totalCount };
		}
		finally
		{
			query.close();
		}
	}

	static async reindex(documentUuid, options)
	{
		const sourceDocument = new Document();
		let source;
		let blockCountBefore = 0;

		try
		{
			await sourceDocument.search('"uuid" = $1', [documentUuid], { limit: 1 });

			if (!(await sourceDocument.next()))
			{
				throw new Error('Document not found.');
			}

			source = {
				uuid: sourceDocument.uuid,
				originalFilename: sourceDocument.originalFilename,
				originalContent: Buffer.from(sourceDocument.originalContent),
				metadata: sourceDocument.metadata,
			};
		}
		finally
		{
			sourceDocument.close();
		}

		const existingPagesBeforeReindex = new DocumentPage();

		try
		{
			await existingPagesBeforeReindex.search('"document_uuid" = $1', [source.uuid]);

			while (await existingPagesBeforeReindex.next())
			{
				blockCountBefore += existingPagesBeforeReindex.getBlockCount();
			}
		}
		finally
		{
			existingPagesBeforeReindex.close();
		}

		const parsedFile = await Document.parseFile({ name: source.originalFilename, dataBase64: source.originalContent.toString('base64') });
		Log.info(`[Document][reindex] Rendering ${parsedFile.name} (${parsedFile.mimeType}) to page images.`);
		const renderedPageImages = await Document.buildPageImages(parsedFile, options);
		const pageImages = options.maxPages === null || options.maxPages === undefined
			? renderedPageImages
			: renderedPageImages.slice(0, options.maxPages);
		const processedPages = [];
		Log.info(`[Document][reindex] Processing ${pageImages.length} page(s) in batches of ${options.pageProcessingBatchSize}.`);

		for (let offset = 0; offset < pageImages.length; offset += options.pageProcessingBatchSize)
		{
			const batch = pageImages.slice(offset, offset + options.pageProcessingBatchSize);
			const batchNumber = Math.floor(offset / options.pageProcessingBatchSize) + 1;
			const batchCount = Math.ceil(pageImages.length / options.pageProcessingBatchSize);
			Log.info(`[Document][reindex] Starting page batch ${batchNumber}/${batchCount} (${offset + 1}-${offset + batch.length}).`);
			const processedBatch = await Promise.all(batch.map(async (pageImage, batchIndex) =>
			{
				const pageNumber = offset + batchIndex + 1;
				const page = new DocumentPage();
				const logContext = { fileName: parsedFile.name, pageNumber, pageCount: pageImages.length };
				await page.processImage(pageImage, { ...options, logContext });
				await page.buildChunks({ ...options, logContext });
				return page;
			}));

			processedPages.push(...processedBatch);
			Log.info(`[Document][reindex] Page batch ${batchNumber}/${batchCount} completed (${processedPages.length}/${pageImages.length} pages).`);
		}

		const description = await options.mistralClient.describeDocument({
			originalFilename: parsedFile.name,
			mimeType: parsedFile.mimeType,
			pages: processedPages.map((page) => page.ocrEnriched),
		}, { fileName: parsedFile.name });
		const descriptionEmbedding = await options.embeddingClient.createEmbedding(`${parsedFile.name} : ${description}`, { fileName: parsedFile.name });
		const connectionUid = `document-reindex-${randomUUID()}`;
		const connector = DbManager.getConnector('rag_server', connectionUid);
		let transactionOpened = false;

		try
		{
			await connector.beginTransaction();
			transactionOpened = true;
			const document = new Document(connectionUid);
			await document.search('"uuid" = $1', [source.uuid], { limit: 1 });

			if (!(await document.next()))
			{
				throw new Error('Document no longer exists.');
			}

			const existingPages = new DocumentPage(connectionUid);
			await existingPages.search('"document_uuid" = $1', [source.uuid]);
			const existingPageUuids = [];

			while (await existingPages.next())
			{
				existingPageUuids.push(existingPages.uuid);
			}

			for (const pageUuid of existingPageUuids)
			{
				const page = new DocumentPage(connectionUid);
				page.uuid = pageUuid;
				await page.delete();
			}

			document.name = parsedFile.name;
			document.originalFilename = parsedFile.name;
			document.mimeType = parsedFile.mimeType;
			document.binarySha256 = createHash('sha256').update(parsedFile.content).digest('hex');
			document.pageCount = processedPages.length;
			document.description = description;
			document.descriptionEmbedding = `[${descriptionEmbedding.join(',')}]`;
			document.descriptionEmbeddingModel = options.embeddingClient.model;
			document.metadata = {
				...(source.metadata ?? {}),
				reindex: {
					version: DOCUMENT_REINDEX_VERSION,
					completedAt: new Date().toISOString(),
				},
			};
			await document.save();

			const savedChunks = [];

			for (let index = 0; index < processedPages.length; index++)
			{
				savedChunks.push(...await processedPages[index].saveProcessed(document.uuid, index + 1, options.embeddingClient.model, connectionUid));
			}

			await new DocumentChunk(connectionUid).replaceForDocument(document.uuid, savedChunks, options, connectionUid);

			await connector.commit();
			transactionOpened = false;

			return { documentUuid: document.uuid, originalFilename: document.originalFilename, pageCount: document.pageCount,
				blockCountBefore, blockCountAfter: processedPages.reduce((total, page) => total + page.getBlockCount(), 0) };
		}
		catch (error)
		{
			if (transactionOpened)
			{
				try
				{
					await connector.rollback();
				}
				catch (rollbackError)
				{
					throw new AggregateError([error, rollbackError], 'Document reindexing and rollback failed.');
				}
			}

			throw error;
		}
		finally
		{
			connector.close();
		}
	}

	static async reindexFromStoredPageImages(documentUuid, options)
	{
		const sourceDocument = new Document();
		let source;

		try
		{
			await sourceDocument.search('"uuid" = $1', [documentUuid], { limit: 1 });

			if (!(await sourceDocument.next()))
			{
				throw new Error('Document not found.');
			}

			source = {
				uuid: sourceDocument.uuid,
				originalFilename: sourceDocument.originalFilename,
				mimeType: sourceDocument.mimeType,
				metadata: sourceDocument.metadata,
			};
		}
		finally
		{
			sourceDocument.close();
		}

		const sourcePages = new DocumentPage();
		const storedPages = [];

		try
		{
			await sourcePages.search('"document_uuid" = $1', [source.uuid], { order: '"page_number"' });

			while (await sourcePages.next())
			{
				storedPages.push({
					uuid: sourcePages.uuid,
					pageNumber: sourcePages.pageNumber,
					imageContent: Buffer.from(sourcePages.imageContent),
					imageMimeType: sourcePages.imageMimeType,
					pixelWidth: sourcePages.pixelWidth,
					pixelHeight: sourcePages.pixelHeight,
					dpi: sourcePages.dpi,
					blockCount: sourcePages.getBlockCount(),
				});
			}
		}
		finally
		{
			sourcePages.close();
		}

		const pagesToProcess = options.maxPages === null || options.maxPages === undefined
			? storedPages
			: storedPages.slice(0, options.maxPages);
		const processedPages = [];
		Log.info(`[Document][reindex] Processing ${pagesToProcess.length} stored page image(s) in batches of ${options.pageProcessingBatchSize}.`);

		for (let offset = 0; offset < pagesToProcess.length; offset += options.pageProcessingBatchSize)
		{
			const batch = pagesToProcess.slice(offset, offset + options.pageProcessingBatchSize);
			const processedBatch = await Promise.all(batch.map(async (storedPage) =>
			{
				const page = new DocumentPage();
				const logContext = { fileName: source.originalFilename, pageNumber: storedPage.pageNumber, pageCount: storedPages.length };
				await page.processImage({ content: storedPage.imageContent, mimeType: storedPage.imageMimeType, dpi: storedPage.dpi }, {
					...options,
					dpi: storedPage.dpi,
					logContext,
				});
				await page.buildChunks({ ...options, logContext });
				return { page, storedPage };
			}));

			processedPages.push(...processedBatch);
		}

		const description = await options.mistralClient.describeDocument({
			originalFilename: source.originalFilename,
			mimeType: source.mimeType,
			pages: processedPages.map(({ page }) => page.ocrEnriched),
		}, { fileName: source.originalFilename });
		const descriptionEmbedding = await options.embeddingClient.createEmbedding(
			`${source.originalFilename} : ${description}`, { fileName: source.originalFilename });
		const connectionUid = `stored-page-reindex-${randomUUID()}`;
		const connector = DbManager.getConnector('rag_server', connectionUid);
		let transactionOpened = false;

		try
		{
			await connector.beginTransaction();
			transactionOpened = true;
			const savedChunks = [];

			for (const { page: processedPage, storedPage } of processedPages)
			{
				const page = new DocumentPage(connectionUid);
				await page.load(storedPage.uuid);
				page.ocrRaw = processedPage.ocrRaw;
				page.ocrEnriched = processedPage.ocrEnriched;
				page.blocks = processedPage.blocks;
				page.description = processedPage.description;
				page.descriptionEmbeddingModel = processedPage._descriptionEmbeddingVector === null ? null : options.embeddingClient.model;
				page.descriptionEmbedding = processedPage._descriptionEmbeddingVector === null
					? null
					: `[${processedPage._descriptionEmbeddingVector.join(',')}]`;
				page.metadata = processedPage.metadata;
				await page.save();
				const pageChunk = new PageChunk(connectionUid);
				savedChunks.push(...await pageChunk.replaceForPage(page.uuid, processedPage._chunkDrafts,
					options.embeddingClient.model, connectionUid));
			}

			const document = new Document(connectionUid);
			await document.search('"uuid" = $1', [source.uuid], { limit: 1 });

			if (!(await document.next()))
			{
				throw new Error('Document no longer exists.');
			}

			document.description = description;
			document.descriptionEmbedding = `[${descriptionEmbedding.join(',')}]`;
			document.descriptionEmbeddingModel = options.embeddingClient.model;
			document.metadata = {
				...(source.metadata ?? {}),
				reindex: { version: DOCUMENT_REINDEX_VERSION, completedAt: new Date().toISOString(), source: 'stored-page-images' },
			};
			await document.save();
			await new DocumentChunk(connectionUid).replaceForDocument(document.uuid, savedChunks, options, connectionUid);
			await connector.commit();
			transactionOpened = false;

			return {
				documentUuid: document.uuid,
				originalFilename: document.originalFilename,
				pageCount: processedPages.length,
				blockCountBefore: pagesToProcess.reduce((total, page) => total + page.blockCount, 0),
				blockCountAfter: processedPages.reduce((total, item) => total + item.page.getBlockCount(), 0),
			};
		}
		catch (error)
		{
			if (transactionOpened)
			{
				await connector.rollback();
			}

			throw error;
		}
		finally
		{
			connector.close();
		}
	}

	static isReindexCurrent(metadata)
	{
		return metadata?.reindex?.version === DOCUMENT_REINDEX_VERSION;
	}

	static isStoredPageImageReindexCurrent(metadata)
	{
		return Document.isReindexCurrent(metadata) && metadata.reindex.source === 'stored-page-images';
	}

	static async add({ file, domain: domainUid }, bearer, options)
	{
		const addStartedAt = Date.now();
		Log.info(`[Document][add] Starting document preparation for ${file?.name ?? 'unknown file'}.`);
		const parsedFile = await Document.parseFile(file);
		Log.info(`[Document][add] Parsed ${parsedFile.name} as ${parsedFile.mimeType} (${parsedFile.content.length} bytes).`);
		const domain = await Document.getAuthorizedDomain(domainUid, bearer.uuid);
		Log.info(`[Document][add] Domain ${domain.uid} authorization confirmed.`);
		const sha256 = createHash('sha256').update(parsedFile.content).digest('hex');
		const renderingStartedAt = Date.now();
		Log.info(`[Document][add] Rendering ${parsedFile.name} (${parsedFile.mimeType}) to page images.`);
		const pageImages = await Document.buildPageImages(parsedFile, options);
		Log.info(`[Document][add] Rendered ${pageImages.length} page image(s) in ${Date.now() - renderingStartedAt} ms.`);
		const processedPages = [];
		Log.info(`[Document][add] Processing ${pageImages.length} page(s) in batches of ${options.pageProcessingBatchSize}.`);

		for (let offset = 0; offset < pageImages.length; offset += options.pageProcessingBatchSize)
		{
			const batch = pageImages.slice(offset, offset + options.pageProcessingBatchSize);
			const batchNumber = Math.floor(offset / options.pageProcessingBatchSize) + 1;
			const batchCount = Math.ceil(pageImages.length / options.pageProcessingBatchSize);
			const processedBatch = await Promise.all(batch.map(async (pageImage, batchIndex) =>
			{
				const pageNumber = offset + batchIndex + 1;
				const page = new DocumentPage();
				const logContext = { fileName: parsedFile.name, pageNumber, pageCount: pageImages.length };
				await page.processImage(pageImage, { ...options, logContext });
				await page.buildChunks({ ...options, logContext });
				return page;
			}));
			processedPages.push(...processedBatch);
			Log.info(`[Document][add] Page batch ${batchNumber}/${batchCount} completed (${processedPages.length}/${pageImages.length} pages).`);
		}
		Log.info(`[Document][add] All ${processedPages.length} page(s) processed.`);

		const descriptionStartedAt = Date.now();
		Log.info('[Document][add] Document description and embedding started.');
		const description = await options.mistralClient.describeDocument({
			originalFilename: parsedFile.name,
			mimeType: parsedFile.mimeType,
			pages: processedPages.map((page) => page.ocrEnriched),
		}, { fileName: parsedFile.name });
		const descriptionEmbedding = await options.embeddingClient.createEmbedding(`${parsedFile.name} : ${description}`, { fileName: parsedFile.name });

		Log.info(`[Document][add] Document description and embedding completed in ${Date.now() - descriptionStartedAt} ms.`);

		const connectionUid = `document-add-${randomUUID()}`;
		const connector = DbManager.getConnector('rag_server', connectionUid);
		let transactionOpened = false;

		try
		{
			const persistenceStartedAt = Date.now();
			Log.info('[Document][add] Database transaction started.');
			await connector.beginTransaction();
			transactionOpened = true;
			const previousDocument = new Document(connectionUid);
			await previousDocument.search('"domain_uuid" = $1 AND "binary_sha256" = $2', [domain.uuid, sha256], { limit: 1 });

			if (await previousDocument.next())
			{
				await previousDocument.delete();
			}

			const document = new Document(connectionUid);
			document.domainUuid = domain.uuid;
			document.name = parsedFile.name;
			document.originalFilename = parsedFile.name;
			document.mimeType = parsedFile.mimeType;
			document.originalContent = parsedFile.content;
			document.binarySha256 = sha256;
			document.pageCount = processedPages.length;
			document.description = description;
			document.descriptionEmbedding = `[${descriptionEmbedding.join(',')}]`;
			document.descriptionEmbeddingModel = options.embeddingClient.model;
			document.metadata = {
				reindex: {
					version: DOCUMENT_REINDEX_VERSION,
					completedAt: new Date().toISOString(),
				},
			};
			await document.save(true);

			const savedChunks = [];

			for (let index = 0; index < processedPages.length; index++)
			{
				savedChunks.push(...await processedPages[index].saveProcessed(document.uuid, index + 1, options.embeddingClient.model, connectionUid));
			}

			await new DocumentChunk(connectionUid).replaceForDocument(document.uuid, savedChunks, options, connectionUid);

			Log.info(`[Document][add] Database writes completed in ${Date.now() - persistenceStartedAt} ms; committing.`);
			await connector.commit();
			Log.info(`[Document][add] Commit completed; returning result after ${Date.now() - addStartedAt} ms.`);
			return { documentUuid: document.uuid, name: document.name, originalFilename: document.originalFilename, description: document.description,
				domain: domain.uid, pageCount: document.pageCount, sha256 };
		}
		catch (error)
		{
			if (transactionOpened)
			{
				await connector.rollback();
			}

			if (error.cause?.code === '23505' || error.message.includes('duplicate key'))
			{
				throw new Error('Document already exists in this domain.');
			}

			throw error;
		}
		finally
		{
			connector.close();
			Log.info('[Document][add] Database connection released.');
		}
	}

	static async search({ semanticQuery, lexicalQuery, limit = 10, minimumScoreRatio }, bearer, options)
	{
		minimumScoreRatio ??= options.searchMinimumScoreRatio;
		const trimmedSemanticQuery = typeof semanticQuery === 'string' ? semanticQuery.trim() : '';
		const trimmedLexicalQuery = typeof lexicalQuery === 'string' ? lexicalQuery.trim() : '';
		const hasSemanticQuery = trimmedSemanticQuery.length > 0;
		const hasLexicalQuery = trimmedLexicalQuery.length > 0;

		if (!hasSemanticQuery && !hasLexicalQuery)
		{
			throw new Error('semanticQuery or lexicalQuery must be a non-empty string.');
		}

		if (!Number.isInteger(limit) || limit < 1 || limit > options.maxSearchLimit)
		{
			throw new Error(`limit must be an integer between 1 and ${options.maxSearchLimit}.`);
		}

		if (!Number.isFinite(minimumScoreRatio) || minimumScoreRatio < 0 || minimumScoreRatio > 1)
		{
			throw new Error('minimumScoreRatio must be a number between 0 and 1.');
		}

		const embedding = hasSemanticQuery
			? new PageChunk().normalizeVector(await options.embeddingClient.createEmbedding(trimmedSemanticQuery, { operation: 'search' }))
			: null;
		const dbQuery = new DbQueryDocumentChunkSearch();

		try
		{
			await dbQuery.search(null, [embedding ? `[${embedding.join(',')}]` : null, options.embeddingClient.model, bearer.uuid, limit,
				options.searchContentWeight, options.searchPageDescriptionWeight, options.searchDocumentDescriptionWeight,
				hasLexicalQuery ? trimmedLexicalQuery : null, minimumScoreRatio]);
			const documents = new Map();
			let row;

			while ((row = await dbQuery.next()))
			{
				const pageChunk = dbQuery.pageChunk;
				const documentPage = dbQuery.documentPage;
				const document = dbQuery.document;
				const domain = dbQuery.domain;

				const score = Number(row.score);
				let documentResult = documents.get(document.uuid);

				if (!documentResult)
				{
					documentResult = { uuid: document.uuid, name: document.originalFilename, description: document.description,
						domain: domain.uid, score, pages: [], pageMap: new Map() };
					documents.set(document.uuid, documentResult);
				}

				let pageResult = documentResult.pageMap.get(documentPage.uuid);

				if (!pageResult)
				{
					pageResult = { uuid: documentPage.uuid, pageNumber: documentPage.pageNumber, description: documentPage.description,
						score, chunks: [] };
					documentResult.pageMap.set(documentPage.uuid, pageResult);
					documentResult.pages.push(pageResult);
				}

				pageResult.score = Math.max(pageResult.score, score);
				documentResult.score = Math.max(documentResult.score, pageResult.score);
				pageResult.chunks.push(pageChunk.content);
			}

			return { documents: [...documents.values()].map(({ pageMap, ...document }) => document) };
		}
		catch (error)
		{
			if (String(error.cause?.message ?? error.message).includes('different vector dimensions'))
			{
				throw new Error('Embedding dimensions are inconsistent with the stored model.');
			}

			throw error;
		}
		finally
		{
			dbQuery.close();
		}
	}

	static async regenerateDescription(documentUuid, options)
	{
		const document = new Document();
		const pages = new DocumentPage();

		try
		{
			await document.search('"uuid" = $1', [documentUuid], { limit: 1 });

			if (!(await document.next()))
			{
				throw new Error('Document not found.');
			}

			await pages.search('"document_uuid" = $1', [documentUuid], { order: '"page_number" ASC' });
			const enrichedPages = [];

			while (await pages.next())
			{
				enrichedPages.push(pages.ocrEnriched);
			}

			document.description = await options.mistralClient.describeDocument({
				originalFilename: document.originalFilename,
				mimeType: document.mimeType,
				pages: enrichedPages,
			}, { fileName: document.originalFilename });
			const embedding = await options.embeddingClient.createEmbedding(`${document.originalFilename} : ${document.description}`,
				{ fileName: document.originalFilename });
			document.descriptionEmbedding = `[${embedding.join(',')}]`;
			document.descriptionEmbeddingModel = options.embeddingClient.model;
			await document.save();		await new DocumentChunk().refreshSearchableText(document.uuid);		}
		finally
		{
			pages.close();
			document.close();
		}
	}

	static async getAuthorized({ documentUuid, pageNumbers, includeOriginal = false, includePageImages = true, pageImageDpi }, bearer, options)
	{
		if (pageImageDpi !== undefined && (!Number.isInteger(pageImageDpi) || pageImageDpi < 1))
		{
			throw new Error('pageImageDpi must be a positive integer.');
		}

		const documentQuery = new DbQueryAuthorizedDocument();

		try
		{
			await documentQuery.search('document->>\'uuid\' = $1 AND bearer_uuid = $2', [documentUuid, bearer.uuid], { limit: 1 });
			const row = await documentQuery.next();

			if (!row)
			{
				throw new Error('Document not found.');
			}

			const document = documentQuery.document;
			const result = {
				documentUuid: document.uuid,
				name: document.name,
				originalFilename: document.originalFilename,
				description: document.description,
				domain: documentQuery.domain.uid,
				mimeType: document.mimeType,
				pageCount: document.pageCount,
				sha256: document.binarySha256,
				metadata: document.metadata,
				pages: await DocumentPage.getForDocument(document.uuid, pageNumbers, pageImageDpi),
				includePageImages,
			};

			if (includeOriginal)
			{
				result.original = { content: row.original_content, mimeType: document.mimeType, fileName: document.name };
			}

			return result;
		}
		finally
		{
			documentQuery.close();
		}
	}

	static async getAuthorizedDomain(domainUid, bearerUuid)
	{
		const query = new DbQueryAuthorizedDomain();

		try
		{
			await query.search('domain_uid = $1 AND bearer_uuid = $2', [domainUid, bearerUuid], { limit: 1 });

			if (!(await query.next()))
			{
				throw new Error('Domain does not exist or is not authorized.');
			}

			return { uuid: query.domain.uuid, uid: query.domain.uid };
		}
		finally
		{
			query.close();
		}
	}

	static async parseFile(file)
	{
		if (!file || typeof file !== 'object' || typeof file.name !== 'string' || typeof file.dataBase64 !== 'string')
		{
			throw new Error('file must contain name and dataBase64.');
		}

		const extension = file.name.split('.').at(-1)?.toLowerCase();
		const content = Buffer.from(file.dataBase64, 'base64');
		const detected = await fileTypeFromBuffer(content);
		const textMimeTypes = { txt: 'text/plain', md: 'text/markdown', markdown: 'text/markdown' };
		const mimeType = detected?.mime ?? textMimeTypes[extension] ?? 'application/octet-stream';

		return { name: file.name, content, mimeType };
	}

	static async buildPageImages(file, options)
	{
		if (file.mimeType.startsWith('image/'))
		{
			return [{ content: file.content, mimeType: file.mimeType, dpi: 75 }];
		}

		const renderDpi = options.stirlingDpi ?? options.dpi;

		if (file.mimeType === 'application/pdf')
		{
			const images = await options.stirlingPdfClient.convertPdfToImages(file.content, { dpi: renderDpi, fileName: file.name });
			return images.map((content) => ({ content, mimeType: 'image/png', dpi: renderDpi }));
		}

		const pdf = await options.stirlingPdfClient.convertToPdf(file);
		const images = await options.stirlingPdfClient.convertPdfToImages(pdf, { dpi: renderDpi, fileName: file.name });
		return images.map((content) => ({ content, mimeType: 'image/png', dpi: renderDpi }));
	}
}
