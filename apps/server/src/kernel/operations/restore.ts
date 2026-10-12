import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buffer } from 'node:stream/consumers';
import { Transform, type Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { uuidv7 } from '@apparel-os/domain';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Client } from 'pg';
import { CommandRunner } from '../command-runner/command-runner.js';
import { newCorrelationId } from '../command-runner/correlation.js';
import { createDb } from '../db/create-db.js';
import { checkConnectedAsOwner, migrateDatabase } from '../db/migration-runner.js';
import { migrationSetFolder, readMigrationSet } from '../db/migration-set.js';
import type { DeploymentEnvironmentName } from '../environment/deployment-environment.js';
import type { JobIdentities } from '../jobs/contracts.js';
import type { StructuredLogger } from '../logging/pino-logger.service.js';
import type { RoutedOrganisation } from '../routing/organisation-router.js';
import type { Clock } from '../time/clock.js';
import type { OrganisationTimezoneSource } from '../time/organisation-timezone.js';
import { MANIFEST_FORMAT, type BackupManifest, type OrganisationPart } from './backup.js';
import type { BackupPrivateKey } from './backup-cipher.js';
import { STORED_AT_METADATA, type StoredObjectRead } from './backup-store.js';
import {
  DRILL_RECORD_FORMAT,
  drillRecordNames,
  drillRecordText,
  measuredTimes,
  type DrillCheck,
  type DrillGap,
  type DrillKeyVersion,
  type DrillOrganisation,
  type DrillPurpose,
  type DrillRecord,
  type DrillStep,
} from './drill-record.js';
import type { RestoreTool } from './dump-tool.js';
import {
  RESTORE_IDENTITY,
  storedAfterRecoveryPoint,
  type CheckResult,
  type ParticipantContext,
  type RecordedResult,
  type RecoveryGap,
  type RestoredObject,
  type RestoredObjects,
  type RestoreRegistry,
  type RestoreRun,
  type RestoreStep,
} from './restore-contract.js';

// The restore into a fresh target (backup-and-restore 4.1, 4.2, 4.3, 5.1 to 5.4, section 6, 10.3; POL-18.03,
// POL-18.04, PRD-ACP-019, PRD-SEC-012, PRD-SEC-018; S1-F14-T03). An operator command, never an API endpoint and never
// run by `app` or `worker`: it creates and loads databases as the migration role of the target (GC9-7), reads the
// backup store, writes the target's file store, and opens the backup with the custodian's private part of the backup
// key, given at the prompt and never stored or logged (GC9-17). Nothing in it calls an outside system inside a
// database transaction (code-house-rules 8.3).
//
//   1. Check before writing (4.2 step 1): the manifest opens with the backup key and says complete; it is of this
//      environment; the target is fresh; every key version its data needs was given from its kept copy; the running
//      code holds every migration the backup had applied; every dump is in the backup store and matches its hash. Any failure
//      refuses with nothing written.
//   2. Restore the databases (step 2): the directory first when the whole environment is restored, then each
//      Organisation into a database the command creates, from its dump, whose hash was checked before it is read.
//   3. The runner's database step and any newer migration (step 3; code-house-rules 4.3).
//   4. The control totals, computed on the restored database before anything is written to it, compared with the
//      manifest's (5.2).
//   5. The recovery hold, placed before any request can reach the database (step 6, 4.3): before the directory names
//      it, so earlier than 4.2 lists it, which only makes the hold safer.
//   6. The directory pointed at the target, each change written to the drill record (step 4).
//   7. The Organisation's file objects copied into the target's file store (step 5).
//   8. The participants in tier order (step 7): the command steps under the restore's internal service identity, as
//      the runtime role; the checks as the migration role; every result recorded as a `kernel.recovery_event`; then
//      `audit`'s step records each as an audit record. A failed check is never skipped: the Organisation stays held.
//   9. The drill record (step 8, section 6), beside the backup.

const MANIFEST_NAME = (backupId: string) => `backups/${backupId}/manifest`;
const DATABASE_NAME = /^[A-Za-z0-9_]{1,63}$/;

/** The backup store as the restore reads it and keeps the drill record beside the backup. */
export interface RestoreBackupStore {
  get(name: string): Promise<Readable>;
  getWithLength(name: string): Promise<StoredObjectRead>;
  list(prefix: string): Promise<string[]>;
  putOnce(name: string, body: Buffer, length: number): Promise<'written' | 'already-there'>;
}

