import { randomInt } from 'node:crypto';
import { uuidv7 } from '@apparel-os/domain';
import {
  BOOKING_APPROVAL,
  bookingListSchema,
  bookingReadSchema,
  openToBuyBudgetReadSchema,
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
import { approvalDecided, approvalRequested } from '../src/modules/access/index.js';
// The access module's JobIdentities, as AccessJobIdentitiesModule provides it to the worker (RR-273).
import { jobIdentities } from '../src/modules/access/commands/job-identities.js';
import { INBOX_IDENTITY, inboxConsumers } from '../src/modules/inbox/index.js';
import { NUMBERING, type NumberingInterface } from '../src/modules/numbering/index.js';
import { syntheticWorkerSettings } from './fixtures/worker-settings.js';
import { defineSyntheticBookingSeries } from './fixtures/booking-series.js';
import { syntheticCode, syntheticName } from './fixtures/synthetic.js';
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
import { grantSynthetic, type SyntheticAuthority } from './support/grants.js';
import { capturingLogger, eventually, writeSyntheticServiceIdentity } from './support/jobs.js';
import { writeSyntheticMarking } from './support/marked-attributes.js';
import { startTestFileStore, type TestFileStore } from './support/minio.js';
import { STORE_FILE_PATH, syntheticPdfUpload } from './support/opening-app.js';
import { decided, structureSetup, type StructureSetup } from './support/organisation.js';
import { createSyntheticOrganisations, type SyntheticWorld } from './support/organisations.js';
import { databaseUrl } from './support/postgres.js';
import { receivingFixture, type ReceivingFixture } from './support/receiving.js';

// S2-F01-T03: recording and approving a booking through the whole application, on real PostgreSQL (goods-in 3.1 to
// 3.4, 10.3, 10.5, 12 test 4; PRD-BKG-001 to PRD-BKG-004, PRD-BKG-014, PRD-MER-005, PRD-MER-021; POL-05.01, POL-05.02,
// POL-01.04, POL-02.07, POL-02.09; DEC-129, DEC-130, DEC-132, DEC-136). Booking uploads the booking document, enters
// the booking with its size-colour grid and submits it; a different person, whose booking limit covers its value at
// cost, approves it, which reserves open-to-buy, fixes the brand's Agreement version and gives the number in one
// transaction; or rejects it, returning it to Draft. Policies 5 and 1 are opened through TEST-ONLY checks reporting
// labelled synthetic values, since no module reports either policy's values yet (RR-561; support/booking.ts). Every
// person, place, brand, price, budget, limit and number here is SYNTHETIC.

const BOOKING = 'booking.booking';
const BUDGET = 'booking.open_to_buy_budget';
const CHECK = 'booking.open_to_buy_check';
const PANEL: SyntheticAuthority = { recordType: 'access.approval_request', action: 'view' };
/** SYNTHETIC amounts in paise. */
const SYNTHETIC_BUDGET = 10_000_000;
const SYNTHETIC_SMALL_BUDGET = 1_000;
const SYNTHETIC_OWNER_LIMIT = 50_000_000;
const SYNTHETIC_LOW_LIMIT = 100;

/** My work is fed by the inbox's consumers, run by a worker with SYNTHETIC settings (DEC-118, DEC-119; CH-10). */
const inboxRegistry: JobRegistry = {
  events: [approvalRequested, approvalDecided],
  consumers: inboxConsumers,
  jobKinds: [],
};
const log = capturingLogger();
let worker: Worker;
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
/** Booking (P-BKG), who also holds the approval and a limit, so a refusal of their own is for their preparation. */
let booker: SyntheticUser;
/** Accounts (P-ACC): checks budgets. */
let accounts: SyntheticUser;
/** The Owner (P-OWN): approves budgets and bookings within a SYNTHETIC limit. */
let owner: SyntheticUser;
/** Another approver within the same SYNTHETIC limit, deciding at the same time as the Owner. */
let secondApprover: SyntheticUser;
/** An approver whose SYNTHETIC limit falls short of the bookings here. */
let lowApprover: SyntheticUser;
/** A reader of another brand's bookings only (access-and-approvals 5.3). */
let otherBrandReader: SyntheticUser;
let limitAdmin: SyntheticUser;
let limitApprover: SyntheticUser;
/** The SYNTHETIC season attribute's values. */
let seasons: string[];
/** A value of a list attribute that is not the season. */
let notASeason: string;
/** A SYNTHETIC brand linked to the fixture's supplier, with no Agreement. */
let brandWithoutAgreement: string;

interface Call {
  readonly status: number;
  readonly body: Record<string, unknown>;
}

/** The SYNTHETIC season value of an index, as the setup confirmed it. */
function season(index: number): string {
  const valueId = seasons[index];
  if (valueId === undefined) throw new Error(`no season ${String(index)}`);
  return valueId;
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
  const response = await fetch(`${api.baseUrl}/api/access/sign-in`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: SYNTHETIC_ORIGIN, 'x-forwarded-for': '10.9.9.73' },
    body: JSON.stringify({ organisationCode, login: user.login, password: user.password, totpCode: freshCode(user) }),
  });
  expect(response.status).toBe(200);
  cookies.set(user.id, (response.headers.get('set-cookie') ?? '').split(';')[0] ?? '');
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

