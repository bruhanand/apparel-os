import { spawn } from 'node:child_process';
import { createCipheriv, createHash, randomBytes, randomInt } from 'node:crypto';
import { uuidv7 } from '@apparel-os/domain';
import { recoveryStatusSchema, routes, type RecoveryStatus } from '@apparel-os/schemas';
import { CreateBucketCommand, DeleteObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { runBackupCommand } from '../src/backup.js';
import {
  BackupSealer,
  BackupSigningKey,
  backupPublicKeyFromEnvironment,
  CommandRunner,
  defineConsumer,
  defineEvent,
  IdempotencyHelper,
  newCorrelationId,
  OrganisationRouter,
  OUTBOX_AUTHORITY,
  OUTBOX_PROCESSOR_IDENTITY,
  RecoveryHoldRefused,
  restrictedValueCipherNotConfigured,
  RESTORE_IDENTITY,
  secretCheckNotImplemented,
  signatureName,
  Worker,
  type BackupManifest,
  type BackupOutcome,
  type DrillRecord,
  type DumpTool,
  type JobRegistry,
  type RoutedOrganisation,
  type TransactionContext,
} from '../src/kernel/index.js';
import { jobIdentities, OrganisationKeys, ORGANISATION_KEYS_VARIABLE } from '../src/modules/access/index.js';
import { Audit } from '../src/modules/audit/index.js';
import { Exceptions, RECOVERY_GAP_TYPE } from '../src/modules/exceptions/index.js';
import { FILE_STORE_VARIABLES, IMPORT_BATCH_KIND, IMPORT_BATCH_SCOPE_KEY } from '../src/modules/files-imports/index.js';
import { contentHashOf, objectKeyOf, sealFile } from '../src/modules/files-imports/domain/file-seal.js';
import { Inbox } from '../src/modules/inbox/index.js';
import { Numbering } from '../src/modules/numbering/index.js';
import { numberedKinds } from '../src/numbered-kinds.js';
import { restoreRegistry } from '../src/restore-participants.js';
import { runRestoreCommand, type RestoreAnswers, type RestoreCommandOutcome } from '../src/restore.js';
import { RESTORE_IDENTITY_AUTHORITIES } from '../src/restore-steps.js';
import {
  codeFor,
  startAccessApp,
  syntheticKeysEnvironment,
  syntheticTimezone,
  SYNTHETIC_ORIGIN,
  writeSyntheticSetting,
  writeSyntheticUser,
  type AccessTestApp,
  type SyntheticUser,
} from './support/access.js';
import {
  containerDumpTool,
  containerRestoreTool,
  createBackupBucket,
  loadDump,
  objectOf,
  startTargetServer,
  syntheticBackupKey,
  syntheticSigningKey,
  type TargetServer,
} from './support/backup.js';
import { defineSyntheticCodeSeries } from './support/exceptions.js';
import { grantSynthetic } from './support/grants.js';
import { defineSyntheticImportBatchSeries } from './support/imports.js';
import { capturingLogger, writeSyntheticServiceIdentity } from './support/jobs.js';
import { startTestFileStore, type TestFileStore } from './support/minio.js';
import { createSyntheticOrganisations, type SyntheticWorld } from './support/organisations.js';
import { connect, databaseUrl, dropDatabase, testServer } from './support/postgres.js';
import { syntheticCode, syntheticName } from './fixtures/synthetic.js';

// S1-F14-T03: the restore into a fresh target, against real PostgreSQL and MinIO with the two synthetic Organisations
// (backup-and-restore 4.1 to 4.5, 5.1 to 5.4, section 6, 8.2, 10.1 to 10.3, section 11, section 12 tests 2 to 6, 8 to
// 18 and 20; imports-and-opening-data 17 test 23; numbering-and-audit 7 tests 7, 10 and 14; POL-18.02 to POL-18.05,
// PRD-ACP-019, PRD-SEC-005 to PRD-SEC-008, PRD-SEC-012 to PRD-SEC-014, PRD-SEC-018, PRD-INT-006, PRD-INT-008,
// PRD-MOD-001, PRD-ACS-020), with the product owner's decisions of 12 Oct 2026: every backup signed; the target a
// server holding no Apparel OS database; gaps and failed checks raised as exceptions and settled, or checks run again.
// The target is a PostgreSQL container of its own: the run's server holds every test's databases, so it is never
// fresh. Every key, file, user, setting and value here is SYNTHETIC.

const MARKER = 'SYNTHETIC-RESTORE-PLAINTEXT-MARKER-4c1a';
const SYNTHETIC_POOL_MAX = 4;
const CONSUMER_IDENTITY = 'synthetic-consumer';

/** A SYNTHETIC event of this file, published in the source before the backup (GC-9 test 14). */
const recordChanged = defineEvent({
  type: 'kernel.synthetic-record-changed',
  version: 1,
  payload: z.object({ recordId: z.uuid() }),
});
const recordEchoed = defineEvent({
  type: 'kernel.synthetic-record-echoed',
  version: 1,
  payload: z.object({ recordId: z.uuid() }),
});
/** A consumer that reaches a module inside: it echoes the record as an event of its own, once per event. */
const inside = defineConsumer({
  name: 'kernel.synthetic-inside',
  event: recordChanged,
  serviceIdentity: CONSUMER_IDENTITY,
  authorises: { action: 'view', recordType: 'kernel.outbox_event' },
  handle: async (context, event) => {
    await context.publish(recordEchoed, {
      subject: { module: 'kernel', recordType: 'kernel.synthetic_record', recordId: event.payload.recordId },
      payload: { recordId: event.payload.recordId },
    });
    return { kind: 'done' };
  },
});
/** A consumer that reaches an outside system, such as Tally: it must never see an event the restore brought back. */
const outside = defineConsumer({
  name: 'kernel.synthetic-outside',
  event: recordChanged,
  serviceIdentity: CONSUMER_IDENTITY,
  authorises: { action: 'view', recordType: 'kernel.outbox_event' },
  reaches: 'outside-system',
  handle: () => Promise.resolve({ kind: 'done' }),
});
const registry: JobRegistry = { events: [recordChanged, recordEchoed], consumers: [inside, outside], jobKinds: [] };
const SYNTHETIC_RETRY_FAST = { retries: 1, retryDelaySeconds: 1, retryBackoff: false, activeLimitSeconds: 60 };

interface Person {
  readonly user: SyntheticUser;
  readonly label: string;
}

/** What one source Organisation holds before the backup, for the checks after the restore. */
interface Source {
  readonly code: string;
  readonly database: string;
  organisationId: string;
  site: string;
  otherSite: string;
  attachmentId: string;
  cookie: string;
  reader: Person;
  outsider: Person;
  recovery: Person;
  validator: Person;
  plain: Person;
  batchSeriesId: string;
  exceptionSeriesId: string;
}

let world: SyntheticWorld;
let minio: TestFileStore;
let target: TargetServer;
let sourceApi: AccessTestApp;
let keysEnvironment: Record<string, string>;
let backupEnvironment: Record<string, string>;
let backupBucket: string;
const backupKey = syntheticBackupKey();
const signingKey = syntheticSigningKey();
/** Organisation B's second key version, as a rotation would make one (2.4): SYNTHETIC. */
const secondKeyB = randomBytes(32).toString('base64url');
let secondVersionB: string;
const sources: Source[] = [];
const scratch: string[] = [];
const logLines: string[] = [];
const captured = capturingLogger();
const numbering = new Numbering({ kinds: numberedKinds });
let sourceRouter: OrganisationRouter;
let event: string;
let backup: string;
let lostBatchCode: number;

function pdf(label: string): Buffer {
  return Buffer.from(`%PDF-1.4\n% ${MARKER} ${label}\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n`, 'latin1');
}

/** The custodian's kept copies (2.4): each Organisation's key, and Organisation B's two versions. */
function keptCopies(overrides: Record<string, string | string[]> = {}): string {
  const keys = JSON.parse(keysEnvironment[ORGANISATION_KEYS_VARIABLE] ?? '{}') as Record<string, string>;
  const codeB = sources[1]?.code ?? '';
  return JSON.stringify({ ...keys, [codeB]: [keys[codeB] ?? '', secondKeyB], ...overrides });
}

async function signIn(
  base: string,
  code: string,
  user: SyntheticUser,
  stepsFromNow = 0,
): Promise<{ status: number; cookie: string }> {
  const response = await fetch(`${base}/api/access/sign-in`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: SYNTHETIC_ORIGIN, 'x-forwarded-for': '10.9.9.42' },
    body: JSON.stringify({
      organisationCode: code,
      login: user.login,
      password: user.password,
      totpCode: codeFor(user.factorSecret ?? Buffer.alloc(0), stepsFromNow),
    }),
  });
  return { status: response.status, cookie: (response.headers.get('set-cookie') ?? '').split(';')[0] ?? '' };
}

const cookies = new Map<string, string>();

/**
 * A person signed in to a restored application once, the session kept for the tests that follow: an authenticator code
 * is accepted once per step (access-and-approvals 3.1), and the reader used this step's code in the source, so the
 * reader gives the next step's, which the step either side admits.
 */
async function on(base: string, source: Source, who: Person): Promise<{ status: number; cookie: string }> {
  const key = `${base} ${who.user.id}`;
  const kept = cookies.get(key);
  if (kept !== undefined) return { status: 200, cookie: kept };
  const signed = await signIn(base, source.code, who.user, who === source.reader ? 1 : 0);
  expect(signed.status, `${who.label} signs in`).toBe(200);
  cookies.set(key, signed.cookie);
  return signed;
}

