import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough, Transform, type Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { uuidv7 } from '@apparel-os/domain';
import { drizzle } from 'drizzle-orm/node-postgres';
import type { Client } from 'pg';
import { DATABASE_NAME } from '../db/connection.js';
import type { DeploymentEnvironmentName } from '../environment/deployment-environment.js';
import { systemClock, type Clock } from '../time/clock.js';
import { BackupSealer, type BackupPublicKey } from './backup-cipher.js';
import { signatureName, type BackupSigningKey } from './backup-signature.js';
import type { BackupStore } from './backup-store.js';
import type { DumpTool } from './dump-tool.js';
import { asOwner, OperatorRefused, withConnection } from './operator-connection.js';
import type { KeyVersionUse, ParticipantTotals, RestoreRegistry, SealFact } from './restore-contract.js';

// The application backup (backup-and-restore 3.2, 3.3, 10.3; PRD-SEC-012, POL-18.02; S1-F14-T02). An operator
// command, never an API endpoint and never run by `app` or `worker`: it reads every database as the migration role
// (GC9-7, product owner, 10 Oct 2026), and the backup store's and file store's credentials. Nothing in it calls an
// outside system inside a write transaction (code-house-rules 8.3): each snapshot transaction is read only, and the
// rows of `kernel.backup_record` are written after every outside step.
//
//   1. For each database, the directory first, a repeatable-read, read-only transaction exports its snapshot and
//      PostgreSQL's dump tool runs on it; in the same snapshot each participant computes its control totals, and the
//      latest audit seal, the stored-file keys and the key versions are read (steps 1 to 3).
//   2. Each dump is sealed with the backup key's public part and stored with the SHA-256 of what is stored (step 4).
//   3. The file store is copied after every snapshot, incrementally (step 5; 3.3).
//   4. The backup is checked: every stored-file key a snapshot references is in the backup store's own listing, and
//      every dump read back matches its hash and decrypts whole under the backup's content key, which the command
//      holds in memory for its run since it never holds the private part (step 7; GC9-17).
//   5. The manifest, sealed too, says what the backup holds and what the checks of 4 found; it is read back, and then
//      the signed statement says the backup's final result, the manifest's read-back included (backup-signature.ts;
//      product owner, 12 Oct 2026). A failed backup is kept with its failures and is never offered for restore (steps
//      6 and 7).
//   6. Each Organisation database backed up gains its `kernel.backup_record` row with the final result; the directory
//      gets none (step 8; DEC-093).
//
// The directory is read once, in its snapshot: the Organisations checked before writing are the ones backed up.

export const MANIFEST_FORMAT = 'backup-manifest/1';

/** Why a backup is failed: kinds only, never record data (PRD-SEC-014). */
export type BackupFailureKind =
  | 'object-missing'
  | 'dump-hash-differs'
  | 'dump-does-not-decrypt'
  | 'manifest-does-not-decrypt'
  | 'dump-tool-failed'
  | 'file-copy-failed';

export interface BackupFailure {
  readonly kind: BackupFailureKind;
  /** Which part: `directory`, or the Organisation's code. */
  readonly part: string;
  /** How many items failed, where there are several, such as objects missing. */
  readonly count: number;
}

/** One database's dump in the backup store. */
export interface DumpPart {
  /** The sealed dump's name in the backup store. */
  readonly object: string;
  readonly databaseName: string;
  readonly snapshotAt: string;
  /** The last migration applied, so a restore refuses a backup taken by newer code (4.2 step 1). */
  readonly lastMigration: string | null;
  /** SHA-256 of the sealed dump as stored. */
  readonly sha256: string;
  readonly bytes: number;
}

export interface OrganisationPart extends DumpPart {
  readonly organisationId: string;
  readonly organisationCode: string;
  readonly controlTotals: readonly ParticipantTotals[];
  readonly latestSeal: SealFact | null;
  /** The file store's object keys the snapshot's records name (3.2 step 6). */
  readonly objectKeys: readonly string[];
  /** The key versions its encrypted values and files need (2.3); null is the first version, unrecorded. */
  readonly keyVersions: readonly KeyVersionUse[];
}

