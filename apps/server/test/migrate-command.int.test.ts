import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { uuidv7 } from '@apparel-os/domain';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { migrationSetFolder, readMigrationSet } from '../src/kernel/index.js';
import { SYNTHETIC_ORGANISATIONS, syntheticCode } from './fixtures/synthetic.js';
import { connect, createEmptyDatabase, databaseUrl, dropDatabase } from './support/postgres.js';

// S0-T05, S1-F01-T02: the pre-deploy command itself, `pnpm migrate` (node dist/migrate.js), run as its own process
// the way a deploy runs it (deployment.md section 4; code-house-rules 4.3): the directory database, then every
// Organisation database the directory lists, in code order, stopping at the first that fails.
// Turborepo builds the server before its integration tests, so dist/migrate.js is the code under test.

const COMMAND = fileURLToPath(new URL('../dist/migrate.js', import.meta.url));
const DIRECTORY_FILES = readMigrationSet(migrationSetFolder('directory')).map((file) => file.fileName);
const ORGANISATION_FILES = readMigrationSet(migrationSetFolder('organisation')).map((file) => file.fileName);

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
    const present = await client.query<{ present: boolean }>(
      "select pg_catalog.to_regclass('kernel.migration') is not null as present",
    );
    if (present.rows[0]?.present !== true) return [];
    const result = await client.query<{ file_name: string }>('select file_name from kernel.migration order by 1');
    return result.rows.map((row) => row.file_name);
  } finally {
    await client.end();
  }
}

/** Lists Organisations in a migrated directory, as the fixtures do until the setup step exists (11.2). */
async function list(directory: string, entries: readonly { code: string; database: string }[]): Promise<void> {
  const client = await connect(directory, 'migration');
  try {
    for (const entry of entries) {
      await client.query(
        'insert into kernel.directory_entry (id, organisation_code, database_name) values ($1, $2, $3)',
        [uuidv7(), entry.code, entry.database],
      );
    }
  } finally {
    await client.end();
  }
}

const created: string[] = [];

async function emptyDatabase(label: string, owner: 'migration' | 'superuser' = 'migration'): Promise<string> {
  const name = await createEmptyDatabase(label, owner);
  created.push(name);
  return name;
}

beforeAll(() => {
  if (!existsSync(COMMAND)) throw new Error(`${COMMAND} is missing: run pnpm build first`);
});

afterAll(async () => {
  for (const name of created) await dropDatabase(name);
});

