import {
  BACKUP_STORE_VARIABLES,
  BackupPrivateKey,
  bucketSettingsFrom,
  connectionToDatabase,
  deploymentEnvironmentFromEnvironment,
  PinoLoggerService,
  pgRestoreTool,
  refreshDrillRecord,
  restoreBackup,
  S3Bucket,
  type DrillPurpose,
  type DrillRecordRefreshOutcome,
  type OrganisationTimezoneSource,
  type RestoreOutcome,
  type RestoreTool,
  type StructuredLogger,
} from './kernel/index.js';
import { jobIdentities, OrganisationKeys, ORGANISATION_KEYS_VARIABLE } from './modules/access/index.js';
import { Audit } from './modules/audit/index.js';
import { configurationTimezoneSource, recoveryValidationsOf } from './modules/configuration/index.js';
import { FILE_STORE_VARIABLES } from './modules/files-imports/index.js';
import { reconciliationsAfterRestore, seriesAwaitingReconciliation } from './modules/numbering/index.js';
import { ask } from './operator-prompt.js';
import { restoreRegistry } from './restore-participants.js';
import { restoreStepsOf } from './restore-steps.js';

// The restore into a fresh target, `pnpm --filter @apparel-os/server restore <backup id> [--organisation <code>]`, and
// the drill record brought up to date, `pnpm --filter @apparel-os/server restore --drill-record <restore id>`
// (backup-and-restore 4.1 to 4.5, 5, section 6, 10.3; POL-18.02, POL-18.03, POL-18.04, PRD-SEC-012, PRD-SEC-014,
// PRD-SEC-018; GC9-7, GC9-17, GC9-18; S1-F14-T03). An operator command, never an API route and never run by `app` or
// `worker`: it holds credentials they do not hold.
//
// AOS_MIGRATION_DATABASE_URL: the target's directory database as aos_migration, empty, created as the roles runbook
//   says; each Organisation database is created on the same server, named after it and the Organisation's code. Never
//   logged.
// AOS_RUNTIME_DATABASE_URL: the target's directory database as aos_runtime; the participants' command steps reach each
//   restored database by name as the runtime role (section 11). Never logged.
// AOS_ENVIRONMENT: the target's environment; a backup of another is refused (4.1).
// AOS_BACKUP_STORE_*: the backup store the backup is in, and where the drill record is kept beside it.
// AOS_FILE_STORE_*: the target's file store, empty, into which each Organisation's objects are copied.
//
// At the prompt, never in the arguments and never echoed or logged: whether this is a drill or a real restore, what
// the drill is for or the restore's cause and when the failure was declared, and who conducts it; then, hidden, the
// backup key's private part and the Organisations' data keys, both from the custodian's kept copies (2.3, 2.4), the
// data keys as one JSON object of Organisation code to key, the form of AOS_ORGANISATION_KEYS. The answer is printed
// as one JSON line; the exit code is 0 when every Organisation restored is held with every check passed, or the drill
// record was written, and 1 otherwise.

/** What the operator answered at the prompt. Secrets are text only until they are read into their keys. */
export interface RestoreAnswers {
  readonly purpose: DrillPurpose;
  readonly conductedBy: string;
  readonly privateKeyText: string;
  readonly organisationKeysText: string;
}

export interface RestoreCommandInput {
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly args: readonly string[];
  /** The prompt's answers; asked only for a restore, never for the drill record. */
  readonly answers: () => Promise<RestoreAnswers>;
  /** PostgreSQL's restore tool; `pg_restore` from the PATH unless a test runs it elsewhere. */
  readonly restoreTool?: RestoreTool;
  /** The Organisations' timezones; `configuration`'s setting unless a test gives its own. */
  readonly timezones?: OrganisationTimezoneSource;
  readonly logger: StructuredLogger;
  readonly log: (message: string) => void;
}

