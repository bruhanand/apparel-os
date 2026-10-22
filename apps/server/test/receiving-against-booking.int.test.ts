import { randomInt } from 'node:crypto';
import { uuidv7 } from '@apparel-os/domain';
import {
  BOOKING_APPROVAL,
  BOOKING_RECEIPT_LINK,
  RECOUNT_APPROVAL,
  arrivalReadSchema,
  bookingReadSchema,
  myWorkSchema,
  reviewReasonSchema,
  type Arrival,
  type AssignmentScope,
  type Booking,
} from '@apparel-os/schemas';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  COMMAND_RUNNER,
  type CommandRunner,
  type RoutedOrganisation,
  OrganisationRouter,
} from '../src/kernel/index.js';
import { NUMBERING, type NumberingInterface } from '../src/modules/numbering/index.js';
import { defineSyntheticBookingSeries } from './fixtures/booking-series.js';
import { defineSyntheticGrnSeries } from './fixtures/grn-series.js';
import { syntheticCode, syntheticName } from './fixtures/synthetic.js';
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
import { BOOKING_POLICY_CHECKS, bookingGateOpen } from './support/booking.js';
import { defineSyntheticCodeSeries } from './support/exceptions.js';
import { grantSynthetic, type SyntheticAuthority } from './support/grants.js';
import { capturingLogger } from './support/jobs.js';
import { writeSyntheticMarking } from './support/marked-attributes.js';
import { startTestFileStore, type TestFileStore } from './support/minio.js';
import { STORE_FILE_PATH, syntheticPdfUpload } from './support/opening-app.js';
import { decided, structureSetup, type StructureSetup } from './support/organisation.js';
import { createSyntheticOrganisations, type SyntheticWorld } from './support/organisations.js';
import { allowVerifier, connect, databaseUrl } from './support/postgres.js';
import {
  RECEIVER_AUTHORITY,
  receivingFixture,
  receivingGateOpen,
  receivingGranted,
  STOCK_VIEW,
  type ReceivingFixture,
} from './support/receiving.js';

// S2-F02-T04: receiving against a booking through the whole application, on real PostgreSQL, with real GRNs (goods-in
// 3.6, 3.7, 4.2, 4.5, 4.10, 10.3, 12 tests 5 and 6; PRD-REC-002, PRD-BKG-005 to PRD-BKG-008; POL-05.05, POL-05.08;
// DEC-130). An Arrival names one approved booking of its supplier and brand; at the GRN's issue each line that delivers
// pieces links to the booking line it matches, or goes to Booking for review, which reaches Booking in My work; Booking
// links an unbooked GRN later; late or excess goods are accepted into the booking only once a different person approves
// it (RR-577, decided by the product owner on 22 Oct 2026). Policies 4 and 10 are opened on the values the modules
// report, and policies 5 and 1 on TEST-ONLY checks (RR-561, RR-565; support/booking.ts). Every person, place, brand,
// price, budget, limit, date, routing and number here is SYNTHETIC.

const BOOKING_TYPE = 'booking.booking';
const BUDGET = 'booking.open_to_buy_budget';
const CHECK = 'booking.open_to_buy_check';
const PANEL: SyntheticAuthority = { recordType: 'access.approval_request', action: 'view' };
/** SYNTHETIC amounts in paise. */
const SYNTHETIC_BUDGET = 500_000_000;
const SYNTHETIC_LIMIT = 500_000_000;
const COST = 50_000;
const STYLE = 'SYN-RAB';
const COLOUR = 'SYN NAVY';

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
/** The booking's destination, with its brand and linked supplier. */
let fixture: ReceivingFixture;
/** Another Site, with a brand and supplier of its own. */
let other: ReceivingFixture;
let approveReason: string;
let rejectReason: string;
let season: string;
const cookies = new Map<string, string>();

interface Person {
  readonly user: SyntheticUser;
  readonly assignmentId: string;
}
/** Booking (P-BKG): records bookings, reviews and links GRN lines, proposes late or excess goods; owns the review. */
let booker: Person;
let accounts: Person;
/** The Owner (P-OWN): approves budgets, bookings and the acceptance of late or excess goods. */
let owner: Person;
/** Warehouse (P-WHS): receives against bookings at both Sites, so sees bookings too. */
let receiver: Person;
/** A receiver who holds no permission on bookings. */
let plainReceiver: Person;
/** Booking who may not see the GRNs. */
let blindBooker: Person;
let settingsAdmin: Person;
let settingsApprover: Person;
/** A receiver who proposes recounts and holds no permission on bookings (goods-in 4.11). */
let recounter: Person;
/** Whoever approves recounts, with authority over Unknown cost (goods-in 4.11, section 11). */
let recountApprover: Person;

interface Call {
  readonly status: number;
  readonly body: Record<string, unknown>;
}

const errorOf = (call: Call) => (call.body as { error?: { code: string; missing?: Record<string, string>[] } }).error;

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
    headers: { 'content-type': 'application/json', origin: SYNTHETIC_ORIGIN, 'x-forwarded-for': '10.9.9.75' },
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

function ok(call: Call): Record<string, unknown> {
  expect(call.status, JSON.stringify(call.body)).toBe(200);
  return call.body;
}

