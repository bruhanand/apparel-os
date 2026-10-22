import { randomInt } from 'node:crypto';
import { uuidv7 } from '@apparel-os/domain';
import {
  DAMAGE_DECISION,
  DAMAGE_REVERSAL_APPROVAL,
  arrivalReadSchema,
  damageReportReadSchema,
  myWorkSchema,
  type Arrival,
  type AssignmentScope,
  type DamageReport,
} from '@apparel-os/schemas';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { OrganisationRouter, type RoutedOrganisation } from '../src/kernel/index.js';
import { ACCESS, type AccessInterface } from '../src/modules/access/index.js';
import { NUMBERING, type NumberingInterface } from '../src/modules/numbering/index.js';
import { STOCK_DOCUMENTS, type StockDocumentsInterface } from '../src/modules/stock/documents/index.js';
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
  limitFor,
  PROPOSER_AUTHORITY,
  REPORTER_AUTHORITY,
  REVERSAL_APPROVER_AUTHORITY,
  storeScope,
  SYNTHETIC_POLICY_17_VALUES,
  type DamageLimit,
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
  RECEIVER_AUTHORITY,
  receivingFixture,
  receivingGateOpen,
  receivingGranted,
  type ReceivingFixture,
} from './support/receiving.js';

// S2-F08-T01: damage reports through the whole application, on real PostgreSQL (goods-in 8, 10.2 to 10.5, 12 test 16;
// PRD-DMG-001 to PRD-DMG-006, PRD-DMG-010, PRD-STK-017, PRD-ACP-005; stock-ledger 13.15). Goods come into custody through
// receiving's own routes (support/receiving.ts); the decision is made through `access`'s approval route, as My work
// makes it (access-and-approvals 9.5). Policy 17 reports no values yet, so the gate opens on the one value of a
// test-only check, labelled synthetic (support/damage.ts). Every person, place, product, limit and number is SYNTHETIC.

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
/** A Store's staff (P-STM) who receive and report damage there; they may also approve, to prove they cannot (8.3). */
let reporter: Person;
/** Operations (P-OPS), who follows damage up and decides reports, with authority over Unknown cost. */
let operations: Person;
/** A decider whose limit covers known cost only, never Unknown (PRD-ACS-016). */
let cautious: Person;
/** Who proposes a reversal of a confirmation, holding approve too, to prove they cannot approve their own. */
let proposer: Person;
/** Who approves a reversal, a different person from its proposer. */
let reversalApprover: Person;
/** A reader of damage reports at the other Store only, whose scope covers none of these reports. */
let outsider: Person;
/** The GRN lines the reports name: goods of a product not yet set up, and the batch-tracked product. */
let describedLine: string;
let productLine: string;

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
  // Each permission once, though the authorities given may share some (a receiver's and a reporter's do).
  const once = [...new Map(authorities.map((each) => [`${each.recordType}:${each.action}`, each])).values()];
  const { assignmentId } = await grantSynthetic(
    database,
    { kind: 'user', id: user.id },
    once,
    scope === undefined ? {} : { scope },
  );
  const response = await fetch(`${api.baseUrl}/api/access/sign-in`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: SYNTHETIC_ORIGIN, 'x-forwarded-for': '10.9.9.73' },
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

/** A SYNTHETIC photo stored through files-imports, as the screen stores it first (S1-F06-T05). */
async function storedFile(person: Person, label: string): Promise<{ storedFileId: string; fileReceiptId: string }> {
  const stored = await post(person, STORE_FILE_PATH, syntheticPdfUpload('DAMAGE', label));
  expect(stored.status, JSON.stringify(stored.body)).toBe(200);
  const { storedFileId, receiptId } = stored.body as { storedFileId: string; receiptId: string };
  return { storedFileId, fileReceiptId: receiptId };
}

/** A report's draft: the goods of a GRN line, or a product, at the Store's receiving location (goods-in 8.2). */
function draftOf(
  goods: { grnLineId: string } | { skuId: string },
  quantity: number,
  extra: Record<string, unknown> = {},
) {
  return {
    locationId: fixture.storeLocation,
    goods: 'grnLineId' in goods ? { kind: 'grn-line', ...goods } : { kind: 'product', ...goods },
    quantity,
    description: 'SYNTHETIC torn seam seen at the count',
    ...extra,
  };
}

