# rag-server

Autonomous visual document RAG server exposed over MCP Streamable HTTP. It stores original documents, generated descriptions, rendered page images, recursively extracted images, OCR/vision-enriched text, and pgvector embeddings for documents and pages.

The server exposes four MCP tools:

- `document_add`
- `document_list`
- `document_search`
- `document_get`

`document_list` returns basic metadata for documents authorized by the current Bearer. It supports a case-insensitive regular-expression name filter and one-based pagination with a default page size of 50.

`document_search` accepts `semanticQuery`, `lexicalQuery`, or both. Semantic and lexical ranking search only `document_chunk` rows. Each searchable document chunk groups four consecutive `page_chunk` rows with a stride of two, may cross page boundaries, and never crosses a document boundary. Short documents and the final remainder produce shorter document chunks. Semantic scoring combines document-chunk content, page-description, and document-description similarities using configurable weights of 50%, 30%, and 20% by default. Lexical ranking uses PostgreSQL full-text search with the `simple` configuration and supports web-search syntax such as `"Bruno Augier"` or `budget OR finance`. When both queries are supplied, Reciprocal Rank Fusion (RRF) combines their independent rankings. Results contain the underlying `page_chunk` rows, deduplicated and grouped by document and page in reading order. Access is restricted to the domains authorized for the authenticated bearer.

The document-description embedding uses `original filename : generated description`. The stored and displayed description remains unchanged; adding the filename only to the embedding input improves semantic retrieval for meaningful file names.

Indexing stores the exact `original_filename` and short contextual descriptions for semantic discovery: at most 60 words per page and 100 words per document. Descriptions identify the subject and purpose without duplicating OCR content. Long documents use intermediate condensation rather than silent truncation.

Detected page images are OCRed recursively to a maximum depth of 4. Invalid, insignificant, and near-parent regions are rejected. The complete rendered page image and ordered OCR blocks remain in `document_page`.

Every non-empty page is split into ordered 1,024-character `page_chunk` rows. Titles start semantic sections, oversized sections are recursively subdivided, and small consecutive sections are merged while respecting character and token limits. `document_chunk` rows provide the searchable overlapping context while `page_chunk` remains the atomic evidence returned by search. Page `blocks`, page-description embeddings, document-description embeddings, and the `document_get`/`page_highlight` evidence workflow remain unchanged.

## Requirements

- Node.js 22 or newer
- Docker with Compose
- A StirlingPDF service
- A PaddleOCR/PaddleX service
- An OpenAI-compatible vision endpoint
- An OpenAI-compatible embedding endpoint and key

Images and PDFs are rendered directly. All other formats, including Text and Markdown files, are submitted to StirlingPDF and rejected only if its conversion fails.

## Configure

From the repository root:

```shell
cd rag-server
cp .env.example .env
npm install
```

Edit `.env` and set at least the StirlingPDF URL, PaddleOCR URL, Vision endpoint, chat completion endpoint, and embedding endpoint/key/model. `PADDLEOCR_KEY` is optional. OCR line grouping uses `OCR_LINE_SPACING_FACTOR=0.75` and `OCR_HORIZONTAL_OVERLAP_FACTOR=0.75` by default. Reading order is deterministic: compatible aligned groups are merged using `OCR_READING_ORDER_ALIGNMENT_TOLERANCE=0.02` and `OCR_READING_ORDER_HORIZONTAL_OVERLAP_FACTOR=0.5`, then similarly positioned rows use `OCR_READING_ORDER_ROW_TOLERANCE=0.02`. These tolerances are relative to page dimensions. OCR blocks are emitted as text without Vision labeling. Vision is used only to describe complete pages; chat completion describes complete documents. The committed example contains no secret.

The complete geometric grouping and reading-order algorithm is recorded in [PAGE_OCR_LAYOUT.md](PAGE_OCR_LAYOUT.md), including the intended boundary of the future provider-agnostic `PageOcrLayout` class.

Page chunk configuration defaults to 1,024 characters and a conservative 8,192-token limit.
The search cluster cutoff is controlled by `RAG_SEARCH_MINIMUM_SCORE_RATIO`, which defaults to `0.8` and compares each cluster against the best match.

After migrating an existing database, build searchable `document_chunk` rows from the existing `page_chunk` rows without rebuilding OCR or atomic chunks:

```shell
npm run db:backfill-document-chunks
```

Pass one or more document UUIDs to rebuild only those documents.

## Database

Start PostgreSQL, apply migrations, and regenerate AppCoreJS models after schema changes:

```shell
npm run db:up
npm run db:update
npm run db:models
```

After deploying this separate-embedding search version, reindex existing chunks because older vectors mixed chunk, page-description, and document-description embeddings:

```shell
npm run db:reindex-page-chunks
```

An optional page or document UUID can be supplied as the final argument. Each page is replaced in its own transaction, so the command is relaunchable after an error. The command recalculates only chunk embeddings from chunk text and reuses the already separated page and document description embeddings without recomputing them.

To rebuild complete documents with the current PaddleOCR pipeline from their stored originals:

```shell
# One document
npm run db:reindex-documents -- 11111111-1111-1111-1111-111111111111

# Several documents
npm run db:reindex-documents -- 11111111-1111-1111-1111-111111111111 22222222-2222-2222-2222-222222222222

# Every document not yet indexed with the current pipeline
npm run db:reindex-documents -- --all

# Every document, including documents already current
npm run db:reindex-documents -- --all --force

# Every document from page images already stored in PostgreSQL, without converting originals
npm run db:reindex-documents -- --all --force --stored-page-images
```

Regenerate only page/document descriptions and their embeddings, without rerunning PDF conversion or OCR:

```bash
npm run db:regenerate-descriptions
npm run db:regenerate-descriptions -- 11111111-1111-1111-1111-111111111111
```

The rebuild creates new pages, ordered flat OCR blocks, Markdown, chunks, descriptions, and embeddings before replacing the previous pages in one transaction per document. A failed document therefore keeps its previous index. The command is sequential and can be relaunched; current documents are skipped unless `--force` is supplied.

Create domains directly in PostgreSQL for this first version. Replace the sample value before running:

```sql
INSERT INTO domain (uid, name) VALUES ('RH', 'Ressources humaines');
```

Then add a Bearer through the CLI:

```shell
npm run cli -- bearer add --name "Agent Smith" --domains RH,DSI
```

The command generates and displays a random token once. Use `--token <token>` only when a pre-existing token must be registered.
Only its SHA-256 hash is stored. Every MCP request must send the original token in `Authorization: Bearer ...`.

## Run

```shell
npm start
```

The default MCP endpoint is `http://127.0.0.1:3100/mcp`. Configure Agent Smith's `McpSkill` with this endpoint and the original Bearer token.

The `document_add` file argument uses this shape:

```json
{
    "file": {
        "name": "document.pdf",
        "dataBase64": "..."
    },
    "domain": "RH"
}
```

## Verify

The tests use real PostgreSQL and mocks for StirlingPDF, Mistral, and embeddings:

```shell
npm run db:up
npm run db:update
npm test
```

The server can start and negotiate MCP without external provider keys. Actual `document_add` and `document_search` calls require the configured external services and credentials.