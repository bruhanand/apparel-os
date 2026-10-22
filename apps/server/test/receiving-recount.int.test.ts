import { randomInt } from 'node:crypto';
import { uuidv7 } from '@apparel-os/domain';
import {
  DAMAGE_DECISION,
  RECOUNT_APPROVAL,
  arrivalReadSchema,
  recountReadSchema,
  type Arrival,
  type AssignmentScope,
  type GrnLine,
} from '@apparel-os/schemas';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { OrganisationRouter, type RoutedOrganisation } from '../src/kernel/index.js';
import { ACCESS, type AccessInterface } from '../src/modules/access/index.js';
import { NUMBERING, type NumberingInterface } from '../src/modules/numbering/index.js';
import { custody } from '../src/modules/stock/ledger/index.js';
import { defineSyntheticDamageReportSeries } from './fixtures/damage-report-series.js';
import { defineSyntheticGrnSeries } from './fixtures/grn-series.js';
import { syntheticName } from './fixtures/synthetic.js';
import {
  codeFor,
  startAccessApp,
  syntheticKeysEnvironment,
  SyntheticClock,
  SYNTHETIC_ORIGIN,
  writeSyntheticReason,
  writeSyntheticSetting,
  writeSyntheticUser,
  type AccessTestApp,
  type SyntheticUser,
} from './support/access.js';
import {
  asUserIn,
  damageGateOpen,
  LIMIT_ADMIN_AUTHORITY,
  LIMIT_APPROVER_AUTHORITY,
  REPORTER_AUTHORITY,
  SYNTHETIC_POLICY_17_VALUES,
} from './support/damage.js';
import { defineSyntheticCodeSeries } from './support/exceptions.js';
import { grantSynthetic, type SyntheticAuthority } from './support/grants.js';
import { capturingLogger } from './support/jobs.js';
import { startTestFileStore, type TestFileStore } from './support/minio.js';
import { STORE_FILE_PATH, syntheticPdfUpload } from './support/opening-app.js';
import { structureSetup, type StructureSetup } from './support/organisation.js';
import { createSyntheticOrganisations, type SyntheticWorld } from './support/organisations.js';
import { allowVerifier, connect, databaseUrl } from './support/postgres.js';
import {
  placeScope,
  RECEIVER_AUTHORITY,
  receivingFixture,
  receivingGateOpen,
  receivingGranted,
  STOCK_VIEW,
  type ReceivingFixture,
} from './support/receiving.js';

// S2-F02-T05: a recount of a GRN's lines, through the whole application on real PostgreSQL (goods-in 4.7, 4.11, 10.3;
// PRD-REC-019, POL-02.07; stock-ledger 13.18). Goods come into custody through receiving's routes; a recount is proposed
// on the GRN with a reason and decided through `access`'s approval route, as My work decides it (access-and-approvals
// 9.5), by a different person; its approval adds receipt counts, or reverses them, for the difference, and the GRN keeps
// its original count. Every person, place, product, limit, routing and number is SYNTHETIC.

let world: SyntheticWorld;
let database: string;
let organisationCode: string;
let organisation: RoutedOrganisation;
let router: OrganisationRouter;
let api: AccessTestApp;
let minio: TestFileStore;
let keys: Record<string, string>;
let clock: SyntheticClock;
let setup: StructureSetup;
let fixture: ReceivingFixture;
const cookies = new Map<string, string>();
let approveReason: string;
let rejectReason: string;

interface Person {
  readonly user: SyntheticUser;
  readonly assignmentId: string;
}
/** Warehouse (P-WHS), who counts, issues the GRN and proposes its recount; may approve recounts, to prove they cannot. */
let receiver: Person;
/** Whoever approves recounts (goods-in 11: the Owner, or whoever holds the limits), with authority over Unknown cost. */
let approver: Person;
/** A reader of the second Store only, who may see none of the first Store's receipts (goods-in 12 test 20). */
let otherStoreReader: Person;
let settingsAdmin: Person;
let settingsApprover: Person;

interface Call {
  readonly status: number;
  readonly body: Record<string, unknown>;
}