/** The target's file store, empty before the restore, as the restore writes and its checks read it. */
export interface RestoreFileStore {
  putOnce(
    name: string,
    body: Readable,
    length: number,
    metadata?: Readonly<Record<string, string>>,
  ): Promise<'written' | 'already-there'>;
  get(name: string): Promise<Readable>;
  list(prefix: string): Promise<string[]>;
  head(
    name: string,
  ): Promise<
    { readonly metadata: Readonly<Record<string, string>>; readonly lastModified: Date | undefined } | undefined
  >;
}

export interface RestoreOptions {
  readonly backupId: string;
  /** The Organisations to restore, by code; every one the backup holds, with the directory, when left out (2.1). */
  readonly organisationCodes?: readonly string[];
  /** The environment the target belongs to; a backup of another is refused (4.1). */
  readonly environment: DeploymentEnvironmentName;
  /** The backup key's private part, from the custodian's kept copy (2.3, 2.4). */
  readonly privateKey: BackupPrivateKey;
  /**
   * The identifiers of the Organisation data key versions whose kept copies the custodian gave, by Organisation code
   * (2.4): each computed from the copy itself, so a copy that does not match its identifier names another version.
   */
  readonly keyVersions: ReadonlyMap<string, ReadonlySet<string>>;
  readonly purpose: DrillPurpose;
  /** Who conducts the restore, as they gave it (section 6). */
  readonly conductedBy: string;
  readonly backupStore: RestoreBackupStore;
  readonly fileStore: RestoreFileStore;
  /** The target's directory database as its migration role: empty, created as the roles runbook says. Never logged. */
  readonly directoryConnectionString: string;
  /** A database on the target's server as the migration role, by name. */
  readonly organisationConnectionString: (databaseName: string) => string;
  /** A database on the target's server as the runtime role, by name, for the command steps (section 11). */
  readonly runtimeConnectionString: (databaseName: string) => string;
  readonly restoreTool: RestoreTool;
  readonly registry: RestoreRegistry;
  readonly steps: readonly RestoreStep[];
  readonly identities: JobIdentities;
  readonly timezones: OrganisationTimezoneSource;
  /** The service log of the command runner; never given a secret or a connection string. */
  readonly logger: StructuredLogger;
  /** Told each step in plain words, with no secret, connection string or record data (PRD-SEC-014). */
  readonly log: (message: string) => void;
  readonly clock?: Clock;
}

export interface RestoredOrganisation {
  readonly organisationCode: string;
  readonly databaseName: string;
  readonly checksFailed: number;
}

export type RestoreOutcome =
  | { readonly outcome: 'refused'; readonly reason: string }
  | {
      readonly outcome: 'held' | 'held-with-failed-checks' | 'failed';
      readonly restoreId: string;
      readonly organisations: readonly RestoredOrganisation[];
      readonly drillRecord: { readonly json: string; readonly text: string } | null;
    };

/** The restore was refused before anything was written. */
export class RestoreRefused extends Error {
  constructor(reason: string) {
    super(`Restore refused, nothing written: ${reason}`);
    this.name = 'RestoreRefused';
  }
}

/** What the check before writing found, for the steps that follow. */
interface Plan {
  readonly manifest: BackupManifest;
  readonly wholeEnvironment: boolean;
  readonly organisations: readonly OrganisationPart[];
  readonly directoryName: string;
  readonly targetNames: ReadonlyMap<string, string>;
  /** Each dump, checked against its hash, in the work directory. */
  readonly dumps: ReadonlyMap<string, string>;
  readonly keyVersions: readonly DrillKeyVersion[];
}

/** One Organisation as the restore goes. */
interface Progress {
  readonly part: OrganisationPart;
  readonly databaseName: string;
  readonly checks: DrillCheck[];
  readonly gaps: DrillGap[];
  /** The comparison of the control totals, recorded with the participants' results. */
  readonly totals: CheckResult[];
  failed: boolean;
}