async function send(
  base: string,
  cookie: string,
  method: 'GET' | 'POST',
  path: string,
  body?: unknown,
): Promise<{ status: number; json: unknown }> {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: {
      cookie,
      origin: SYNTHETIC_ORIGIN,
      ...(method === 'POST' ? { 'content-type': 'application/json', 'idempotency-key': uuidv7() } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await response.text();
  return { status: response.status, json: text === '' ? null : (JSON.parse(text) as unknown) };
}

async function storeFile(base: string, cookie: string, label: string) {
  return send(base, cookie, 'POST', '/api/files-imports/files', {
    sourceSystem: 'manual-upload',
    originalName: `${MARKER}-${label}.pdf`,
    contentBase64: pdf(`${label}-${String(randomInt(1_000_000_000))}`).toString('base64'),
  });
}

/** Reads the run's server as the migration role. */
async function query<T extends Record<string, unknown>>(
  database: string,
  text: string,
  values: unknown[] = [],
): Promise<T[]> {
  const client = await connect(database, 'migration');
  try {
    return (await client.query<T>(text, values)).rows;
  } finally {
    await client.end();
  }
}

/** A SYNTHETIC place tree and Site, as the backup test writes one. */
async function writeSite(database: string, preparer: string): Promise<string> {
  const client = await connect(database, 'migration');
  const label = syntheticCode(`GEO-${uuidv7().slice(-8).toUpperCase()}`);
  const [country, state, city, area, site] = [uuidv7(), uuidv7(), uuidv7(), uuidv7(), uuidv7()];
  try {
    await client.query('insert into organisation.country (id, code) values ($1, $2)', [country, label]);
    await client.query('insert into organisation.state (id, country_id, code) values ($1, $2, $3)', [
      state,
      country,
      label,
    ]);
    await client.query('insert into organisation.city (id, state_id, code) values ($1, $2, $3)', [city, state, label]);
    await client.query('insert into organisation.area (id, city_id, code) values ($1, $2, $3)', [area, city, label]);
    await client.query('insert into organisation.site (id, code) values ($1, $2)', [
      site,
      syntheticCode(`SITE-${site.slice(-6).toUpperCase()}`),
    ]);
    await client.query(
      `insert into organisation.site_version (id, site_id, name, physical_kind, area_id, addresses, status,
         valid_during, decision, prepared_by_user_id)
       values ($1, $2, $3, 'retail-site', $4, $5, 'Active', '[2000-01-01,)', 'Approved', $6)`,
      [uuidv7(), site, syntheticName('Restore Site'), area, [syntheticName('Address')], preparer],
    );
    return site;
  } finally {
    await client.end();
  }
}

async function attach(
  database: string,
  stored: { storedFileId: string; receiptId: string },
  site: string,
  by: string,
): Promise<string> {
  const id = uuidv7();
  await query(
    database,
    `insert into files_imports.attachment (id, stored_file_id, file_receipt_id, record_module, record_type, record_id,
       record_version_id, evidences, restricted_classes, attached_by_kind, attached_by_id, attached_at, site_id)
     values ($1, $2, $3, 'organisation', 'organisation.site', $4, null, 'site-photo', '{}', 'user', $5, now(), $4)`,
    [id, stored.storedFileId, stored.receiptId, site, by],
  );
  return id;
}

async function person(source: { database: string; code: string }, label: string): Promise<Person> {
  const user = await writeSyntheticUser(source.database, source.code, keysEnvironment, { label, enrolled: true });
  return { user, label };
}

function runnerOf(): CommandRunner {
  return new CommandRunner({ clock: { now: () => new Date() }, timezones: syntheticTimezone, logger: captured.logger });
}

async function routedIn(router: OrganisationRouter, code: string): Promise<RoutedOrganisation> {
  const found = await router.resolveForSignIn(code);
  if (!found.routed) throw new Error(`${code} is not routed`);
  return found.organisation;
}

/** A command in an Organisation's database as a SYNTHETIC actor, through routing, as the application runs one. */
async function command<T>(
  routed: RoutedOrganisation,
  actorId: string,
  name: string,
  work: (context: TransactionContext) => Promise<T>,
): Promise<T> {
  return runnerOf().run(
    { commandName: name, organisation: routed, correlationId: newCorrelationId(), actor: { kind: 'actor', actorId } },
    work,
  );
}

async function allocateBatchCode(routed: RoutedOrganisation, actorId: string, seriesId: string) {
  return command(routed, actorId, 'files-imports.synthetic-allocate-batch-code', async (context) => {
    await context.lock(8, [numbering.seriesLockTarget(seriesId)]);
    return numbering.allocate(context, {
      seriesId,
      documentType: 'files_imports.import_batch',
      documentId: uuidv7(),
    });
  });
}

function worker(router: OrganisationRouter): Worker {
  const runner = runnerOf();
  return new Worker({
    router,
    runner,
    helper: new IdempotencyHelper({
      runner,
      logger: captured.logger,
      secretCheck: secretCheckNotImplemented,
      cipher: restrictedValueCipherNotConfigured,
    }),
    identities: jobIdentities(),
    logger: captured.logger,
    registry,
    settings: {
      pollSeconds: 60,
      consumers: { [inside.name]: SYNTHETIC_RETRY_FAST, [outside.name]: SYNTHETIC_RETRY_FAST },
      jobKinds: {},
    },
  });
}

async function takeBackup(dumpTool: DumpTool = containerDumpTool): Promise<string> {
  const outcome: BackupOutcome = await runBackupCommand({
    env: backupEnvironment,
    args: [],
    dumpTool,
    log: (message) => logLines.push(message),
  });
  if (outcome.outcome !== 'complete') throw new Error(`The backup was not complete: ${JSON.stringify(outcome)}`);
  return outcome.backupId;
}

interface Target {
  readonly directory: string;
  readonly env: Record<string, string>;
  readonly bucket: string;
}

/** A fresh target: the target server cleared, an empty directory database on it, and an empty bucket (4.1). */
async function freshTarget(label: string): Promise<Target> {
  await target.clear();
  const directory = await target.createDirectory(label);
  const bucket = `syn-target-${randomBytes(4).toString('hex')}`;
  await minio.client.send(new CreateBucketCommand({ Bucket: bucket }));
  const withoutSigningKey = without(backupEnvironment, 'AOS_BACKUP_SIGNING_KEY');
  return {
    directory,
    bucket,
    env: {
      ...withoutSigningKey,
      ...signingKey.restoreRunner,
      ...minio.environment,
      [FILE_STORE_VARIABLES.bucket]: bucket,
      AOS_MIGRATION_DATABASE_URL: target.url(directory, 'migration'),
      AOS_RUNTIME_DATABASE_URL: target.url(directory, 'runtime'),
    },
  };
}

/** The variables without one, as a runner that does not hold it has them. */
function without(env: Record<string, string>, name: string): Record<string, string> {
  return Object.fromEntries(Object.entries(env).filter(([key]) => key !== name));
}

const answers =
  (overrides: Partial<RestoreAnswers> = {}) =>
  (): Promise<RestoreAnswers> =>
    Promise.resolve({
      purpose: { kind: 'drill', note: 'SYNTHETIC drill of the restore tests' },
      conductedBy: 'SYNTHETIC operator, platform',
      privateKeyText: backupKey.privateText,
      organisationKeysText: keptCopies(),
      ...overrides,
    });

async function restore(
  env: Record<string, string>,
  args: string[],
  overrides: Partial<RestoreAnswers> = {},
): Promise<RestoreCommandOutcome> {
  const outcome = await runRestoreCommand({
    env,
    args,
    answers: answers(overrides),
    restoreTool: containerRestoreTool(target.containerId),
    timezones: syntheticTimezone,
    logger: captured.logger,
    log: (message) => logLines.push(message),
  });
  logLines.push(JSON.stringify(outcome));
  return outcome;
}

async function bucketKeys(bucket: string, prefix = ''): Promise<string[]> {
  const { ListObjectsV2Command } = await import('@aws-sdk/client-s3');
  const found: string[] = [];
  let token: string | undefined;
  do {
    const page = await minio.client.send(
      new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ContinuationToken: token }),
    );
    for (const object of page.Contents ?? []) if (object.Key !== undefined) found.push(object.Key);
    token = page.NextContinuationToken;
  } while (token !== undefined);
  return found.sort();
}

async function manifestOf(backupId: string): Promise<BackupManifest> {
  const name = `backups/${backupId}/manifest`;
  return JSON.parse(
    backupKey.privateKey.open(name, await objectOf(minio.client, backupBucket, name)).toString('utf8'),
  ) as BackupManifest;
}

async function drillRecordOf(name: string): Promise<{ record: DrillRecord; text: string }> {
  const json = (await objectOf(minio.client, backupBucket, name)).toString('utf8');
  const text = (await objectOf(minio.client, backupBucket, name.replace(/\.json$/, '.txt'))).toString('utf8');
  return { record: JSON.parse(json) as DrillRecord, text };
}

async function put(bucket: string, key: string, body: Buffer): Promise<void> {
  await minio.client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: body }));
}

/** Writes a backup as the backup command would, from a manifest and dumps a test gives, sealed and signed (2.3). */
async function writeBackup(
  manifest: BackupManifest,
  dumps: ReadonlyMap<string, Buffer>,
  options: { readonly sign: boolean } = { sign: true },
): Promise<void> {
  const sealer = BackupSealer.start(
    backupPublicKeyFromEnvironment({ AOS_BACKUP_PUBLIC_KEY: backupKey.publicText }),
    manifest.backupId,
  );
  for (const [object, plaintext] of dumps) await put(backupBucket, object, sealer.seal(object, plaintext));
  const name = `backups/${manifest.backupId}/manifest`;
  const sealed = sealer.seal(name, Buffer.from(JSON.stringify(manifest), 'utf8'));
  await put(backupBucket, name, sealed);
  if (!options.sign) return;
  const signature = BackupSigningKey.fromEnvironment(signingKey.backupRunner).sign({
    backupId: manifest.backupId,
    manifestObject: name,
    manifestSha256: createHash('sha256').update(sealed).digest('hex'),
    result: 'complete',
    failures: [],
  });
  await put(backupBucket, signatureName(manifest.backupId), signature);
}

