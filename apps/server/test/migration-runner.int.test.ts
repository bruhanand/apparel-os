import { copyFileSync, mkdirSync, mkdtempSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { migrateAll, migrateDatabase, migrationSetFolder } from '../src/kernel/index.js';
import { connect, createEmptyDatabase, databaseUrl, dropDatabase } from './support/postgres.js';

// S0-T05: the migration runner (code-house-rules 4.3; deployment.md section 4). The sets here are synthetic,
// written to a temporary folder; each starts with the repository's own runner record.

const RECORD = '0001__kernel__migration_record.sql';
const scratch = mkdtempSync(join(tmpdir(), 'aos-migrations-'));
const databases: string[] = [];

afterAll(() => {
  rmSync(scratch, { recursive: true, force: true });
});

afterEach(async () => {
  for (const name of databases.splice(0)) await dropDatabase(name);
});

/** Writes a synthetic set: the runner record, then the given files. */
function writeSet(name: string, files: Record<string, string>): string {
  const folder = join(scratch, name);
  mkdirSync(folder);
  copyFileSync(join(migrationSetFolder('organisation'), RECORD), join(folder, RECORD));
  for (const [fileName, text] of Object.entries(files)) writeFileSync(join(folder, fileName), text);
  return folder;
}

async function emptyDatabase(label: string): Promise<string> {
  const name = await createEmptyDatabase(label);
  databases.push(name);
  return name;
}

async function query<T extends object>(database: string, text: string): Promise<T[]> {
  const client = await connect(database, 'migration');
  try {
    return (await client.query<T>(text)).rows;
  } finally {
    await client.end();
  }
}

async function exists(database: string, relation: string): Promise<boolean> {
  const rows = await query<{ present: boolean }>(
    database,
    `select pg_catalog.to_regclass('${relation}') is not null as present`,
  );
  return rows[0]?.present === true;
}

async function recordedFiles(database: string): Promise<string[]> {
  const rows = await query<{ file_name: string }>(
    database,
    'select file_name from kernel.migration order by file_name',
  );
  return rows.map((row) => row.file_name);
}

describe('migrateDatabase (code-house-rules 4.3)', () => {
  it('PRD-MOD-011 a failing migration leaves the earlier state, and a rerun applies only what is left', async () => {
    const folder = writeSet('failing', {
      '0002__kernel__syn_first.sql': 'create table kernel.syn_first (id int primary key);',
      '0003__kernel__syn_second.sql': 'create table kernel.syn_second (id int primary key);\nselect 1 / 0;',
    });
    const database = await emptyDatabase('failing');
    const connectionString = databaseUrl(database, 'migration');

    await expect(migrateDatabase({ connectionString, folder })).rejects.toThrow(/0003__kernel__syn_second\.sql failed/);
    expect(await exists(database, 'kernel.syn_first')).toBe(true);
    expect(await exists(database, 'kernel.syn_second')).toBe(false);
    expect(await recordedFiles(database)).toEqual([RECORD, '0002__kernel__syn_first.sql']);

    writeFileSync(join(folder, '0003__kernel__syn_second.sql'), 'create table kernel.syn_second (id int primary key);');
    expect(await migrateDatabase({ connectionString, folder })).toEqual(['0003__kernel__syn_second.sql']);
    expect(await exists(database, 'kernel.syn_second')).toBe(true);
  });

  it('records each file with its checksum and the role that applied it', async () => {
    const database = await emptyDatabase('record');
    await migrateDatabase({
      connectionString: databaseUrl(database, 'migration'),
      folder: migrationSetFolder('organisation'),
    });
    const rows = await query<{ file_name: string; checksum_sha256: string; applied_by: string }>(
      database,
      'select file_name, checksum_sha256, applied_by from kernel.migration order by file_name',
    );
    expect(rows.map((row) => row.file_name)).toEqual([RECORD, '0002__kernel__refuse_change.sql']);
    for (const row of rows) {
      expect(row.checksum_sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(row.applied_by).toBe('aos_migration');
    }
  });

  it('PRD-SEC-015 refuses a file changed after it was applied, and a file applied but gone', async () => {
    const folder = writeSet('changed', { '0002__kernel__syn_first.sql': 'create table kernel.syn_first (id int);' });
    const database = await emptyDatabase('changed');
    const connectionString = databaseUrl(database, 'migration');
    await migrateDatabase({ connectionString, folder });

    writeFileSync(join(folder, '0002__kernel__syn_first.sql'), 'create table kernel.syn_first (id bigint);');
    await expect(migrateDatabase({ connectionString, folder })).rejects.toThrow(/has changed since it was applied/);

    unlinkSync(join(folder, '0002__kernel__syn_first.sql'));
    await expect(migrateDatabase({ connectionString, folder })).rejects.toThrow(/is missing from the set/);
  });

  it('waits while another run holds the database, then finds nothing left to apply', async () => {
    const folder = writeSet('locked', { '0002__kernel__syn_first.sql': 'create table kernel.syn_first (id int);' });
    const database = await emptyDatabase('locked');
    const connectionString = databaseUrl(database, 'migration');

    // A first session holds the runner's lock; the run must wait for it (code-house-rules 10.3: no sleep orders it).
    const holder = await connect(database, 'migration');
    await holder.query(`select pg_catalog.pg_advisory_lock(pg_catalog.hashtextextended('aos.kernel.migration', 0))`);
    const run = migrateDatabase({ connectionString, folder });
    const watcher = await connect(database, 'migration');
    try {
      for (;;) {
        const waiting = await watcher.query<{ count: string }>(
          `select count(*) from pg_catalog.pg_locks
           where locktype = 'advisory' and not granted
             and database = (select oid from pg_catalog.pg_database where datname = current_database())`,
        );
        if (waiting.rows[0]?.count === '1') break;
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      expect(await exists(database, 'kernel.migration')).toBe(false);
    } finally {
      await watcher.end();
      await holder.end();
    }
    expect(await run).toEqual([RECORD, '0002__kernel__syn_first.sql']);

    const [first, second] = await Promise.all([
      migrateDatabase({ connectionString, folder }),
      migrateDatabase({ connectionString, folder }),
    ]);
    expect([first, second]).toEqual([[], []]);
    expect(await recordedFiles(database)).toEqual([RECORD, '0002__kernel__syn_first.sql']);
  });

  it('applies each file once when two runs start together', async () => {
    const folder = writeSet('together', { '0002__kernel__syn_first.sql': 'create table kernel.syn_first (id int);' });
    const database = await emptyDatabase('together');
    const connectionString = databaseUrl(database, 'migration');
    const runs = await Promise.all([
      migrateDatabase({ connectionString, folder }),
      migrateDatabase({ connectionString, folder }),
    ]);
    expect(runs.flat().sort()).toEqual([RECORD, '0002__kernel__syn_first.sql']);
    expect(await recordedFiles(database)).toEqual([RECORD, '0002__kernel__syn_first.sql']);
  });
});

describe('migrateAll, the pre-deploy run (deployment.md section 4)', () => {
  // A database that already holds schema kernel makes the runner record's file fail there.
  async function blockedDatabase(label: string): Promise<string> {
    const name = await emptyDatabase(label);
    await query(name, 'create schema kernel');
    return name;
  }

  it('PRD-MOD-001 migrates the directory, then each Organisation in code order, and stops at the first failure', async () => {
    const directory = await emptyDatabase('dir');
    const first = await emptyDatabase('org_a');
    const failing = await blockedDatabase('org_b');
    const last = await emptyDatabase('org_c');

    await expect(
      migrateAll({
        directoryConnectionString: databaseUrl(directory, 'migration'),
        organisations: [
          { code: 'SYN-C', connectionString: databaseUrl(last, 'migration') },
          { code: 'SYN-B', connectionString: databaseUrl(failing, 'migration') },
          { code: 'SYN-A', connectionString: databaseUrl(first, 'migration') },
        ],
      }),
    ).rejects.toThrow(/0001__kernel__migration_record\.sql failed/);

    expect(await recordedFiles(directory)).toEqual([RECORD]);
    expect(await recordedFiles(first)).toEqual([RECORD, '0002__kernel__refuse_change.sql']);
    expect(await exists(failing, 'kernel.migration')).toBe(false);
    expect(await exists(last, 'kernel.migration')).toBe(false);
  });

  it('touches no Organisation database when the directory fails', async () => {
    const directory = await blockedDatabase('dir');
    const organisation = await emptyDatabase('org_a');
    await expect(
      migrateAll({
        directoryConnectionString: databaseUrl(directory, 'migration'),
        organisations: [{ code: 'SYN-A', connectionString: databaseUrl(organisation, 'migration') }],
      }),
    ).rejects.toThrow(/failed/);
    expect(await exists(organisation, 'kernel.migration')).toBe(false);
  });
});