/** Whether My work offers the user the approval request named, once the worker has published it (11.1, 11.2). */
async function offeredInMyWork(user: SyntheticUser, requestId: string): Promise<boolean> {
  const work = (await get(user, '/api/inbox/my-work')).body.items as
    | { kind: string; owner: { recordId: string } }[]
    | undefined;
  return (work ?? []).some((each) => each.kind === 'approval' && each.owner.recordId === requestId);
}

function ok(call: Call): Record<string, unknown> {
  expect(call.status, JSON.stringify(call.body)).toBe(200);
  return call.body;
}

let fileCount = 0;
/** A SYNTHETIC PDF stored through files-imports, as the screen stores a booking document first (S1-F06-T05). */
async function storedFile(user: SyntheticUser): Promise<{ storedFileId: string; fileReceiptId: string }> {
  fileCount += 1;
  const stored = ok(await post(user, STORE_FILE_PATH, syntheticPdfUpload('BOOKING', `DOC-${String(fileCount)}`)));
  return { storedFileId: stored.storedFileId as string, fileReceiptId: stored.receiptId as string };
}

/** One line, by style code and quantity, with colour and size where given, at SYNTHETIC prices in paise. */
function line(
  styleCode: string,
  quantity: number,
  options: { colour?: string; size?: string; cost?: number; mrp?: number; deliveryDate?: string } = {},
) {
  return {
    styleCode,
    colour: options.colour ?? null,
    size: options.size ?? null,
    quantity,
    indicativeCost: options.cost ?? 50_000,
    mrp: options.mrp ?? 99_900,
    deliveryDate: options.deliveryDate ?? null,
  };
}

/** A booking's body for the fixture's brand, supplier and Site, in the first season, with the lines given. */
function draftBody(lines: readonly ReturnType<typeof line>[], overrides: Record<string, unknown> = {}) {
  return {
    brandId: fixture.brand.id,
    destinationSiteId: fixture.siteId,
    supplierPartyId: fixture.supplier.id,
    seasonValueId: seasons[0],
    deliveryWindow: { from: setup.day(10), to: setup.day(40) },
    lines,
    ...overrides,
  };
}

async function readBooking(user: SyntheticUser, bookingId: string): Promise<Booking> {
  return bookingReadSchema.parse(ok(await get(user, `/api/booking/bookings/${bookingId}`))).booking;
}

/** Records a booking as Booking, attaches a document and submits it; answers the booking, version and request. */
async function submitted(
  lines: readonly ReturnType<typeof line>[],
  overrides: Record<string, unknown> = {},
): Promise<{ bookingId: string; versionId: string; requestId: string }> {
  const made = ok(await post(booker, '/api/booking/bookings', draftBody(lines, overrides)));
  const bookingId = made.bookingId as string;
  const attached = ok(
    await post(booker, `/api/booking/bookings/${bookingId}/documents`, { files: [await storedFile(booker)] }),
  );
  const sent = ok(
    await post(booker, `/api/booking/bookings/${bookingId}/submission`, { versionToken: attached.versionToken }),
  );
  return { bookingId, versionId: sent.versionId as string, requestId: sent.requestId as string };
}

/** A SYNTHETIC individual booking limit, prepared by the limit admin and approved by a different person (9.2). */
async function bookingLimit(user: SyntheticUser, amount: number): Promise<void> {
  const prepared = ok(
    await post(limitAdmin, '/api/access/approval-limits', {
      actionType: BOOKING_APPROVAL,
      holder: { kind: 'individual', userId: user.id, roleAssignmentId: assignments.get(user.id) },
      limit: { kind: 'amount', amount },
      coversUnknown: false,
      origin: 'synthetic',
      validFrom: setup.today(),
    }),
  );
  ok(await decide(limitApprover, prepared.requestId as string, prepared.limitId as string));
}

