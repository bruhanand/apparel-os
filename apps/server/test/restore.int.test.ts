import { createCipheriv, randomBytes, randomInt } from 'node:crypto';
import { uuidv7 } from '@apparel-os/domain';
import { recoveryStatusSchema, routes } from '@apparel-os/schemas';
import { CreateBucketCommand, DeleteObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { runBackupCommand } from '../src/backup.js';
import {
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
  Worker,
  type BackupManifest,
  type BackupOutcome,
  type DrillRecord,
  type DumpTool,
  type JobRegistry,
  type RoutedOrganisation,
  type TransactionContext,
} from '../src/kernel/index.js';
import { jobIdentities, ORGANISATION_KEYS_VARIABLE } from '../src/modules/access/index.js';
import { Audit } from '../src/modules/audit/index.js';
import { FILE_STORE_VARIABLES, IMPORT_BATCH_KIND, IMPORT_BATCH_SCOPE_KEY } from '../src/modules/files-imports/index.js';
import { Numbering } from '../src/modules/numbering/index.js';
import { numberedKinds } from '../src/numbered-kinds.js';
import { restoreRegistry } from '../src/restore-participants.js';
import { runRestoreCommand, type RestoreAnswers, type RestoreCommandOutcome } from '../src/restore.js';
import { restoreIdentityGrant } from '../src/restore-steps.js';
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
  objectOf,
  syntheticBackupKey,
} from './support/backup.js';
import { grantSynthetic } from './support/grants.js';
import { defineSyntheticImportBatchSeries } from './support/imports.js';
import { capturingLogger, writeSyntheticServiceIdentity } from './support/jobs.js';
import { startTestFileStore, type TestFileStore } from './support/minio.js';
import { createSyntheticOrganisations, type SyntheticWorld } from './support/organisations.js';
import { connect, createEmptyDatabase, databaseUrl, dropDatabase } from './support/postgres.js';
import { syntheticCode, syntheticName } from './fixtures/synthetic.js';

// S1-F14-T03: the restore into a fresh target, against real PostgreSQL and MinIO with the two synthetic Organisations
// (backup-and-restore 4.1 to 4.5, 5.1 to 5.4, section 6, 8.2, 10.1 to 10.3, section 11, section 12 tests 2 to 6, 8 to
// 18; imports-and-opening-data 17 test 23; numbering-and-audit 7 tests 7, 10 and 14; POL-18.02 to POL-18.05,
// PRD-ACP-019, PRD-SEC-005 to PRD-SEC-008, PRD-SEC-012 to PRD-SEC-014, PRD-SEC-018, PRD-INT-006, PRD-INT-008,
// PRD-MOD-001, PRD-ACS-020). Every key, file, user, setting and value here is SYNTHETIC.

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
}

let world: SyntheticWorld;
let minio: TestFileStore;
let sourceApi: AccessTestApp;
let keysEnvironment: Record<string, string>;
let backupEnvironment: Record<string, string>;
let backupBucket: string;
const backupKey = syntheticBackupKey();
const sources: Source[] = [];
const created: string[] = [];
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
  const answer = await send(base, cookie, 'POST', '/api/files-imports/files', {
    sourceSystem: 'manual-upload',
    originalName: `${MARKER}-${label}.pdf`,
    contentBase64: pdf(`${label}-${String(randomInt(1_000_000_000))}`).toString('base64'),
  });
  return answer;
}

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

/** A fresh target: an empty directory database owned by the migration role and an empty bucket. */
async function freshTarget(label: string): Promise<{ directory: string; env: Record<string, string>; bucket: string }> {
  const directory = await createEmptyDatabase(label);
  created.push(directory);
  const bucket = `syn-target-${randomBytes(4).toString('hex')}`;
  await minio.client.send(new CreateBucketCommand({ Bucket: bucket }));
  return {
    directory,
    bucket,
    env: {
      ...backupEnvironment,
      ...minio.environment,
      [FILE_STORE_VARIABLES.bucket]: bucket,
      AOS_MIGRATION_DATABASE_URL: databaseUrl(directory, 'migration'),
      AOS_RUNTIME_DATABASE_URL: databaseUrl(directory, 'runtime'),
    },
  };
}

