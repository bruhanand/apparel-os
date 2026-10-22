import { randomInt } from 'node:crypto';
import { uuidv7 } from '@apparel-os/domain';
import {
  DAMAGE_DECISION,
  HELD_LINE_DECISION,
  arrivalReadSchema,
  heldLineReadSchema,
  inboxSchema,
  myWorkSchema,
  type Arrival,
  type AssignmentScope,
  type GrnLine,
} from '@apparel-os/schemas';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { OrganisationRouter, type RoutedOrganisation } from '../src/kernel/index.js';
import { ACCESS, type AccessInterface } from '../src/modules/access/index.js';
import { NUMBERING, type NumberingInterface } from '../src/modules/numbering/index.js';
import { RECEIVING, type ReceivingInterface } from '../src/modules/receiving/index.js';
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
  DECIDER_AUTHORITY,
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

// S2-F02-T03: what the count finds and the held lines Booking decides, through the whole application on real
// PostgreSQL (goods-in 4.4 to 4.6, 4.9, 10.3, 10.5, 12 test 1 and the holding part of test 2; PRD-REC-006, PRD-REC-008,
// PRD-REC-012, PRD-REC-013, PRD-ACP-001, PRD-DMG-001, POL-17.02, POL-17.11; stock-ledger 13.16). Goods come into custody
// through receiving's routes; the decisions are made through `access`'s approval route, as My work makes them
// (access-and-approvals 9.5). Policy 17 reports no values yet, so its gate opens on the one value of a test-only check,
// labelled synthetic (support/damage.ts). Every person, place, product, limit, routing and number is SYNTHETIC.

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
/** Whoever counts, issues the GRN and reports the count's damage; they may also decide held lines, to prove they cannot. */
let receiver: Person;
/** A Booking approver (P-BKG), named by role for the Site and brand (POL-17.11), with authority over Unknown cost. */
let bookingApprover: Person;
/** Booking (P-BKG), who names the product of unidentified goods, and so may not decide that version. */
let booking: Person;
/** Operations (P-OPS), the damage's follow-up owner. */
let operations: Person;
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
    headers: { 'content-type': 'application/json', origin: SYNTHETIC_ORIGIN, 'x-forwarded-for': '10.9.9.74' },
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
  const stored = await post(person, STORE_FILE_PATH, syntheticPdfUpload('FINDINGS', `FILE-${String(fileCount)}`));
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
    lorryReceipt: { number: 'SYN-LR-FND', date: setup.today() },
    cartons: 4,
    arrivedAt: new Date(clock.now().getTime() - 3_600_000).toISOString(),
  });
  expect(made.status, JSON.stringify(made.body)).toBe(200);
  const arrivalId = (made.body as { arrivalId: string }).arrivalId;
  const invoice = await post(receiver, `/api/receiving/arrivals/${arrivalId}/invoices`, {
    number: `SYN-INV-FND-${String(randomInt(1_000_000))}`,
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

async function saveLines(arrivalId: string, lines: readonly Record<string, unknown>[]): Promise<void> {
  for (const line of lines) {
    const saved = await post(receiver, `/api/receiving/arrivals/${arrivalId}/count-lines`, line);
    expect(saved.status, JSON.stringify(saved.body)).toBe(200);
  }
}

async function readArrival(person: Person, arrivalId: string): Promise<Arrival> {
  const read = await get(person, `/api/receiving/arrivals/${arrivalId}`);
  expect(read.status, JSON.stringify(read.body)).toBe(200);
  return arrivalReadSchema.parse(read.body).arrival;
}

async function issue(arrivalId: string): Promise<Call> {
  const { versionToken } = await readArrival(receiver, arrivalId);
  return post(receiver, `/api/receiving/arrivals/${arrivalId}/grn`, { versionToken });
}

/** Custody of one GRN line's goods at the Store's receiving location, by condition (stock-ledger 13.6). */
async function custodyOfLine(grnLineId: string): Promise<Record<string, number>> {
  const verify = await connect(database, 'verify');
  let originId: string | undefined;
  try {
    const found = await verify.query<{ id: string }>(
      'select id from stock.receipt_origin where source_line_id = $1 and parent_origin_id is null',
      [grnLineId],
    );
    originId = found.rows[0]?.id;
  } finally {
    await verify.end();
  }
  if (originId === undefined) return {};
  const read = await asUserIn(api.app, organisation, receiver.user.id, (context) =>
    custody(context, { businessUnitId: fixture.wholeStore, locationId: fixture.storeLocation }),
  );
  const totals: Record<string, number> = {};
  for (const row of read.rows.filter((each) => each.receiptOriginId === originId)) {
    totals[row.condition] = (totals[row.condition] ?? 0) + row.quantity;
  }
  return totals;
}

/** The holds on one GRN line's goods with the units each still claims, by kind and condition (15.4). */
async function holdsOfLine(grnLineId: string): Promise<{ kind: string; condition: string; quantity: number }[]> {
  const verify = await connect(database, 'verify');
  try {
    const result = await verify.query<{ kind: string; condition: string; quantity: number }>(
      `select h.kind, b.condition, sum(c.quantity)::int as quantity
         from stock.hold_claim c
         join stock.hold h on h.id = c.hold_id
         join stock.balance b on b.id = c.balance_id
         join stock.receipt_origin o on o.id = b.receipt_origin_id
        where o.source_line_id = $1 and c.quantity > 0
        group by h.kind, b.condition order by h.kind, b.condition`,
      [grnLineId],
    );
    return result.rows;
  } finally {
    await verify.end();
  }
}

/** The exceptions raised on the records given, with their type and owner, as the verifier reads them. */
async function exceptionsOn(recordIds: readonly string[]) {
  const verify = await connect(database, 'verify');
  try {
    const result = await verify.query<{ type: string; record_id: string; owner_user_id: string | null; id: string }>(
      `select t.code as type, l.record_id, e.owner_user_id, e.id
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
async function unknownOnlyLimit(
  person: Person,
  actionType: typeof HELD_LINE_DECISION | typeof DAMAGE_DECISION = HELD_LINE_DECISION,
): Promise<void> {
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
  const decided = await decide(settingsApprover, prepared.answer.requestId, prepared.answer.limitId, 'approve');
  expect(decided.status, JSON.stringify(decided.body)).toBe(200);
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
  const decided = await decide(settingsApprover, requestId, versionId, 'approve');
  expect(decided.status, JSON.stringify(decided.body)).toBe(200);
}

/** What a Booking approver holds: reading the Arrival, deciding its held lines and the approval panel (goods-in 11). */
const BOOKING_APPROVER_AUTHORITY: readonly SyntheticAuthority[] = [
  { recordType: 'receiving.arrival', action: 'view' },
  { recordType: 'receiving.held_line', action: 'approve' },
  { recordType: 'access.approval_request', action: 'view' },
  { recordType: 'access.approval_reason', action: 'view' },
  { recordType: 'exceptions.exception', action: 'view' },
  ...STOCK_VIEW,
];

beforeAll(async () => {
  world = await createSyntheticOrganisations('findings');
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
    label: 'FINDINGS',
  });
  fixture = await receivingFixture(setup, database, 'FND');
  await receivingGateOpen(setup, database, [SYNTHETIC_POLICY_17_VALUES]);
  await receivingGranted(setup, database, fixture.siteId, [fixture.wholeStore], [SYNTHETIC_POLICY_17_VALUES]);
  approveReason = await writeSyntheticReason(database, 'approve');
  rejectReason = await writeSyntheticReason(database, 'reject');
  const numbering = api.app.get<NumberingInterface>(NUMBERING);
  await asUserIn(api.app, organisation, setup.preparer.id, async (context) => {
    await defineSyntheticGrnSeries(context, numbering);
    await defineSyntheticCodeSeries(context, numbering);
    await defineSyntheticDamageReportSeries(context, numbering);
  });

  receiver = await enrolled('FND-RECEIVER', [
    ...RECEIVER_AUTHORITY,
    ...REPORTER_AUTHORITY,
    { recordType: 'receiving.held_line', action: 'approve' },
    { recordType: 'access.approval_request', action: 'view' },
    { recordType: 'access.approval_reason', action: 'view' },
  ]);
  bookingApprover = await enrolled('FND-BOOKING-APPROVER', BOOKING_APPROVER_AUTHORITY);
  booking = await enrolled('FND-BOOKING', [
    ...BOOKING_APPROVER_AUTHORITY,
    { recordType: 'receiving.held_line', action: 'edit' },
    { recordType: 'merchandise.vocabulary_value', action: 'view' },
  ]);
  operations = await enrolled('FND-OPS', DECIDER_AUTHORITY);
  settingsAdmin = await enrolled('FND-SETTINGS', [
    ...LIMIT_ADMIN_AUTHORITY,
    { recordType: 'exceptions.exception_routing', action: 'view' },
    { recordType: 'exceptions.exception_routing', action: 'edit' },
  ]);
  settingsApprover = await enrolled('FND-SETTINGS-APPROVER', [
    ...LIMIT_APPROVER_AUTHORITY,
    { recordType: 'exceptions.exception_routing', action: 'approve' },
    { recordType: 'access.approval_request', action: 'view' },
  ]);
  // SYNTHETIC limits over Unknown cost (V-02): the Booking approvers, Booking and the receiver, who hold approve.
  for (const person of [bookingApprover, booking, receiver]) await unknownOnlyLimit(person);
  await unknownOnlyLimit(operations, DAMAGE_DECISION);
  // The follow-ups' SYNTHETIC routings: the findings to Booking, damage to Operations (POL-02.16; V-03).
  for (const type of [
    'receiving.shortage',
    'receiving.excess',
    'receiving.wrong-goods',
    'receiving.unidentified-goods',
    // Every GRN here is received without a booking, so it goes to Booking for review (goods-in 4.10; RR-580).
    'receiving.booking-review',
  ]) {
    await route(type, bookingApprover);
  }
  await route('stock.damage', operations);
}, 400_000);

afterAll(async () => {
  await (setup as StructureSetup | undefined)?.close();
  await (router as OrganisationRouter | undefined)?.close();
  await (api as AccessTestApp | undefined)?.close();
  await (minio as TestFileStore | undefined)?.stop();
  await (world as SyntheticWorld | undefined)?.reset();
});

/** The GRN lines of an issued Arrival, by style code or description. */
async function grnLines(arrivalId: string, person: Person = receiver): Promise<Map<string, GrnLine>> {
  const arrival = await readArrival(person, arrivalId);
  return new Map((arrival.grn?.lines ?? []).map((line) => [line.styleCode ?? line.description ?? '', line]));
}

describe('a shortage at the count (goods-in 12 test 1; PRD-ACP-001, PRD-REC-008)', () => {
  it('PRD-ACP-001 PRD-REC-008 invoice 10, counted 8: custody 8 and a shortage of 2 with Booking; no invoice quantity creates stock', async () => {
    const arrivalId = await arrivalWithInvoice();
    await saveLines(arrivalId, [onInvoice('SYN-T1-SHORT', 10, 8)]);
    const issued = await issue(arrivalId);
    expect(issued.status, JSON.stringify(issued.body)).toBe(200);
    const line = (await grnLines(arrivalId)).get('SYN-T1-SHORT');
    expect(line).toMatchObject({
      invoiceQuantity: 10,
      countedQuantity: 8,
      findings: { shortage: 2, extra: 0, received: 8, damaged: 0 },
      heldLine: null,
      damage: null,
    });
    expect(await custodyOfLine(line?.id ?? '')).toEqual({ good: 8 });
    expect(await holdsOfLine(line?.id ?? '')).toEqual([]);
    // The shortage reaches Booking in My work, with its exposure Unknown (PRD-EXC-001; POL-02.16).
    const grnId = (issued.body as { grnId: string }).grnId;
    // So does the GRN itself, received without a booking, for its lines to be linked later (goods-in 4.10; RR-580).
    expect(await exceptionsOn([grnId])).toEqual([
      expect.objectContaining({ type: 'receiving.booking-review', owner_user_id: bookingApprover.user.id }),
      expect.objectContaining({ type: 'receiving.shortage', owner_user_id: bookingApprover.user.id }),
    ]);
    const work = myWorkSchema.parse((await get(bookingApprover, '/api/inbox/my-work')).body).items;
    expect(work).toEqual(
      expect.arrayContaining([expect.objectContaining({ kind: 'exception', exposure: { kind: 'unknown' } })]),
    );
  });

  it('PRD-ACP-001 a delivery short of every piece makes a GRN with no custody at all', async () => {
    const arrivalId = await arrivalWithInvoice();
    await saveLines(arrivalId, [onInvoice('SYN-T1-NONE', 3, 0)]);
    const issued = await issue(arrivalId);
    expect(issued.status, JSON.stringify(issued.body)).toBe(200);
    const line = (await grnLines(arrivalId)).get('SYN-T1-NONE');
    expect(line?.findings).toEqual({ shortage: 3, extra: 0, received: 0, damaged: 0 });
    expect(await custodyOfLine(line?.id ?? '')).toEqual({});
    // Nothing received delivers nothing to review against a booking: only the shortage reaches Booking (RR-580).
    expect((await exceptionsOn([(issued.body as { grnId: string }).grnId])).map((each) => each.type)).toEqual([
      'receiving.shortage',
    ]);
  });
});

describe('the policy gate of held lines and of damage at the count (goods-in 10.5; PRD-SEC-017)', () => {
  it('PRD-SEC-017 a held line is decided, and damage at the count reported, only once policy 17 is Signed and validated', async () => {
    const arrivalId = await arrivalWithInvoice();
    await saveLines(arrivalId, [onInvoice('SYN-GATE-EXCESS', 2, 3, { extra: 'received' })]);
    // The excess is held whatever policy 17's state: holding it is part of the GRN (goods-in 10.5).
    const issued = await issue(arrivalId);
    expect(issued.status, JSON.stringify(issued.body)).toBe(200);
    const held = (await grnLines(arrivalId)).get('SYN-GATE-EXCESS')?.heldLine;
    const closed = await decide(bookingApprover, held?.requestId ?? '', held?.versionToken ?? '', 'approve');
    expect(closed.status, JSON.stringify(closed.body)).toBe(403);
    expect(errorOf(closed)?.code).toBe('configuration.operation-unavailable');
    expect(errorOf(closed)?.missing).toEqual(
      expect.arrayContaining([{ kind: 'policy', policy: '17', lacks: 'signature' }]),
    );
    // Damage at the count is a damage report, which policy 17 gates too (goods-in 8.5).
    const damaged = await arrivalWithInvoice();
    await saveLines(damaged, [
      onInvoice('SYN-GATE-DAMAGE', 2, 2, { damage: { quantity: 1, description: 'SYNTHETIC stain', photo: null } }),
    ]);
    const refused = await issue(damaged);
    expect(errorOf(refused)?.code).toBe('configuration.operation-unavailable');
    expect(errorOf(refused)?.missing).toEqual(
      expect.arrayContaining([{ kind: 'capability', capability: 'stock.damage-reports' }]),
    );
    // Nothing of the refused GRN was written: its Arrival waits for its GRN still.
    expect((await readArrival(receiver, damaged)).grn).toBeNull();
    // Policy 17 Signed and validated on the test-only check's SYNTHETIC value, the damage capability on (DM-6).
    await damageGateOpen(setup, database);
  });
});

/** The Arrival of design test 2's GRN, with every finding; issued in its first test. */
let mixed: string;
let lines: Map<string, GrnLine>;

describe('a GRN with clean, short, excess, wrong, unidentified and damaged lines (goods-in 12 test 2; 4.4, 4.5)', () => {
  it('PRD-REC-006 PRD-REC-012 PRD-DMG-001 each held kind stays held, apart, and goods not received make no custody', async () => {
    mixed = await arrivalWithInvoice();
    const photo = await storedFile(receiver);
    await saveLines(mixed, [
      onInvoice('SYN-T2-CLEAN', 4, 4),
      onInvoice('SYN-T2-SHORT', 10, 8, {
        damage: { quantity: 2, description: 'SYNTHETIC torn seam seen at the count', photo },
      }),
      onInvoice('SYN-T2-EXCESS', 5, 7, { extra: 'received' }),
      onInvoice('SYN-T2-OVER', 3, 4, { extra: 'not-received' }),
      {
        goods: 'wrong',
        styleCode: fixture.batchSku.styleCode,
        colour: null,
        // Wrong goods are sized, as goods on the invoice are (goods-in 4.3; RR-586).
        sizeValueId: fixture.sizes.values[0]?.id ?? null,
        skuId: fixture.batchSku.id,
        description: null,
        invoiceQuantity: 0,
        countedQuantity: 2,
        extra: 'received',
        damage: null,
        batch: { code: 'SYN-BATCH-FND', expiryDate: setup.day(90) },
      },
      {
        goods: 'unidentified',
        styleCode: null,
        colour: null,
        sizeValueId: null,
        skuId: null,
        description: 'SYNTHETIC blue jacket, no tag',
        invoiceQuantity: 0,
        countedQuantity: 3,
        extra: 'received',
        damage: null,
        batch: null,
      },
      {
        goods: 'unidentified',
        styleCode: null,
        colour: null,
        sizeValueId: null,
        skuId: null,
        description: 'SYNTHETIC red scarf, sent back with the lorry',
        invoiceQuantity: 0,
        countedQuantity: 1,
        extra: 'not-received',
        damage: null,
        batch: null,
      },
    ]);
    const issued = await issue(mixed);
    expect(issued.status, JSON.stringify(issued.body)).toBe(200);
    lines = await grnLines(mixed);
    const of = (key: string) => {
      const line = lines.get(key);
      if (line === undefined) throw new Error(`no line ${key}`);
      return line;
    };
    const wrong = of(fixture.batchSku.styleCode);
    const unidentified = of('SYNTHETIC blue jacket, no tag');
    const sentBack = of('SYNTHETIC red scarf, sent back with the lorry');
    // Custody from the count only, in the condition each finding gives it (PRD-REC-008; stock-ledger 13.16).
    expect(await custodyOfLine(of('SYN-T2-CLEAN').id)).toEqual({ good: 4 });
    expect(await custodyOfLine(of('SYN-T2-SHORT').id)).toEqual({ good: 8 });
    expect(await custodyOfLine(of('SYN-T2-EXCESS').id)).toEqual({ good: 7 });
    expect(await custodyOfLine(of('SYN-T2-OVER').id)).toEqual({ good: 3 });
    expect(await custodyOfLine(wrong.id)).toEqual({ wrong: 2 });
    expect(await custodyOfLine(unidentified.id)).toEqual({ unidentified: 3 });
    expect(await custodyOfLine(sentBack.id)).toEqual({});
    // Each held kind under its own hold (stock-ledger 6.1): damage, excess, quarantine.
    expect(await holdsOfLine(of('SYN-T2-CLEAN').id)).toEqual([]);
    expect(await holdsOfLine(of('SYN-T2-SHORT').id)).toEqual([{ kind: 'damage', condition: 'good', quantity: 2 }]);
    expect(await holdsOfLine(of('SYN-T2-EXCESS').id)).toEqual([{ kind: 'excess', condition: 'good', quantity: 2 }]);
    expect(await holdsOfLine(of('SYN-T2-OVER').id)).toEqual([]);
    expect(await holdsOfLine(wrong.id)).toEqual([{ kind: 'quarantine', condition: 'wrong', quantity: 2 }]);
    expect(await holdsOfLine(unidentified.id)).toEqual([
      { kind: 'quarantine', condition: 'unidentified', quantity: 3 },
    ]);
    // The findings, kept apart on each line (PRD-REC-006), and the GRN keeps the goods not received as a record.
    expect(of('SYN-T2-SHORT')).toMatchObject({
      findings: { shortage: 2, extra: 0, received: 8, damaged: 2 },
      damage: { quantity: 2, description: 'SYNTHETIC torn seam seen at the count' },
    });
    expect(of('SYN-T2-OVER')).toMatchObject({
      extra: 'not-received',
      findings: { shortage: 0, extra: 1, received: 3, damaged: 0 },
      heldLine: null,
    });
    expect(sentBack).toMatchObject({ goods: 'unidentified', styleCode: null, findings: { received: 0 } });
    expect(of('SYN-T2-EXCESS').heldLine).toMatchObject({ kind: 'excess', quantity: 2, state: 'Awaiting approval' });
    expect(wrong.heldLine).toMatchObject({ kind: 'wrong', quantity: 2, state: 'Awaiting approval' });
    expect(unidentified.heldLine).toMatchObject({ kind: 'unidentified', quantity: 3, named: null });
  });

  it('POL-02.16 PRD-EXC-001 shortage, excess, wrong and unidentified goods reach Booking; damage reaches Operations', async () => {
    const grnId = (await readArrival(receiver, mixed)).grn?.id ?? '';
    const held = [...lines.values()].flatMap((line) => (line.heldLine === null ? [] : [line.heldLine.id]));
    const raised = await exceptionsOn([grnId, ...held]);
    // Each held line's, and those of the GRN: its shortage and the extra pieces it records as not received.
    expect(
      raised.map((each) => [each.type, each.record_id === grnId ? 'grn' : 'held-line', each.owner_user_id]).sort(),
    ).toEqual(
      [
        ['receiving.booking-review', 'grn', bookingApprover.user.id],
        ['receiving.excess', 'grn', bookingApprover.user.id],
        ['receiving.excess', 'held-line', bookingApprover.user.id],
        ['receiving.shortage', 'grn', bookingApprover.user.id],
        ['receiving.unidentified-goods', 'grn', bookingApprover.user.id],
        ['receiving.unidentified-goods', 'held-line', bookingApprover.user.id],
        ['receiving.wrong-goods', 'held-line', bookingApprover.user.id],
      ].sort(),
    );
    const report = lines.get('SYN-T2-SHORT')?.damage?.damageReportId ?? '';
    expect(await exceptionsOn([report])).toEqual([
      expect.objectContaining({ type: 'stock.damage', owner_user_id: operations.user.id }),
    ]);
    // The inbox shows the GRN waiting for its held lines (goods-in 4.1).
    const inbox = inboxSchema.parse(
      (await get(receiver, `/api/receiving/sites/${fixture.siteId}/inbox?view=pending`)).body,
    );
    expect(inbox.entries.find((each) => each.arrivalId === mixed)?.waitingFor).toBe('held-lines');
  });

  it('PRD-EXC-001 POL-02.16 extra pieces recorded as not received reach Booking, one follow-up a kind linking to the GRN, which Booking resolves', async () => {
    const arrivalId = await arrivalWithInvoice();
    await saveLines(arrivalId, [
      onInvoice('SYN-NR-OVER-1', 2, 3, { extra: 'not-received' }),
      onInvoice('SYN-NR-OVER-2', 1, 2, { extra: 'not-received' }),
      {
        goods: 'wrong',
        styleCode: fixture.batchSku.styleCode,
        colour: null,
        // Wrong goods are sized, as goods on the invoice are (goods-in 4.3; RR-586).
        sizeValueId: fixture.sizes.values[0]?.id ?? null,
        skuId: fixture.batchSku.id,
        description: null,
        invoiceQuantity: 0,
        countedQuantity: 1,
        extra: 'not-received',
        damage: null,
        batch: { code: 'SYN-BATCH-NR', expiryDate: setup.day(90) },
      },
    ]);
    const issued = await issue(arrivalId);
    expect(issued.status, JSON.stringify(issued.body)).toBe(200);
    const grnId = (issued.body as { grnId: string }).grnId;
    // Nothing of them is in custody or held, but each kind reaches Booking (goods-in 4.4, 4.5).
    for (const line of (await grnLines(arrivalId)).values()) {
      expect(line.heldLine).toBeNull();
      expect(await custodyOfLine(line.id)).toEqual(
        line.styleCode === fixture.batchSku.styleCode
          ? {}
          : {
              good: line.invoiceQuantity,
            },
      );
    }
    const raised = await exceptionsOn([grnId]);
    expect(raised.map((each) => [each.type, each.owner_user_id])).toEqual([
      ['receiving.booking-review', bookingApprover.user.id],
      ['receiving.excess', bookingApprover.user.id],
      ['receiving.wrong-goods', bookingApprover.user.id],
    ]);
    // Nothing in the app settles goods sent back before supplier returns (stage 3): Booking resolves it (RR-572).
    for (const each of raised) {
      const closed = await post(bookingApprover, `/api/exceptions/exceptions/${each.id}/close`, {});
      expect(closed.status, JSON.stringify(closed.body)).toBe(200);
    }
  });
});

describe('deciding the held lines (goods-in 4.6; PRD-REC-013, POL-17.02, POL-17.11)', () => {
  const heldOf = (key: string) => {
    const held = lines.get(key)?.heldLine;
    if (held?.requestId == null) throw new Error(`no held line ${key}`);
    return { ...held, requestId: held.requestId };
  };

  it('PRD-REC-013 POL-02.07 whoever received the goods cannot decide them', async () => {
    const excess = heldOf('SYN-T2-EXCESS');
    const own = await decide(receiver, excess.requestId, excess.versionToken, 'approve');
    expect(own.status).toBe(422);
    expect(errorOf(own)?.code).toBe('access.self-preparation');
  });

  it('PRD-REC-013 a Booking approver takes the excess in; the finding stays and the excess hold stays until the PT route', async () => {
    const excess = heldOf('SYN-T2-EXCESS');
    const taken = await decide(bookingApprover, excess.requestId, excess.versionToken, 'approve');
    expect(taken.status, JSON.stringify(taken.body)).toBe(200);
    const line = (await grnLines(mixed)).get('SYN-T2-EXCESS');
    expect(line).toMatchObject({
      findings: { extra: 2 },
      heldLine: { state: 'Accepted', decision: { outcome: 'taken-in', decidedBy: bookingApprover.user.id } },
    });
    // Taking goods in releases no hold: the PT route does, at PT approval (goods-in 4.6, 6.3 step 5).
    expect(await holdsOfLine(line?.id ?? '')).toEqual([{ kind: 'excess', condition: 'good', quantity: 2 }]);
    const again = await decide(bookingApprover, excess.requestId, excess.versionToken, 'reject');
    expect(again.status).toBeGreaterThanOrEqual(400);
  });

  it('POL-17.02 unidentified goods are taken in only once Booking names their product; whoever names it does not decide it', async () => {
    const unidentified = heldOf('SYNTHETIC blue jacket, no tag');
    const unnamed = await decide(bookingApprover, unidentified.requestId, unidentified.versionToken, 'approve');
    expect(unnamed.status).toBe(422);
    expect(errorOf(unnamed)?.code).toBe('receiving.product-not-named');
    // Only unidentified goods are named a product, and only while undecided.
    const wrong = heldOf(fixture.batchSku.styleCode);
    const notUnidentified = await post(booking, `/api/receiving/held-lines/${wrong.id}/product`, {
      versionToken: wrong.versionToken,
      styleCode: 'SYN-NAMED',
      colour: null,
      sizeValueId: null,
      skuId: null,
    });
    expect(errorOf(notUnidentified)?.code).toBe('receiving.not-unidentified');
    const excess = heldOf('SYN-T2-EXCESS');
    const decided = await post(booking, `/api/receiving/held-lines/${excess.id}/product`, {
      versionToken: excess.versionToken,
      styleCode: 'SYN-NAMED',
      colour: null,
      sizeValueId: null,
      skuId: null,
    });
    expect(errorOf(decided)?.code).toBe('receiving.held-line-decided');
    const stale = await post(booking, `/api/receiving/held-lines/${unidentified.id}/product`, {
      versionToken: uuidv7(),
      styleCode: 'SYN-T2-NAMED',
      colour: 'SYNTHETIC BLUE',
      sizeValueId: fixture.sizes.values[1]?.id ?? null,
      skuId: null,
    });
    expect(stale.status).toBe(409);
    const named = await post(booking, `/api/receiving/held-lines/${unidentified.id}/product`, {
      versionToken: unidentified.versionToken,
      styleCode: 'SYN-T2-NAMED',
      colour: 'SYNTHETIC BLUE',
      sizeValueId: fixture.sizes.values[1]?.id ?? null,
      skuId: null,
    });
    expect(named.status, JSON.stringify(named.body)).toBe(200);
    const { versionToken, requestId } = named.body as { versionToken: string; requestId: string };
    // The decision is asked again on the named version; the earlier request can no longer be decided (9.6).
    const superseded = await decide(bookingApprover, unidentified.requestId, unidentified.versionToken, 'approve');
    expect(superseded.status).toBeGreaterThanOrEqual(400);
    const own = await decide(booking, requestId, versionToken, 'approve');
    expect(errorOf(own)?.code).toBe('access.self-preparation');
    const taken = await decide(bookingApprover, requestId, versionToken, 'approve');
    expect(taken.status, JSON.stringify(taken.body)).toBe(200);
    const read = await get(bookingApprover, `/api/receiving/held-lines/${unidentified.id}`);
    expect(read.status, JSON.stringify(read.body)).toBe(200);
    expect(heldLineReadSchema.parse(read.body)).toMatchObject({
      arrivalId: mixed,
      line: {
        goods: 'unidentified',
        heldLine: {
          state: 'Accepted',
          named: { styleCode: 'SYN-T2-NAMED', colour: 'SYNTHETIC BLUE', size: { code: fixture.sizes.values[1]?.code } },
        },
      },
    });
  });

  it('POL-17.02 wrong goods left held stay in quarantine until a supplier return', async () => {
    const wrong = heldOf(fixture.batchSku.styleCode);
    const left = await decide(bookingApprover, wrong.requestId, wrong.versionToken, 'reject');
    expect(left.status, JSON.stringify(left.body)).toBe(200);
    const line = (await grnLines(mixed)).get(fixture.batchSku.styleCode);
    expect(line?.heldLine).toMatchObject({ state: 'Held', decision: { outcome: 'left-held' } });
    expect(await holdsOfLine(line?.id ?? '')).toEqual([{ kind: 'quarantine', condition: 'wrong', quantity: 2 }]);
  });

  it('PRD-EXC-002 a held line’s follow-up closes once its goods are taken in; goods left held keep it open', async () => {
    const wrongLine = lines.get(fixture.batchSku.styleCode)?.heldLine?.id;
    const held = [...lines.values()].flatMap((line) => (line.heldLine === null ? [] : [line.heldLine.id]));
    const raised = await exceptionsOn(held);
    expect(raised).toHaveLength(3);
    for (const each of raised) {
      const closed = await post(bookingApprover, `/api/exceptions/exceptions/${each.id}/close`, {});
      if (each.record_id === wrongLine) {
        // Left held, the wrong goods wait for their supplier return (stage 3): the outcome is not verified yet.
        expect(closed.status).toBe(422);
        expect(errorOf(closed)?.code).toBe('exceptions.resolution-not-verified');
        expect(errorOf(closed)?.missing).toContainEqual({
          kind: 'record',
          recordType: 'receiving.held_line',
          recordId: wrongLine,
        });
      } else {
        expect(closed.status, JSON.stringify(closed.body)).toBe(200);
      }
    }
  });
});

describe('a held line the reader may not see (code-house-rules 12.3, 12.4)', () => {
  it('PRD-SEC-005 a held line hidden from the reader, or not there, is not found, never not authorised; and so is a replay', async () => {
    const otherStore = await enrolled(
      'FND-OTHER-STORE',
      [
        { recordType: 'receiving.arrival', action: 'view' },
        { recordType: 'receiving.held_line', action: 'edit' },
        { recordType: 'merchandise.vocabulary_value', action: 'view' },
      ],
      placeScope([{ type: 'store', id: fixture.otherStoreId }]),
    );
    const excess = lines.get('SYN-T2-EXCESS')?.heldLine;
    if (excess == null) throw new Error('no held line');
    for (const heldLineId of [excess.id, uuidv7()]) {
      const read = await get(otherStore, `/api/receiving/held-lines/${heldLineId}`);
      expect(read.status).toBe(404);
      expect(errorOf(read)).toMatchObject({
        code: 'receiving.record-not-found',
        missing: [{ kind: 'record', recordType: 'receiving.held_line', recordId: heldLineId }],
      });
    }
    // Naming a product of it is not found too, and its replay under the same key answers as any request failing the
    // same checks would: not found again, never not authorised (12.4 "Replay").
    const key = uuidv7();
    const body = {
      versionToken: excess.versionToken,
      styleCode: 'SYN-HIDDEN',
      colour: null,
      sizeValueId: null,
      skuId: null,
    };
    for (const attempt of ['first', 'replay']) {
      const named = await post(otherStore, `/api/receiving/held-lines/${excess.id}/product`, body, key);
      expect([attempt, named.status, errorOf(named)?.code]).toEqual([attempt, 404, 'receiving.record-not-found']);
    }
    // The Arrival it belongs to is hidden from them alike.
    const arrival = await get(otherStore, `/api/receiving/arrivals/${mixed}`);
    expect([arrival.status, errorOf(arrival)?.code]).toEqual([404, 'receiving.record-not-found']);
  });
});

describe('what the PT reads of the GRN (goods-in 5.1, 5.4)', () => {
  it('DEC-137 the GRN waits while damage at the count is undecided; then its good pieces per style and size', async () => {
    const receiving = api.app.get<ReceivingInterface>(RECEIVING);
    const grnId = (await readArrival(receiver, mixed)).grn?.id ?? '';
    const before = await asUserIn(api.app, organisation, receiver.user.id, (context) =>
      receiving.ptBasis(context, grnId),
    );
    const report = lines.get('SYN-T2-SHORT')?.damage?.damageReportId ?? '';
    expect(before?.undecided).toEqual([{ kind: 'damage-report', damageReportId: report }]);
    // Operations confirms the damage (goods-in 8.3), through the approval route.
    const reportRead = await get(operations, `/api/stock/damage-reports/${report}`);
    const { versionToken, rounds } = reportRead.body.report as {
      versionToken: string;
      rounds: { requestId: string }[];
    };
    const confirmed = await decide(operations, rounds[0]?.requestId ?? '', versionToken, 'approve');
    expect(confirmed.status, JSON.stringify(confirmed.body)).toBe(200);
    const after = await asUserIn(api.app, organisation, receiver.user.id, (context) =>
      receiving.ptBasis(context, grnId),
    );
    expect(after?.undecided).toEqual([]);
    const size0 = fixture.sizes.values[0]?.code ?? null;
    const goods = Object.fromEntries(
      (after?.goods ?? []).map((group) => [`${group.styleCode}|${group.size ?? ''}`, group.quantity]),
    );
    // SYNTHETIC hand-worked: clean 4; short 8 received less 2 confirmed damaged; excess 7 with its 2 taken in; over 3
    // received; the wrong goods left held, none; the unidentified goods taken in under the style and size named, 3.
    expect(goods).toEqual({
      [`SYN-T2-CLEAN|${size0 ?? ''}`]: 4,
      [`SYN-T2-SHORT|${size0 ?? ''}`]: 6,
      [`SYN-T2-EXCESS|${size0 ?? ''}`]: 7,
      [`SYN-T2-OVER|${size0 ?? ''}`]: 3,
      [`SYN-T2-NAMED|${fixture.sizes.values[1]?.code ?? ''}`]: 3,
    });
    const excess = after?.goods.find((group) => group.styleCode === 'SYN-T2-EXCESS');
    expect(excess?.parts[0]?.releases).toEqual([expect.objectContaining({ event: 'pt-route' })]);
    const named = after?.goods.find((group) => group.styleCode === 'SYN-T2-NAMED');
    expect(named?.parts[0]?.releases).toEqual([expect.objectContaining({ event: 'approved-decision' })]);
    const inbox = inboxSchema.parse(
      (await get(receiver, `/api/receiving/sites/${fixture.siteId}/inbox?view=pending`)).body,
    );
    expect(inbox.entries.find((each) => each.arrivalId === mixed)?.waitingFor).toBe('pt');
  });
});

describe('the receipt problems read model (goods-in 9.3)', () => {
  it('PRD-REC-006 every GRN line with a finding, with its decision and who made it, a page at a time', async () => {
    const receiving = api.app.get<ReceivingInterface>(RECEIVING);
    const access = api.app.get<AccessInterface>(ACCESS);
    const read = await asUserIn(api.app, organisation, bookingApprover.user.id, (context) =>
      receiving.receiptProblems(context, { siteId: fixture.siteId }, (ids) => access.approvalRequestsOf(context, ids)),
    );
    const keys = read.rows.map((row) => row.line.styleCode ?? row.line.description);
    expect(keys).toEqual(
      expect.arrayContaining([
        'SYN-T1-SHORT',
        'SYN-T1-NONE',
        'SYN-T2-SHORT',
        'SYN-T2-EXCESS',
        'SYN-T2-OVER',
        fixture.batchSku.styleCode,
        'SYNTHETIC blue jacket, no tag',
        'SYNTHETIC red scarf, sent back with the lorry',
      ]),
    );
    expect(keys).not.toContain('SYN-T2-CLEAN');
    const excess = read.rows.find((row) => row.line.styleCode === 'SYN-T2-EXCESS');
    expect(excess?.line.heldLine?.decision).toMatchObject({ outcome: 'taken-in', decidedBy: bookingApprover.user.id });
    const page = await asUserIn(api.app, organisation, bookingApprover.user.id, (context) =>
      receiving.receiptProblems(context, { siteId: fixture.siteId, limit: 2 }, (ids) =>
        access.approvalRequestsOf(context, ids),
      ),
    );
    expect(page.rows).toHaveLength(2);
    expect(page.next).toBe(page.rows[1]?.line.id);
  });
});

/** Operations confirms a damage report through the approval route, as My work does (goods-in 8.3). */
async function confirmDamage(reportId: string): Promise<void> {
  const read = await get(operations, `/api/stock/damage-reports/${reportId}`);
  expect(read.status, JSON.stringify(read.body)).toBe(200);
  const { versionToken, rounds } = read.body.report as { versionToken: string; rounds: { requestId: string }[] };
  const confirmed = await decide(operations, rounds[0]?.requestId ?? '', versionToken, 'approve');
  expect(confirmed.status, JSON.stringify(confirmed.body)).toBe(200);
}

/** The lines of the GRN whose excess, wrong and unidentified goods were found damaged; issued in the first test. */
let damagedLines: Map<string, GrnLine>;
const damagedLine = (key: string): GrnLine => {
  const line = damagedLines.get(key);
  if (line?.damage == null) throw new Error(`no damaged line ${key}`);
  return line;
};

describe('damage at the count on any piece received (goods-in 4.4, 4.9; stock-ledger 13.17; RR-571)', () => {
  it('PRD-REC-006 PRD-DMG-001 RR-571 damage on excess, wrong and unidentified goods is reported at the count, held beside their own holds', async () => {
    const arrivalId = await arrivalWithInvoice();
    const unidentified = (extra: 'received' | 'not-received', quantity: number) => ({
      goods: 'unidentified',
      styleCode: null,
      colour: null,
      sizeValueId: null,
      skuId: null,
      description: 'SYNTHETIC green shawl, no tag',
      invoiceQuantity: 0,
      countedQuantity: 3,
      extra,
      damage: { quantity, description: 'SYNTHETIC stained', photo: null },
      batch: null,
    });
    // Never on pieces not received, which are not at the Site (goods-in 4.4).
    const notReceived = await post(
      receiver,
      `/api/receiving/arrivals/${arrivalId}/count-lines`,
      unidentified('not-received', 1),
    );
    expect(notReceived.status).toBe(400);
    await saveLines(arrivalId, [
      onInvoice('SYN-DMG-EXCESS', 2, 4, {
        extra: 'received',
        damage: { quantity: 3, description: 'SYNTHETIC torn, excess pieces among them', photo: null },
      }),
      {
        goods: 'wrong',
        styleCode: fixture.batchSku.styleCode,
        colour: null,
        // Wrong goods are sized, as goods on the invoice are (goods-in 4.3; RR-586).
        sizeValueId: fixture.sizes.values[0]?.id ?? null,
        skuId: fixture.batchSku.id,
        description: null,
        invoiceQuantity: 0,
        countedQuantity: 2,
        extra: 'received',
        damage: { quantity: 1, description: 'SYNTHETIC crushed', photo: null },
        batch: { code: 'SYN-BATCH-DMG', expiryDate: setup.day(90) },
      },
      unidentified('received', 2),
    ]);
    const issued = await issue(arrivalId);
    expect(issued.status, JSON.stringify(issued.body)).toBe(200);
    damagedLines = await grnLines(arrivalId);
    // Each damage hold on the goods in the condition the count received them in, beside their excess hold or
    // quarantine (stock-ledger 6.2, 13.16).
    expect(await holdsOfLine(damagedLine('SYN-DMG-EXCESS').id)).toEqual([
      { kind: 'damage', condition: 'good', quantity: 3 },
      { kind: 'excess', condition: 'good', quantity: 2 },
    ]);
    expect(await holdsOfLine(damagedLine(fixture.batchSku.styleCode).id)).toEqual([
      { kind: 'damage', condition: 'wrong', quantity: 1 },
      { kind: 'quarantine', condition: 'wrong', quantity: 2 },
    ]);
    expect(await holdsOfLine(damagedLine('SYNTHETIC green shawl, no tag').id)).toEqual([
      { kind: 'damage', condition: 'unidentified', quantity: 2 },
      { kind: 'quarantine', condition: 'unidentified', quantity: 3 },
    ]);
  });

  it('PRD-DMG-006 RR-571 confirmed damage on excess goods: damaged, the excess hold carried with the excess pieces it holds', async () => {
    const line = damagedLine('SYN-DMG-EXCESS');
    await confirmDamage(line.damage?.damageReportId ?? '');
    // Two free pieces first, then one the excess hold holds, its claim carried (stock-ledger 13.17).
    expect(await custodyOfLine(line.id)).toEqual({ good: 1, damaged: 3 });
    expect(await holdsOfLine(line.id)).toEqual([
      { kind: 'excess', condition: 'damaged', quantity: 1 },
      { kind: 'excess', condition: 'good', quantity: 1 },
      { kind: 'quarantine', condition: 'damaged', quantity: 3 },
    ]);
  });

  it('PRD-DMG-006 RR-571 confirmed damage on wrong goods: damaged, still quarantined as wrong besides', async () => {
    const line = damagedLine(fixture.batchSku.styleCode);
    await confirmDamage(line.damage?.damageReportId ?? '');
    expect(await custodyOfLine(line.id)).toEqual({ wrong: 1, damaged: 1 });
    expect(await holdsOfLine(line.id)).toEqual([
      { kind: 'quarantine', condition: 'damaged', quantity: 2 },
      { kind: 'quarantine', condition: 'wrong', quantity: 1 },
    ]);
  });

  it('PRD-DMG-006 RR-571 confirmed damage on unidentified goods: damaged, their identity still Unknown and quarantined', async () => {
    const line = damagedLine('SYNTHETIC green shawl, no tag');
    await confirmDamage(line.damage?.damageReportId ?? '');
    expect(await custodyOfLine(line.id)).toEqual({ unidentified: 1, damaged: 2 });
    expect(await holdsOfLine(line.id)).toEqual([
      { kind: 'quarantine', condition: 'damaged', quantity: 4 },
      { kind: 'quarantine', condition: 'unidentified', quantity: 1 },
    ]);
  });
});