/** Dumps a database of the run's server whole, in custom format, with `pg_dump` in its container. */
function dumpWhole(database: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      'docker',
      [
        'exec',
        testServer().containerId,
        'pg_dump',
        '--host=/var/run/postgresql',
        '--username=aos_migration',
        `--dbname=${database}`,
        '--format=custom',
        '--no-password',
      ],
      { stdio: ['ignore', 'pipe', 'ignore'] },
    );
    const chunks: Buffer[] = [];
    child.stdout.on('data', (chunk: Buffer) => chunks.push(chunk));
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve(Buffer.concat(chunks));
      else reject(new Error(`pg_dump exited ${String(code)}`));
    });
  });
}

/**
 * A copy of a backup altered after it was taken, as GC-9 12 tests 5 and 8 describe (5.4, 5.1): one Organisation's
 * dump opened, loaded, changed by `sql`, dumped again and written as a new backup holding the same manifest facts,
 * sealed and signed with the run's keys, as a copy altered before its signature would be. The checks that do not rest
 * on the dump's hash must find the change.
 */
async function alteredCopy(backupId: string, code: string, sql: string): Promise<string> {
  const manifest = await manifestOf(backupId);
  const part = manifest.organisations.find((each) => each.organisationCode === code);
  if (part === undefined) throw new Error('No part');
  const dump = backupKey.privateKey.open(part.object, await objectOf(minio.client, backupBucket, part.object));
  const loaded = await loadDump(dump, 'rt_altered');
  scratch.push(loaded);
  await query(loaded, sql);
  const altered = await dumpWhole(loaded);
  const copyId = uuidv7();
  const object = `backups/${copyId}/organisations/${part.organisationId}.dump`;
  const sealer = BackupSealer.start(
    backupPublicKeyFromEnvironment({ AOS_BACKUP_PUBLIC_KEY: backupKey.publicText }),
    copyId,
  );
  const sealed = sealer.seal(object, altered);
  await put(backupBucket, object, sealed);
  await writeBackup(
    {
      ...manifest,
      backupId: copyId,
      organisations: [
        {
          ...part,
          object,
          sha256: createHash('sha256').update(sealed).digest('hex'),
          bytes: sealed.length,
        },
      ],
    },
    new Map(),
  );
  return copyId;
}

/** Recovery status as the person who restores reads it, through the restored application. */
async function statusOf(base: string, source: Source): Promise<NonNullable<RecoveryStatus['restore']>> {
  const operator = await on(base, source, source.recovery);
  const status = recoveryStatusSchema.parse(
    (await send(base, operator.cookie, 'GET', routes.readRecoveryStatus.path)).json,
  );
  if (status.restore === null) throw new Error('No restore');
  return status.restore;
}

/** Reconciles every series the restore paused, as the person who restores, with a statement that none left (5.3). */
async function reconcileAll(base: string, source: Source, only?: string): Promise<void> {
  const operator = await on(base, source, source.recovery);
  for (const series of (await statusOf(base, source)).seriesToReconcile) {
    if (only !== undefined && series.seriesId !== only) continue;
    const answer = await send(
      base,
      operator.cookie,
      'POST',
      routes.reconcileSeriesAfterRestore.path.replace('{seriesId}', series.seriesId),
      { evidence: 'SYNTHETIC: no document left the system', evidenceHighest: null, reason: 'SYNTHETIC drill' },
    );
    expect(answer.status).toBe(200);
  }
}

/** Settles every exception raised for a recovery item, as its owner, accepted with a reason (4.5). */
async function settleAll(base: string, source: Source): Promise<number> {
  const operator = await on(base, source, source.recovery);
  let settled = 0;
  for (const item of (await statusOf(base, source)).items) {
    if (item.exceptionId === null || item.settlement !== null) continue;
    const answer = await send(
      base,
      operator.cookie,
      'POST',
      routes.settleRecoveryGap.path.replace('{exceptionId}', item.exceptionId),
      { settlement: 'accepted', reason: 'SYNTHETIC drill: examined and accepted' },
    );
    expect(answer.status, JSON.stringify(answer.json)).toBe(200);
    settled += 1;
  }
  return settled;
}

/** Records both validations, by two people (4.3; GC9-6 stays OPEN). */
async function validate(base: string, source: Source): Promise<void> {
  const operator = await on(base, source, source.recovery);
  const validator = await on(base, source, source.validator);
  for (const [cookie, body] of [
    [operator.cookie, { validates: 'operations', compared: ['stock', 'bills'] }],
    [validator.cookie, { validates: 'accounts', compared: ['financial-totals'] }],
  ] as const) {
    const answer = await send(base, cookie, 'POST', routes.recordRecoveryValidation.path, {
      ...body,
      comparedAgainst: 'SYNTHETIC: the source totals before the drill',
      evidence: 'SYNTHETIC: the drill notes',
    });
    expect(answer.status).toBe(200);
  }
}

async function reopen(base: string, source: Source): Promise<{ status: number; json: unknown }> {
  const operator = await on(base, source, source.recovery);
  return send(base, operator.cookie, 'POST', routes.reopenAfterRestore.path, {
    revocationsPlacedAgain: true,
    legalHoldsPlacedAgain: true,
  });
}

/** The restored world on the target server, as the application sees it. */
function restoredWorld(t: Target, databases: ReadonlyMap<string, string>): SyntheticWorld {
  return {
    directory: t.directory,
    organisations: world.organisations.map((organisation) => ({
      ...organisation,
      database: databases.get(organisation.code) ?? organisation.database,
    })) as unknown as SyntheticWorld['organisations'],
    reset: () => Promise.resolve(),
  };
}

