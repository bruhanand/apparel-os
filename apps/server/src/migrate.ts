import { migrateAll, PinoLoggerService } from './kernel/index.js';

// The pre-deploy step (deployment.md section 4; code-house-rules 4.3): migrates the directory database, then every
// Organisation database, and exits non-zero on the first failure so the deploy stops and the old version runs on.
// AOS_MIGRATION_DATABASE_URL connects to the directory database as aos_migration. It is never logged.
const logger = new PinoLoggerService();
const directoryConnectionString = process.env.AOS_MIGRATION_DATABASE_URL;

if (directoryConnectionString === undefined || directoryConnectionString === '') {
  logger.error('AOS_MIGRATION_DATABASE_URL is not set', 'Migrate');
  process.exitCode = 1;
} else {
  try {
    await migrateAll({
      directoryConnectionString,
      // The directory has no table yet: S1-F01-T02 adds it and replaces this with the Organisations it lists.
      organisations: [],
      onApplied: (database, fileName) => {
        logger.log(`Applied ${fileName} to the ${database} database`, 'Migrate');
      },
    });
    logger.log('Migrations complete', 'Migrate');
  } catch (error) {
    logger.error(error, 'Migrate');
    process.exitCode = 1;
  }
}