async function report(goods: { grnLineId: string } | { skuId: string }, quantity: number) {
  const made = await post(reporter, '/api/stock/damage-reports', draftOf(goods, quantity));
  expect(made.status, JSON.stringify(made.body)).toBe(200);
  return made.body as { damageReportId: string; number: string; versionToken: string; requestId: string };
}

async function readReport(person: Person, reportId: string): Promise<DamageReport> {
  const read = await get(person, `/api/stock/damage-reports/${reportId}`);
  expect(read.status, JSON.stringify(read.body)).toBe(200);
  return damageReportReadSchema.parse(read.body).report;
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

/** Custody of the Store's receiving location, of goods of Unknown SKU or of a product, by condition (13.6). */
async function custodyBy(skuId: string | null): Promise<Record<string, number>> {
  const read = await asUserIn(api.app, organisation, reporter.user.id, (context) =>
    custody(context, { businessUnitId: fixture.wholeStore, locationId: fixture.storeLocation }),
  );
  const totals: Record<string, number> = {};
  for (const row of read.rows.filter((each) => each.skuId === skuId)) {
    totals[row.condition] = (totals[row.condition] ?? 0) + row.quantity;
  }
  return totals;
}

/** The units each hold of the report's goods still claims, by kind and condition, as the verifier reads them (15.4). */
async function holdsOn(
  originOf: 'described' | 'product',
): Promise<{ kind: string; condition: string; quantity: number }[]> {
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
      [originOf === 'described' ? describedLine : productLine],
    );
    return result.rows;
  } finally {
    await verify.end();
  }
}

/** Who prepares and who approves the SYNTHETIC limits and the damage exception's routing, two different people. */
let settingsAdmin: Person;
let settingsApprover: Person;

async function limit(
  person: Person,
  action: typeof DAMAGE_DECISION | typeof DAMAGE_REVERSAL_APPROVAL,
  of: DamageLimit,
) {
  await limitFor(
    api.app,
    organisation,
    { admin: settingsAdmin, approver: settingsApprover.user, approveReasonId: approveReason, code: freshCode },
    person,
    action,
    of,
    setup.today(),
  );
}

/**
 * The damage exception routed at the Site to Operations, through the routing's own route, and approved by a different
 * person (access-and-approvals 12.2, 12.4; POL-02.16): a SYNTHETIC owner and due time, never KDPS's (V-03).
 */
async function routeDamageToOperations(): Promise<void> {
  const prepared = await post(settingsAdmin, '/api/exceptions/routing', {
    typeCode: 'stock.damage',
    siteId: fixture.siteId,
    owner: { kind: 'user', userId: operations.user.id },
    dueRule: { format: 'elapsed-minutes-v1', minutes: 60 },
    escalation: { kind: 'user', userId: operations.user.id },
    validFrom: setup.today(),
    origin: 'synthetic',
  });
  expect(prepared.status, JSON.stringify(prepared.body)).toBe(200);
  const { requestId, versionId } = prepared.body as { requestId: string; versionId: string };
  const decided = await decide(settingsApprover, requestId, versionId, 'approve');
  expect(decided.status, JSON.stringify(decided.body)).toBe(200);
}