function decide(by: Person, requestId: string, versionId: string, outcome: 'approve' | 'reject' = 'approve') {
  return post(by, `/api/access/approval-requests/${requestId}/decision`, {
    versionId,
    outcome,
    reason: { kind: 'listed', reasonId: outcome === 'approve' ? approveReason : rejectReason },
    totpCode: freshCode(by.user),
  });
}

let fileCount = 0;
async function storedFile(person: Person): Promise<{ storedFileId: string; fileReceiptId: string }> {
  fileCount += 1;
  const stored = ok(await post(person, STORE_FILE_PATH, syntheticPdfUpload('RECEIVE', `RAB-${String(fileCount)}`)));
  return { storedFileId: stored.storedFileId as string, fileReceiptId: stored.receiptId as string };
}

/** The code of the fixture's size value of the label given (goods-in 4.3; RR-556). */
function size(label: string, of: ReceivingFixture = fixture): { readonly id: string; readonly code: string } {
  const value = of.sizes.values.find((each) => each.label === label);
  if (value === undefined) throw new Error(`no size ${label}`);
  return value;
}

/** One booking line at the SYNTHETIC cost, with colour and size where given (goods-in 3.1). */
function line(styleCode: string, quantity: number, options: { colour?: string | null; size?: string | null } = {}) {
  return {
    styleCode,
    colour: options.colour === undefined ? COLOUR : options.colour,
    size: options.size ?? null,
    quantity,
    indicativeCost: COST,
    mrp: 99_900,
    deliveryDate: null,
  };
}

async function readBooking(person: Person, bookingId: string): Promise<Booking> {
  return bookingReadSchema.parse(ok(await get(person, `/api/booking/bookings/${bookingId}`))).booking;
}

/** Records, documents and submits a booking as Booking, approved by the Owner; answers it (goods-in 3.1 to 3.4). */
async function approvedBooking(
  lines: readonly ReturnType<typeof line>[],
  window: { from: string; to: string } = { from: setup.day(0), to: setup.day(30) },
): Promise<Booking> {
  const made = ok(
    await post(booker, '/api/booking/bookings', {
      brandId: fixture.brand.id,
      destinationSiteId: fixture.siteId,
      supplierPartyId: fixture.supplier.id,
      seasonValueId: season,
      deliveryWindow: window,
      lines,
    }),
  );
  const bookingId = made.bookingId as string;
  const attached = ok(
    await post(booker, `/api/booking/bookings/${bookingId}/documents`, {
      files: [await storedFile(booker)],
      versionToken: made.versionToken,
    }),
  );
  const sent = ok(
    await post(booker, `/api/booking/bookings/${bookingId}/submission`, { versionToken: attached.versionToken }),
  );
  ok(await decide(owner, sent.requestId as string, sent.versionId as string));
  return readBooking(booker, bookingId);
}

/** A line of the count, on the invoice, counted as invoiced unless told (goods-in 4.3). */
interface Counted {
  readonly styleCode: string;
  readonly colour?: string | null;
  readonly size?: string | null;
  readonly quantity: number;
}

/**
 * An Arrival, against the booking named or none, its invoice, its count and its GRN, through receiving's routes as the
 * receiver (goods-in 4.2 to 4.5), at the destination's Store or at another Site's; answers the GRN and the Arrival.
 */
async function received(
  bookingId: string | undefined,
  lines: readonly Counted[],
  at: { readonly world: ReceivingFixture; readonly brand?: ReceivingFixture } = { world: fixture },
): Promise<{ readonly grnId: string; readonly arrival: Arrival }> {
  const sizes = at.world;
  const brand = at.brand ?? fixture;
  const made = ok(
    await post(receiver, '/api/receiving/arrivals', {
      businessUnitId: at.world.wholeStore,
      receivingLocationId: at.world.storeLocation,
      supplierPartyId: brand.supplier.id,
      brandId: brand.brand.id,
      transporter: syntheticName('Transporter'),
      lorryReceipt: { number: 'SYN-LR-RAB', date: setup.today() },
      cartons: 2,
      arrivedAt: new Date(clock.now().getTime() - 60_000).toISOString(),
      ...(bookingId === undefined ? {} : { bookingId }),
    }),
  );
  const arrivalId = made.arrivalId as string;
  ok(
    await post(receiver, `/api/receiving/arrivals/${arrivalId}/invoices`, {
      number: `SYN-INV-RAB-${String(randomInt(1_000_000_000))}`,
      date: setup.today(),
      file: await storedFile(receiver),
    }),
  );
  for (const each of lines) {
    ok(
      await post(receiver, `/api/receiving/arrivals/${arrivalId}/count-lines`, {
        goods: 'on-invoice',
        styleCode: each.styleCode,
        colour: each.colour === undefined ? COLOUR : each.colour,
        sizeValueId: each.size === undefined || each.size === null ? null : size(each.size, sizes).id,
        skuId: null,
        description: null,
        invoiceQuantity: each.quantity,
        countedQuantity: each.quantity,
        extra: null,
        damage: null,
        batch: null,
      }),
    );
  }
  const read = arrivalReadSchema.parse(ok(await get(receiver, `/api/receiving/arrivals/${arrivalId}`))).arrival;
  const issued = ok(
    await post(receiver, `/api/receiving/arrivals/${arrivalId}/grn`, { versionToken: read.versionToken }),
  );
  return { grnId: issued.grnId as string, arrival: await readArrival(receiver, arrivalId) };
}