export type RestoreCommandOutcome = RestoreOutcome | DrillRecordRefreshOutcome;

const ORGANISATION = '--organisation';
const DRILL_RECORD = '--drill-record';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function refused(reason: string): RestoreCommandOutcome {
  return { outcome: 'refused', reason: `Restore refused, nothing written: ${reason}` };
}

/** Reads the arguments and settings, refusing before anything is written, then restores or brings the record up to date. */
export async function runRestoreCommand(input: RestoreCommandInput): Promise<RestoreCommandOutcome> {
  const args = [...input.args];
  const drillRecord = args[0] === DRILL_RECORD;
  const id = drillRecord ? args[1] : args[0];
  const codes: string[] = [];
  for (let at = drillRecord ? 2 : 1; at < args.length; at += 2) {
    const code = args[at + 1];
    if (drillRecord || args[at] !== ORGANISATION || code === undefined || code === '') {
      return refused(
        `give the backup's identifier, then ${ORGANISATION} <code> for each Organisation to restore alone, or ${DRILL_RECORD} <restore id>`,
      );
    }
    codes.push(code);
  }
  if (id === undefined || !UUID.test(id)) return refused('give the identifier of the backup, or of the restore');
  const migration = input.env.AOS_MIGRATION_DATABASE_URL;
  const runtime = input.env.AOS_RUNTIME_DATABASE_URL;
  const migrationTo = migration === undefined ? undefined : connectionToDatabase(migration);
  const runtimeTo = runtime === undefined ? undefined : connectionToDatabase(runtime);
  if (migration === undefined || migrationTo === undefined || runtimeTo === undefined) {
    return refused(
      'AOS_MIGRATION_DATABASE_URL and AOS_RUNTIME_DATABASE_URL must be set, as postgres://<user>:<password>@<host>:<port>/<database>',
    );
  }
  let settings;
  try {
    settings = {
      environment: deploymentEnvironmentFromEnvironment(input.env).name,
      backupStore: bucketSettingsFrom(input.env, BACKUP_STORE_VARIABLES),
      fileStore: drillRecord ? undefined : bucketSettingsFrom(input.env, FILE_STORE_VARIABLES),
    };
  } catch (error) {
    // Each message names variables only, never a value (PRD-SEC-014).
    return refused((error as Error).message);
  }
  const backupStore = new S3Bucket(settings.backupStore);
  const fileStore = settings.fileStore === undefined ? undefined : new S3Bucket(settings.fileStore);
  const identities = jobIdentities();
  try {
    if (drillRecord || fileStore === undefined) {
      return await refreshDrillRecord({
        restoreId: id,
        backupStore,
        runtimeConnectionString: runtimeTo,
        identities,
        timezones: input.timezones ?? configurationTimezoneSource,
        logger: input.logger,
        async organisationFacts(context, restoreId) {
          const validations = await recoveryValidationsOf(context, restoreId);
          const reconciled = await reconciliationsAfterRestore(context, restoreId);
          return {
            validations: validations.map((each) => ({
              validates: each.validates,
              compared: [...each.compared],
              byUserId: each.validatedByUserId,
              at: each.validatedAt.toISOString(),
            })),
            seriesReconciled: reconciled.map((each) => ({
              seriesId: each.seriesId,
              restoredHighest: each.restoredHighest,
              evidenceHighest: each.evidenceHighest,
              skipped:
                each.nextSequenceAfter > each.nextSequenceBefore
                  ? { from: each.nextSequenceBefore, to: each.nextSequenceAfter - 1 }
                  : null,
              reason: each.reason,
              reconciledAt: each.reconciledAt.toISOString(),
            })),
            seriesToReconcile: (await seriesAwaitingReconciliation(context, restoreId)).length,
          };
        },
      });
    }
    const answers = await input.answers();
    let privateKey: BackupPrivateKey;
    let keys: OrganisationKeys;
    try {
      privateKey = BackupPrivateKey.fromText(answers.privateKeyText);
    } catch (error) {
      return refused((error as Error).message);
    }
    try {
      keys = OrganisationKeys.fromEnvironment({ [ORGANISATION_KEYS_VARIABLE]: answers.organisationKeysText });
    } catch {
      return refused(
        "the Organisations' data keys are not a JSON object of Organisation code to a 32-byte key in base64url",
      );
    }
    if (answers.conductedBy.trim() === '') return refused('say who conducts the restore (section 6)');
    const versions = new Map<string, ReadonlySet<string>>();
    for (const [code, version] of keys.versions()) versions.set(code, new Set([version]));
    return await restoreBackup({
      backupId: id,
      ...(codes.length === 0 ? {} : { organisationCodes: codes }),
      environment: settings.environment,
      privateKey,
      keyVersions: versions,
      purpose: answers.purpose,
      conductedBy: answers.conductedBy.trim(),
      backupStore,
      fileStore,
      directoryConnectionString: migration,
      organisationConnectionString: migrationTo,
      runtimeConnectionString: runtimeTo,
      restoreTool: input.restoreTool ?? pgRestoreTool,
      registry: restoreRegistry,
      steps: restoreStepsOf({ audit: new Audit(input.logger), keys }),
      identities,
      timezones: input.timezones ?? configurationTimezoneSource,
      logger: input.logger,
      log: input.log,
    });
  } finally {
    backupStore.destroy();
    fileStore?.destroy();
  }
}