describe('pnpm migrate, the pre-deploy command', () => {
  it('PRD-MOD-001 DEC-093 migrates the directory, then both synthetic Organisation databases the directory lists', async () => {
    const directory = await emptyDatabase('cmd_directory');
    const [first, second] = SYNTHETIC_ORGANISATIONS;
    const organisations = [
      { code: first.code, database: await emptyDatabase('cmd_org_a') },
      { code: second.code, database: await emptyDatabase('cmd_org_b') },
    ];

    // A first deploy: the directory's table does not exist until its migrations run, so it lists nobody yet.
    const initial = await runCommand(databaseUrl(directory, 'migration'));
    expect(initial.exitCode).toBe(0);
    for (const file of DIRECTORY_FILES) expect(initial.output).toContain(`Applied ${file} to the directory database`);
    expect(initial.output).toContain('Migrated the directory database and 0 Organisation database(s): none listed');
    expect(await recordedFiles(directory)).toEqual(DIRECTORY_FILES);

    await list(directory, organisations);
    const run = await runCommand(databaseUrl(directory, 'migration'));
    expect(run.exitCode).toBe(0);
    expect(run.output).not.toContain('to the directory database');
    for (const organisation of organisations) {
      for (const file of ORGANISATION_FILES) {
        expect(run.output).toContain(`Applied ${file} to the Organisation ${organisation.code} database`);
      }
      expect(await recordedFiles(organisation.database)).toEqual(ORGANISATION_FILES);
    }
    expect(run.output).toContain(
      `Migrated the directory database and 2 Organisation database(s): ${first.code}, ${second.code}`,
    );
    // In code order: the first Organisation's files are all applied before the second's.
    expect(run.output.lastIndexOf(`Organisation ${first.code}`)).toBeLessThan(
      run.output.indexOf(`Organisation ${second.code}`),
    );
    expect(run.output).not.toMatch(/postgres(ql)?:\/\//);

    const again = await runCommand(databaseUrl(directory, 'migration'));
    expect(again.exitCode).toBe(0);
    expect(again.output).not.toContain('Applied');
    expect(again.output).toContain('Migrated the directory database and 2 Organisation database(s)');
  });

  it('PRD-MOD-001 stops at the first Organisation that fails, in code order, and touches none after it', async () => {
    const directory = await emptyDatabase('cmd_stop_directory');
    const before = await emptyDatabase('cmd_stop_org_a');
    // An Organisation database that already holds schema kernel makes the runner record's file fail there.
    const failing = await emptyDatabase('cmd_stop_org_b');
    const owner = await connect(failing, 'migration');
    try {
      await owner.query('create schema kernel');
    } finally {
      await owner.end();
    }
    const after = await emptyDatabase('cmd_stop_org_c');

    expect((await runCommand(databaseUrl(directory, 'migration'))).exitCode).toBe(0);
    // Listed out of order, so the command's own ordering decides.
    await list(directory, [
      { code: syntheticCode('ORG-C'), database: after },
      { code: syntheticCode('ORG-A'), database: before },
      { code: syntheticCode('ORG-B'), database: failing },
    ]);

    const outcome = await runCommand(databaseUrl(directory, 'migration'));
    expect(outcome.exitCode).toBe(1);
    expect(outcome.output).toContain(
      `Organisation ${syntheticCode('ORG-B')}: Migration 0001__kernel__migration_record.sql failed`,
    );
    expect(outcome.output).toContain('No Organisation after it in code order was migrated');
    expect(outcome.output).not.toContain('Migrated the directory database and');
    expect(await recordedFiles(before)).toEqual(ORGANISATION_FILES);
    expect(await recordedFiles(failing)).toEqual([]);
    expect(await recordedFiles(after)).toEqual([]);
  });

  it('stops when the directory lists a database that does not exist, and migrates nothing after it', async () => {
    const directory = await emptyDatabase('cmd_missing_directory');
    const after = await emptyDatabase('cmd_missing_org_b');
    expect((await runCommand(databaseUrl(directory, 'migration'))).exitCode).toBe(0);
    await list(directory, [
      { code: syntheticCode('ORG-A'), database: `${after}_missing` },
      { code: syntheticCode('ORG-B'), database: after },
    ]);
    const outcome = await runCommand(databaseUrl(directory, 'migration'));
    expect(outcome.exitCode).toBe(1);
    expect(outcome.output).toContain(`Organisation ${syntheticCode('ORG-A')}:`);
    expect(await recordedFiles(after)).toEqual([]);
  });

  it('exits 1 when the connection variable is not set', async () => {
    const outcome = await runCommand(undefined);
    expect(outcome.exitCode).toBe(1);
    expect(outcome.output).toContain('AOS_MIGRATION_DATABASE_URL is not set');
  });

  it('PRD-SEC-014 refuses a connection string it cannot point at an Organisation database, changing nothing and logging no credential', async () => {
    const directory = await emptyDatabase('cmd_socket_directory');
    const password = inject('postgres').migrationPassword;
    const connectionString = `postgres://aos_migration:${password}@/${directory}?host=/tmp`;
    const outcome = await runCommand(connectionString);
    expect(outcome.exitCode).toBe(1);
    expect(outcome.output).toContain(
      'Migration refused, nothing changed: AOS_MIGRATION_DATABASE_URL must have the form',
    );
    expect(outcome.output).not.toContain(password);
    expect(await recordedFiles(directory)).toEqual([]);
  });

  it('PRD-SEC-005 exits 1 on a superuser connection, changes nothing and logs no credential', async () => {
    const untouched = await emptyDatabase('cmd_superuser');
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
