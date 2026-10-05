import { drizzle } from 'drizzle-orm/node-postgres';
import { Client } from 'pg';
import { listDirectory, type DirectoryEntry } from './directory.js';
import { migrateDatabase } from './migration-runner.js';
import { migrationSetFolder } from './migration-set.js';

export interface MigrateAllOptions {
  /** The directory database, as the migration role. */
  readonly directoryConnectionString: string;
  /** The connection to an Organisation's database as the migration role, from the name the directory keeps. */
  readonly organisationConnectionString: (databaseName: string) => string;
  /** The set folders; the repository's own sets unless a test passes others. */
  readonly folders?: { readonly directory: string; readonly organisation: string };
  /** Told each file once its transaction has committed: `directory`, or `Organisation <code>`, and the file. */
  readonly onApplied?: (database: string, fileName: string) => void;
}

/**
 * The pre-deploy run (code-house-rules 4.3; deployment.md section 4): the directory set on the directory database,
 * then the Organisation set on each Organisation database the directory lists, in code order (PRD-MOD-001,
 * DEC-093). The directory is read after its own migrations, so a first deploy finds its table. Stops at the first
 * failure, so no database after it is touched and the deploy stops. Returns the Organisations it migrated.
 */
export async function migrateAll(options: MigrateAllOptions): Promise<DirectoryEntry[]> {
  const folders = options.folders ?? {
    directory: migrationSetFolder('directory'),
    organisation: migrationSetFolder('organisation'),
  };
  await migrateDatabase({
    connectionString: options.directoryConnectionString,
    folder: folders.directory,
    onApplied: (fileName) => options.onApplied?.('directory', fileName),
  });
  const organisations = await readDirectory(options.directoryConnectionString);
  for (const organisation of organisations) {
    try {
      await migrateDatabase({
        connectionString: options.organisationConnectionString(organisation.databaseName),
        folder: folders.organisation,
        onApplied: (fileName) => options.onApplied?.(`Organisation ${organisation.organisationCode}`, fileName),
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new Error(
        `Organisation ${organisation.organisationCode}: ${reason}. No Organisation after it in code order was migrated`,
        { cause: error },
      );
    }
  }
  return organisations;
}

// Read as the migration role, which owns the directory and which migrateDatabase has just checked.
async function readDirectory(connectionString: string): Promise<DirectoryEntry[]> {
  const client = new Client({ connectionString });
  await client.connect();
  try {
    return await listDirectory(drizzle({ client }));
  } finally {
    await client.end();
  }
}
