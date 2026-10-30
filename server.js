/**
 * AppCoreJS Framework
 * APP LAYER
 * INTENDED TO BE MODIFIED IN APPLICATION PROJECTS
 * Copyright (c) 2026 Bruno Augier
 * Licensed under the MIT License
 */

import { RagServer } from './rag/server/RagServer.js';
import { Log } from './app/Log.js';
import { DocumentConfig } from './rag/config/DocumentConfig.js';
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const serverDirectory = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(serverDirectory, '.env') });

const config = {
    server: {
        host: process.env.RAG_SERVER_HOST || '127.0.0.1',
        port: Number(process.env.RAG_SERVER_PORT || 3100),
        jsonLimit: process.env.RAG_SERVER_JSON_LIMIT || '100mb',
    },
    mcp: {
        path: process.env.RAG_MCP_PATH || '/mcp',
    },
    database: {
        name: process.env.RAG_PG_DB,
        host: process.env.RAG_PG_HOST,
        port: Number(process.env.RAG_PG_PORT),
        user: process.env.RAG_PG_USER,
        password: process.env.RAG_PG_PASSWORD,
        database: process.env.RAG_PG_DB,
        poolSize: Number(process.env.RAG_PG_POOL_SIZE || 20),
    },
    document: DocumentConfig.create(),
};

const server = new RagServer(config);
const SHUTDOWN_TIMEOUT = 5000;

let isShuttingDown = false;

async function shutdown(signal)
{
    if (isShuttingDown)
    {
        return;
    }

    isShuttingDown = true;
    Log.info(`${signal} received, stopping server...`);

    const timeout = new Promise((resolve) =>
    {
        setTimeout(() =>
        {
            Log.warn(`Server stop timeout after ${SHUTDOWN_TIMEOUT}ms, forcing exit...`);
            resolve();
        }, SHUTDOWN_TIMEOUT);
    });

    await Promise.race([
        server.stop(),
        timeout,
    ]);

    process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

await server.start();