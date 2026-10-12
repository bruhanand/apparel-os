import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough, Transform, type Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { uuidv7 } from '@apparel-os/domain';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Client } from 'pg';
import { checkConnectedAsOwner } from '../db/migration-runner.js';
import type { DeploymentEnvironmentName } from '../environment/deployment-environment.js';
import { BackupSealer, type BackupPublicKey } from './backup-cipher.js';
import type { BackupStore } from './backup-store.js';
import type { DumpTool } from './dump-tool.js';
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
//   5. The manifest, sealed too, says what the backup holds and whether it is complete; a failed backup is kept with
//      its failures and is never offered for restore (steps 6 and 7).
//   6. Each Organisation database backed up gains its `kernel.backup_record` row; the directory gets none (step 8;
//      DEC-093).

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
  readonly now?: () => Date;
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
export class BackupRefused extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = 'BackupRefused';
  }
}

interface DirectoryRow extends Record<string, unknown> {
  id: string;
  organisation_code: string;
  database_name: string;
}

/** A database part as the backup takes it, before the check. */
interface Taken<Part> {
  readonly part: Part | null;
  readonly failed: boolean;
}

/** Takes one application backup of the environment. */
export async function takeBackup(options: BackupOptions): Promise<BackupOutcome> {
  const now = options.now ?? (() => new Date());
  const startedAt = now();
  try {
    await checkBeforeWriting(options);
  } catch (error) {
    if (error instanceof BackupRefused) return { outcome: 'refused', reason: error.message };
    throw error;
  }
  const backupId = uuidv7();
  const sealer = BackupSealer.start(options.publicKey, backupId);
  const workDirectory = await mkdtemp(join(tmpdir(), 'aos-backup-'));
  const failures: BackupFailure[] = [];
  try {
    options.log(`Backup ${backupId} started, sealed with backup key version ${sealer.version}`);
    const directory = new Client({ connectionString: options.directoryConnectionString });
    await directory.connect();
    let directoryTaken: Taken<DumpPart>;
    let entries: DirectoryRow[];
    try {
      await directory.query('begin isolation level repeatable read read only');
      entries = (
        await directory.query<DirectoryRow>(
          'select id::text as id, organisation_code, database_name from kernel.directory_entry order by organisation_code collate "C"',
        )
      ).rows;
      directoryTaken = await dumpDatabase(options, sealer, workDirectory, directory, {
        object: `backups/${backupId}/directory.dump`,
        connectionString: options.directoryConnectionString,
      });
      await directory.query('rollback');
    } finally {
      await directory.end();
    }
    if (directoryTaken.failed) failures.push({ kind: 'dump-tool-failed', part: 'directory', count: 1 });

    const organisations: OrganisationPart[] = [];
    for (const entry of entries) {
      const taken = await snapshotOrganisation(options, sealer, workDirectory, backupId, entry);
      if (taken.failed) failures.push({ kind: 'dump-tool-failed', part: entry.organisation_code, count: 1 });
      if (taken.part !== null) organisations.push(taken.part);
    }

    // The file store after every snapshot (3.3).
    for (const entry of entries) {
      try {
        await options.copyFiles(entry.id);
      } catch {
        failures.push({ kind: 'file-copy-failed', part: entry.organisation_code, count: 1 });
      }
    }

    // The check (3.2 step 7).
    const present = new Set(await options.backupStore.list('files/'));
    for (const organisation of organisations) {
      const missing = organisation.objectKeys.filter((key) => !present.has(`files/${key}`)).length;
      if (missing > 0) failures.push({ kind: 'object-missing', part: organisation.organisationCode, count: missing });
    }
    const parts: { label: string; part: DumpPart }[] = [
      ...(directoryTaken.part === null ? [] : [{ label: 'directory', part: directoryTaken.part }]),
      ...organisations.map((part) => ({ label: part.organisationCode, part })),
    ];
    for (const { label, part } of parts) {
      const found = await readBack(options.backupStore, sealer, part.object);
      if (found.sha256 !== part.sha256) failures.push({ kind: 'dump-hash-differs', part: label, count: 1 });
      if (!found.decrypts) failures.push({ kind: 'dump-does-not-decrypt', part: label, count: 1 });
    }

    const manifest: BackupManifest = {
      format: MANIFEST_FORMAT,
      backupId,
      environment: options.environment,
      codeCommit: options.codeCommit,
      startedAt: startedAt.toISOString(),
      finishedAt: now().toISOString(),
      backupKeyVersion: sealer.version,
      result: failures.length === 0 ? 'complete' : 'failed',
      failures: [...failures],
      directory: directoryTaken.part,
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

    // The record of the backup in each Organisation database it covered (3.2 step 8).
    const finishedAt = now();
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
 * Refusals before anything is written: a connection that is not the migration role on a database it owns, and a
 * backup key whose version differs from the last complete backup's, unless the operator states that a new version
 * starts (2.4; GC9-18).
 */
async function checkBeforeWriting(options: BackupOptions): Promise<void> {
  const directory = new Client({ connectionString: options.directoryConnectionString });
  await directory.connect();
  let entries: DirectoryRow[];
  try {
    await ownerOnly(directory);
    entries = (
      await directory.query<DirectoryRow>(
        'select id::text as id, organisation_code, database_name from kernel.directory_entry order by organisation_code collate "C"',
      )
    ).rows;
  } finally {
    await directory.end();
  }
  for (const entry of entries) {
    const client = new Client({ connectionString: options.organisationConnectionString(entry.database_name) });
    await client.connect();
    try {
      await ownerOnly(client);
      const last = await client.query<{ backup_key_version: string }>(
        `select backup_key_version from kernel.backup_record where result = 'complete'
          order by finished_at desc, id desc limit 1`,
      );
      const version = last.rows[0]?.backup_key_version;
      if (version !== undefined && version !== options.publicKey.version && !options.newBackupKeyVersion) {
        throw new BackupRefused(
          `Backup refused, nothing written: Organisation ${entry.organisation_code}'s last complete backup was sealed with backup key version ${version}, and the key given is version ${options.publicKey.version}. If a new backup key version starts, say so (2.4)`,
        );
      }
    } finally {
      await client.end();
    }
  }
}

async function ownerOnly(client: Client): Promise<void> {
  try {
    await checkConnectedAsOwner(client, 'Backup refused');
  } catch (error) {
    throw new BackupRefused(error instanceof Error ? error.message : 'Backup refused, nothing written');
  }
}

async function snapshotOrganisation(
  options: BackupOptions,
  sealer: BackupSealer,
  workDirectory: string,
  backupId: string,
  entry: DirectoryRow,
): Promise<Taken<OrganisationPart>> {
  const connectionString = options.organisationConnectionString(entry.database_name);
  const client = new Client({ connectionString });
  await client.connect();
  try {
    await client.query('begin isolation level repeatable read read only');
    // The snapshot is taken by the transaction's first statement; every read below sees the same committed state as
    // the dump (3.2 steps 1 to 3).
    const context = { organisationCode: entry.organisation_code, tx: drizzle({ client }) };
    const dumped = await dumpDatabase(options, sealer, workDirectory, client, {
      object: `backups/${backupId}/organisations/${entry.id}.dump`,
      connectionString,
      before: async () => ({
        controlTotals: await options.registry.controlTotals(context),
        latestSeal: await options.registry.latestSeal(context),
        objectKeys: await options.registry.objectKeys(context),
        keyVersions: await options.registry.keyVersions(context),
      }),
    });
    await client.query('rollback');
    if (dumped.part === null) return { part: null, failed: true };
    const { extra, ...part } = dumped.part;
    return {
      part: {
        ...part,
        organisationId: entry.id,
        organisationCode: entry.organisation_code,
        ...(extra as Pick<OrganisationPart, 'controlTotals' | 'latestSeal' | 'objectKeys' | 'keyVersions'>),
      },
      failed: dumped.failed,
    };
  } finally {
    await client.end();
  }
}

/**
 * Exports the open transaction's snapshot, reads what `before` reads in it, dumps the database on it, seals the dump
 * and stores it.
 */
async function dumpDatabase(
  options: BackupOptions,
  sealer: BackupSealer,
  workDirectory: string,
  client: Client,
  target: {
    readonly object: string;
    readonly connectionString: string;
    readonly before?: () => Promise<unknown>;
  },
): Promise<Taken<DumpPart & { readonly extra?: unknown }>> {
  const snapshot = await client.query<{ snapshot: string; at: Date; database: string }>(
    'select pg_catalog.pg_export_snapshot() as snapshot, pg_catalog.clock_timestamp() as at, pg_catalog.current_database()::text as database',
  );
  const exported = snapshot.rows[0];
  if (exported === undefined) throw new Error('The snapshot could not be exported');
  const migration = await client.query<{ file_name: string }>(
    'select file_name from kernel.migration order by file_name collate "C" desc limit 1',
  );
  const extra = await target.before?.();
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
  let failed = false;
  try {
    await options.dumpTool.dump({ connectionString: target.connectionString, snapshot: exported.snapshot }, seal);
    await written;
  } catch {
    failed = true;
    await written.catch(() => undefined);
  }
  if (failed) {
    options.log(`The dump of database ${exported.database} failed; the backup is failed`);
    return { part: null, failed: true };
  }
  await options.backupStore.putOnce(target.object, createReadStream(file), bytes);
  await rm(file, { force: true });
  return {
    part: {
      object: target.object,
      databaseName: exported.database,
      snapshotAt: new Date(exported.at).toISOString(),
      lastMigration: migration.rows[0]?.file_name ?? null,
      sha256: hash.digest('hex'),
      bytes,
      extra,
    },
    failed: false,
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
  const client = new Client({ connectionString: options.organisationConnectionString(organisation.databaseName) });
  await client.connect();
  try {
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
  } finally {
    await client.end();
  }
}
