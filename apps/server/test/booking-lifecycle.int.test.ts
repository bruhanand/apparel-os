import { randomInt } from 'node:crypto';
import { uuidv7 } from '@apparel-os/domain';
import {
  BOOKING_APPROVAL,
  arrivalReadSchema,
  bookingReadSchema,
  exceptionViewSchema,
  myWorkSchema,
  openToBuyBudgetReadSchema,
  type AgreementTerms,
  type AssignmentScope,
  type Booking,
} from '@apparel-os/schemas';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  COMMAND_RUNNER,
  CommandRunner,
  IdempotencyHelper,
  OrganisationRouter,
  OUTBOX_AUTHORITY,
  OUTBOX_PROCESSOR_IDENTITY,
  restrictedValueCipherNotConfigured,
  secretCheckNotImplemented,
  Worker,
  type JobRegistry,
  type RoutedOrganisation,
} from '../src/kernel/index.js';
// The access module's JobIdentities, as AccessJobIdentitiesModule provides it to the worker (RR-273).
import { jobIdentities } from '../src/modules/access/commands/job-identities.js';
import { Audit } from '../src/modules/audit/index.js';
import { BOOKING_JOBS_IDENTITY, bookingJobKinds, overdueExceptionType } from '../src/modules/booking/index.js';
// The overdue job's selection, which only this test reads apart from the job (goods-in 3.10).
import { overdueCandidates } from '../src/modules/booking/queries/overdue.js';
import { Exceptions } from '../src/modules/exceptions/index.js';
import { Inbox } from '../src/modules/inbox/index.js';
import { NUMBERING, type NumberingInterface } from '../src/modules/numbering/index.js';
import { composedNumbering } from '../src/numbered-kinds.js';
import { defineSyntheticBookingSeries } from './fixtures/booking-series.js';
import { defineSyntheticGrnSeries } from './fixtures/grn-series.js';
import { syntheticCode, syntheticName } from './fixtures/synthetic.js';
import { syntheticWorkerSettings } from './fixtures/worker-settings.js';
import {
  codeFor,
  startAccessApp,
  syntheticKeysEnvironment,
  SyntheticClock,
  syntheticTimezone,
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
import { capturingLogger, eventually, writeSyntheticServiceIdentity } from './support/jobs.js';
import { writeSyntheticMarking } from './support/marked-attributes.js';
import { startTestFileStore, type TestFileStore } from './support/minio.js';
import { STORE_FILE_PATH, syntheticPdfUpload } from './support/opening-app.js';
import { decided, structureSetup, type StructureSetup } from './support/organisation.js';
import { createSyntheticOrganisations, type SyntheticWorld } from './support/organisations.js';
import { databaseUrl } from './support/postgres.js';
import {
  placeScope,
  RECEIVER_AUTHORITY,
  receivingFixture,
  receivingGateOpen,
  receivingGranted,
  type ReceivingFixture,
} from './support/receiving.js';

// S2-F01-T04: an approved booking's lifecycle through the whole application, on real PostgreSQL (goods-in 3.4 to 3.8,
// 3.10, 10.3, 12 tests 4, 5 and 7; PRD-BKG-005, PRD-BKG-006, PRD-BKG-008, PRD-BKG-009, PRD-BKG-013; POL-05.01,
// POL-05.03 to POL-05.07, POL-05.10; DEC-099, DEC-132). Booking records Issued and Confirmed; a change after approval is
// a new version approved again, reserving or releasing the difference and taking the Agreement version then in force;
// a cancellation of an undelivered balance and an extension of the window are each approved by a different person;
// delivered quantities come from receipt links, made by real GRNs issued against the booking through receiving's routes
// (S2-F02-T04; receiving-against-booking.int.test.ts proves the links themselves, tests 5 and 6 of goods-in section 12);
// and an overdue balance reaches Booking in My work, raised by the overdue job, with nothing cancelled. Policies 5 and 1
// are opened through TEST-ONLY checks reporting labelled synthetic values (RR-561, RR-565; support/booking.ts), and
// policies 4 and 10 on the values the modules report. Every person, place, brand, price, budget, limit, date and number
// here is SYNTHETIC.

const BOOKING_TYPE = 'booking.booking';
const BUDGET = 'booking.open_to_buy_budget';
const CHECK = 'booking.open_to_buy_check';
const PANEL: SyntheticAuthority = { recordType: 'access.approval_request', action: 'view' };
/** SYNTHETIC amounts in paise. */
const SYNTHETIC_BUDGET = 100_000_000;
const SYNTHETIC_LIMIT = 500_000_000;
const COST = 50_000;

const log = capturingLogger();
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
let approveReason: string;
let rejectReason: string;
const cookies = new Map<string, string>();
const assignments = new Map<string, string>();
/** Booking (P-BKG): records, changes and proposes; prepares budgets; owns the overdue exceptions. */
let booker: SyntheticUser;
let accounts: SyntheticUser;
/** The Owner (P-OWN): approves budgets, bookings, cancellations and extensions within a SYNTHETIC limit. */
let owner: SyntheticUser;
/** Warehouse (P-WHS): receives goods against the bookings, so sees them too (goods-in 4.10). */
let receiver: SyntheticUser;
let settingsAdmin: SyntheticUser;
let settingsApprover: SyntheticUser;
let seasons: string[];
let budgetId: string;

interface Call {
  readonly status: number;
  readonly body: Record<string, unknown>;
}

const errorOf = (call: Call) => (call.body as { error?: { code: string; missing?: Record<string, string>[] } }).error;

function freshCode(user: SyntheticUser): string {
  clock.advance(30);
  return codeFor(user.factorSecret ?? Buffer.alloc(0), 0, clock.now());
}

async function signIn(user: SyntheticUser): Promise<void> {
  const response = await fetch(`${api.baseUrl}/api/access/sign-in`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: SYNTHETIC_ORIGIN, 'x-forwarded-for': '10.9.9.74' },
    body: JSON.stringify({ organisationCode, login: user.login, password: user.password, totpCode: freshCode(user) }),
  });
  expect(response.status).toBe(200);
  cookies.set(user.id, (response.headers.get('set-cookie') ?? '').split(';')[0] ?? '');
}

async function enrolled(
  label: string,
  authorities: readonly SyntheticAuthority[],
  scope?: AssignmentScope,
): Promise<SyntheticUser> {
  const user = await writeSyntheticUser(database, organisationCode, keys, {
    label: `${label}${String(randomInt(1_000_000))}`,
    enrolled: true,
  });
  const granted = await grantSynthetic(
    database,
    { kind: 'user', id: user.id },
    authorities,
    scope === undefined ? {} : { scope },
  );
  assignments.set(user.id, granted.assignmentId);
  await signIn(user);
  return user;
}