beforeAll(async () => {
  world = await createSyntheticOrganisations('damage');
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
    label: 'DAMAGE',
  });
  fixture = await receivingFixture(setup, database, 'DMG');
  await receivingGateOpen(setup, database, [SYNTHETIC_POLICY_17_VALUES]);
  await receivingGranted(setup, database, fixture.siteId, [fixture.wholeStore], [SYNTHETIC_POLICY_17_VALUES]);
  approveReason = await writeSyntheticReason(database, 'approve');
  rejectReason = await writeSyntheticReason(database, 'reject');
  const numbering = api.app.get<NumberingInterface>(NUMBERING);
  await asUserIn(api.app, organisation, setup.preparer.id, async (context) => {
    await defineSyntheticGrnSeries(context, numbering);
    await defineSyntheticCodeSeries(context, numbering);
  });

  reporter = await enrolled(
    'DMG-REPORTER',
    [...RECEIVER_AUTHORITY, ...REPORTER_AUTHORITY, { recordType: 'stock.damage_report', action: 'approve' }],
    storeScope(fixture.storeId),
  );
  operations = await enrolled('DMG-OPS', DECIDER_AUTHORITY);
  cautious = await enrolled('DMG-CAUTIOUS', DECIDER_AUTHORITY);
  proposer = await enrolled('DMG-PROPOSER', [
    ...PROPOSER_AUTHORITY,
    { recordType: 'stock.damage_reversal', action: 'approve' },
  ]);
  reversalApprover = await enrolled('DMG-REVERSAL', REVERSAL_APPROVER_AUTHORITY);
  outsider = await enrolled(
    'DMG-OUTSIDER',
    [{ recordType: 'stock.damage_report', action: 'view' }],
    storeScope(fixture.otherStoreId),
  );
  settingsAdmin = await enrolled('DMG-SETTINGS', [
    ...LIMIT_ADMIN_AUTHORITY,
    { recordType: 'exceptions.exception_routing', action: 'view' },
    { recordType: 'exceptions.exception_routing', action: 'edit' },
  ]);
  settingsApprover = await enrolled('DMG-SETTINGS-APPROVER', [
    ...LIMIT_APPROVER_AUTHORITY,
    { recordType: 'exceptions.exception_routing', action: 'approve' },
    { recordType: 'access.approval_request', action: 'view' },
  ]);
  // SYNTHETIC limits (V-02): Operations and the reporter with authority over Unknown cost, the cautious decider with
  // a known amount only; the reversal's proposer and approver over Unknown too.
  await limit(operations, DAMAGE_DECISION, { kind: 'unknown-only' });
  await limit(reporter, DAMAGE_DECISION, { kind: 'unknown-only' });
  await limit(cautious, DAMAGE_DECISION, { kind: 'amount', paise: 100_000, coversUnknown: false });
  await limit(proposer, DAMAGE_REVERSAL_APPROVAL, { kind: 'unknown-only' });
  await limit(reversalApprover, DAMAGE_REVERSAL_APPROVAL, { kind: 'unknown-only' });
  await routeDamageToOperations();

  // Goods in custody at the Store's receiving location, through receiving's routes (goods-in 4): 6 pieces of a product
  // not yet set up and 5 of the batch-tracked product, each line its own receipt origin.
  const arrival = await post(reporter, '/api/receiving/arrivals', {
    businessUnitId: fixture.wholeStore,
    receivingLocationId: fixture.storeLocation,
    supplierPartyId: fixture.supplier.id,
    brandId: fixture.brand.id,
    transporter: syntheticName('Transporter'),
    lorryReceipt: { number: 'SYN-LR-DMG', date: setup.today() },
    cartons: 2,
    arrivedAt: new Date(clock.now().getTime() - 3_600_000).toISOString(),
  });
  expect(arrival.status, JSON.stringify(arrival.body)).toBe(200);
  const arrivalId = (arrival.body as { arrivalId: string }).arrivalId;
  const invoice = await post(reporter, `/api/receiving/arrivals/${arrivalId}/invoices`, {
    number: `SYN-INV-DMG-${String(randomInt(1_000_000))}`,
    date: setup.today(),
    file: await storedFile(reporter, 'INVOICE'),
  });
  expect(invoice.status, JSON.stringify(invoice.body)).toBe(200);
  for (const line of [
    {
      styleCode: 'SYN-DMG-STYLE',
      colour: 'SYNTHETIC NAVY',
      sizeValueId: fixture.sizes.values[0]?.id ?? null,
      skuId: null,
      invoiceQuantity: 6,
      countedQuantity: 6,
      batch: null,
    },
    {
      styleCode: fixture.batchSku.styleCode,
      colour: null,
      sizeValueId: fixture.sizes.values[1]?.id ?? null,
      skuId: fixture.batchSku.id,
      invoiceQuantity: 5,
      countedQuantity: 5,
      batch: { code: 'SYN-BATCH-DMG', expiryDate: setup.day(90) },
    },
  ]) {
    const saved = await post(reporter, `/api/receiving/arrivals/${arrivalId}/count-lines`, line);
    expect(saved.status, JSON.stringify(saved.body)).toBe(200);
  }
  const read = await get(reporter, `/api/receiving/arrivals/${arrivalId}`);
  const before: Arrival = arrivalReadSchema.parse(read.body).arrival;
  const issued = await post(reporter, `/api/receiving/arrivals/${arrivalId}/grn`, {
    versionToken: before.versionToken,
  });
  expect(issued.status, JSON.stringify(issued.body)).toBe(200);
  const grn = arrivalReadSchema.parse((await get(reporter, `/api/receiving/arrivals/${arrivalId}`)).body).arrival.grn;
  describedLine = grn?.lines.find((each) => each.skuId === null)?.id ?? '';
  productLine = grn?.lines.find((each) => each.skuId === fixture.batchSku.id)?.id ?? '';
}, 300_000);

