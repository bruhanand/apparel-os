import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { connect, createEmptyDatabase, databaseUrl, dropDatabase } from './support/postgres.js';

// S0-T05: the pre-deploy command itself, `pnpm migrate` (node dist/migrate.js), run as its own process the way a
// deploy runs it (deployment.md section 4). It is directory-only until Organisation routing exists (S1-F01-T02).
// Turborepo builds the server before its integration tests, so dist/migrate.js is the code under test.

const COMMAND = fileURLToPath(new URL('../dist/migrate.js', import.meta.url));

interface Outcome {
  readonly exitCode: number | null;
  readonly output: string;
}

function runCommand(connectionString: string | undefined): Promise<Outcome> {
  const env: NodeJS.ProcessEnv = { ...process.env };
  delete env.AOS_MIGRATION_DATABASE_URL;
  if (connectionString !== undefined) env.AOS_MIGRATION_DATABASE_URL = connectionString;
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [COMMAND], { env });
    let output = '';
    child.stdout.on('data', (chunk: Buffer) => (output += chunk.toString('utf8')));
    child.stderr.on('data', (chunk: Buffer) => (output += chunk.toString('utf8')));
    child.on('error', reject);
    child.on('close', (exitCode) => {
      resolve({ exitCode, output });
    });
  });
}

async function recordedFiles(database: string): Promise<string[]> {
  const client = await connect(database, 'migration');
  try {
    const result = await client.query<{ file_name: string }>('select file_name from kernel.migration order by 1');
    return result.rows.map((row) => row.file_name);
  } finally {
    await client.end();
  }
}

let directory: string;
let untouched: string;

beforeAll(async () => {
  if (!existsSync(COMMAND)) throw new Error(`${COMMAND} is missing: run pnpm build first`);
  directory = await createEmptyDatabase('cmd_directory');
  untouched = await createEmptyDatabase('cmd_superuser');
});

afterAll(async () => {
  await dropDatabase(directory);
  await dropDatabase(untouched);
});

describe('pnpm migrate, the pre-deploy command', () => {
  it('migrates the directory database and says no Organisation database was migrated', async () => {
    const first = await runCommand(databaseUrl(directory, 'migration'));
    expect(first.exitCode).toBe(0);
    expect(first.output).toContain('Applied 0001__kernel__migration_record.sql to the directory database');
    expect(first.output).toContain('No Organisation database was migrated: this command is directory-only');
    expect(await recordedFiles(directory)).toEqual(['0001__kernel__migration_record.sql']);

    const second = await runCommand(databaseUrl(directory, 'migration'));
    expect(second.exitCode).toBe(0);
    expect(second.output).not.toContain('Applied');
  });

  it('exits 1 when the connection variable is not set', async () => {
    const outcome = await runCommand(undefined);
    expect(outcome.exitCode).toBe(1);
    expect(outcome.output).toContain('AOS_MIGRATION_DATABASE_URL is not set');
  });

  it('PRD-SEC-005 exits 1 on a superuser connection, changes nothing and logs no credential', async () => {
    const connectionString = databaseUrl(untouched, 'superuser');
    const outcome = await runCommand(connectionString);
    expect(outcome.exitCode).toBe(1);
    expect(outcome.output).toContain('Migration refused, nothing changed');
    // The container's superuser password is the word "test", which the log also holds as the role name, so the
    // check is on the connection string and on the password as it sits in one.
    const { password } = new URL(connectionString);
    expect(outcome.output).not.toContain(connectionString);
    expect(outcome.output).not.toContain(`:${password}@`);
    expect(outcome.output).not.toMatch(/postgres(ql)?:\/\//);

    const client = await connect(untouched, 'superuser');
    try {
      const result = await client.query(
        "select count(*)::int as n from pg_catalog.pg_namespace where nspname = 'kernel'",
      );
      expect(result.rows[0]).toEqual({ n: 0 });
    } finally {
      await client.end();
    }
  });
});
