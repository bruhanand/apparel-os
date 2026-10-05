import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { PostgreSqlContainer } from '@testcontainers/postgresql';
import { Client } from 'pg';
import type { TestProject } from 'vitest/node';
import { migrateDatabase, migrationSetFolder, type MigrationSetName } from '../../src/kernel/index.js';
import type { PostgresServer } from './postgres.js';

// One PostgreSQL container for the whole integration run, with both roles created from the reviewed role SQL
// (code-house-rules 5.1, 11.3), and one migrated template database of each kind. Each test file clones its own
// databases from the templates (support/postgres.ts) and drops them at its end.
// The major version must match Railway's (CH-2, OPEN).
export default async function setup(project: TestProject): Promise<() => Promise<void>> {
  const container = await new PostgreSqlContainer('postgres:17-alpine').start();
  const credentials = {
    host: container.getHost(),
    port: container.getPort(),
    superuserUrl: container.getConnectionUri(),
    // Throwaway passwords for this run only. Never a real credential.
    migrationPassword: randomBytes(16).toString('hex'),
    runtimePassword: randomBytes(16).toString('hex'),
  };

  // A setup that fails part-way stops the container, so no run leaves one behind.
  const client = new Client({ connectionString: credentials.superuserUrl });
  try {
    await client.connect();
    await client.query(readFileSync(new URL('../../db/roles.sql', import.meta.url), 'utf8'));
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
    const server: PostgresServer = { ...credentials, templates };
    project.provide('postgres', server);
  } catch (error) {
    await container.stop();
    throw error;
  } finally {
    await client.end().catch(() => undefined);
  }

  return async () => {
    await container.stop();
  };
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
