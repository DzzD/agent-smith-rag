import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DbManager } from '../app/db/DbManager.js';
import { EmbeddingClient } from '../rag/client/EmbeddingClient.js';

const baseDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
dotenv.config({ path: path.join(baseDirectory, '.env') });

const semanticQuery = process.argv[2] ?? 'laboratoire numérique dans l\'organigramme de la DNSI';
const lexicalQuery = process.argv[3] ?? 'laboratoire numérique organigramme DNSI';
const limit = Number(process.argv[4] ?? 15);
const minimumScoreRatio = Number(process.argv[5] ?? 0.6);

const database = {
    name: process.env.RAG_PG_DB,
    host: process.env.RAG_PG_HOST,
    port: Number(process.env.RAG_PG_PORT),
    user: process.env.RAG_PG_USER,
    password: process.env.RAG_PG_PASSWORD,
    database: process.env.RAG_PG_DB,
    poolSize: Number(process.env.RAG_PG_POOL_SIZE || 20),
};

const embeddingClient = new EmbeddingClient({
    apiKey: process.env.RAG_EMBEDDING_API_KEY,
    url: process.env.RAG_EMBEDDING_URL,
    model: process.env.RAG_EMBEDDING_MODEL,
});

DbManager.addDatabase(database);
const connection = await DbManager.getClient(database.name);

const model = embeddingClient.model;
console.log(`embedding model: ${model}`);
const embedding = await embeddingClient.createEmbedding(semanticQuery, { operation: 'search' });
const norm = Math.sqrt(embedding.reduce((sum, value) => sum + value * value, 0));
const normalized = embedding.map((value) => value / norm);
const vector = `[${normalized.join(',')}]`;

// Recompute where the interesting document sits in each signal
const findDocumentLike = `%${process.argv[6] ?? 'organigramme_dnsi'}%`;

const diagnostic = await connection.query(`
    WITH authorized_document_chunks AS
    (
        SELECT document_chunk.*
        FROM document_chunk
        INNER JOIN document ON document.uuid = document_chunk.document_uuid
        INNER JOIN domain ON domain.uuid = document.domain_uuid
    ),
    semantic_ranked AS
    (
        SELECT
            candidates.uuid,
            candidates.document_uuid,
            1 - (candidates.embedding <=> $1::vector) AS content_score,
            COALESCE((
                SELECT MAX(CASE WHEN document_page.description_embedding_model = $2
                    THEN 1 - (document_page.description_embedding <=> $1::vector) ELSE 0 END)
                FROM unnest(ARRAY_REMOVE(ARRAY[candidates.page_chunk_uuid_1, candidates.page_chunk_uuid_2,
                    candidates.page_chunk_uuid_3, candidates.page_chunk_uuid_4], NULL)) AS member(page_chunk_uuid)
                INNER JOIN page_chunk ON page_chunk.uuid = member.page_chunk_uuid
                INNER JOIN document_page ON document_page.uuid = page_chunk.page_uuid
			), 0) AS page_description_score,
            CASE WHEN document.description_embedding_model = $2
                THEN 1 - (document.description_embedding <=> $1::vector) ELSE 0 END AS document_description_score,
            row_number() OVER
            (
                ORDER BY 1 - (candidates.embedding <=> $1::vector) DESC
            ) AS semantic_rank
        FROM authorized_document_chunks AS candidates
        INNER JOIN document ON document.uuid = candidates.document_uuid
        WHERE candidates.embedding_model = $2
    ),
    lexical_ranked AS
    (
        SELECT
            candidates.uuid,
            ts_rank_cd(to_tsvector('simple', candidates.content), websearch_to_tsquery('simple', $3)) AS lexical_score,
            row_number() OVER
            (
                ORDER BY ts_rank_cd(to_tsvector('simple', candidates.content), websearch_to_tsquery('simple', $3)) DESC
            ) AS lexical_rank
        FROM authorized_document_chunks AS candidates
        WHERE to_tsvector('simple', candidates.content) @@ websearch_to_tsquery('simple', $3)
    ),
    scored AS
    (
        SELECT
            document.original_filename,
            semantic_ranked.uuid AS semantic_uuid,
            semantic_ranked.content_score,
            semantic_ranked.page_description_score,
            semantic_ranked.document_description_score,
            semantic_ranked.semantic_rank,
            lexical_ranked.lexical_score,
            lexical_ranked.lexical_rank,
            COALESCE(1.0 / (60 + semantic_ranked.semantic_rank), 0)
                + COALESCE(1.0 / (60 + lexical_ranked.lexical_rank), 0) AS score
        FROM semantic_ranked
        LEFT JOIN lexical_ranked ON lexical_ranked.uuid = semantic_ranked.uuid
        INNER JOIN document ON document.uuid = semantic_ranked.document_uuid
        WHERE document.original_filename ILIKE $4 OR lexical_ranked.uuid IS NOT NULL
        ORDER BY score DESC
        LIMIT 40
    )
    SELECT * FROM scored
`, [vector, model, lexicalQuery, findDocumentLike]);

