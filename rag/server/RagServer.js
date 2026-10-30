/**
 * AppCoreJS Project Server
 *
 * Project-specific server class.
 * This file is created once and is not overwritten by synchronization.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Server } from '../../app/server/Server.js';
import { DbManager } from '../../app/db/DbManager.js';
import { McpServerComponent } from './components/McpServerComponent.js';

const baseDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export class RagServer extends Server
{
    constructor(config)
    {
        super({ json: { limit: config.server.jsonLimit } });
        this.config = config;
        this.configureDatabase(config.database);
        this.registerServerComponent(new McpServerComponent({ path: config.mcp.path, documentOptions: config.document }));
    }

    get baseDirectory()
    {
        return baseDirectory;
    }

    configureDatabase(config)
    {
        if (!config.name || !config.host || !Number.isInteger(config.port) || !config.user || !config.password)
        {
            throw new Error('Missing or invalid RAG PostgreSQL environment variables.');
        }

        if (!DbManager._databases.has(config.name))
        {
            DbManager.addDatabase(config);
        }
    }

    async start(host = this.config.server.host, port = this.config.server.port)
    {
        return await super.start(host, port);
    }

    async stop()
    {
        await super.stop();
        await DbManager.removeDatabase(this.config.database.name);
    }
}