function freshCode(user: SyntheticUser): string {
  clock.advance(30);
  return codeFor(user.factorSecret ?? Buffer.alloc(0), 0, clock.now());
}

async function enrolled(
  label: string,
  authorities: readonly SyntheticAuthority[],
  scope?: AssignmentScope,
): Promise<Person> {
  const user = await writeSyntheticUser(database, organisationCode, keys, {
    label: `${label}${String(randomInt(1_000_000))}`,
    enrolled: true,
  });
  const once = [...new Map(authorities.map((each) => [`${each.recordType}:${each.action}`, each])).values()];
  const { assignmentId } = await grantSynthetic(
    database,
    { kind: 'user', id: user.id },
    once,
    scope === undefined ? {} : { scope },
  );
  const response = await fetch(`${api.baseUrl}/api/access/sign-in`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: SYNTHETIC_ORIGIN, 'x-forwarded-for': '10.9.9.77' },
    body: JSON.stringify({ organisationCode, login: user.login, password: user.password, totpCode: freshCode(user) }),
  });
  expect(response.status).toBe(200);
  cookies.set(user.id, (response.headers.get('set-cookie') ?? '').split(';')[0] ?? '');
  return { user, assignmentId };
}

async function post(person: Person, path: string, body: unknown, key: string = uuidv7()): Promise<Call> {
  const response = await fetch(`${api.baseUrl}${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: SYNTHETIC_ORIGIN,
      cookie: cookies.get(person.user.id) ?? '',
      'idempotency-key': key,
    },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

async function get(person: Person, path: string): Promise<Call> {
  const response = await fetch(`${api.baseUrl}${path}`, { headers: { cookie: cookies.get(person.user.id) ?? '' } });
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

const errorOf = (call: Call) => (call.body as { error?: { code: string; missing?: Record<string, string>[] } }).error;

let fileCount = 0;
async function storedFile(person: Person): Promise<{ storedFileId: string; fileReceiptId: string }> {
  fileCount += 1;
  const stored = await post(person, STORE_FILE_PATH, syntheticPdfUpload('RECOUNT', `FILE-${String(fileCount)}`));
  expect(stored.status, JSON.stringify(stored.body)).toBe(200);
  const { storedFileId, receiptId } = stored.body as { storedFileId: string; receiptId: string };
  return { storedFileId, fileReceiptId: receiptId };
}

/** An Arrival at the first Store with its invoice, ready to count (goods-in 4.2; DEC-133). */
async function arrivalWithInvoice(): Promise<string> {
  const made = await post(receiver, '/api/receiving/arrivals', {
    businessUnitId: fixture.wholeStore,
    receivingLocationId: fixture.storeLocation,
    supplierPartyId: fixture.supplier.id,
    brandId: fixture.brand.id,
    transporter: syntheticName('Transporter'),
    lorryReceipt: { number: 'SYN-LR-RCT', date: setup.today() },
    cartons: 3,
    arrivedAt: new Date(clock.now().getTime() - 3_600_000).toISOString(),
  });
  expect(made.status, JSON.stringify(made.body)).toBe(200);
  const arrivalId = (made.body as { arrivalId: string }).arrivalId;
  const invoice = await post(receiver, `/api/receiving/arrivals/${arrivalId}/invoices`, {
    number: `SYN-INV-RCT-${String(randomInt(1_000_000))}`,
    date: setup.today(),
    file: await storedFile(receiver),
  });
  expect(invoice.status, JSON.stringify(invoice.body)).toBe(200);
  return arrivalId;
}

/** A line of goods on the invoice, of a product not yet set up (goods-in 4.3, 4.4). */
function onInvoice(styleCode: string, invoice: number, counted: number, extra: Record<string, unknown> = {}) {
  return {
    goods: 'on-invoice',
    styleCode,
    colour: 'SYNTHETIC NAVY',
    sizeValueId: fixture.sizes.values[0]?.id ?? null,
    skuId: null,
    description: null,
    invoiceQuantity: invoice,
    countedQuantity: counted,
    extra: null,
    damage: null,
    batch: null,
    ...extra,
  };
}

/** A line of the batch-tracked product, on the invoice, its size recorded (goods-in 4.3; PRD-MER-011; RR-586). */
function ofProduct(invoice: number, counted: number) {
  return {
    goods: 'on-invoice',
    styleCode: fixture.batchSku.styleCode,
    colour: null,
    sizeValueId: fixture.sizes.values[0]?.id ?? null,
    skuId: fixture.batchSku.id,
    description: null,
    invoiceQuantity: invoice,
    countedQuantity: counted,
    extra: null,
    damage: null,
    batch: { code: 'SYN-BATCH-RCT', expiryDate: setup.day(90) },
  };
}

async function readArrival(person: Person, arrivalId: string): Promise<Arrival> {
  const read = await get(person, `/api/receiving/arrivals/${arrivalId}`);
  expect(read.status, JSON.stringify(read.body)).toBe(200);
  return arrivalReadSchema.parse(read.body).arrival;
}

/** Counts the lines and issues the GRN; answers the Arrival and the GRN. */
async function issued(lines: readonly Record<string, unknown>[]): Promise<{ arrivalId: string; grnId: string }> {
  const arrivalId = await arrivalWithInvoice();
  for (const line of lines) {
    const saved = await post(receiver, `/api/receiving/arrivals/${arrivalId}/count-lines`, line);
    expect(saved.status, JSON.stringify(saved.body)).toBe(200);
  }
  const { versionToken } = await readArrival(receiver, arrivalId);
  const issue = await post(receiver, `/api/receiving/arrivals/${arrivalId}/grn`, { versionToken });
  expect(issue.status, JSON.stringify(issue.body)).toBe(200);
  return { arrivalId, grnId: (issue.body as { grnId: string }).grnId };
}

/** The GRN lines of an issued Arrival, by style code or description. */
async function grnLines(arrivalId: string, person: Person = receiver): Promise<Map<string, GrnLine>> {
  const arrival = await readArrival(person, arrivalId);
  return new Map((arrival.grn?.lines ?? []).map((line) => [line.styleCode ?? line.description ?? '', line]));
}

function lineOf(lines: Map<string, GrnLine>, key: string): GrnLine {
  const line = lines.get(key);
  if (line === undefined) throw new Error(`no line ${key}`);
  return line;
}

/** Proposes a recount of the GRN, naming its recount version as the Arrival shows it (goods-in 4.11). */
async function propose(
  arrivalId: string,
  lines: readonly { readonly grnLineId: string; readonly countedQuantity: number }[],
  reason = 'SYNTHETIC recounted carton by carton',
  person: Person = receiver,
): Promise<Call> {
  const grn = (await readArrival(receiver, arrivalId)).grn;
  if (grn === null) throw new Error('no GRN');
  return post(person, `/api/receiving/grns/${grn.id}/recounts`, {
    versionToken: grn.recountVersionToken,
    reason,
    lines,
  });
}

/**
 * Custody of one GRN line's goods at the Store's receiving location, by condition, over every receipt origin its count
 * and its recounts made (stock-ledger 13.6), as the verifier finds the origins.
 */
async function custodyOfLine(grnLineId: string): Promise<Record<string, number>> {
  const verify = await connect(database, 'verify');
  let originIds: string[];
  try {
    const found = await verify.query<{ id: string }>(
      `select id from stock.receipt_origin
        where parent_origin_id is null
          and (source_line_id = $1
               or source_line_id in (select id from receiving.recount_movement where grn_line_id = $1))`,
      [grnLineId],
    );
    originIds = found.rows.map((row) => row.id);
  } finally {
    await verify.end();
  }
  const read = await asUserIn(api.app, organisation, receiver.user.id, (context) =>
    custody(context, { businessUnitId: fixture.wholeStore, locationId: fixture.storeLocation }),
  );
  const totals: Record<string, number> = {};
  for (const row of read.rows.filter((each) => originIds.includes(each.receiptOriginId))) {
    totals[row.condition] = (totals[row.condition] ?? 0) + row.quantity;
  }
  return totals;
}

/** The exceptions raised on the records given, with their type, as the verifier reads them. */
async function exceptionsOn(recordIds: readonly string[]) {
  const verify = await connect(database, 'verify');
  try {
    const result = await verify.query<{ type: string; record_id: string }>(
      `select t.code as type, l.record_id
         from exceptions.exception e
         join exceptions.exception_type t on t.id = e.exception_type_id
         join exceptions.exception_link l on l.exception_id = e.id
        where l.record_id = any($1::uuid[])
        order by t.code`,
      [recordIds],
    );
    return result.rows;
  } finally {
    await verify.end();
  }
}

/** Decides a request through `access`'s approval route, as the approval panel in My work does (9.5). */
function decide(person: Person, requestId: string, versionId: string, outcome: 'approve' | 'reject') {
  return post(person, `/api/access/approval-requests/${requestId}/decision`, {
    versionId,
    outcome,
    reason: { kind: 'listed', reasonId: outcome === 'approve' ? approveReason : rejectReason },
    totpCode: freshCode(person.user),
  });
}

/** A SYNTHETIC limit covering Unknown value only, prepared and approved by two different people (9.2; V-02). */
async function unknownOnlyLimit(person: Person, actionType: string): Promise<void> {
  const access = api.app.get<AccessInterface>(ACCESS);
  const prepared = await asUserIn(api.app, organisation, settingsAdmin.user.id, (context) =>
    access.prepareApprovalLimit(
      context,
      { userId: settingsAdmin.user.id, roleAssignmentId: settingsAdmin.assignmentId },
      {
        actionType,
        holder: { kind: 'individual', userId: person.user.id, roleAssignmentId: person.assignmentId },
        limit: { kind: 'none' },
        coversUnknown: true,
        origin: 'synthetic',
        validFrom: setup.today(),
      },
    ),
  );
  if (prepared.kind !== 'success') throw new Error(`limit refused: ${prepared.refusal.code}`);
  const done = await decide(settingsApprover, prepared.answer.requestId, prepared.answer.limitId, 'approve');
  expect(done.status, JSON.stringify(done.body)).toBe(200);
}

/** One exception type routed at the Site to a SYNTHETIC owner, approved by a different person (12.2; POL-02.16). */
async function route(typeCode: string, owner: Person): Promise<void> {
  const prepared = await post(settingsAdmin, '/api/exceptions/routing', {
    typeCode,
    siteId: fixture.siteId,
    owner: { kind: 'user', userId: owner.user.id },
    dueRule: { format: 'elapsed-minutes-v1', minutes: 60 },
    escalation: { kind: 'user', userId: owner.user.id },
    validFrom: setup.today(),
    origin: 'synthetic',
  });
  expect(prepared.status, JSON.stringify(prepared.body)).toBe(200);
  const { requestId, versionId } = prepared.body as { requestId: string; versionId: string };
  const done = await decide(settingsApprover, requestId, versionId, 'approve');
  expect(done.status, JSON.stringify(done.body)).toBe(200);
}

/** What proposes a recount besides receiving (goods-in 4.11): create on recounts, and the approval panel. */
const PROPOSER_AUTHORITY: readonly SyntheticAuthority[] = [
  { recordType: 'receiving.recount', action: 'create' },
  { recordType: 'access.approval_request', action: 'view' },
  { recordType: 'access.approval_reason', action: 'view' },
];

/** What approves a recount (goods-in 11): reading the Arrival, approve on recounts and the approval panel. */
const APPROVER_AUTHORITY: readonly SyntheticAuthority[] = [
  { recordType: 'receiving.arrival', action: 'view' },
  { recordType: 'receiving.recount', action: 'approve' },
  { recordType: 'access.approval_request', action: 'view' },
  { recordType: 'access.approval_reason', action: 'view' },
  { recordType: 'exceptions.exception', action: 'view' },
  ...STOCK_VIEW,
];

beforeAll(async () => {
  world = await createSyntheticOrganisations('recount');
  database = world.organisations[0].database;
  await allowVerifier(database);
  organisationCode = world.organisations[0].code;
  keys = syntheticKeysEnvironment(world);
  await writeSyntheticSetting(database, 'access.sign-in-throttling', { failureLimit: 50, windowSeconds: 600 });
  await writeSyntheticSetting(database, 'access.password-rules', { minimumLength: 12 });
  await writeSyntheticSetting(database, 'access.office-session-limits', {
    idleLockSeconds: 1800,
    absoluteSeconds: 28800,
  });
  minio = await startTestFileStore();
  clock = new SyntheticClock();
  api = await startAccessApp(world, keys, {
    clock,
    fileStoreEnvironment: minio.environment,
    validityChecks: [SYNTHETIC_POLICY_17_VALUES],
  });
  router = new OrganisationRouter(
    { directoryConnectionString: databaseUrl(world.directory, 'runtime'), poolMax: 4 },
    capturingLogger().logger,
  );
  const routed = await router.resolveForSignIn(organisationCode);
  if (!routed.routed) throw new Error('not routed');
  organisation = routed.organisation;
  setup = await structureSetup({
    directory: world.directory,
    database,
    organisationCode,
    keysEnvironment: keys,
    label: 'RECOUNT',
  });
  fixture = await receivingFixture(setup, database, 'RCT');
  await receivingGateOpen(setup, database, [SYNTHETIC_POLICY_17_VALUES]);
  await receivingGranted(setup, database, fixture.siteId, [fixture.wholeStore], [SYNTHETIC_POLICY_17_VALUES]);
  await damageGateOpen(setup, database);
  approveReason = await writeSyntheticReason(database, 'approve');
  rejectReason = await writeSyntheticReason(database, 'reject');
  const numbering = api.app.get<NumberingInterface>(NUMBERING);
  await asUserIn(api.app, organisation, setup.preparer.id, async (context) => {
    await defineSyntheticGrnSeries(context, numbering);
    await defineSyntheticCodeSeries(context, numbering);
    await defineSyntheticDamageReportSeries(context, numbering);
  });

  receiver = await enrolled('RCT-RECEIVER', [
    ...RECEIVER_AUTHORITY,
    ...REPORTER_AUTHORITY,
    ...PROPOSER_AUTHORITY,
    { recordType: 'receiving.recount', action: 'approve' },
  ]);
  approver = await enrolled('RCT-APPROVER', APPROVER_AUTHORITY);
  otherStoreReader = await enrolled(
    'RCT-OTHER-STORE',
    [...RECEIVER_AUTHORITY, ...PROPOSER_AUTHORITY],
    placeScope([{ type: 'store', id: fixture.otherStoreId }]),
  );
  settingsAdmin = await enrolled('RCT-SETTINGS', [
    ...LIMIT_ADMIN_AUTHORITY,
    { recordType: 'exceptions.exception_routing', action: 'view' },
    { recordType: 'exceptions.exception_routing', action: 'edit' },
  ]);
  settingsApprover = await enrolled('RCT-SETTINGS-APPROVER', [
    ...LIMIT_APPROVER_AUTHORITY,
    { recordType: 'exceptions.exception_routing', action: 'approve' },
    { recordType: 'access.approval_request', action: 'view' },
  ]);
  // SYNTHETIC limits over Unknown cost (V-02): the approver, and the receiver, who holds approve too.
  for (const person of [approver, receiver]) await unknownOnlyLimit(person, RECOUNT_APPROVAL);
  await unknownOnlyLimit(receiver, DAMAGE_DECISION);
  // The follow-ups' SYNTHETIC routings: the findings to the approver, damage too, and the review of a GRN received
  // without a booking (goods-in 4.10; RR-580) (POL-02.16; V-03).
  for (const type of [
    'receiving.shortage',
    'receiving.excess',
    'receiving.wrong-goods',
    'receiving.unidentified-goods',
    'receiving.booking-review',
    'stock.damage',
  ]) {
    await route(type, approver);
  }
}, 400_000);

afterAll(async () => {
  await (setup as StructureSetup | undefined)?.close();
  await (router as OrganisationRouter | undefined)?.close();
  await (api as AccessTestApp | undefined)?.close();
  await (minio as TestFileStore | undefined)?.stop();
  await (world as SyntheticWorld | undefined)?.reset();
});

/** The GRN of the first two tests: a line of a product not yet set up, short, and a line of a product set up. */
let first: { arrivalId: string; grnId: string };

describe('a recount corrects custody and keeps the original count (goods-in 4.7, 4.11; PRD-REC-019)', () => {
  it('PRD-REC-019 POL-02.07 pieces found and pieces counted in error are corrected once a different person approves; the GRN keeps its count', async () => {
    first = await issued([onInvoice('SYN-RC-FOUND', 10, 8), ofProduct(5, 5)]);
    const lines = await grnLines(first.arrivalId);
    const found = lineOf(lines, 'SYN-RC-FOUND');
    const product = lineOf(lines, fixture.batchSku.styleCode);
    expect(await custodyOfLine(found.id)).toEqual({ good: 8 });
    expect(await custodyOfLine(product.id)).toEqual({ good: 5 });

    const proposed = await propose(first.arrivalId, [
      { grnLineId: found.id, countedQuantity: 10 },
      { grnLineId: product.id, countedQuantity: 4 },
    ]);
    expect(proposed.status, JSON.stringify(proposed.body)).toBe(200);
    const { recountId, requestId } = proposed.body as { recountId: string; requestId: string };
    // Nothing changes until it is approved: the GRN and custody stand as counted.
    const waiting = (await readArrival(receiver, first.arrivalId)).grn;
    expect(waiting?.recounts).toEqual([
      expect.objectContaining({
        id: recountId,
        state: 'Awaiting approval',
        reason: 'SYNTHETIC recounted carton by carton',
        proposedBy: receiver.user.id,
        requestId,
        decision: null,
        lines: [
          expect.objectContaining({ grnLineId: found.id, countedBefore: 8, countedAfter: 10 }),
          expect.objectContaining({ grnLineId: product.id, countedBefore: 5, countedAfter: 4 }),
        ],
      }),
    ]);
    expect(await custodyOfLine(found.id)).toEqual({ good: 8 });

    // Whoever proposed it cannot approve it, whatever their limit (POL-02.07).
    const own = await decide(receiver, requestId, recountId, 'approve');
    expect(own.status).toBe(422);
    expect(errorOf(own)?.code).toBe('access.self-preparation');

    const approved = await decide(approver, requestId, recountId, 'approve');
    expect(approved.status, JSON.stringify(approved.body)).toBe(200);
    expect(await custodyOfLine(found.id)).toEqual({ good: 10 });
    expect(await custodyOfLine(product.id)).toEqual({ good: 4 });
    const after = await grnLines(first.arrivalId);
    // The GRN keeps its original count; the recount is its own record (PRD-REC-019).
    expect(lineOf(after, 'SYN-RC-FOUND')).toMatchObject({
      countedQuantity: 8,
      findings: { shortage: 2, received: 8 },
      recounted: { countedQuantity: 10, findings: { shortage: 0, extra: 0, received: 10, damaged: 0 } },
    });
    expect(lineOf(after, fixture.batchSku.styleCode)).toMatchObject({
      countedQuantity: 5,
      recounted: { countedQuantity: 4, findings: { shortage: 1, received: 4 } },
    });
    const grn = (await readArrival(receiver, first.arrivalId)).grn;
    expect(grn?.recounts[0]).toMatchObject({
      state: 'Approved',
      decision: { outcome: 'approved', decidedBy: approver.user.id },
    });
    expect(grn?.recountVersionToken).toBe(recountId);
  });

  it('PRD-REC-019 a later recount reverses the newest pieces first, and a shortage it finds reaches Booking', async () => {
    const found = lineOf(await grnLines(first.arrivalId), 'SYN-RC-FOUND');
    const before = await exceptionsOn([first.grnId]);
    const proposed = await propose(first.arrivalId, [{ grnLineId: found.id, countedQuantity: 7 }]);
    expect(proposed.status, JSON.stringify(proposed.body)).toBe(200);
    const { recountId, requestId } = proposed.body as { recountId: string; requestId: string };
    const approved = await decide(approver, requestId, recountId, 'approve');
    expect(approved.status, JSON.stringify(approved.body)).toBe(200);
    expect(await custodyOfLine(found.id)).toEqual({ good: 7 });
    expect(lineOf(await grnLines(first.arrivalId), 'SYN-RC-FOUND')).toMatchObject({
      countedQuantity: 8,
      recounted: { countedQuantity: 7, findings: { shortage: 3, received: 7 } },
    });
    // The recount found a shortage the GRN's count no longer had: a follow-up of its own, linking to the GRN.
    const after = await exceptionsOn([first.grnId]);
    expect(after.filter((each) => each.type === 'receiving.shortage')).toHaveLength(
      before.filter((each) => each.type === 'receiving.shortage').length + 1,
    );
  });

  it('PRD-REC-019 a rejected recount changes nothing, and the lines may be recounted again', async () => {
    const found = lineOf(await grnLines(first.arrivalId), 'SYN-RC-FOUND');
    const proposed = await propose(first.arrivalId, [{ grnLineId: found.id, countedQuantity: 9 }]);
    expect(proposed.status, JSON.stringify(proposed.body)).toBe(200);
    const { recountId, requestId } = proposed.body as { recountId: string; requestId: string };
    // One recount of a GRN waits at a time (goods-in 4.11).
    const second = await propose(first.arrivalId, [{ grnLineId: found.id, countedQuantity: 6 }]);
    expect(errorOf(second)?.code).toBe('receiving.recount-pending');
    const rejected = await decide(approver, requestId, recountId, 'reject');
    expect(rejected.status, JSON.stringify(rejected.body)).toBe(200);
    expect(await custodyOfLine(found.id)).toEqual({ good: 7 });
    const grn = (await readArrival(receiver, first.arrivalId)).grn;
    expect(grn?.recounts.at(-1)).toMatchObject({ state: 'Rejected', decision: { outcome: 'rejected' } });
    expect(grn?.lines.find((line) => line.id === found.id)?.recounted?.countedQuantity).toBe(7);
    // A proposal naming a recount version a later recount replaced is stale (code-house-rules 12.7).
    const stale = await post(receiver, `/api/receiving/grns/${first.grnId}/recounts`, {
      versionToken: first.grnId,
      reason: 'SYNTHETIC stale',
      lines: [{ grnLineId: found.id, countedQuantity: 6 }],
    });
    expect(errorOf(stale)?.code).toBe('kernel.stale-version');
    const again = await propose(first.arrivalId, [{ grnLineId: found.id, countedQuantity: 6 }]);
    expect(again.status, JSON.stringify(again.body)).toBe(200);
  });

  it('PRD-REC-019 the approval panel reads the recount with the lines it names', async () => {
    const recount = (await readArrival(receiver, first.arrivalId)).grn?.recounts.at(-1);
    const read = await get(approver, `/api/receiving/recounts/${recount?.id ?? ''}`);
    expect(read.status, JSON.stringify(read.body)).toBe(200);
    const panel = recountReadSchema.parse(read.body);
    expect(panel).toMatchObject({
      grnId: first.grnId,
      recount: { id: recount?.id, state: 'Awaiting approval' },
      lines: [expect.objectContaining({ styleCode: 'SYN-RC-FOUND', countedQuantity: 8 })],
    });
    expect(panel.people).toEqual(expect.arrayContaining([expect.objectContaining({ userId: receiver.user.id })]));
    // Hidden from a reader whose scope does not cover the Store: not found, never refused (code-house-rules 12.3).
    const hidden = await get(otherStoreReader, `/api/receiving/recounts/${recount?.id ?? ''}`);
    expect(hidden.status).toBe(404);
    expect(errorOf(hidden)?.code).toBe('receiving.record-not-found');
    const proposedHidden = await post(otherStoreReader, `/api/receiving/grns/${first.grnId}/recounts`, {
      versionToken: first.grnId,
      reason: 'SYNTHETIC hidden',
      lines: [{ grnLineId: uuidv7(), countedQuantity: 1 }],
    });
    expect(proposedHidden.status).toBe(404);
    expect(errorOf(proposedHidden)?.code).toBe('receiving.record-not-found');
  });
});

describe('what a recount does not change (goods-in 4.11)', () => {
  it('PRD-REC-019 PRD-REC-013 a line with held goods, goods not on the invoice, pieces beyond the invoice and pieces found damaged are refused', async () => {
    const photo = await storedFile(receiver);
    const grn = await issued([
      onInvoice('SYN-RC-EXCESS', 2, 3, { extra: 'received' }),
      onInvoice('SYN-RC-CLEAN', 4, 4),
      onInvoice('SYN-RC-DAMAGED', 4, 4, {
        damage: { quantity: 3, description: 'SYNTHETIC wet cartons', photo },
      }),
      {
        goods: 'unidentified',
        styleCode: null,
        colour: null,
        sizeValueId: null,
        skuId: null,
        description: 'SYNTHETIC grey scarf, sent back',
        invoiceQuantity: 0,
        countedQuantity: 1,
        extra: 'not-received',
        damage: null,
        batch: null,
      },
    ]);
    const lines = await grnLines(grn.arrivalId);
    const refusal = async (key: string, countedQuantity: number) =>
      errorOf(await propose(grn.arrivalId, [{ grnLineId: lineOf(lines, key).id, countedQuantity }]));
    const excess = lineOf(lines, 'SYN-RC-EXCESS');
    expect(await refusal('SYN-RC-EXCESS', 2)).toMatchObject({
      code: 'receiving.recount-held-line',
      missing: [
        { kind: 'record', recordType: 'receiving.grn_line', recordId: excess.id },
        { kind: 'record', recordType: 'receiving.held_line', recordId: excess.heldLine?.id },
      ],
    });
    expect((await refusal('SYNTHETIC grey scarf, sent back', 2))?.code).toBe('receiving.recount-not-on-invoice');
    expect((await refusal('SYN-RC-CLEAN', 5))?.code).toBe('receiving.recount-adds-extra');
    expect((await refusal('SYN-RC-CLEAN', 4))?.code).toBe('receiving.recount-unchanged');
    expect((await refusal('SYN-RC-DAMAGED', 2))?.code).toBe('receiving.recount-below-damage');
    // The damaged pieces are held: the free ones are the most a recount takes away.
    const damaged = await propose(grn.arrivalId, [
      { grnLineId: lineOf(lines, 'SYN-RC-DAMAGED').id, countedQuantity: 3 },
    ]);
    expect(damaged.status, JSON.stringify(damaged.body)).toBe(200);
  });

  it('PRD-REC-008 extra pieces not received are recounted without custody; a recount within the invoice reverses received pieces', async () => {
    const grn = await issued([onInvoice('SYN-RC-OVER', 3, 4, { extra: 'not-received' })]);
    const over = lineOf(await grnLines(grn.arrivalId), 'SYN-RC-OVER');
    expect(await custodyOfLine(over.id)).toEqual({ good: 3 });
    const more = await propose(grn.arrivalId, [{ grnLineId: over.id, countedQuantity: 5 }]);
    expect(more.status, JSON.stringify(more.body)).toBe(200);
    const first = more.body as { recountId: string; requestId: string };
    expect((await decide(approver, first.requestId, first.recountId, 'approve')).status).toBe(200);
    expect(await custodyOfLine(over.id)).toEqual({ good: 3 });
    expect(lineOf(await grnLines(grn.arrivalId), 'SYN-RC-OVER').recounted).toEqual({
      countedQuantity: 5,
      findings: { shortage: 0, extra: 2, received: 3, damaged: 0 },
    });
    const fewer = await propose(grn.arrivalId, [{ grnLineId: over.id, countedQuantity: 2 }]);
    expect(fewer.status, JSON.stringify(fewer.body)).toBe(200);
    const second = fewer.body as { recountId: string; requestId: string };
    expect((await decide(approver, second.requestId, second.recountId, 'approve')).status).toBe(200);
    expect(await custodyOfLine(over.id)).toEqual({ good: 2 });
  });
});
