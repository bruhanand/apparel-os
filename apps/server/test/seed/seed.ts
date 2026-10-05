import { uuidv7 } from '@apparel-os/domain';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Client } from 'pg';
import {
  connectionToDatabase,
  listDirectory,
  migrateDatabase,
  migrationSetFolder,
  PinoLoggerService,
  type DirectoryEntry,
} from '../../src/kernel/index.js';
import { isSyntheticCode, SYNTHETIC_ORGANISATIONS, syntheticDatabaseName } from '../fixtures/synthetic.js';
import { seedRefusal } from './environment.js';

// The local seed, `pnpm seed` (code-house-rules 11.2): the same two synthetic Organisations the database tests use,
// each with its own database, listed in the directory database beside them. It refuses to run unless AOS_ENVIRONMENT
// says local or dev (environment.ts). It is built apart from the application (tsconfig.seed.json), so no fixture
// reaches dist.
//
// AOS_MIGRATION_DATABASE_URL connects to the directory database as aos_migration, as for `pnpm migrate`; it is never
// logged. Before anything changes, the seed refuses a directory that already lists an Organisation that is not
// synthetic, or lists one of its own codes at another database (RR-195). Then it migrates the directory database,
// which refuses any other role or a database that role does not own before anything is changed; creates each
// Organisation's database if it is missing, owned by aos_migration, and migrates it; and last lists each in the
// directory, as the setup step will (access-and-approvals 9.11). A second run changes nothing.
//
// The directory rows are written directly, the fewest rows the Organisations need, until the setup step
// (S1-F01-T10) replaces them (code-house-rules 11.2; RR-194).
const logger = new PinoLoggerService();

interface Target {
  readonly code: string;
  readonly name: string;
  readonly database: string;
  readonly connectionString: string;
}

async function seed(connectionString: string, targets: readonly Target[]): Promise<void> {
  const refusal = directoryRefusal(await readDirectoryIfPresent(connectionString), targets);
  if (refusal !== undefined) throw new Error(`Seed refused, nothing changed: ${refusal}`);

  await migrateDatabase({ connectionString, folder: migrationSetFolder('directory') });
  logger.log('Directory database migrated', 'Seed');

  for (const target of targets) {
    const created = await createIfMissing(connectionString, target.database);
    const applied = await migrateDatabase({
      connectionString: target.connectionString,
      folder: migrationSetFolder('organisation'),
    });
    logger.log(
      `${target.code} (${target.name}): database ${target.database} ${created ? 'created' : 'already there'}, ${String(applied.length)} migration(s) applied`,
      'Seed',
    );
  }
  for (const target of targets) {
    const listed = await listInDirectory(connectionString, target);
    logger.log(`${target.code}: ${listed ? 'listed in the directory' : 'already listed in the directory'}`, 'Seed');
  }
  logger.log('Seeded the two synthetic Organisations', 'Seed');
}

/**
 * Why the seed must not touch this directory, or undefined (RR-195). A directory listing any Organisation whose code
 * is not synthetic is a real environment's, whatever AOS_ENVIRONMENT says. One listing a seed code at another
 * database is not the seed's own; the seed never repoints it.
 */
function directoryRefusal(listed: readonly DirectoryEntry[], targets: readonly Target[]): string | undefined {
  if (listed.some((entry) => !isSyntheticCode(entry.organisationCode))) {
    return 'the directory lists an Organisation that is not synthetic; the seed runs only on a directory of synthetic Organisations';
  }
  const elsewhere = targets.filter((target) =>
    listed.some((entry) => (entry.organisationCode === target.code) !== (entry.databaseName === target.database)),
  );
  if (elsewhere.length > 0) {
    return `the directory lists ${elsewhere.map((target) => target.code).join(', ')} or its database otherwise than the seed does`;
  }
  return undefined;
}

/** The directory's entries, or none while its table does not exist yet. Reads only. */
async function readDirectoryIfPresent(connectionString: string): Promise<DirectoryEntry[]> {
  const client = new Client({ connectionString });
  await client.connect();
  try {
    const present = await client.query<{ present: boolean }>(
      "select pg_catalog.to_regclass('kernel.directory_entry') is not null as present",
    );
    if (present.rows[0]?.present !== true) return [];
    return await listDirectory(drizzle({ client }));
  } finally {
    await client.end();
  }
}

/** Lists one Organisation in the directory unless it is listed already. Returns whether it wrote the row. */
async function listInDirectory(connectionString: string, target: Target): Promise<boolean> {
  const client = new Client({ connectionString });
  await client.connect();
  try {
    const result = await client.query(
      `insert into kernel.directory_entry (id, organisation_code, database_name) values ($1, $2, $3)
       on conflict (organisation_code) do nothing`,
      [uuidv7(), target.code, target.database],
    );
    return result.rowCount === 1;
  } finally {
    await client.end();
  }
}

/**
 * Each Organisation's connection: the directory's, pointed at that Organisation's database. Worked out before anything
 * changes. A connection string that is not a URL with a host is refused without echoing it, because it holds the
 * password: the parser's own error would carry the whole string into the log (PRD-SEC-014).
 */
function targetsFrom(connectionString: string): Target[] | undefined {
  const connectionTo = connectionToDatabase(connectionString);
  if (connectionTo === undefined) return undefined;
  return SYNTHETIC_ORGANISATIONS.map((organisation) => {
    const database = syntheticDatabaseName(organisation.code);
    return { ...organisation, database, connectionString: connectionTo(database) };
  });
}

async function createIfMissing(connectionString: string, database: string): Promise<boolean> {
  const client = new Client({ connectionString });
  await client.connect();
  try {
    const found = await client.query('select 1 from pg_catalog.pg_database where datname = $1', [database]);
    if (found.rowCount !== 0) return false;
    // Made by aos_migration, which so owns it (code-house-rules 5.1).
    await client.query(`create database ${client.escapeIdentifier(database)}`);
    return true;
  } finally {
    await client.end();
  }
}

const refusal = seedRefusal(process.env);
const connectionString = process.env.AOS_MIGRATION_DATABASE_URL;
if (refusal !== undefined) {
  logger.error(`Seed refused, nothing changed: ${refusal}`, 'Seed');
  process.exitCode = 1;
} else if (connectionString === undefined || connectionString === '') {
  logger.error('Seed refused, nothing changed: AOS_MIGRATION_DATABASE_URL is not set', 'Seed');
  process.exitCode = 1;
} else {
  const targets = targetsFrom(connectionString);
  if (targets === undefined) {
    logger.error(
      'Seed refused, nothing changed: AOS_MIGRATION_DATABASE_URL must have the form postgres://<user>:<password>@<host>:<port>/<database>, so that the seed can point it at each Organisation database',
      'Seed',
    );
    process.exitCode = 1;
  } else {
    try {
      await seed(connectionString, targets);
    } catch (error) {
      logger.error(error, 'Seed');
      process.exitCode = 1;
    }
  }
}
