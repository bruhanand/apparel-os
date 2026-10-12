import { randomBytes } from 'node:crypto';
import { uuidv7 } from '@apparel-os/domain';
import {
  attachedFileSchema,
  deviceEnrolledSchema,
  recoveryStatusSchema,
  routes,
  type AssignmentScope,
  type RecoveryStatus,
} from '@apparel-os/schemas';
import { CreateBucketCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runBackupCommand } from '../src/backup.js';
import {
  CommandRunner,
  LOCK_STEP,
  newCorrelationId,
  ORGANISATION_ROUTER,
  OrganisationRouter,
  RESTORE_IDENTITY,
  type BackupManifest,
  type DrillRecord,
  type RoutedOrganisation,
  type TransactionContext,
} from '../src/kernel/index.js';
import { ORGANISATION_KEYS_VARIABLE } from '../src/modules/access/index.js';
import { Audit } from '../src/modules/audit/index.js';
import { Exceptions, type ExceptionTypeRegistration } from '../src/modules/exceptions/index.js';
import { FILE_STORE_VARIABLES, FILES_IMPORTS, type FilesImportsInterface } from '../src/modules/files-imports/index.js';
import { Inbox } from '../src/modules/inbox/index.js';
import { Numbering } from '../src/modules/numbering/index.js';
import { BILL_KIND } from '../src/modules/pos/index.js';
import { numberedKinds } from '../src/numbered-kinds.js';
import { restoreRegistry } from '../src/restore-participants.js';
import { runRestoreCommand, type RestoreAnswers, type RestoreCommandOutcome } from '../src/restore.js';
import { RESTORE_IDENTITY_AUTHORITIES } from '../src/restore-steps.js';
import { loadScenarios, runScenario } from './harness/stock/scenario.js';
import {
  codeFor,
  startAccessApp,
  syntheticTimezone,
  SYNTHETIC_ORIGIN,
  writeSyntheticUser,
  type AccessTestApp,
  type SyntheticUser,
} from './support/access.js';
import {
  containerDumpTool,
  containerRestoreTool,
  createBackupBucket,
  objectOf,
  startTargetServer,
  syntheticBackupKey,
  syntheticSigningKey,
  type TargetServer,
} from './support/backup.js';
import { BILL_FORMAT, DEVICE_AUTHORITY, done, nextCode } from './support/billing-devices.js';
import { grantSynthetic } from './support/grants.js';
import { capturingLogger, eventually, writeSyntheticServiceIdentity } from './support/jobs.js';
import { OpeningApp } from './support/opening-app.js';
import { syntheticDeviceKey } from './support/pos.js';
import { connect, databaseUrl } from './support/postgres.js';
import { syntheticCode, syntheticIdentifier, syntheticName } from './fixtures/synthetic.js';

// S1-F14-T04: GC-9 12 test 1, the stage 1 exit check, in CI (backup-and-restore 4.1 to 4.5, 5.1 to 5.4, section 6,
// section 7 and 12 test 1; imports-and-opening-data 17 test 23; numbering-and-audit 7 test 7; stage 1 README 7.1;
// PRD-SEC-012, PRD-ACP-019, POL-18.03, POL-18.04). One SYNTHETIC Organisation holds linked records across the stage 1
// features, made through the real modules and the whole application wherever the harnesses allow: masters (the
// structure, catalogue and books of the stock harness), access changes (a role and its assignment, prepared and
// approved through `access`), imports with stored files (an opening-stock batch on a stored workbook), exceptions
// with evidence (a stored file attached through `exceptions` and `files-imports`), number series (import batch codes,
// exception codes, journal numbers and a device's bills), books and journals and stock movements with valuation (the
// moving-average book story of the stock harness), billing devices (registered and enrolled through the application)
// and opening data (the opening batch posted by its queued job). Every policy's evidence is a file stored through
// `files-imports`. The Organisation is backed up with the real `pg_dump` and restored with the real `pg_restore` into a
// fresh target, a PostgreSQL 17 container of its own and an empty MinIO bucket; then the restore operator reconciles
// every series, SYNTHETIC Operations and Accounts users record their validations, and the Organisation reopens. The
// drill record is read back at the end. Every key, file, user, setting and value here is SYNTHETIC; the recovery time
// is measured, never a target (deployment.md section 4; RR-075 stays OPEN).

const SYNTHETIC_POOL_MAX = 4;
const log = capturingLogger();
const numbering = new Numbering({ kinds: numberedKinds });
const drill = new OpeningApp();
const backupKey = syntheticBackupKey();
const signingKey = syntheticSigningKey();
const logLines: string[] = [];

let target: TargetServer;
let backupBucket: string;
let backupEnvironment: Record<string, string>;
let backupId: string;
let code: string;
let organisationId: string;

/** What the source holds that the checks after the restore look for. */
const source = {
  batchId: '',
  evidenceAttachmentId: '',
  evidenceOwner: undefined as SyntheticUser | undefined,
  billSeriesId: '',
  billsGiven: 0,
};
let recovery: SyntheticUser;
let operations: SyntheticUser;
let accounts: SyntheticUser;