beforeAll(async () => {
  world = await createSyntheticOrganisations('restore');
  minio = await startTestFileStore();
  target = await startTargetServer();
  keysEnvironment = syntheticKeysEnvironment(world);
  backupBucket = `syn-backups-${uuidv7().slice(-8)}`;
  const backupStoreEnvironment = await createBackupBucket(minio.client, minio.environment, backupBucket);
  for (const organisation of world.organisations) {
    await writeSyntheticSetting(organisation.database, 'access.sign-in-throttling', {
      failureLimit: 50,
      windowSeconds: 600,
    });
    await writeSyntheticSetting(organisation.database, 'access.password-rules', { minimumLength: 12 });
    await writeSyntheticSetting(organisation.database, 'access.office-session-limits', {
      idleLockSeconds: 1800,
      absoluteSeconds: 28800,
    });
    // The restore's internal service identity, holding what its steps declare, as the setup step writes it.
    await writeSyntheticServiceIdentity(organisation.database, RESTORE_IDENTITY, RESTORE_IDENTITY_AUTHORITIES);
  }
  sourceApi = await startAccessApp(world, keysEnvironment, { fileStoreEnvironment: minio.environment });
  sourceRouter = new OrganisationRouter(
    { directoryConnectionString: databaseUrl(world.directory, 'runtime'), poolMax: SYNTHETIC_POOL_MAX },
    captured.logger,
  );
  const exceptions = new Exceptions({
    numbering,
    inbox: new Inbox(),
    audit: new Audit(captured.logger),
    types: [],
  });
  for (const [index, organisation] of world.organisations.entries()) {
    const label = `R${String(index)}`;
    const reader = await person(organisation, `${label}READER`);
    const directory = await query<{ id: string }>(
      world.directory,
      'select id::text from kernel.directory_entry where organisation_code = $1',
      [organisation.code],
    );
    const site = await writeSite(organisation.database, reader.user.id);
    const otherSite = await writeSite(organisation.database, reader.user.id);
    const { assignmentId: readerAssignment } = await grantSynthetic(
      organisation.database,
      { kind: 'user', id: reader.user.id },
      [{ recordType: 'files_imports.stored_file', action: 'create' }],
    );
    await grantSynthetic(
      organisation.database,
      { kind: 'user', id: reader.user.id },
      [{ recordType: 'organisation.site', action: 'view' }],
      {
        scope: {
          kind: 'dimensions',
          legalEntity: { kind: 'all' },
          place: { kind: 'selected', members: [{ type: 'site', id: site }] },
          brand: { kind: 'all' },
        },
      },
    );
    const outsider = await person(organisation, `${label}OUTSIDER`);
    await grantSynthetic(
      organisation.database,
      { kind: 'user', id: outsider.user.id },
      [{ recordType: 'organisation.site', action: 'view' }],
      {
        scope: {
          kind: 'dimensions',
          legalEntity: { kind: 'all' },
          place: { kind: 'selected', members: [{ type: 'site', id: otherSite }] },
          brand: { kind: 'all' },
        },
      },
    );
    // SYNTHETIC role assignments for the restore operator, the two validations and reopening (GC9-6 stays OPEN).
    const recovery = await person(organisation, `${label}RECOVERY`);
    await grantSynthetic(organisation.database, { kind: 'user', id: recovery.user.id }, [
      { recordType: 'kernel.recovery_event', action: 'view' },
      { recordType: 'configuration.series_reconciliation', action: 'create' },
      { recordType: 'configuration.recovery_validation', action: 'create' },
      { recordType: 'configuration.reopening', action: 'create' },
    ]);
    const validator = await person(organisation, `${label}VALIDATOR`);
    await grantSynthetic(organisation.database, { kind: 'user', id: validator.user.id }, [
      { recordType: 'configuration.recovery_validation', action: 'create' },
    ]);
    const plain = await person(organisation, `${label}PLAIN`);
    const signedIn = await signIn(sourceApi.baseUrl, organisation.code, reader.user);
    expect(signedIn.status).toBe(200);
    const stored = await storeFile(sourceApi.baseUrl, signedIn.cookie, 'evidence');
    expect(stored.status).toBe(200);
    const attachmentId = await attach(
      organisation.database,
      stored.json as { storedFileId: string; receiptId: string },
      site,
      reader.user.id,
    );
    // The import batch code series with two codes given (GC9-9), the exception-code series and the SYNTHETIC routing
    // of recovery gaps to the restore operator (4.5), and one audit block sealed (5.4).
    const routed = await routedIn(sourceRouter, organisation.code);
    await command(routed, reader.user.id, 'files-imports.synthetic-define-batch-series', (context) =>
      defineSyntheticImportBatchSeries(context, numbering, `RESTORE-BATCH-${String(index)}`),
    );
    const series = await command(routed, reader.user.id, 'files-imports.synthetic-read-batch-series', (context) =>
      numbering.liveSeries(context, { kind: IMPORT_BATCH_KIND.kind, scopeKey: IMPORT_BATCH_SCOPE_KEY }),
    );
    if (series === undefined) throw new Error('No batch series');
    for (let n = 0; n < 2; n += 1) {
      const given = await allocateBatchCode(routed, reader.user.id, series.seriesId);
      expect(given.kind).toBe('done');
    }
    const exceptionSeries = await command(routed, reader.user.id, 'exceptions.synthetic-define-series', (context) =>
      defineSyntheticCodeSeries(context, numbering),
    );
    const routing = await command(routed, reader.user.id, 'exceptions.synthetic-prepare-routing', (context) =>
      exceptions.prepareRouting(
        context,
        { userId: reader.user.id, roleAssignmentId: readerAssignment },
        {
          typeCode: RECOVERY_GAP_TYPE,
          siteId: null,
          owner: { kind: 'user', userId: recovery.user.id },
          dueRule: { format: 'elapsed-minutes-v1', minutes: 60 },
          escalation: { kind: 'user', userId: recovery.user.id },
          validFrom: new Date().toISOString().slice(0, 10),
          origin: 'synthetic',
        },
      ),
    );
    if (routing.kind !== 'done') throw new Error(routing.refusal.code);
    await query(
      organisation.database,
      "update exceptions.exception_routing_version set decision = 'Approved' where id = $1",
      [routing.value.versionId],
    );
    await command(routed, reader.user.id, 'audit.synthetic-seal', (context) =>
      new Audit(captured.logger).sealClosedBlock(context),
    );
    sources.push({
      code: organisation.code,
      database: organisation.database,
      organisationId: directory[0]?.id ?? '',
      site,
      otherSite,
      attachmentId,
      cookie: signedIn.cookie,
      reader,
      outsider,
      recovery,
      validator,
      plain,
      batchSeriesId: series.seriesId,
      exceptionSeriesId: (exceptionSeries as { seriesId: string }).seriesId,
    });
  }
  // Organisation B's second key version (2.4): listed as a rotation would list it, and one stored file sealed by it,
  // so a restore needs both kept copies.
  const b = sources[1];
  if (b === undefined) throw new Error('No source');
  const second = OrganisationKeys.fromKeptCopies(JSON.stringify({ [b.code]: secondKeyB }));
  secondVersionB = second.version(b.code);
  await query(
    b.database,
    "insert into access.key_version (id, identifier, purpose, first_used_at) values ($1, $2, 'organisation-data', now())",
    [uuidv7(), secondVersionB],
  );
  const plaintext = pdf(`second-key-${String(randomInt(1_000_000_000))}`);
  const hash = contentHashOf(plaintext);
  const sealed = sealFile(second, b.code, hash, plaintext);
  await put(minio.bucket, objectKeyOf(b.organisationId, hash), sealed.bytes);
  await query(
    b.database,
    `insert into files_imports.stored_file (id, content_hash, size_bytes, format, object_key, encryption_scheme,
       key_version, restricted_classes)
     values ($1, $2, $3, 'pdf', $4, $5, $6, null)`,
    [uuidv7(), hash, plaintext.length, objectKeyOf(b.organisationId, hash), sealed.scheme, secondVersionB],
  );

  // GC-9 test 14: the outbox processor and the consumers registered in Organisation A, then an event recorded.
  const first = sources[0];
  if (first === undefined) throw new Error('No source');
  await writeSyntheticServiceIdentity(first.database, OUTBOX_PROCESSOR_IDENTITY, [OUTBOX_AUTHORITY]);
  await writeSyntheticServiceIdentity(first.database, CONSUMER_IDENTITY, [inside.authorises]);
  const registering = worker(sourceRouter);
  await registering.open();
  await registering.stop();
  const recordId = uuidv7();
  event = await command(
    await routedIn(sourceRouter, first.code),
    first.reader.user.id,
    'kernel.synthetic-change',
    (c) =>
      c.publish(recordChanged, {
        subject: { module: 'kernel', recordType: 'kernel.synthetic_record', recordId },
        payload: { recordId },
      }),
  );
  backupEnvironment = {
    AOS_MIGRATION_DATABASE_URL: databaseUrl(world.directory, 'migration'),
    AOS_ENVIRONMENT: 'local',
    AOS_BACKUP_PUBLIC_KEY: backupKey.publicText,
    ...signingKey.backupRunner,
    ...backupStoreEnvironment,
    ...minio.environment,
  };
  // The backup: after Organisation A's snapshot, a file is stored and a batch code given there, both lost by the
  // restore: the file's object is copied with no record (3.3), and the code is not in the restored database (GC9-9).
  backup = await takeBackup({
    async dump(t, into) {
      const database = new URL(t.connectionString).pathname.slice(1);
      if (database === first.database) {
        expect((await storeFile(sourceApi.baseUrl, first.cookie, 'after-the-snapshot')).status).toBe(200);
        const lost = await allocateBatchCode(
          await routedIn(sourceRouter, first.code),
          first.reader.user.id,
          first.batchSeriesId,
        );
        if (lost.kind !== 'done') throw new Error('No code was given');
        lostBatchCode = lost.value.sequenceNumber;
      }
      return containerDumpTool.dump(t, into);
    },
  });
}, 600_000);

afterAll(async () => {
  await (sourceApi as AccessTestApp | undefined)?.close();
  await (sourceRouter as OrganisationRouter | undefined)?.close();
  for (const database of scratch) await dropDatabase(database);
  await (target as TargetServer | undefined)?.stop();
  await (minio as TestFileStore | undefined)?.stop();
  await (world as SyntheticWorld | undefined)?.reset();
});

const reasonOf = (outcome: RestoreCommandOutcome) => (outcome.outcome === 'refused' ? outcome.reason : '');

describe('the restore refuses before writing anything (GC-9 12 test 11; PRD-ACP-019)', () => {
  let t: Target;
  const nothingWritten = async () => {
    expect(
      await target.query(t.directory, "select 1 from pg_catalog.pg_class where relnamespace = 'public'::regnamespace"),
    ).toEqual([]);
    expect(
      await target.query(t.directory, "select datname from pg_catalog.pg_database where datname like $1 || '\\_%'", [
        t.directory,
      ]),
    ).toEqual([]);
    expect(await bucketKeys(t.bucket)).toEqual([]);
  };

  beforeAll(async () => {
    t = await freshTarget('rt_refused');
  });

  it('product owner 12 Oct 2026 refuses an unsigned or badly signed backup, such as one planted with the public backup key, before reading anything else', async () => {
    const manifest = await manifestOf(backup);
    // Planted: sealed with the backup key's public part, which is no secret, and not signed.
    const planted = { ...manifest, backupId: uuidv7() };
    await writeBackup(planted, new Map(), { sign: false });
    expect(reasonOf(await restore(t.env, [planted.backupId]))).toContain('is not signed');
    // Signed with a key that is not the backup runner's.
    const forged = { ...manifest, backupId: uuidv7() };
    await writeBackup(forged, new Map(), { sign: false });
    const other = syntheticSigningKey();
    await put(
      backupBucket,
      signatureName(forged.backupId),
      BackupSigningKey.fromEnvironment(other.backupRunner).sign({
        backupId: forged.backupId,
        manifestObject: `backups/${forged.backupId}/manifest`,
        manifestSha256: '0'.repeat(64),
        result: 'complete',
        failures: [],
      }),
    );
    expect(reasonOf(await restore(t.env, [forged.backupId]))).toContain('signature does not verify');
    // A real signature beside a manifest that is not the one it signs.
    const swapped = uuidv7();
    await put(backupBucket, signatureName(swapped), await objectOf(minio.client, backupBucket, signatureName(backup)));
    expect(reasonOf(await restore(t.env, [swapped]))).toContain('of another backup');
    // The restore runner without the signing key's public part is refused too.
    const withoutPublic = without(t.env, 'AOS_BACKUP_SIGNING_PUBLIC_KEY');
    expect(reasonOf(await restore(withoutPublic, [backup]))).toContain('AOS_BACKUP_SIGNING_PUBLIC_KEY is not set');
    await nothingWritten();
  });

  it('GC-9 12 tests 11 and 20 refuses another environment, missing key versions and a key that is not the backup key’s', async () => {
    const otherEnvironment = await restore({ ...t.env, AOS_ENVIRONMENT: 'dev' }, [backup]);
    expect(reasonOf(otherEnvironment)).toContain('environment local');
    // A key version not given from its kept copy (2.3, 2.4): Organisation B's second version left out, or another key.
    const [codeA, codeB] = [sources[0]?.code ?? '', sources[1]?.code ?? ''];
    const keys = JSON.parse(keysEnvironment[ORGANISATION_KEYS_VARIABLE] ?? '{}') as Record<string, string>;
    const onlyFirst = await restore(t.env, [backup], {
      organisationKeysText: keptCopies({ [codeB]: keys[codeB] ?? '' }),
    });
    expect(reasonOf(onlyFirst)).toContain(`Organisation ${codeB}'s data needs key version ${secondVersionB}`);
    const missing = await restore(t.env, [backup], { organisationKeysText: JSON.stringify({ [codeA]: keys[codeA] }) });
    expect(reasonOf(missing)).toContain(`Organisation ${codeB}'s data needs key version`);
    const wrong = await restore(t.env, [backup], {
      organisationKeysText: keptCopies({ [codeB]: [randomBytes(32).toString('base64url'), secondKeyB] }),
    });
    expect(reasonOf(wrong)).toContain('no kept copy of it was given');
    const otherKey = syntheticBackupKey();
    expect(reasonOf(await restore(t.env, [backup], { privateKeyText: otherKey.privateText }))).toContain(
      'does not open with the backup key given',
    );
    await nothingWritten();
  });

  it('GC-9 12 test 11 product owner 12 Oct 2026 refuses the source’s server and any server that holds an Apparel OS database', async () => {
    // The source itself: its server is the one backed up, by PostgreSQL's system identifier (4.1).
    const sourceTarget = {
      ...t.env,
      AOS_MIGRATION_DATABASE_URL: databaseUrl(world.directory, 'migration'),
      AOS_RUNTIME_DATABASE_URL: databaseUrl(world.directory, 'runtime'),
    };
    expect(reasonOf(await restore(sourceTarget, [backup]))).toContain('the target is the source');
    // Another database on the target's server holds an Apparel OS schema.
    const other = await target.createDirectory('rt_other_apparel');
    await target.query(other, 'create schema kernel authorization aos_migration');
    await target.query(other, 'create table kernel.migration (id int)');
    expect(reasonOf(await restore(t.env, [backup]))).toContain(`already holds an Apparel OS database, ${other}`);
    await target.query('postgres', `drop database ${other} with (force)`);
    // A database the migration role cannot look into.
    const closed = await target.createDirectory('rt_closed');
    await target.query('postgres', `alter database ${closed} with allow_connections false`);
    expect(reasonOf(await restore(t.env, [backup]))).toContain(`database ${closed} cannot be looked into`);
    await target.query('postgres', `drop database ${closed}`);
    // The directory database already holds a table, or the bucket an object.
    await target.query(t.directory, 'create table public.synthetic_left_over (id int)');
    expect(reasonOf(await restore(t.env, [backup]))).toContain('its directory database already holds tables');
    await target.query(t.directory, 'drop table public.synthetic_left_over');
    await put(t.bucket, 'synthetic-left-over', Buffer.from('x'));
    expect(reasonOf(await restore(t.env, [backup]))).toContain('file store holds objects');
    await minio.client.send(new DeleteObjectCommand({ Bucket: t.bucket, Key: 'synthetic-left-over' }));
    // The runtime connection is not the runtime role.
    expect(
      reasonOf(await restore({ ...t.env, AOS_RUNTIME_DATABASE_URL: target.url(t.directory, 'migration') }, [backup])),
    ).toContain('AOS_RUNTIME_DATABASE_URL must connect as aos_runtime');
    await nothingWritten();
  });

  it('GC-9 12 test 11 refuses a backup taken by newer code', async () => {
    const future = '9999__kernel__synthetic_from_newer_code.sql';
    const databaseB = sources[1]?.database ?? '';
    await query(
      databaseB,
      `insert into kernel.migration (id, file_name, checksum_sha256, applied_by) values ($1, $2, $3, 'aos_migration')`,
      [uuidv7(), future, '0'.repeat(64)],
    );
    let newer: string;
    try {
      newer = await takeBackup();
    } finally {
      await query(databaseB, 'delete from kernel.migration where file_name = $1', [future]);
    }
    expect(reasonOf(await restore(t.env, [newer]))).toContain('taken by newer code');
    await nothingWritten();
  });

  it('GC-9 12 test 15 PRD-SEC-018 cannot be reached through the API, and the runtime role cannot run it', async () => {
    for (const route of Object.values(routes)) expect(route.path).not.toContain('restore');
    const refused = await restore({ ...t.env, AOS_MIGRATION_DATABASE_URL: target.url(t.directory, 'runtime') }, [
      backup,
    ]);
    expect(refused.outcome).toBe('refused');
    expect(reasonOf(refused)).toContain('not as aos_migration');
    await nothingWritten();
  });
});

