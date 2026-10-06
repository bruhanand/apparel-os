import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PostgreSqlContainer } from '@testcontainers/postgresql';
import { Client } from 'pg';
import { migrateDatabase, migrationSetFolder, type MigrationSetName } from '../../src/kernel/index.js';
import type { PostgresServer } from './postgres.js';

// One PostgreSQL container with both roles created from the reviewed role SQL and the runtime role's time limits for
// synthetic work (code-house-rules 5.1, 11.3), and one migrated template database of each kind. The integration run
// (global-setup.ts) and the server of the browser journeys (test/browser/serve.ts) both start theirs here.
// The major version must match Railway's (CH-2, OPEN).

export interface StartedPostgresServer {
  readonly server: PostgresServer;
  stop(): Promise<void>;
}

/** Starts the container and migrates the templates. A start that fails part-way stops the container. */
export async function startPostgresServer(): Promise<StartedPostgresServer> {
  const container = await new PostgreSqlContainer('postgres:17-alpine').start();
  const credentials = {
    host: container.getHost(),
    port: container.getPort(),
    superuserUrl: container.getConnectionUri(),
    // Throwaway passwords for this run only. Never a real credential.
    migrationPassword: randomBytes(16).toString('hex'),
    runtimePassword: randomBytes(16).toString('hex'),
  };

  const client = new Client({ connectionString: credentials.superuserUrl });
  try {
    await client.connect();
    await client.query(readFileSync(join(serverPackageRoot(), 'db', 'roles.sql'), 'utf8'));
    // Tests work on synthetic data, so the runtime role gets the starting time limits (DEC-112, CH-3, RR-200).
    await client.query(readFileSync(join(serverPackageRoot(), 'db', 'runtime-limits-synthetic.sql'), 'utf8'));
    await client.query(`alter role aos_migration password ${client.escapeLiteral(credentials.migrationPassword)}`);
    await client.query(`alter role aos_runtime password ${client.escapeLiteral(credentials.runtimePassword)}`);

    // Where test files that must run at the same time tell each other how far they got (isolation-probe.ts).
    await client.query(
      'create table public.syn_test_barrier (side text, step text, databases text[], primary key (side, step))',
    );

    const templates = {
      directory: await createTemplate(client, credentials, 'directory'),
      organisation: await createTemplate(client, credentials, 'organisation'),
    };
    return {
      server: { ...credentials, templates },
      stop: async () => {
        await container.stop();
      },
    };
  } catch (error) {
    await container.stop();
    throw error;
  } finally {
    await client.end().catch(() => undefined);
  }
}

/**
 * Migrates a template database once per run, as the migration role, then closes it to every connection, so that it
 * can be cloned while no session is connected to it and no test can change it (code-house-rules 11.3).
 */
async function createTemplate(
  client: Client,
  credentials: Omit<PostgresServer, 'templates'>,
  set: MigrationSetName,
): Promise<string> {
  const name = `syn_template_${set}`;
  await client.query(`create database ${name} owner aos_migration`);
  await migrateDatabase({
    connectionString: `postgres://aos_migration:${credentials.migrationPassword}@${credentials.host}:${String(credentials.port)}/${name}`,
    folder: migrationSetFolder(set),
  });
  await client.query(`alter database ${name} with allow_connections false`);
  return name;
}

/**
 * The server package's root, the nearest folder above this file that holds package.json: the integration run reads
 * this file from test/support and the browser journeys' build from dist-browser/test/support.
 */
function serverPackageRoot(): string {
  let folder = dirname(fileURLToPath(import.meta.url));
  while (!existsSync(join(folder, 'package.json'))) {
    const parent = dirname(folder);
    if (parent === folder) throw new Error('The server package root, holding package.json, was not found');
    folder = parent;
  }
  return folder;
}
