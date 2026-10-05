import { migrateDatabase } from './migration-runner.js';
import { migrationSetFolder } from './migration-set.js';

/** An Organisation database the directory lists: its code and a connection to it as the migration role. */
export interface OrganisationDatabase {
  readonly code: string;
  readonly connectionString: string;
}

export interface MigrateAllOptions {
  /** The directory database, as the migration role. */
  readonly directoryConnectionString: string;
  readonly organisations: readonly OrganisationDatabase[];
  /** The set folders; the repository's own sets unless a test passes others. */
  readonly folders?: { readonly directory: string; readonly organisation: string };
  readonly onApplied?: (database: string, fileName: string) => void;
}

/**
 * The pre-deploy run (code-house-rules 4.3; deployment.md section 4): the directory set on the directory database,
 * then the Organisation set on each Organisation database in code order (PRD-MOD-001, DEC-093). Stops at the
 * first failure, so no database after it is touched and the deploy stops.
 */
export async function migrateAll(options: MigrateAllOptions): Promise<void> {
  const folders = options.folders ?? {
    directory: migrationSetFolder('directory'),
    organisation: migrationSetFolder('organisation'),
  };
  await migrateDatabase({
    connectionString: options.directoryConnectionString,
    folder: folders.directory,
    onApplied: (fileName) => options.onApplied?.('directory', fileName),
  });
  const organisations = [...options.organisations].sort((a, b) => (a.code < b.code ? -1 : a.code > b.code ? 1 : 0));
  for (const organisation of organisations) {
    await migrateDatabase({
      connectionString: organisation.connectionString,
      folder: folders.organisation,
      onApplied: (fileName) => options.onApplied?.(`organisation ${organisation.code}`, fileName),
    });
  }
}