describe('a whole environment restored into a fresh target (backup-and-restore 4.2)', () => {
  let t: Target;
  let outcome: RestoreCommandOutcome;
  let api: AccessTestApp;
  let router: OrganisationRouter;
  const targetDatabase = new Map<string, string>();
  const restored = (code: string) => targetDatabase.get(code) ?? '';
  const onTarget = <T extends Record<string, unknown>>(database: string, text: string, values: unknown[] = []) =>
    target.query<T>(database, text, values);

  beforeAll(async () => {
    t = await freshTarget('rt_whole');
    outcome = await restore(t.env, [backup]);
    for (const row of await onTarget<{ organisation_code: string; database_name: string }>(
      t.directory,
      'select organisation_code, database_name from kernel.directory_entry',
    )) {
      targetDatabase.set(row.organisation_code, row.database_name);
    }
    api = await startAccessApp(restoredWorld(t, targetDatabase), keysEnvironment, {
      fileStoreEnvironment: { ...minio.environment, [FILE_STORE_VARIABLES.bucket]: t.bucket },
      directoryRuntimeUrl: target.url(t.directory, 'runtime'),
    });
    router = new OrganisationRouter(
      { directoryConnectionString: target.url(t.directory, 'runtime'), poolMax: SYNTHETIC_POOL_MAX },
      captured.logger,
    );
  });

  afterAll(async () => {
    await (api as AccessTestApp | undefined)?.close();
    await (router as OrganisationRouter | undefined)?.close();
  });

  it('PRD-ACP-019 holds each Organisation with every check passed, and points the target directory at it', async () => {
    expect(outcome.outcome).toBe('held');
    for (const source of sources) {
      expect(restored(source.code)).toBe(`${t.directory}_${source.code.toLowerCase().replace(/-/g, '_')}`);
      expect(await onTarget(restored(source.code), 'select restore_id from kernel.recovery_hold')).toHaveLength(1);
      const failed = await onTarget(
        restored(source.code),
        "select unit, name, subject from kernel.recovery_event where kind in ('step', 'check') and not passed",
      );
      expect(failed).toEqual([]);
    }
    // The identifiers kept: an object key starts with the Organisation's identifier (GC9-10).
    const entries = await onTarget<{ id: string }>(t.directory, 'select id::text from kernel.directory_entry');
    expect(entries.map((entry) => entry.id).sort()).toEqual(sources.map((source) => source.organisationId).sort());
  });

  it('GC-9 12 test 1 PRD-ACP-019 every control total equals the backup’s, and every module’s checks ran', async () => {
    for (const source of sources) {
      const checks = await onTarget<{
        unit: string;
        name: string;
        passed: boolean;
        checked: string;
        check_run: number;
      }>(
        restored(source.code),
        "select unit, name, passed, checked::text, check_run from kernel.recovery_event where kind in ('step', 'check')",
      );
      expect(checks.every((check) => check.check_run === 1)).toBe(true);
      const totals = checks.filter((check) => check.name === 'control totals equal the backup');
      expect(totals.map((check) => check.unit).sort()).toEqual(
        restoreRegistry.participants.map((participant) => participant.unit).sort(),
      );
      expect(totals.every((check) => check.passed && Number(check.checked) > 0)).toBe(true);
      const names = checks.map((check) => check.name);
      expect(names).toContain('every session ended after the restore');
      expect(names).toContain('every series paused');
      expect(names).toContain('audit seal chain verifies');
      expect(names).toContain('audit seal chain ends at the manifest seal');
      expect(names).toContain('files_imports.attachment.record_id -> organisation.site');
      expect(names).toContain('every step and check recorded as an audit record');
    }
  });

  it('GC-9 12 test 2 imports-and-opening-data 17 test 23 every stored file matches its hash and every attachment opens from its record for an authorised reader, and is refused to one outside its scope', async () => {
    for (const source of sources) {
      const checks = await onTarget<{ name: string; passed: boolean; checked: string }>(
        restored(source.code),
        "select name, passed, checked::text from kernel.recovery_event where unit = 'files-imports'",
      );
      const files = checks.find(
        (check) =>
          check.name === 'every stored file is in the file store, opens with its key version and matches its hash',
      );
      expect(files?.passed).toBe(true);
      expect(Number(files?.checked)).toBeGreaterThan(0);
      expect(checks).toContainEqual({
        name: 'every attachment opens from its record for an authorised reader and is refused outside its scope',
        passed: true,
        checked: '1',
      });
      // Through the restored application: the authorised reader signs in again and reads it; the outsider is refused.
      const reader = await on(api.baseUrl, source, source.reader);
      const read = await send(
        api.baseUrl,
        reader.cookie,
        'GET',
        `/api/files-imports/attachments/${source.attachmentId}/file`,
      );
      expect(read.status).toBe(200);
      expect(
        Buffer.from((read.json as { contentBase64: string }).contentBase64, 'base64').toString('latin1'),
      ).toContain(MARKER);
      const outsider = await on(api.baseUrl, source, source.outsider);
      const refused = await send(
        api.baseUrl,
        outsider.cookie,
        'GET',
        `/api/files-imports/attachments/${source.attachmentId}/file`,
      );
      expect([403, 404]).toContain(refused.status);
    }
  });

  it('GC-9 12 test 20 2.4 Organisation B’s data opens with both of its key versions, each from its kept copy, named in the drill record', async () => {
    const b = sources[1];
    if (b === undefined || outcome.outcome !== 'held') throw new Error('Not held');
    const files = await onTarget<{ passed: boolean; checked: string }>(
      restored(b.code),
      "select passed, checked::text from kernel.recovery_event where name like 'every stored file%'",
    );
    expect(files).toEqual([{ passed: true, checked: '2' }]);
    const { record } = await drillRecordOf(outcome.drillRecord?.json ?? '');
    const versions = record.keyVersions.filter((key) => key.organisationCode === b.code);
    expect(versions.map((key) => key.identifier).sort()).toEqual(
      [OrganisationKeys.fromEnvironment(keysEnvironment).version(b.code), secondVersionB].sort(),
    );
    expect(versions.every((key) => key.fromKeptCopy && key.matchedIdentifier)).toBe(true);
  });

  it('GC-9 12 test 10 PRD-SEC-008 every session that existed in the backup is ended', async () => {
    for (const source of sources) {
      const sessions = await onTarget<{ state: string }>(
        restored(source.code),
        "select state from access.session where state in ('In force', 'Locked') and started_at < (select min(occurred_at) from kernel.recovery_event)",
      );
      expect(sessions).toEqual([]);
      // The session the person had in the source does not reach the restored Organisation.
      const old = await send(api.baseUrl, source.cookie, 'GET', routes.session.path);
      expect(old.status).toBe(401);
    }
  });

  it('GC-9 12 test 9 POL-18.03 under the hold every business command is refused naming the hold; sign-in, reading and the recovery commands work', async () => {
    const source = sources[0];
    if (source === undefined) throw new Error('No source');
    const reader = await on(api.baseUrl, source, source.reader);
    const stored = await storeFile(api.baseUrl, reader.cookie, 'under-the-hold');
    expect(stored.status).toBe(403);
    expect(stored.json).toMatchObject({ error: { kind: 'unavailable', code: 'kernel.recovery-hold' } });
    await expect(
      command(await routedIn(router, source.code), source.reader.user.id, 'kernel.synthetic-change', (c) =>
        c.publish(recordChanged, {
          subject: { module: 'kernel', recordType: 'kernel.synthetic_record', recordId: uuidv7() },
          payload: { recordId: uuidv7() },
        }),
      ),
    ).rejects.toBeInstanceOf(RecoveryHoldRefused);
    // Reading works: the operator reads recovery status.
    const status = await statusOf(api.baseUrl, source);
    expect(status.backupId).toBe(backup);
    expect(status.seriesToReconcile.length).toBe(2);
    // The file stored after the recovery point is a gap to raise and settle (4.5): reopening is refused for it first.
    expect(status.items).toEqual([
      expect.objectContaining({ kind: 'gap', unit: 'files-imports', name: 'object with no record', exceptionId: null }),
    ]);
    const early = await reopen(api.baseUrl, source);
    expect(early.status).toBe(422);
    expect(early.json).toMatchObject({ error: { code: 'configuration.recovery-gaps-unsettled' } });
    // The third confirmation is gone: a gap is settled through its exception, never attested (4.5).
    const operator = await on(api.baseUrl, source, source.recovery);
    const attested = await send(api.baseUrl, operator.cookie, 'POST', routes.reopenAfterRestore.path, {
      revocationsPlacedAgain: true,
      legalHoldsPlacedAgain: true,
      gapsSettled: true,
    });
    expect(attested.status).toBe(400);
  });

  it('GC-9 12 test 16 PRD-SEC-013 PRD-SEC-005 recovery status shows to an authorised operator and to nobody else', async () => {
    for (const source of sources) {
      const plain = await on(api.baseUrl, source, source.plain);
      const refused = await send(api.baseUrl, plain.cookie, 'GET', routes.readRecoveryStatus.path);
      expect(refused.status).toBe(403);
      // Each sees its own Organisation's restore only (PRD-MOD-001).
      expect((await statusOf(api.baseUrl, source)).recoveryPoint).toBe(
        (await manifestOf(backup)).organisations.find((part) => part.organisationCode === source.code)?.snapshotAt,
      );
    }
  });

  it('GC-9 12 tests 4 and 18 numbering-and-audit 7 test 7 every series is paused; a reconciliation sets the next number past the evidence and the restored allocations, records the skip, never lowers it; no number is given twice', async () => {
    const source = sources[0];
    if (source === undefined) throw new Error('No source');
    const routed = await routedIn(router, source.code);
    // Allocate refuses a paused series (numbering-and-audit 3.2). Its command is not one the hold lets run, so the test
    // reads the refusal of numbering itself under a recovery command's name.
    const refused = await command(
      routed,
      source.recovery.user.id,
      'configuration.reconcile-series-after-restore',
      (c) => allocateIn(c, source.batchSeriesId),
    );
    expect(refused).toMatchObject({ kind: 'refused', refusal: { code: 'numbering.series-paused' } });
    const operator = await on(api.baseUrl, source, source.recovery);
    const path = routes.reconcileSeriesAfterRestore.path.replace('{seriesId}', source.batchSeriesId);
    // The code given after the recovery point is the evidence: the next code is past it.
    const reconciled = await send(api.baseUrl, operator.cookie, 'POST', path, {
      evidence: 'SYNTHETIC: the batch code log of the source shows the last code given',
      evidenceHighest: lostBatchCode,
      reason: 'SYNTHETIC drill: a code was given after the recovery point',
    });
    expect(reconciled.status).toBe(200);
    expect(reconciled.json).toEqual({
      seriesId: source.batchSeriesId,
      restoredHighest: lostBatchCode - 1,
      nextSequenceBefore: lostBatchCode,
      nextSequenceAfter: lostBatchCode + 1,
    });
    // A second reconciliation is refused: the series is no longer waiting.
    const again = await send(api.baseUrl, operator.cookie, 'POST', path, {
      evidence: 'SYNTHETIC',
      evidenceHighest: 0,
      reason: 'SYNTHETIC',
    });
    expect(again.json).toMatchObject({ error: { code: 'numbering.series-not-paused-after-restore' } });
    // GC9-9: the code lost with the restore is never given again.
    const given = await command(routed, source.recovery.user.id, 'configuration.reconcile-series-after-restore', (c) =>
      allocateIn(c, source.batchSeriesId),
    );
    expect(given).toMatchObject({ kind: 'done', value: { sequenceNumber: lostBatchCode + 1 } });

    // Organisation B: evidence lower than what the restored database holds never lowers the next number.
    const other = sources[1];
    if (other === undefined) throw new Error('No source');
    const otherOperator = await on(api.baseUrl, other, other.recovery);
    const lower = await send(
      api.baseUrl,
      otherOperator.cookie,
      'POST',
      routes.reconcileSeriesAfterRestore.path.replace('{seriesId}', other.batchSeriesId),
      { evidence: 'SYNTHETIC: no document left the system', evidenceHighest: null, reason: 'SYNTHETIC drill' },
    );
    expect(lower.json).toEqual({
      seriesId: other.batchSeriesId,
      restoredHighest: 2,
      nextSequenceBefore: 3,
      nextSequenceAfter: 3,
    });
  });

  it('GC-9 12 test 5 numbering-and-audit 7 test 10 the restored seal chain verifies and ends at the manifest’s seal', async () => {
    const manifest = await manifestOf(backup);
    for (const source of sources) {
      expect(manifest.organisations.find((part) => part.organisationCode === source.code)?.latestSeal).not.toBeNull();
      const checks = await onTarget<{ name: string; passed: boolean }>(
        restored(source.code),
        "select name, passed from kernel.recovery_event where unit = 'audit' and kind = 'check'",
      );
      expect(checks).toEqual(
        expect.arrayContaining([
          { name: 'audit seal chain verifies', passed: true },
          { name: 'audit seal chain ends at the manifest seal', passed: true },
        ]),
      );
      // Every step and check is an audit record under the restore's internal service identity.
      const recorded = await onTarget<{ n: string }>(
        restored(source.code),
        `select count(*)::text as n from audit.audit_record a join access.service_identity s on s.id = a.actor_id
          where s.code = 'restore' and a.record_type = 'recovery_event'`,
      );
      const events = await onTarget<{ n: string }>(
        restored(source.code),
        "select count(*)::text as n from kernel.recovery_event where kind in ('step', 'check') and name <> 'every step and check recorded as an audit record'",
      );
      expect(recorded[0]?.n).toBe(events[0]?.n);
    }
  });

  it('product owner 12 Oct 2026 4.5 a gap is raised as an exception once the exception series is reconciled, and reopening waits until it is settled; any paused series blocks it', async () => {
    const source = sources[0];
    if (source === undefined || outcome.outcome !== 'held') throw new Error('Not held');
    // Before the exception-code series is reconciled the gap cannot be raised, and the refusal names the series.
    const early = await restore(t.env, ['--raise-gaps', outcome.restoreId]);
    expect(early).toMatchObject({
      outcome: 'raised',
      organisations: expect.arrayContaining([
        { organisationCode: source.code, count: 0, refusals: ['exceptions.exception-code-series-paused'] },
      ]) as unknown,
    });
    await reconcileAll(api.baseUrl, source, source.exceptionSeriesId);
    const raised = await restore(t.env, ['--raise-gaps', outcome.restoreId]);
    expect(raised).toMatchObject({
      outcome: 'raised',
      organisations: expect.arrayContaining([{ organisationCode: source.code, count: 1, refusals: [] }]) as unknown,
    });
    // Raised once: a second run raises nothing more.
    expect(await restore(t.env, ['--raise-gaps', outcome.restoreId])).toMatchObject({
      organisations: expect.arrayContaining([{ organisationCode: source.code, count: 0, refusals: [] }]) as unknown,
    });
    const [item] = (await statusOf(api.baseUrl, source)).items;
    expect(item).toMatchObject({ kind: 'gap', settlement: null });
    expect(item?.exceptionId).not.toBeNull();
    const exception = await onTarget<{ code: string; state: string; type: string }>(
      restored(source.code),
      `select e.code, e.state, t.code as type from exceptions.exception e
         join exceptions.exception_type t on t.id = e.exception_type_id where e.id = $1`,
      [item?.exceptionId],
    );
    expect(exception).toEqual([
      { code: expect.stringMatching(/^SYN-EX-/) as string, state: 'Unresolved', type: RECOVERY_GAP_TYPE },
    ]);
    await validate(api.baseUrl, source);
    const unsettled = await reopen(api.baseUrl, source);
    expect(unsettled.json).toMatchObject({
      error: {
        code: 'configuration.recovery-gaps-unsettled',
        missing: [{ kind: 'recovery-gap', exceptionId: item?.exceptionId }],
      },
    });
    // The owner settles it, accepted with a reason.
    expect(await settleAll(api.baseUrl, source)).toBe(1);
    expect((await statusOf(api.baseUrl, source)).items).toEqual([expect.objectContaining({ settlement: 'accepted' })]);
    // Any series still paused blocks reopening (4.3): Organisation B, validated and with no gap, waits for its
    // exception-code series.
    const other = sources[1];
    if (other === undefined) throw new Error('No source');
    await validate(api.baseUrl, other);
    const waiting = await reopen(api.baseUrl, other);
    expect(waiting.json).toMatchObject({
      error: {
        code: 'configuration.series-not-reconciled',
        missing: [{ kind: 'series', seriesId: other.exceptionSeriesId }],
      },
    });
  });

  it('GC-9 12 test 14 PRD-INT-006 PRD-INT-008 no outbox row is delivered while held; after reopening the inside consumer gets it once and the outside one never', async () => {
    const source = sources[0];
    const other = sources[1];
    if (source === undefined || other === undefined || outcome.outcome !== 'held') throw new Error('No source');
    const target0 = restored(source.code);
    const held = worker(router);
    await held.open();
    await held.dispatchAll();
    expect(await onTarget(target0, 'select 1 from kernel.outbox_dispatch where outbox_event_id = $1', [event])).toEqual(
      [],
    );
    await held.stop();

    // Reopen both: every series reconciled, every gap raised and settled, the two validations (4.3).
    await reconcileAll(api.baseUrl, source);
    await reconcileAll(api.baseUrl, other);
    for (const each of [source, other]) {
      const reopened = await reopen(api.baseUrl, each);
      expect(reopened.status, JSON.stringify(reopened.json)).toBe(200);
      expect(await onTarget(restored(each.code), 'select 1 from kernel.recovery_hold')).toEqual([]);
      // A business command runs again.
      expect((await storeFile(api.baseUrl, (await on(api.baseUrl, each, each.reader)).cookie, 'reopened')).status).toBe(
        200,
      );
    }

    const open = worker(router);
    try {
      await open.open();
      await open.dispatchAll();
      const dispatched = await onTarget<{ consumer: string; job_id: string }>(
        target0,
        `select c.name as consumer, d.job_id::text as job_id from kernel.outbox_dispatch d
           join kernel.outbox_consumer c on c.id = d.outbox_consumer_id where d.outbox_event_id = $1`,
        [event],
      );
      expect(dispatched.map((row) => row.consumer)).toEqual([inside.name]);
      const jobId = dispatched[0]?.job_id ?? '';
      expect(await open.deliver(source.code, { eventId: event, consumer: inside.name }, jobId)).toMatchObject({
        status: 'completed',
        output: { outcome: 'done', replayed: false },
      });
      // A delivery made again changes nothing (PRD-INT-008).
      expect(await open.deliver(source.code, { eventId: event, consumer: inside.name }, jobId)).toMatchObject({
        status: 'completed',
        output: { outcome: 'done', replayed: true },
      });
      const echoes = await onTarget(
        target0,
        "select 1 from kernel.outbox_event where event_type = 'kernel.synthetic-record-echoed'",
      );
      expect(echoes).toHaveLength(1);
      // The outside consumer never had it handed over, nor delivers it if a restored job asks (4.5). How its outcome
      // is reconciled with the outside system arrives with the first such consumer (RR-532).
      expect(await open.deliver(source.code, { eventId: event, consumer: outside.name }, uuidv7())).toMatchObject({
        status: 'completed',
        output: { outcome: 'refused', code: 'kernel.outside-outcome-unreconciled' },
      });
    } finally {
      await open.stop();
    }
  });

  it('GC-9 12 test 6 numbering-and-audit 7 test 14 POL-18.05 nothing is deleted across backup, restore and reopening', async () => {
    const manifest = await manifestOf(backup);
    for (const source of sources) {
      const part = manifest.organisations.find((each) => each.organisationCode === source.code);
      if (part === undefined) throw new Error('No part');
      const client = new Client({ connectionString: target.url(restored(source.code), 'migration') });
      await client.connect();
      let now;
      try {
        await client.query('begin isolation level repeatable read read only');
        now = await restoreRegistry.controlTotals({ organisationCode: source.code, tx: drizzle({ client }) });
        await client.query('rollback');
      } finally {
        await client.end();
      }
      const counts = new Map(now.flatMap((each) => each.totals).map((total) => [total.name, Number(total.value)]));
      for (const total of part.controlTotals.flatMap((each) => each.totals)) {
        if (total.name.endsWith('.rows'))
          expect(counts.get(total.name) ?? 0, total.name).toBeGreaterThanOrEqual(Number(total.value));
      }
      // Every object of the backup store is in the restored file store, those with no record included (3.3).
      const backedUp = (await bucketKeys(backupBucket, `files/${source.organisationId}/`)).map((key) =>
        key.slice('files/'.length),
      );
      const kept = await bucketKeys(t.bucket, `${source.organisationId}/`);
      for (const key of backedUp) expect(kept).toContain(key);
    }
    // The retention schedules hold no row: no period is set, so nothing is deleted (8.2).
    expect(await onTarget(restored(sources[0]?.code ?? ''), 'select 1 from configuration.retention_schedule')).toEqual(
      [],
    );
  });

  it('section 6 the drill record holds the steps, checks, gaps, key versions, and after the update the reconciliations, validations, gap exceptions and reopening', async () => {
    if (outcome.outcome !== 'held') throw new Error('Not held');
    const first = await drillRecordOf(outcome.drillRecord?.json ?? '');
    expect(first.record).toMatchObject({
      version: 1,
      purpose: { kind: 'drill' },
      conductedBy: 'SYNTHETIC operator, platform',
      result: 'held',
      backup: { backupId: backup },
    });
    expect(first.record.steps.map((step) => step.step)).toEqual(
      expect.arrayContaining([
        'restore the directory database',
        'restore the database',
        'migrate the database',
        'compare the control totals with the backup',
        'place the recovery hold',
        'point the directory at the target',
        'copy the file objects',
        'run the restore participants',
      ]),
    );
    expect(first.record.steps.every((step) => step.outcome === 'done' && step.endedAt >= step.startedAt)).toBe(true);
    expect(first.record.keyVersions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ purpose: 'backup', identifier: backupKey.privateKey.version, fromKeptCopy: true }),
        expect.objectContaining({
          purpose: 'organisation-data',
          organisationCode: sources[0]?.code,
          fromKeptCopy: true,
        }),
      ]),
    );
    const a = first.record.organisations.find((each) => each.organisationCode === sources[0]?.code);
    // The file stored after the snapshot is an object with no record, stored after the recovery point (3.3, 4.5).
    expect(a?.gaps).toEqual([expect.objectContaining({ name: 'object with no record', afterRecoveryPoint: true })]);
    expect(first.text).toContain('Restore drill record, version 1');

    const refreshed = await restore(t.env, ['--drill-record', outcome.restoreId]);
    expect(refreshed).toMatchObject({ outcome: 'written', result: 'reopened' });
    const second = await drillRecordOf(refreshed.outcome === 'written' ? refreshed.json : '');
    expect(second.record.version).toBe(2);
    expect(second.record.measured.recoveryTimeSeconds).not.toBeNull();
    for (const organisation of second.record.organisations) {
      expect(organisation.reopened).not.toBeNull();
      expect(organisation.validations.map((each) => each.validates).sort()).toEqual(['accounts', 'operations']);
      expect(organisation.seriesReconciled.length).toBe(2);
      expect(organisation.seriesToReconcile).toBe(0);
    }
    const secondA = second.record.organisations.find((each) => each.organisationCode === sources[0]?.code);
    expect(secondA?.recoveryItems).toEqual([
      expect.objectContaining({ kind: 'gap', settlement: 'accepted', exceptionId: expect.any(String) as string }),
    ]);
    expect(secondA?.seriesReconciled.find((each) => each.seriesId === sources[0]?.batchSeriesId)).toMatchObject({
      evidenceHighest: lostBatchCode,
      skipped: { from: lostBatchCode, to: lostBatchCode },
    });
    expect(second.text).toContain('accepted');
  });
});