afterAll(async () => {
  await (setup as StructureSetup | undefined)?.close();
  await (router as OrganisationRouter | undefined)?.close();
  await (api as AccessTestApp | undefined)?.close();
  await (minio as TestFileStore | undefined)?.stop();
  await (world as SyntheticWorld | undefined)?.reset();
});

/** The source `receiving` names when it reports damage on a line of its GRN (goods-in 8.5, 10.2). */
const RECEIVING_GRN = { module: 'receiving', recordType: 'grn' } as const;

interface Reported {
  damageReportId: string;
  number: string;
  versionToken: string;
  requestId: string;
}
/** The first report, on goods of a product not yet set up; its test makes it. */
let first: Reported;
/** The second, on the same goods, which is confirmed and then reversed. */
let secondReport: Reported;

describe('the policy gate and the series (goods-in 10.4, 10.5)', () => {
  it('PRD-SEC-017 damage is refused while policy 17 is not Signed and validated, its capability off, or no series is set up', async () => {
    const closed = await post(reporter, '/api/stock/damage-reports', draftOf({ grnLineId: describedLine }, 2));
    expect(closed.status).toBe(403);
    expect(errorOf(closed)?.code).toBe('configuration.operation-unavailable');
    expect(errorOf(closed)?.missing).toEqual(
      expect.arrayContaining([
        { kind: 'capability', capability: 'stock.damage-reports' },
        { kind: 'policy', policy: '17', lacks: 'signature' },
        { kind: 'policy', policy: '17', lacks: 'validation' },
      ]),
    );
    // Policy 17 Signed and validated on the test-only check's SYNTHETIC value, its capability switched on (DM-6).
    await damageGateOpen(setup, database);
    const noSeries = await post(reporter, '/api/stock/damage-reports', draftOf({ grnLineId: describedLine }, 2));
    expect(errorOf(noSeries)).toMatchObject({
      code: 'stock.no-damage-report-series',
      missing: [{ kind: 'number-series', numberedKind: 'stock.damage-report' }],
    });
    // The damage-report series, with a SYNTHETIC format (RR-449; DEC-118).
    await asUserIn(api.app, organisation, setup.preparer.id, (context) =>
      defineSyntheticDamageReportSeries(context, api.app.get<NumberingInterface>(NUMBERING)),
    );
  });
});