const answers =
  (overrides: Partial<RestoreAnswers> = {}) =>
  (): Promise<RestoreAnswers> =>
    Promise.resolve({
      purpose: { kind: 'drill', note: 'SYNTHETIC drill of the restore tests' },
      conductedBy: 'SYNTHETIC operator, platform',
      privateKeyText: backupKey.privateText,
      organisationKeysText: keysEnvironment[ORGANISATION_KEYS_VARIABLE] ?? '',
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
    restoreTool: containerRestoreTool,
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

beforeAll(async () => {
  world = await createSyntheticOrganisations('restore');
  minio = await startTestFileStore();
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
    await writeSyntheticServiceIdentity(organisation.database, RESTORE_IDENTITY, restoreIdentityGrant().authorities);
  }
  sourceApi = await startAccessApp(world, keysEnvironment, { fileStoreEnvironment: minio.environment });
  sourceRouter = new OrganisationRouter(
    { directoryConnectionString: databaseUrl(world.directory, 'runtime'), poolMax: SYNTHETIC_POOL_MAX },
    captured.logger,
  );
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
    await grantSynthetic(organisation.database, { kind: 'user', id: reader.user.id }, [
      { recordType: 'files_imports.stored_file', action: 'create' },
    ]);
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
    // The import batch code series with two codes given (GC9-9), and one audit block sealed (5.4).
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
    });
  }
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
    ...backupStoreEnvironment,
    ...minio.environment,
  };
  // The backup: after Organisation A's snapshot, a file is stored and a batch code given there, both lost by the
  // restore: the file's object is copied with no record (3.3), and the code is not in the restored database (GC9-9).
  backup = await takeBackup({
    async dump(target, into) {
      const database = new URL(target.connectionString).pathname.slice(1);
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
      return containerDumpTool.dump(target, into);
    },
  });
}, 600_000);

afterAll(async () => {
  await (sourceApi as AccessTestApp | undefined)?.close();
  await (sourceRouter as OrganisationRouter | undefined)?.close();
  for (const database of created) await dropDatabase(database);
  await (minio as TestFileStore | undefined)?.stop();
  await (world as SyntheticWorld | undefined)?.reset();
});

/** The databases a target holds after a restore, to drop at the end. */
async function keepTargetDatabases(directory: string): Promise<void> {
  const rows = await query<{ datname: string }>(
    directory,
    "select datname::text from pg_catalog.pg_database where datname like $1 || '\\_%'",
    [directory],
  );
  for (const row of rows) if (!created.includes(row.datname)) created.unshift(row.datname);
}