/** Times a phase of the fixture, reported with AOS_RESTORE_DRILL_REPORT=1 (measured, never a target). */
const phases: Record<string, number> = {};
async function phase<T>(name: string, work: () => Promise<T>): Promise<T> {
  const started = Date.now();
  try {
    return await work();
  } finally {
    phases[name] = Date.now() - started;
    if (process.env.AOS_RESTORE_DRILL_REPORT === '1')
      console.log(`AOS_RESTORE_DRILL_PHASE ${name} ${String(phases[name])} ms`);
  }
}

function runner(): CommandRunner {
  return new CommandRunner({ clock: { now: () => new Date() }, timezones: syntheticTimezone, logger: log.logger });
}

async function routedIn(router: OrganisationRouter, organisationCode: string): Promise<RoutedOrganisation> {
  const found = await router.resolveForSignIn(organisationCode);
  if (!found.routed) throw new Error(`${organisationCode} is not routed`);
  return found.organisation;
}

function command<T>(
  routed: RoutedOrganisation,
  actorId: string,
  name: string,
  work: (context: TransactionContext) => Promise<T>,
): Promise<T> {
  return runner().run(
    { commandName: name, organisation: routed, correlationId: newCorrelationId(), actor: { kind: 'actor', actorId } },
    work,
  );
}

/** Masters beyond the harness's: none needed; access changes through `access` (access-and-approvals 4.2, 4.3). */
async function accessChanges(): Promise<void> {
  const { setup } = drill.harness;
  const organisation = drill.harness.world.organisations[0];
  const admin = await writeSyntheticUser(organisation.database, organisation.code, drill.harness.keys(), {
    label: 'DRILL-ACCESS-ADMIN',
  });
  const { assignmentId } = await grantSynthetic(organisation.database, { kind: 'user', id: admin.id }, [
    { recordType: 'access.role', action: 'create' },
    { recordType: 'access.role_assignment', action: 'create' },
  ]);
  const preparer = { userId: admin.id, roleAssignmentId: assignmentId };
  const decider = { actor: { kind: 'user' as const, id: setup.approver.id } };
  const role = await setup.run(admin.id, (c) =>
    setup.access.prepareRole(c, preparer, {
      code: syntheticCode('DRILL-ROLE'),
      name: syntheticName('Drill reader'),
      permissions: [{ kind: 'action', recordType: 'organisation.site', action: 'view', selfService: false }],
      validFrom: setup.today(),
    }),
  );
  if (role.kind !== 'success') throw new Error(`The role was refused: ${role.refusal.code}`);
  const roleApproved = await setup.run(setup.approver.id, (c) =>
    setup.access.approveRoleVersion(c, decider, role.answer.versionId),
  );
  if (roleApproved.kind !== 'success') throw new Error(`The role was not approved: ${roleApproved.refusal.code}`);
  const holder = await writeSyntheticUser(organisation.database, organisation.code, drill.harness.keys(), {
    label: 'DRILL-ROLE-HOLDER',
  });
  const all = { kind: 'all' } as const;
  const scope: AssignmentScope = { kind: 'dimensions', legalEntity: all, place: all, brand: all };
  const assignment = await setup.run(admin.id, (c) =>
    setup.access.prepareAssignment(c, preparer, {
      actor: { kind: 'user', userId: holder.id },
      roleId: role.answer.roleId,
      scope,
      validFrom: setup.today(),
    }),
  );
  if (assignment.kind !== 'success') throw new Error(`The assignment was refused: ${assignment.refusal.code}`);
  const assigned = await setup.run(setup.approver.id, (c) =>
    setup.access.approveAssignment(c, decider, assignment.answer.assignmentId),
  );
  if (assigned.kind !== 'success') throw new Error(`The assignment was not approved: ${assigned.refusal.code}`);
}

/** An opening-stock batch on a stored workbook, verified, Published and posted by its queued job (GC-6 10.6). */
async function openingData(): Promise<void> {
  const { setup } = drill.harness;
  const barcode = drill.next('BC-DRILL');
  const mapped = await setup.asPreparerDo((c, p) =>
    setup.catalogue.mapCode(c, p, {
      code: barcode,
      kind: 'internal',
      scope: { kind: 'organisation' },
      skuId: drill.fixtures.sku.skuId,
      alias: false,
      validFrom: setup.today(),
    }),
  );
  if (mapped.kind !== 'success') throw new Error(`The barcode was refused: ${mapped.refusal.code}`);
  const batchId = await drill.opening([
    drill.manifestRow('SYN-DRILL-1', { barcode, quantity: '4', valuationEvidence: 'SYN invoice 7', unitCost: '12500' }),
  ]);
  const { versionId, decisionId } = await drill.verified(batchId);
  await drill.policyFourteenSigned();
  await drill.switchApproved();
  await drill.worker();
  const queued = await drill.publish(batchId, versionId, decisionId);
  if (queued.status !== 200) throw new Error(`Not queued: ${JSON.stringify(queued.body)}`);
  const requestId = queued.body.publishRequestId as string;
  await eventually(
    async () => (await drill.readBatch(batchId)).outcomes.some((each) => each.publishRequestId === requestId),
    120_000,
  );
  const read = await drill.readBatch(batchId);
  expect(read.batch.state).toBe('Published');
  source.batchId = batchId;
  await drill.stopWorkers();
}