/** Restores a backup into a fresh target, holds each Organisation restored and writes the drill record. */
export async function restoreBackup(options: RestoreOptions): Promise<RestoreOutcome> {
  const clock = options.clock ?? { now: () => new Date() };
  const startedAt = clock.now();
  const restoreId = uuidv7();
  const workDirectory = await mkdtemp(join(tmpdir(), 'aos-restore-'));
  try {
    let plan: Plan;
    try {
      plan = await checkBeforeWriting(options, workDirectory);
    } catch (error) {
      if (error instanceof RestoreRefused) {
        options.log(error.message);
        return { outcome: 'refused', reason: error.message };
      }
      throw error;
    }
    options.log(
      `Restore ${restoreId} of backup ${options.backupId} started: ${String(plan.organisations.length)} Organisation(s)${plan.wholeEnvironment ? ' and the directory' : ''}`,
    );
    const steps: DrillStep[] = [];
    const step = async <T>(name: string, organisationCode: string | null, work: () => Promise<T>): Promise<T> => {
      const began = clock.now();
      try {
        const answer = await work();
        steps.push({
          step: name,
          organisationCode,
          startedAt: began.toISOString(),
          endedAt: clock.now().toISOString(),
          outcome: 'done',
        });
        options.log(`${name}${organisationCode === null ? '' : ` (${organisationCode})`}: done`);
        return answer;
      } catch (error) {
        steps.push({
          step: name,
          organisationCode,
          startedAt: began.toISOString(),
          endedAt: clock.now().toISOString(),
          outcome: 'failed',
        });
        options.log(
          `${name}${organisationCode === null ? '' : ` (${organisationCode})`}: failed with ${error instanceof Error ? error.name : 'an error'}`,
        );
        throw error;
      }
    };
    const progress: Progress[] = plan.organisations.map((part) => ({
      part,
      databaseName: plan.targetNames.get(part.organisationCode) ?? '',
      checks: [],
      gaps: [],
      totals: [],
      failed: false,
    }));
    let stopped = false;
    try {
      await runSteps(options, plan, restoreId, progress, step, clock);
    } catch {
      // A step that could not finish stops the restore. What it did is in the drill record; an Organisation whose
      // hold was placed stays held.
      stopped = true;
    }
    const record = drillRecordOf(options, plan, restoreId, startedAt, steps, progress, stopped, clock);
    const names = await keepDrillRecord(options.backupStore, record, options.backupId);
    options.log(`Restore ${restoreId} ${record.result}; the drill record is kept as ${names.json}`);
    return {
      outcome: stopped ? 'failed' : record.result === 'held' ? 'held' : 'held-with-failed-checks',
      restoreId,
      organisations: progress.map((each) => ({
        organisationCode: each.part.organisationCode,
        databaseName: each.databaseName,
        checksFailed: each.checks.filter((check) => !check.passed).length,
      })),
      drillRecord: names,
    };
  } finally {
    await rm(workDirectory, { recursive: true, force: true });
  }
}