describe('one Organisation restored alone, from a backup copy with damaged objects and altered rows', () => {
  let t: Target;
  let outcome: RestoreCommandOutcome;
  let api: AccessTestApp;
  const damaged: Record<'missing' | 'altered' | 'otherKey' | 'otherContent', string> = {
    missing: '',
    altered: '',
    otherKey: '',
    otherContent: '',
  };
  let sourceA: { tables: string; objects: string[] };
  let database: string;

  beforeAll(async () => {
    const source = sources[1];
    const otherSource = sources[0];
    if (source === undefined || otherSource === undefined) throw new Error('No source');
    // Four more files in Organisation B, attached to its Site.
    const keys: string[] = [];
    for (const label of ['missing', 'altered', 'other-key', 'other-content']) {
      const stored = (await storeFile(sourceApi.baseUrl, source.cookie, label)).json as {
        storedFileId: string;
        receiptId: string;
      };
      await attach(source.database, stored, source.site, source.reader.user.id);
      const row = await query<{ object_key: string }>(
        source.database,
        'select object_key from files_imports.stored_file where id = $1',
        [stored.storedFileId],
      );
      keys.push(row[0]?.object_key ?? '');
    }
    [damaged.missing, damaged.altered, damaged.otherKey, damaged.otherContent] = keys as [
      string,
      string,
      string,
      string,
    ];
    sourceA = {
      tables: JSON.stringify(await query(otherSource.database, 'select count(*)::text as n from audit.audit_record')),
      objects: await bucketKeys(minio.bucket, `${otherSource.organisationId}/`),
    };
    const taken = await takeBackup();
    // GC-9 tests 5 and 8, as written: in a copy of the backup, a sealed audit row altered and a reference across
    // modules that no longer resolves.
    const altered = await alteredCopy(
      taken,
      source.code,
      `do $$
       declare
         target record;
       begin
         select a.id, a.tableoid::regclass as partition into target from audit.audit_record a
          where a.recorded_at < (select max(covers_to) from audit.audit_seal)
          order by a.recorded_at limit 1;
         execute format('alter table %s disable trigger user', target.partition);
         update audit.audit_record set operation = 'synthetic-altered' where id = target.id;
         execute format('alter table %s enable trigger user', target.partition);
       end $$;
       alter table files_imports.attachment disable trigger refuse_row_change;
       update files_imports.attachment set site_id = '${uuidv7()}' where id = '${source.attachmentId}';
       alter table files_imports.attachment enable trigger refuse_row_change;`,
    );
    // GC-9 test 3: the copies of objects in the backup store damaged: one removed, one changed, one sealed under another
    // key, and one sealed under the right key version but holding other bytes.
    await minio.client.send(new DeleteObjectCommand({ Bucket: backupBucket, Key: `files/${damaged.missing}` }));
    const changed = await objectOf(minio.client, backupBucket, `files/${damaged.altered}`);
    changed[changed.length - 5] = (changed[changed.length - 5] ?? 0) ^ 0xff;
    await put(backupBucket, `files/${damaged.altered}`, changed);
    const nonce = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', randomBytes(32), nonce);
    const body = Buffer.concat([cipher.update(pdf('another-key')), cipher.final()]);
    await put(backupBucket, `files/${damaged.otherKey}`, Buffer.concat([nonce, cipher.getAuthTag(), body]));
    const hash = damaged.otherContent.slice(damaged.otherContent.lastIndexOf('/') + 1);
    const otherBytes = sealFile(
      OrganisationKeys.fromEnvironment(keysEnvironment),
      source.code,
      hash,
      pdf('other-bytes'),
    );
    await put(backupBucket, `files/${damaged.otherContent}`, otherBytes.bytes);

    t = await freshTarget('rt_one');
    outcome = await restore(t.env, [altered, '--organisation', source.code]);
    if (outcome.outcome !== 'held-with-failed-checks') throw new Error(`Not held: ${JSON.stringify(outcome)}`);
    database = outcome.organisations[0]?.databaseName ?? '';
    api = await startAccessApp(restoredWorld(t, new Map([[source.code, database]])), keysEnvironment, {
      fileStoreEnvironment: { ...minio.environment, [FILE_STORE_VARIABLES.bucket]: t.bucket },
      directoryRuntimeUrl: target.url(t.directory, 'runtime'),
    });
  });

  afterAll(async () => {
    await (api as AccessTestApp | undefined)?.close();
  });

  it('GC-9 12 test 3 PRD-ACP-019 a restored object missing, altered, encrypted with another key or holding other bytes fails the file check, is named in the drill record, and the Organisation stays held', async () => {
    if (outcome.outcome !== 'held-with-failed-checks') throw new Error('Not held');
    const { record, text } = await drillRecordOf(outcome.drillRecord?.json ?? '');
    const checks = record.organisations[0]?.checks ?? [];
    const named = (key: string) => checks.find((check) => check.subject === key && !check.passed);
    expect(named(damaged.missing)?.check).toBe('stored file missing from the file store');
    expect(named(damaged.altered)?.check).toBe('stored file does not open with the key version it names');
    expect(named(damaged.otherKey)?.check).toBe('stored file does not open with the key version it names');
    expect(named(damaged.otherContent)?.check).toBe('stored file does not match its content hash');
    for (const key of Object.values(damaged)) expect(text).toContain(key);
    expect(await target.query(database, 'select 1 from kernel.recovery_hold')).toHaveLength(1);
  });

  it('GC-9 12 tests 5 and 8 a sealed row altered in the backup copy is reported, and so is a dangling reference across modules made there; reopening is refused', async () => {
    const source = sources[1];
    if (source === undefined) throw new Error('No source');
    const failed = await target.query<{ unit: string; name: string }>(
      database,
      "select unit, name from kernel.recovery_event where kind in ('step', 'check') and not passed order by unit, name",
    );
    expect(failed).toEqual(
      expect.arrayContaining([
        { unit: 'audit', name: 'audit seal chain verifies' },
        { unit: 'files-imports', name: 'files_imports.attachment.site_id -> organisation.site' },
      ]),
    );
    const refused = await reopen(api.baseUrl, source);
    expect(refused.json).toMatchObject({ error: { code: 'configuration.restore-check-failed' } });
  });

  it('product owner 12 Oct 2026 5.1 a failed check never blocks for good: put right and checked again it passes; what still fails is raised and settled; then it reopens', async () => {
    const source = sources[1];
    if (source === undefined || outcome.outcome !== 'held-with-failed-checks') throw new Error('Not held');
    // The objects put right in the target's file store from the source's own copies, then the checks run again.
    for (const key of Object.values(damaged)) await put(t.bucket, key, await objectOf(minio.client, minio.bucket, key));
    const rechecked = await restore(t.env, ['--recheck', outcome.restoreId]);
    expect(rechecked).toMatchObject({ outcome: 'rechecked', organisations: [{ organisationCode: source.code }] });
    const latest = await target.query<{ name: string; passed: boolean }>(
      database,
      "select name, passed from kernel.recovery_event where kind = 'check' and check_run = 2",
    );
    expect(latest).toContainEqual({
      name: 'every stored file is in the file store, opens with its key version and matches its hash',
      passed: true,
    });
    expect(latest.some((check) => check.name.startsWith('stored file ') && !check.passed)).toBe(false);
    // What still fails, the altered seal chain and the dangling reference, is what blocks now.
    const items = (await statusOf(api.baseUrl, source)).items;
    expect(items.every((item) => item.kind === 'failure')).toBe(true);
    expect(items.map((item) => item.name)).toEqual(
      expect.arrayContaining(['audit seal chain verifies', 'files_imports.attachment.site_id -> organisation.site']),
    );
    expect(items.some((item) => item.name.startsWith('stored file '))).toBe(false);
    // Raised once the exception series is reconciled, settled by their owner, then the Organisation reopens.
    await reconcileAll(api.baseUrl, source, source.exceptionSeriesId);
    const raised = await restore(t.env, ['--raise-gaps', outcome.restoreId]);
    expect(raised).toMatchObject({
      organisations: [{ organisationCode: source.code, count: items.length, refusals: [] }],
    });
    expect(await settleAll(api.baseUrl, source)).toBe(items.length);
    await reconcileAll(api.baseUrl, source);
    await validate(api.baseUrl, source);
    const reopened = await reopen(api.baseUrl, source);
    expect(reopened.status, JSON.stringify(reopened.json)).toBe(200);
    // The checks run again and the exceptions are in the drill record.
    const refreshed = await restore(t.env, ['--drill-record', outcome.restoreId]);
    if (refreshed.outcome !== 'written') throw new Error('Not written');
    const { record } = await drillRecordOf(refreshed.json);
    expect(record.organisations[0]?.checks.some((check) => check.run === 2)).toBe(true);
    expect(record.organisations[0]?.recoveryItems.every((item) => item.settlement === 'accepted')).toBe(true);
  });

  it('GC-9 12 test 13 PRD-MOD-001 PRD-ACS-020 restoring one Organisation writes nothing into the other’s databases or objects, and each sees only its own records afterwards', async () => {
    const source = sources[1];
    const otherSource = sources[0];
    if (source === undefined || otherSource === undefined) throw new Error('No source');
    expect(
      await target.query<{ organisation_code: string }>(
        t.directory,
        'select organisation_code from kernel.directory_entry',
      ),
    ).toEqual([{ organisation_code: source.code }]);
    expect(await bucketKeys(t.bucket, `${otherSource.organisationId}/`)).toEqual([]);
    expect((await bucketKeys(t.bucket)).every((key) => key.startsWith(`${source.organisationId}/`))).toBe(true);
    expect(
      JSON.stringify(await query(otherSource.database, 'select count(*)::text as n from audit.audit_record')),
    ).toBe(sourceA.tables);
    expect(await bucketKeys(minio.bucket, `${otherSource.organisationId}/`)).toEqual(sourceA.objects);
    // Afterwards, through the restored application: B's people see B's records; A is not there to sign in to, and
    // A's attachment is not found from B.
    expect((await signIn(api.baseUrl, otherSource.code, otherSource.plain.user)).status).not.toBe(200);
    const reader = await on(api.baseUrl, source, source.reader);
    expect((await send(api.baseUrl, reader.cookie, 'GET', routes.session.path)).status).toBe(200);
    const others = await send(
      api.baseUrl,
      reader.cookie,
      'GET',
      `/api/files-imports/attachments/${otherSource.attachmentId}/file`,
    );
    expect([403, 404]).toContain(others.status);
  });
});

