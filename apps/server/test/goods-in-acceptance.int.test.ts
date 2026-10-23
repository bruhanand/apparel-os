import { uuidv7 } from '@apparel-os/domain';
import {
  arrivalReadSchema,
  bookingReadSchema,
  openToBuyBudgetReadSchema,
  ptPreviewSchema,
  scanInReadSchema,
  stockSearchSchema,
  trialBalanceSchema,
} from '@apparel-os/schemas';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { NUMBERING, type NumberingInterface } from '../src/modules/numbering/index.js';
import { defineSyntheticBookingSeries } from './fixtures/booking-series.js';
import { syntheticCode, syntheticName } from './fixtures/synthetic.js';
import { syntheticPtFileName, syntheticPtWorkbook } from './fixtures/pt.js';
import { codeFor, writeSyntheticReason } from './support/access.js';
import { bookingGateOpen, bookingLimitApproved, syntheticPolicyValues } from './support/booking.js';
import { asUserIn, RECEIVER_REPORTER_AUTHORITY } from './support/damage.js';
import { STORE_FILE_PATH, syntheticPdfUpload } from './support/opening-app.js';
import { approved } from './support/organisation.js';
import { ptApprovalWorld, type Person, type PtApprovalWorld } from './support/pt-approval.js';
import { STOCK_VIEW } from './support/receiving.js';

// S2-F07-T02: the first version's acceptance through the whole application on real PostgreSQL (goods-in 12 test 19;
// roadmap 2.2 "duplicates"; PRD-INT-002; code-house-rules 12.4). The whole flow of goods-in, as people make it through
// the routes: an open-to-buy budget prepared, checked and approved; a booking recorded, its document attached,
// submitted and approved; the goods received against it, their invoice recorded, counted and the GRN issued; the PT
// file handed in, checked, submitted and published for the GRN, and approved by a different person; and both pieces
// scanned in to the Store's floor. Every write is sent twice under its own idempotency key, as a client that lost the
// first answer would send it again: the second answer must be the first, and every record, quantity and amount below
// must be what one sending of each makes, worked out by hand. Every person, place, brand, style, price, budget, limit
// and number is SYNTHETIC.

let w: PtApprovalWorld;
/** Booking (P-BKG): prepares the budget and records the booking. */
let booker: Person;
/** Accounts (P-ACC): checks the budget. */
let accounts: Person;
/** The Owner (P-OWN): approves the budget and the booking, within a SYNTHETIC limit. */
let owner: Person;
/** Warehouse (P-WHS): receives against the booking, counts and issues the GRN. */
let receiver: Person;
/** A Store's staff (P-STM): scans the pieces in. */
let scanner: Person;
/** Reads stock search with the cost field class. */
let searcher: Person;
let approveReason: string;
let season: string;
let floor: string;

const BOOKING_TYPE = 'booking.booking';
const BUDGET = 'booking.open_to_buy_budget';
const PANEL = { recordType: 'access.approval_request', action: 'view' as const };
/** SYNTHETIC amounts in paise: a budget of ₹50,00,000.00, a booking limit of ₹50,00,000.00, ₹500.00 a piece at cost. */
const SYNTHETIC_BUDGET = 500_000_000;
const SYNTHETIC_LIMIT = 500_000_000;
const COST = 50_000;