/** What a backup holds and how to check it: no record data and no key (3.2 step 6; PRD-SEC-012). */
export interface BackupManifest {
  readonly format: typeof MANIFEST_FORMAT;
  readonly backupId: string;
  readonly environment: DeploymentEnvironmentName;
  readonly codeCommit: string | null;
  readonly startedAt: string;
  readonly finishedAt: string;
  /** The identifier of the backup key version that sealed it (2.4). */
  readonly backupKeyVersion: string;
  /**
   * PostgreSQL's system identifier of the server backed up, where the server lets the migration role read it, so a
   * restore can tell its source's server apart from a fresh one (4.1).
   */
  readonly sourceSystemIdentifier: string | null;
  /**
   * The result of the checks of the dumps and objects (3.2 step 7). The manifest's own read-back comes after it is
   * written: the signed statement holds the final result (backup-signature.ts).
   */
  readonly result: 'complete' | 'failed';
  readonly failures: readonly BackupFailure[];
  readonly directory: DumpPart | null;
  readonly organisations: readonly OrganisationPart[];
}

export interface BackupOptions {
  /** The directory database as the migration role. Never logged. */
  readonly directoryConnectionString: string;
  /** An Organisation's database, on the same server, as the migration role. */
  readonly organisationConnectionString: (databaseName: string) => string;
  readonly environment: DeploymentEnvironmentName;
  /** The commit of the code that takes the backup, where the environment names it. */
  readonly codeCommit: string | null;
  readonly publicKey: BackupPublicKey;
  /** The signing key, held by the backup runner only (product owner, 12 Oct 2026). */
  readonly signingKey: BackupSigningKey;
  /**
   * The operator states that a new backup key version starts (2.4): without it, a backup key whose identifier differs
   * from the last complete backup's is refused.
   */
  readonly newBackupKeyVersion: boolean;
  readonly backupStore: BackupStore;
  /** Copies one Organisation's objects from the file store into the backup store (files-imports, 3.3). */
  readonly copyFiles: (organisationId: string) => Promise<unknown>;
  readonly registry: RestoreRegistry;
  readonly dumpTool: DumpTool;
  /** Told each step in plain words, with no secret, connection string or record data (PRD-SEC-014). */
  readonly log: (message: string) => void;
  readonly clock?: Clock;
}

export type BackupOutcome =
  | {
      readonly outcome: 'complete' | 'failed';
      readonly backupId: string;
      readonly manifestSha256: string;
      readonly failures: readonly BackupFailure[];
      readonly organisations: readonly string[];
    }
  | { readonly outcome: 'refused'; readonly reason: string };

/** The backup was refused before anything was written. */
export class BackupRefused extends OperatorRefused {
  constructor(reason: string) {
    super(reason);
    this.name = 'BackupRefused';
  }
}

const REFUSED = 'Backup refused';

interface DirectoryRow extends Record<string, unknown> {
  id: string;
  organisation_code: string;
  database_name: string;
}