describe('reporting damage (goods-in 8.1, 8.2; design test 16)', () => {
  it('PRD-DMG-001 PRD-ACP-005 PRD-DMG-005 damage on goods of a product not yet set up holds them at once, numbered, with photos', async () => {
    const photo = await storedFile(reporter, 'PHOTO');
    const made = await post(
      reporter,
      '/api/stock/damage-reports',
      draftOf({ grnLineId: describedLine }, 2, { photos: [photo] }),
    );
    expect(made.status, JSON.stringify(made.body)).toBe(200);
    first = made.body as unknown as Reported;
    expect(first.number).toMatch(/^SYN-DMG-\d{5}$/);
    // The hold covers the quantity before anyone confirms it; custody is unchanged (stock-ledger 6.1, 13.15).
    expect(await holdsOn('described')).toEqual([{ kind: 'damage', condition: 'good', quantity: 2 }]);
    expect(await custodyBy(null)).toEqual({ good: 6 });
    const read = await readReport(reporter, first.damageReportId);
    expect(read).toMatchObject({
      number: first.number,
      state: 'Submitted',
      goods: { kind: 'grn-line', grnLineId: describedLine },
      // The goods' identity stays Unknown before PT approval, never invented (PRD-DMG-005).
      skuId: null,
      quantity: 2,
      versionToken: first.versionToken,
      rounds: [{ id: first.versionToken, kind: 'reported', requestId: first.requestId, decision: null }],
    });
    expect(read.photoAttachmentIds).toHaveLength(1);
  });

  it('PRD-SEC-005 a report outside the reader’s scope is not found, never refused as not authorised', async () => {
    // Row-level security hides it, so it has no facts to authorise with: it is not found (code-house-rules 12.3).
    const hidden = await get(outsider, `/api/stock/damage-reports/${first.damageReportId}`);
    expect(hidden.status).toBe(404);
    expect(errorOf(hidden)).toMatchObject({
      code: 'stock.record-not-found',
      missing: [{ kind: 'record', recordType: 'stock.damage_report', recordId: first.damageReportId }],
    });
  });

  it('POL-02.16 PRD-EXC-001 the report reaches Operations in My work as an exception of its Unknown exposure', async () => {
    const work = await get(operations, '/api/inbox/my-work');
    expect(work.status, JSON.stringify(work.body)).toBe(200);
    const exceptions = myWorkSchema.parse(work.body).items.filter((each) => each.kind === 'exception');
    expect(exceptions).toEqual([expect.objectContaining({ exposure: { kind: 'unknown' }, state: 'Unresolved' })]);
    // Its decision is offered to Operations, whose limit covers an Unknown cost, as My work lists it (11.2, 9.4).
    const offered = await asUserIn(api.app, organisation, operations.user.id, (context) =>
      api.app.get<AccessInterface>(ACCESS).eligibleRequests(context, operations.user.id, [first.requestId]),
    );
    expect(offered).toEqual([first.requestId]);
  });

  it('PRD-INT-002 the same request answers the same report; the goods must be in custody and of the line named', async () => {
    const key = uuidv7();
    const once = await post(reporter, '/api/stock/damage-reports', draftOf({ grnLineId: describedLine }, 1), key);
    expect(once.status, JSON.stringify(once.body)).toBe(200);
    expect(await post(reporter, '/api/stock/damage-reports', draftOf({ grnLineId: describedLine }, 1), key)).toEqual(
      once,
    );
    const tooMany = await post(reporter, '/api/stock/damage-reports', draftOf({ grnLineId: describedLine }, 7));
    expect(errorOf(tooMany)?.code).toBe('stock.not-in-custody');
    const noLine = await post(reporter, '/api/stock/damage-reports', draftOf({ grnLineId: uuidv7() }, 1));
    expect(errorOf(noLine)?.code).toBe('stock.goods-not-found');
    // The replayed report keeps its hold; it is decided below with the others.
    const replayed = once.body as { damageReportId: string; requestId: string; versionToken: string };
    const rejected = await decide(operations, replayed.requestId, replayed.versionToken, 'reject');
    expect(rejected.status, JSON.stringify(rejected.body)).toBe(200);
  });
});