beforeAll(async () => {
  w = await ptApprovalWorld('ACC', { extraChecks: [syntheticPolicyValues(5)] });
  const { setup } = w;
  // Policy 5 opened on its TEST-ONLY value; policy 1 the PT gate opened already (goods-in 10.5; RR-561).
  await bookingGateOpen(setup, w.database, [5]);
  await asUserIn(w.api.app, w.organisation, setup.preparer.id, (context) =>
    defineSyntheticBookingSeries(context, w.api.app.get<NumberingInterface>(NUMBERING)),
  );
  season = w.lists.season.values.SPRING?.id ?? '';
  approveReason = await writeSyntheticReason(w.database, 'approve');
  booker = await w.enrol('ACC-BOOKER', [
    { recordType: BOOKING_TYPE, action: 'view' },
    { recordType: BOOKING_TYPE, action: 'create' },
    { recordType: BOOKING_TYPE, action: 'edit' },
    { recordType: BUDGET, action: 'view' },
    { recordType: BUDGET, action: 'create' },
    { recordType: 'files_imports.stored_file', action: 'create' },
    PANEL,
  ]);
  accounts = await w.enrol('ACC-ACCOUNTS', [
    { recordType: BUDGET, action: 'view' },
    { recordType: 'booking.open_to_buy_check', action: 'view' },
    { recordType: 'booking.open_to_buy_check', action: 'approve' },
    { recordType: 'access.approval_reason', action: 'view' },
    PANEL,
  ]);
  owner = await w.enrol('ACC-OWNER', [
    { recordType: BOOKING_TYPE, action: 'view' },
    { recordType: BOOKING_TYPE, action: 'approve' },
    { recordType: BUDGET, action: 'view' },
    { recordType: BUDGET, action: 'approve' },
    { recordType: 'access.approval_reason', action: 'view' },
    PANEL,
  ]);
  await bookingLimitApproved(
    setup,
    w.database,
    { userId: owner.user.id, roleAssignmentId: owner.assignmentId },
    SYNTHETIC_LIMIT,
  );
  receiver = await w.enrol('ACC-RECEIVER', [
    ...RECEIVER_REPORTER_AUTHORITY,
    { recordType: BOOKING_TYPE, action: 'view' },
  ]);
  scanner = await w.enrol('ACC-SCANNER', [
    ...RECEIVER_REPORTER_AUTHORITY,
    { recordType: 'receiving.scan', action: 'create' },
  ]);
  searcher = await w.enrol('ACC-SEARCHER', STOCK_VIEW, { fieldClasses: ['cost'] });
  floor = (
    await approved(setup, (c, p) =>
      setup.organisation.prepareLocation(c, p, {
        code: syntheticCode('ACC-FLOOR'),
        siteId: w.fixture.siteId,
        businessUnitId: w.fixture.wholeStore,
        name: syntheticName('Acceptance shop floor'),
        kind: 'floor',
        validFrom: setup.today(),
      }),
    )
  ).recordId;
}, 900_000);

afterAll(async () => {
  await (w as PtApprovalWorld | undefined)?.close();
});

/**
 * Sends a write twice under one idempotency key, as a client that lost the first answer sends it again: the second
 * answer is the first, status and body (PRD-INT-002; code-house-rules 12.4 "Replay"). Answers the first answer's body.
 */
async function twice(person: Person, path: string, body: unknown): Promise<Record<string, unknown>> {
  const key = uuidv7();
  const first = await w.post(person, path, body, key);
  expect(first.status, `${path}: ${JSON.stringify(first.body)}`).toBe(200);
  expect(await w.post(person, path, body, key), `${path} sent again under its key`).toEqual(first);
  return first.body;
}

/** A decision approving the request at the version given, with the reason and a fresh code, sent twice. */
function approvedTwice(person: Person, requestId: string, versionId: string): Promise<Record<string, unknown>> {
  w.clock.advance(30);
  return twice(person, `/api/access/approval-requests/${requestId}/decision`, {
    versionId,
    outcome: 'approve',
    reason: { kind: 'listed', reasonId: approveReason },
    totpCode: codeFor(person.user.factorSecret ?? Buffer.alloc(0), 0, w.clock.now()),
  });
}

async function read<A>(person: Person, path: string, schema: { parse(value: unknown): A }): Promise<A> {
  const call = await w.get(person, path);
  expect(call.status, `${path}: ${JSON.stringify(call.body)}`).toBe(200);
  return schema.parse(call.body);
}

/** The stock value debited in the world's book, as Accounts reads its trial balance (books-and-posting 12, 16.1). */
async function stockValueDebited(): Promise<number> {
  const balance = await read(
    w.people.accountsReader,
    `/api/finance/books/${w.fixture.bookId}/trial-balance?periodId=${w.periodId}`,
    trialBalanceSchema,
  );
  return balance.rows.find((row) => row.accountId === w.accounts.INV)?.debitPaise ?? 0;
}

