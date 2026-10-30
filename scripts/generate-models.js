import { spawnSync } from 'node:child_process';

const result = spawnSync(process.execPath, [
    'node_modules/app-core/bin/app-core.js',
    '--project', 'rag',
    '--target', '.',
    '--model',
    '--dbhost', process.env.RAG_PG_HOST,
    '--dbport', process.env.RAG_PG_PORT,
    '--dbuser', process.env.RAG_PG_USER,
    '--dbpassword', process.env.RAG_PG_PASSWORD,
    '--dbname', process.env.RAG_PG_DB,
    '--dbschema', process.env.RAG_PG_SCHEMA,
    '--model-noprefix'
], { stdio: 'inherit' });

if (result.error)
{
    throw result.error;
}

process.exitCode = result.status;