/** Every refusal of 4.2 step 1, before anything is written. */
async function checkBeforeWriting(options: RestoreOptions, workDirectory: string): Promise<Plan> {
  const manifest = await readManifest(options);
  if (manifest.result !== 'complete') throw new RestoreRefused('the backup failed its check and is never restored');
  if (manifest.environment !== options.environment) {
    throw new RestoreRefused(
      `the backup is of environment ${manifest.environment}, and the target is ${options.environment} (4.1)`,
    );
  }
  const wholeEnvironment = options.organisationCodes === undefined;
  const codes = options.organisationCodes ?? manifest.organisations.map((part) => part.organisationCode);
  const organisations: OrganisationPart[] = [];
  for (const code of codes) {
    const part = manifest.organisations.find((each) => each.organisationCode === code);
    if (part === undefined) throw new RestoreRefused(`the backup holds no Organisation ${code}`);
    if (!organisations.includes(part)) organisations.push(part);
  }
  if (organisations.length === 0) throw new RestoreRefused('the backup holds no Organisation');
  if (wholeEnvironment && manifest.directory === null) throw new RestoreRefused('the backup holds no directory');

  // Every key version the data needs, from its kept copy (2.3, 2.4).
  const keyVersions: DrillKeyVersion[] = [
    {
      purpose: 'backup',
      organisationCode: null,
      identifier: options.privateKey.version,
      fromKeptCopy: true,
      matchedIdentifier: options.privateKey.version === manifest.backupKeyVersion,
    },
  ];
  for (const part of organisations) {
    const given = options.keyVersions.get(part.organisationCode) ?? new Set<string>();
    const needed = new Set(part.keyVersions.flatMap((use) => (use.identifier === null ? [] : [use.identifier])));
    // A value written before key versions were recorded was sealed by the first version, the only one before rotation
    // (10.4): whichever version the custodian gave stands for it, and the checks that open the data prove it.
    const unrecorded = part.keyVersions.some((use) => use.identifier === null && use.uses > 0);
    if (unrecorded && given.size === 0) {
      throw new RestoreRefused(
        `Organisation ${part.organisationCode}'s data holds values sealed before key versions were recorded, and no kept copy of its first key version was given (2.4)`,
      );
    }
    if (needed.size === 0 && unrecorded) for (const version of given) needed.add(version);
    const missing = [...needed].filter((version) => !given.has(version)).sort();
    if (missing.length > 0) {
      throw new RestoreRefused(
        `Organisation ${part.organisationCode}'s data needs key version ${missing.join(', ')}, and no kept copy of it was given (2.4)`,
      );
    }
    for (const identifier of [...needed].sort()) {
      keyVersions.push({
        purpose: 'organisation-data',
        organisationCode: part.organisationCode,
        identifier,
        fromKeptCopy: true,
        matchedIdentifier: true,
      });
    }
  }

  // The running code holds every migration the backup had applied; an older backup is migrated forward (4.2 step 3).
  const known = {
    directory: new Set(readMigrationSet(migrationSetFolder('directory')).map((file) => file.fileName)),
    organisation: new Set(readMigrationSet(migrationSetFolder('organisation')).map((file) => file.fileName)),
  };
  const newer = (set: keyof typeof known, last: string | null): boolean => last !== null && !known[set].has(last);
  if (wholeEnvironment && newer('directory', manifest.directory?.lastMigration ?? null)) {
    throw new RestoreRefused('the backup was taken by newer code: its directory has a migration this code lacks');
  }
  for (const part of organisations) {
    if (newer('organisation', part.lastMigration)) {
      throw new RestoreRefused(
        `the backup was taken by newer code: Organisation ${part.organisationCode} has a migration this code lacks`,
      );
    }
  }

  // The target is fresh (4.1): an empty directory database, no Organisation database of the names the restore gives,
  // and an empty file store; never the source.
  const directory = new Client({ connectionString: options.directoryConnectionString });
  await directory.connect();
  let directoryName: string;
  const targetNames = new Map<string, string>();
  try {
    try {
      await checkConnectedAsOwner(directory, 'Restore refused');
    } catch (error) {
      throw new RestoreRefused(error instanceof Error ? error.message.replace(/^Restore refused,?\s*/, '') : 'role');
    }
    const facts = await directory.query<{ name: string; objects: string }>(
      `select pg_catalog.current_database()::text as name,
              ((select count(*) from pg_catalog.pg_namespace
                 where nspname not in ('public', 'information_schema') and nspname not like 'pg\\_%')
               + (select count(*) from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
                   where n.nspname = 'public'))::text as objects`,
    );
    directoryName = facts.rows[0]?.name ?? '';
    if (Number(facts.rows[0]?.objects ?? '1') > 0) {
      throw new RestoreRefused(
        directoryName === manifest.directory?.databaseName
          ? 'the target is the source: its directory database is the one the backup was taken from'
          : 'the target is not fresh: its directory database already holds tables (4.1)',
      );
    }
    for (const part of organisations) {
      const name = `${directoryName}_${slug(part.organisationCode)}`;
      if (!DATABASE_NAME.test(name)) {
        throw new RestoreRefused(
          `the database name for Organisation ${part.organisationCode}, the directory's name and its code, is longer than 63 characters; give the directory database a shorter name`,
        );
      }
      if (name === part.databaseName) {
        throw new RestoreRefused(`the target is the source: Organisation ${part.organisationCode}'s database`);
      }
      targetNames.set(part.organisationCode, name);
    }
    const taken = await directory.query<{ datname: string }>(
      'select datname::text as datname from pg_catalog.pg_database where datname = any($1::text[])',
      [[...targetNames.values()]],
    );
    if (taken.rows.length > 0) {
      throw new RestoreRefused(
        `the target is not fresh: database ${taken.rows.map((row) => row.datname).join(', ')} exists`,
      );
    }
  } finally {
    await directory.end();
  }
  if ((await options.fileStore.list('')).length > 0) {
    throw new RestoreRefused('the target is not fresh: its file store holds objects (4.1)');
  }

  // Every dump is there and matches its hash, checked before any is read (4.2 steps 1 and 2).
  const dumps = new Map<string, string>();
  const parts = [...(wholeEnvironment && manifest.directory !== null ? [manifest.directory] : []), ...organisations];
  for (const part of parts) {
    const file = join(workDirectory, `${uuidv7()}.sealed`);
    const hash = createHash('sha256');
    try {
      const stream = await options.backupStore.get(part.object);
      await pipeline(stream, hashing(hash), createWriteStream(file));
    } catch {
      throw new RestoreRefused(`the dump ${part.object} is not in the backup store`);
    }
    if (hash.digest('hex') !== part.sha256) {
      throw new RestoreRefused(`the dump ${part.object} does not match its hash in the manifest`);
    }
    dumps.set(part.object, file);
  }
  // An object a record names that is not in the backup store, or that was changed there, is found by the stored-file
  // check after the restore, which names it and keeps the Organisation held (5.1; GC-9 test 3).
  return { manifest, wholeEnvironment, organisations, directoryName, targetNames, dumps, keyVersions };
}