describe('every write of the first version sent twice (goods-in 12 test 19; roadmap 2.2)', () => {
  it('PRD-INT-002 goods-in 12 test 19 the flow from budget to scan-in, every write sent twice under its key, answers each first answer again and records each once', async () => {
    const { setup } = w;
    const style = syntheticCode('ACC-STYLE');
    const brandId = w.owned.brandId;
    const size = w.code.size(0);

    // The budget: prepared by Booking, checked by Accounts, approved by the Owner (goods-in 3.3; POL-05.09).
    const budget = await twice(booker, '/api/booking/open-to-buy-budgets', {
      brandId,
      seasonValueId: season,
      amount: SYNTHETIC_BUDGET,
      origin: 'synthetic',
    });
    const budgetId = budget.budgetId as string;
    await approvedTwice(accounts, budget.requestId as string, budget.versionId as string);
    const checked = await read(owner, `/api/booking/open-to-buy-budgets/${budgetId}`, openToBuyBudgetReadSchema);
    const budgetApproval = checked.budget.versions[0]?.request?.id ?? '';
    await approvedTwice(owner, budgetApproval, budget.versionId as string);

    // The booking: two pieces of one style and size at ₹500.00, its document attached, submitted and approved by the
    // Owner (goods-in 3.1 to 3.4).
    const made = await twice(booker, '/api/booking/bookings', {
      brandId,
      destinationSiteId: w.fixture.siteId,
      supplierPartyId: w.owned.supplierId,
      seasonValueId: season,
      deliveryWindow: { from: setup.day(-1), to: setup.day(20) },
      lines: [
        {
          styleCode: style,
          colour: 'SYNTHETIC NAVY',
          size,
          quantity: 2,
          indicativeCost: COST,
          mrp: 199_900,
          deliveryDate: null,
        },
      ],
    });
    const bookingId = made.bookingId as string;
    const document = await twice(booker, STORE_FILE_PATH, syntheticPdfUpload('BOOKING', 'ACC-BOOKING'));
    const attached = await twice(booker, `/api/booking/bookings/${bookingId}/documents`, {
      files: [{ storedFileId: document.storedFileId, fileReceiptId: document.receiptId }],
      versionToken: made.versionToken,
    });
    const submitted = await twice(booker, `/api/booking/bookings/${bookingId}/submission`, {
      versionToken: attached.versionToken,
    });
    await approvedTwice(owner, submitted.requestId as string, submitted.versionId as string);

    // The Arrival against the booking, its invoice, the count and the GRN (goods-in 4.2 to 4.5, 4.10).
    const arrival = await twice(receiver, '/api/receiving/arrivals', {
      businessUnitId: w.fixture.wholeStore,
      receivingLocationId: w.fixture.storeLocation,
      supplierPartyId: w.owned.supplierId,
      brandId,
      bookingId,
      transporter: syntheticName('Transporter'),
      lorryReceipt: { number: 'SYN-LR-ACC', date: setup.today() },
      cartons: 1,
      arrivedAt: new Date(w.clock.now().getTime() - 3_600_000).toISOString(),
    });
    const arrivalId = arrival.arrivalId as string;
    const invoiceFile = await twice(receiver, STORE_FILE_PATH, syntheticPdfUpload('INVOICE', 'ACC-INVOICE'));
    await twice(receiver, `/api/receiving/arrivals/${arrivalId}/invoices`, {
      number: 'SYN-INV-ACC',
      date: setup.today(),
      file: { storedFileId: invoiceFile.storedFileId, fileReceiptId: invoiceFile.receiptId },
    });
    await twice(receiver, `/api/receiving/arrivals/${arrivalId}/count-lines`, {
      goods: 'on-invoice',
      styleCode: style,
      colour: 'SYNTHETIC NAVY',
      sizeValueId: w.fixture.sizes.values[0]?.id ?? null,
      skuId: null,
      description: null,
      invoiceQuantity: 2,
      countedQuantity: 2,
      extra: null,
      damage: null,
      batch: null,
    });
    const counted = await read(receiver, `/api/receiving/arrivals/${arrivalId}`, arrivalReadSchema);
    const issued = await twice(receiver, `/api/receiving/arrivals/${arrivalId}/grn`, {
      versionToken: counted.arrival.versionToken,
    });
    const grnId = issued.grnId as string;

    // The PT file for the GRN, two pieces at MRP 1,999.00 and P RATE 945.00, handed in, checked, submitted and
    // published (goods-in 5), then approved by a different person (goods-in 6.3).
    const rows = [w.ptRow(style, 0, {}, w.owned.code), w.ptRow(style, 0, {}, w.owned.code)];
    const bytes = await syntheticPtWorkbook({ rows, marker: 'ACC-PT' });
    const handed = await twice(w.people.ptMaker, '/api/files-imports/import-files', {
      sourceSystem: 'manual-upload',
      originalName: syntheticPtFileName('acc-pt'),
      contentBase64: bytes.toString('base64'),
    });
    const started = await twice(w.people.ptMaker, '/api/files-imports/batches', {
      storedFileId: handed.storedFileId,
      fileReceiptId: handed.receiptId,
      kind: 'transaction',
      target: 'merchandise.pt',
      layoutVersionId: w.lists.layoutVersionId,
      mappingVersionId: w.lists.mappingVersionId,
      subject: { recordId: grnId },
    });
    const batchId = started.batchId as string;
    await twice(w.people.ptMaker, `/api/files-imports/batches/${batchId}/validate`, {});
    const preview = await read(w.people.ptMaker, `/api/merchandise/pt/uploads/${batchId}/preview`, ptPreviewSchema);
    expect(preview.issues.filter((issue) => issue.severity === 'Blocking')).toEqual([]);
    await twice(w.people.ptMaker, `/api/files-imports/batches/${batchId}/submit`, {
      versionId: preview.batchVersionId,
    });
    await twice(w.people.ptMaker, `/api/files-imports/batches/${batchId}/publish`, {
      versionId: preview.batchVersionId,
    });
    const [revision] = (await w.grnPt(grnId)).pt?.revisions ?? [];
    if (revision?.request === undefined) throw new Error('The PT revision has no approval request');
    const debitedBefore = await stockValueDebited();
    await approvedTwice(w.people.ptApprover, revision.request.id, revision.revisionId);

    // Both pieces scanned in to the Store's floor (goods-in 7).
    for (const row of rows) {
      const scanned = await twice(scanner, `/api/receiving/grns/${grnId}/scans`, {
        barcode: String(row.BARCODE),
        destinationLocationId: floor,
      });
      expect(scanned).toMatchObject({ outcome: 'accepted', reason: null });
    }

    // What one sending of each makes, worked out by hand. The budget: approved once, ₹1,000.00 reserved by the booking
    // (2 × ₹500.00), never twice.
    const inForce = await read(owner, `/api/booking/open-to-buy-budgets/${budgetId}`, openToBuyBudgetReadSchema);
    expect(inForce.budget.versions).toHaveLength(1);
    expect(inForce.budget.remaining).toMatchObject({
      kind: 'approved',
      approved: SYNTHETIC_BUDGET,
      reserved: 100_000,
      remaining: SYNTHETIC_BUDGET - 100_000,
    });
    // The booking: one version, its two pieces delivered once by the GRN's one link, nothing outstanding.
    const booking = (await read(booker, `/api/booking/bookings/${bookingId}`, bookingReadSchema)).booking;
    expect(booking.number).toMatch(/^SYN-BKG-\d{5}$/);
    expect(booking.status?.lines).toEqual([
      expect.objectContaining({ ordered: 2, delivered: 2, cancelled: 0, outstanding: 0, overDelivered: 0 }),
    ]);
    // The Arrival: one invoice, one line, one GRN of two pieces.
    const received = (await read(receiver, `/api/receiving/arrivals/${arrivalId}`, arrivalReadSchema)).arrival;
    expect(received.invoices).toHaveLength(1);
    expect(received.lines).toHaveLength(1);
    expect(received.grn?.id).toBe(grnId);
    expect(received.grn?.lines).toHaveLength(1);
    // The PT: one revision, Official, its value posted once: 2 × ₹945.00 = ₹1,890.00 into stock value.
    const pt = await w.grnPt(grnId);
    expect(pt.pt?.revisions).toHaveLength(1);
    expect(pt.pt?.revisions[0]?.state).toBe('Official');
    expect((await stockValueDebited()) - debitedBefore).toBe(189_000);
    // The scan-in: two scans, both pieces accepted, complete.
    const scanIn = await read(scanner, `/api/receiving/grns/${grnId}/scan-in`, scanInReadSchema);
    expect(scanIn.state).toBe('complete');
    expect(scanIn.scans).toHaveLength(2);
    expect(scanIn.products).toEqual([expect.objectContaining({ covered: 2, accepted: 2, waiting: 0, held: 0 })]);
    // Stock search: two pieces on the floor, both available to sell, ₹1,890.00 at cost; none left where received.
    const found = await read(
      searcher,
      `/api/reports/stock-search?${new URLSearchParams({ text: style }).toString()}`,
      stockSearchSchema,
    );
    expect(
      found.positions.map(({ locationId, availableAs, physical, available, waiting, held, cost }) => ({
        locationId,
        availableAs,
        physical,
        available,
        waiting,
        held,
        cost,
      })),
    ).toEqual([
      {
        locationId: floor,
        availableAs: 'sell',
        physical: 2,
        available: 2,
        waiting: 0,
        held: 0,
        cost: { kind: 'known', value: 189_000 },
      },
    ]);
  }, 600_000);
});