console.table(diagnostic.rows.map((row) => ({
    file: row.original_filename.slice(0, 55),
    sem_rank: row.semantic_rank,
    lex_rank: row.lexical_rank,
    content: Number(row.content_score).toFixed(4),
    page_desc: Number(row.page_description_score).toFixed(4),
    doc_desc: Number(row.document_description_score).toFixed(4),
    lexical: Number(row.lexical_score ?? 0).toFixed(4),
    rrf_score: Number(row.rrf_score).toFixed(4),
    score: Number(row.score).toFixed(4),
})));

// Ranking global max score (required by minimal score ratio filter)
const maxScore = await connection.query(`
    WITH semantic_ranked AS
    (
        SELECT candidates.uuid,
            1 - (candidates.embedding <=> $1::vector) AS content_score,
            row_number() OVER (ORDER BY 1 - (candidates.embedding <=> $1::vector) DESC) AS semantic_rank
        FROM document_chunk candidates
        INNER JOIN document ON document.uuid = candidates.document_uuid
        WHERE candidates.embedding_model = $2
    ),
    lexical_ranked AS
    (
        SELECT candidates.uuid,
            row_number() OVER (ORDER BY ts_rank_cd(to_tsvector('simple', candidates.content),
                websearch_to_tsquery('simple', $3)) DESC) AS lexical_rank
        FROM document_chunk candidates
        WHERE to_tsvector('simple', candidates.content) @@ websearch_to_tsquery('simple', $3)
    )
    SELECT MAX(COALESCE(1.0 / (60 + semantic_ranked.semantic_rank), 0)
        + COALESCE(1.0 / (60 + lexical_ranked.lexical_rank), 0)) AS max_score
    FROM semantic_ranked
    LEFT JOIN lexical_ranked ON lexical_ranked.uuid = semantic_ranked.uuid
`, [vector, model, lexicalQuery]);

const maxScoreValue = Number(maxScore.rows[0].max_score);
console.log(`\nmax RRF score: ${maxScoreValue} | filter threshold (${minimumScoreRatio}): ${maxScoreValue * minimumScoreRatio}`);

const organigrammeRows = diagnostic.rows.filter((row) => row.original_filename.includes('organigramme_dnsi'));
for (const row of organigrammeRows)
{
    const singleSignal = (row.lexical_rank === null || row.semantic_rank === null);
    console.log(`\norganigramme_dnsi chunk: RRF score = ${Number(row.score).toFixed(4)}`
        + ` | passes 0.6 filter: ${Number(row.score) >= maxScoreValue * minimumScoreRatio ? 'YES' : 'NO ❌'}`
        + (singleSignal ? ' (single signal: RRF ~0.0164, a dual-signal chunk reaches ~0.0328 => ratio 0.5 < 0.6)' : ''));
}

await DbManager.releaseAllConnections();
process.exit(0);