async function readManifest(options: RestoreOptions): Promise<BackupManifest> {
  const name = MANIFEST_NAME(options.backupId);
  let sealed: Buffer;
  try {
    sealed = await buffer(await options.backupStore.get(name));
  } catch {
    throw new RestoreRefused(`no manifest of backup ${options.backupId} is in the backup store`);
  }
  let manifest: BackupManifest;
  try {
    manifest = JSON.parse(options.privateKey.open(name, sealed).toString('utf8')) as BackupManifest;
  } catch {
    throw new RestoreRefused(
      'the manifest does not open with the backup key given: it is not the private part of the key version that sealed the backup, or the manifest was changed',
    );
  }
  if ((manifest.format as string) !== MANIFEST_FORMAT || manifest.backupId !== options.backupId) {
    throw new RestoreRefused('the manifest is of a format this code does not read');
  }
  return manifest;
}

type StepRunner = <T>(name: string, organisationCode: string | null, work: () => Promise<T>) => Promise<T>;

async function runSteps(
  options: RestoreOptions,
  plan: Plan,
  restoreId: string,
  progress: Progress[],
  step: StepRunner,
  clock: Clock,
): Promise<void> {
  const loadFrom = (object: string) => {
    const file = plan.dumps.get(object);
    if (file === undefined) throw new Error('A dump was not checked before it was read');
    return createReadStream(file).pipe(options.privateKey.openStream(object));
  };

  // Step 2: the directory first when the whole environment is restored.
  const directory = plan.manifest.directory;
  if (plan.wholeEnvironment && directory !== null) {
    await step('restore the directory database', null, async () => {
      await options.restoreTool.restore(
        { connectionString: options.directoryConnectionString },
        loadFrom(directory.object),
      );
    });
  }
  await step('migrate the directory database', null, () =>
    migrateDatabase({ connectionString: options.directoryConnectionString, folder: migrationSetFolder('directory') }),
  );

  for (const each of progress) {
    const code = each.part.organisationCode;
    const connection = options.organisationConnectionString(each.databaseName);
    await step('restore the database', code, async () => {
      await createDatabase(options.directoryConnectionString, each.databaseName);
      await options.restoreTool.restore({ connectionString: connection }, loadFrom(each.part.object));
    });
    // Step 3: the database-level privileges, the recorded checksums and any newer migration.
    await step('migrate the database', code, () =>
      migrateDatabase({ connectionString: connection, folder: migrationSetFolder('organisation') }),
    );
    // 5.2: the control totals, before anything is written to the restored database.
    await step('compare the control totals with the backup', code, async () => {
      const results = await inSnapshot(connection, code, async (context) =>
        compareTotals(each.part, await options.registry.controlTotals(context)),
      );
      each.totals.push(...results);
    });
    // Step 6, before any request can reach it (4.3).
    await step('place the recovery hold', code, () =>
      placeHold(connection, restoreId, plan.manifest.backupId, each.part, clock.now()),
    );
  }

  // Step 4: the directory names each restored Organisation's database in the target.
  await step('point the directory at the target', null, () => pointDirectory(options, plan, progress));

  for (const each of progress) {
    const code = each.part.organisationCode;
    await step('copy the file objects', code, () => copyObjects(options, each.part.organisationId));
    await step('run the restore participants', code, () => runParticipants(options, plan, restoreId, each, clock));
  }
}

/** Creates a database owned by the migration role, which creates it (code-house-rules 5.1). */
async function createDatabase(directoryConnectionString: string, name: string): Promise<void> {
  const client = new Client({ connectionString: directoryConnectionString });
  await client.connect();
  try {
    await client.query(`create database ${client.escapeIdentifier(name)}`);
  } finally {
    await client.end();
  }
}

/** Reads in one repeatable-read, read-only transaction of the database, as the migration role. */
async function inSnapshot<T>(
  connectionString: string,
  organisationCode: string,
  work: (context: ParticipantContext) => Promise<T>,
): Promise<T> {
  const client = new Client({ connectionString });
  await client.connect();
  try {
    await client.query('begin isolation level repeatable read read only');
    const answer = await work({ organisationCode, tx: drizzle({ client }) });
    await client.query('rollback');
    return answer;
  } finally {
    await client.end();
  }
}

/**
 * Compares the restored database's control totals with the manifest's (5.2): every total the backup computed must be
 * equal. A total of a table that newer code added has nothing to compare with and is left out.
 */