/** A SYNTHETIC open-to-buy budget for the fixture's brand and a season: prepared, checked and approved (3.3). */
async function approvedBudget(seasonValueId: string, amount: number, brandId = fixture.brand.id): Promise<string> {
  const prepared = ok(
    await post(booker, '/api/booking/open-to-buy-budgets', { brandId, seasonValueId, amount, origin: 'synthetic' }),
  );
  const versionId = prepared.versionId as string;
  ok(await decide(accounts, prepared.requestId as string, versionId));
  const budget = openToBuyBudgetReadSchema.parse(
    ok(await get(owner, `/api/booking/open-to-buy-budgets/${prepared.budgetId as string}`)),
  ).budget;
  const approvalId = budget.versions[0]?.request?.id;
  if (approvalId === undefined) throw new Error('The budget approval was not requested');
  ok(await decide(owner, approvalId, versionId));
  return prepared.budgetId as string;
}

/** A budget's next SYNTHETIC version, through the same three steps (3.3). */
async function raisedBudget(budgetId: string, amount: number): Promise<void> {
  const path = `/api/booking/open-to-buy-budgets/${budgetId}`;
  const before = openToBuyBudgetReadSchema.parse(ok(await get(owner, path))).budget;
  const prepared = ok(
    await post(booker, `${path}/versions`, { amount, origin: 'synthetic', versionToken: before.versionToken }),
  );
  const versionId = prepared.versionId as string;
  ok(await decide(accounts, prepared.requestId as string, versionId));
  const after = openToBuyBudgetReadSchema.parse(ok(await get(owner, path))).budget;
  const approvalId = after.versions.find((each) => each.id === versionId)?.request?.id;
  if (approvalId === undefined) throw new Error('The budget approval was not requested');
  ok(await decide(owner, approvalId, versionId));
}

