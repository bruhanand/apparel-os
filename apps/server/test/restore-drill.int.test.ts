import { randomBytes } from 'node:crypto';
import { uuidv7 } from '@apparel-os/domain';
import {
  attachedFileSchema,
  deviceEnrolledSchema,
  recoveryReopenedSchema,
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
  type OrganisationPart,
  type RoutedOrganisation,
  type TransactionContext,
} from '../src/kernel/index.js';
import { base32 } from '../src/modules/access/domain/totp.js';
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
import {
  callAs,
  OpeningApp,
  signInTo,
  STORE_FILE_PATH,
  syntheticPdfUpload,
  type Answer,
} from './support/opening-app.js';
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
const drill = new OpeningApp({ restorable: true });
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
  exceptionId: '',
  evidenceAttachmentId: '',
  evidenceOwner: undefined as SyntheticUser | undefined,
  billSeriesId: '',
  billsGiven: 0,
  roleId: '',
  roleCode: '',
  assignmentId: '',
  holderId: '',
  /** The attachments of policy evidence, to a signature and to a validation, counted in the source before the backup. */
  policyEvidence: { signature: 0, validation: 0 },
};
/** Every SYNTHETIC user this file writes itself, whose secrets no log or drill record may hold. */
const people: SyntheticUser[] = [];
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
  people.push(admin);
  const { assignmentId } = await grantSynthetic(organisation.database, { kind: 'user', id: admin.id }, [
    { recordType: 'access.role', action: 'create' },
    { recordType: 'access.role_assignment', action: 'create' },
  ]);
  const preparer = { userId: admin.id, roleAssignmentId: assignmentId };
  const decider = { actor: { kind: 'user' as const, id: setup.approver.id } };
  const roleCode = syntheticCode('DRILL-ROLE');
  const role = await setup.run(admin.id, (c) =>
    setup.access.prepareRole(c, preparer, {
      code: roleCode,
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
  people.push(holder);
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
  source.roleId = role.answer.roleId;
  source.roleCode = roleCode;
  source.assignmentId = assignment.answer.assignmentId;
  source.holderId = holder.id;
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
  source.exceptionId = raised.value.exceptionId;
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

/** How many evidence files the source attached to a policy signature and to a policy validation. */
async function policyEvidenceAttached(): Promise<{ signature: number; validation: number }> {
  const owner = await connect(drill.database, 'migration');
  try {
    const counted = await owner.query<{ record_type: string; n: string }>(
      `select record_type, count(*)::text as n from files_imports.attachment
       where record_type in ('configuration.policy_status', 'configuration.policy_validation') group by record_type`,
    );
    const of = (type: string) => Number(counted.rows.find((row) => row.record_type === type)?.n ?? 0);
    return { signature: of('configuration.policy_status'), validation: of('configuration.policy_validation') };
  } finally {
    await owner.end();
  }
}

/** The restore operator, and the SYNTHETIC Operations and Accounts users who validate (GC9-6 stays OPEN). */
async function recoveryPeople(): Promise<void> {
  const organisation = drill.harness.world.organisations[0];
  const write = async (label: string) => {
    const user = await writeSyntheticUser(organisation.database, organisation.code, drill.harness.keys(), {
      label,
      enrolled: true,
    });
    people.push(user);
    return user;
  };
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
  await phase('start', () => drill.start('drill'));
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
  // The policy evidence the source holds, by the record type it is attached to, so the restore's reference checks can
  // be held to exactly what was attached (5.1).
  source.policyEvidence = await policyEvidenceAttached();
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

/** The row count a manifest part holds for a table; a missing total is a defect of the backup, never zero. */
function rowsHeld(part: OrganisationPart, table: string): number {
  const total = part.controlTotals.flatMap((each) => each.totals).find((each) => each.name === `${table}.rows`);
  if (total === undefined) throw new Error(`The backup holds no row count of ${table}`);
  return Number(total.value);
}

/** What the restored database's recovery events say of one check or step. */
interface RecoveryEventRow extends Record<string, unknown> {
  readonly unit: string;
  readonly name: string;
  readonly subject: string | null;
  readonly passed: boolean;
  readonly checked: string;
  readonly failed: string;
}

describe('GC-9 12 test 1: the stage 1 exit check, a synthetic Organisation backed up and restored into a fresh target', () => {
  // The restore and everything the recovery people do after it run once, in order, in beforeAll; each `it` only reads
  // what was found, so each passes or fails on its own (code-house-rules 10.1).
  let manifest: BackupManifest;
  let part: OrganisationPart;
  let directory: string;
  let bucket: string;
  let env: Record<string, string>;
  let outcome: RestoreCommandOutcome;
  let database: string;
  let api: AccessTestApp;
  let router: OrganisationRouter;
  const cookies = new Map<string, string>();
  /** What the restore and the recovery people's steps found, read by the tests below. */
  const found = {
    events: [] as RecoveryEventRow[],
    holds: 0,
    gapsAtRestore: 0,
    role: [] as { id: string; code: string; decision: string }[],
    assignment: [] as { id: string; role_id: string; app_user_id: string; decision: string }[],
    batch: [] as { id: string; state: string }[],
    exception: [] as { id: string }[],
    evidenceForOwner: undefined as Answer | undefined,
    evidenceForOther: undefined as Answer | undefined,
    seriesBefore: [] as string[],
    allocationsWhilePaused: [] as unknown[],
    earlyReopen: undefined as Answer | undefined,
    billReconciled: undefined as Answer | undefined,
    otherReconciled: [] as Answer[],
    seriesAfter: [] as string[],
    allocationAfter: undefined as unknown,
    raised: undefined as RestoreCommandOutcome | undefined,
    validations: [] as Answer[],
    validationsBetween: { from: '', to: '' },
    storedUnderHold: undefined as Answer | undefined,
    reopened: undefined as Answer | undefined,
    holdsAfter: 0,
    storedAfter: undefined as Answer | undefined,
    written: undefined as RestoreCommandOutcome | undefined,
    record: undefined as DrillRecord | undefined,
    text: '',
  };

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

  /** Calls the restored application as the user, signing in once (OpeningApp's sign-in and call). */
  async function send(user: SyntheticUser, method: 'GET' | 'POST', path: string, body?: unknown): Promise<Answer> {
    let cookie = cookies.get(user.id);
    if (cookie === undefined) {
      cookie = await signInTo(api.baseUrl, code, user);
      cookies.set(user.id, cookie);
    }
    return callAs(api.baseUrl, cookie, method, path, body);
  }

  const storeFile = () => send(operations, 'POST', STORE_FILE_PATH, syntheticPdfUpload('after-the-drill', uuidv7()));

  async function status(): Promise<NonNullable<RecoveryStatus['restore']>> {
    const read = recoveryStatusSchema.parse((await send(recovery, 'GET', routes.readRecoveryStatus.path)).body);
    if (read.restore === null) throw new Error('No restore');
    return read.restore;
  }

  /** Restores the backup into the fresh target and starts the application on it. */
  async function restoreIntoTarget(): Promise<void> {
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
  }

  /** What the restore left, read before anyone acts on the restored Organisation. */
  async function readRestored(): Promise<void> {
    found.events = await target.query<RecoveryEventRow>(
      database,
      "select unit, name, subject, passed, checked::text, failed::text from kernel.recovery_event where kind in ('step', 'check')",
    );
    found.holds = (await target.query(database, 'select restore_id from kernel.recovery_hold')).length;
    found.gapsAtRestore = (
      await target.query(database, "select 1 from kernel.recovery_event where kind = 'gap'")
    ).length;
    found.role = await target.query(
      database,
      'select r.id, r.code, v.decision from access.role r join access.role_version v on v.role_id = r.id where r.id = $1',
      [source.roleId],
    );
    found.assignment = await target.query(
      database,
      'select id, role_id, app_user_id, decision from access.role_assignment where id = $1',
      [source.assignmentId],
    );
    found.batch = await target.query(database, 'select id, state from files_imports.import_batch where id = $1', [
      source.batchId,
    ]);
    found.exception = await target.query(database, 'select id from exceptions.exception where id = $1', [
      source.exceptionId,
    ]);
    // The exception's evidence, read under the hold through the restored application (imports 17 test 23).
    const owner = source.evidenceOwner;
    if (owner === undefined) throw new Error('No owner');
    const path = `/api/files-imports/attachments/${source.evidenceAttachmentId}/file`;
    found.evidenceForOwner = await send(owner, 'GET', path);
    found.evidenceForOther = await send(operations, 'GET', path);
  }

  /** The restore operator reconciles every series, the bill series past the counter's evidence (5.3; GC-5 7 test 7). */
  async function reconcileSeries(): Promise<void> {
    const restored = await status();
    found.seriesBefore = restored.seriesToReconcile.map((each) => each.seriesId);
    const routed = await routedIn(router, code);
    const allocate = (seriesId: string) =>
      command(routed, recovery.id, 'configuration.reconcile-series-after-restore', async (context) => {
        await context.lock(LOCK_STEP.numberSeries, [numbering.seriesLockTarget(seriesId)]);
        return numbering.allocate(context, { seriesId, documentType: 'test-synthetic.bill', documentId: uuidv7() });
      });
    for (const seriesId of found.seriesBefore) found.allocationsWhilePaused.push(await allocate(seriesId));
    found.earlyReopen = await send(recovery, 'POST', routes.reopenAfterRestore.path, {
      revocationsPlacedAgain: true,
      legalHoldsPlacedAgain: true,
    });
    const reconcile = (seriesId: string, body: unknown) =>
      send(recovery, 'POST', routes.reconcileSeriesAfterRestore.path.replace('{seriesId}', seriesId), body);
    found.billReconciled = await reconcile(source.billSeriesId, {
      evidence: 'SYNTHETIC: the counter’s record shows one more bill printed after the recovery point',
      evidenceHighest: source.billsGiven + 1,
      reason: 'SYNTHETIC drill',
    });
    for (const each of (await status()).seriesToReconcile) {
      found.otherReconciled.push(
        await reconcile(each.seriesId, {
          evidence: 'SYNTHETIC: no document left the system',
          evidenceHighest: null,
          reason: 'SYNTHETIC drill',
        }),
      );
    }
    found.seriesAfter = (await status()).seriesToReconcile.map((each) => each.seriesId);
    found.allocationAfter = await allocate(source.billSeriesId);
  }

  /** Operations and Accounts validate, a command is refused under the hold, and the Organisation reopens (4.3). */
  async function validateAndReopen(): Promise<void> {
    if (outcome.outcome !== 'held') throw new Error('Not held');
    found.raised = await restore(['--raise-gaps', outcome.restoreId]);
    found.validationsBetween.from = new Date().toISOString();
    for (const [user, body] of [
      [operations, { validates: 'operations', compared: ['stock', 'bills'] }],
      [accounts, { validates: 'accounts', compared: ['financial-totals'] }],
    ] as const) {
      found.validations.push(
        await send(user, 'POST', routes.recordRecoveryValidation.path, {
          ...body,
          comparedAgainst: 'SYNTHETIC: the source’s totals before the drill',
          evidence: 'SYNTHETIC: the drill notes',
        }),
      );
    }
    found.validationsBetween.to = new Date().toISOString();
    found.storedUnderHold = await storeFile();
    found.reopened = await send(recovery, 'POST', routes.reopenAfterRestore.path, {
      revocationsPlacedAgain: true,
      legalHoldsPlacedAgain: true,
    });
    found.holdsAfter = (await target.query(database, 'select 1 from kernel.recovery_hold')).length;
    found.storedAfter = await storeFile();
    found.written = await restore(['--drill-record', outcome.restoreId]);
    if (found.written.outcome === 'written') {
      const { record, text } = await drillRecordOf(found.written.json);
      found.record = record;
      found.text = text;
    }
  }

  beforeAll(async () => {
    manifest = await manifestOf(backupId);
    const mine = manifest.organisations.find((each) => each.organisationCode === code);
    if (mine === undefined) throw new Error('The backup holds no part of the Organisation');
    part = mine;
    await restoreIntoTarget();
    await readRestored();
    await reconcileSeries();
    await validateAndReopen();
  }, 900_000);

  afterAll(async () => {
    await (api as AccessTestApp | undefined)?.close();
    await (router as OrganisationRouter | undefined)?.close();
  });

  const named = (name: string) => found.events.find((each) => each.name === name);

  it('PRD-SEC-012 the backup holds records of every stage 1 feature, linked, with their stored files', async () => {
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
      expect(rowsHeld(part, table), table).toBeGreaterThan(0);
    }
    expect(part.latestSeal).not.toBeNull();
    const journalLines = part.controlTotals
      .flatMap((each) => each.totals)
      .find((total) => total.name === 'finance.journal_line.amount_paise.sum');
    expect(Number(journalLines?.value)).toBeGreaterThan(0);
    // Every stored file's object is in the backup store (3.3).
    const objects = await bucketKeys(backupBucket, `files/${organisationId}/`);
    expect(objects.length).toBe(rowsHeld(part, 'files_imports.stored_file'));
  });

  it('PRD-SEC-012 the drill’s own records are restored, found by their identifiers', () => {
    // The role and its assignment the drill prepared and had approved through `access` (access-and-approvals 4.2, 4.3).
    expect(found.role).toEqual([{ id: source.roleId, code: source.roleCode, decision: 'Approved' }]);
    expect(found.assignment).toEqual([
      { id: source.assignmentId, role_id: source.roleId, app_user_id: source.holderId, decision: 'Approved' },
    ]);
    expect(found.batch).toEqual([{ id: source.batchId, state: 'Published' }]);
    expect(found.exception).toEqual([{ id: source.exceptionId }]);
  });

  it('GC-9 12 test 1 PRD-ACP-019 restores into a fresh target and holds the Organisation with every check of 5.1 passed', () => {
    expect(outcome.outcome).toBe('held');
    expect(found.holds).toBe(1);
    expect(found.events.filter((each) => !each.passed)).toEqual([]);
    // Stored files and attachments, every one the backup holds (5.1; imports-and-opening-data 17 test 23).
    const files = named('every stored file is in the file store, opens with its key version and matches its hash');
    expect(Number(files?.checked)).toBe(rowsHeld(part, 'files_imports.stored_file'));
    const attachments = named(
      'every attachment opens from its record for an authorised reader and is refused outside its scope',
    );
    expect(Number(attachments?.checked)).toBe(rowsHeld(part, 'files_imports.attachment'));
    // Numbering, audit and the module invariants, each counting what it checked.
    expect(named('every series paused')?.passed).toBe(true);
    expect(named('audit seal chain verifies')?.passed).toBe(true);
    expect(named('audit seal chain ends at the manifest seal')?.passed).toBe(true);
    expect(Number(named('every journal balances')?.checked)).toBeGreaterThan(0);
    // Every projection row the stock ledger compares, counted once (stock-ledger-restore-participant.int.test.ts).
    expect(Number(named('stock balances equal the sum of their movements')?.checked)).toBeGreaterThan(0);
    // The references across modules were followed: the evidence to its exception, the exception to its import batch,
    // and each policy evidence file to its signature or validation. Each count is every attachment the source held to
    // that record type, counted in the source before the backup, so each was followed once.
    expect(Number(named('files_imports.attachment.record_id -> exceptions.exception')?.checked)).toBe(1);
    expect(Number(named('exceptions.exception_link.record_id -> files_imports.import_batch')?.checked)).toBe(1);
    const policyEvidence = (recordType: string) =>
      Number(named(`files_imports.attachment.record_id -> ${recordType}`)?.checked);
    expect(policyEvidence('configuration.policy_status')).toBe(source.policyEvidence.signature);
    expect(policyEvidence('configuration.policy_validation')).toBe(source.policyEvidence.validation);
    expect(named('every session ended after the restore')?.passed).toBe(true);
    // No object without a record: nothing was stored after the snapshot.
    expect(found.gapsAtRestore).toBe(0);
  });

  it('GC-9 12 test 1 PRD-ACP-019 every control total of 5.2 equals the backup’s, for every module', () => {
    const totals = found.events.filter((each) => each.name === 'control totals equal the backup');
    expect(totals.map((each) => each.unit).sort()).toEqual(
      restoreRegistry.participants.map((participant) => participant.unit).sort(),
    );
    for (const each of totals) {
      expect(each.passed, each.unit).toBe(true);
      const expected = part.controlTotals.find((unit) => unit.unit === each.unit)?.totals.length;
      expect(Number(each.checked), each.unit).toBe(expected);
    }
  });

  it('PRD-SEC-005 imports-and-opening-data 17 test 23 the exception’s evidence opens from its record through the restored application, matching its hash', () => {
    const read = found.evidenceForOwner;
    expect(read?.status, JSON.stringify(read?.body)).toBe(200);
    const file = attachedFileSchema.parse(read?.body);
    expect(Buffer.from(file.contentBase64, 'base64').toString('latin1')).toContain('SYNTHETIC exception-evidence');
    // A person with no grant on the exception is refused.
    expect(found.evidenceForOther?.status).toBe(404);
  });

  it('POL-18.04 numbering-and-audit 7 test 7 every series stays paused until it is reconciled; a reconciliation sets the next bill past the evidence', () => {
    expect(found.seriesBefore).toContain(source.billSeriesId);
    expect(found.seriesBefore.length).toBeGreaterThanOrEqual(4);
    expect(found.allocationsWhilePaused).toHaveLength(found.seriesBefore.length);
    for (const each of found.allocationsWhilePaused) {
      expect(each).toMatchObject({ kind: 'refused', refusal: { code: 'numbering.series-paused' } });
    }
    // Reopening waits for them (4.3).
    expect(found.earlyReopen?.status).toBe(422);
    // The device's bill series: the counter's evidence names the bill it printed (5.3).
    expect(found.billReconciled?.body).toEqual({
      seriesId: source.billSeriesId,
      restoredHighest: source.billsGiven,
      nextSequenceBefore: source.billsGiven + 1,
      nextSequenceAfter: source.billsGiven + 2,
    });
    expect(found.otherReconciled).toHaveLength(found.seriesBefore.length - 1);
    for (const answer of found.otherReconciled) expect(answer.status, JSON.stringify(answer.body)).toBe(200);
    expect(found.seriesAfter).toEqual([]);
    // No number is given twice: the next bill is past the evidence.
    expect(found.allocationAfter).toMatchObject({ kind: 'done', value: { sequenceNumber: source.billsGiven + 2 } });
  });

  it('POL-18.03 synthetic Operations and Accounts users record their validations, and the Organisation reopens', () => {
    // No gap and no failed check to raise (4.5, 5.1).
    expect(found.raised).toMatchObject({
      outcome: 'raised',
      organisations: [{ organisationCode: code, count: 0, refusals: [] }],
    });
    expect(found.validations.map((each) => each.status)).toEqual([200, 200]);
    // Under the hold a business command is refused, naming the hold (4.3; POL-18.03).
    expect(found.storedUnderHold?.status).toBe(403);
    expect(found.storedUnderHold?.body).toMatchObject({ error: { code: 'kernel.recovery-hold' } });
    expect(found.reopened?.status, JSON.stringify(found.reopened?.body)).toBe(200);
    expect(found.holdsAfter).toBe(0);
    // A business command runs again: Operations stores a file, which the hold refused before.
    expect(found.storedAfter?.status, JSON.stringify(found.storedAfter?.body)).toBe(200);
  });

  it('section 6 the drill record holds every step with its times, who conducted it, every result, the key versions and the measured recovery time', () => {
    expect(found.written).toMatchObject({ outcome: 'written', result: 'reopened' });
    const { record, text } = found;
    if (record === undefined) throw new Error('No drill record');
    expect(record).toMatchObject({
      version: 2,
      purpose: { kind: 'drill', note: 'SYNTHETIC drill: GC-9 12 test 1 in CI' },
      conductedBy: 'SYNTHETIC operator, platform (CI)',
      result: 'reopened',
      backup: { backupId, takenAt: manifest.startedAt, backupKeyVersion: manifest.backupKeyVersion },
    });
    // Every step of 4.2 a restore of one Organisation runs, in order, step 1 included.
    expect(record.steps.map((step) => [step.step, step.organisationCode])).toEqual([
      ['check before writing', null],
      ['migrate the directory database', null],
      ['restore the database', code],
      ['migrate the database', code],
      ['compare the control totals with the backup', code],
      ['place the recovery hold', code],
      ['point the directory at the target', null],
      ['copy the file objects', code],
      ['run the restore participants', code],
    ]);
    for (const [index, step] of record.steps.entries()) {
      expect(step.outcome, step.step).toBe('done');
      expect(Date.parse(step.endedAt), step.step).toBeGreaterThanOrEqual(Date.parse(step.startedAt));
      const next = record.steps[index + 1];
      if (next !== undefined) expect(Date.parse(next.startedAt)).toBeGreaterThanOrEqual(Date.parse(step.endedAt));
    }
    expect(record.organisations).toHaveLength(1);
    const [organisation] = record.organisations;
    if (organisation === undefined) throw new Error('No Organisation');
    expect(organisation).toMatchObject({
      organisationCode: code,
      organisationId,
      recoveryPoint: part.snapshotAt,
      databaseTo: database,
      gaps: [],
      recoveryItems: [],
      seriesToReconcile: 0,
      held: false,
    });
    // Every check with its result and counts, as the restored database keeps them (5.1, 5.2).
    const key = (each: {
      unit: string;
      name: string;
      subject: string | null;
      passed: boolean;
      checked: number;
      failed: number;
    }) =>
      `${each.unit}|${each.name}|${each.subject ?? ''}|${String(each.passed)}|${String(each.checked)}|${String(each.failed)}`;
    expect(
      organisation.checks.map((check) => key({ ...check, name: check.check, subject: check.subject ?? null })).sort(),
    ).toEqual(
      found.events.map((each) => key({ ...each, checked: Number(each.checked), failed: Number(each.failed) })).sort(),
    );
    expect(organisation.checks.filter((check) => !check.passed)).toEqual([]);
    // Each series reconciled, with its skip and reason.
    expect(organisation.seriesReconciled.map((each) => each.seriesId).sort()).toEqual([...found.seriesBefore].sort());
    for (const each of organisation.seriesReconciled) expect(each.reason, each.seriesId).toBe('SYNTHETIC drill');
    expect(organisation.seriesReconciled.find((each) => each.seriesId === source.billSeriesId)).toMatchObject({
      restoredHighest: source.billsGiven,
      evidenceHighest: source.billsGiven + 1,
      skipped: { from: source.billsGiven + 1, to: source.billsGiven + 1 },
    });
    // Who validated and when, and who reopened and when (POL-18.03).
    const reopenedAt = recoveryReopenedSchema.parse(found.reopened?.body).reopenedAt;
    expect(
      organisation.validations.map(({ validates, compared, byUserId }) => ({ validates, compared, byUserId })),
    ).toEqual(
      expect.arrayContaining([
        { validates: 'operations', compared: ['stock', 'bills'], byUserId: operations.id },
        { validates: 'accounts', compared: ['financial-totals'], byUserId: accounts.id },
      ]),
    );
    expect(organisation.validations).toHaveLength(2);
    for (const each of organisation.validations) {
      expect(Date.parse(each.at)).toBeGreaterThanOrEqual(Date.parse(found.validationsBetween.from));
      expect(Date.parse(each.at)).toBeLessThanOrEqual(Date.parse(found.validationsBetween.to));
    }
    expect(organisation.reopened?.byUserId).toBe(recovery.id);
    expect(Date.parse(organisation.reopened?.at ?? '')).toBe(Date.parse(reopenedAt));
    // The key versions, each from its kept copy and matching its identifier (2.3, 2.4).
    expect(record.keyVersions.length).toBeGreaterThanOrEqual(2);
    expect(record.keyVersions.every((each) => each.fromKeptCopy && each.matchedIdentifier)).toBe(true);
    expect([...new Set(record.keyVersions.map((each) => each.purpose))].sort()).toEqual([
      'backup',
      'organisation-data',
    ]);
    // Measured, never promised (deployment.md section 4; RR-075 stays OPEN).
    const seconds = record.measured.recoveryTimeSeconds;
    expect(seconds).toBe(Math.round((Date.parse(reopenedAt) - Date.parse(record.restoreStartedAt)) / 1000));
    expect(text).toContain(`Recovery time: ${String(seconds)} s`);
    if (process.env.AOS_RESTORE_DRILL_REPORT === '1') {
      console.log(
        `AOS_RESTORE_DRILL_REPORT ${JSON.stringify({ recoveryTimeSeconds: seconds, phases, steps: record.steps })}`,
      );
    }
  });

  it('GC-9 12 test 17 PRD-SEC-014 the drill records and the logs hold no key, no secret, no session and no connection string', async () => {
    const keys = Object.values(
      JSON.parse(drill.harness.keys()[ORGANISATION_KEYS_VARIABLE] ?? '{}') as Record<string, string>,
    );
    const { harness } = drill;
    const users = [
      ...people,
      ...drill.enrolledUsers,
      drill.preparer,
      drill.approver,
      harness.poster.user,
      harness.approver.user,
      harness.preparer.user,
      harness.checker.user,
    ];
    const sessions = [...drill.sessionCookies(), ...cookies.values()]
      .map((cookie) => cookie.slice(cookie.indexOf('=') + 1))
      .filter((value) => value.length >= 16);
    const urls = (role: 'migration' | 'runtime') => [
      databaseUrl(harness.world.directory, role),
      ...harness.world.organisations.map((each) => databaseUrl(each.database, role)),
      target.url(directory, role),
      target.url(database, role),
    ];
    const forbidden = [
      backupKey.privateText,
      ...Object.values(signingKey.backupRunner),
      ...Object.values(signingKey.restoreRunner),
      ...keys,
      ...urls('migration'),
      ...urls('runtime'),
      ...users.map((user) => user.password),
      ...users.flatMap((user) =>
        user.factorSecret === undefined
          ? []
          : [base32(user.factorSecret), user.factorSecret.toString('hex'), user.factorSecret.toString('base64')],
      ),
      ...sessions,
    ];
    expect(users.length).toBeGreaterThanOrEqual(12);
    expect(sessions.length).toBeGreaterThanOrEqual(5);
    const records = (await bucketKeys(backupBucket, `backups/${backupId}/restores/`)).filter((each) =>
      each.includes('/drill-record-'),
    );
    expect(records.length).toBeGreaterThanOrEqual(2);
    const texts: [string, string][] = [
      ['the command output', logLines.join('\n')],
      ['the test logger', JSON.stringify(log.lines)],
      ['the harness logger', JSON.stringify(harness.log.lines)],
      ['the source application’s log', drill.api.logText()],
      ['the restored application’s log', api.logText()],
      ...(await Promise.all(
        records.map(async (each): Promise<[string, string]> => [
          each,
          (await objectOf(drill.fileStore.client, backupBucket, each)).toString('utf8'),
        ]),
      )),
    ];
    const leaks: string[] = [];
    for (const [where, text] of texts) {
      forbidden.forEach((value, index) => {
        if (value !== '' && text.includes(value)) leaks.push(`forbidden value ${String(index)} in ${where}`);
      });
    }
    expect(leaks).toEqual([]);
  });
});
