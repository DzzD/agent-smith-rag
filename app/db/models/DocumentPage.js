/*
 * ONE-SHOT GENERATED FILE
 *
 * This file is generated once and can be freely modified.
 * You may add your own rules, methods, or overrides here.
 *
 * If this file is deleted, it can be generated again by re-running app-core.
 */

import { CoreDocumentPage } from '../../../core/db/models/CoreDocumentPage.js';
import { createCanvas, loadImage } from 'canvas';
import { Log } from '../../Log.js';
import { DbQueryAuthorizedDocumentPage } from '../queries/DbQueryAuthorizedDocumentPage.js';
import { PageChunk } from './PageChunk.js';
import { DocumentChunk } from './DocumentChunk.js';

export class DocumentPage extends CoreDocumentPage
{
	async processImage(image, options)
	{
		const sourceImage = await loadImage(image.content);
		const sourceDpi = image.dpi ?? options.dpi;
		const pageStartedAt = performance.now();
		const storageRasterStartedAt = performance.now();
		const storageDpi = options.dpi ?? sourceDpi;
		const storageScale = sourceDpi && storageDpi ? storageDpi / sourceDpi : 1;
		const storageWidth = Math.max(1, Math.round(sourceImage.width * storageScale));
		const storageHeight = Math.max(1, Math.round(sourceImage.height * storageScale));
		let storageContent = image.content;

		if (storageWidth !== sourceImage.width || storageHeight !== sourceImage.height || image.mimeType !== 'image/png')
		{
			const canvas = createCanvas(storageWidth, storageHeight);
			canvas.getContext('2d').drawImage(sourceImage, 0, 0, storageWidth, storageHeight);
			storageContent = canvas.toBuffer('image/png');
		}
		Log.debug(`[DocumentPage][timing] Storage raster: ${(performance.now() - storageRasterStartedAt).toFixed(1)} ms; `
			+ `${storageWidth}x${storageHeight}, ${storageContent.length} bytes.`);

		const ocrRasterStartedAt = performance.now();
		const ocrDpi = options.ocrDpi ?? storageDpi;
		const ocrScale = storageDpi ? ocrDpi / storageDpi : 1;
		const ocrWidth = Math.max(1, Math.round(storageWidth * ocrScale));
		const ocrHeight = Math.max(1, Math.round(storageHeight * ocrScale));
		let ocrContent = storageContent;

		if (ocrWidth !== storageWidth || ocrHeight !== storageHeight)
		{
			const ocrCanvas = createCanvas(ocrWidth, ocrHeight);
			ocrCanvas.getContext('2d').drawImage(sourceImage, 0, 0, ocrWidth, ocrHeight);
			ocrContent = ocrCanvas.toBuffer('image/png');
		}
		Log.debug(`[DocumentPage][timing] OCR raster: ${(performance.now() - ocrRasterStartedAt).toFixed(1)} ms; `
			+ `${ocrWidth}x${ocrHeight}, ${ocrContent.length} bytes.`);

		const visionRasterStartedAt = performance.now();
		const visionDpi = options.visionDpi ?? ocrDpi;
		const visionScale = storageDpi ? visionDpi / storageDpi : 1;
		const visionWidth = Math.max(1, Math.round(storageWidth * visionScale));
		const visionHeight = Math.max(1, Math.round(storageHeight * visionScale));
		let visionContent = storageContent;

		if (visionWidth !== storageWidth || visionHeight !== storageHeight)
		{
			const visionCanvas = createCanvas(visionWidth, visionHeight);
			visionCanvas.getContext('2d').drawImage(sourceImage, 0, 0, visionWidth, visionHeight);
			visionContent = visionCanvas.toBuffer('image/png');
		}
		Log.debug(`[DocumentPage][timing] Vision raster: ${(performance.now() - visionRasterStartedAt).toFixed(1)} ms; `
			+ `${visionWidth}x${visionHeight}, ${visionContent.length} bytes.`);

		const logTarget = this._formatLogTarget(options, storageDpi);
		const logContext = options.logContext;
		const analysisStartedAt = performance.now();
		const ocr = await options.ocrClient.analyze(ocrContent, {
			mimeType: 'image/png',
			visionImage: visionContent,
			visionMimeType: 'image/png',
			coordinateScaleX: storageWidth / ocrWidth,
			coordinateScaleY: storageHeight / ocrHeight,
			visionCoordinateScaleX: visionWidth / ocrWidth,
			visionCoordinateScaleY: visionHeight / ocrHeight,
			lineSpacingFactor: options.ocrLineSpacingFactor,
			horizontalOverlapFactor: options.ocrHorizontalOverlapFactor,
			readingOrderAlignmentTolerance: options.readingOrderAlignmentTolerance,
			readingOrderHorizontalOverlapFactor: options.readingOrderHorizontalOverlapFactor,
			readingOrderRowTolerance: options.readingOrderRowTolerance,
			maximumEmptyToBlockRatio: options.ocrMaximumEmptyToBlockRatio,
			pageWidth: ocrWidth,
			pageHeight: ocrHeight,
			...(logContext ? { logContext } : {}),
		});
		Log.debug(`[DocumentPage][timing] Paddle and Vision: ${(performance.now() - analysisStartedAt).toFixed(1)} ms.`);
		this.imageContent = storageContent;
		this.imageMimeType = 'image/png';
		this.pixelWidth = storageWidth;
		this.pixelHeight = storageHeight;
		this.dpi = storageDpi ?? null;
		this.ocrRaw = ocr.markdown;
		this.ocrEnriched = ocr.markdown;
		this.blocks = { type: 'page', pageMinX: 0, pageMinY: 0, pageMaxX: storageWidth, pageMaxY: storageHeight, children: ocr.blocks };

		if (this.ocrEnriched.trim())
		{
			const descriptionStartedAt = performance.now();
			this.description = await options.mistralClient.describePage(ocrContent, 'image/png', this.ocrEnriched, logContext);
			Log.debug(`[DocumentPage][timing] Page description: ${(performance.now() - descriptionStartedAt).toFixed(1)} ms.`);
			const embeddingStartedAt = performance.now();
			this._descriptionEmbeddingVector = await options.embeddingClient.createEmbedding(this.description, logContext);
			Log.debug(`[DocumentPage][timing] Description embedding: ${(performance.now() - embeddingStartedAt).toFixed(1)} ms.`);
		}
		else
		{
			this.description = null;
			this._descriptionEmbeddingVector = null;
		}

		this.metadata = { ocrDpi, visionDpi };
		Log.debug(`[DocumentPage] PaddleOCR analysis completed in ${(performance.now() - pageStartedAt).toFixed(1)} ms: ${logTarget}; blocks=${ocr.blocks.length}.`);
	}