beforeAll(async () => {
  world = await createSyntheticOrganisations('bookings');
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
  // My work is fed by the inbox's consumers, run by a worker with SYNTHETIC settings (DEC-118, DEC-119; CH-10).
  await writeSyntheticServiceIdentity(database, OUTBOX_PROCESSOR_IDENTITY, [OUTBOX_AUTHORITY]);
  await writeSyntheticServiceIdentity(database, INBOX_IDENTITY, [{ action: 'edit', recordType: 'inbox.work_item' }]);
  const runner = new CommandRunner({
    clock: { now: () => new Date() },
    timezones: syntheticTimezone,
    logger: log.logger,
  });
  worker = new Worker({
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
    registry: inboxRegistry,
    settings: syntheticWorkerSettings(inboxRegistry, { fast: true }),
  });
  setup = await structureSetup({
    directory: world.directory,
    database,
    organisationCode,
    keysEnvironment: keys,
    label: 'BOOKING',
  });
  // A Site, a brand with a linked supplier and an approved Agreement, and an unlinked supplier (support/receiving.ts).
  fixture = await receivingFixture(setup, database, 'BKG');
  const today = setup.today();
  const okOf = <A>(outcome: { kind: 'success'; answer: A } | { kind: 'refusal'; refusal: { code: string } }): A => {
    if (outcome.kind !== 'success') throw new Error(`Refused: ${outcome.refusal.code}`);
    return outcome.answer;
  };
  const listAttribute = async (label: string) =>
    okOf(
      await setup.asPreparerDo((c, p) =>
        setup.catalogue.prepareAttribute(c, p, {
          code: syntheticCode(`BKG-${label}-${String(randomInt(1_000_000))}`),
          valueKind: 'list',
          name: syntheticName(label),
          validFrom: today,
        }),
      ),
    ).recordId;
  const value = async (attributeId: string, label: string) => {
    const proposed = okOf(
      await setup.asPreparerDo((c, p) =>
        setup.catalogue.proposeVocabularyValue(c, p, {
          attributeId,
          code: syntheticCode(`${label}-${String(randomInt(1_000_000))}`),
          name: syntheticName(label),
        }),
      ),
    );
    decided(await setup.decide(proposed.requestId, proposed.proposalId));
    const confirmed = await setup.run(setup.preparer.id, (c) => setup.catalogue.proposal(c, proposed.proposalId));
    if (confirmed?.valueId === undefined) throw new Error(`${label} was not confirmed`);
    return confirmed.valueId;
  };
  // The season attribute, marked as the Organisation's season (structure-and-masters 4.2 "As built"; RR-550).
  const seasonAttribute = await listAttribute('SEASON');
  seasons = [];
  for (const label of ['SS1', 'AW1', 'SS2', 'AW2']) seasons.push(await value(seasonAttribute, label));
  await writeSyntheticMarking(database, 'season', seasonAttribute, setup.preparer.id);
  notASeason = await value(await listAttribute('FABRIC'), 'COTTON');
  brandWithoutAgreement = okOf(
    await setup.asPreparerDo((c, p) =>
      setup.catalogue.prepareBrand(c, p, {
        code: syntheticCode(`BKG-NOAGR-${String(randomInt(1_000_000))}`),
        name: syntheticName('Brand with no Agreement'),
        aliases: [],
        validFrom: today,
      }),
    ),
  ).recordId;
  okOf(
    await setup.asPreparerDo((c, p) =>
      setup.parties.prepareBrandSupplierLink(c, p, {
        brandId: brandWithoutAgreement,
        partyId: fixture.supplier.id,
        linked: true,
        validFrom: today,
      }),
    ),
  );

  booker = await enrolled('BKG-BOOKER', [
    { recordType: BOOKING, action: 'view' },
    { recordType: BOOKING, action: 'create' },
    { recordType: BOOKING, action: 'edit' },
    { recordType: BOOKING, action: 'approve' },
    { recordType: BUDGET, action: 'view' },
    { recordType: BUDGET, action: 'create' },
    { recordType: BUDGET, action: 'edit' },
    { recordType: 'files_imports.stored_file', action: 'create' },
    PANEL,
  ]);
  accounts = await enrolled('BKG-ACCOUNTS', [
    { recordType: BUDGET, action: 'view' },
    { recordType: CHECK, action: 'view' },
    { recordType: CHECK, action: 'approve' },
    PANEL,
  ]);
  owner = await enrolled('BKG-OWNER', [
    { recordType: BOOKING, action: 'view' },
    { recordType: BOOKING, action: 'approve' },
    { recordType: BUDGET, action: 'view' },
    { recordType: BUDGET, action: 'approve' },
    PANEL,
  ]);
  lowApprover = await enrolled('BKG-LOW', [
    { recordType: BOOKING, action: 'view' },
    { recordType: BOOKING, action: 'approve' },
    PANEL,
  ]);
  secondApprover = await enrolled('BKG-SECOND', [
    { recordType: BOOKING, action: 'view' },
    { recordType: BOOKING, action: 'approve' },
    PANEL,
  ]);
  otherBrandReader = await enrolled('BKG-OTHER-BRAND', [{ recordType: BOOKING, action: 'view' }], {
    kind: 'dimensions',
    legalEntity: { kind: 'all' },
    place: { kind: 'all' },
    brand: { kind: 'selected', members: [brandWithoutAgreement] },
  });
  limitAdmin = await enrolled('BKG-LIMIT-ADMIN', [
    { recordType: 'access.approval_limit', action: 'view' },
    { recordType: 'access.approval_limit', action: 'create' },
  ]);
  limitApprover = await enrolled('BKG-LIMIT-APPROVER', [
    { recordType: 'access.approval_limit', action: 'view' },
    { recordType: 'access.approval_limit', action: 'approve' },
    PANEL,
  ]);
  await bookingLimit(owner, SYNTHETIC_OWNER_LIMIT);
  await bookingLimit(booker, SYNTHETIC_OWNER_LIMIT);
  await bookingLimit(lowApprover, SYNTHETIC_LOW_LIMIT);
  await bookingLimit(secondApprover, SYNTHETIC_OWNER_LIMIT);
  // A consumer receives only events recorded after it is first registered, so the worker starts once the setup's own
  // approvals are decided: My work then carries only this file's bookings, with no backlog before them.
  await worker.start();
}, 300_000);

afterAll(async () => {
  await (worker as Worker | undefined)?.stop();
  await (setup as StructureSetup | undefined)?.close();
  await (router as OrganisationRouter | undefined)?.close();
  await (api as AccessTestApp | undefined)?.close();
  await (minio as TestFileStore | undefined)?.stop();
  await (world as SyntheticWorld | undefined)?.reset();
});

