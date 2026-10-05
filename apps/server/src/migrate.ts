import { connectionToDatabase, migrateAll, PinoLoggerService } from './kernel/index.js';

// The pre-deploy step, `pnpm migrate` (deployment.md section 4; code-house-rules 4.3): migrates the directory
// database, then every Organisation database the directory lists, in code order, as the migration role. It stops at
// the first failure and exits non-zero, so the deploy stops and the old version runs on.
// AOS_MIGRATION_DATABASE_URL connects to the directory database as aos_migration; each Organisation database is
// reached on the same server, as the same role, by the name the directory keeps (DEC-093). It is never logged.
const logger = new PinoLoggerService();
const connectionString = process.env.AOS_MIGRATION_DATABASE_URL;
const organisationConnectionString =
  connectionString === undefined ? undefined : connectionToDatabase(connectionString);

if (connectionString === undefined || connectionString === '') {
  logger.error('AOS_MIGRATION_DATABASE_URL is not set', 'Migrate');
  process.exitCode = 1;
} else if (organisationConnectionString === undefined) {
  // Refused before anything changes, without echoing the string: it holds the password (PRD-SEC-014).
  logger.error(
    'Migration refused, nothing changed: AOS_MIGRATION_DATABASE_URL must have the form postgres://<user>:<password>@<host>:<port>/<database>, so that each Organisation database can be reached on the same server',
    'Migrate',
  );
  process.exitCode = 1;
} else {
  try {
    const organisations = await migrateAll({
      directoryConnectionString: connectionString,
      organisationConnectionString,
      onApplied: (database, fileName) => {
        logger.log(`Applied ${fileName} to the ${database} database`, 'Migrate');
      },
    });
    logger.log(
      `Migrated the directory database and ${String(organisations.length)} Organisation database(s): ${organisations.map((organisation) => organisation.organisationCode).join(', ') || 'none listed'}`,
      'Migrate',
    );
  } catch (error) {
    logger.error(error, 'Migrate');
    process.exitCode = 1;
  }
}