	_formatLogTarget(options, dpi)
	{
		const context = options.logContext ?? {};
		const page = context.pageNumber ? `page ${context.pageNumber}${context.pageCount ? `/${context.pageCount}` : ''}` : 'page unknown';
		return `${context.fileName ?? 'unknown file'}, ${page}${dpi ? `, ${dpi} DPI` : ''}`;
	}

	async buildChunks(options)
	{
		const pageChunk = new PageChunk();
		this._chunkDrafts = await pageChunk.buildDrafts(this.getContentBlocks(), options);
		return this._chunkDrafts;
	}

	async saveProcessed(documentUuid, pageNumber, embeddingModel, connectionUid)
	{
		this._connectionUid = connectionUid;
		this.documentUuid = documentUuid;
		this.pageNumber = pageNumber;
		this.descriptionEmbeddingModel = this._descriptionEmbeddingVector === null ? null : embeddingModel;
		this.descriptionEmbedding = this._descriptionEmbeddingVector === null ? null : `[${this._descriptionEmbeddingVector.join(',')}]`;
		await this.save(true);
		const pageChunk = new PageChunk(connectionUid);
		return await pageChunk.replaceForPage(this.uuid, this._chunkDrafts, embeddingModel, connectionUid);
	}

	static async getForDocument(documentUuid, pageNumbers, requestedDpi)
	{
		if (pageNumbers !== undefined && (!Array.isArray(pageNumbers) || pageNumbers.some((number) => !Number.isInteger(number) || number < 1)))
		{
			throw new Error('pageNumbers must contain positive integers.');
		}

		const pages = new DocumentPage();
		const params = [documentUuid];
		let where = '"document_uuid" = $1';

		if (pageNumbers !== undefined)
		{
			where += ' AND "page_number" = ANY($2::integer[])';
			params.push(pageNumbers);
		}

		try
		{
			await pages.search(where, params, { order: '"page_number" ASC' });
			const results = [];

			while (await pages.next())
			{
				results.push(await DocumentPage.preparePageResult({
					pageUuid: pages.uuid,
					pageNumber: pages.pageNumber,
					description: pages.description,
					blocks: pages.blocks,
					imageContent: pages.imageContent,
					imageMimeType: pages.imageMimeType,
					pixelWidth: pages.pixelWidth,
					pixelHeight: pages.pixelHeight,
					dpi: pages.dpi,
				}, requestedDpi));
			}

			if (pageNumbers !== undefined && results.length !== new Set(pageNumbers).size)
			{
				throw new Error('One or more requested pages were not found.');
			}

			return results;
		}
		finally
		{
			pages.close();
		}
	}