describe('the restore refuses before writing anything (GC-9 12 test 11; PRD-ACP-019)', () => {
  it('GC-9 12 test 11 refuses a target that is not fresh, the source, another environment, missing key versions and a newer backup', async () => {
    const target = await freshTarget('rt_refused');
    const nothingWritten = async () => {
      expect(
        await query(target.directory, "select 1 from pg_catalog.pg_class where relnamespace = 'public'::regnamespace"),
      ).toEqual([]);
      expect(
        await query(target.directory, "select datname from pg_catalog.pg_database where datname like $1 || '\\_%'", [
          target.directory,
        ]),
      ).toEqual([]);
      expect(await bucketKeys(target.bucket)).toEqual([]);
    };
    const reasonOf = (outcome: RestoreCommandOutcome) => (outcome.outcome === 'refused' ? outcome.reason : '');

    // Another environment (4.1).
    const otherEnvironment = await restore({ ...target.env, AOS_ENVIRONMENT: 'dev' }, [backup]);
    expect(reasonOf(otherEnvironment)).toContain('environment local');
    await nothingWritten();

    // A key version not given from its kept copy (2.3, 2.4): Organisation B's key left out, or another key given.
    const keys = JSON.parse(keysEnvironment[ORGANISATION_KEYS_VARIABLE] ?? '{}') as Record<string, string>;
    const [codeA, codeB] = [sources[0]?.code ?? '', sources[1]?.code ?? ''];
    const missing = await restore(target.env, [backup], {
      organisationKeysText: JSON.stringify({ [codeA]: keys[codeA] }),
    });
    expect(reasonOf(missing)).toContain(`Organisation ${codeB}'s data needs key version`);
    const wrong = await restore(target.env, [backup], {
      organisationKeysText: JSON.stringify({ ...keys, [codeB]: randomBytes(32).toString('base64url') }),
    });
    expect(reasonOf(wrong)).toContain('no kept copy of it was given');
    // A private part that is not the backup key's: the manifest does not open.
    const otherKey = syntheticBackupKey();
    expect(reasonOf(await restore(target.env, [backup], { privateKeyText: otherKey.privateText }))).toContain(
      'does not open with the backup key given',
    );
    await nothingWritten();

    // The source itself, and a target that is not fresh.
    expect(
      reasonOf(
        await restore(
          {
            ...target.env,
            AOS_MIGRATION_DATABASE_URL: databaseUrl(world.directory, 'migration'),
            AOS_RUNTIME_DATABASE_URL: databaseUrl(world.directory, 'runtime'),
          },
          [backup],
        ),
      ),
    ).toContain('the target is the source');
    await query(target.directory, 'create table public.synthetic_left_over (id int)');
    expect(reasonOf(await restore(target.env, [backup]))).toContain('the target is not fresh');
    await query(target.directory, 'drop table public.synthetic_left_over');
    await minio.client.send(new PutObjectCommand({ Bucket: target.bucket, Key: 'synthetic-left-over', Body: 'x' }));
    expect(reasonOf(await restore(target.env, [backup]))).toContain('file store holds objects');
    await minio.client.send(new DeleteObjectCommand({ Bucket: target.bucket, Key: 'synthetic-left-over' }));
    await nothingWritten();

    // A backup taken by newer code: Organisation B's database records a migration this code does not hold.
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
    expect(reasonOf(await restore(target.env, [newer]))).toContain('taken by newer code');
    await nothingWritten();
  });

  it('GC-9 12 test 15 PRD-SEC-018 cannot be reached through the API, and the runtime role cannot run it', async () => {
    for (const route of Object.values(routes)) expect(route.path).not.toContain('restore');
    const target = await freshTarget('rt_runtime');
    const refused = await restore(
      { ...target.env, AOS_MIGRATION_DATABASE_URL: databaseUrl(target.directory, 'runtime') },
      [backup],
    );
    expect(refused.outcome).toBe('refused');
    expect(refused.outcome === 'refused' ? refused.reason : '').toContain('not as aos_migration');
    expect(await bucketKeys(target.bucket)).toEqual([]);
  });
});