/**
 * A SYNTHETIC exception type of the drill: a mismatch found on an import batch, standing in for a raising module's own
 * (code-house-rules 11.4), so the exception links a real record of `files-imports`.
 */
const DRILL_MODULE = syntheticIdentifier('drill');
const drillMismatch: ExceptionTypeRegistration = {
  code: `${DRILL_MODULE}.import-mismatch`,
  category: 'mismatch',
  module: DRILL_MODULE,
  linksTo: ['files_imports.import_batch'],
  evidenceClasses: [],
  resolutionCheck: () => Promise.resolve({ kind: 'verified' }),
};

/**
 * An exception on the opening batch, routed to the structure's preparer at S1's Site, with a stored file attached as
 * its evidence through `exceptions` and `files-imports` (access-and-approvals 12.1, 12.3; PRD-EXC-001).
 */
async function exceptionWithEvidence(): Promise<void> {
  const { setup } = drill.harness;
  const exceptions = new Exceptions({
    numbering,
    inbox: new Inbox(),
    audit: new Audit(log.logger),
    types: [drillMismatch],
    files: drill.api.app.get<FilesImportsInterface>(FILES_IMPORTS),
  });
  const owner = { userId: setup.preparer.id, roleAssignmentId: setup.asPreparer.roleAssignmentId };
  const routing = await setup.run(owner.userId, (context) =>
    exceptions.prepareRouting(context, owner, {
      typeCode: drillMismatch.code,
      siteId: drill.fixtures.s1.siteId,
      owner: { kind: 'user', userId: owner.userId },
      dueRule: { format: 'elapsed-minutes-v1', minutes: 60 },
      escalation: { kind: 'user', userId: owner.userId },
      validFrom: setup.today(),
      origin: 'synthetic',
    }),
  );
  if (routing.kind !== 'done') throw new Error(routing.refusal.code);
  // Approved as a fixture, as the harness approves its routing (V-03 stays OPEN).
  await approveRoutingFixture(routing.value.versionId);
  const raised = await setup.run(owner.userId, (context) =>
    exceptions.raiseInOwnCommand(context, {
      raisingEvent: `${DRILL_MODULE}.drill:${source.batchId}`,
      typeCode: drillMismatch.code,
      facts: { siteId: drill.fixtures.s1.siteId, storeId: null, businessUnitId: null, brandId: null },
      links: [
        {
          module: 'files-imports',
          recordType: 'files_imports.import_batch',
          recordId: source.batchId,
          versionId: null,
        },
      ],
      exposure: { kind: 'unknown' },
      raisedBy: { kind: 'user', id: owner.userId },
    }),
  );
  if (raised.kind !== 'done') throw new Error(`Not raised: ${raised.refusal.code}`);
  const evidence = await drill.storedFile('exception-evidence');
  const added = await setup.run(owner.userId, (context) =>
    exceptions.addEvidence(
      context,
      { actor: { kind: 'user', id: owner.userId }, roleAssignmentId: owner.roleAssignmentId },
      raised.value.exceptionId,
      [evidence],
    ),
  );
  if (added.kind !== 'done') throw new Error(`No evidence: ${added.refusal.code}`);
  source.evidenceAttachmentId = added.value.attachmentIds[0] ?? '';
  source.evidenceOwner = setup.preparer;
}

async function approveRoutingFixture(versionId: string): Promise<void> {
  const owner = await connect(drill.database, 'migration');
  try {
    await owner.query("update exceptions.exception_routing_version set decision = 'Approved' where id = $1", [
      versionId,
    ]);
  } finally {
    await owner.end();
  }
}

/** A billing device of S1's Store registered and enrolled through the application, with one bill numbered (GC-8 4). */
async function billingDevice(): Promise<void> {
  const { harness } = drill;
  const { setup } = harness;
  await setup.run(setup.preparer.id, async (context) => {
    const formatCode = syntheticCode(`DRILL-BILL-${randomBytes(3).toString('hex').toUpperCase()}`);
    done(await numbering.defineFormatVersion(context, formatCode, BILL_FORMAT));
    done(await numbering.setKindFormat(context, BILL_KIND.kind, formatCode, 'synthetic'));
    done(
      await numbering.defineFinancialYear(context, {
        label: syntheticCode(`DRILL-FY-${randomBytes(3).toString('hex').toUpperCase()}`),
        firstDay: setup.day(-30),
        lastDay: setup.day(300),
        origin: 'synthetic',
      }),
    );
  });
  const admin = await drill.enrolled('DRILL-DEVICE-ADMIN', DEVICE_AUTHORITY, undefined, ['P-ADM']);
  const storeId = await harness.storeOf(drill.fixtures.s1.businessUnitId);
  const registered = await drill.ok(admin, 'POST', '/api/pos/billing-devices', {
    code: nextCode('DRILL-TILL'),
    label: syntheticName('Drill till'),
    storeId,
    businessUnitIds: [drill.fixtures.s1.businessUnitId],
  });
  const deviceId = registered.body.deviceId as string;
  const key = await syntheticDeviceKey(code);
  const challenge = await fetch(`${drill.api.baseUrl}/api/access/device-challenges`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: SYNTHETIC_ORIGIN },
    body: JSON.stringify({ organisationCode: code }),
  });
  const issued = (await challenge.json()) as { challengeId: string; challenge: string };
  const enrolled = await drill.ok(admin, 'POST', `/api/pos/billing-devices/${deviceId}/enrolment`, {
    publicKey: key.publicKey,
    challengeId: issued.challengeId,
    signature: await key.sign('enrol', deviceId, issued.challenge),
    totpCode: drill.freshCode(admin),
  });
  const series = deviceEnrolledSchema.parse(enrolled.body).series[0]?.seriesId ?? '';
  const given = await setup.run(setup.preparer.id, async (context) => {
    await context.lock(LOCK_STEP.numberSeries, [numbering.seriesLockTarget(series)]);
    return done(
      await numbering.allocate(context, {
        seriesId: series,
        documentType: 'test-synthetic.bill',
        documentId: uuidv7(),
      }),
    );
  });
  source.billSeriesId = series;
  source.billsGiven = given.sequenceNumber;
}

