import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { migrationSetFolder, readMigrationSet } from '../src/kernel/index.js';
import { SYNTHETIC_ORGANISATIONS, syntheticDatabaseName } from './fixtures/synthetic.js';
import {
  connect,
  createEmptyDatabase,
  databaseGrants,
  databaseUrl,
  dropDatabase,
  RUNNER_GRANTS,
} from './support/postgres.js';

// S0-T06: the local seed, `pnpm seed` (node dist-seed/test/seed/seed.js), run as its own process
// (code-house-rules 11.2). Turborepo builds the seed before the server's integration tests, so this is the code under
// test. It creates databases with fixed synthetic names; no other test file uses them.

const COMMAND = fileURLToPath(new URL('../dist-seed/test/seed/seed.js', import.meta.url));
const SEEDED = SYNTHETIC_ORGANISATIONS.map((organisation) => syntheticDatabaseName(organisation.code));

const SEED_VARIABLES = [
  'AOS_ENVIRONMENT',
  'AOS_MIGRATION_DATABASE_URL',
  'RAILWAY_ENVIRONMENT_NAME',
  'RAILWAY_ENVIRONMENT',
];

interface Outcome {
  readonly exitCode: number | null;
  readonly output: string;
}

function runSeed(variables: Record<string, string>): Promise<Outcome> {
  // The seed's own variables come only from the test, never from the shell that runs it.
  const inherited = Object.entries(process.env).filter(([name]) => !SEED_VARIABLES.includes(name));
  const env: NodeJS.ProcessEnv = { ...Object.fromEntries(inherited), ...variables };
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

async function onServer<T>(query: string, values: unknown[]): Promise<T[]> {
  const client = await connect('postgres', 'superuser');
  try {
    return (await client.query(query, values)).rows as T[];
  } finally {
    await client.end();
  }
}

async function seededDatabases(): Promise<{ datname: string; owner: string }[]> {
  return onServer(
    'select datname, pg_catalog.pg_get_userbyid(datdba) as owner from pg_catalog.pg_database where datname = any($1) order by 1',
    [SEEDED],
  );
}

async function hasKernel(database: string): Promise<boolean> {
  const client = await connect(database, 'superuser');
  try {
    const result = await client.query<{ n: number }>(
      "select count(*)::int as n from pg_catalog.pg_namespace where nspname = 'kernel'",
    );
    return result.rows[0]?.n === 1;
  } finally {
    await client.end();
  }
}

let directory: string;
let untouched: string;

beforeAll(async () => {
  if (!existsSync(COMMAND)) throw new Error(`${COMMAND} is missing: run pnpm build:seed first`);
  directory = await createEmptyDatabase('seed_directory');
  untouched = await createEmptyDatabase('seed_superuser');
});

afterAll(async () => {
  for (const name of [directory, untouched, ...SEEDED]) await dropDatabase(name);
});

describe('pnpm seed, the local seed (code-house-rules 11.2)', () => {
  it.each([
    [{}, 'AOS_ENVIRONMENT is not set'],
    [{ AOS_ENVIRONMENT: 'kdps-test' }, 'AOS_ENVIRONMENT is kdps-test'],
    [{ AOS_ENVIRONMENT: 'dev', RAILWAY_ENVIRONMENT_NAME: 'kdps-test' }, 'RAILWAY_ENVIRONMENT_NAME is kdps-test'],
  ])('refuses to run with %o and changes nothing', async (variables, reason) => {
    const outcome = await runSeed({ ...variables, AOS_MIGRATION_DATABASE_URL: databaseUrl(directory, 'migration') });
    expect(outcome.exitCode).toBe(1);
    expect(outcome.output).toContain(`Seed refused, nothing changed: ${reason}`);
    expect(await hasKernel(directory)).toBe(false);
    expect(await seededDatabases()).toEqual([]);
  });

  it('exits 1 when the connection variable is not set', async () => {
    const outcome = await runSeed({ AOS_ENVIRONMENT: 'local' });
    expect(outcome.exitCode).toBe(1);
    expect(outcome.output).toContain('AOS_MIGRATION_DATABASE_URL is not set');
  });

  it('PRD-SEC-005 PRD-SEC-014 refuses a superuser connection before creating anything, and logs no credential', async () => {
    const connectionString = databaseUrl(untouched, 'superuser');
    const outcome = await runSeed({ AOS_ENVIRONMENT: 'local', AOS_MIGRATION_DATABASE_URL: connectionString });
    expect(outcome.exitCode).toBe(1);
    expect(outcome.output).toContain('Migration refused, nothing changed');
    expect(outcome.output).not.toMatch(/postgres(ql)?:\/\//);
    expect(await hasKernel(untouched)).toBe(false);
    expect(await seededDatabases()).toEqual([]);
  });

  it('PRD-SEC-014 refuses a connection string it cannot point at another database, before changing anything, without logging it', async () => {
    // A Unix-socket form that pg accepts but that is not a URL with a host. The password is this run's real one.
    const password = inject('postgres').migrationPassword;
    const connectionString = `postgres://aos_migration:${password}@/${directory}?host=/tmp`;
    const outcome = await runSeed({ AOS_ENVIRONMENT: 'local', AOS_MIGRATION_DATABASE_URL: connectionString });
    expect(outcome.exitCode).toBe(1);
    expect(outcome.output).toContain('Seed refused, nothing changed: AOS_MIGRATION_DATABASE_URL must have the form');
    expect(outcome.output).not.toContain(password);
    expect(await hasKernel(directory)).toBe(false);
    expect(await seededDatabases()).toEqual([]);
  });

  it('PRD-ACS-020 creates the two synthetic Organisations, each with its own migrated database, and reruns cleanly', async () => {
    const variables = { AOS_ENVIRONMENT: 'local', AOS_MIGRATION_DATABASE_URL: databaseUrl(directory, 'migration') };
    const first = await runSeed(variables);
    expect(first.exitCode).toBe(0);
    for (const organisation of SYNTHETIC_ORGANISATIONS) {
      expect(first.output).toContain(
        `${organisation.code} (${organisation.name}): database ${syntheticDatabaseName(organisation.code)} created`,
      );
    }
    expect(first.output).not.toMatch(/postgres(ql)?:\/\//);
    expect(await hasKernel(directory)).toBe(true);
    expect(await databaseGrants(directory)).toEqual(RUNNER_GRANTS);
    expect(await seededDatabases()).toEqual(SEEDED.map((datname) => ({ datname, owner: 'aos_migration' })));

    for (const database of SEEDED) {
      // The runner's database step reached each one (code-house-rules 4.3), and the runtime role connects.
      expect(await databaseGrants(database)).toEqual(RUNNER_GRANTS);
      const runtime = await connect(database, 'runtime');
      try {
        expect((await runtime.query('select 1 as one')).rows).toEqual([{ one: 1 }]);
      } finally {
        await runtime.end();
      }
      const owner = await connect(database, 'migration');
      try {
        const files = await owner.query<{ file_name: string }>('select file_name from kernel.migration order by 1');
        expect(files.rows.map((row) => row.file_name)).toEqual(
          readMigrationSet(migrationSetFolder('organisation')).map((file) => file.fileName),
        );
      } finally {
        await owner.end();
      }
    }

    const second = await runSeed(variables);
    expect(second.exitCode).toBe(0);
    for (const database of SEEDED) {
      expect(second.output).toContain(`database ${database} already there, 0 migration(s) applied`);
    }
  });
});