describe('deciding a report (goods-in 8.3; design test 16)', () => {
  it('PRD-DMG-002 PRD-ACS-006 the reporter cannot decide their own report', async () => {
    const own = await decide(reporter, first.requestId, first.versionToken, 'approve');
    expect(own.status).toBe(422);
    expect(errorOf(own)?.code).toBe('access.self-preparation');
  });

  it('PRD-ACS-016 goods of Unknown cost need explicit authority over Unknown value', async () => {
    const refused = await decide(cautious, first.requestId, first.versionToken, 'approve');
    expect(refused.status).toBe(403);
    expect(errorOf(refused)?.code).toBe('access.unknown-value-not-covered');
  });

  it('PRD-DMG-003 PRD-ACP-005 rejecting a report releases only its damage hold; another hold on the goods stays', async () => {
    const second = await report({ grnLineId: describedLine }, 1);
    expect(await holdsOn('described')).toEqual([{ kind: 'damage', condition: 'good', quantity: 3 }]);
    const rejected = await decide(operations, first.requestId, first.versionToken, 'reject');
    expect(rejected.status, JSON.stringify(rejected.body)).toBe(200);
    expect((await readReport(operations, first.damageReportId)).state).toBe('Rejected');
    expect(await holdsOn('described')).toEqual([{ kind: 'damage', condition: 'good', quantity: 1 }]);
    expect(await custodyBy(null)).toEqual({ good: 6 });
    // The second report's hold stays until its own decision; confirming it is the next test.
    secondReport = second;
  });

  it('PRD-DMG-006 PRD-DMG-010 a confirmation makes the goods damaged and quarantines them where they are, with no forced move', async () => {
    const confirmed = await decide(operations, secondReport.requestId, secondReport.versionToken, 'approve');
    expect(confirmed.status, JSON.stringify(confirmed.body)).toBe(200);
    expect(await custodyBy(null)).toEqual({ good: 5, damaged: 1 });
    expect(await holdsOn('described')).toEqual([{ kind: 'quarantine', condition: 'damaged', quantity: 1 }]);
    // The quarantine records a reason code, which a screen names from the catalogue, never stored text (12.13).
    expect(await holdReasons(secondReport.damageReportId)).toEqual([
      { kind: 'damage', reason: 'SYNTHETIC torn seam seen at the count' },
      { kind: 'quarantine', reason: 'stock.damage-confirmed' },
    ]);
    const read = await readReport(reporter, secondReport.damageReportId);
    expect(read.state).toBe('Confirmed');
    expect(read.rounds[0]?.decision).toMatchObject({ outcome: 'Confirmed', decidedByUserId: operations.user.id });
    // A quarantine ends only by an approved decision, never by time (stock-ledger 14.2 `hold_release`): the
    // reversal below is such a decision. A decided report is decided once (8.3).
    const again = await post(reporter, `/api/stock/damage-reports/${secondReport.damageReportId}/decision-renewal`, {
      versionToken: secondReport.versionToken,
    });
    expect(errorOf(again)?.code).toBe('stock.report-decided');
  });

  it('PRD-EXC-002 Operations closes the exception once the report is decided', async () => {
    const work = myWorkSchema.parse((await get(operations, '/api/inbox/my-work')).body).items;
    const open = work.filter((each) => each.kind === 'exception');
    expect(open.length).toBeGreaterThan(0);
    for (const item of open) {
      const closed = await post(operations, `/api/exceptions/exceptions/${item.owner.recordId}/close`, {});
      expect(closed.status, JSON.stringify(closed.body)).toBe(200);
    }
  });
});