/** Takes one application backup of the environment. */
export async function takeBackup(options: BackupOptions): Promise<BackupOutcome> {
  const clock = options.clock ?? systemClock;
  const startedAt = clock.now();
  const backupId = uuidv7();
  const sealer = BackupSealer.start(options.publicKey, backupId);
  const workDirectory = await mkdtemp(join(tmpdir(), 'aos-backup-'));
  const failures: BackupFailure[] = [];
  try {
    let taken: { directory: DumpPart | null; entries: DirectoryRow[]; systemIdentifier: string | null };
    try {
      taken = await asOwner(options.directoryConnectionString, REFUSED, async (directory) => {
        await directory.query('begin isolation level repeatable read read only');
        // The snapshot is taken by the first statement: the entries read here are the ones checked and backed up.
        const snapshot = await exportSnapshot(directory);
        const entries = (
          await directory.query<DirectoryRow>(
            'select id::text as id, organisation_code, database_name from kernel.directory_entry order by organisation_code collate "C"',
          )
        ).rows;
        await checkOrganisations(options, entries);
        options.log(`Backup ${backupId} started, sealed with backup key version ${sealer.version}`);
        const part = await dumpAndStore(options, sealer, workDirectory, snapshot, {
          object: `backups/${backupId}/directory.dump`,
          connectionString: options.directoryConnectionString,
        });
        await directory.query('rollback');
        return { directory: part, entries, systemIdentifier: await systemIdentifierOf(directory) };
      });
    } catch (error) {
      if (error instanceof OperatorRefused) return { outcome: 'refused', reason: error.message };
      throw error;
    }
    if (taken.directory === null) failures.push({ kind: 'dump-tool-failed', part: 'directory', count: 1 });

    const organisations: OrganisationPart[] = [];
    for (const entry of taken.entries) {
      const part = await snapshotOrganisation(options, sealer, workDirectory, backupId, entry);
      if (part === null) failures.push({ kind: 'dump-tool-failed', part: entry.organisation_code, count: 1 });
      else organisations.push(part);
    }

    // The file store after every snapshot (3.3).
    for (const entry of taken.entries) {
      try {
        await options.copyFiles(entry.id);
      } catch {
        failures.push({ kind: 'file-copy-failed', part: entry.organisation_code, count: 1 });
      }
    }

    failures.push(...(await checkBackup(options, sealer, taken.directory, organisations)));

    const manifest: BackupManifest = {
      format: MANIFEST_FORMAT,
      backupId,
      environment: options.environment,
      codeCommit: options.codeCommit,
      startedAt: startedAt.toISOString(),
      finishedAt: clock.now().toISOString(),
      backupKeyVersion: sealer.version,
      sourceSystemIdentifier: taken.systemIdentifier,
      result: failures.length === 0 ? 'complete' : 'failed',
      failures: [...failures],
      directory: taken.directory,
      organisations,
    };
    const manifestName = `backups/${backupId}/manifest`;
    const sealedManifest = sealer.seal(manifestName, Buffer.from(JSON.stringify(manifest), 'utf8'));
    const manifestSha256 = createHash('sha256').update(sealedManifest).digest('hex');
    await options.backupStore.putOnce(manifestName, sealedManifest, sealedManifest.length);
    const manifestFound = await readBack(options.backupStore, sealer, manifestName);
    if (manifestFound.sha256 !== manifestSha256 || !manifestFound.decrypts) {
      failures.push({ kind: 'manifest-does-not-decrypt', part: 'manifest', count: 1 });
    }
    const result = failures.length === 0 ? 'complete' : 'failed';
    // The final result, after the manifest's own read-back, signed (product owner, 12 Oct 2026).
    const signature = options.signingKey.sign({
      backupId,
      manifestObject: manifestName,
      manifestSha256,
      result,
      failures: [...new Set(failures.map((failure) => failure.kind))].sort(),
    });
    await options.backupStore.putOnce(signatureName(backupId), signature, signature.length);

    // The record of the backup in each Organisation database it covered (3.2 step 8).
    const finishedAt = clock.now();
    for (const organisation of organisations) {
      await recordBackup(options, organisation, {
        backupId,
        manifestSha256,
        result,
        failures,
        finishedAt,
        backupKeyVersion: sealer.version,
      });
    }
    options.log(
      `Backup ${backupId} ${result}: ${String(organisations.length)} Organisation(s)${failures.length === 0 ? '' : `; failures: ${failures.map((failure) => `${failure.kind} (${failure.part}, ${String(failure.count)})`).join(', ')}`}`,
    );
    return {
      outcome: result,
      backupId,
      manifestSha256,
      failures,
      organisations: organisations.map((organisation) => organisation.organisationCode),
    };
  } finally {
    await rm(workDirectory, { recursive: true, force: true });
  }
}

/**
 * Refusals before anything is written, for the Organisations the directory's snapshot lists: each database name one
 * the tools can be given; each connection the migration role on a database it owns; and the backup key's version the
 * last complete backup's, unless the operator states that a new version starts (2.4; GC9-18).
 */
