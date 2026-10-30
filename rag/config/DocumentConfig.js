import { StirlingPdfClient } from '../client/StirlingPdfClient.js';
import { MistralDocumentClient } from '../client/MistralDocumentClient.js';
import { EmbeddingClient } from '../client/EmbeddingClient.js';
import { PaddleOcrClient } from '../client/PaddleOcrClient.js';

export class DocumentConfig
{
	static create(environment = process.env)
	{
		const dpi = Number(environment.RAG_PAGE_DPI || 300);
		const pageImageDpi = Number(environment.RAG_PAGE_IMAGE_DPI || 100);
		const ocrDpi = Number(environment.RAG_OCR_DPI || 150);
		const visionDpi = Number(environment.RAG_VISION_DPI || ocrDpi);
		const stirlingDpi = Number(environment.RAG_STIRLING_DPI || dpi);
		const maxEmbeddingTokens = Number(environment.RAG_EMBEDDING_MAX_TOKENS ?? 8192);
		const embeddingChunkSize = Number(environment.RAG_EMBEDDING_CHUNK_SIZE ?? 1024);
		const embeddingBatchSize = Number(environment.RAG_EMBEDDING_BATCH_SIZE ?? 64);
		const pageProcessingBatchSize = Number(environment.RAG_PAGE_PROCESSING_BATCH_SIZE ?? 4);
		const searchDocumentDescriptionWeight = Number(environment.RAG_SEARCH_DOCUMENT_DESCRIPTION_WEIGHT ?? 0.2);
		const searchPageDescriptionWeight = Number(environment.RAG_SEARCH_PAGE_DESCRIPTION_WEIGHT ?? 0.3);
		const searchContentWeight = Number(environment.RAG_SEARCH_CONTENT_WEIGHT ?? 0.5);
		const searchMinimumScoreRatio = Number(environment.RAG_SEARCH_MINIMUM_SCORE_RATIO ?? 0.8);
		const searchWeightTotal = searchDocumentDescriptionWeight + searchPageDescriptionWeight + searchContentWeight;
		const ocrLineSpacingFactor = Number(environment.OCR_LINE_SPACING_FACTOR ?? 0.75);
		const ocrHorizontalOverlapFactor = Number(environment.OCR_HORIZONTAL_OVERLAP_FACTOR ?? 0.75);
		const readingOrderAlignmentTolerance = Number(environment.OCR_READING_ORDER_ALIGNMENT_TOLERANCE ?? 0.02);
		const readingOrderHorizontalOverlapFactor = Number(environment.OCR_READING_ORDER_HORIZONTAL_OVERLAP_FACTOR ?? 0.5);
		const readingOrderRowTolerance = Number(environment.OCR_READING_ORDER_ROW_TOLERANCE ?? 0.02);
		const ocrMaximumEmptyToBlockRatio = Number(environment.OCR_MAXIMUM_EMPTY_TO_BLOCK_RATIO ?? 4);

		if (!Number.isInteger(dpi) || dpi <= 0 || !Number.isInteger(pageImageDpi) || pageImageDpi <= 0 || pageImageDpi > dpi
			|| !Number.isInteger(ocrDpi) || ocrDpi <= 0 || ocrDpi > dpi
			|| !Number.isInteger(visionDpi) || visionDpi <= 0 || visionDpi > dpi
			|| !Number.isInteger(stirlingDpi) || stirlingDpi < dpi
			|| !Number.isInteger(maxEmbeddingTokens) || maxEmbeddingTokens <= 0
			|| !Number.isInteger(embeddingChunkSize) || embeddingChunkSize <= 0
			|| !Number.isInteger(embeddingBatchSize) || embeddingBatchSize <= 0
			|| !Number.isInteger(pageProcessingBatchSize) || pageProcessingBatchSize <= 0)
		{
			throw new Error('RAG DPI, page image DPI, OCR DPI, Vision DPI, embedding sizes, and page processing batch size must be valid positive integers, '
				+ 'page image, OCR and Vision DPI must not exceed page DPI, and Stirling DPI must be at least page DPI.');
		}

		if (![searchDocumentDescriptionWeight, searchPageDescriptionWeight, searchContentWeight].every((weight) => Number.isFinite(weight) && weight >= 0)
			|| Math.abs(searchWeightTotal - 1) > Number.EPSILON)
		{
			throw new Error('RAG search weights must be non-negative numbers whose sum is 1.');
		}

		if (!Number.isFinite(searchMinimumScoreRatio) || searchMinimumScoreRatio < 0 || searchMinimumScoreRatio > 1)
		{
			throw new Error('RAG search minimum score ratio must be a number between 0 and 1.');
		}

		if (![ocrLineSpacingFactor, ocrHorizontalOverlapFactor, readingOrderAlignmentTolerance, readingOrderHorizontalOverlapFactor,
			readingOrderRowTolerance].every((factor) => Number.isFinite(factor) && factor >= 0 && factor <= 1))
		{
			throw new Error('OCR grouping and reading-order factors must be numbers between 0 and 1.');
		}

		if (!Number.isFinite(ocrMaximumEmptyToBlockRatio) || ocrMaximumEmptyToBlockRatio < 0)
		{
			throw new Error('OCR maximum empty-to-block ratio must be a non-negative number.');
		}

		const mistralClient = new MistralDocumentClient({
			visionUrl: environment.OPENAI_VISION_URL,
			visionApiKey: environment.OPENAI_VISION_KEY,
			visionModel: environment.OPENAI_VISION_MODEL,
			chatUrl: environment.OPENAI_CHAT_COMPLETION_URL,
			chatApiKey: environment.OPENAI_CHAT_COMPLETION_KEY,
			chatModel: environment.OPENAI_CHAT_COMPLETION_MODEL,
			descriptionLanguage: environment.RAG_DESCRIPTION_LANGUAGE,
		});
		const ocrClient = new PaddleOcrClient({
			paddleUrl: environment.PADDLEOCR_URL,
			paddleApiKey: environment.PADDLEOCR_KEY,
			visionImageDirectory: environment.RAG_VISION_IMAGE_DIRECTORY,
		});

		return {
			stirlingPdfClient: new StirlingPdfClient({
				url: environment.RAG_STIRLING_URL,
				convertToPdfRoute: environment.RAG_STIRLING_CONVERT_TO_PDF_ROUTE,
				convertPdfToImagesRoute: environment.RAG_STIRLING_PDF_TO_IMAGES_ROUTE,
			}),
			mistralClient,
			ocrClient,
			ocrLineSpacingFactor,
			ocrHorizontalOverlapFactor,
			readingOrderAlignmentTolerance,
			readingOrderHorizontalOverlapFactor,
			readingOrderRowTolerance,
			ocrMaximumEmptyToBlockRatio,
			embeddingClient: new EmbeddingClient({
				url: environment.RAG_EMBEDDING_URL,
				apiKey: environment.RAG_EMBEDDING_API_KEY,
				model: environment.RAG_EMBEDDING_MODEL,
				batchSize: embeddingBatchSize,
			}),
			dpi,
			pageImageDpi,
			ocrDpi,
			visionDpi,
			stirlingDpi,
			searchLimit: Number(environment.RAG_SEARCH_LIMIT || 5),
			maxSearchLimit: Number(environment.RAG_MAX_SEARCH_LIMIT || 50),
			maxEmbeddingTokens,
			embeddingChunkSize,
			pageProcessingBatchSize,
			searchDocumentDescriptionWeight,
			searchPageDescriptionWeight,
			searchContentWeight,
			searchMinimumScoreRatio,
		};
	}
}