async function post(user: SyntheticUser, path: string, body: unknown, key: string = uuidv7()): Promise<Call> {
  const response = await fetch(`${api.baseUrl}${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: SYNTHETIC_ORIGIN,
      cookie: cookies.get(user.id) ?? '',
      'idempotency-key': key,
    },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

async function get(user: SyntheticUser, path: string): Promise<Call> {
  const response = await fetch(`${api.baseUrl}${path}`, { headers: { cookie: cookies.get(user.id) ?? '' } });
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

function decide(
  by: SyntheticUser,
  requestId: string,
  versionId: string,
  outcome: 'approve' | 'reject' = 'approve',
): Promise<Call> {
  return post(by, `/api/access/approval-requests/${requestId}/decision`, {
    versionId,
    outcome,
    reason: { kind: 'listed', reasonId: outcome === 'approve' ? approveReason : rejectReason },
    totpCode: freshCode(by),
  });
}

function ok(call: Call): Record<string, unknown> {
  expect(call.status, JSON.stringify(call.body)).toBe(200);
  return call.body;
}

let fileCount = 0;
async function storedFile(user: SyntheticUser): Promise<{ storedFileId: string; fileReceiptId: string }> {
  fileCount += 1;
  const stored = ok(await post(user, STORE_FILE_PATH, syntheticPdfUpload('BOOKING', `LIFE-${String(fileCount)}`)));
  return { storedFileId: stored.storedFileId as string, fileReceiptId: stored.receiptId as string };
}

/** The fixture's size value of the label given, whose code a booking line and a GRN line name (goods-in 4.3). */
function sizeOf(label: string): { readonly id: string; readonly code: string } {
  const value = fixture.sizes.values.find((each) => each.label === label);
  if (value === undefined) throw new Error(`no size ${label}`);
  return value;
}

/** One line at the SYNTHETIC cost, with colour and size where given; a size by its label, written as its code. */
function line(
  styleCode: string,
  quantity: number,
  options: { colour?: string; size?: string; deliveryDate?: string; lineKey?: string } = {},
) {
  return {
    ...(options.lineKey === undefined ? {} : { lineKey: options.lineKey }),
    styleCode,
    colour: options.colour ?? null,
    size: options.size === undefined ? null : sizeOf(options.size).code,
    quantity,
    indicativeCost: COST,
    mrp: 99_900,
    deliveryDate: options.deliveryDate ?? null,
  };
}

async function readBooking(user: SyntheticUser, bookingId: string): Promise<Booking> {
  return bookingReadSchema.parse(ok(await get(user, `/api/booking/bookings/${bookingId}`))).booking;
}

/** Records, documents and submits a booking as Booking, and has the Owner approve it; answers the booking. */
async function approvedBooking(
  lines: readonly ReturnType<typeof line>[],
  window: { from: string; to: string } = { from: setup.day(0), to: setup.day(30) },
): Promise<Booking> {
  const made = ok(
    await post(booker, '/api/booking/bookings', {
      brandId: fixture.brand.id,
      destinationSiteId: fixture.siteId,
      supplierPartyId: fixture.supplier.id,
      seasonValueId: seasons[0],
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

function keyOf(booking: Booking, size: string): string {
  const found = booking.status?.lines.find((each) => each.size === sizeOf(size).code);
  if (found === undefined) throw new Error(`no line of size ${size}`);
  return found.lineKey;
}

/** The remaining open-to-buy of the budget, read as the Owner. */
async function remaining(): Promise<number> {
  const budget = openToBuyBudgetReadSchema.parse(ok(await get(owner, `/api/booking/open-to-buy-budgets/${budgetId}`)))
    .budget.remaining;
  if (budget.kind !== 'approved') throw new Error('The budget is not approved');
  return budget.remaining;
}

/**
 * Goods received against a booking through receiving's routes, as the receiver (goods-in 4.2 to 4.5, 4.10; S2-F02-T04):
 * an Arrival naming the booking at its destination's Store, its invoice, a count line for each, as invoiced, and its
 * GRN; each line links at issue to the booking line it matches. A late or excess line goes to Booking for review
 * (POL-05.08): Booking proposes it and the Owner approves it, so its pieces count as delivered too.
 */
async function receive(
  bookingId: string,
  lines: readonly { size: string; colour?: string | null; quantity: number; styleCode?: string }[],
): Promise<void> {
  const made = ok(
    await post(receiver, '/api/receiving/arrivals', {
      businessUnitId: fixture.wholeStore,
      receivingLocationId: fixture.storeLocation,
      supplierPartyId: fixture.supplier.id,
      brandId: fixture.brand.id,
      transporter: syntheticName('Transporter'),
      lorryReceipt: { number: 'SYN-LR-LIF', date: setup.today() },
      cartons: 1,
      arrivedAt: new Date(clock.now().getTime() - 60_000).toISOString(),
      bookingId,
    }),
  );
  const arrivalId = made.arrivalId as string;
  ok(
    await post(receiver, `/api/receiving/arrivals/${arrivalId}/invoices`, {
      number: `SYN-INV-LIF-${String(randomInt(1_000_000_000))}`,
      date: setup.today(),
      file: await storedFile(receiver),
    }),
  );
  for (const each of lines) {
    ok(
      await post(receiver, `/api/receiving/arrivals/${arrivalId}/count-lines`, {
        goods: 'on-invoice',
        styleCode: each.styleCode ?? 'SYN-LIFE',
        colour: each.colour === undefined ? 'SYN NAVY' : each.colour,
        sizeValueId: sizeOf(each.size).id,
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
  const issued = ok(await post(receiver, `/api/receiving/arrivals/${arrivalId}/grn`, { versionToken: read.versionToken }));
  const grn = arrivalReadSchema.parse(ok(await get(receiver, `/api/receiving/arrivals/${arrivalId}`))).arrival.grn;
  const reviewed = (grn?.bookingLinks ?? []).flatMap((each) =>
    each.atIssue?.outcome === 'review' && each.atIssue.lineKey !== null
      ? [{ grnLineId: each.grnLineId, lineKey: each.atIssue.lineKey }]
      : [],
  );
  if (reviewed.length === 0) return;
  const proposed = ok(
    await post(booker, `/api/receiving/grns/${issued.grnId as string}/booking-links`, { bookingId, lines: reviewed }),
  ) as { proposal: { proposalId: string; requestId: string } };
  ok(await decide(owner, proposed.proposal.requestId, proposed.proposal.proposalId));
}

/** Terms with every value Unknown but the ownership-transfer event (POL-01.05), for a SYNTHETIC Agreement version. */
function terms(): AgreementTerms {
  return {
    commercialModel: null,
    ownershipEvent: { kind: 'sale-to-customer' },
    returnRights: { allowed: null, window: null, startsAt: null },
    returnConditions: {
      conditionTags: null,
      packagingLimits: null,
      quantityLimits: null,
      supplierApproval: null,
      freightAndDeductions: null,
      settlement: null,
    },
    commissions: null,
    paymentTerms: null,
    creditNoteTerms: null,
    promotionTerms: null,
    cashDiscount: { rate: null, days: null, from: null },
    interest: { rate: null, days: null, from: null },
  };
}

beforeAll(async () => {
  world = await createSyntheticOrganisations('lifecycle');
  database = world.organisations[0].database;
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
    log.logger,
  );
  const routed = await router.resolveForSignIn(organisationCode);
  if (!routed.routed) throw new Error('not routed');
  organisation = routed.organisation;
  setup = await structureSetup({
    directory: world.directory,
    database,
    organisationCode,
    keysEnvironment: keys,
    label: 'LIFECYCLE',
  });
  fixture = await receivingFixture(setup, database, 'LIF', { sizes: ['S', 'M', 'L', 'XL'] });
  // Goods are received against the bookings at the destination's Store (goods-in 4.10).
  await receivingGateOpen(setup, database, BOOKING_POLICY_CHECKS);
  await receivingGranted(setup, database, fixture.siteId, [fixture.wholeStore], BOOKING_POLICY_CHECKS);
  const today = setup.today();
  const okOf = <A>(outcome: { kind: 'success'; answer: A } | { kind: 'refusal'; refusal: { code: string } }): A => {
    if (outcome.kind !== 'success') throw new Error(`Refused: ${outcome.refusal.code}`);
    return outcome.answer;
  };
  const seasonAttribute = okOf(
    await setup.asPreparerDo((c, p) =>
      setup.catalogue.prepareAttribute(c, p, {
        code: syntheticCode(`LIF-SEASON-${String(randomInt(1_000_000))}`),
        valueKind: 'list',
        name: syntheticName('SEASON'),
        validFrom: today,
      }),
    ),
  ).recordId;
  seasons = [];
  for (const label of ['SS1', 'AW1']) {
    const proposed = okOf(
      await setup.asPreparerDo((c, p) =>
        setup.catalogue.proposeVocabularyValue(c, p, {
          attributeId: seasonAttribute,
          code: syntheticCode(`${label}-${String(randomInt(1_000_000))}`),
          name: syntheticName(label),
        }),
      ),
    );
    decided(await setup.decide(proposed.requestId, proposed.proposalId));
    const confirmed = await setup.run(setup.preparer.id, (c) => setup.catalogue.proposal(c, proposed.proposalId));
    if (confirmed?.valueId === undefined) throw new Error(`${label} was not confirmed`);
    seasons.push(confirmed.valueId);
  }
  await writeSyntheticMarking(database, 'season', seasonAttribute, setup.preparer.id);

  booker = await enrolled('LIF-BOOKER', [
    { recordType: BOOKING_TYPE, action: 'view' },
    { recordType: BOOKING_TYPE, action: 'create' },
    { recordType: BOOKING_TYPE, action: 'edit' },
    { recordType: BUDGET, action: 'view' },
    { recordType: BUDGET, action: 'create' },
    { recordType: 'files_imports.stored_file', action: 'create' },
    { recordType: 'exceptions.exception', action: 'view' },
    { recordType: 'exceptions.exception', action: 'edit' },
    // Reading the GRNs whose late lines Booking proposes into the booking (goods-in 4.10).
    { recordType: 'receiving.arrival', action: 'view' },
    PANEL,
  ]);
  accounts = await enrolled('LIF-ACCOUNTS', [
    { recordType: BUDGET, action: 'view' },
    { recordType: CHECK, action: 'view' },
    { recordType: CHECK, action: 'approve' },
    PANEL,
  ]);
  owner = await enrolled('LIF-OWNER', [
    { recordType: BOOKING_TYPE, action: 'view' },
    { recordType: BOOKING_TYPE, action: 'approve' },
    { recordType: BUDGET, action: 'view' },
    { recordType: BUDGET, action: 'approve' },
    PANEL,
  ]);
  receiver = await enrolled('LIF-RECEIVER', [...RECEIVER_AUTHORITY, { recordType: BOOKING_TYPE, action: 'view' }]);
  settingsAdmin = await enrolled('LIF-SETTINGS', [
    { recordType: 'access.approval_limit', action: 'view' },
    { recordType: 'access.approval_limit', action: 'create' },
    { recordType: 'exceptions.exception_routing', action: 'view' },
    { recordType: 'exceptions.exception_routing', action: 'edit' },
  ]);
  settingsApprover = await enrolled('LIF-SETTINGS-APPROVER', [
    { recordType: 'access.approval_limit', action: 'view' },
    { recordType: 'access.approval_limit', action: 'approve' },
    { recordType: 'exceptions.exception_routing', action: 'approve' },
    PANEL,
  ]);
  // The Owner's SYNTHETIC booking limit (V-02), prepared and approved by two other people (9.2).
  const limit = ok(
    await post(settingsAdmin, '/api/access/approval-limits', {
      actionType: BOOKING_APPROVAL,
      holder: { kind: 'individual', userId: owner.id, roleAssignmentId: assignments.get(owner.id) },
      limit: { kind: 'amount', amount: SYNTHETIC_LIMIT },
      coversUnknown: false,
      origin: 'synthetic',
      validFrom: today,
    }),
  );
  ok(await decide(settingsApprover, limit.requestId as string, limit.limitId as string));
  // A SYNTHETIC budget for the brand and the first season: prepared, checked and approved by three people (3.3).
  const prepared = ok(
    await post(booker, '/api/booking/open-to-buy-budgets', {
      brandId: fixture.brand.id,
      seasonValueId: seasons[0],
      amount: SYNTHETIC_BUDGET,
      origin: 'synthetic',
    }),
  );
  budgetId = prepared.budgetId as string;
  ok(await decide(accounts, prepared.requestId as string, prepared.versionId as string));
  const budget = openToBuyBudgetReadSchema.parse(
    ok(await get(owner, `/api/booking/open-to-buy-budgets/${budgetId}`)),
  ).budget;
  const approvalId = budget.versions[0]?.request?.id;
  if (approvalId === undefined) throw new Error('The budget approval was not requested');
  ok(await decide(owner, approvalId, prepared.versionId as string));
  // The overdue balance routed to Booking at the Site, by a SYNTHETIC owner and due time (12.2; POL-02.16; V-03).
  const routing = ok(
    await post(settingsAdmin, '/api/exceptions/routing', {
      typeCode: 'booking.overdue-balance',
      siteId: fixture.siteId,
      owner: { kind: 'user', userId: booker.id },
      dueRule: { format: 'elapsed-minutes-v1', minutes: 60 },
      escalation: { kind: 'user', userId: booker.id },
      validFrom: today,
      origin: 'synthetic',
    }),
  );
  ok(await decide(settingsApprover, routing.requestId as string, routing.versionId as string));
  // Late goods go to Booking for review at the GRN's issue (goods-in 4.10; POL-05.08), routed the same way.
  const review = ok(
    await post(settingsAdmin, '/api/exceptions/routing', {
      typeCode: 'receiving.booking-review',
      siteId: fixture.siteId,
      owner: { kind: 'user', userId: booker.id },
      dueRule: { format: 'elapsed-minutes-v1', minutes: 60 },
      escalation: { kind: 'user', userId: booker.id },
      validFrom: today,
      origin: 'synthetic',
    }),
  );
  ok(await decide(settingsApprover, review.requestId as string, review.versionId as string));
  await bookingGateOpen(setup, database);
  const numbering = api.app.get<NumberingInterface>(NUMBERING);
  await api.app.get<CommandRunner>(COMMAND_RUNNER).run(
    {
      commandName: 'test.define-series',
      organisation,
      correlationId: uuidv7(),
      actor: { kind: 'actor', actorId: owner.id },
    },
    async (context) => {
      await defineSyntheticBookingSeries(context, numbering);
      await defineSyntheticCodeSeries(context, numbering);
      await defineSyntheticGrnSeries(context, numbering);
    },
  );
}, 300_000);

afterAll(async () => {
  await (setup as StructureSetup | undefined)?.close();
  await (router as OrganisationRouter | undefined)?.close();
  await (api as AccessTestApp | undefined)?.close();
  await (minio as TestFileStore | undefined)?.stop();
  await (world as SyntheticWorld | undefined)?.reset();
});

describe('a booking the reader may not see (code-house-rules 12.3, 12.4)', () => {
  it('PRD-SEC-005 a booking hidden from the reader, or not there, is not found, never not authorised; and so is its replay', async () => {
    const booking = await approvedBooking([line('SYN-HIDDEN', 1, { size: 'S' })]);
    // Scoped to one Store, whose Site the booking's destination is: a Store's scope does not cover its Site (3.9).
    const storeReader = await enrolled(
      'LIF-STORE-READER',
      [
        { recordType: BOOKING_TYPE, action: 'view' },
        { recordType: BOOKING_TYPE, action: 'edit' },
      ],
      placeScope([{ type: 'store', id: fixture.storeId }]),
    );
    for (const bookingId of [booking.id, uuidv7()]) {
      const read = await get(storeReader, `/api/booking/bookings/${bookingId}`);
      expect(read.status).toBe(404);
      expect(errorOf(read)).toMatchObject({
        code: 'booking.record-not-found',
        missing: [{ kind: 'record', recordType: BOOKING_TYPE, recordId: bookingId }],
      });
    }
    // A command on it is not found too, and its replay under the same key answers as any request failing the same
    // checks would: not found again, never not authorised (12.4 "Replay").
    const key = uuidv7();
    const body = { versionToken: booking.versionToken, issuedOn: setup.today() };
    for (const attempt of ['first', 'replay']) {
      const issued = await post(storeReader, `/api/booking/bookings/${booking.id}/issue`, body, key);
      expect([attempt, issued.status, errorOf(issued)?.code]).toEqual([attempt, 404, 'booking.record-not-found']);
    }
  });
});

describe('Issued and Confirmed (goods-in 3.4; POL-05.01, DEC-099)', () => {
  let booking: Booking;

  it('POL-05.01 a Draft is neither issued nor confirmed; Confirmed waits for Issued; a date is never in the future', async () => {
    const draft = ok(
      await post(booker, '/api/booking/bookings', {
        brandId: fixture.brand.id,
        destinationSiteId: fixture.siteId,
        supplierPartyId: fixture.supplier.id,
        seasonValueId: seasons[0],
        deliveryWindow: { from: setup.day(0), to: setup.day(30) },
        lines: [line('SYN-LIFE', 1)],
      }),
    );
    expect(
      errorOf(
        await post(booker, `/api/booking/bookings/${draft.bookingId as string}/issue`, {
          versionToken: draft.versionToken,
          issuedOn: setup.today(),
        }),
      )?.code,
    ).toBe('booking.not-approved');
    booking = await approvedBooking([line('SYN-LIFE', 4, { size: 'S' })]);
    expect(booking.state).toBe('Approved');
    const path = `/api/booking/bookings/${booking.id}`;
    expect(
      errorOf(
        await post(booker, `${path}/confirmation`, {
          versionToken: booking.versionToken,
          confirmedOn: setup.today(),
          files: [await storedFile(booker)],
        }),
      )?.code,
    ).toBe('booking.not-issued');
    expect(
      errorOf(await post(booker, `${path}/issue`, { versionToken: booking.versionToken, issuedOn: setup.day(1) }))
        ?.code,
    ).toBe('booking.date-in-future');
    expect(
      errorOf(await post(booker, `${path}/issue`, { versionToken: booking.versionToken, issuedOn: setup.day(-1) }))
        ?.code,
    ).toBe('booking.date-too-early');
  });

  it('DEC-099 POL-05.01 Booking records Issued with its date, then Confirmed with the supplier’s confirmation', async () => {
    const path = `/api/booking/bookings/${booking.id}`;
    const issued = ok(
      await post(booker, `${path}/issue`, { versionToken: booking.versionToken, issuedOn: setup.today() }),
    );
    const afterIssue = await readBooking(booker, booking.id);
    expect(afterIssue).toMatchObject({
      state: 'Issued',
      versionToken: issued.versionToken,
      issue: { issuedOn: setup.today(), recordedBy: booker.id },
    });
    expect(
      errorOf(await post(booker, `${path}/issue`, { versionToken: afterIssue.versionToken, issuedOn: setup.today() }))
        ?.code,
    ).toBe('booking.already-issued');
    ok(
      await post(booker, `${path}/confirmation`, {
        versionToken: afterIssue.versionToken,
        confirmedOn: setup.today(),
        files: [await storedFile(booker)],
      }),
    );
    const confirmed = await readBooking(owner, booking.id);
    expect(confirmed).toMatchObject({ state: 'Confirmed', confirmation: { confirmedOn: setup.today() } });
    expect(confirmed.confirmation?.attachmentIds).toHaveLength(1);
    // The list filters by the lifecycle's states too (goods-in section 11).
    const list = ok(await get(booker, `/api/booking/bookings?state=Confirmed`));
    expect((list.bookings as { id: string }[]).map((each) => each.id)).toContain(booking.id);
  });
});

describe('cancelling an undelivered balance (goods-in 3.5, 3.6; 12 test 4)', () => {
  let booking: Booking;

  it('POL-05.07 POL-02.07 PRD-BKG-013 a cancellation, approved by another person, releases its value and keeps what was received', async () => {
    booking = await approvedBooking([
      line('SYN-LIFE', 10, { colour: 'SYN NAVY', size: 'S' }),
      line('SYN-LIFE', 10, { colour: 'SYN NAVY', size: 'M' }),
    ]);
    expect(booking.approval?.reserved).toBe(20 * COST);
    await receive(booking.id, [{ size: 'S', quantity: 4 }]);
    const before = await remaining();
    const current = await readBooking(booker, booking.id);
    const proposed = ok(
      await post(booker, `/api/booking/bookings/${booking.id}/cancellations`, {
        versionToken: current.versionToken,
        scope: { kind: 'lines', lineKeys: [keyOf(booking, 'S')] },
      }),
    );
    const amendmentId = proposed.amendmentId as string;
    const waiting = await readBooking(booker, booking.id);
    expect(waiting.amendments).toEqual([
      expect.objectContaining({
        id: amendmentId,
        kind: 'cancellation',
        state: 'Awaiting approval',
        lines: [{ lineKey: keyOf(booking, 'S'), quantity: 6 }],
      }),
    ]);
    // Nothing is cancelled before the approval; the proposer may not approve it (POL-02.07).
    expect(waiting.status?.totals.cancelled).toBe(0);
    expect(errorOf(await decide(booker, proposed.requestId as string, amendmentId))?.code).toMatch(/^access\./);
    ok(await decide(owner, proposed.requestId as string, amendmentId));
    const after = await readBooking(booker, booking.id);
    expect(after.status?.lines.find((each) => each.size === sizeOf('S').code)).toMatchObject({
      ordered: 10,
      delivered: 4,
      cancelled: 6,
      outstanding: 0,
    });
    expect(after.amendments[0]?.state).toBe('Approved');
    // 6 pieces at 500.00 released: 3,000.00 (worked by hand).
    expect(after.approval?.reserved).toBe(14 * COST);
    expect(await remaining()).toBe(before + 6 * COST);
  });

  it('POL-05.07 a cancellation is refused when the balance changed since it was proposed, and when nothing is outstanding', async () => {
    const current = await readBooking(booker, booking.id);
    const proposed = ok(
      await post(booker, `/api/booking/bookings/${booking.id}/cancellations`, {
        versionToken: current.versionToken,
        scope: { kind: 'whole' },
      }),
    );
    expect((await readBooking(booker, booking.id)).amendments.at(-1)?.lines).toEqual([
      { lineKey: keyOf(booking, 'M'), quantity: 10 },
    ]);
    await receive(booking.id, [{ size: 'M', quantity: 2 }]);
    expect(errorOf(await decide(owner, proposed.requestId as string, proposed.amendmentId as string))?.code).toBe(
      'booking.balance-changed',
    );
    const unchanged = await readBooking(booker, booking.id);
    expect(unchanged.status?.totals).toMatchObject({ cancelled: 6, outstanding: 8 });
    expect(
      errorOf(
        await post(booker, `/api/booking/bookings/${booking.id}/cancellations`, {
          versionToken: unchanged.versionToken,
          scope: { kind: 'lines', lineKeys: [keyOf(booking, 'S')] },
        }),
      )?.code,
    ).toBe('booking.nothing-outstanding');
  });
});

describe('a change after approval (goods-in 3.5, 3.10; 12 test 4)', () => {
  let booking: Booking;

  it('POL-05.03 POL-05.04 a change is a new version; after issue it carries the supplier’s communication; the version in force stays', async () => {
    booking = await approvedBooking([line('SYN-LIFE', 10, { colour: 'SYN NAVY', size: 'S' })]);
    const issued = ok(
      await post(booker, `/api/booking/bookings/${booking.id}/issue`, {
        versionToken: booking.versionToken,
        issuedOn: setup.today(),
      }),
    );
    const key = keyOf(booking, 'S');
    const saved = ok(
      await post(booker, `/api/booking/bookings/${booking.id}/drafts`, {
        versionToken: issued.versionToken,
        supplierPartyId: fixture.supplier.id,
        seasonValueId: seasons[0],
        deliveryWindow: { from: setup.day(0), to: setup.day(30) },
        lines: [
          line('SYN-LIFE', 12, { colour: 'SYN NAVY', size: 'S', lineKey: key }),
          line('SYN-LIFE', 3, { colour: 'SYN NAVY', size: 'M' }),
        ],
      }),
    );
    const changing = await readBooking(booker, booking.id);
    expect(changing).toMatchObject({
      state: 'Issued',
      change: { state: 'Draft', versionId: saved.versionId },
      status: { versionId: booking.status?.versionId, totals: { ordered: 10 } },
    });
    expect(changing.version.lines[0]?.lineKey).toBe(key);
    expect(
      errorOf(
        await post(booker, `/api/booking/bookings/${booking.id}/submission`, { versionToken: saved.versionToken }),
      )?.code,
    ).toBe('booking.communication-required');
    ok(
      await post(booker, `/api/booking/bookings/${booking.id}/submission`, {
        versionToken: saved.versionToken,
        communication: [await storedFile(booker)],
      }),
    );
    const awaiting = await readBooking(booker, booking.id);
    expect(awaiting).toMatchObject({ state: 'Issued', change: { state: 'Awaiting approval' } });
    expect(awaiting.version.communicationAttachmentIds).toHaveLength(1);
  });

  it('PRD-BKG-013 PRD-BKG-006 a change keeps what is delivered of a line, and its style, colour and size', async () => {
    await receive(booking.id, [{ size: 'S', quantity: 5 }]);
    // The change awaiting approval is rejected, so the booking takes a Draft again; one that lowers S below the 5
    // delivered, leaves it out, or makes it another size, is refused.
    const rejectedChange = await readBooking(booker, booking.id);
    const requestId = rejectedChange.version.request?.id;
    if (requestId === undefined) throw new Error('The change was not requested');
    ok(await decide(owner, requestId, rejectedChange.version.id, 'reject'));
    const back = await readBooking(booker, booking.id);
    expect(back).toMatchObject({ state: 'Issued', change: { state: 'Draft' } });
    const body = (lines: unknown[]) => ({
      versionToken: back.versionToken,
      supplierPartyId: fixture.supplier.id,
      seasonValueId: seasons[0],
      deliveryWindow: { from: setup.day(0), to: setup.day(30) },
      lines,
    });
    const key = keyOf(booking, 'S');
    expect(
      errorOf(
        await post(
          booker,
          `/api/booking/bookings/${booking.id}/drafts`,
          body([line('SYN-LIFE', 4, { colour: 'SYN NAVY', size: 'S', lineKey: key })]),
        ),
      ),
    ).toMatchObject({ code: 'booking.line-below-received', missing: [{ kind: 'booking-line', lineKey: key }] });
    expect(
      errorOf(
        await post(
          booker,
          `/api/booking/bookings/${booking.id}/drafts`,
          body([line('SYN-LIFE', 10, { colour: 'SYN NAVY', size: 'XL', lineKey: key })]),
        ),
      )?.code,
    ).toBe('booking.line-received');
    expect(
      errorOf(await post(booker, `/api/booking/bookings/${booking.id}/drafts`, body([line('SYN-LIFE', 10)]))),
    ).toMatchObject({ code: 'booking.line-below-received' });
  });

  it('POL-05.02 DEC-132 the change approved again reserves the difference; one that lowers the value releases it', async () => {
    const current = await readBooking(booker, booking.id);
    const key = keyOf(booking, 'S');
    const change = (lines: unknown[], versionToken: string) =>
      post(booker, `/api/booking/bookings/${booking.id}/drafts`, {
        versionToken,
        supplierPartyId: fixture.supplier.id,
        seasonValueId: seasons[0],
        deliveryWindow: { from: setup.day(0), to: setup.day(30) },
        lines,
      });
    const raise = ok(
      await change(
        [line('SYN-LIFE', 12, { colour: 'SYN NAVY', size: 'S', lineKey: key }), line('SYN-LIFE', 3, { size: 'M' })],
        current.versionToken,
      ),
    );
    const before = await remaining();
    // The version in force is Issued, so the change carries the supplier's communication (POL-05.04).
    const sent = ok(
      await post(booker, `/api/booking/bookings/${booking.id}/submission`, {
        versionToken: raise.versionToken,
        communication: [await storedFile(booker)],
      }),
    );
    ok(await decide(owner, sent.requestId as string, sent.versionId as string));
    const raised = await readBooking(booker, booking.id);
    // 10 at 500.00 became 15: 2,500.00 more reserved (worked by hand). The new version is Approved, not yet issued, and
    // keeps the Agreement version in force at its approval (DEC-132).
    expect(raised).toMatchObject({
      state: 'Approved',
      status: { versionId: sent.versionId, totals: { ordered: 15, delivered: 5, outstanding: 10 } },
      approval: { versionId: sent.versionId, reserved: 15 * COST, agreementVersionId: fixture.agreementVersionId },
      terms: { kind: 'fixed', versionId: fixture.agreementVersionId },
    });
    expect(raised).not.toHaveProperty('change');
    expect(await remaining()).toBe(before - 5 * COST);
    // The receipt links follow the line's key into the new version (goods-in 3.10).
    expect(raised.status?.lines.find((each) => each.lineKey === key)?.delivered).toBe(5);
    // The new version in force is not issued yet, so a change of it carries no communication.
    const lower = ok(
      await change([line('SYN-LIFE', 6, { colour: 'SYN NAVY', size: 'S', lineKey: key })], raised.versionToken),
    );
    const lowered = ok(
      await post(booker, `/api/booking/bookings/${booking.id}/submission`, { versionToken: lower.versionToken }),
    );
    ok(await decide(owner, lowered.requestId as string, lowered.versionId as string));
    expect((await readBooking(booker, booking.id)).approval?.reserved).toBe(6 * COST);
    expect(await remaining()).toBe(before + 4 * COST);
    // An approved booking with no newer version has nothing to submit.
    const settled = await readBooking(booker, booking.id);
    expect(
      errorOf(
        await post(booker, `/api/booking/bookings/${booking.id}/submission`, { versionToken: settled.versionToken }),
      )?.code,
    ).toBe('booking.no-change');
  });
});

describe('extending the window (goods-in 3.5, 3.8)', () => {
  it('POL-05.07 an extension, approved by another person, moves the window’s end and a line’s date; an earlier date is refused', async () => {
    const booking = await approvedBooking(
      [line('SYN-LIFE', 5, { size: 'S', deliveryDate: setup.day(-2) }), line('SYN-LIFE', 5, { size: 'M' })],
      { from: setup.day(-10), to: setup.day(-1) },
    );
    expect(booking.status?.lines.map((each) => each.overdue)).toEqual([true, true]);
    const path = `/api/booking/bookings/${booking.id}/extensions`;
    expect(
      errorOf(await post(booker, path, { versionToken: booking.versionToken, windowTo: setup.day(-3), lines: [] }))
        ?.code,
    ).toBe('booking.not-an-extension');
    const proposed = ok(
      await post(booker, path, {
        versionToken: booking.versionToken,
        windowTo: setup.day(20),
        lines: [{ lineKey: keyOf(booking, 'S'), deliveryDate: setup.day(10) }],
      }),
    );
    expect(errorOf(await decide(booker, proposed.requestId as string, proposed.amendmentId as string))?.code).toMatch(
      /^access\./,
    );
    ok(await decide(owner, proposed.requestId as string, proposed.amendmentId as string));
    const extended = await readBooking(booker, booking.id);
    expect(extended.status?.deliveryWindow).toEqual({ from: setup.day(-10), to: setup.day(20) });
    expect(extended.status?.lines.map((each) => [each.deliveryDate, each.dueDate, each.overdue])).toEqual([
      [setup.day(10), setup.day(20), false],
      [null, setup.day(20), false],
    ]);
  });

  it('POL-05.07 a second cancellation, or extension, proposed while one waits is refused, naming it, so none is dropped unseen', async () => {
    const booking = await approvedBooking([line('SYN-WAIT', 5, { size: 'S' }), line('SYN-WAIT', 5, { size: 'M' })]);
    const path = `/api/booking/bookings/${booking.id}`;
    const first = ok(
      await post(booker, `${path}/cancellations`, {
        versionToken: booking.versionToken,
        scope: { kind: 'lines', lineKeys: [keyOf(booking, 'S')] },
      }),
    );
    const waiting = await readBooking(booker, booking.id);
    const second = await post(booker, `${path}/cancellations`, {
      versionToken: waiting.versionToken,
      scope: { kind: 'lines', lineKeys: [keyOf(booking, 'M')] },
    });
    expect(second.status).toBe(422);
    expect(errorOf(second)).toMatchObject({
      code: 'booking.amendment-pending',
      missing: [{ kind: 'version', recordType: BOOKING_TYPE, recordId: booking.id, versionId: first.amendmentId }],
    });
    // The first still waits for its decision, its request open (access-and-approvals 9.6).
    const still = await readBooking(booker, booking.id);
    expect(still.amendments.map((each) => [each.id, each.state, each.request?.state])).toEqual([
      [first.amendmentId, 'Awaiting approval', 'Awaiting approval'],
    ]);
    // An extension is of another kind, so it may wait beside it; a second extension may not.
    const extension = ok(
      await post(booker, `${path}/extensions`, {
        versionToken: still.versionToken,
        windowTo: setup.day(40),
        lines: [],
      }),
    );
    const another = await post(booker, `${path}/extensions`, {
      versionToken: extension.versionToken,
      windowTo: setup.day(50),
      lines: [],
    });
    expect(errorOf(another)).toMatchObject({
      code: 'booking.amendment-pending',
      missing: [{ kind: 'version', versionId: extension.amendmentId }],
    });
    // Decided, the first no longer waits, and the next cancellation is proposed.
    ok(await decide(owner, first.requestId as string, first.amendmentId as string, 'reject'));
    const after = await readBooking(booker, booking.id);
    ok(
      await post(booker, `${path}/cancellations`, {
        versionToken: after.versionToken,
        scope: { kind: 'lines', lineKeys: [keyOf(booking, 'M')] },
      }),
    );
  });
});

describe('the overdue balance (goods-in 3.8; 12 test 7)', () => {
  it('POL-05.06 RR-576 the window decides overdue: a line’s own date passing does not, the window passing does, whatever its own date', async () => {
    const running = await approvedBooking(
      [
        line('SYN-WINDOW', 3, { size: 'S', deliveryDate: setup.day(-2) }),
        line('SYN-WINDOW', 3, { size: 'M', deliveryDate: setup.day(10) }),
      ],
      { from: setup.day(-20), to: setup.day(5) },
    );
    expect(running.status?.lines.map((each) => [each.deliveryDate, each.dueDate, each.overdue])).toEqual([
      [setup.day(-2), setup.day(5), false],
      [setup.day(10), setup.day(5), false],
    ]);
    const expired = await approvedBooking(
      [
        line('SYN-WINDOW', 3, { size: 'S', deliveryDate: setup.day(-2) }),
        line('SYN-WINDOW', 3, { size: 'M', deliveryDate: setup.day(10) }),
      ],
      { from: setup.day(-20), to: setup.day(-1) },
    );
    expect(expired.status?.lines.map((each) => [each.deliveryDate, each.dueDate, each.overdue])).toEqual([
      [setup.day(-2), setup.day(-1), true],
      [setup.day(10), setup.day(-1), true],
    ]);
  });

  it('POL-05.06 PRD-BKG-009 the window passes with pieces outstanding: the balance is marked overdue and reaches Booking; nothing is cancelled', async () => {
    const booking = await approvedBooking([line('SYN-LATE', 8, { size: 'S' }), line('SYN-LATE', 2, { size: 'M' })], {
      from: setup.day(-20),
      to: setup.day(-1),
    });
    await receive(booking.id, [{ size: 'M', quantity: 2, styleCode: 'SYN-LATE', colour: null }]);
    // The overdue job, run by a worker with SYNTHETIC settings (DEC-118, DEC-119; CH-10) under its own service identity.
    await writeSyntheticServiceIdentity(database, OUTBOX_PROCESSOR_IDENTITY, [OUTBOX_AUTHORITY]);
    await writeSyntheticServiceIdentity(database, BOOKING_JOBS_IDENTITY, [
      { action: 'edit', recordType: BOOKING_TYPE },
    ]);
    const numbering = composedNumbering();
    const registry: JobRegistry = {
      events: [],
      consumers: [],
      jobKinds: bookingJobKinds({
        audit: (logger) => new Audit(logger),
        exceptions: (logger) =>
          new Exceptions({ numbering, inbox: new Inbox(), audit: new Audit(logger), types: [overdueExceptionType] }),
      }),
    };
    // The worker runs on the application's synthetic clock, as everything here does (code-house-rules 9).
    const runner = new CommandRunner({ clock, timezones: syntheticTimezone, logger: log.logger });
    const worker = new Worker({
      router,
      runner,
      helper: new IdempotencyHelper({
        runner,
        logger: log.logger,
        secretCheck: secretCheckNotImplemented,
        cipher: restrictedValueCipherNotConfigured,
      }),
      identities: jobIdentities(),
      logger: log.logger,
      registry,
      settings: syntheticWorkerSettings(registry, { fast: true }),
    });
    await worker.start();
    try {
      let exceptionId: string | undefined;
      await eventually(async () => {
        const items = myWorkSchema.parse(ok(await get(booker, '/api/inbox/my-work'))).items;
        for (const item of items.filter((each) => each.kind === 'exception')) {
          const read = exceptionViewSchema.parse(
            ok(await get(booker, `/api/exceptions/exceptions/${item.owner.recordId}`)),
          );
          if (read.links.some((link) => link.recordId === booking.id)) exceptionId = read.id;
        }
        return exceptionId !== undefined;
      }, 30_000);
      const raised = exceptionViewSchema.parse(
        ok(await get(booker, `/api/exceptions/exceptions/${exceptionId ?? ''}`)),
      );
      // One exception for the booking's balance due at the window's end: 8 pieces at 500.00 outstanding (by hand).
      expect(raised).toMatchObject({
        type: { code: 'booking.overdue-balance' },
        state: 'Unresolved',
        exposure: { kind: 'known', amount: 8 * COST },
        siteId: fixture.siteId,
        brandId: fixture.brand.id,
      });
      // Expiry cancels nothing (POL-05.06).
      const read = await readBooking(booker, booking.id);
      expect(read.state).toBe('Approved');
      expect(read.status?.lines.map((each) => [each.size, each.outstanding, each.cancelled, each.overdue])).toEqual([
        [sizeOf('S').code, 8, 0, true],
        [sizeOf('M').code, 0, 0, false],
      ]);
      // It cannot close while the balance is still overdue (PRD-EXC-002); extended, it can.
      expect(errorOf(await post(booker, `/api/exceptions/exceptions/${raised.id}/close`, {}))?.code).toMatch(
        /^exceptions\./,
      );
      const proposed = ok(
        await post(booker, `/api/booking/bookings/${booking.id}/extensions`, {
          versionToken: read.versionToken,
          windowTo: setup.day(5),
          lines: [],
        }),
      );
      ok(await decide(owner, proposed.requestId as string, proposed.amendmentId as string));
      ok(await post(booker, `/api/exceptions/exceptions/${raised.id}/close`, {}));
    } finally {
      await worker.stop();
    }
  });

  it('POL-05.06 PRD-BKG-009 the overdue job’s selection agrees with the booking status, the one rule of what is overdue', async () => {
    const expired = { from: setup.day(-20), to: setup.day(-1) };
    const outstanding = await approvedBooking([line('SYN-AGREE', 4, { size: 'S' })], expired);
    const delivered = await approvedBooking([line('SYN-AGREE', 4, { size: 'S' })], expired);
    await receive(delivered.id, [{ size: 'S', quantity: 4, styleCode: 'SYN-AGREE', colour: null }]);
    const cancelled = await approvedBooking([line('SYN-AGREE', 4, { size: 'S' })], expired);
    const cancel = ok(
      await post(booker, `/api/booking/bookings/${cancelled.id}/cancellations`, {
        versionToken: cancelled.versionToken,
        scope: { kind: 'whole' },
      }),
    );
    ok(await decide(owner, cancel.requestId as string, cancel.amendmentId as string));
    const extended = await approvedBooking([line('SYN-AGREE', 4, { size: 'S' })], expired);
    const extend = ok(
      await post(booker, `/api/booking/bookings/${extended.id}/extensions`, {
        versionToken: extended.versionToken,
        windowTo: setup.day(5),
        lines: [],
      }),
    );
    ok(await decide(owner, extend.requestId as string, extend.amendmentId as string));
    const ownDatePassed = await approvedBooking([line('SYN-AGREE', 4, { size: 'S', deliveryDate: setup.day(-3) })], {
      from: setup.day(-20),
      to: setup.day(5),
    });
    const ownDateLater = await approvedBooking(
      [line('SYN-AGREE', 4, { size: 'S', deliveryDate: setup.day(10) })],
      expired,
    );
    const mine = [outstanding, delivered, cancelled, extended, ownDatePassed, ownDateLater].map((each) => each.id);
    // What the booking status says is overdue, read through the route, none of these marked yet.
    const byStatus: string[] = [];
    for (const bookingId of mine) {
      const read = await readBooking(booker, bookingId);
      if (read.status?.lines.some((each) => each.overdue) === true) byStatus.push(bookingId);
    }
    expect(byStatus.sort()).toEqual([outstanding.id, ownDateLater.id].sort());
    // What the job's selection takes, on the same business date, as the job's service identity sees every booking.
    const selected = await api.app.get<CommandRunner>(COMMAND_RUNNER).run(
      {
        commandName: 'test.overdue-candidates',
        organisation,
        correlationId: uuidv7(),
        actor: { kind: 'actor', actorId: owner.id },
      },
      async (context) => {
        const date = await context.businessDate();
        if (date.kind !== 'set') throw new Error('no business date');
        return overdueCandidates(context, date.date, 10_000);
      },
    );
    expect(selected.filter((bookingId) => mine.includes(bookingId)).sort()).toEqual(byStatus.sort());
  });
});

describe('a re-approval on a later day takes the Agreement version then in force (goods-in 3.2, 3.5; DEC-132)', () => {
  it('DEC-132 POL-01.04 a change approved again fixes the Agreement version in force at its approval', async () => {
    const booking = await approvedBooking([line('SYN-AGR', 2, { size: 'S' })]);
    if (booking.terms.kind !== 'fixed') throw new Error('The Agreement version is not fixed');
    // A later Agreement version of the brand, from tomorrow, prepared and approved by two people (structure-and-masters
    // 5.2), then the application's clock moved to tomorrow, where it is in force.
    const agreementId = booking.terms.agreementId;
    const next = await setup.asPreparerDo((c, p) =>
      setup.parties.prepareAgreementVersion(c, p, agreementId, {
        terms: terms(),
        margins: null,
        signedAgreement: [],
        validFrom: setup.day(1),
        versionToken: fixture.agreementVersionId,
      }),
    );
    if (next.kind !== 'success' || next.answer.requestId === undefined) {
      throw new Error(`No Agreement version: ${next.kind === 'refusal' ? next.refusal.code : 'not requested'}`);
    }
    decided(await setup.decide(next.answer.requestId, next.answer.versionId));
    clock.advance(86_400);
    for (const user of [booker, owner]) await signIn(user);
    const today = await readBooking(booker, booking.id);
    expect(today.terms).toMatchObject({ kind: 'fixed', versionId: fixture.agreementVersionId });
    const saved = ok(
      await post(booker, `/api/booking/bookings/${booking.id}/drafts`, {
        versionToken: today.versionToken,
        supplierPartyId: fixture.supplier.id,
        seasonValueId: seasons[0],
        deliveryWindow: { from: setup.day(0), to: setup.day(30) },
        lines: [line('SYN-AGR', 3, { size: 'S', lineKey: keyOf(booking, 'S') })],
      }),
    );
    const sent = ok(
      await post(booker, `/api/booking/bookings/${booking.id}/submission`, { versionToken: saved.versionToken }),
    );
    ok(await decide(owner, sent.requestId as string, sent.versionId as string));
    expect((await readBooking(booker, booking.id)).terms).toMatchObject({
      kind: 'fixed',
      versionId: next.answer.versionId,
    });
  });
});