	static async getAuthorizedHighlight(pageUuid, blockIds, bearerUuid, requestedDpi)
	{
		const pageQuery = new DbQueryAuthorizedDocumentPage();

		try
		{
			await pageQuery.search('page_uuid = $1 AND bearer_uuid = $2', [pageUuid, bearerUuid], { limit: 1 });
			const row = await pageQuery.next();

			if (!row)
			{
				throw new Error('Document page not found.');
			}

			const documentPage = pageQuery.documentPage;
			const page = {
				uuid: documentPage.uuid,
				blocks: documentPage.blocks,
				imageContent: row.image_content,
				imageMimeType: documentPage.imageMimeType,
				pixelWidth: documentPage.pixelWidth,
				pixelHeight: documentPage.pixelHeight,
				dpi: documentPage.dpi,
			};
			const preparedPage = await DocumentPage.preparePageResult({
				pageUuid: documentPage.uuid,
				pageNumber: documentPage.pageNumber,
				description: documentPage.description,
				...page,
			}, requestedDpi);

			return {
				...await DocumentPage.buildHighlight(page, blockIds),
				sourceFileName: row.source_file_name,
				pageNumber: documentPage.pageNumber,
				pageImageWidth: preparedPage.pixelWidth,
				pageImageHeight: preparedPage.pixelHeight,
				dpi: preparedPage.dpi,
				image: preparedPage.image,
			};
		}
		finally
		{
			pageQuery.close();
		}
	}

	static async preparePageResult(page, requestedDpi)
	{
		const shouldResize = requestedDpi !== undefined && page.dpi !== null && requestedDpi < page.dpi;
		const scale = shouldResize ? requestedDpi / page.dpi : 1;
		const pixelWidth = Math.max(1, Math.round(page.pixelWidth * scale));
		const pixelHeight = Math.max(1, Math.round(page.pixelHeight * scale));
		let imageContent = page.imageContent;
		let imageMimeType = page.imageMimeType;

		if (shouldResize)
		{
			const sourceImage = await loadImage(page.imageContent);
			const canvas = createCanvas(pixelWidth, pixelHeight);
			canvas.getContext('2d').drawImage(sourceImage, 0, 0, pixelWidth, pixelHeight);
			imageContent = canvas.toBuffer('image/png');
			imageMimeType = 'image/png';
		}

		return {
			pageUuid: page.pageUuid,
			pageNumber: page.pageNumber,
			description: page.description,
			pixelWidth,
			pixelHeight,
			dpi: shouldResize ? requestedDpi : page.dpi,
			blocks: DocumentPage.toMcpBlockCoordinates(DocumentPage.removeBlockType(DocumentPage.addBlockIds(
				DocumentPage.addAbsoluteBlockPositions(page.blocks, pixelWidth / page.pixelWidth, pixelHeight / page.pixelHeight),
			))),
			image: { content: imageContent, mimeType: imageMimeType, fileName: `page-${page.pageNumber}.png` },
		};
	}