describe('what a restore leaves behind (GC-9 12 tests 12 and 17; PRD-SEC-006, PRD-SEC-014; POL-18.02)', () => {
  it('GC-9 12 tests 12 and 17 the drill records and the logs hold no key, no secret, no connection string and no record data', async () => {
    const keys = Object.values(
      JSON.parse(keysEnvironment[ORGANISATION_KEYS_VARIABLE] ?? '{}') as Record<string, string>,
    );
    const forbidden = [
      backupKey.privateText,
      backupKey.publicText,
      ...Object.values(signingKey.backupRunner),
      secondKeyB,
      ...keys,
      MARKER,
      databaseUrl(world.directory, 'migration'),
      databaseUrl(world.directory, 'runtime'),
      backupEnvironment.AOS_BACKUP_STORE_SECRET_ACCESS_KEY ?? '',
      ...sources.flatMap((source) => [
        source.reader.user.login,
        source.reader.user.password,
        source.recovery.user.login,
      ]),
    ];
    const drillRecords = (await bucketKeys(backupBucket, 'backups/')).filter((key) => key.includes('/drill-record-'));
    expect(drillRecords.length).toBeGreaterThan(2);
    const texts = [
      logLines.join('\n'),
      JSON.stringify(captured.lines),
      ...(await Promise.all(
        drillRecords.map(async (key) => (await objectOf(minio.client, backupBucket, key)).toString('utf8')),
      )),
    ];
    for (const text of texts) {
      for (const value of forbidden) expect(text.includes(value), value.slice(0, 12)).toBe(false);
    }
  });
});

/** Allocate on a series the command locks first, as an owning module does (numbering-and-audit 3.2). */
async function allocateIn(context: TransactionContext, seriesId: string) {
  await context.lock(8, [numbering.seriesLockTarget(seriesId)]);
  return numbering.allocate(context, { seriesId, documentType: 'files_imports.import_batch', documentId: uuidv7() });
}