async function readArrival(person: Person, arrivalId: string): Promise<Arrival> {
  return arrivalReadSchema.parse(ok(await get(person, `/api/receiving/arrivals/${arrivalId}`))).arrival;
}

/** Each GRN line's identifier and its place against bookings, by its size code (goods-in 4.10). */
function bySize(arrival: Arrival) {
  const grn = arrival.grn;
  if (grn === null) throw new Error('no GRN');
  return new Map(
    grn.lines.map((each) => [
      each.size ?? each.styleCode ?? '',
      grn.bookingLinks.find((link) => link.grnLineId === each.id),
    ]),
  );
}

function keyOf(booking: Booking, sizeLabel: string): string {
  const found = booking.status?.lines.find((each) => each.size === size(sizeLabel).code);
  if (found === undefined) throw new Error(`no line of size ${sizeLabel}`);
  return found.lineKey;
}

/** The exceptions raised on the records given, with their type and owner, as the verifier reads them. */
async function exceptionsOn(recordIds: readonly string[]) {
  const verify = await connect(database, 'verify');
  try {
    const result = await verify.query<{ type: string; owner_user_id: string | null }>(
      `select t.code as type, e.owner_user_id
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

/** One exception type routed at a Site to Booking, approved by a different person (12.2; POL-02.16; V-03). */
async function route(typeCode: string, siteId: string): Promise<void> {
  const prepared = ok(
    await post(settingsAdmin, '/api/exceptions/routing', {
      typeCode,
      siteId,
      owner: { kind: 'user', userId: booker.user.id },
      dueRule: { format: 'elapsed-minutes-v1', minutes: 60 },
      escalation: { kind: 'user', userId: booker.user.id },
      validFrom: setup.today(),
      origin: 'synthetic',
    }),
  );
  ok(await decide(settingsApprover, prepared.requestId as string, prepared.versionId as string));
}

beforeAll(async () => {
  world = await createSyntheticOrganisations('againstbooking');
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
  approveReason = await writeSyntheticReason(database, 'approve');
  rejectReason = await writeSyntheticReason(database, 'reject');
  minio = await startTestFileStore();
  clock = new SyntheticClock();
  api = await startAccessApp(world, keys, {
    clock,
    fileStoreEnvironment: minio.environment,
    validityChecks: BOOKING_POLICY_CHECKS,
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
    label: 'AGAINST-BOOKING',
  });
  fixture = await receivingFixture(setup, database, 'RAB', { sizes: ['S', 'M', 'L', 'XL'] });
  other = await receivingFixture(setup, database, 'RAB-OTHER');
  await receivingGateOpen(setup, database, BOOKING_POLICY_CHECKS);
  await receivingGranted(setup, database, fixture.siteId, [fixture.wholeStore], BOOKING_POLICY_CHECKS);
  await receivingGranted(setup, database, other.siteId, [other.wholeStore], BOOKING_POLICY_CHECKS);
  await bookingGateOpen(setup, database);

  // A SYNTHETIC season, marked as the Organisation's (structure-and-masters 4.2 "As built"; RR-550).
  const okOf = <A>(outcome: { kind: 'success'; answer: A } | { kind: 'refusal'; refusal: { code: string } }): A => {
    if (outcome.kind !== 'success') throw new Error(`Refused: ${outcome.refusal.code}`);
    return outcome.answer;
  };
  const seasonAttribute = okOf(
    await setup.asPreparerDo((c, p) =>
      setup.catalogue.prepareAttribute(c, p, {
        code: syntheticCode(`RAB-SEASON-${String(randomInt(1_000_000))}`),
        valueKind: 'list',
        name: syntheticName('SEASON'),
        validFrom: setup.today(),
      }),
    ),
  ).recordId;
  const proposed = okOf(
    await setup.asPreparerDo((c, p) =>
      setup.catalogue.proposeVocabularyValue(c, p, {
        attributeId: seasonAttribute,
        code: syntheticCode(`SS-${String(randomInt(1_000_000))}`),
        name: syntheticName('SS'),
      }),
    ),
  );
  decided(await setup.decide(proposed.requestId, proposed.proposalId));
  const confirmed = await setup.run(setup.preparer.id, (c) => setup.catalogue.proposal(c, proposed.proposalId));
  if (confirmed?.valueId === undefined) throw new Error('The season was not confirmed');
  season = confirmed.valueId;
  await writeSyntheticMarking(database, 'season', seasonAttribute, setup.preparer.id);

  const ARRIVAL_VIEW: SyntheticAuthority = { recordType: 'receiving.arrival', action: 'view' };
  booker = await enrolled('RAB-BOOKER', [
    { recordType: BOOKING_TYPE, action: 'view' },
    { recordType: BOOKING_TYPE, action: 'create' },
    { recordType: BOOKING_TYPE, action: 'edit' },
    { recordType: BUDGET, action: 'view' },
    { recordType: BUDGET, action: 'create' },
    { recordType: 'files_imports.stored_file', action: 'create' },
    { recordType: 'exceptions.exception', action: 'view' },
    ARRIVAL_VIEW,
    { recordType: 'receiving.grn', action: 'view' },
    PANEL,
  ]);
  accounts = await enrolled('RAB-ACCOUNTS', [
    { recordType: BUDGET, action: 'view' },
    { recordType: CHECK, action: 'view' },
    { recordType: CHECK, action: 'approve' },
    PANEL,
  ]);
  owner = await enrolled('RAB-OWNER', [
    { recordType: BOOKING_TYPE, action: 'view' },
    { recordType: BOOKING_TYPE, action: 'approve' },
    { recordType: BUDGET, action: 'view' },
    { recordType: BUDGET, action: 'approve' },
    PANEL,
  ]);
  receiver = await enrolled('RAB-RECEIVER', [...RECEIVER_AUTHORITY, { recordType: BOOKING_TYPE, action: 'view' }]);
  plainReceiver = await enrolled('RAB-PLAIN-RECEIVER', RECEIVER_AUTHORITY);
  recounter = await enrolled('RAB-RECOUNTER', [
    ...RECEIVER_AUTHORITY,
    { recordType: 'receiving.recount', action: 'create' },
  ]);
  recountApprover = await enrolled('RAB-RECOUNT-APPROVER', [
    ARRIVAL_VIEW,
    { recordType: 'receiving.recount', action: 'approve' },
    { recordType: 'access.approval_reason', action: 'view' },
    PANEL,
    ...STOCK_VIEW,
  ]);
  blindBooker = await enrolled('RAB-BLIND-BOOKER', [
    { recordType: BOOKING_TYPE, action: 'view' },
    { recordType: BOOKING_TYPE, action: 'edit' },
  ]);
  settingsAdmin = await enrolled('RAB-SETTINGS', [
    { recordType: 'access.approval_limit', action: 'view' },
    { recordType: 'access.approval_limit', action: 'create' },
    { recordType: 'exceptions.exception_routing', action: 'view' },
    { recordType: 'exceptions.exception_routing', action: 'edit' },
  ]);
  settingsApprover = await enrolled('RAB-SETTINGS-APPROVER', [
    { recordType: 'access.approval_limit', action: 'view' },
    { recordType: 'access.approval_limit', action: 'approve' },
    { recordType: 'exceptions.exception_routing', action: 'approve' },
    PANEL,
  ]);
  // The Owner's SYNTHETIC booking limit (V-02), prepared and approved by two other people (9.2).
  const limit = ok(
    await post(settingsAdmin, '/api/access/approval-limits', {
      actionType: BOOKING_APPROVAL,
      holder: { kind: 'individual', userId: owner.user.id, roleAssignmentId: owner.assignmentId },
      limit: { kind: 'amount', amount: SYNTHETIC_LIMIT },
      coversUnknown: false,
      origin: 'synthetic',
      validFrom: setup.today(),
    }),
  );
  ok(await decide(settingsApprover, limit.requestId as string, limit.limitId as string));
  // A SYNTHETIC limit over Unknown cost for whoever approves recounts (V-02; goods-in 4.11).
  const recountLimit = ok(
    await post(settingsAdmin, '/api/access/approval-limits', {
      actionType: RECOUNT_APPROVAL,
      holder: { kind: 'individual', userId: recountApprover.user.id, roleAssignmentId: recountApprover.assignmentId },
      limit: { kind: 'none' },
      coversUnknown: true,
      origin: 'synthetic',
      validFrom: setup.today(),
    }),
  );
  ok(await decide(settingsApprover, recountLimit.requestId as string, recountLimit.limitId as string));
  // A SYNTHETIC budget for the brand and season: prepared, checked and approved by three people (goods-in 3.3).
  const prepared = ok(
    await post(booker, '/api/booking/open-to-buy-budgets', {
      brandId: fixture.brand.id,
      seasonValueId: season,
      amount: SYNTHETIC_BUDGET,
      origin: 'synthetic',
    }),
  );
  ok(await decide(accounts, prepared.requestId as string, prepared.versionId as string));
  const budget = ok(await get(owner, `/api/booking/open-to-buy-budgets/${prepared.budgetId as string}`)) as {
    budget: { versions: { request?: { id: string } }[] };
  };
  const approvalId = budget.budget.versions[0]?.request?.id;
  if (approvalId === undefined) throw new Error('The budget approval was not requested');
  ok(await decide(owner, approvalId, prepared.versionId as string));
  // The lines sent for review reach Booking at both Sites, by a SYNTHETIC owner and due time (12.2; POL-02.16; V-03).
  await route('receiving.booking-review', fixture.siteId);
  await route('receiving.booking-review', other.siteId);
  const numbering = api.app.get<NumberingInterface>(NUMBERING);
  await api.app.get<CommandRunner>(COMMAND_RUNNER).run(
    {
      commandName: 'test.define-series',
      organisation,
      correlationId: uuidv7(),
      actor: { kind: 'actor', actorId: setup.preparer.id },
    },
    async (context) => {
      await defineSyntheticGrnSeries(context, numbering);
      await defineSyntheticBookingSeries(context, numbering);
      await defineSyntheticCodeSeries(context, numbering);
    },
  );
}, 400_000);

afterAll(async () => {
  await (setup as StructureSetup | undefined)?.close();
  await (router as OrganisationRouter | undefined)?.close();
  await (api as AccessTestApp | undefined)?.close();
  await (minio as TestFileStore | undefined)?.stop();
  await (world as SyntheticWorld | undefined)?.reset();
});

describe('delivered quantities from real GRNs (goods-in 3.6, 3.7; 12 test 5)', () => {
  it('PRD-BKG-005 PRD-BKG-006 booked 10 each of S, M and L; deliveries of 5, 3 and 2 a size leave 15, 6 and 0', async () => {
    const booking = await approvedBooking(['S', 'M', 'L'].map((each) => line(STYLE, 10, { size: size(each).code })));
    const outstanding: number[] = [];
    for (const pieces of [5, 3, 2]) {
      // Matched ignoring case and spaces at the ends (goods-in 3.7; DEC-130).
      const { arrival } = await received(
        booking.id,
        ['S', 'M', 'L'].map((each) => ({ styleCode: 'syn-rab', colour: 'syn navy', size: each, quantity: pieces })),
      );
      expect(arrival.bookingId).toBe(booking.id);
      for (const each of ['S', 'M', 'L']) {
        expect(bySize(arrival).get(size(each).code)).toMatchObject({
          atIssue: { outcome: 'linked', bookingId: booking.id, lineKey: keyOf(booking, each) },
          link: { bookingId: booking.id, lineKey: keyOf(booking, each), kind: 'at-issue', linkedBy: receiver.user.id },
          proposal: null,
        });
      }
      outstanding.push((await readBooking(booker, booking.id)).status?.totals.outstanding ?? -1);
    }
    expect(outstanding).toEqual([15, 6, 0]);
    expect(
      (await readBooking(booker, booking.id)).status?.lines.map((each) => [
        each.size,
        each.delivered,
        each.outstanding,
      ]),
    ).toEqual([
      [size('S').code, 10, 0],
      [size('M').code, 10, 0],
      [size('L').code, 10, 0],
    ]);
  });
});

describe('GRN lines linked or sent to Booking for review (goods-in 3.7, 4.10; 12 test 6)', () => {
  let booking: Booking;

  it('PRD-BKG-007 DEC-130 a line links on style code, and colour and size where the booking line gives them; an ambiguous line and one matching none go to review', async () => {
    booking = await approvedBooking([
      line(STYLE, 10, { size: size('S').code }),
      // A line at style level and with no colour: any size and colour of the style matches it.
      line('SYN-RAB-OPEN', 10, { colour: null }),
      line('SYN-RAB-OPEN', 10, { colour: null, size: size('M').code }),
    ]);
    const { grnId, arrival } = await received(booking.id, [
      { styleCode: STYLE, size: 'S', quantity: 2 },
      { styleCode: 'SYN-RAB-OPEN', colour: 'SYN RED', size: 'L', quantity: 1 },
      { styleCode: 'SYN-RAB-OPEN', size: 'M', quantity: 1 },
      { styleCode: 'SYN-RAB-NONE', size: 'S', quantity: 1 },
    ]);
    const lines = arrival.grn?.lines ?? [];
    const outcome = (styleCode: string, sizeLabel: string) => {
      const found = lines.find((each) => each.styleCode === styleCode && each.size === size(sizeLabel).code);
      return arrival.grn?.bookingLinks.find((each) => each.grnLineId === found?.id)?.atIssue;
    };
    expect(outcome(STYLE, 'S')).toEqual({ outcome: 'linked', bookingId: booking.id, lineKey: keyOf(booking, 'S') });
    const status = (await readBooking(booker, booking.id)).status;
    const openKey = status?.lines.find((each) => each.styleCode === 'SYN-RAB-OPEN' && each.size === null)?.lineKey;
    expect(outcome('SYN-RAB-OPEN', 'L')).toEqual({ outcome: 'linked', bookingId: booking.id, lineKey: openKey });
    expect(outcome('SYN-RAB-OPEN', 'M')).toEqual({
      outcome: 'review',
      bookingId: booking.id,
      reason: 'ambiguous',
      lineKey: null,
    });
    expect(outcome('SYN-RAB-NONE', 'S')).toEqual({
      outcome: 'review',
      bookingId: booking.id,
      reason: 'no-match',
      lineKey: null,
    });
    expect(status?.totals.delivered).toBe(3);
    // One follow-up for the GRN's lines sent for review reaches Booking (goods-in 2, 4.10; POL-02.16).
    expect(await exceptionsOn([grnId])).toEqual([{ type: 'receiving.booking-review', owner_user_id: booker.user.id }]);
    const work = myWorkSchema.parse(ok(await get(booker, '/api/inbox/my-work'))).items;
    expect(work.some((item) => item.kind === 'exception')).toBe(true);
  });

  it('PRD-BKG-007 every line of a GRN at a Site that is not the booking’s destination goes to review, and links nothing', async () => {
    const before = (await readBooking(booker, booking.id)).status?.totals.delivered;
    const { grnId, arrival } = await received(booking.id, [{ styleCode: STYLE, size: 'S', quantity: 1 }], {
      world: other,
    });
    expect(arrival.grn?.bookingLinks).toEqual([
      expect.objectContaining({
        atIssue: { outcome: 'review', bookingId: booking.id, reason: 'other-site', lineKey: null },
        link: null,
      }),
    ]);
    expect((await readBooking(booker, booking.id)).status?.totals.delivered).toBe(before);
    expect(await exceptionsOn([grnId])).toEqual([{ type: 'receiving.booking-review', owner_user_id: booker.user.id }]);
  });

  it('PRD-BKG-008 goods-in 12 test 6 an unbooked GRN goes to Booking for review in My work, who links it later, dated and signed; the later link changes nothing on the GRN', async () => {
    const target = await approvedBooking([line(STYLE, 10, { size: size('M').code })]);
    const { grnId, arrival } = await received(undefined, [{ styleCode: STYLE, size: 'M', quantity: 4 }]);
    expect(arrival.bookingId).toBeNull();
    const [only] = arrival.grn?.bookingLinks ?? [];
    expect(only).toMatchObject({ atIssue: null, link: null, proposal: null });
    // Nothing is linked at issue: the GRN goes to Booking for review, one follow-up linking to it, to link its lines
    // later (goods-in 4.10; RR-580, following design test 6).
    expect(await exceptionsOn([grnId])).toEqual([{ type: 'receiving.booking-review', owner_user_id: booker.user.id }]);
    const grnLineId = only?.grnLineId ?? '';
    // Goods of another size are not the line's: a receipt link always names a line its goods match (goods-in 3.10).
    const wrong = await post(booker, `/api/receiving/grns/${grnId}/booking-links`, {
      bookingId: booking.id,
      lines: [{ grnLineId, lineKey: keyOf(booking, 'S') }],
    });
    expect(errorOf(wrong)).toMatchObject({ code: 'booking.goods-not-of-line' });
    const linked = ok(
      await post(booker, `/api/receiving/grns/${grnId}/booking-links`, {
        bookingId: target.id,
        lines: [{ grnLineId, lineKey: keyOf(target, 'M') }],
      }),
    );
    expect(linked).toEqual({
      linked: [{ grnLineId, linkId: expect.any(String) as string, lineKey: keyOf(target, 'M') }],
      proposal: null,
    });
    const after = await readArrival(booker, arrival.id);
    // The GRN is never changed: its lines read as they did (PRD-REC-019); its link is the booking's record.
    expect(after.grn?.lines).toEqual(arrival.grn?.lines);
    expect(after.grn?.bookingLinks[0]).toMatchObject({
      atIssue: null,
      link: { bookingId: target.id, kind: 'later', proposalId: null, linkedBy: booker.user.id },
    });
    expect((await readBooking(booker, target.id)).status?.lines[0]).toMatchObject({ delivered: 4, outstanding: 6 });
    const again = await post(booker, `/api/receiving/grns/${grnId}/booking-links`, {
      bookingId: target.id,
      lines: [{ grnLineId, lineKey: keyOf(target, 'M') }],
    });
    expect(errorOf(again)?.code).toBe('booking.receipt-already-linked');
  });

  it('PRD-SEC-005 a GRN, or a booking, the reader may not see is not found, never refused as not authorised', async () => {
    const { grnId, arrival } = await received(undefined, [{ styleCode: STYLE, size: 'L', quantity: 1 }]);
    const lineId = arrival.grn?.lines[0]?.id ?? '';
    const body = { bookingId: booking.id, lines: [{ grnLineId: lineId, lineKey: keyOf(booking, 'S') }] };
    const hiddenGrn = await post(blindBooker, `/api/receiving/grns/${grnId}/booking-links`, body);
    expect(hiddenGrn.status).toBe(404);
    expect(errorOf(hiddenGrn)?.code).toBe('receiving.record-not-found');
    const absent = await post(booker, `/api/receiving/grns/${grnId}/booking-links`, { ...body, bookingId: uuidv7() });
    expect(absent.status).toBe(404);
    expect(errorOf(absent)?.code).toBe('booking.record-not-found');
  });
});

describe('a recount and the booking a GRN line delivers to (goods-in 3.6, 4.11; S2-F02-T05)', () => {
  /** Proposes a recount of the GRN line at the pieces given, as the recounter, naming the GRN's recount version. */
  async function recount(arrivalId: string, grnLineId: string, countedQuantity: number): Promise<Call> {
    const grn = (await readArrival(recounter, arrivalId)).grn;
    return post(recounter, `/api/receiving/grns/${grn?.id ?? ''}/recounts`, {
      versionToken: grn?.recountVersionToken,
      reason: 'SYNTHETIC recounted at the shelf',
      lines: [{ grnLineId, countedQuantity }],
    });
  }

  it('PRD-BKG-006 PRD-REC-019 a line delivering to a booking is not recounted, whatever the recounter sees; a line received without one is, and links later at its recounted pieces', async () => {
    const target = await approvedBooking([line(STYLE, 10, { size: size('L').code })]);
    const against = await received(target.id, [{ styleCode: STYLE, size: 'L', quantity: 4 }]);
    const linkedLine = against.arrival.grn?.lines[0]?.id ?? '';
    expect(against.arrival.grn?.bookingLinks[0]?.atIssue).toMatchObject({ outcome: 'linked' });
    // The recounter may not see bookings, yet the link is known: a narrowly authorised read (DEC-117).
    const refused = await recount(against.arrival.id, linkedLine, 3);
    expect(refused.status).toBe(422);
    expect(errorOf(refused)).toMatchObject({
      code: 'receiving.recount-linked',
      missing: [{ kind: 'record', recordType: 'receiving.grn_line', recordId: linkedLine }],
    });
    // Received without a booking, recounted, then linked: the booking's delivered pieces follow the recount.
    const unbooked = await received(undefined, [{ styleCode: STYLE, size: 'L', quantity: 4 }]);
    const grnLineId = unbooked.arrival.grn?.lines[0]?.id ?? '';
    const proposed = ok(await recount(unbooked.arrival.id, grnLineId, 2));
    // The recount finds a shortage, which reaches Booking as the GRN's own would (goods-in 4.9, 4.11; POL-02.16).
    await route('receiving.shortage', fixture.siteId);
    ok(await decide(recountApprover, proposed.requestId as string, proposed.recountId as string));
    ok(
      await post(booker, `/api/receiving/grns/${unbooked.grnId}/booking-links`, {
        bookingId: target.id,
        lines: [{ grnLineId, lineKey: keyOf(target, 'L') }],
      }),
    );
    expect((await readBooking(booker, target.id)).status?.lines[0]).toMatchObject({ delivered: 6, outstanding: 4 });
    // Linked now, it is not recounted again.
    expect(errorOf(await recount(unbooked.arrival.id, grnLineId, 3))?.code).toBe('receiving.recount-linked');
  });
});

describe('late or excess goods, approved before acceptance into the booking (goods-in 4.10; POL-05.08)', () => {
  it('POL-05.08 a line beyond the booking line’s outstanding goes to review whole; Booking proposes it and a different person approves it', async () => {
    const booking = await approvedBooking([line(STYLE, 2, { size: size('XL').code })]);
    const { grnId, arrival } = await received(booking.id, [{ styleCode: STYLE, size: 'XL', quantity: 3 }]);
    const [review] = arrival.grn?.bookingLinks ?? [];
    expect(review).toMatchObject({
      atIssue: { outcome: 'review', bookingId: booking.id, reason: 'excess', lineKey: keyOf(booking, 'XL') },
      link: null,
    });
    expect((await readBooking(booker, booking.id)).status?.totals.delivered).toBe(0);
    const grnLineId = review?.grnLineId ?? '';
    const proposed = ok(
      await post(booker, `/api/receiving/grns/${grnId}/booking-links`, {
        bookingId: booking.id,
        lines: [{ grnLineId, lineKey: keyOf(booking, 'XL') }],
      }),
    ) as { linked: unknown[]; proposal: { proposalId: string; requestId: string; grnLineIds: string[] } };
    expect(proposed.linked).toEqual([]);
    expect(proposed.proposal.grnLineIds).toEqual([grnLineId]);
    // The proposal waits, with its facts for the approval panel; nothing is delivered before its approval.
    const waiting = await readBooking(owner, booking.id);
    expect(waiting.receiptLinkProposals).toEqual([
      expect.objectContaining({
        id: proposed.proposal.proposalId,
        state: 'Awaiting approval',
        proposedBy: booker.user.id,
        lines: [
          expect.objectContaining({
            grnId,
            grnNumber: arrival.grn?.number,
            grnLineId,
            lineKey: keyOf(booking, 'XL'),
            styleCode: STYLE,
            size: size('XL').code,
            quantity: 3,
            late: false,
            excess: true,
          }),
        ],
      }),
    ]);
    expect(waiting.status?.totals.delivered).toBe(0);
    expect((await readArrival(booker, arrival.id)).grn?.bookingLinks[0]?.proposal).toEqual({
      bookingId: booking.id,
      proposalId: proposed.proposal.proposalId,
      lineKey: keyOf(booking, 'XL'),
    });
    // The proposer may not approve it (POL-02.07); a different authorised person does.
    expect(errorOf(await decide(booker, proposed.proposal.requestId, proposed.proposal.proposalId))?.code).toMatch(
      /^access\./,
    );
    ok(await decide(owner, proposed.proposal.requestId, proposed.proposal.proposalId));
    const accepted = await readBooking(booker, booking.id);
    expect(accepted.status?.lines[0]).toMatchObject({ delivered: 3, outstanding: 0, overDelivered: 1 });
    expect(accepted.receiptLinkProposals[0]?.state).toBe('Approved');
    expect((await readArrival(booker, arrival.id)).grn?.bookingLinks[0]).toMatchObject({
      link: { kind: 'later', proposalId: proposed.proposal.proposalId, linkedBy: owner.user.id },
      proposal: null,
    });
    expect(BOOKING_RECEIPT_LINK).toBe('booking.booking.link-receipt');
  });

  it('POL-05.08 goods arriving after the delivery window go to review as late; a second proposal waits for the first, and a rejected one links nothing', async () => {
    const booking = await approvedBooking([line(STYLE, 10, { size: size('S').code })], {
      from: setup.day(-20),
      to: setup.day(-1),
    });
    const first = await received(booking.id, [{ styleCode: STYLE, size: 'S', quantity: 2 }]);
    const second = await received(booking.id, [{ styleCode: STYLE, size: 'S', quantity: 1 }]);
    for (const each of [first, second]) {
      expect(each.arrival.grn?.bookingLinks[0]?.atIssue).toEqual({
        outcome: 'review',
        bookingId: booking.id,
        reason: 'late',
        lineKey: keyOf(booking, 'S'),
      });
    }
    const propose = (of: typeof first) =>
      post(booker, `/api/receiving/grns/${of.grnId}/booking-links`, {
        bookingId: booking.id,
        lines: [{ grnLineId: of.arrival.grn?.lines[0]?.id, lineKey: keyOf(booking, 'S') }],
      });
    const proposed = ok(await propose(first)) as { proposal: { proposalId: string; requestId: string } };
    // The proposal waiting is named by itself (code-house-rules 12.3).
    expect(errorOf(await propose(second))).toMatchObject({
      code: 'booking.link-proposal-pending',
      missing: [
        {
          kind: 'record',
          recordType: 'booking.booking_receipt_link_proposal',
          recordId: proposed.proposal.proposalId,
        },
      ],
    });
    expect(errorOf(await propose(first))?.code).toBe('booking.receipt-link-proposed');
    ok(await decide(owner, proposed.proposal.requestId, proposed.proposal.proposalId, 'reject'));
    const rejected = await readBooking(booker, booking.id);
    expect(rejected.status?.totals.delivered).toBe(0);
    expect(rejected.receiptLinkProposals[0]?.state).toBe('Rejected');
    // Rejected, the line may be proposed again; approved, the late pieces count as delivered.
    const again = ok(await propose(first)) as { proposal: { proposalId: string; requestId: string } };
    ok(await decide(owner, again.proposal.requestId, again.proposal.proposalId));
    expect((await readBooking(booker, booking.id)).status?.lines[0]).toMatchObject({ delivered: 2, outstanding: 8 });
  });
});

describe('one list of review reasons (goods-in 3.7, 4.10; code review 6 of stage 2)', () => {
  it("PRD-BKG-007 the database's check of a GRN line's review takes the reasons the shared schema names", async () => {
    const verify = await connect(database, 'verify');
    try {
      const found = await verify.query<{ definition: string }>(
        `select pg_catalog.pg_get_constraintdef(oid) as definition from pg_catalog.pg_constraint
          where conname = 'grn_line_booking_reason'`,
      );
      const definition = found.rows[0]?.definition ?? '';
      const listed = [...definition.matchAll(/'([a-z-]+)'::text/g)].map((match) => match[1]);
      // The reasons of the review, and the two outcomes the check names besides.
      expect(new Set(listed)).toEqual(new Set([...reviewReasonSchema.options, 'linked', 'review']));
    } finally {
      await verify.end();
    }
  });
});

describe('an Arrival against a booking (goods-in 3.7, 4.2, 4.10)', () => {
  function arrivalBody(bookingId: string, at: ReceivingFixture = fixture) {
    return {
      businessUnitId: fixture.wholeStore,
      receivingLocationId: fixture.storeLocation,
      supplierPartyId: at.supplier.id,
      brandId: at.brand.id,
      transporter: syntheticName('Transporter'),
      lorryReceipt: { number: 'SYN-LR-RAB', date: setup.today() },
      cartons: 1,
      arrivedAt: new Date(clock.now().getTime() - 60_000).toISOString(),
      bookingId,
    };
  }

  it('PRD-REC-002 POL-05.01 an Arrival names only an approved booking of its supplier and brand, one the receiver may see', async () => {
    const approved = await approvedBooking([line(STYLE, 1, { size: size('S').code })]);
    const draft = ok(
      await post(booker, '/api/booking/bookings', {
        brandId: fixture.brand.id,
        destinationSiteId: fixture.siteId,
        supplierPartyId: fixture.supplier.id,
        seasonValueId: season,
        deliveryWindow: { from: setup.day(0), to: setup.day(30) },
        lines: [line(STYLE, 1)],
      }),
    );
    expect(errorOf(await post(receiver, '/api/receiving/arrivals', arrivalBody(draft.bookingId as string)))?.code).toBe(
      'booking.not-approved',
    );
    expect(errorOf(await post(receiver, '/api/receiving/arrivals', arrivalBody(approved.id, other)))?.code).toBe(
      'receiving.booking-not-of-arrival',
    );
    const hidden = await post(plainReceiver, '/api/receiving/arrivals', arrivalBody(approved.id));
    expect(hidden.status).toBe(404);
    expect(errorOf(hidden)?.code).toBe('booking.record-not-found');
    ok(await post(receiver, '/api/receiving/arrivals', arrivalBody(approved.id)));
    // The bookings goods may be received against, as "Receive against booking" offers them (goods-in 4.1).
    const list = ok(
      await get(
        receiver,
        `/api/booking/bookings?receivable=true&brandId=${fixture.brand.id}&supplierPartyId=${fixture.supplier.id}`,
      ),
    ) as { bookings: { id: string }[] };
    const ids = list.bookings.map((each) => each.id);
    expect(ids).toContain(approved.id);
    expect(ids).not.toContain(draft.bookingId);
  });
});