	static toMcpBlockCoordinates(block)
	{
		const { pageMinX, pageMinY, pageMaxX, pageMaxY, children, ...blockContent } = block;
		return {
			...blockContent,
			x: pageMinX,
			y: pageMinY,
			width: pageMaxX - pageMinX,
			height: pageMaxY - pageMinY,
			...(children ? { children: children.map((child) => DocumentPage.toMcpBlockCoordinates(child)) } : {}),
		};
	}

	static addBlockIds(blocks)
	{
		let generatedId = 0;
		const reservedIds = new Set(DocumentPage.collectBlocks(blocks)
			.map((block) => block.id)
			.filter((blockId) => typeof blockId === 'string' && blockId));
		const usedIds = new Set();
		const addId = (block) =>
		{
			let blockId = block.id;

			if (typeof blockId !== 'string' || !blockId || usedIds.has(blockId))
			{
				do
				{
					generatedId += 1;
					blockId = `B${String(generatedId).padStart(3, '0')}`;
				}
				while (usedIds.has(blockId) || reservedIds.has(blockId));
			}

			usedIds.add(blockId);
			const { id, children, ...blockContent } = block;
			return { ...blockContent, blockId, ...(children ? { children: children.map(addId) } : {}) };
		};

		return blocks === null ? null : addId(blocks);
	}

	static removeBlockType(block)
	{
		const { type, children, ...blockContent } = block;
		return { ...blockContent, ...(children ? { children: children.map((child) => DocumentPage.removeBlockType(child)) } : {}) };
	}

	static collectBlocks(block)
	{
		return [block, ...(block.children ?? []).flatMap((child) => DocumentPage.collectBlocks(child))];
	}

	static async buildHighlight(page, blockIds)
	{
		if (!Array.isArray(blockIds) || blockIds.length === 0)
		{
			throw new Error('blockIds must contain at least one block ID.');
		}

		const uniqueBlockIds = [...new Set(blockIds)];
		const positionedBlocksById = new Map(DocumentPage.collectBlocks(
			DocumentPage.addBlockIds(DocumentPage.addAbsoluteBlockPositions(page.blocks)),
		).map((block) => [block.blockId, block]));
		const selectedBlocks = uniqueBlockIds.map((blockId) =>
		{
			const block = positionedBlocksById.get(blockId);

			if (!block)
			{
				throw new Error(`Block not found on page ${page.uuid}: ${blockId}.`);
			}

			if (!['text', 'title'].includes(block.type))
			{
				throw new Error(`Block type is not allowed for highlighting: ${block.type}.`);
			}

			const coordinates = ['pageMinX', 'pageMinY', 'pageMaxX', 'pageMaxY'].map((property) => block[property]);

			if (!coordinates.every(Number.isFinite) || block.pageMinX >= block.pageMaxX || block.pageMinY >= block.pageMaxY)
			{
				throw new Error(`Block has invalid original page coordinates: ${blockId}.`);
			}

			return block;
		});

		if (!Number.isFinite(page.pixelWidth) || page.pixelWidth <= 0 || !Number.isFinite(page.pixelHeight) || page.pixelHeight <= 0)
		{
			throw new Error('Page image dimensions are missing or invalid.');
		}

		if (selectedBlocks.some((block) => block.pageMinX < 0 || block.pageMinY < 0
			|| block.pageMaxX > page.pixelWidth || block.pageMaxY > page.pixelHeight))
		{
			throw new Error('Block has coordinates outside the complete page image.');
		}

		const pageImage = await loadImage(page.imageContent);

		if (pageImage.width !== page.pixelWidth || pageImage.height !== page.pixelHeight)
		{
			throw new Error('Page image dimensions do not match the complete page image.');
		}

		const xMin = Math.min(...selectedBlocks.map((block) => block.pageMinX));
		const yMin = Math.min(...selectedBlocks.map((block) => block.pageMinY));
		const xMax = Math.max(...selectedBlocks.map((block) => block.pageMaxX));
		const yMax = Math.max(...selectedBlocks.map((block) => block.pageMaxY));
		const highlight = {
			x1: Math.min(1, Math.max(0, xMin / pageImage.width)),
			y1: Math.min(1, Math.max(0, yMin / pageImage.height)),
			x2: Math.min(1, Math.max(0, xMax / pageImage.width)),
			y2: Math.min(1, Math.max(0, yMax / pageImage.height)),
		};

		if (!(highlight.x1 < highlight.x2 && highlight.y1 < highlight.y2))
		{
			throw new Error('Final highlight bounding box is invalid.');
		}

		if (selectedBlocks.some((block) => block.pageMinX < xMin || block.pageMinY < yMin || block.pageMaxX > xMax || block.pageMaxY > yMax))
		{
			throw new Error('Final highlight bounding box does not contain every selected block.');
		}

		return {
			pageUuid: page.uuid,
			blockIds: uniqueBlockIds,
			pageImageWidth: pageImage.width,
			pageImageHeight: pageImage.height,
			highlight,
		};
	}