function compareTotals(
  part: OrganisationPart,
  computed: readonly { unit: string; totals: readonly { name: string; value: string }[] }[],
): CheckResult[] {
  return part.controlTotals.map((backedUp) => {
    const restored = new Map(
      (computed.find((each) => each.unit === backedUp.unit)?.totals ?? []).map((total) => [total.name, total.value]),
    );
    const differing = backedUp.totals.filter((total) => restored.get(total.name) !== total.value);
    return {
      unit: backedUp.unit,
      check: 'control totals equal the backup',
      passed: differing.length === 0,
      checked: backedUp.totals.length,
      failed: differing.length,
      ...(differing.length === 0 ? {} : { subject: differing.map((total) => total.name).join(', ') }),
    };
  });
}

function record(each: Progress, results: readonly CheckResult[]): void {
  for (const result of results) {
    each.checks.push({
      unit: result.unit,
      check: result.check,
      passed: result.passed,
      checked: result.checked,
      failed: result.failed,
      ...(result.subject === undefined ? {} : { subject: result.subject }),
    });
    if (!result.passed) each.failed = true;
  }
}

/** Places the hold: the `restored` and `hold-placed` events and the one hold row, as the migration role (section 11). */
async function placeHold(
  connectionString: string,
  restoreId: string,
  backupId: string,
  part: OrganisationPart,
  at: Date,
): Promise<void> {
  const client = new Client({ connectionString });
  await client.connect();
  try {
    await client.query('begin');
    await client.query(
      `insert into kernel.recovery_event (id, restore_id, kind, backup_id, recovery_point, occurred_at)
       values ($1, $2, 'restored', $3, $4, $5)`,
      [uuidv7(), restoreId, backupId, part.snapshotAt, at],
    );
    await client.query('insert into kernel.recovery_hold (id, restore_id, placed_at) values ($1, $2, $3)', [
      uuidv7(),
      restoreId,
      at,
    ]);
    await client.query(
      `insert into kernel.recovery_event (id, restore_id, kind, occurred_at) values ($1, $2, 'hold-placed', $3)`,
      [uuidv7(), restoreId, at],
    );
    await client.query('commit');
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    await client.end();
  }
}

/**
 * Points the target's directory at each restored database (4.2 step 4): the whole environment's directory, restored
 * from its dump, has its entries changed to the new names; for one Organisation alone, its entry is written with the
 * identifier it had, which starts every object key (GC9-10).
 */
async function pointDirectory(options: RestoreOptions, plan: Plan, progress: readonly Progress[]): Promise<void> {
  const client = new Client({ connectionString: options.directoryConnectionString });
  await client.connect();
  try {
    await client.query('begin');
    for (const each of progress) {
      const changed = await client.query(
        'update kernel.directory_entry set database_name = $1 where id = $2 and organisation_code = $3',
        [each.databaseName, each.part.organisationId, each.part.organisationCode],
      );
      if (changed.rowCount === 0) {
        await client.query(
          'insert into kernel.directory_entry (id, organisation_code, database_name) values ($1, $2, $3)',
          [each.part.organisationId, each.part.organisationCode, each.databaseName],
        );
      }
    }
    if (plan.wholeEnvironment) {
      const listed = await client.query<{ n: string }>('select count(*)::text as n from kernel.directory_entry');
      if (Number(listed.rows[0]?.n ?? 0) !== progress.length) {
        throw new Error('The restored directory lists an Organisation the backup does not hold');
      }
    }
    await client.query('commit');
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    await client.end();
  }
}

/**
 * Copies the Organisation's objects, those under its identifier (GC9-10), from the backup store into the target's
 * file store, each with the time it was first stored (4.2 step 5; 3.3). Objects no record names are copied and kept
 * too (8.2).
 */
async function copyObjects(options: RestoreOptions, organisationId: string): Promise<void> {
  const prefix = `files/${organisationId}/`;
  for (const name of await options.backupStore.list(prefix)) {
    const object = await options.backupStore.getWithLength(name);
    const storedAt = object.metadata[STORED_AT_METADATA] ?? object.lastModified?.toISOString();
    await options.fileStore.putOnce(
      name.slice('files/'.length),
      object.body,
      object.length,
      storedAt === undefined ? undefined : { [STORED_AT_METADATA]: storedAt },
    );
  }
}

/** The restored file store as the checks read it. */
function restoredObjects(store: RestoreFileStore): RestoredObjects {
  return {
    async list(prefix) {
      const found: RestoredObject[] = [];
      for (const key of await store.list(prefix)) {
        const head = await store.head(key);
        const text = head?.metadata[STORED_AT_METADATA];
        const storedAt = text === undefined ? null : new Date(text);
        found.push({ key, storedAt: storedAt === null || Number.isNaN(storedAt.getTime()) ? null : storedAt });
      }
      return found;
    },
    async get(key) {
      return buffer(await store.get(key));
    },
  };
}