/** The prompt of the restore: one session, every line read from one iterator (operator-prompt.ts). */
async function askAnswers(): Promise<RestoreAnswers> {
  const [kind, words, declaredAt, conductedBy, privateKeyText, organisationKeysText] = await ask([
    { text: 'Is this a drill or a real restore (drill or real): ', hidden: false },
    { text: 'What the drill is for, or the cause of the real restore: ', hidden: false },
    {
      text: 'For a real restore, when the failure was declared (an ISO 8601 time); for a drill, leave empty: ',
      hidden: false,
    },
    { text: 'Who conducts the restore (name and role): ', hidden: false },
    { text: "The backup key's private part, from the custodian's kept copy: ", hidden: true },
    { text: "The Organisations' data keys, from the custodian's kept copies, as JSON of code to key: ", hidden: true },
  ]);
  const declared = new Date(declaredAt ?? '');
  const purpose: DrillPurpose =
    kind === 'real' && !Number.isNaN(declared.getTime())
      ? { kind: 'real', cause: words ?? '', declaredAt: declared.toISOString() }
      : { kind: 'drill', note: words ?? '' };
  if (kind !== 'drill' && kind !== 'real') throw new Error('The restore is a drill or a real restore');
  if (kind === 'real' && purpose.kind !== 'real') throw new Error('A real restore names when the failure was declared');
  return {
    purpose,
    conductedBy: conductedBy ?? '',
    privateKeyText: privateKeyText ?? '',
    organisationKeysText: organisationKeysText ?? '',
  };
}

if (process.argv[1]?.endsWith('restore.js') === true) {
  const logger = new PinoLoggerService();
  try {
    const outcome = await runRestoreCommand({
      env: process.env,
      args: process.argv.slice(2),
      answers: askAnswers,
      logger,
      log: (message) => {
        logger.log(message, 'Restore');
      },
    });
    if (outcome.outcome === 'refused') logger.error(outcome.reason, 'Restore');
    process.stdout.write(`${JSON.stringify(outcome)}\n`);
    process.exitCode = outcome.outcome === 'held' || outcome.outcome === 'written' ? 0 : 1;
  } catch (error) {
    // A database's or the store's own words can name the server; only the error's class is logged (PRD-SEC-014).
    logger.error(`The restore stopped with ${error instanceof Error ? error.name : 'an error'}`, 'Restore');
    process.exitCode = 1;
  }
}