describe('a whole environment restored into a fresh target (backup-and-restore 4.2)', () => {
  let target: { directory: string; env: Record<string, string>; bucket: string };
  let outcome: RestoreCommandOutcome;
  let api: AccessTestApp;
  let router: OrganisationRouter;
  const targetDatabase = new Map<string, string>();

  beforeAll(async () => {
    target = await freshTarget('rt_whole');
    outcome = await restore(target.env, [backup]);
    await keepTargetDatabases(target.directory);
    for (const row of await query<{ organisation_code: string; database_name: string }>(
      target.directory,
      'select organisation_code, database_name from kernel.directory_entry',
    )) {
      targetDatabase.set(row.organisation_code, row.database_name);
    }
    const targetWorld = {
      directory: target.directory,
      organisations: world.organisations.map((organisation) => ({
        ...organisation,
        database: targetDatabase.get(organisation.code) ?? '',
      })) as unknown as SyntheticWorld['organisations'],
      reset: () => Promise.resolve(),
    };
    api = await startAccessApp(targetWorld, keysEnvironment, {
      fileStoreEnvironment: { ...minio.environment, [FILE_STORE_VARIABLES.bucket]: target.bucket },
    });
    router = new OrganisationRouter(
      { directoryConnectionString: databaseUrl(target.directory, 'runtime'), poolMax: SYNTHETIC_POOL_MAX },
      captured.logger,
    );
  });

  afterAll(async () => {
    await (api as AccessTestApp | undefined)?.close();
    await (router as OrganisationRouter | undefined)?.close();
  });

  const restored = (code: string) => targetDatabase.get(code) ?? '';

  it('PRD-ACP-019 holds each Organisation with every check passed, and points the target directory at it', async () => {
    expect(outcome.outcome).toBe('held');
    for (const source of sources) {
      expect(restored(source.code)).toBe(`${target.directory}_${source.code.toLowerCase().replace(/-/g, '_')}`);
      expect(await query(restored(source.code), 'select restore_id from kernel.recovery_hold')).toHaveLength(1);
      const failed = await query(
        restored(source.code),
        "select unit, name, subject from kernel.recovery_event where kind in ('step', 'check') and not passed",
      );
      expect(failed).toEqual([]);
    }
    // The identifiers kept: an object key starts with the Organisation's identifier (GC9-10).
    const entries = await query<{ id: string; organisation_code: string }>(
      target.directory,
      'select id::text, organisation_code from kernel.directory_entry order by organisation_code',
    );
    expect(entries.map((entry) => entry.id).sort()).toEqual(sources.map((source) => source.organisationId).sort());
  });

  it('GC-9 12 test 1 PRD-ACP-019 every control total equals the backup’s, and every module’s checks ran', async () => {
    for (const source of sources) {
      const checks = await query<{ unit: string; name: string; passed: boolean; checked: string }>(
        restored(source.code),
        "select unit, name, passed, checked::text from kernel.recovery_event where kind in ('step', 'check')",
      );
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
      const checks = await query<{ name: string; passed: boolean; checked: string }>(
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
      expect(reader.status).toBe(200);
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
      expect(outsider.status).toBe(200);
      const refused = await send(
        api.baseUrl,
        outsider.cookie,
        'GET',
        `/api/files-imports/attachments/${source.attachmentId}/file`,
      );
      expect([403, 404]).toContain(refused.status);
    }
  });

  it('GC-9 12 test 10 PRD-SEC-008 every session that existed in the backup is ended', async () => {
    for (const source of sources) {
      const sessions = await query<{ state: string }>(
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
    // Reading works: the operator reads recovery status and backup status.
    const operator = await on(api.baseUrl, source, source.recovery);
    const status = await send(api.baseUrl, operator.cookie, 'GET', routes.readRecoveryStatus.path);
    expect(status.status).toBe(200);
    const parsed = recoveryStatusSchema.parse(status.json);
    expect(parsed.held).toBe(true);
    expect(parsed.restore?.backupId).toBe(backup);
    expect(parsed.restore?.seriesToReconcile.length).toBeGreaterThan(0);
    // Reopening is refused while the validations are not recorded and a series waits.
    const early = await send(api.baseUrl, operator.cookie, 'POST', routes.reopenAfterRestore.path, {
      revocationsPlacedAgain: true,
      legalHoldsPlacedAgain: true,
      gapsSettled: true,
    });
    expect(early.status).toBe(422);
    expect(early.json).toMatchObject({ error: { code: 'configuration.validations-missing' } });
  });

  it('GC-9 12 test 16 PRD-SEC-013 PRD-SEC-005 recovery status shows to an authorised operator and to nobody else', async () => {
    for (const source of sources) {
      const plain = await on(api.baseUrl, source, source.plain);
      const refused = await send(api.baseUrl, plain.cookie, 'GET', routes.readRecoveryStatus.path);
      expect(refused.status).toBe(403);
      const operator = await on(api.baseUrl, source, source.recovery);
      const status = recoveryStatusSchema.parse(
        (await send(api.baseUrl, operator.cookie, 'GET', routes.readRecoveryStatus.path)).json,
      );
      // Each sees its own Organisation's restore only (PRD-MOD-001).
      expect(status.restore?.recoveryPoint).toBe(
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
      const checks = await query<{ name: string; passed: boolean }>(
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
      const recorded = await query<{ n: string }>(
        restored(source.code),
        `select count(*)::text as n from audit.audit_record a join access.service_identity s on s.id = a.actor_id
          where s.code = 'restore' and a.record_type = 'recovery_event'`,
      );
      const events = await query<{ n: string }>(
        restored(source.code),
        "select count(*)::text as n from kernel.recovery_event where kind in ('step', 'check') and name <> 'every step and check recorded as an audit record'",
      );
      expect(recorded[0]?.n).toBe(events[0]?.n);
    }
  });

  it('GC-9 12 test 14 PRD-INT-006 PRD-INT-008 no outbox row is delivered while held; after reopening the inside consumer gets it once and the outside one never', async () => {
    const source = sources[0];
    const other = sources[1];
    if (source === undefined || other === undefined) throw new Error('No source');
    const target0 = restored(source.code);
    const held = worker(router);
    await held.open();
    await held.dispatchAll();
    expect(await query(target0, 'select 1 from kernel.outbox_dispatch where outbox_event_id = $1', [event])).toEqual(
      [],
    );
    await held.stop();

    // Reopen both: the validations by two people, every series reconciled (B's above), then reopen (4.3).
    for (const each of [source, other]) {
      const operator = await on(api.baseUrl, each, each.recovery);
      const validator = await on(api.baseUrl, each, each.validator);
      const status = recoveryStatusSchema.parse(
        (await send(api.baseUrl, operator.cookie, 'GET', routes.readRecoveryStatus.path)).json,
      );
      for (const series of status.restore?.seriesToReconcile ?? []) {
        expect(
          (
            await send(
              api.baseUrl,
              operator.cookie,
              'POST',
              routes.reconcileSeriesAfterRestore.path.replace('{seriesId}', series.seriesId),
              { evidence: 'SYNTHETIC: no document left the system', evidenceHighest: null, reason: 'SYNTHETIC drill' },
            )
          ).status,
        ).toBe(200);
      }
      const operations = await send(api.baseUrl, operator.cookie, 'POST', routes.recordRecoveryValidation.path, {
        validates: 'operations',
        compared: ['stock', 'bills'],
        comparedAgainst: 'SYNTHETIC: the source totals before the drill',
        evidence: 'SYNTHETIC: the drill notes',
      });
      expect(operations.status).toBe(200);
      const notYet = await send(api.baseUrl, operator.cookie, 'POST', routes.reopenAfterRestore.path, {
        revocationsPlacedAgain: true,
        legalHoldsPlacedAgain: true,
        gapsSettled: true,
      });
      expect(notYet.json).toMatchObject({
        error: {
          code: 'configuration.validations-missing',
          missing: [{ kind: 'recovery-validation', validates: 'accounts' }],
        },
      });
      const accounts = await send(api.baseUrl, validator.cookie, 'POST', routes.recordRecoveryValidation.path, {
        validates: 'accounts',
        compared: ['financial-totals'],
        comparedAgainst: 'SYNTHETIC: the trial balance before the drill',
        evidence: 'SYNTHETIC: the drill notes',
      });
      expect(accounts.status).toBe(200);
      // Every confirmation is asked for.
      const unconfirmed = await send(api.baseUrl, operator.cookie, 'POST', routes.reopenAfterRestore.path, {
        revocationsPlacedAgain: true,
        legalHoldsPlacedAgain: false,
        gapsSettled: true,
      });
      expect(unconfirmed.status).toBe(400);
      const reopened = await send(api.baseUrl, operator.cookie, 'POST', routes.reopenAfterRestore.path, {
        revocationsPlacedAgain: true,
        legalHoldsPlacedAgain: true,
        gapsSettled: true,
      });
      expect(reopened.status).toBe(200);
      expect(await query(restored(each.code), 'select 1 from kernel.recovery_hold')).toEqual([]);
      // A business command runs again.
      expect((await storeFile(api.baseUrl, (await on(api.baseUrl, each, each.reader)).cookie, 'reopened')).status).toBe(
        200,
      );
    }

    const open = worker(router);
    try {
      await open.open();
      await open.dispatchAll();
      const dispatched = await query<{ consumer: string; job_id: string }>(
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
      const echoes = await query(
        target0,
        "select 1 from kernel.outbox_event where event_type = 'kernel.synthetic-record-echoed'",
      );
      expect(echoes).toHaveLength(1);
      // The outside consumer never had it handed over, nor delivers it if a restored job asks (4.5).
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
      const client = await connect(restored(source.code), 'migration');
      let now;
      try {
        await client.query('begin isolation level repeatable read read only');
        const { drizzle } = await import('drizzle-orm/node-postgres');
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
      const kept = await bucketKeys(target.bucket, `${source.organisationId}/`);
      for (const key of backedUp) expect(kept).toContain(key);
    }
    // The retention schedules hold no row: no period is set, so nothing is deleted (8.2).
    expect(await query(restored(sources[0]?.code ?? ''), 'select 1 from configuration.retention_schedule')).toEqual([]);
  });

  it('section 6 the drill record holds the steps, checks, gaps, key versions, and after the update the reconciliations, validations and reopening', async () => {
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

    const refreshed = await restore(target.env, ['--drill-record', outcome.restoreId]);
    expect(refreshed).toMatchObject({ outcome: 'written', result: 'reopened' });
    const second = await drillRecordOf(refreshed.outcome === 'written' ? refreshed.json : '');
    expect(second.record.version).toBe(2);
    expect(second.record.measured.recoveryTimeSeconds).not.toBeNull();
    for (const organisation of second.record.organisations) {
      expect(organisation.reopened).not.toBeNull();
      expect(organisation.validations.map((each) => each.validates).sort()).toEqual(['accounts', 'operations']);
      expect(organisation.seriesReconciled.length).toBeGreaterThan(0);
      expect(organisation.seriesToReconcile).toBe(0);
    }
    const reconciledA = second.record.organisations
      .find((each) => each.organisationCode === sources[0]?.code)
      ?.seriesReconciled.find((each) => each.seriesId === sources[0]?.batchSeriesId);
    expect(reconciledA).toMatchObject({
      evidenceHighest: lostBatchCode,
      skipped: { from: lostBatchCode, to: lostBatchCode },
    });
  });
});

describe('one Organisation restored alone, from a backup with damaged objects and altered rows', () => {
  let target: { directory: string; env: Record<string, string>; bucket: string };
  let outcome: RestoreCommandOutcome;
  const damaged: Record<'missing' | 'altered' | 'otherKey', string> = { missing: '', altered: '', otherKey: '' };
  let sourceA: { tables: string; objects: string[] };

  beforeAll(async () => {
    const source = sources[1];
    const otherSource = sources[0];
    if (source === undefined || otherSource === undefined) throw new Error('No source');
    // Three more files in Organisation B, attached to its Site.
    const signed = { cookie: source.cookie };
    const keys: string[] = [];
    for (const label of ['missing', 'altered', 'other-key']) {
      const stored = (await storeFile(sourceApi.baseUrl, signed.cookie, label)).json as {
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
    [damaged.missing, damaged.altered, damaged.otherKey] = keys as [string, string, string];
    // GC-9 tests 5 and 8: a sealed audit row altered, and a reference across modules that no longer resolves.
    await query(
      source.database,
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
    sourceA = {
      tables: JSON.stringify(await query(otherSource.database, 'select count(*)::text as n from audit.audit_record')),
      objects: await bucketKeys(minio.bucket, `${otherSource.organisationId}/`),
    };
    const damagedBackup = await takeBackup();
    // The copies in the backup store damaged: one removed, one changed, one sealed under another Organisation key.
    await minio.client.send(new DeleteObjectCommand({ Bucket: backupBucket, Key: `files/${damaged.missing}` }));
    const altered = await objectOf(minio.client, backupBucket, `files/${damaged.altered}`);
    altered[altered.length - 5] = (altered[altered.length - 5] ?? 0) ^ 0xff;
    await minio.client.send(new DeleteObjectCommand({ Bucket: backupBucket, Key: `files/${damaged.altered}` }));
    await minio.client.send(
      new PutObjectCommand({ Bucket: backupBucket, Key: `files/${damaged.altered}`, Body: altered }),
    );
    const nonce = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', randomBytes(32), nonce);
    const body = Buffer.concat([cipher.update(pdf('another-key')), cipher.final()]);
    await minio.client.send(new DeleteObjectCommand({ Bucket: backupBucket, Key: `files/${damaged.otherKey}` }));
    await minio.client.send(
      new PutObjectCommand({
        Bucket: backupBucket,
        Key: `files/${damaged.otherKey}`,
        Body: Buffer.concat([nonce, cipher.getAuthTag(), body]),
      }),
    );
    target = await freshTarget('rt_one');
    outcome = await restore(target.env, [damagedBackup, '--organisation', source.code]);
    await keepTargetDatabases(target.directory);
  });

  it('GC-9 12 test 3 PRD-ACP-019 a restored object missing, altered or encrypted with another key fails the file check, is named in the drill record, and the Organisation stays held', async () => {
    expect(outcome.outcome).toBe('held-with-failed-checks');
    if (outcome.outcome !== 'held-with-failed-checks') throw new Error('Not held');
    const { record, text } = await drillRecordOf(outcome.drillRecord?.json ?? '');
    const checks = record.organisations[0]?.checks ?? [];
    const named = (key: string) => checks.find((check) => check.subject === key && !check.passed);
    expect(named(damaged.missing)?.check).toBe('stored file missing from the file store');
    expect(named(damaged.altered)?.check).toBe('stored file does not open with the key version it names');
    expect(named(damaged.otherKey)?.check).toBe('stored file does not open with the key version it names');
    for (const key of Object.values(damaged)) expect(text).toContain(key);
    const database = outcome.organisations[0]?.databaseName ?? '';
    expect(await query(database, 'select 1 from kernel.recovery_hold')).toHaveLength(1);
  });

  it('GC-9 12 tests 5 and 8 a sealed row altered in the backup is reported, and so is a dangling reference across modules; reopening is refused', async () => {
    if (outcome.outcome !== 'held-with-failed-checks') throw new Error('Not held');
    const database = outcome.organisations[0]?.databaseName ?? '';
    const failed = await query<{ unit: string; name: string }>(
      database,
      "select unit, name from kernel.recovery_event where kind in ('step', 'check') and not passed order by unit, name",
    );
    expect(failed).toEqual(
      expect.arrayContaining([
        { unit: 'audit', name: 'audit seal chain verifies' },
        { unit: 'files-imports', name: 'files_imports.attachment.site_id -> organisation.site' },
      ]),
    );
    const source = sources[1];
    if (source === undefined) throw new Error('No source');
    const targetWorld = {
      directory: target.directory,
      organisations: [
        { ...world.organisations[1], database },
        { ...world.organisations[0], database },
      ] as unknown as SyntheticWorld['organisations'],
      reset: () => Promise.resolve(),
    };
    const api = await startAccessApp(targetWorld, keysEnvironment, {
      fileStoreEnvironment: { ...minio.environment, [FILE_STORE_VARIABLES.bucket]: target.bucket },
    });
    try {
      const operator = await on(api.baseUrl, source, source.recovery);
      const reopen = await send(api.baseUrl, operator.cookie, 'POST', routes.reopenAfterRestore.path, {
        revocationsPlacedAgain: true,
        legalHoldsPlacedAgain: true,
        gapsSettled: true,
      });
      expect(reopen.json).toMatchObject({ error: { code: 'configuration.restore-check-failed' } });
    } finally {
      await api.close();
    }
  });

  it('GC-9 12 test 13 PRD-MOD-001 PRD-ACS-020 restoring one Organisation writes nothing into the other’s databases or objects', async () => {
    const source = sources[1];
    const otherSource = sources[0];
    if (source === undefined || otherSource === undefined) throw new Error('No source');
    expect(
      await query<{ organisation_code: string }>(
        target.directory,
        'select organisation_code from kernel.directory_entry',
      ),
    ).toEqual([{ organisation_code: source.code }]);
    expect(await bucketKeys(target.bucket, `${otherSource.organisationId}/`)).toEqual([]);
    expect((await bucketKeys(target.bucket)).every((key) => key.startsWith(`${source.organisationId}/`))).toBe(true);
    expect(
      JSON.stringify(await query(otherSource.database, 'select count(*)::text as n from audit.audit_record')),
    ).toBe(sourceA.tables);
    expect(await bucketKeys(minio.bucket, `${otherSource.organisationId}/`)).toEqual(sourceA.objects);
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