describe('recording a booking (goods-in 3.1, 3.2; PRD-BKG-001 to PRD-BKG-003)', () => {
  it('PRD-BKG-001 PRD-BKG-003 PRD-MER-005 DEC-130 a Draft keeps its lines as written, with totals per booking and style', async () => {
    // A size-colour grid of one style, at one cost and MRP, one line of it changed; a style at style level alone.
    const grid = ['S', 'M'].flatMap((size) =>
      ['SYNTHETIC NAVY', 'SYNTHETIC RED'].map((colour) => line('SYN-ST-1', 10, { colour, size })),
    );
    const lines = [...grid.slice(0, 3), { ...grid[3], mrp: 109_900 }, line('syn-st-2 ', 5, { cost: 30_000 })];
    const made = ok(await post(booker, '/api/booking/bookings', draftBody(lines as ReturnType<typeof line>[])));
    const booking = await readBooking(booker, made.bookingId as string);
    expect(booking).toMatchObject({
      id: made.bookingId,
      state: 'Draft',
      brandId: fixture.brand.id,
      destinationSiteId: fixture.siteId,
      versionToken: made.versionToken,
      version: {
        id: made.versionId,
        versionNumber: 1,
        supplierPartyId: fixture.supplier.id,
        season: { valueId: seasons[0] },
        deliveryWindow: { from: setup.day(10), to: setup.day(40) },
        savedBy: booker.id,
      },
      documents: [],
      openToBuy: { kind: 'not-approved' },
    });
    expect(booking).not.toHaveProperty('number');
    // As written: the style-level line keeps no colour and no size, never Free Size (PRD-MER-005).
    expect(booking.version.lines.at(-1)).toMatchObject({
      lineNumber: 5,
      styleCode: 'syn-st-2 ',
      colour: null,
      size: null,
      quantity: 5,
    });
    expect(booking.version.lines[3]).toMatchObject({ colour: 'SYNTHETIC RED', size: 'M', mrp: 109_900 });
    // 40 pieces at 500.00 and 5 at 300.00; MRP 30 at 999.00, 10 at 1,099.00 and 5 at 999.00 (worked by hand).
    expect(booking.version.totals).toEqual({ pieces: 45, cost: 2_150_000, mrp: 4_595_500 });
    expect(booking.version.styles).toEqual([
      { styleCode: 'SYN-ST-1', pieces: 40, cost: 2_000_000, mrp: 4_096_000 },
      { styleCode: 'syn-st-2', pieces: 5, cost: 150_000, mrp: 499_500 },
    ]);
    // The brand's Agreement in force today, read-only (3.2; DEC-129).
    expect(booking.terms).toMatchObject({ kind: 'in-force', versionId: fixture.agreementVersionId });
    const list = bookingListSchema.parse(
      ok(await get(booker, `/api/booking/bookings?state=Draft&brandId=${fixture.brand.id}`)),
    );
    expect(list.bookings.map((each) => each.id)).toContain(made.bookingId);
    expect(list.bookings.find((each) => each.id === made.bookingId)?.totals).toEqual(booking.version.totals);
    // A reader scoped to another brand reads nothing of it (access-and-approvals 5.3).
    const outside = await get(otherBrandReader, `/api/booking/bookings/${made.bookingId as string}`);
    expect(outside.status).toBe(403);
    const theirs = bookingListSchema.parse(ok(await get(otherBrandReader, '/api/booking/bookings')));
    expect(theirs.bookings.map((each) => each.id)).not.toContain(made.bookingId);
  });

  it('PRD-MER-021 RR-550 a supplier not linked to the brand, a season off the season list and a destination that is no Site are refused', async () => {
    const unlinked = await post(
      booker,
      '/api/booking/bookings',
      draftBody([line('SYN-ST-3', 1)], { supplierPartyId: fixture.unlinkedSupplierId }),
    );
    expect(errorOf(unlinked)).toMatchObject({
      code: 'booking.supplier-not-linked',
      missing: [
        { recordType: 'merchandise.party', recordId: fixture.unlinkedSupplierId },
        { recordType: 'merchandise.brand', recordId: fixture.brand.id },
      ],
    });
    const offSeason = await post(
      booker,
      '/api/booking/bookings',
      draftBody([line('SYN-ST-3', 1)], { seasonValueId: notASeason }),
    );
    expect(errorOf(offSeason)?.code).toBe('booking.season-not-in-vocabulary');
    const noSite = await post(
      booker,
      '/api/booking/bookings',
      draftBody([line('SYN-ST-3', 1)], { destinationSiteId: fixture.wholeStore }),
    );
    expect(errorOf(noSite)?.code).toBe('booking.site-not-in-force');
    // A quantity of zero, or a window ending before it starts, fails the route's schema.
    expect(
      errorOf(await post(booker, '/api/booking/bookings', draftBody([{ ...line('SYN-ST-3', 1), quantity: 0 }])))?.code,
    ).toBe('kernel.invalid-request');
    expect(
      errorOf(
        await post(
          booker,
          '/api/booking/bookings',
          draftBody([line('SYN-ST-3', 1)], { deliveryWindow: { from: setup.day(5), to: setup.day(4) } }),
        ),
      )?.code,
    ).toBe('kernel.invalid-request');
  });

  it('code-house-rules 12.7 a Draft is changed freely by its next version, naming the newest version token', async () => {
    const made = ok(await post(booker, '/api/booking/bookings', draftBody([line('SYN-ST-4', 2)])));
    const bookingId = made.bookingId as string;
    const change = {
      supplierPartyId: fixture.supplier.id,
      seasonValueId: seasons[1],
      deliveryWindow: { from: setup.day(1), to: setup.day(2) },
      lines: [line('SYN-ST-4', 3), line('SYN-ST-5', 1, { deliveryDate: setup.day(2) })],
    };
    const saved = ok(
      await post(booker, `/api/booking/bookings/${bookingId}/drafts`, { ...change, versionToken: made.versionToken }),
    );
    const stale = await post(booker, `/api/booking/bookings/${bookingId}/drafts`, {
      ...change,
      versionToken: made.versionToken,
    });
    expect(errorOf(stale)?.code).toBe('kernel.stale-version');
    const booking = await readBooking(booker, bookingId);
    expect(booking.versionToken).toBe(saved.versionToken);
    expect(booking.version).toMatchObject({ id: saved.versionId, versionNumber: 2, season: { valueId: seasons[1] } });
    expect(booking.version.lines.map((each) => [each.styleCode, each.quantity, each.deliveryDate])).toEqual([
      ['SYN-ST-4', 3, null],
      ['SYN-ST-5', 1, setup.day(2)],
    ]);
    expect(booking.versions.map((each) => each.versionNumber)).toEqual([1, 2]);
  });
});

