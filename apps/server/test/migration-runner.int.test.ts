import { copyFileSync, mkdirSync, mkdtempSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { uuidv7 } from '@apparel-os/domain';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { migrateAll, migrateDatabase, migrationSetFolder, readMigrationSet } from '../src/kernel/index.js';
import { syntheticCode } from './fixtures/synthetic.js';
import {
  connect,
  createEmptyDatabase,
  databaseGrants,
  databaseUrl,
  dropDatabase,
  RUNNER_GRANTS,
} from './support/postgres.js';

// S0-T05, S1-F01-T02: the migration runner (code-house-rules 4.3; deployment.md section 4). The sets here are synthetic,
// written to a temporary folder; each starts with the repository's own runner record.

const RECORD = '0001__kernel__migration_record.sql';
/** Every file of the repository's Organisation set, in order. */
const ORGANISATION_FILES = readMigrationSet(migrationSetFolder('organisation')).map((file) => file.fileName);
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
  writeFileSync(join(folder, 'tables.json'), '{ "tables": [] }\n');
  for (const [fileName, text] of Object.entries(files)) writeFileSync(join(folder, fileName), text);
  return folder;
}

async function emptyDatabase(label: string, owner: 'migration' | 'superuser' = 'migration'): Promise<string> {
  const name = await createEmptyDatabase(label, owner);
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

// Read as the superuser, which can connect to any of these databases, whoever owns it.
async function schemaExists(database: string, schema: string): Promise<boolean> {
  const client = await connect(database, 'superuser');
  try {
    const result = await client.query<{ present: boolean }>(
      'select exists (select 1 from pg_catalog.pg_namespace where nspname = $1) as present',
      [schema],
    );
    return result.rows[0]?.present === true;
  } finally {
    await client.end();
  }
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

  it('PRD-SEC-005 applies the database privilege step: PUBLIC keeps nothing, the runtime role gets CONNECT and USAGE', async () => {
    const database = await emptyDatabase('privileges');
    expect((await databaseGrants(database)).database).toContain('PUBLIC CONNECT');
    await migrateDatabase({
      connectionString: databaseUrl(database, 'migration'),
      folder: migrationSetFolder('directory'),
    });
    expect(await databaseGrants(database)).toEqual(RUNNER_GRANTS);
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
    expect(rows.map((row) => row.file_name)).toEqual(ORGANISATION_FILES);
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

  it('runs the maintenance file after the files on every run, unrecorded (numbering-and-audit 4.4; CH-5)', async () => {
    const folder = writeSet('maintenance', {
      '0002__kernel__syn_first.sql': 'create table kernel.syn_first (id serial primary key);',
      'maintenance.sql': 'insert into kernel.syn_first default values;',
    });
    const database = await emptyDatabase('maintenance');
    const connectionString = databaseUrl(database, 'migration');
    expect(await migrateDatabase({ connectionString, folder })).toEqual([RECORD, '0002__kernel__syn_first.sql']);
    expect(await migrateDatabase({ connectionString, folder })).toEqual([]);
    expect(await query<{ id: number }>(database, 'select id from kernel.syn_first order by id')).toEqual([
      { id: 1 },
      { id: 2 },
    ]);
    expect(await recordedFiles(database)).toEqual([RECORD, '0002__kernel__syn_first.sql']);
  });

  it('fails the run when its maintenance fails, and keeps none of it', async () => {
    const folder = writeSet('maintenance_failing', {
      '0002__kernel__syn_first.sql': 'create table kernel.syn_first (id serial primary key);',
      'maintenance.sql': 'insert into kernel.syn_first default values;\nselect 1 / 0;',
    });
    const database = await emptyDatabase('maintenance_failing');
    const connectionString = databaseUrl(database, 'migration');
    await expect(migrateDatabase({ connectionString, folder })).rejects.toThrow(/maintenance\.sql failed/);
    expect(await query(database, 'select id from kernel.syn_first')).toEqual([]);
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

describe('migrateDatabase refuses before it changes anything', () => {
  const organisationSet = migrationSetFolder('organisation');

  it('PRD-SEC-005 refuses a superuser connection', async () => {
    const database = await emptyDatabase('as_superuser');
    await expect(
      migrateDatabase({ connectionString: databaseUrl(database, 'superuser'), folder: organisationSet }),
    ).rejects.toThrow(/Migration refused, nothing changed: .*is a superuser/);
    expect(await schemaExists(database, 'kernel')).toBe(false);
  });

  it('PRD-SEC-005 refuses the runtime role', async () => {
    const database = await emptyDatabase('as_runtime');
    await expect(
      migrateDatabase({ connectionString: databaseUrl(database, 'runtime'), folder: organisationSet }),
    ).rejects.toThrow(/connected as aos_runtime acting as aos_runtime, not as aos_migration/);
    expect(await schemaExists(database, 'kernel')).toBe(false);
  });

  it('PRD-SEC-005 refuses a database the migration role does not own', async () => {
    const database = await emptyDatabase('foreign_owner', 'superuser');
    await expect(
      migrateDatabase({ connectionString: databaseUrl(database, 'migration'), folder: organisationSet }),
    ).rejects.toThrow(/database syn_foreign_owner_\w+ is owned by \w+, not aos_migration/);
    expect(await schemaExists(database, 'kernel')).toBe(false);
  });

  it('refuses a set holding a file whose name does not follow the pattern, such as .SQL', async () => {
    const set = writeSet('upper_case', { '0002__kernel__syn_first.SQL': 'create table kernel.syn_first (id int);' });
    const database = await emptyDatabase('upper_case');
    await expect(
      migrateDatabase({ connectionString: databaseUrl(database, 'migration'), folder: set }),
    ).rejects.toThrow(/holds 0002__kernel__syn_first\.SQL/);
    expect(await schemaExists(database, 'kernel')).toBe(false);
  });

  it('refuses a set with no migration', async () => {
    const set = join(scratch, 'empty');
    mkdirSync(set);
    writeFileSync(join(set, 'tables.json'), '{ "tables": [] }\n');
    const database = await emptyDatabase('empty_set');
    await expect(
      migrateDatabase({ connectionString: databaseUrl(database, 'migration'), folder: set }),
    ).rejects.toThrow(/holds no migration/);
    expect(await schemaExists(database, 'kernel')).toBe(false);
  });
});

describe('migrateAll, the pre-deploy run (deployment.md section 4)', () => {
  const DIRECTORY_FILES = [RECORD, '0002__kernel__directory_entry.sql'];

  // A database that already holds schema kernel makes the runner record's file fail there.
  async function blockedDatabase(label: string): Promise<string> {
    const name = await emptyDatabase(label);
    await query(name, 'create schema kernel');
    return name;
  }

  /** A migrated directory listing the given Organisations, as the fixtures write it until the setup step (11.2). */
  async function directoryListing(entries: readonly (readonly [string, string])[]): Promise<string> {
    const directory = await emptyDatabase('dir');
    await migrateDatabase({
      connectionString: databaseUrl(directory, 'migration'),
      folder: migrationSetFolder('directory'),
    });
    const client = await connect(directory, 'migration');
    try {
      for (const [code, database] of entries) {
        await client.query(
          'insert into kernel.directory_entry (id, organisation_code, database_name) values ($1, $2, $3)',
          [uuidv7(), code, database],
        );
      }
    } finally {
      await client.end();
    }
    return directory;
  }

  const organisationConnectionString = (database: string): string => databaseUrl(database, 'migration');

  it('PRD-MOD-001 DEC-093 migrates the directory, then each Organisation it lists in code order, and stops at the first failure', async () => {
    const first = await emptyDatabase('org_a');
    const failing = await blockedDatabase('org_b');
    const last = await emptyDatabase('org_c');
    const directory = await directoryListing([
      [syntheticCode('ORG-C'), last],
      [syntheticCode('ORG-B'), failing],
      [syntheticCode('ORG-A'), first],
    ]);
    const applied: string[] = [];

    await expect(
      migrateAll({
        directoryConnectionString: databaseUrl(directory, 'migration'),
        organisationConnectionString,
        onApplied: (database, fileName) => applied.push(`${database} ${fileName}`),
      }),
    ).rejects.toThrow(
      new RegExp(`Organisation ${syntheticCode('ORG-B')}: Migration 0001__kernel__migration_record\\.sql failed`),
    );

    expect(await recordedFiles(directory)).toEqual(DIRECTORY_FILES);
    expect(await recordedFiles(first)).toEqual(ORGANISATION_FILES);
    expect(await exists(failing, 'kernel.migration')).toBe(false);
    expect(await exists(last, 'kernel.migration')).toBe(false);
    expect(applied).toEqual(ORGANISATION_FILES.map((file) => `Organisation ${syntheticCode('ORG-A')} ${file}`));
  });

  it('PRD-MOD-001 reads the directory after migrating it, so a first run migrates the directory and finds nobody', async () => {
    const directory = await emptyDatabase('dir_first');
    const migrated = await migrateAll({
      directoryConnectionString: databaseUrl(directory, 'migration'),
      organisationConnectionString,
    });
    expect(migrated).toEqual([]);
    expect(await recordedFiles(directory)).toEqual(DIRECTORY_FILES);
  });

  it('migrates nothing the directory does not list, and returns what it migrated', async () => {
    const listed = await emptyDatabase('org_listed');
    const unlisted = await emptyDatabase('org_unlisted');
    const directory = await directoryListing([[syntheticCode('ORG-A'), listed]]);
    const migrated = await migrateAll({
      directoryConnectionString: databaseUrl(directory, 'migration'),
      organisationConnectionString,
    });
    expect(migrated).toEqual([{ organisationCode: syntheticCode('ORG-A'), databaseName: listed }]);
    expect(await recordedFiles(listed)).toEqual(ORGANISATION_FILES);
    expect(await exists(unlisted, 'kernel.migration')).toBe(false);
  });

  it('touches no Organisation database when the directory fails', async () => {
    const directory = await blockedDatabase('dir');
    const organisation = await emptyDatabase('org_a');
    await expect(
      migrateAll({
        directoryConnectionString: databaseUrl(directory, 'migration'),
        organisationConnectionString: () => databaseUrl(organisation, 'migration'),
      }),
    ).rejects.toThrow(/failed/);
    expect(await exists(organisation, 'kernel.migration')).toBe(false);
  });
});
