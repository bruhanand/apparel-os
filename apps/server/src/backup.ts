import {
  BACKUP_STORE_VARIABLES,
  backupPublicKeyFromEnvironment,
  BackupSigningKey,
  bucketSettingsFrom,
  connectionToDatabase,
  deploymentEnvironmentFromEnvironment,
  PinoLoggerService,
  pgDumpTool,
  S3Bucket,
  takeBackup,
  type BackupOutcome,
  type BackupStore,
  type DumpTool,
} from './kernel/index.js';
import { copyOrganisationFiles, FILE_STORE_VARIABLES } from './modules/files-imports/index.js';
import { restoreRegistry } from './restore-participants.js';

// The application backup, `pnpm --filter @apparel-os/server backup [--new-backup-key-version]` (backup-and-restore
// 3.2, 3.3, 10.3; PRD-SEC-012, POL-18.02; GC9-7, GC9-17; S1-F14-T02). An operator command, never an API route and
// never run by `app` or `worker`: it holds credentials they do not hold.
//
// AOS_MIGRATION_DATABASE_URL: the directory database as aos_migration, which reads every row; each Organisation
//   database is reached on the same server by the name the directory keeps (GC9-7). Never logged.
// AOS_ENVIRONMENT: the environment the backup is of; a restore refuses a backup of another (4.1).
// AOS_BACKUP_PUBLIC_KEY: the backup key's public part, base64 of its SPKI DER form. The private part is never an
//   environment secret (2.3; GC9-17).
// AOS_BACKUP_SIGNING_KEY: the backup signing key, base64 of an Ed25519 key's PKCS #8 DER form, held only by the backup
//   runner, never by `app` or `worker`; a restore refuses a backup it did not sign (product owner, 12 Oct 2026). Never
//   logged.
// AOS_BACKUP_STORE_ENDPOINT, _REGION, _BUCKET, _ACCESS_KEY_ID, _SECRET_ACCESS_KEY, _ADDRESSING: the backup store,
//   a bucket apart from the file store (GC9-A4).
// AOS_FILE_STORE_*: the file store, read to copy each Organisation's objects (3.3), as `app` has them. With none set,
//   no object is copied, and a backup whose records name an object fails its check.
// RAILWAY_GIT_COMMIT_SHA: the commit of the code, where Railway sets it (assumption to verify, GC9-A5).
//
// `--new-backup-key-version`: the operator states that a new backup key version starts, so a key that differs from the
// last complete backup's is accepted (2.4). The answer is printed as one JSON line; the exit code is 0 for a complete
// backup, 1 for a refused or failed one.

export interface BackupCommandInput {
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly args: readonly string[];
  /** PostgreSQL's dump tool; `pg_dump` from the PATH unless a test runs it elsewhere. */
  readonly dumpTool?: DumpTool;
  /** The backup store; the one the variables name unless a test wraps it. */
  readonly backupStore?: BackupStore;
  readonly log: (message: string) => void;
}

const NEW_KEY_VERSION = '--new-backup-key-version';

/** Reads the settings, refusing before anything is written when one is missing, then takes the backup. */
export async function runBackupCommand(input: BackupCommandInput): Promise<BackupOutcome> {
  const unknown = input.args.filter((arg) => arg !== NEW_KEY_VERSION);
  if (unknown.length > 0) {
    return { outcome: 'refused', reason: `Backup refused, nothing written: the only argument is ${NEW_KEY_VERSION}` };
  }
  const migration = input.env.AOS_MIGRATION_DATABASE_URL;
  const organisationConnectionString = migration === undefined ? undefined : connectionToDatabase(migration);
  if (migration === undefined || migration === '' || organisationConnectionString === undefined) {
    return {
      outcome: 'refused',
      reason:
        'Backup refused, nothing written: AOS_MIGRATION_DATABASE_URL must be set, as postgres://<user>:<password>@<host>:<port>/<database>',
    };
  }
  let settings;
  try {
    settings = {
      environment: deploymentEnvironmentFromEnvironment(input.env).name,
      publicKey: backupPublicKeyFromEnvironment(input.env),
      signingKey: BackupSigningKey.fromEnvironment(input.env),
      backupStore: bucketSettingsFrom(input.env, BACKUP_STORE_VARIABLES),
      fileStore: Object.values(FILE_STORE_VARIABLES).some((name) => (input.env[name] ?? '') !== '')
        ? bucketSettingsFrom(input.env, FILE_STORE_VARIABLES)
        : undefined,
    };
  } catch (error) {
    // Each message names variables only, never a value (PRD-SEC-014).
    return { outcome: 'refused', reason: `Backup refused, nothing written: ${(error as Error).message}` };
  }
  const backupBucket = new S3Bucket(settings.backupStore);
  const fileBucket = settings.fileStore === undefined ? undefined : new S3Bucket(settings.fileStore);
  const backupStore = input.backupStore ?? backupBucket;
  try {
    return await takeBackup({
      directoryConnectionString: migration,
      organisationConnectionString,
      environment: settings.environment,
      codeCommit: nonEmpty(input.env.RAILWAY_GIT_COMMIT_SHA),
      publicKey: settings.publicKey,
      signingKey: settings.signingKey,
      newBackupKeyVersion: input.args.includes(NEW_KEY_VERSION),
      backupStore,
      copyFiles: (organisationId) =>
        fileBucket === undefined
          ? Promise.resolve(undefined)
          : copyOrganisationFiles({ fileStore: fileBucket, backupStore, organisationId }),
      registry: restoreRegistry,
      dumpTool: input.dumpTool ?? pgDumpTool,
      log: input.log,
    });
  } finally {
    backupBucket.destroy();
    fileBucket?.destroy();
  }
}

function nonEmpty(value: string | undefined): string | null {
  return value === undefined || value === '' ? null : value;
}

if (process.argv[1]?.endsWith('backup.js') === true) {
  const logger = new PinoLoggerService();
  try {
    const outcome = await runBackupCommand({
      env: process.env,
      args: process.argv.slice(2),
      log: (message) => {
        logger.log(message, 'Backup');
      },
    });
    if (outcome.outcome === 'refused') logger.error(outcome.reason, 'Backup');
    process.stdout.write(`${JSON.stringify(outcome)}\n`);
    process.exitCode = outcome.outcome === 'complete' ? 0 : 1;
  } catch (error) {
    // A database's or the store's own words can name the server; only the error's class is logged (PRD-SEC-014).
    logger.error(
      `The backup stopped with ${error instanceof Error ? error.name : 'an error'}; nothing was recorded as complete`,
      'Backup',
    );
    process.exitCode = 1;
  }
}