describe('reversing a mistaken confirmation (goods-in 8.3; PRD-STK-017; design test 16)', () => {
  it('PRD-STK-017 a linked reversal, proposed and approved by different people, restores the goods and the damage hold', async () => {
    const proposed = await post(proposer, `/api/stock/damage-reports/${secondReport.damageReportId}/reversals`, {
      reason: 'SYNTHETIC the seam was whole on a second look',
      versionToken: secondReport.versionToken,
    });
    expect(proposed.status, JSON.stringify(proposed.body)).toBe(200);
    const { damageReversalId, requestId } = proposed.body as { damageReversalId: string; requestId: string };
    // One reversal at a time (8.3).
    const twice = await post(proposer, `/api/stock/damage-reports/${secondReport.damageReportId}/reversals`, {
      reason: 'SYNTHETIC again',
      versionToken: secondReport.versionToken,
    });
    expect(errorOf(twice)?.code).toBe('stock.reversal-open');
    // Its approval panel reads the report it reverses through it (access-and-approvals 9.5).
    const panel = await get(reversalApprover, `/api/stock/damage-reversals/${damageReversalId}`);
    expect(panel.status, JSON.stringify(panel.body)).toBe(200);
    expect(damageReportReadSchema.parse(panel.body).report).toMatchObject({
      id: secondReport.damageReportId,
      state: 'Confirmed',
      reversals: [{ id: damageReversalId, outcome: null, state: 'Awaiting approval' }],
    });
    // Its proposer cannot approve it (PRD-ACS-006).
    const own = await decide(proposer, requestId, damageReversalId, 'approve');
    expect(errorOf(own)?.code).toBe('access.self-preparation');
    const approved = await decide(reversalApprover, requestId, damageReversalId, 'approve');
    expect(approved.status, JSON.stringify(approved.body)).toBe(200);
    // The goods have their earlier condition and holds: good, under a damage hold again (8.3).
    expect(await custodyBy(null)).toEqual({ good: 6 });
    expect(await holdsOn('described')).toEqual([{ kind: 'damage', condition: 'good', quantity: 1 }]);
    const read = await readReport(reporter, secondReport.damageReportId);
    expect(read.state).toBe('Submitted');
    expect(read.reversals).toEqual([
      expect.objectContaining({
        id: damageReversalId,
        outcome: 'Approved',
        state: 'Approved',
        proposedByUserId: proposer.user.id,
      }),
    ]);
    expect(read.rounds.map((each) => each.kind)).toEqual(['reported', 'restored']);
    // The confirmation is never edited: the reversal is its own movement, linked to the condition change.
    const verify = await connect(database, 'verify');
    try {
      const movements = await verify.query<{ kind: string; reverses: string | null }>(
        `select m.kind, (select r.kind from stock.movement r where r.id = m.reverses_movement_id) as reverses
           from stock.movement m
          where m.source_module = 'stock' and m.source_record_id in ($1, $2) order by m.kind`,
        [secondReport.damageReportId, damageReversalId],
      );
      expect(movements.rows).toEqual([
        { kind: 'condition-change', reverses: null },
        { kind: 'reversal', reverses: 'condition-change' },
      ]);
    } finally {
      await verify.end();
    }
    // The report waits for a decision again; this time it is rejected and its restored hold ends.
    const restored = read.rounds[1];
    if (restored?.requestId == null) throw new Error('no request for the restored round');
    const rejected = await decide(operations, restored.requestId, restored.id, 'reject');
    expect(rejected.status, JSON.stringify(rejected.body)).toBe(200);
    expect(await holdsOn('described')).toEqual([]);
  });
});

describe('damage on a product at a location (goods-in 8.1; PRD-DMG-004)', () => {
  it('PRD-DMG-004 a product named at the location is held and, confirmed, damaged and quarantined', async () => {
    const made = await report({ skuId: fixture.batchSku.id }, 2);
    expect(await holdsOn('product')).toEqual([{ kind: 'damage', condition: 'good', quantity: 2 }]);
    const confirmed = await decide(operations, made.requestId, made.versionToken, 'approve');
    expect(confirmed.status, JSON.stringify(confirmed.body)).toBe(200);
    expect(await custodyBy(fixture.batchSku.id)).toEqual({ good: 3, damaged: 2 });
    expect(await holdsOn('product')).toEqual([{ kind: 'quarantine', condition: 'damaged', quantity: 2 }]);
  });

  it('PRD-ACS-007 DEC-066 a report waiting for its decision is asked again in a new round, superseding its request', async () => {
    const made = await report({ skuId: fixture.batchSku.id }, 1);
    const stale = await post(reporter, `/api/stock/damage-reports/${made.damageReportId}/decision-renewal`, {
      versionToken: uuidv7(),
    });
    expect(errorOf(stale)?.code).toBe('kernel.stale-version');
    const renewed = await post(reporter, `/api/stock/damage-reports/${made.damageReportId}/decision-renewal`, {
      versionToken: made.versionToken,
    });
    expect(renewed.status, JSON.stringify(renewed.body)).toBe(200);
    const read = await readReport(reporter, made.damageReportId);
    expect(read.rounds.map((each) => [each.kind, each.requestState])).toEqual([
      ['reported', 'Superseded'],
      ['renewed', 'Awaiting approval'],
    ]);
    // The superseded request cannot be decided; the new one can.
    expect(errorOf(await decide(operations, made.requestId, made.versionToken, 'reject'))?.code).toBe(
      'access.approval-superseded',
    );
    const { versionToken, requestId } = renewed.body as { versionToken: string; requestId: string };
    expect((await decide(operations, requestId, versionToken, 'reject')).status).toBe(200);
  });
});

