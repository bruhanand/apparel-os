import { Client } from 'pg';
import { migrateDatabase, migrationSetFolder, PinoLoggerService } from '../../src/kernel/index.js';
import { SYNTHETIC_ORGANISATIONS, syntheticDatabaseName } from '../fixtures/synthetic.js';
import { seedRefusal } from './environment.js';

// The local seed, `pnpm seed` (code-house-rules 11.2): the same two synthetic Organisations the database tests use,
// each with its own database, beside the directory database. It refuses to run unless AOS_ENVIRONMENT says local
// or dev (environment.ts). It is built apart from the application (tsconfig.seed.json), so no fixture reaches dist.
//
// AOS_MIGRATION_DATABASE_URL connects to the directory database as aos_migration, as for `pnpm migrate`; it is never
// logged. The seed migrates the directory database first, which refuses any other role or a database that role does
// not own before anything is changed; then it creates each Organisation's database if it is missing, owned by
// aos_migration, and migrates it. A second run changes nothing.
//
// It writes no row: no migration has a business table yet. Organisation routing (S1-F01-T02) adds the directory
// table, and the seed then lists both Organisations there; the setup step (S1-F01-T10) then sets each one up.
const logger = new PinoLoggerService();

interface Target {
  readonly code: string;
  readonly name: string;
  readonly database: string;
  readonly connectionString: string;
}

async function seed(connectionString: string, targets: readonly Target[]): Promise<void> {
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
  logger.log(
    'Seeded the two synthetic Organisations. The directory lists neither yet: its table arrives with Organisation routing (S1-F01-T02)',
    'Seed',
  );
}

/**
 * Each Organisation's connection: the directory's, pointed at that Organisation's database. Worked out before anything
 * changes. A connection string that is not a URL with a host is refused without echoing it, because it holds the
 * password: the parser's own error would carry the whole string into the log (PRD-SEC-014).
 */
function targetsFrom(connectionString: string): Target[] | undefined {
  let url: URL;
  try {
    url = new URL(connectionString);
  } catch {
    return undefined;
  }
  if (url.hostname === '') return undefined;
  return SYNTHETIC_ORGANISATIONS.map((organisation) => {
    const database = syntheticDatabaseName(organisation.code);
    const target = new URL(url);
    target.pathname = `/${database}`;
    return { ...organisation, database, connectionString: target.toString() };
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