/** The restore operator, and the SYNTHETIC Operations and Accounts users who validate (GC9-6 stays OPEN). */
async function recoveryPeople(): Promise<void> {
  const organisation = drill.harness.world.organisations[0];
  const write = (label: string) =>
    writeSyntheticUser(organisation.database, organisation.code, drill.harness.keys(), { label, enrolled: true });
  recovery = await write('DRILL-RECOVERY');
  await grantSynthetic(organisation.database, { kind: 'user', id: recovery.id }, [
    { recordType: 'kernel.recovery_event', action: 'view' },
    { recordType: 'configuration.series_reconciliation', action: 'create' },
    { recordType: 'configuration.reopening', action: 'create' },
  ]);
  operations = await write('DRILL-OPERATIONS');
  accounts = await write('DRILL-ACCOUNTS');
  for (const validator of [operations, accounts]) {
    await grantSynthetic(organisation.database, { kind: 'user', id: validator.id }, [
      { recordType: 'configuration.recovery_validation', action: 'create' },
    ]);
  }
  await grantSynthetic(organisation.database, { kind: 'user', id: operations.id }, [
    { recordType: 'files_imports.stored_file', action: 'create' },
  ]);
}

beforeAll(async () => {
  await phase('start', () => drill.start('drill', { restorable: true }));
  const organisation = drill.harness.world.organisations[0];
  code = organisation.code;
  // Books and journals, stock movements with valuation: the moving-average book story, posted step by step through
  // the ledger and the books (stock-ledger 11.2 to 11.6; books-and-posting 15 test 1).
  const story = loadScenarios().find(
    ({ scenario }) => scenario.combination.formula === 'moving-average' && scenario.combination.poolMode === 'book',
  );
  if (story === undefined) throw new Error('No moving-average book story');
  await phase('story', () => runScenario(drill.harness, story.scenario));
  await phase('opening data', openingData);
  await phase('exception with evidence', exceptionWithEvidence);
  await phase('access changes', accessChanges);
  await phase('billing device', billingDevice);
  await phase('recovery people', recoveryPeople);
  const router = drill.api.app.get<OrganisationRouter>(ORGANISATION_ROUTER);
  const routed = await routedIn(router, code);
  if (routed.organisationId === undefined) throw new Error('No Organisation identifier');
  organisationId = routed.organisationId;
  // One audit block sealed, so the restored chain can be followed to the manifest's seal (5.4).
  await command(routed, recovery.id, 'audit.synthetic-seal', (context) =>
    new Audit(log.logger).sealClosedBlock(context),
  );
  for (const each of drill.harness.world.organisations) {
    await writeSyntheticServiceIdentity(each.database, RESTORE_IDENTITY, RESTORE_IDENTITY_AUTHORITIES);
  }
  target = await startTargetServer();
  backupBucket = `syn-drill-${uuidv7().slice(-8)}`;
  backupEnvironment = {
    AOS_MIGRATION_DATABASE_URL: databaseUrl(drill.harness.world.directory, 'migration'),
    AOS_ENVIRONMENT: 'local',
    AOS_BACKUP_PUBLIC_KEY: backupKey.publicText,
    ...signingKey.backupRunner,
    ...(await createBackupBucket(drill.fileStore.client, drill.fileStore.environment, backupBucket)),
    ...drill.fileStore.environment,
  };
  const taken = await phase('backup', () =>
    runBackupCommand({
      env: backupEnvironment,
      args: [],
      dumpTool: containerDumpTool,
      log: (message) => logLines.push(message),
    }),
  );
  if (taken.outcome !== 'complete') throw new Error(`The backup was not complete: ${JSON.stringify(taken)}`);
  backupId = taken.backupId;
}, 1_200_000);

afterAll(async () => {
  await (target as TargetServer | undefined)?.stop();
  await drill.stop();
});

async function manifestOf(id: string): Promise<BackupManifest> {
  const name = `backups/${id}/manifest`;
  return JSON.parse(
    backupKey.privateKey.open(name, await objectOf(drill.fileStore.client, backupBucket, name)).toString('utf8'),
  ) as BackupManifest;
}