	static addAbsoluteBlockPositions(blocks, scaleX = 1, scaleY = 1)
	{
		if (blocks !== null && ['pageMinX', 'pageMinY', 'pageMaxX', 'pageMaxY'].every((property) => Number.isFinite(blocks[property])))
		{
			const scale = (block) => ({
				...block,
				pageMinX: Math.round(block.pageMinX * scaleX),
				pageMinY: Math.round(block.pageMinY * scaleY),
				pageMaxX: Math.round(block.pageMaxX * scaleX),
				pageMaxY: Math.round(block.pageMaxY * scaleY),
				...(block.children ? { children: block.children.map(scale) } : {}),
			});

			return scale(blocks);
		}

		const addPositions = (block, transform) =>
		{
			const pageMinX = transform.x + block.x * transform.scaleX;
			const pageMinY = transform.y + block.y * transform.scaleY;
			const pageMaxX = pageMinX + block.width * transform.scaleX;
			const pageMaxY = pageMinY + block.height * transform.scaleY;
			const { x, y, width, height, childWidth, childHeight, children, ...blockContent } = block;
			const positionedBlock = {
				...blockContent,
				pageMinX: Math.round(pageMinX),
				pageMaxX: Math.round(pageMaxX),
				pageMinY: Math.round(pageMinY),
				pageMaxY: Math.round(pageMaxY),
			};

			if (children)
			{
				const childScaleX = (pageMaxX - pageMinX) / (childWidth ?? width);
				const childScaleY = (pageMaxY - pageMinY) / (childHeight ?? height);
				positionedBlock.children = children.map((child) => addPositions(child, {
					x: pageMinX, y: pageMinY, scaleX: childScaleX, scaleY: childScaleY,
				}));
			}

			return positionedBlock;
		};

		return blocks === null ? null : addPositions(blocks, { x: 0, y: 0, scaleX, scaleY });
	}

	async load(pageUuid)
	{
		await this.search('"uuid" = $1', [pageUuid], { limit: 1 });

		if (!(await this.next()))
		{
			throw new Error('Document page not found.');
		}
	}

	getContentBlocks()
	{
		if (this.blocks === null)
		{
			return [];
		}

		const collect = (block) => [{ type: block.type, content: block.content }, ...(block.children ?? []).flatMap(collect)];
		return collect(this.blocks).slice(1);
	}

	getBlockCount()
	{
		return this.getContentBlocks().length;
	}

	async regenerateDescription(options, logContext)
	{
		if (this.ocrEnriched.trim())
		{
			this.description = await options.mistralClient.describePage(this.imageContent, this.imageMimeType, this.ocrEnriched, logContext);
			this._descriptionEmbeddingVector = await options.embeddingClient.createEmbedding(this.description, logContext);
		}
		else
		{
			this.description = null;
			this._descriptionEmbeddingVector = null;
		}

		this.descriptionEmbeddingModel = this._descriptionEmbeddingVector === null ? null : options.embeddingClient.model;
		this.descriptionEmbedding = this._descriptionEmbeddingVector === null ? null : `[${this._descriptionEmbeddingVector.join(',')}]`;
		await this.save();
		await DocumentChunk.refreshSearchableText(this.documentUuid, this._connectionUid);
	}
	}