async function checkOrganisations(options: BackupOptions, entries: readonly DirectoryRow[]): Promise<void> {
  for (const entry of entries) {
    if (!DATABASE_NAME.test(entry.database_name)) {
      throw new BackupRefused(
        `${REFUSED}, nothing written: Organisation ${entry.organisation_code}'s database name is not letters, digits and _ of at most 63 characters`,
      );
    }
    const version = await asOwner(
      options.organisationConnectionString(entry.database_name),
      REFUSED,
      async (client) =>
        (
          await client.query<{ backup_key_version: string }>(
            `select backup_key_version from kernel.backup_record where result = 'complete'
              order by finished_at desc, id desc limit 1`,
          )
        ).rows[0]?.backup_key_version,
    );
    if (version !== undefined && version !== options.publicKey.version && !options.newBackupKeyVersion) {
      throw new BackupRefused(
        `${REFUSED}, nothing written: Organisation ${entry.organisation_code}'s last complete backup was sealed with backup key version ${version}, and the key given is version ${options.publicKey.version}. If a new backup key version starts, say so (2.4)`,
      );
    }
  }
}

/** PostgreSQL's system identifier of the server, or null where the role may not read it. */
async function systemIdentifierOf(client: Client): Promise<string | null> {
  try {
    const found = await client.query<{ id: string }>(
      'select system_identifier::text as id from pg_catalog.pg_control_system()',
    );
    return found.rows[0]?.id ?? null;
  } catch {
    return null;
  }
}

/** The check of 3.2 step 7: every object a snapshot names is in the backup store; every dump reads back whole. */
async function checkBackup(
  options: BackupOptions,
  sealer: BackupSealer,
  directory: DumpPart | null,
  organisations: readonly OrganisationPart[],
): Promise<BackupFailure[]> {
  const failures: BackupFailure[] = [];
  const present = new Set(await options.backupStore.list('files/'));
  for (const organisation of organisations) {
    const missing = organisation.objectKeys.filter((key) => !present.has(`files/${key}`)).length;
    if (missing > 0) failures.push({ kind: 'object-missing', part: organisation.organisationCode, count: missing });
  }
  const parts: { label: string; part: DumpPart }[] = [
    ...(directory === null ? [] : [{ label: 'directory', part: directory }]),
    ...organisations.map((part) => ({ label: part.organisationCode, part })),
  ];
  for (const { label, part } of parts) {
    const found = await readBack(options.backupStore, sealer, part.object);
    if (found.sha256 !== part.sha256) failures.push({ kind: 'dump-hash-differs', part: label, count: 1 });
    if (!found.decrypts) failures.push({ kind: 'dump-does-not-decrypt', part: label, count: 1 });
  }
  return failures;
}

/**
 * One Organisation's snapshot (3.2 steps 1 to 3): in one repeatable-read, read-only transaction, the snapshot is
 * exported, every participant's control totals, the latest audit seal, the object keys and the key versions are read,
 * and the database is dumped on that snapshot, so all of them see the same committed state. Null when the dump failed.
 */
async function snapshotOrganisation(
  options: BackupOptions,
  sealer: BackupSealer,
  workDirectory: string,
  backupId: string,
  entry: DirectoryRow,
): Promise<OrganisationPart | null> {
  const connectionString = options.organisationConnectionString(entry.database_name);
  return withConnection(connectionString, async (client) => {
    await client.query('begin isolation level repeatable read read only');
    const snapshot = await exportSnapshot(client);
    const context = { organisationCode: entry.organisation_code, tx: drizzle({ client }) };
    const controlTotals = await options.registry.controlTotals(context);
    const latestSeal = await options.registry.latestSeal(context);
    const objectKeys = await options.registry.objectKeys(context);
    const keyVersions = await options.registry.keyVersions(context);
    const dumped = await dumpAndStore(options, sealer, workDirectory, snapshot, {
      object: `backups/${backupId}/organisations/${entry.id}.dump`,
      connectionString,
    });
    await client.query('rollback');
    if (dumped === null) return null;
    return {
      ...dumped,
      organisationId: entry.id,
      organisationCode: entry.organisation_code,
      controlTotals,
      latestSeal,
      objectKeys,
      keyVersions,
    };
  });
}

