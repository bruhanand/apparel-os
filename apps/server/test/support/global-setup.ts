import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { PostgreSqlContainer } from '@testcontainers/postgresql';
import { Client } from 'pg';
import type { TestProject } from 'vitest/node';
import type { PostgresServer } from './postgres.js';

// One PostgreSQL container for the whole integration run, with both roles created from the reviewed role SQL
// (code-house-rules 5.1, 11.3). Each test file makes its own databases in it (support/postgres.ts).
// The major version must match Railway's (CH-2, OPEN).
export default async function setup(project: TestProject): Promise<() => Promise<void>> {
  const container = await new PostgreSqlContainer('postgres:17-alpine').start();
  const server: PostgresServer = {
    host: container.getHost(),
    port: container.getPort(),
    superuserUrl: container.getConnectionUri(),
    // Throwaway passwords for this run only. Never a real credential.
    migrationPassword: randomBytes(16).toString('hex'),
    runtimePassword: randomBytes(16).toString('hex'),
  };

  const client = new Client({ connectionString: server.superuserUrl });
  await client.connect();
  try {
    await client.query(readFileSync(new URL('../../db/roles.sql', import.meta.url), 'utf8'));
    await client.query(`alter role aos_migration password ${client.escapeLiteral(server.migrationPassword)}`);
    await client.query(`alter role aos_runtime password ${client.escapeLiteral(server.runtimePassword)}`);
  } finally {
    await client.end();
  }

  project.provide('postgres', server);
  return async () => {
    await container.stop();
  };
}
