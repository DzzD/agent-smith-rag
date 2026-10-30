#!/usr/bin/env node
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DbManager } from '../app/db/DbManager.js';
import { BearerAddCommand } from './commands/bearer/BearerAddCommand.js';

function printUsage()
{
    console.log('Usage: rag-server bearer add --name <name> --domains <uid,uid> [--token <token>]');
    console.log('Example: rag-server bearer add --name "Agent Smith" --domains RH,DSI');
}

function resolveCommand(group, action)
{
    if (group === 'bearer' && action === 'add')
    {
        return BearerAddCommand;
    }

    return null;
}

function loadConfig()
{
    const cliDirectory = path.dirname(fileURLToPath(import.meta.url));
    dotenv.config({ path: path.resolve(cliDirectory, '..', '.env'), quiet: true });

    return {
        name: process.env.RAG_PG_DB,
        host: process.env.RAG_PG_HOST,
        port: Number(process.env.RAG_PG_PORT),
        user: process.env.RAG_PG_USER,
        password: process.env.RAG_PG_PASSWORD,
        database: process.env.RAG_PG_DB,
        poolSize: Number(process.env.RAG_PG_POOL_SIZE || 20),
    };
}

export async function runCli(argv = process.argv.slice(2))
{
    const Command = resolveCommand(argv[0], argv[1]);

    if (!Command)
    {
        printUsage();
        process.exitCode = 1;
        return;
    }

    const config = loadConfig();

    try
    {
        DbManager.addDatabase(config);
        await new Command().run(argv.slice(2));
    }
    catch (error)
    {
        if (String(error.message).startsWith('missing_required_option:'))
        {
            console.error(`Missing required option: --${error.message.split(':')[1]}`);
            printUsage();
        }
        else
        {
            console.error(error.message);
        }

        process.exitCode = 1;
    }
    finally
    {
        DbManager.releaseAllConnections();

        if (DbManager._databases.has(config.name))
        {
            await DbManager.removeDatabase(config.name);
        }
    }
}

if (process.argv[1] === fileURLToPath(import.meta.url))
{
    await runCli();
}