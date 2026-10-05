import { migrateDatabase, migrationSetFolder, PinoLoggerService } from './kernel/index.js';

// The pre-deploy step (deployment.md section 4; code-house-rules 4.3), DIRECTORY ONLY for now: it migrates the
// directory database and exits non-zero on failure, so the deploy stops and the old version runs on.
// It migrates no Organisation database. Organisation routing, the directory table that lists them, is S1-F01-T02;
// that task switches this command to migrateAll over the Organisations the directory lists, and tests it, before
// any Organisation database is deployed.
// AOS_MIGRATION_DATABASE_URL connects to the directory database as aos_migration. It is never logged.
const logger = new PinoLoggerService();
const connectionString = process.env.AOS_MIGRATION_DATABASE_URL;

if (connectionString === undefined || connectionString === '') {
  logger.error('AOS_MIGRATION_DATABASE_URL is not set', 'Migrate');
  process.exitCode = 1;
} else {
  try {
    await migrateDatabase({
      connectionString,
      folder: migrationSetFolder('directory'),
      onApplied: (fileName) => {
        logger.log(`Applied ${fileName} to the directory database`, 'Migrate');
      },
    });
    logger.log(
      'Directory database migrated. No Organisation database was migrated: this command is directory-only until Organisation routing (S1-F01-T02) exists',
      'Migrate',
    );
  } catch (error) {
    logger.error(error, 'Migrate');
    process.exitCode = 1;
  }
}