/** The open transaction's snapshot, exported for the dump tool, with its time, database and last migration. */
interface ExportedSnapshot {
  readonly snapshot: string;
  readonly at: Date;
  readonly database: string;
  readonly lastMigration: string | null;
}

async function exportSnapshot(client: Client): Promise<ExportedSnapshot> {
  const snapshot = await client.query<{ snapshot: string; at: Date; database: string }>(
    'select pg_catalog.pg_export_snapshot() as snapshot, pg_catalog.clock_timestamp() as at, pg_catalog.current_database()::text as database',
  );
  const exported = snapshot.rows[0];
  if (exported === undefined) throw new Error('The snapshot could not be exported');
  const migration = await client.query<{ file_name: string }>(
    'select file_name from kernel.migration order by file_name collate "C" desc limit 1',
  );
  return { ...exported, lastMigration: migration.rows[0]?.file_name ?? null };
}

/** Dumps the database on an exported snapshot, seals the dump and stores it: its part, or null when the dump failed. */
async function dumpAndStore(
  options: BackupOptions,
  sealer: BackupSealer,
  workDirectory: string,
  exported: ExportedSnapshot,
  target: { readonly object: string; readonly connectionString: string },
): Promise<DumpPart | null> {
  const file = join(workDirectory, `${uuidv7()}.sealed`);
  const hash = createHash('sha256');
  let bytes = 0;
  const seal = sealer.sealStream(target.object);
  const count = new Transform({
    transform(chunk: Buffer, _encoding, done) {
      hash.update(chunk);
      bytes += chunk.length;
      done(null, chunk);
    },
  });
  const written = pipeline(seal, count, createWriteStream(file));
  try {
    await options.dumpTool.dump({ connectionString: target.connectionString, snapshot: exported.snapshot }, seal);
    await written;
  } catch {
    await written.catch(() => undefined);
    options.log(`The dump of database ${exported.database} failed; the backup is failed`);
    return null;
  }
  await options.backupStore.putOnce(target.object, createReadStream(file), bytes);
  await rm(file, { force: true });
  return {
    object: target.object,
    databaseName: exported.database,
    snapshotAt: new Date(exported.at).toISOString(),
    lastMigration: exported.lastMigration,
    sha256: hash.digest('hex'),
    bytes,
  };
}

/** Reads a stored object back: the SHA-256 of what is stored, and whether it decrypts whole under the backup's key. */
async function readBack(
  store: BackupStore,
  sealer: BackupSealer,
  name: string,
): Promise<{ readonly sha256: string; readonly decrypts: boolean }> {
  let stream: Readable;
  try {
    stream = await store.get(name);
  } catch {
    return { sha256: '', decrypts: false };
  }
  const hash = createHash('sha256');
  const tee = new PassThrough();
  tee.on('data', (chunk: Buffer) => hash.update(chunk));
  const checked = sealer.check(name, tee);
  stream.pipe(tee);
  const result = await checked;
  return { sha256: hash.digest('hex'), decrypts: result.ok };
}

async function recordBackup(
  options: BackupOptions,
  organisation: OrganisationPart,
  record: {
    readonly backupId: string;
    readonly manifestSha256: string;
    readonly result: 'complete' | 'failed';
    readonly failures: readonly BackupFailure[];
    readonly finishedAt: Date;
    readonly backupKeyVersion: string;
  },
): Promise<void> {
  await withConnection(options.organisationConnectionString(organisation.databaseName), async (client) => {
    await client.query(
      `insert into kernel.backup_record (id, backup_id, environment, code_commit, snapshot_at, backup_key_version,
         manifest_sha256, result, failures, finished_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        uuidv7(),
        record.backupId,
        options.environment,
        options.codeCommit,
        organisation.snapshotAt,
        record.backupKeyVersion,
        record.manifestSha256,
        record.result,
        [...new Set(record.failures.map((failure) => failure.kind))].sort(),
        record.finishedAt,
      ],
    );
  });
}