/**
 * The participants of one Organisation (4.2 step 7, 10.1), in tier order: the command steps under the restore's
 * internal service identity, as the runtime role; every module's checks of its invariants and references (5.1); the
 * seal chain's end against the manifest's seal (5.4); the checks that read the file store (5.1); each result kept as
 * a recovery event; and last `audit`'s step, which records each as an audit record.
 */
async function runParticipants(
  options: RestoreOptions,
  plan: Plan,
  restoreId: string,
  each: Progress,
  clock: Clock,
): Promise<void> {
  const part = each.part;
  const migration = options.organisationConnectionString(each.databaseName);
  const handle = createDb(options.runtimeConnectionString(each.databaseName), { max: 2 });
  try {
    const runner = new CommandRunner({ clock, timezones: options.timezones, logger: options.logger });
    const organisation: RoutedOrganisation = {
      organisationCode: part.organisationCode,
      organisationId: part.organisationId,
      databaseName: each.databaseName,
      db: handle.db,
    };
    const run: RestoreRun = {
      restoreId,
      backupId: plan.manifest.backupId,
      organisationId: part.organisationId,
      organisationCode: part.organisationCode,
      recoveryPoint: new Date(part.snapshotAt),
      objects: restoredObjects(options.fileStore),
      recorded: [],
    };
    const actorId = await runner.read(
      {
        commandName: 'kernel.authenticate-restore',
        organisation,
        correlationId: newCorrelationId(),
        actor: { kind: 'no-actor', path: 'authenticate' },
      },
      (context) => options.identities.authenticate(context, RESTORE_IDENTITY),
    );
    const ordered = [...options.steps].sort((a, b) => a.tier - b.tier || (a.unit < b.unit ? -1 : 1));
    const commands = ordered.filter((step) => step.kind === 'command');
    const results: { readonly result: CheckResult; readonly kind: 'step' | 'check' }[] = each.totals.map((result) => ({
      kind: 'check',
      result,
    }));
    const gaps: RecoveryGap[] = [];

    const runCommand = async (command: (typeof commands)[number], current: RestoreRun): Promise<void> => {
      if (actorId === undefined) {
        results.push({
          kind: 'step',
          result: {
            unit: command.unit,
            check: `${command.commandName}: the restore's service identity is enabled`,
            passed: false,
            checked: 1,
            failed: 1,
          },
        });
        return;
      }
      const answered = await runner.run(
        {
          commandName: command.commandName,
          organisation,
          correlationId: newCorrelationId(),
          actor: { kind: 'actor', actorId },
        },
        async (context) => {
          if (command.authorises !== undefined) {
            const held = await options.identities.hold(context, actorId, command.authorises);
            if (held.kind !== 'held') {
              return [
                {
                  check: `${command.commandName}: the restore's service identity holds ${command.authorises.action} on ${command.authorises.recordType}`,
                  passed: false,
                  checked: 1,
                  failed: 1,
                },
              ];
            }
          }
          return command.run(context, current);
        },
      );
      for (const result of answered) results.push({ kind: 'step', result: { unit: command.unit, ...result } });
    };

    // The command steps that come first, in tier order: access ends every session, numbering pauses every series.
    for (const command of commands.filter((each) => each.last !== true)) await runCommand(command, run);

    // The checks, as the migration role, which row-level security does not filter (5.1, 5.4).
    await inSnapshot(migration, part.organisationCode, async (context) => {
      for (const result of await options.registry.check(context)) results.push({ kind: 'check', result });
      const seal = await options.registry.latestSeal(context);
      const expected = part.latestSeal;
      const sameEnd =
        (seal === null && expected === null) ||
        (seal !== null &&
          expected !== null &&
          seal.blockNumber === expected.blockNumber &&
          seal.hash === expected.hash);
      results.push({
        kind: 'check',
        result: {
          unit: 'audit',
          check: 'audit seal chain ends at the manifest seal',
          passed: sameEnd,
          checked: 1,
          failed: sameEnd ? 0 : 1,
        },
      });
      for (const check of ordered.filter((step) => step.kind === 'check')) {
        const found = await check.run(context, run);
        for (const result of found.results) results.push({ kind: 'check', result: { unit: check.unit, ...result } });
        for (const gap of found.gaps) gaps.push({ unit: check.unit, ...gap });
      }
    });

    // Every result and gap recorded in the restored database (section 11), then audit's step records each result.
    const recorded = await recordResults(migration, restoreId, results, gaps, clock.now());
    for (const command of commands.filter((each) => each.last === true)) {
      const before = results.length;
      await runCommand(command, { ...run, recorded });
      await recordResults(migration, restoreId, results.slice(before), [], clock.now());
    }
    record(
      each,
      results.map((entry) => entry.result),
    );
    for (const gap of gaps) {
      each.gaps.push({
        unit: gap.unit,
        name: gap.name,
        subject: gap.subject,
        subjectAt: gap.subjectAt === null ? null : gap.subjectAt.toISOString(),
        afterRecoveryPoint: storedAfterRecoveryPoint(gap.subjectAt, run.recoveryPoint),
      });
    }
  } finally {
    await handle.close();
  }
}