describe('submitting and approving a booking (goods-in 3.3, 3.4, 10.3, 10.5; 12 test 4)', () => {
  let first: { bookingId: string; versionId: string; requestId: string };

  it('goods-in 3.1 a booking is submitted only with a document attached; the approval binds to that version', async () => {
    const made = ok(await post(booker, '/api/booking/bookings', draftBody([line('SYN-ST-6', 10, { colour: 'SYN' })])));
    const bookingId = made.bookingId as string;
    const bare = await post(booker, `/api/booking/bookings/${bookingId}/submission`, {
      versionToken: made.versionToken,
    });
    expect(errorOf(bare)).toMatchObject({ code: 'booking.no-document', missing: [{ recordId: bookingId }] });
    const document = await storedFile(booker);
    const attached = ok(await post(booker, `/api/booking/bookings/${bookingId}/documents`, { files: [document] }));
    // Attaching changed the booking, so the older token is stale (code-house-rules 12.7).
    expect(
      errorOf(await post(booker, `/api/booking/bookings/${bookingId}/submission`, { versionToken: made.versionToken }))
        ?.code,
    ).toBe('kernel.stale-version');
    const sent = ok(
      await post(booker, `/api/booking/bookings/${bookingId}/submission`, { versionToken: attached.versionToken }),
    );
    first = { bookingId, versionId: sent.versionId as string, requestId: sent.requestId as string };
    // The approval reaches the Owner in My work, whose limit covers the value; never the preparer (9.4, 11.1).
    await eventually(() => offeredInMyWork(owner, first.requestId));
    expect(await offeredInMyWork(booker, first.requestId)).toBe(false);
    expect(first.versionId).toBe(made.versionId);
    const booking = await readBooking(owner, bookingId);
    expect(booking).toMatchObject({
      state: 'Awaiting approval',
      version: { id: made.versionId, request: { id: first.requestId, state: 'Awaiting approval' } },
      documents: [{ attachmentId: (attached.attachmentIds as string[])[0], storedFileId: document.storedFileId }],
    });
    // Awaiting approval, it takes no change (goods-in 3.4).
    expect(
      errorOf(
        await post(booker, `/api/booking/bookings/${bookingId}/drafts`, {
          versionToken: booking.versionToken,
          supplierPartyId: fixture.supplier.id,
          seasonValueId: seasons[0],
          deliveryWindow: { from: setup.day(1), to: setup.day(2) },
          lines: [],
        }),
      )?.code,
    ).toBe('booking.not-draft');
  });

  it('POL-02.07 PRD-SEC-017 the preparer may not approve; nobody approves while policies 5 and 1 are not Signed and validated', async () => {
    expect(errorOf(await decide(booker, first.requestId, first.versionId))?.code).toBe('access.self-preparation');
    const closed = await decide(owner, first.requestId, first.versionId);
    expect(errorOf(closed)?.code).toBe('configuration.operation-unavailable');
    expect(errorOf(closed)?.missing).toEqual(
      expect.arrayContaining([
        { kind: 'capability', capability: 'booking.bookings' },
        { kind: 'policy', policy: '5', lacks: 'signature' },
        { kind: 'policy', policy: '1', lacks: 'signature' },
      ]),
    );
    // Nothing of the decision was written: the booking still awaits it.
    expect((await readBooking(owner, first.bookingId)).state).toBe('Awaiting approval');
    await bookingGateOpen(setup, database);
  });

  it('PRD-BKG-004 PRD-SEC-017 POL-02.09 approval is refused with no budget, beyond the remaining budget, or beyond the approver’s limit', async () => {
    // No approved budget for the brand and season (3.3).
    expect(errorOf(await decide(owner, first.requestId, first.versionId))).toMatchObject({
      code: 'booking.open-to-buy-missing',
      missing: [{ kind: 'open-to-buy', brandId: fixture.brand.id, seasonValueId: seasons[0] }],
    });
    // A budget smaller than the booking's value at cost: 10 pieces at 500.00 is 5,000.00 against 10.00; the shortfall
    // is shown.
    const budgetId = await approvedBudget(season(0), SYNTHETIC_SMALL_BUDGET);
    expect(errorOf(await decide(owner, first.requestId, first.versionId))).toMatchObject({
      code: 'booking.open-to-buy-short',
      missing: [{ kind: 'open-to-buy-shortfall', value: '500000', remaining: '1000', shortfall: '499000' }],
    });
    // A limit below the booking's value at cost (POL-02.09): the approver is refused before any effect.
    expect(errorOf(await decide(lowApprover, first.requestId, first.versionId))?.code).toBe(
      'access.above-approval-limit',
    );
    expect((await readBooking(owner, first.bookingId)).openToBuy).toMatchObject({
      kind: 'approved',
      approved: SYNTHETIC_SMALL_BUDGET,
      reserved: 0,
    });
    // The budget raised by its next version, checked and approved (3.3).
    await raisedBudget(budgetId, SYNTHETIC_BUDGET);
  });

  it('goods-in 3.1 RR-449 approval is refused while no booking series is set up', async () => {
    expect(errorOf(await decide(owner, first.requestId, first.versionId))).toMatchObject({
      code: 'booking.no-booking-series',
      missing: [{ kind: 'number-series', numberedKind: 'booking.booking' }],
    });
    await api.app.get<CommandRunner>(COMMAND_RUNNER).run(
      {
        commandName: 'test.define-booking-series',
        organisation,
        correlationId: uuidv7(),
        actor: { kind: 'actor', actorId: owner.id },
      },
      (context) => defineSyntheticBookingSeries(context, api.app.get<NumberingInterface>(NUMBERING)),
    );
  });

  it('POL-05.02 DEC-132 PRD-BKG-004 approval reserves open-to-buy, fixes the Agreement version and gives the number, at once', async () => {
    const approved = await decide(owner, first.requestId, first.versionId);
    expect(approved.status, JSON.stringify(approved.body)).toBe(200);
    const booking = await readBooking(booker, first.bookingId);
    expect(booking).toMatchObject({
      state: 'Approved',
      number: expect.stringMatching(/^SYN-BKG-\d{5}$/) as string,
      version: { id: first.versionId, request: { id: first.requestId, state: 'Approved' } },
      // The Agreement version in force at the approval, kept by the booking (POL-01.04; DEC-132).
      terms: { kind: 'fixed', versionId: fixture.agreementVersionId },
      approval: {
        versionId: first.versionId,
        agreementVersionId: fixture.agreementVersionId,
        reserved: 500_000,
        approvedBy: owner.id,
      },
      openToBuy: {
        kind: 'approved',
        approved: SYNTHETIC_BUDGET,
        reserved: 500_000,
        remaining: SYNTHETIC_BUDGET - 500_000,
      },
    });
    // Decided once: the request takes no second decision (PRD-ACS-007), and an approved booking no Draft change.
    expect(errorOf(await decide(owner, first.requestId, first.versionId))?.code).toBe('access.approval-not-open');
    expect(
      errorOf(
        await post(booker, `/api/booking/bookings/${first.bookingId}/documents`, { files: [await storedFile(booker)] }),
      )?.code,
    ).toBe('booking.not-draft');
    const list = bookingListSchema.parse(ok(await get(owner, '/api/booking/bookings?state=Approved')));
    expect(list.bookings.find((each) => each.id === first.bookingId)).toMatchObject({
      number: booking.number,
      state: 'Approved',
    });
  });

  it('POL-05.02 a later booking is refused the open-to-buy an approved one reserved', async () => {
    // 300 pieces at 500.00 is 1,50,000.00 against the 95,000.00 left of the 1,00,000.00 budget once 5,000.00 is
    // reserved: short by 55,000.00, within the Owner's limit.
    const later = await submitted([line('SYN-ST-7', 300)]);
    expect(errorOf(await decide(owner, later.requestId, later.versionId))).toMatchObject({
      code: 'booking.open-to-buy-short',
      missing: [{ value: '15000000', remaining: '9500000', shortfall: '5500000' }],
    });
  });

  it('PRD-INT-003 goods-in 10.3 two approvals at once never reserve the same remaining open-to-buy', async () => {
    // Each 100 pieces at 500.00, 50,000.00, fits the 95,000.00 left alone; together they do not.
    const one = await submitted([line('SYN-ST-10', 100)]);
    const other = await submitted([line('SYN-ST-11', 100)]);
    const answers = await Promise.all([
      decide(owner, one.requestId, one.versionId),
      decide(secondApprover, other.requestId, other.versionId),
    ]);
    expect(answers.map((each) => each.status).sort()).toEqual([200, 422]);
    expect(answers.map((each) => errorOf(each)?.code).filter((code) => code !== undefined)).toEqual([
      'booking.open-to-buy-short',
    ]);
    const states = [
      (await readBooking(booker, one.bookingId)).state,
      (await readBooking(booker, other.bookingId)).state,
    ].sort();
    expect(states).toEqual(['Approved', 'Awaiting approval']);
    expect((await readBooking(booker, one.bookingId)).openToBuy).toMatchObject({ reserved: 5_500_000 });
  });

  it('PRD-INT-002 recording a booking twice under one key records one booking', async () => {
    const key = uuidv7();
    const body = draftBody([line('SYN-ST-12', 1)]);
    const recorded = ok(await post(booker, '/api/booking/bookings', body, key));
    expect(ok(await post(booker, '/api/booking/bookings', body, key))).toEqual(recorded);
  });

  it('DEC-129 goods-in 3.2 a brand with no Agreement in force has no booking approved; the refusal names the brand', async () => {
    await approvedBudget(season(0), SYNTHETIC_BUDGET, brandWithoutAgreement);
    const sent = await submitted([line('SYN-ST-8', 1)], { brandId: brandWithoutAgreement });
    expect((await readBooking(booker, sent.bookingId)).terms).toEqual({ kind: 'none' });
    expect(errorOf(await decide(owner, sent.requestId, sent.versionId))).toMatchObject({
      code: 'booking.no-agreement-in-force',
      missing: [{ recordType: 'merchandise.brand', recordId: brandWithoutAgreement }],
    });
  });

  it('goods-in 3.4 POL-02.07 a rejection returns the booking to Draft; its preparer still cannot approve the next version', async () => {
    const sent = await submitted([line('SYN-ST-9', 4)]);
    const rejected = await decide(owner, sent.requestId, sent.versionId, 'reject');
    expect(rejected.status, JSON.stringify(rejected.body)).toBe(200);
    const returned = await readBooking(booker, sent.bookingId);
    expect(returned).toMatchObject({
      state: 'Draft',
      version: { id: sent.versionId, request: { state: 'Rejected' } },
      openToBuy: { reserved: 5_500_000 },
    });
    expect(returned).not.toHaveProperty('number');
    // Changed and sent again, the new version has a request of its own.
    const saved = ok(
      await post(booker, `/api/booking/bookings/${sent.bookingId}/drafts`, {
        versionToken: returned.versionToken,
        supplierPartyId: fixture.supplier.id,
        seasonValueId: seasons[0],
        deliveryWindow: { from: setup.day(1), to: setup.day(30) },
        lines: [line('SYN-ST-9', 3)],
      }),
    );
    const again = ok(
      await post(booker, `/api/booking/bookings/${sent.bookingId}/submission`, { versionToken: saved.versionToken }),
    );
    expect(again.requestId).not.toBe(sent.requestId);
    expect(errorOf(await decide(booker, again.requestId as string, again.versionId as string))?.code).toBe(
      'access.self-preparation',
    );
    ok(await decide(owner, again.requestId as string, again.versionId as string));
    const approved = await readBooking(booker, sent.bookingId);
    expect(approved).toMatchObject({ state: 'Approved', approval: { reserved: 150_000 } });
    expect(approved.versions.map((each) => each.request?.state)).toEqual(['Rejected', 'Approved']);
  });
});
