import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const { Client } = pg;
const databaseDirectory = path.dirname(fileURLToPath(import.meta.url));
const migrationDirectory = path.join(databaseDirectory, 'init');
const migrationFilePattern = /^(\d+)-.+\.sql$/;
const metadataTableName = 'database_metadata';
const databaseVersionCode = 'version_db';
const metadataMigrationVersion = 22;
const migrationLockId = 193748522;

function getDatabaseConfig()
{
    const config =
    {
        host: String(process.env.RAG_PG_HOST ?? '').trim(),
        port: Number(process.env.RAG_PG_PORT ?? 5436),
        user: String(process.env.RAG_PG_USER ?? '').trim(),
        password: String(process.env.RAG_PG_PASSWORD ?? ''),
        database: String(process.env.RAG_PG_DB ?? '').trim()
    };

    const missingVariables = [];

    if (!config.host) missingVariables.push('RAG_PG_HOST');
    if (!config.user) missingVariables.push('RAG_PG_USER');
    if (!config.database) missingVariables.push('RAG_PG_DB');
    if (!Number.isInteger(config.port) || config.port <= 0) missingVariables.push('RAG_PG_PORT');

    if (missingVariables.length > 0)
    {
        throw new Error(`Missing or invalid database configuration: ${missingVariables.join(', ')}`);
    }

    return config;
}

async function getMigrations()
{
    const fileNames = await readdir(migrationDirectory);
    const migrations = fileNames.flatMap((fileName) =>
    {
        const match = migrationFilePattern.exec(fileName);
        return match ? [{ version: Number(match[1]), fileName }] : [];
    }).sort((left, right) => left.version - right.version);

    for (let index = 0; index < migrations.length; index++)
    {
        const migration = migrations[index];
        const expectedVersion = index + 1;

        if (migration.version !== expectedVersion)
        {
            throw new Error(`Expected migration version ${expectedVersion}, found ${migration.fileName}`);
        }
    }

    return migrations;
}

async function getMetadataVersion(client)
{
    const tableResult = await client.query('SELECT to_regclass($1) AS table_name', [`public.${metadataTableName}`]);
    if (!tableResult.rows[0].table_name) return null;

    const versionResult = await client.query(`SELECT value FROM ${metadataTableName} WHERE code = $1`, [databaseVersionCode]);

    if (versionResult.rowCount === 0)
    {
        throw new Error(`Missing ${databaseVersionCode} in ${metadataTableName}`);
    }

    const version = Number(versionResult.rows[0].value);

    if (!Number.isInteger(version) || version < 0)
    {
        throw new Error(`Invalid database version: ${versionResult.rows[0].value}`);
    }

    return version;
}

async function getSchemaMigrationVersion(client, migrations)
{
    const tableResult = await client.query('SELECT to_regclass($1) AS table_name', ['public.schema_migration']);
    if (!tableResult.rows[0].table_name) return null;

    const result = await client.query('SELECT name FROM schema_migration ORDER BY name');
    const appliedNames = new Set(result.rows.map(({ name }) => name));
    let version = 0;

    for (const migration of migrations)
    {
        if (!appliedNames.has(migration.fileName)) break;
        version = migration.version;
    }

    if (appliedNames.size !== version)
    {
        throw new Error('schema_migration does not contain one contiguous migration sequence');
    }

    return version;
}

async function getDockerInitVersion(client)
{
    const documentResult = await client.query('SELECT to_regclass($1) AS table_name', ['public.document']);
    if (!documentResult.rows[0].table_name) return 0;

    const searchableTextResult = await client.query(`
        SELECT EXISTS
        (
            SELECT 1
            FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = 'document_chunk'
              AND column_name = 'searchable_text'
        ) AS exists
    `);

    if (searchableTextResult.rows[0].exists) return 21;

    throw new Error('Cannot determine the version of this legacy RAG database safely');
}

async function getCurrentVersion(client, migrations)
{
    const metadataVersion = await getMetadataVersion(client);
    if (metadataVersion !== null) return metadataVersion;

    const schemaMigrationVersion = await getSchemaMigrationVersion(client, migrations);
    if (schemaMigrationVersion !== null) return schemaMigrationVersion;

    return getDockerInitVersion(client);
}

async function updateDatabase()
{
    const migrations = await getMigrations();
    const client = new Client(getDatabaseConfig());
    let lockAcquired = false;

    await client.connect();

    try
    {
        await client.query('SELECT pg_advisory_lock($1)', [migrationLockId]);
        lockAcquired = true;

        const currentVersion = await getCurrentVersion(client, migrations);
        const latestVersion = migrations.at(-1)?.version ?? 0;

        if (currentVersion > latestVersion)
        {
            throw new Error(`Database version ${currentVersion} is newer than available migration version ${latestVersion}`);
        }

        for (const migration of migrations.filter(({ version }) => version > currentVersion))
        {
            console.log(`Applying migration ${migration.fileName}`);
            const sql = await readFile(path.join(migrationDirectory, migration.fileName), 'utf8');

            await client.query('BEGIN');

            try
            {
                await client.query(sql);

                if (migration.version >= metadataMigrationVersion)
                {
                    await client.query(
                        `INSERT INTO ${metadataTableName} (code, value) VALUES ($1, $2) ON CONFLICT (code) DO UPDATE SET value = EXCLUDED.value`,
                        [databaseVersionCode, String(migration.version)]
                    );
                }

                await client.query('COMMIT');
            }
            catch (error)
            {
                await client.query('ROLLBACK');
                throw error;
            }
        }

        console.log(`Database is up to date at version ${latestVersion}`);
    }
    finally
    {
        try
        {
            if (lockAcquired) await client.query('SELECT pg_advisory_unlock($1)', [migrationLockId]);
        }
        finally
        {
            await client.end();
        }
    }
}

await updateDatabase();