/** Appends each result and gap as a `kernel.recovery_event` row, as the migration role (section 11). */
async function recordResults(
  connectionString: string,
  restoreId: string,
  results: readonly { readonly result: CheckResult; readonly kind: 'step' | 'check' }[],
  gaps: readonly RecoveryGap[],
  at: Date,
): Promise<RecordedResult[]> {
  const client = new Client({ connectionString });
  await client.connect();
  const recorded: RecordedResult[] = [];
  try {
    await client.query('begin');
    for (const { result, kind } of results) {
      const eventId = uuidv7();
      await client.query(
        `insert into kernel.recovery_event (id, restore_id, kind, unit, name, passed, checked, failed, subject,
           occurred_at)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          eventId,
          restoreId,
          kind,
          result.unit,
          result.check,
          result.passed,
          result.checked,
          result.failed,
          result.subject ?? null,
          at,
        ],
      );
      recorded.push({ ...result, eventId, kind });
    }
    for (const gap of gaps) {
      await client.query(
        `insert into kernel.recovery_event (id, restore_id, kind, unit, name, subject, subject_at, occurred_at)
         values ($1, $2, 'gap', $3, $4, $5, $6, $7)`,
        [uuidv7(), restoreId, gap.unit, gap.name, gap.subject, gap.subjectAt, at],
      );
    }
    await client.query('commit');
    return recorded;
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    await client.end();
  }
}

function drillRecordOf(
  options: RestoreOptions,
  plan: Plan,
  restoreId: string,
  startedAt: Date,
  steps: readonly DrillStep[],
  progress: readonly Progress[],
  stopped: boolean,
  clock: Clock,
): DrillRecord {
  const organisations: DrillOrganisation[] = progress.map((each) => ({
    organisationCode: each.part.organisationCode,
    organisationId: each.part.organisationId,
    recoveryPoint: each.part.snapshotAt,
    databaseFrom: each.part.databaseName,
    databaseTo: each.databaseName,
    checks: each.checks,
    gaps: each.gaps,
    gapsSettled: null,
    seriesToReconcile: 0,
    seriesReconciled: [],
    validations: [],
    reopened: null,
    held: true,
  }));
  const base = {
    format: DRILL_RECORD_FORMAT,
    version: 1,
    writtenAt: clock.now().toISOString(),
    restoreId,
    environment: options.environment,
    purpose: options.purpose,
    conductedBy: options.conductedBy,
    restoreStartedAt: startedAt.toISOString(),
    backup: {
      backupId: plan.manifest.backupId,
      takenAt: plan.manifest.startedAt,
      codeCommit: plan.manifest.codeCommit,
      backupKeyVersion: plan.manifest.backupKeyVersion,
    },
    steps,
    keyVersions: plan.keyVersions,
    organisations,
  } as const;
  return {
    ...base,
    result: stopped ? 'failed' : progress.some((each) => each.failed) ? 'held-with-failed-checks' : 'held',
    measured: measuredTimes(base),
  };
}

/** Keeps a version of the drill record beside the backup, as a structured file and a readable text (section 6). */
export async function keepDrillRecord(
  store: Pick<RestoreBackupStore, 'putOnce'>,
  record: DrillRecord,
  backupId: string,
): Promise<{ json: string; text: string }> {
  const names = drillRecordNames(backupId, record.restoreId, record.version);
  const json = Buffer.from(`${JSON.stringify(record, null, 2)}\n`, 'utf8');
  const text = Buffer.from(drillRecordText(record), 'utf8');
  await store.putOnce(names.json, json, json.length);
  await store.putOnce(names.text, text, text.length);
  return names;
}

/** An Organisation code as a part of a database name: lower case, letters and digits, `_` for anything else. */
function slug(code: string): string {
  return code
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function hashing(hash: ReturnType<typeof createHash>): Transform {
  return new Transform({
    transform(chunk: Buffer, _encoding, done) {
      hash.update(chunk);
      done(null, chunk);
    },
  });
}