async function drillRecordOf(name: string): Promise<{ record: DrillRecord; text: string }> {
  const json = (await objectOf(drill.fileStore.client, backupBucket, name)).toString('utf8');
  const text = (await objectOf(drill.fileStore.client, backupBucket, name.replace(/\.json$/, '.txt'))).toString('utf8');
  return { record: JSON.parse(json) as DrillRecord, text };
}

async function bucketKeys(bucket: string, prefix: string): Promise<string[]> {
  const found: string[] = [];
  let token: string | undefined;
  do {
    const page = await drill.fileStore.client.send(
      new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ContinuationToken: token }),
    );
    for (const object of page.Contents ?? []) if (object.Key !== undefined) found.push(object.Key);
    token = page.NextContinuationToken;
  } while (token !== undefined);
  return found.sort();
}

describe('GC-9 12 test 1: the stage 1 exit check, a synthetic Organisation backed up and restored into a fresh target', () => {
  let directory: string;
  let bucket: string;
  let env: Record<string, string>;
  let outcome: RestoreCommandOutcome;
  let database: string;
  let api: AccessTestApp;
  let router: OrganisationRouter;
  const cookies = new Map<string, string>();

  const answers = (): Promise<RestoreAnswers> =>
    Promise.resolve({
      purpose: { kind: 'drill', note: 'SYNTHETIC drill: GC-9 12 test 1 in CI' },
      conductedBy: 'SYNTHETIC operator, platform (CI)',
      privateKeyText: backupKey.privateText,
      organisationKeysText: drill.harness.keys()[ORGANISATION_KEYS_VARIABLE] ?? '',
    });

  async function restore(args: string[]): Promise<RestoreCommandOutcome> {
    const answer = await runRestoreCommand({
      env,
      args,
      answers,
      restoreTool: containerRestoreTool(target.containerId),
      timezones: syntheticTimezone,
      logger: log.logger,
      log: (message) => logLines.push(message),
    });
    logLines.push(JSON.stringify(answer));
    return answer;
  }

  async function on(user: SyntheticUser): Promise<string> {
    const kept = cookies.get(user.id);
    if (kept !== undefined) return kept;
    const response = await fetch(`${api.baseUrl}/api/access/sign-in`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: SYNTHETIC_ORIGIN, 'x-forwarded-for': '10.9.14.4' },
      body: JSON.stringify({
        organisationCode: code,
        login: user.login,
        password: user.password,
        totpCode: codeFor(user.factorSecret ?? Buffer.alloc(0)),
      }),
    });
    expect(response.status, `${user.login} signs in to the restored application`).toBe(200);
    const cookie = (response.headers.get('set-cookie') ?? '').split(';')[0] ?? '';
    cookies.set(user.id, cookie);
    return cookie;
  }

  async function send(
    user: SyntheticUser,
    method: 'GET' | 'POST',
    path: string,
    body?: unknown,
  ): Promise<{ status: number; json: unknown }> {
    const response = await fetch(`${api.baseUrl}${path}`, {
      method,
      headers: {
        cookie: await on(user),
        origin: SYNTHETIC_ORIGIN,
        ...(method === 'POST' ? { 'content-type': 'application/json', 'idempotency-key': uuidv7() } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const text = await response.text();
    return { status: response.status, json: text === '' ? null : (JSON.parse(text) as unknown) };
  }

  function storeFile(): Promise<{ status: number; json: unknown }> {
    const pdf = Buffer.from('%PDF-1.4\n% SYNTHETIC after the drill\n%%EOF\n', 'latin1');
    return send(operations, 'POST', '/api/files-imports/files', {
      sourceSystem: 'manual-upload',
      originalName: 'SYNTHETIC-after-the-drill.pdf',
      contentBase64: pdf.toString('base64'),
    });
  }

  async function status(): Promise<NonNullable<RecoveryStatus['restore']>> {
    const read = recoveryStatusSchema.parse((await send(recovery, 'GET', routes.readRecoveryStatus.path)).json);
    if (read.restore === null) throw new Error('No restore');
    return read.restore;
  }

  beforeAll(async () => {
    await target.clear();
    directory = await target.createDirectory('rt_drill');
    bucket = `syn-drill-target-${randomBytes(4).toString('hex')}`;
    await drill.fileStore.client.send(new CreateBucketCommand({ Bucket: bucket }));
    env = {
      ...Object.fromEntries(Object.entries(backupEnvironment).filter(([name]) => name !== 'AOS_BACKUP_SIGNING_KEY')),
      ...signingKey.restoreRunner,
      ...drill.fileStore.environment,
      [FILE_STORE_VARIABLES.bucket]: bucket,
      AOS_MIGRATION_DATABASE_URL: target.url(directory, 'migration'),
      AOS_RUNTIME_DATABASE_URL: target.url(directory, 'runtime'),
    };
    outcome = await phase('restore', () => restore([backupId, '--organisation', code]));
    if (outcome.outcome !== 'held') {
      const failed =
        outcome.outcome === 'held-with-failed-checks'
          ? await target.query(
              outcome.organisations[0]?.databaseName ?? '',
              "select unit, name, subject, checked, failed from kernel.recovery_event where kind in ('step', 'check') and not passed",
            )
          : [];
      throw new Error(`Not held: ${JSON.stringify(outcome)} ${JSON.stringify(failed)}`);
    }
    database = outcome.organisations[0]?.databaseName ?? '';
    const restoredWorld = {
      directory,
      organisations: drill.harness.world.organisations.map((each) =>
        each.code === code ? { ...each, database } : each,
      ) as unknown as typeof drill.harness.world.organisations,
      reset: () => Promise.resolve(),
    };
    api = await startAccessApp(restoredWorld, drill.harness.keys(), {
      fileStoreEnvironment: { ...drill.fileStore.environment, [FILE_STORE_VARIABLES.bucket]: bucket },
      directoryRuntimeUrl: target.url(directory, 'runtime'),
    });
    router = new OrganisationRouter(
      { directoryConnectionString: target.url(directory, 'runtime'), poolMax: SYNTHETIC_POOL_MAX },
      log.logger,
    );
  }, 600_000);

  afterAll(async () => {
    await (api as AccessTestApp | undefined)?.close();
    await (router as OrganisationRouter | undefined)?.close();
  });

  it('PRD-SEC-012 the backup holds records of every stage 1 feature, linked, with their stored files', async () => {
    const part = (await manifestOf(backupId)).organisations.find((each) => each.organisationCode === code);
    if (part === undefined) throw new Error('No part');
    const rows = new Map(
      part.controlTotals.flatMap((each) => each.totals).map((total) => [total.name, Number(total.value)]),
    );
    const held = (table: string) => rows.get(`${table}.rows`) ?? 0;
    for (const table of [
      // Masters.
      'organisation.legal_entity',
      'organisation.site',
      'organisation.store',
      'organisation.business_unit',
      'organisation.accounting_book',
      'merchandise.sku',
      'merchandise.external_code',
      // Access changes.
      'access.role_version',
      'access.role_assignment',
      'access.approval_decision',
      // Imports with stored files and attachments.
      'files_imports.stored_file',
      'files_imports.file_receipt',
      'files_imports.attachment',
      'files_imports.import_batch',
      'files_imports.publish_request',
      // Exceptions with evidence.
      'exceptions.exception',
      'exceptions.exception_event',
      // Number series.
      'numbering.series',
      'numbering.allocation',
      // Books and journals.
      'finance.account',
      'finance.journal',
      'finance.journal_line',
      // Stock movements with valuation.
      'stock.movement',
      'stock.movement_leg',
      'stock.cost_pool',
      'stock.valuation',
      // Billing devices.
      'pos.billing_device',
      'pos.billing_device_unit',
      'access.device',
      // Opening data, and the policies signed with their evidence.
      'configuration.policy_signature',
      'configuration.policy_validation',
      'audit.audit_seal',
    ]) {
      expect(held(table), table).toBeGreaterThan(0);
    }
    expect(part.latestSeal).not.toBeNull();
    expect(rows.get('finance.journal_line.amount_paise.sum') ?? 0).toBeGreaterThan(0);
    // Every stored file's object is in the backup store (3.3).
    const objects = await bucketKeys(backupBucket, `files/${organisationId}/`);
    expect(objects.length).toBe(held('files_imports.stored_file'));
  });

  it('GC-9 12 test 1 PRD-ACP-019 restores into a fresh target and holds the Organisation with every check of 5.1 passed', async () => {
    expect(outcome.outcome).toBe('held');
    expect(await target.query(database, 'select restore_id from kernel.recovery_hold')).toHaveLength(1);
    const results = await target.query<{ unit: string; name: string; passed: boolean; checked: string }>(
      database,
      "select unit, name, passed, checked::text from kernel.recovery_event where kind in ('step', 'check')",
    );
    expect(results.filter((each) => !each.passed)).toEqual([]);
    const named = (name: string) => results.find((each) => each.name === name);
    // Stored files and attachments, every one the backup holds (5.1; imports-and-opening-data 17 test 23).
    const part = (await manifestOf(backupId)).organisations.find((each) => each.organisationCode === code);
    const held = (table: string) =>
      Number(part?.controlTotals.flatMap((each) => each.totals).find((total) => total.name === `${table}.rows`)?.value);
    const files = named('every stored file is in the file store, opens with its key version and matches its hash');
    expect(Number(files?.checked)).toBe(held('files_imports.stored_file'));
    const attachments = named(
      'every attachment opens from its record for an authorised reader and is refused outside its scope',
    );
    expect(Number(attachments?.checked)).toBe(held('files_imports.attachment'));
    // Numbering, audit and the module invariants, each counting what it checked.
    expect(named('every series paused')?.passed).toBe(true);
    expect(named('audit seal chain verifies')?.passed).toBe(true);
    expect(named('audit seal chain ends at the manifest seal')?.passed).toBe(true);
    expect(Number(named('every journal balances')?.checked)).toBeGreaterThan(0);
    expect(Number(named('stock balances equal the sum of their movements')?.checked)).toBeGreaterThan(0);
    // The references across modules were followed, the evidence's to its exception and the policy's included.
    expect(Number(named('files_imports.attachment.record_id -> exceptions.exception')?.checked)).toBe(1);
    expect(Number(named('files_imports.attachment.record_id -> configuration.policy_status')?.checked)).toBe(3);
    expect(Number(named('exceptions.exception_link.record_id -> files_imports.import_batch')?.checked)).toBe(1);
    expect(named('every session ended after the restore')?.passed).toBe(true);
    // No object without a record: nothing was stored after the snapshot.
    const gaps = await target.query(database, "select 1 from kernel.recovery_event where kind = 'gap'");
    expect(gaps).toEqual([]);
  });

  it('GC-9 12 test 1 PRD-ACP-019 every control total of 5.2 equals the backup’s, for every module', async () => {
    const totals = await target.query<{ unit: string; passed: boolean; checked: string }>(
      database,
      "select unit, passed, checked::text from kernel.recovery_event where name = 'control totals equal the backup'",
    );
    expect(totals.map((each) => each.unit).sort()).toEqual(
      restoreRegistry.participants.map((participant) => participant.unit).sort(),
    );
    const part = (await manifestOf(backupId)).organisations.find((each) => each.organisationCode === code);
    for (const each of totals) {
      expect(each.passed, each.unit).toBe(true);
      const expected = part?.controlTotals.find((unit) => unit.unit === each.unit)?.totals.length ?? 0;
      expect(Number(each.checked), each.unit).toBe(expected);
    }
  });

  it('PRD-SEC-005 imports-and-opening-data 17 test 23 the exception’s evidence opens from its record through the restored application, matching its hash', async () => {
    const owner = source.evidenceOwner;
    if (owner === undefined) throw new Error('No owner');
    const read = await send(owner, 'GET', `/api/files-imports/attachments/${source.evidenceAttachmentId}/file`);
    expect(read.status, JSON.stringify(read.json)).toBe(200);
    const file = attachedFileSchema.parse(read.json);
    expect(Buffer.from(file.contentBase64, 'base64').toString('latin1')).toContain('SYNTHETIC exception-evidence');
    // A person with no grant on the exception is refused.
    expect(
      (await send(operations, 'GET', `/api/files-imports/attachments/${source.evidenceAttachmentId}/file`)).status,
    ).toBe(404);
  });

  it('POL-18.04 numbering-and-audit 7 test 7 every series stays paused until it is reconciled; a reconciliation sets the next bill past the evidence', async () => {
    const restored = await status();
    expect(restored.seriesToReconcile.map((each) => each.seriesId)).toContain(source.billSeriesId);
    expect(restored.seriesToReconcile.length).toBeGreaterThanOrEqual(4);
    const routed = await routedIn(router, code);
    const allocate = (seriesId: string) =>
      command(routed, recovery.id, 'configuration.reconcile-series-after-restore', async (context) => {
        await context.lock(LOCK_STEP.numberSeries, [numbering.seriesLockTarget(seriesId)]);
        return numbering.allocate(context, { seriesId, documentType: 'test-synthetic.bill', documentId: uuidv7() });
      });
    for (const each of restored.seriesToReconcile) {
      expect(await allocate(each.seriesId)).toMatchObject({
        kind: 'refused',
        refusal: { code: 'numbering.series-paused' },
      });
    }
    // Reopening waits for them (4.3).
    const early = await send(recovery, 'POST', routes.reopenAfterRestore.path, {
      revocationsPlacedAgain: true,
      legalHoldsPlacedAgain: true,
    });
    expect(early.status).toBe(422);
    // The device's bill series: the counter's evidence names the bill it printed (5.3).
    const evidenceHighest = source.billsGiven + 1;
    const bill = await send(
      recovery,
      'POST',
      routes.reconcileSeriesAfterRestore.path.replace('{seriesId}', source.billSeriesId),
      {
        evidence: 'SYNTHETIC: the counter’s record shows one more bill printed after the recovery point',
        evidenceHighest,
        reason: 'SYNTHETIC drill',
      },
    );
    expect(bill.json).toEqual({
      seriesId: source.billSeriesId,
      restoredHighest: source.billsGiven,
      nextSequenceBefore: source.billsGiven + 1,
      nextSequenceAfter: evidenceHighest + 1,
    });
    for (const each of (await status()).seriesToReconcile) {
      const answer = await send(
        recovery,
        'POST',
        routes.reconcileSeriesAfterRestore.path.replace('{seriesId}', each.seriesId),
        { evidence: 'SYNTHETIC: no document left the system', evidenceHighest: null, reason: 'SYNTHETIC drill' },
      );
      expect(answer.status, JSON.stringify(answer.json)).toBe(200);
    }
    expect((await status()).seriesToReconcile).toEqual([]);
    // No number is given twice: the next bill is past the evidence.
    expect(await allocate(source.billSeriesId)).toMatchObject({
      kind: 'done',
      value: { sequenceNumber: evidenceHighest + 1 },
    });
  });

  it('POL-18.03 synthetic Operations and Accounts users record their validations, and the Organisation reopens', async () => {
    // No gap and no failed check to raise (4.5, 5.1).
    if (outcome.outcome !== 'held') throw new Error('Not held');
    expect(await restore(['--raise-gaps', outcome.restoreId])).toMatchObject({
      outcome: 'raised',
      organisations: [{ organisationCode: code, count: 0, refusals: [] }],
    });
    for (const [user, body] of [
      [operations, { validates: 'operations', compared: ['stock', 'bills'] }],
      [accounts, { validates: 'accounts', compared: ['financial-totals'] }],
    ] as const) {
      const answer = await send(user, 'POST', routes.recordRecoveryValidation.path, {
        ...body,
        comparedAgainst: 'SYNTHETIC: the source’s totals before the drill',
        evidence: 'SYNTHETIC: the drill notes',
      });
      expect(answer.status, JSON.stringify(answer.json)).toBe(200);
    }
    // Under the hold a business command is refused, naming the hold (4.3; POL-18.03).
    const held = await storeFile();
    expect(held.status).toBe(403);
    expect(held.json).toMatchObject({ error: { code: 'kernel.recovery-hold' } });
    const reopened = await send(recovery, 'POST', routes.reopenAfterRestore.path, {
      revocationsPlacedAgain: true,
      legalHoldsPlacedAgain: true,
    });
    expect(reopened.status, JSON.stringify(reopened.json)).toBe(200);
    expect(await target.query(database, 'select 1 from kernel.recovery_hold')).toEqual([]);
    // A business command runs again: Operations stores a file, which the hold refused before.
    const stored = await storeFile();
    expect(stored.status, JSON.stringify(stored.json)).toBe(200);
  });

  it('section 6 the drill record holds every step with its times, who conducted it, every result, the key versions and the measured recovery time', async () => {
    if (outcome.outcome !== 'held') throw new Error('Not held');
    const written = await restore(['--drill-record', outcome.restoreId]);
    expect(written).toMatchObject({ outcome: 'written', result: 'reopened' });
    if (written.outcome !== 'written') throw new Error('Not written');
    const { record, text } = await drillRecordOf(written.json);
    expect(record).toMatchObject({
      purpose: { kind: 'drill' },
      conductedBy: 'SYNTHETIC operator, platform (CI)',
      result: 'reopened',
      backup: { backupId },
    });
    expect(record.steps.map((step) => step.step)).toEqual(
      expect.arrayContaining([
        'restore the database',
        'migrate the database',
        'compare the control totals with the backup',
        'place the recovery hold',
        'point the directory at the target',
        'copy the file objects',
        'run the restore participants',
      ]),
    );
    for (const step of record.steps) {
      expect(step.outcome, step.step).toBe('done');
      expect(Date.parse(step.endedAt)).toBeGreaterThanOrEqual(Date.parse(step.startedAt));
    }
    const [organisation] = record.organisations;
    if (organisation === undefined) throw new Error('No Organisation');
    expect(organisation.checks.filter((check) => !check.passed)).toEqual([]);
    expect(organisation.checks.map((check) => check.check)).toEqual(
      expect.arrayContaining([
        'every stored file is in the file store, opens with its key version and matches its hash',
        'every attachment opens from its record for an authorised reader and is refused outside its scope',
        'audit seal chain verifies',
        'audit seal chain ends at the manifest seal',
        'control totals equal the backup',
        'every series paused',
      ]),
    );
    expect(organisation.validations.map((each) => each.validates).sort()).toEqual(['accounts', 'operations']);
    expect(organisation.seriesToReconcile).toBe(0);
    expect(organisation.seriesReconciled.find((each) => each.seriesId === source.billSeriesId)).toMatchObject({
      skipped: { from: source.billsGiven + 1, to: source.billsGiven + 1 },
    });
    expect(organisation.reopened).not.toBeNull();
    expect(record.keyVersions.length).toBeGreaterThanOrEqual(2);
    expect(record.keyVersions.every((key) => key.fromKeptCopy && key.matchedIdentifier)).toBe(true);
    expect(record.keyVersions.map((key) => key.purpose).sort()).toEqual(['backup', 'organisation-data']);
    // Measured, never promised (deployment.md section 4; RR-075 stays OPEN).
    const seconds = record.measured.recoveryTimeSeconds;
    expect(seconds).not.toBeNull();
    expect(text).toContain(`Recovery time: ${String(seconds)} s`);
    if (process.env.AOS_RESTORE_DRILL_REPORT === '1') {
      console.log(
        `AOS_RESTORE_DRILL_REPORT ${JSON.stringify({ recoveryTimeSeconds: seconds, phases, steps: record.steps })}`,
      );
    }
  });

  it('GC-9 12 test 17 PRD-SEC-014 the drill records and the logs hold no key, no secret and no connection string', async () => {
    const keys = Object.values(
      JSON.parse(drill.harness.keys()[ORGANISATION_KEYS_VARIABLE] ?? '{}') as Record<string, string>,
    );
    const forbidden = [
      backupKey.privateText,
      ...Object.values(signingKey.backupRunner),
      ...keys,
      databaseUrl(drill.harness.world.directory, 'migration'),
      target.url(directory, 'migration'),
      recovery.password,
    ];
    const records = (await bucketKeys(backupBucket, `backups/${backupId}/restores/`)).filter((key) =>
      key.includes('/drill-record-'),
    );
    expect(records.length).toBeGreaterThanOrEqual(2);
    const texts = [
      logLines.join('\n'),
      JSON.stringify(log.lines),
      ...(await Promise.all(
        records.map(async (key) => (await objectOf(drill.fileStore.client, backupBucket, key)).toString('utf8')),
      )),
    ];
    for (const each of texts) for (const value of forbidden) expect(each.includes(value)).toBe(false);
  });
});
