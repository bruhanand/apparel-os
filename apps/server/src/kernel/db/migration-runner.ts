import { uuidv7 } from '@apparel-os/domain';
import { Client } from 'pg';
import { applyDatabasePrivileges } from './database-privileges.js';
import { readMigrationSet, type MigrationFile } from './migration-set.js';

export interface MigrateDatabaseOptions {
  /** A connection to one database as the migration role, aos_migration (code-house-rules 5.1). */
  readonly connectionString: string;
  /** The folder of the set to apply (code-house-rules 4.1). */
  readonly folder: string;
  /** Told each file name once its transaction has committed. */
  readonly onApplied?: (fileName: string) => void;
}

interface AppliedRecord {
  file_name: string;
  checksum_sha256: string;
}

// One key for every run, held per database: advisory locks are local to the database they are taken in.
const LOCK_KEY = "pg_catalog.hashtextextended('aos.kernel.migration', 0)";

/**
 * Applies a migration set to one database (code-house-rules 4.3). Holds a session advisory lock from the first
 * file to the last, so two runs never migrate one database at once. Each pending file runs in its own transaction
 * with its record in kernel.migration, so a failing file leaves the database as it was before that file, and the
 * run stops there. Then applies the database step of 4.3. Returns the files it applied.
 */
export async function migrateDatabase(options: MigrateDatabaseOptions): Promise<string[]> {
  const files = readMigrationSet(options.folder);
  const client = new Client({ connectionString: options.connectionString });
  await client.connect();
  try {
    await client.query(`select pg_catalog.pg_advisory_lock(${LOCK_KEY})`);
    const pending = pendingFiles(files, await readApplied(client));
    const applied: string[] = [];
    for (const file of pending) {
      await applyFile(client, file);
      applied.push(file.fileName);
      options.onApplied?.(file.fileName);
    }
    await applyDatabasePrivileges(client);
    await client.query(`select pg_catalog.pg_advisory_unlock(${LOCK_KEY})`);
    return applied;
  } finally {
    // Closing the session also releases the advisory lock if the run failed.
    await client.end();
  }
}

async function readApplied(client: Client): Promise<AppliedRecord[]> {
  const present = await client.query<{ present: boolean }>(
    "select pg_catalog.to_regclass('kernel.migration') is not null as present",
  );
  if (present.rows[0]?.present !== true) return [];
  const records = await client.query<AppliedRecord>(
    'select file_name, checksum_sha256 from kernel.migration order by file_name',
  );
  return records.rows;
}

/**
 * The files not yet applied. Refuses a recorded file that is gone or whose checksum changed, since an applied file
 * is never edited (code-house-rules 4.2), and a new file numbered before one already applied.
 */
function pendingFiles(files: readonly MigrationFile[], applied: readonly AppliedRecord[]): MigrationFile[] {
  const byName = new Map(files.map((file) => [file.fileName, file]));
  let lastApplied = 0;
  for (const record of applied) {
    const file = byName.get(record.file_name);
    if (file === undefined) {
      throw new Error(`Applied migration ${record.file_name} is missing from the set`);
    }
    if (file.checksumSha256 !== record.checksum_sha256) {
      throw new Error(`Applied migration ${record.file_name} has changed since it was applied`);
    }
    lastApplied = Math.max(lastApplied, file.number);
  }
  const appliedNames = new Set(applied.map((record) => record.file_name));
  const pending = files.filter((file) => !appliedNames.has(file.fileName));
  const early = pending.find((file) => file.number < lastApplied);
  if (early !== undefined) {
    throw new Error(`Migration ${early.fileName} is numbered before a file already applied`);
  }
  return pending;
}

async function applyFile(client: Client, file: MigrationFile): Promise<void> {
  await client.query('begin');
  try {
    // No parameters, so the file goes as one simple query and may hold several statements.
    await client.query(file.sql);
    await client.query(
      'insert into kernel.migration (id, file_name, checksum_sha256, applied_by) values ($1, $2, $3, current_user)',
      [uuidv7(), file.fileName, file.checksumSha256],
    );
    await client.query('commit');
  } catch (error) {
    await client.query('rollback');
    throw new Error(`Migration ${file.fileName} failed; the database is as it was before it`, { cause: error });
  }
}