describe('the interface `receiving` calls (goods-in 10.2)', () => {
  it('PRD-INT-004 PRD-MOD-006 a report raised inside the caller’s transaction commits or rolls back with it', async () => {
    const documents = api.app.get<StockDocumentsInterface>(STOCK_DOCUMENTS);
    const actor = { userId: reporter.user.id, roleAssignmentId: reporter.assignmentId };
    const draft = draftOf({ grnLineId: describedLine }, 1) as Parameters<StockDocumentsInterface['reportDamage']>[2];
    // The caller names the source whose line it is, as `receiving` names its GRN (goods-in 8.5): a line another
    // source made names no goods of it.
    const elsewhere = await asUserIn(api.app, organisation, reporter.user.id, (context) =>
      documents.reportDamage(context, actor, draft, { lineSource: { module: 'stock', recordType: 'damage_report' } }),
    );
    expect(elsewhere.kind === 'refusal' ? elsewhere.refusal.code : elsewhere.kind).toBe('stock.goods-not-found');
    // The caller's command fails after the report: nothing of it stays, its number and hold included.
    let rolledBack: string | undefined;
    await expect(
      asUserIn(api.app, organisation, reporter.user.id, async (context) => {
        const made = await documents.reportDamage(context, actor, draft, { lineSource: RECEIVING_GRN });
        if (made.kind !== 'success') throw new Error(made.refusal.code);
        rolledBack = made.answer.damageReportId;
        throw new Error('SYNTHETIC failure of the caller after the report');
      }),
    ).rejects.toThrow('SYNTHETIC failure');
    // Read by Operations, whose scope covers every place, so a report that is not there is not found (5.3).
    if (rolledBack === undefined) throw new Error('The report was not made before the failure');
    expect((await get(operations, `/api/stock/damage-reports/${rolledBack}`)).status).toBe(404);
    expect(await holdsOn('described')).toEqual([]);
    // The caller's command commits: the report is there with its hold and the next number.
    const committed = await asUserIn(api.app, organisation, reporter.user.id, (context) =>
      documents.reportDamage(context, actor, draft, { lineSource: RECEIVING_GRN }),
    );
    if (committed.kind !== 'success') throw new Error(committed.refusal.code);
    const read = await readReport(reporter, committed.answer.damageReportId);
    expect(read.state).toBe('Submitted');
    expect(await holdsOn('described')).toEqual([{ kind: 'damage', condition: 'good', quantity: 1 }]);
    const numbers = await numbersOfReports();
    expect(numbers).toEqual([...numbers].sort());
    expect(new Set(numbers).size).toBe(numbers.length);
    const sequence = numbers.map((each) => Number(each.slice(-5)));
    expect(sequence).toEqual(sequence.map((_each, index) => index + 1));
  });
});

/** The holds a report's goods were placed under, by kind and reason, as the verifier reads them (stock-ledger 14.2). */
async function holdReasons(reportId: string): Promise<{ kind: string; reason: string }[]> {
  const verify = await connect(database, 'verify');
  try {
    const result = await verify.query<{ kind: string; reason: string }>(
      'select kind, reason from stock.hold where source_record_id = $1 order by kind',
      [reportId],
    );
    return result.rows;
  } finally {
    await verify.end();
  }
}

/** Every report's number, in the order made, as the verifier reads them: gap-free (numbering-and-audit 3.2). */
async function numbersOfReports(): Promise<string[]> {
  const verify = await connect(database, 'verify');
  try {
    const result = await verify.query<{ number: string }>('select number from stock.damage_report order by id');
    return result.rows.map((row) => row.number);
  } finally {
    await verify.end();
  }
}
