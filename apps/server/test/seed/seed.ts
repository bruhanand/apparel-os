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
import { runSetupStep } from '../../src/modules/access/index.js';
import { serviceIdentitiesOf } from '../../src/setup-organisation.js';
import { jobRegistry } from '../../src/worker.module.js';
import { isSyntheticCode, SYNTHETIC_ORGANISATIONS, syntheticDatabaseName } from '../fixtures/synthetic.js';
import { seedRefusal } from './environment.js';
import {
  FIRST_USERS_FILE_VARIABLE,
  firstUsersFileRefusal,
  readOrMakeFirstUsers,
  seedSetupRequest,
} from './first-users.js';

// The local seed, `pnpm seed` (code-house-rules 11.2): the same two synthetic Organisations the database tests use,
// each with its own database, initialised through the setup step itself (access-and-approvals 9.11; PRD-ACS-023;
// DEC-118, RR-330), each with its own first Admin and first approver, four different SYNTHETIC people, and labelled
// SYNTHETIC settings (first-users.ts). It refuses to run unless AOS_ENVIRONMENT says local or dev (environment.ts).
// It is built apart from the application (tsconfig.seed.json), so no fixture reaches dist.
//
// AOS_MIGRATION_DATABASE_URL connects to the directory database as aos_migration and AOS_RUNTIME_DATABASE_URL to the
// same database as aos_runtime, as for the setup step; neither is ever logged. AOS_SEED_FIRST_USERS_FILE names a file
// called SYNTHETIC-<name>.secrets.json, which git ignores: the first users' SYNTHETIC temporary passwords are read
// from it, or made at random and written to it, readable by its owner only, when it does not exist. They are never
// logged or echoed.
//
// Before anything changes, the seed refuses a directory that already lists an Organisation that is not synthetic, or
// lists one of its own codes at another database (RR-195), or lists one without a finished setup (an earlier seed's).
// Then it migrates the directory database, which refuses any other role or a database that role does not own, and
// runs the setup step for each Organisation the directory does not list yet. A finished Organisation, one the
// directory lists and whose setup record exists, is left as it is, so a second run changes nothing.
const logger = new PinoLoggerService();

interface Target {
  readonly code: string;
  readonly name: string;
  readonly database: string;
  readonly connectionString: string;
}

interface Connections {
  readonly migration: string;
  readonly runtime: string;
  readonly firstUsersFile: string;
}

async function seed(connections: Connections, targets: readonly Target[]): Promise<void> {
  const listed = await readDirectoryIfPresent(connections.migration);
  const refusal = directoryRefusal(listed, targets) ?? (await unfinishedRefusal(listed, targets));
  if (refusal !== undefined) throw new Error(`Seed refused, nothing changed: ${refusal}`);

  await migrateDatabase({ connectionString: connections.migration, folder: migrationSetFolder('directory') });
  logger.log('Directory database migrated', 'Seed');

  const toSetUp = targets.filter((target) => !listed.some((entry) => entry.organisationCode === target.code));
  for (const target of targets.filter((each) => !toSetUp.includes(each))) {
    logger.log(`${target.code} (${target.name}): already set up, left as it is`, 'Seed');
  }
  if (toSetUp.length > 0) {
    const secrets = readOrMakeFirstUsers(connections.firstUsersFile, toSetUp);
    for (const target of toSetUp) {
      const outcome = await runSetupStep({
        migrationConnectionString: connections.migration,
        runtimeConnectionString: connections.runtime,
        request: seedSetupRequest(target, target.database, secrets),
        serviceIdentities: serviceIdentitiesOf(jobRegistry),
        logger,
      });
      if (outcome.outcome === 'refused') {
        throw new Error(`The setup step refused ${target.code} as ${outcome.reason}; nothing more was seeded`);
      }
      logger.log(
        `${target.code} (${target.name}): set up in database ${target.database} (${outcome.outcome}), with its first Admin and first approver`,
        'Seed',
      );
    }
  }
  logger.log(
    `Seeded the two synthetic Organisations; the first users' temporary passwords are in the file ${FIRST_USERS_FILE_VARIABLE} names`,
    'Seed',
  );
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

/**
 * Why a listed seed Organisation cannot be left as finished, or undefined: one the directory lists whose database
 * holds no setup record was listed by an earlier seed, before the seed ran the setup step (RR-330). The seed never
 * writes into it; locally, drop its database and its directory entry, then run the seed again.
 */
async function unfinishedRefusal(
  listed: readonly DirectoryEntry[],
  targets: readonly Target[],
): Promise<string | undefined> {
  const unfinished: string[] = [];
  for (const target of targets) {
    if (!listed.some((entry) => entry.organisationCode === target.code)) continue;
    if (!(await hasSetupRecord(target.connectionString))) unfinished.push(target.code);
  }
  if (unfinished.length === 0) return undefined;
  return `the directory lists ${unfinished.join(', ')} without a finished setup (an earlier seed); drop its database and directory entry, then run the seed again`;
}

/** Whether an Organisation's database holds its setup record (access-and-approvals 9.11). Reads only. */
async function hasSetupRecord(connectionString: string): Promise<boolean> {
  const client = new Client({ connectionString });
  try {
    await client.connect();
  } catch {
    return false;
  }
  try {
    const present = await client.query<{ present: boolean }>(
      "select pg_catalog.to_regclass('access.setup_record') is not null as present",
    );
    if (present.rows[0]?.present !== true) return false;
    return (await client.query('select 1 from access.setup_record')).rowCount === 1;
  } finally {
    await client.end();
  }
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

const refusal = seedRefusal(process.env);
const migration = process.env.AOS_MIGRATION_DATABASE_URL;
const runtime = process.env.AOS_RUNTIME_DATABASE_URL;
const firstUsersFile = process.env[FIRST_USERS_FILE_VARIABLE];
const fileRefusal = firstUsersFileRefusal(firstUsersFile);
if (refusal !== undefined) {
  logger.error(`Seed refused, nothing changed: ${refusal}`, 'Seed');
  process.exitCode = 1;
} else if (migration === undefined || migration === '') {
  logger.error('Seed refused, nothing changed: AOS_MIGRATION_DATABASE_URL is not set', 'Seed');
  process.exitCode = 1;
} else if (runtime === undefined || runtime === '') {
  logger.error('Seed refused, nothing changed: AOS_RUNTIME_DATABASE_URL is not set', 'Seed');
  process.exitCode = 1;
} else if (fileRefusal !== undefined || firstUsersFile === undefined) {
  logger.error(`Seed refused, nothing changed: ${fileRefusal ?? `${FIRST_USERS_FILE_VARIABLE} is not set`}`, 'Seed');
  process.exitCode = 1;
} else {
  const targets = targetsFrom(migration);
  if (targets === undefined || connectionToDatabase(runtime) === undefined) {
    logger.error(
      'Seed refused, nothing changed: AOS_MIGRATION_DATABASE_URL and AOS_RUNTIME_DATABASE_URL must have the form postgres://<user>:<password>@<host>:<port>/<database>, so that the seed can point them at each Organisation database',
      'Seed',
    );
    process.exitCode = 1;
  } else {
    try {
      await seed({ migration, runtime, firstUsersFile }, targets);
    } catch (error) {
      logger.error(error, 'Seed');
      process.exitCode = 1;
    }
  }
}
