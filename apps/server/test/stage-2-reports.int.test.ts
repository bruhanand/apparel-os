import {
  accessHistoryPageSchema,
  arrivalReadSchema,
  bookingReadSchema,
  bookingStatusReportSchema,
  ptReversalProposedSchema,
  receiptProblemsReportSchema,
  reportExportSchema,
  stockReportSchema,
  supplierPerformanceReportSchema,
  type Arrival,
  type Booking,
  type BookingStatusReport,
  type ReceiptProblemsReport,
  type StockReport,
  type StockReportRow,
  type SupplierPerformanceReport,
} from '@apparel-os/schemas';
import ExcelJS from 'exceljs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { NUMBERING, type NumberingInterface } from '../src/modules/numbering/index.js';
import { defineSyntheticBookingSeries } from './fixtures/booking-series.js';
import { syntheticCode, syntheticName } from './fixtures/synthetic.js';
import { bookingGateOpen, bookingLimitApproved, syntheticPolicyValues } from './support/booking.js';
import { asUserIn, RECEIVER_REPORTER_AUTHORITY } from './support/damage.js';
import { STORE_FILE_PATH, syntheticPdfUpload } from './support/opening-app.js';
import { ptApprovalWorld, type Call, type Person, type PtApprovalWorld } from './support/pt-approval.js';
import { approved } from './support/organisation.js';
import { allowVerifier } from './support/postgres.js';
import { STOCK_VIEW } from './support/receiving.js';

// S2-F11-T02: the stage 2 reports through the whole application on real PostgreSQL (goods-in 9.1, 9.3, 9.5, 12 test
// 20; PRD-BKG-005, PRD-BKG-011, PRD-PRO-001, PRD-EXC-009 to PRD-EXC-011, PRD-MOD-015). The data set is made through the
// routes as people make it, and every figure below is worked out by hand from it. Every person, place, brand, style,
// price, budget, limit, date and number is SYNTHETIC.
//
// THE SYNTHETIC DATA SET. T is the test's business date. Supplier S supplies brand B (its goods the brand's until
// sold) and brand O (its goods the Organisation's from the supplier's dispatch). Every booking is of the season SPRING
// at the world's Site, each line at an indicative cost of 500.00:
//
//   K1  B  window T-3 to T-1  P1 size 0 × 10, P1 size 1 × 10
//   K2  B  window T-1 to T+20 P2 size 0 × 5, P2 size 1 × 5; the size 1 balance of 5 cancelled
//   K3  B  window T-9 to T-2  P3 size 0 × 4
//   K4  O  window T-1 to T+10 P4 size 0 × 3
//
// and the GRNs, each at the Store's receiving location:
//
//   G1  against K1, arrived T-1: P1 size 0 invoiced 8, counted 8, 1 damaged (confirmed); P1 size 1 invoiced 12,
//       counted 10 (short 2). Both link at issue: within the window.
//   G2  against K2, arrived T: P2 size 0, 3. Links at issue.
//   G3  against K3, arrived T-1, after the window: P3 size 0, 4, late; proposed into K3 and approved.
//   G4  against K4, arrived T-1: P4 size 0, 3. Links at issue. Its PT approved at MRP 1,999.00 and P RATE 945.00 a
//       piece; one piece scanned in to the Store's floor.
//   G5  no booking, brand B, arrived T: P5 size 0 invoiced 2, counted 3, the extra piece received and held, taken in.

let w: PtApprovalWorld;
/** Booking (P-BKG): records bookings and budgets, proposes late goods. */
let booker: Person;
/** Accounts (P-ACC): checks budgets. */
let accounts: Person;
/** The Owner (P-OWN): approves budgets, bookings, cancellations and late goods, within a SYNTHETIC limit. */
let owner: Person;
/** Warehouse (P-WHS), who receives against bookings and reports damage at the count. */
let receiver: Person;
/** Reads every report, over every place and brand, with the cost field class. */
let reader: Person;

let season: string;
/** The Store's floor, where one piece of G4 is scanned in. */
let floor: string;
let style: { readonly P1: string; readonly P2: string; readonly P3: string; readonly P4: string; readonly P5: string };
let K1: Booking;
let K2: Booking;
let K3: Booking;
let K4: Booking;
let G1: { readonly grnId: string; readonly arrival: Arrival };
let G2: { readonly grnId: string; readonly arrival: Arrival };
let G3: { readonly grnId: string; readonly arrival: Arrival };
let G4: { readonly grnId: string; readonly arrival: Arrival };
let G5: { readonly grnId: string; readonly arrival: Arrival };

const BOOKING_TYPE = 'booking.booking';
const BUDGET = 'booking.open_to_buy_budget';
const PANEL = { recordType: 'access.approval_request', action: 'view' as const };
/** SYNTHETIC amounts in paise. */
const SYNTHETIC_BUDGET = 500_000_000;
const SYNTHETIC_LIMIT = 500_000_000;
const COST = 50_000;
const DAY = 86_400_000;

const errorOf = (call: Call) => (call.body as { error?: { code: string } }).error;

function ok(call: Call): Record<string, unknown> {
  expect(call.status, JSON.stringify(call.body)).toBe(200);
  return call.body;
}

/** The code of the world's size at 0 or 1. */
const sizeCode = (at: 0 | 1) => w.code.size(at);

async function readBooking(bookingId: string): Promise<Booking> {
  return bookingReadSchema.parse(ok(await w.get(booker, `/api/booking/bookings/${bookingId}`))).booking;
}

let documents = 0;

/** A booking recorded, documented and submitted by Booking and approved by the Owner (goods-in 3.1 to 3.4). */
async function approvedBooking(
  brandId: string,
  window: { from: string; to: string },
  lines: readonly { styleCode: string; sizeAt: 0 | 1; quantity: number }[],
): Promise<Booking> {
  const made = ok(
    await w.post(booker, '/api/booking/bookings', {
      brandId,
      destinationSiteId: w.fixture.siteId,
      supplierPartyId: w.fixture.supplier.id,
      seasonValueId: season,
      deliveryWindow: window,
      lines: lines.map((line) => ({
        styleCode: line.styleCode,
        colour: 'SYNTHETIC NAVY',
        size: sizeCode(line.sizeAt),
        quantity: line.quantity,
        indicativeCost: COST,
        mrp: 99_900,
        deliveryDate: null,
      })),
    }),
  );
  const bookingId = made.bookingId as string;
  documents += 1;
  const stored = ok(await w.post(booker, STORE_FILE_PATH, syntheticPdfUpload('BOOKING', `RPT-${String(documents)}`)));
  const attached = ok(
    await w.post(booker, `/api/booking/bookings/${bookingId}/documents`, {
      files: [{ storedFileId: stored.storedFileId, fileReceiptId: stored.receiptId }],
      versionToken: made.versionToken,
    }),
  );
  const sent = ok(
    await w.post(booker, `/api/booking/bookings/${bookingId}/submission`, { versionToken: attached.versionToken }),
  );
  ok(await w.decide(owner, sent.requestId as string, sent.versionId as string));
  return readBooking(bookingId);
}

/** A GRN of the lines given, against the booking named or none, arrived `daysAgo` days before now. */
async function received(
  bookingId: string | undefined,
  lines: Parameters<PtApprovalWorld['issuedGrn']>[0],
  daysAgo: number,
  brand: 'fixture' | 'owned' = 'fixture',
) {
  const now = w.clock.now().getTime();
  const { grnId, arrivalId } = await w.issuedGrn(lines, {
    brand,
    by: receiver,
    ...(bookingId === undefined ? {} : { bookingId }),
    // A minute before now on the day asked, so the arrival never falls on another business date than the one meant.
    arrivedAt: new Date(now - daysAgo * DAY - 60_000),
  });
  const arrival = arrivalReadSchema.parse(ok(await w.get(receiver, `/api/receiving/arrivals/${arrivalId}`))).arrival;
  return { grnId, arrival };
}

beforeAll(async () => {
  w = await ptApprovalWorld('RPT', { extraChecks: [syntheticPolicyValues(5)] });
  await allowVerifier(w.database);
  const { setup } = w;
  // Policy 5 opened on its TEST-ONLY value; policy 1 the PT gate opened already (goods-in 10.5; RR-561).
  await bookingGateOpen(setup, w.database, [5]);
  await asUserIn(w.api.app, w.organisation, setup.preparer.id, (context) =>
    defineSyntheticBookingSeries(context, w.api.app.get<NumberingInterface>(NUMBERING)),
  );
  season = w.lists.season.values.SPRING?.id ?? '';
  style = {
    P1: syntheticCode('RPT-P1'),
    P2: syntheticCode('RPT-P2'),
    P3: syntheticCode('RPT-P3'),
    P4: syntheticCode('RPT-P4'),
    P5: syntheticCode('RPT-P5'),
  };

  booker = await w.enrol('RPT-BOOKER', [
    { recordType: BOOKING_TYPE, action: 'view' },
    { recordType: BOOKING_TYPE, action: 'create' },
    { recordType: BOOKING_TYPE, action: 'edit' },
    { recordType: BUDGET, action: 'view' },
    { recordType: BUDGET, action: 'create' },
    { recordType: 'files_imports.stored_file', action: 'create' },
    { recordType: 'receiving.arrival', action: 'view' },
    { recordType: 'receiving.grn', action: 'view' },
    PANEL,
  ]);
  accounts = await w.enrol('RPT-ACCOUNTS', [
    { recordType: BUDGET, action: 'view' },
    { recordType: 'booking.open_to_buy_check', action: 'view' },
    { recordType: 'booking.open_to_buy_check', action: 'approve' },
    PANEL,
  ]);
  owner = await w.enrol('RPT-OWNER', [
    { recordType: BOOKING_TYPE, action: 'view' },
    { recordType: BOOKING_TYPE, action: 'approve' },
    { recordType: BUDGET, action: 'view' },
    { recordType: BUDGET, action: 'approve' },
    { recordType: 'access.approval_reason', action: 'view' },
    PANEL,
  ]);
  receiver = await w.enrol('RPT-RECEIVER', [
    ...RECEIVER_REPORTER_AUTHORITY,
    { recordType: BOOKING_TYPE, action: 'view' },
  ]);
  const REPORTS: Parameters<PtApprovalWorld['enrol']>[1] = [
    { recordType: BOOKING_TYPE, action: 'view' },
    { recordType: 'receiving.arrival', action: 'view' },
    { recordType: 'stock.damage_report', action: 'view' },
    ...STOCK_VIEW,
  ];
  reader = await w.enrol('RPT-READER', REPORTS, { fieldClasses: ['cost'] });
  await bookingLimitApproved(
    setup,
    w.database,
    { userId: owner.user.id, roleAssignmentId: owner.assignmentId },
    SYNTHETIC_LIMIT,
  );
  // A SYNTHETIC budget for each brand and the season: prepared, checked and approved by three people (goods-in 3.3).
  for (const brandId of [w.fixture.brand.id, w.owned.brandId]) {
    const prepared = ok(
      await w.post(booker, '/api/booking/open-to-buy-budgets', {
        brandId,
        seasonValueId: season,
        amount: SYNTHETIC_BUDGET,
        origin: 'synthetic',
      }),
    );
    ok(await w.decide(accounts, prepared.requestId as string, prepared.versionId as string));
    const budget = ok(await w.get(owner, `/api/booking/open-to-buy-budgets/${prepared.budgetId as string}`)) as {
      budget: { versions: { request?: { id: string } }[] };
    };
    const approvalId = budget.budget.versions[0]?.request?.id;
    if (approvalId === undefined) throw new Error('The budget approval was not requested');
    ok(await w.decide(owner, approvalId, prepared.versionId as string));
  }

  // The bookings.
  K1 = await approvedBooking(w.fixture.brand.id, { from: setup.day(-3), to: setup.day(-1) }, [
    { styleCode: style.P1, sizeAt: 0, quantity: 10 },
    { styleCode: style.P1, sizeAt: 1, quantity: 10 },
  ]);
  K2 = await approvedBooking(w.fixture.brand.id, { from: setup.day(-1), to: setup.day(20) }, [
    { styleCode: style.P2, sizeAt: 0, quantity: 5 },
    { styleCode: style.P2, sizeAt: 1, quantity: 5 },
  ]);
  K3 = await approvedBooking(w.fixture.brand.id, { from: setup.day(-9), to: setup.day(-2) }, [
    { styleCode: style.P3, sizeAt: 0, quantity: 4 },
  ]);
  K4 = await approvedBooking(w.owned.brandId, { from: setup.day(-1), to: setup.day(10) }, [
    { styleCode: style.P4, sizeAt: 0, quantity: 3 },
  ]);
  // K2's size 1 balance cancelled, approved by the Owner (goods-in 3.5, 3.10).
  const sizeOneKey = K2.status?.lines.find((line) => line.size === sizeCode(1))?.lineKey ?? '';
  const proposed = ok(
    await w.post(booker, `/api/booking/bookings/${K2.id}/cancellations`, {
      versionToken: K2.versionToken,
      scope: { kind: 'lines', lineKeys: [sizeOneKey] },
    }),
  );
  ok(await w.decide(owner, proposed.requestId as string, proposed.amendmentId as string));

  // The GRNs.
  G1 = await received(
    K1.id,
    [
      { style: style.P1, sizeAt: 0, counted: 8, damaged: 1 },
      { style: style.P1, sizeAt: 1, counted: 10, invoice: 12 },
    ],
    1,
  );
  const damaged = G1.arrival.grn?.lines.find((line) => line.damage !== null)?.damage?.damageReportId ?? '';
  const report = ok(await w.get(w.people.operations, `/api/stock/damage-reports/${damaged}`)).report as {
    versionToken: string;
    rounds: { requestId: string }[];
  };
  ok(await w.decide(w.people.operations, report.rounds[0]?.requestId ?? '', report.versionToken));
  G2 = await received(K2.id, [{ style: style.P2, sizeAt: 0, counted: 3 }], 0);
  G3 = await received(K3.id, [{ style: style.P3, sizeAt: 0, counted: 4 }], 1);
  const late = G3.arrival.grn?.bookingLinks[0];
  expect(late?.atIssue).toMatchObject({ outcome: 'review', reason: 'late' });
  const proposal = ok(
    await w.post(booker, `/api/receiving/grns/${G3.grnId}/booking-links`, {
      bookingId: K3.id,
      lines: [{ grnLineId: late?.grnLineId, lineKey: K3.status?.lines[0]?.lineKey }],
    }),
  ).proposal as { proposalId: string; requestId: string };
  ok(await w.decide(owner, proposal.requestId, proposal.proposalId));
  G4 = await received(K4.id, [{ style: style.P4, sizeAt: 0, counted: 3 }], 1, 'owned');
  // G4's PT: three pieces at MRP 1,999.00 and P RATE 945.00 (the world's good row), approved by a different person.
  const rows = [0, 1, 2].map(() => w.ptRow(style.P4, 0, {}, w.owned.code));
  const { revisionId, requestId } = await w.submittedPt(G4.grnId, rows);
  ok(await w.decide(w.people.ptApprover, requestId, revisionId));
  floor = (
    await approved(setup, (c, p) =>
      setup.organisation.prepareLocation(c, p, {
        code: syntheticCode('RPT-FLOOR'),
        siteId: w.fixture.siteId,
        businessUnitId: w.fixture.wholeStore,
        name: syntheticName('Reports shop floor'),
        kind: 'floor',
        validFrom: setup.today(),
      }),
    )
  ).recordId;
  const scanner = await w.enrol('RPT-SCANNER', [
    ...RECEIVER_REPORTER_AUTHORITY,
    { recordType: 'receiving.scan', action: 'create' },
  ]);
  const scanned = ok(
    await w.post(scanner, `/api/receiving/grns/${G4.grnId}/scans`, {
      barcode: String(rows[0]?.BARCODE),
      destinationLocationId: floor,
    }),
  );
  expect(scanned).toMatchObject({ outcome: 'accepted' });
  G5 = await received(undefined, [{ style: style.P5, sizeAt: 0, counted: 3, invoice: 2, extra: 'received' }], 0);
  const held = G5.arrival.grn?.lines[0]?.heldLine;
  ok(await w.decide(w.people.bookingApprover, held?.requestId ?? '', held?.versionToken ?? ''));
}, 900_000);

afterAll(async () => {
  await (w as PtApprovalWorld | undefined)?.close();
});

async function bookingStatus(person: Person, query: Record<string, string> = {}): Promise<BookingStatusReport> {
  const read = await w.get(person, `/api/reports/booking-status?${new URLSearchParams(query).toString()}`);
  return bookingStatusReportSchema.parse(ok(read));
}

describe('the booking status report (goods-in 3.6, 3.10, 9.3)', () => {
  it('PRD-BKG-005 each booking and line shows ordered, delivered, cancelled, outstanding and overdue, worked by hand', async () => {
    const report = await bookingStatus(reader, { supplierPartyId: w.fixture.supplier.id });
    // Newest first: K4, K3, K2, K1.
    expect(report.bookings.map((each) => each.bookingId)).toEqual([K4.id, K3.id, K2.id, K1.id]);
    const of = (booking: Booking) => report.bookings.find((each) => each.bookingId === booking.id);
    const quantities = (booking: Booking) =>
      of(booking)?.status.lines.map((line) => ({
        size: line.size,
        ordered: line.ordered,
        delivered: line.delivered,
        cancelled: line.cancelled,
        outstanding: line.outstanding,
        overdue: line.overdue,
      }));
    expect(quantities(K1)).toEqual([
      { size: sizeCode(0), ordered: 10, delivered: 8, cancelled: 0, outstanding: 2, overdue: true },
      { size: sizeCode(1), ordered: 10, delivered: 10, cancelled: 0, outstanding: 0, overdue: false },
    ]);
    expect(of(K1)?.status.totals).toEqual({
      ordered: 20,
      delivered: 18,
      cancelled: 0,
      outstanding: 2,
      overDelivered: 0,
    });
    expect(quantities(K2)).toEqual([
      { size: sizeCode(0), ordered: 5, delivered: 3, cancelled: 0, outstanding: 2, overdue: false },
      { size: sizeCode(1), ordered: 5, delivered: 0, cancelled: 5, outstanding: 0, overdue: false },
    ]);
    expect(quantities(K3)).toEqual([
      { size: sizeCode(0), ordered: 4, delivered: 4, cancelled: 0, outstanding: 0, overdue: false },
    ]);
    expect(quantities(K4)).toEqual([
      { size: sizeCode(0), ordered: 3, delivered: 3, cancelled: 0, outstanding: 0, overdue: false },
    ]);
    // Each booking's header, by its version in force, and its number.
    expect(of(K1)).toMatchObject({
      number: K1.number,
      state: 'Approved',
      brandId: w.fixture.brand.id,
      seasonValueId: season,
      supplierPartyId: w.fixture.supplier.id,
      destinationSiteId: w.fixture.siteId,
    });
    // The drill-down: each delivered piece to the GRN line it came from, the GRN named with its Arrival.
    expect(of(K1)?.deliveries.map((each) => ({ grnId: each.grnId, quantity: each.quantity }))).toEqual([
      { grnId: G1.grnId, quantity: 8 },
      { grnId: G1.grnId, quantity: 10 },
    ]);
    expect(of(K2)?.deliveries.map((each) => ({ grnId: each.grnId, quantity: each.quantity }))).toEqual([
      { grnId: G2.grnId, quantity: 3 },
    ]);
    expect(report.names.grns).toContainEqual({
      grnId: G1.grnId,
      number: G1.arrival.grn?.number,
      arrivalId: G1.arrival.id,
      siteId: w.fixture.siteId,
    });
    // Its names: the Site, brand, supplier and season shown.
    expect(report.names.suppliers.map((each) => each.id)).toEqual([w.fixture.supplier.id]);
    expect(report.names.seasons.map((each) => each.id)).toEqual([season]);
    expect(report.names.brands.map((each) => each.id).sort()).toEqual([w.fixture.brand.id, w.owned.brandId].sort());
    expect(report.next).toBeNull();
  });

  it('PRD-BKG-005 the report filters by brand, season, supplier, destination and state, and pages by a cursor', async () => {
    const owned = await bookingStatus(reader, { brandId: w.owned.brandId });
    expect(owned.bookings.map((each) => each.bookingId)).toEqual([K4.id]);
    const first = await bookingStatus(reader, { supplierPartyId: w.fixture.supplier.id, limit: '3' });
    expect(first.bookings.map((each) => each.bookingId)).toEqual([K4.id, K3.id, K2.id]);
    expect(first.next).toBe(K2.id);
    const second = await bookingStatus(reader, {
      supplierPartyId: w.fixture.supplier.id,
      limit: '3',
      after: first.next ?? '',
    });
    expect(second.bookings.map((each) => each.bookingId)).toEqual([K1.id]);
    expect((await bookingStatus(reader, { state: 'Issued' })).bookings).toEqual([]);
    expect((await bookingStatus(reader, { destinationSiteId: w.unmapped.siteId })).bookings).toEqual([]);
    expect((await bookingStatus(reader, { seasonValueId: season, brandId: w.fixture.brand.id })).bookings).toHaveLength(
      3,
    );
  });
});

async function receiptProblems(person: Person, query: Record<string, string> = {}): Promise<ReceiptProblemsReport> {
  const read = await w.get(person, `/api/reports/receipt-problems?${new URLSearchParams(query).toString()}`);
  return receiptProblemsReportSchema.parse(ok(read));
}

describe('the receipt problems report (goods-in 4.4, 4.9, 9.3)', () => {
  it('PRD-REC-006 each GRN line with a finding shows it, with each decision and who made it', async () => {
    const report = await receiptProblems(reader, { supplierPartyId: w.fixture.supplier.id });
    // Newest first: G5's excess, then G1's shortage and damage; G2, G3 and G4 are clean.
    expect(report.rows.map((each) => each.grnId)).toEqual([G5.grnId, G1.grnId, G1.grnId]);
    const lineOf = (grnId: string, styleCode: string, size: string) =>
      report.rows.find((each) => each.grnId === grnId && each.line.styleCode === styleCode && each.line.size === size);
    const excess = lineOf(G5.grnId, style.P5, sizeCode(0));
    const short = lineOf(G1.grnId, style.P1, sizeCode(1));
    const damaged = lineOf(G1.grnId, style.P1, sizeCode(0));
    expect(excess).toMatchObject({
      grnNumber: G5.arrival.grn?.number,
      arrivalId: G5.arrival.id,
      siteId: w.fixture.siteId,
      supplierPartyId: w.fixture.supplier.id,
      brandId: w.fixture.brand.id,
      line: {
        invoiceQuantity: 2,
        countedQuantity: 3,
        extra: 'received',
        findings: { shortage: 0, extra: 1, received: 3, damaged: 0 },
        heldLine: {
          kind: 'excess',
          quantity: 1,
          state: 'Accepted',
          decision: { outcome: 'taken-in', decidedBy: w.people.bookingApprover.user.id },
        },
      },
      damageReport: null,
    });
    expect(short?.line.findings).toEqual({ shortage: 2, extra: 0, received: 10, damaged: 0 });
    expect(short?.damageReport).toBeNull();
    expect(damaged?.line.findings).toEqual({ shortage: 0, extra: 0, received: 8, damaged: 1 });
    expect(damaged?.damageReport).toMatchObject({
      kind: 'shown',
      state: 'Confirmed',
      decision: { outcome: 'Confirmed', decidedBy: w.people.operations.user.id },
    });
    // Who decided, by name (a person the reader cannot name would be Unknown).
    expect(report.names.people.map((each) => each.userId).sort()).toEqual(
      [w.people.bookingApprover.user.id, w.people.operations.user.id].sort(),
    );
    expect(report.next).toBeNull();
  });

  it('PRD-MOD-015 a reader who may not see the damage reports sees each decision Unknown, never none', async () => {
    const noDamage = await w.enrol('RPT-NO-DAMAGE', [{ recordType: 'receiving.arrival', action: 'view' }]);
    const report = await receiptProblems(noDamage, { supplierPartyId: w.fixture.supplier.id });
    expect(report.rows.find((each) => each.line.damage !== null)?.damageReport).toEqual({ kind: 'unknown' });
  });

  it('PRD-REC-006 the report filters by Site, supplier, brand and dates, and pages by a cursor', async () => {
    expect((await receiptProblems(reader, { brandId: w.owned.brandId })).rows).toEqual([]);
    expect((await receiptProblems(reader, { siteId: w.unmapped.siteId })).rows).toEqual([]);
    const today = w.setup.today();
    const yesterday = w.setup.day(-1);
    // G1 was issued today, though its goods arrived yesterday: the GRN's date is its issue's.
    expect((await receiptProblems(reader, { from: today, to: today, brandId: w.fixture.brand.id })).rows).toHaveLength(
      3,
    );
    expect((await receiptProblems(reader, { to: yesterday })).rows).toEqual([]);
    const all = await receiptProblems(reader, { brandId: w.fixture.brand.id });
    const first = await receiptProblems(reader, { brandId: w.fixture.brand.id, limit: '2' });
    expect(first.rows).toHaveLength(2);
    const second = await receiptProblems(reader, { brandId: w.fixture.brand.id, limit: '2', after: first.next ?? '' });
    expect([...first.rows, ...second.rows].map((each) => each.line.id)).toEqual(all.rows.map((each) => each.line.id));
    expect(second.next).toBeNull();
  });
});

async function supplierReport(person: Person, query: Record<string, string> = {}): Promise<SupplierPerformanceReport> {
  const read = await w.get(person, `/api/reports/supplier-performance?${new URLSearchParams(query).toString()}`);
  return supplierPerformanceReportSchema.parse(ok(read));
}

describe('the supplier fill rate and timeliness report (goods-in 9.3, 9.5)', () => {
  it('PRD-BKG-011 fill rate, on-time delivery and damage rate per supplier, brand and season equal the figures worked by hand', async () => {
    const report = await supplierReport(reader, { supplierPartyId: w.fixture.supplier.id });
    expect(report.businessDate).toBe(w.setup.today());
    const row = (brandId: string, seasonValueId: string | null) =>
      report.rows.find(
        (each) =>
          each.brandId === brandId &&
          (seasonValueId === null
            ? each.season.kind === 'unknown'
            : each.season.kind === 'value' && each.season.seasonValueId === seasonValueId),
      );
    // B, SPRING. Fill over K1 (window ended T-1) and K3 (window ended T-2): (18 + 4) / (20 + 4) = 22/24; K2's window is
    // open with 2 outstanding, so it is not counted. On time: K1's 18 arrived T-1, by its window's end T-1; K2's 3 on
    // T, within its window; K3's 4 arrived T-1, after its window's end T-2, late: 21/25. Damage: G1, G2 and G3 counted
    // 8 + 10 + 3 + 4 = 25, one confirmed damaged at the count: 1/25.
    expect(row(w.fixture.brand.id, season)).toEqual({
      supplierPartyId: w.fixture.supplier.id,
      brandId: w.fixture.brand.id,
      season: { kind: 'value', seasonValueId: season },
      fill: { bookings: 2, ordered: 24, delivered: 22, rate: { kind: 'measured', numerator: 22, denominator: 24 } },
      timeliness: {
        delivered: 25,
        onTime: 21,
        late: 4,
        unknown: 0,
        rate: { kind: 'measured', numerator: 21, denominator: 25 },
      },
      damage: { counted: 25, damaged: 1, rate: { kind: 'measured', numerator: 1, denominator: 25 } },
    });
    // O, SPRING. K4 closed, 3 of 3; all 3 arrived T-1, within the window; G4 counted 3, none damaged.
    expect(row(w.owned.brandId, season)).toEqual({
      supplierPartyId: w.fixture.supplier.id,
      brandId: w.owned.brandId,
      season: { kind: 'value', seasonValueId: season },
      fill: { bookings: 1, ordered: 3, delivered: 3, rate: { kind: 'measured', numerator: 3, denominator: 3 } },
      timeliness: {
        delivered: 3,
        onTime: 3,
        late: 0,
        unknown: 0,
        rate: { kind: 'measured', numerator: 3, denominator: 3 },
      },
      damage: { counted: 3, damaged: 0, rate: { kind: 'measured', numerator: 0, denominator: 3 } },
    });
    // B, season Unknown: G5 delivered to no booking. Nothing to fill or time: Unknown, never zero (PRD-MOD-015).
    expect(row(w.fixture.brand.id, null)).toEqual({
      supplierPartyId: w.fixture.supplier.id,
      brandId: w.fixture.brand.id,
      season: { kind: 'unknown' },
      fill: { bookings: 0, ordered: 0, delivered: 0, rate: { kind: 'unknown' } },
      timeliness: { delivered: 0, onTime: 0, late: 0, unknown: 0, rate: { kind: 'unknown' } },
      damage: { counted: 3, damaged: 0, rate: { kind: 'measured', numerator: 0, denominator: 3 } },
    });
    expect(report.rows).toHaveLength(3);
  });

  it('PRD-BKG-011 the report filters by supplier, brand and season', async () => {
    const owned = await supplierReport(reader, { brandId: w.owned.brandId });
    expect(owned.rows.map((each) => each.brandId)).toEqual([w.owned.brandId]);
    const spring = await supplierReport(reader, { seasonValueId: season, brandId: w.fixture.brand.id });
    expect(spring.rows.map((each) => each.season)).toEqual([{ kind: 'value', seasonValueId: season }]);
    expect(spring.rows[0]?.damage.counted).toBe(25);
    expect((await supplierReport(reader, { supplierPartyId: w.fixture.unlinkedSupplierId })).rows).toEqual([]);
  });
});

async function stockOf(person: Person, query: Record<string, string> = {}): Promise<StockReport> {
  const read = await w.get(person, `/api/reports/stock?${new URLSearchParams(query).toString()}`);
  return stockReportSchema.parse(ok(read));
}

/** The quantities and values of a row: physical, available, waiting, held by kind, MRP value and cost. */
const figures = (row: StockReportRow | undefined) =>
  row === undefined
    ? undefined
    : {
        physical: row.physical,
        available: row.available,
        waiting: row.waiting,
        held: row.held,
        heldByKind: row.heldByKind,
        mrpValue: row.mrpValue,
        cost: row.cost,
      };

describe('the stock report (goods-in 9.2, 9.3, 9.5)', () => {
  it('PRD-PRO-001 stock by product, size, location, condition and owner, with MRP and cost values, worked by hand', async () => {
    const report = await stockOf(reader, { brandId: w.owned.brandId });
    // G4's three pieces, the Organisation's from the supplier's dispatch: two waiting at the receiving location, one on
    // the floor, available to sell. MRP 1,999.00 and P RATE 945.00 a piece: 3,998.00 and 1,890.00 for two, 1,999.00 and
    // 945.00 for one.
    expect(report.rows).toHaveLength(2);
    const at = (locationId: string) => report.rows.find((each) => each.locationId === locationId);
    expect(figures(at(w.fixture.storeLocation))).toEqual({
      physical: 2,
      available: 0,
      waiting: 2,
      held: 0,
      heldByKind: [],
      mrpValue: { kind: 'known', value: 399_800 },
      cost: { kind: 'known', value: 189_000 },
    });
    expect(figures(at(floor))).toEqual({
      physical: 1,
      available: 1,
      waiting: 0,
      held: 0,
      heldByKind: [],
      mrpValue: { kind: 'known', value: 199_900 },
      cost: { kind: 'known', value: 94_500 },
    });
    expect(at(floor)).toMatchObject({
      product: { kind: 'product', styleCode: style.P4, size: sizeCode(0) },
      condition: 'good',
      owner: { kind: 'organisation', legalEntityId: w.fixture.legalEntityId },
      availableAs: 'sell',
      grnIds: [G4.grnId],
    });
    expect(report.names.legalEntities.map((each) => each.id)).toEqual([w.fixture.legalEntityId]);
    expect(report.names.grns.map((each) => each.grnId)).toEqual([G4.grnId]);
  });

  it('PRD-MOD-015 PRD-DMG-006 goods before their PT have Unknown MRP and cost, by condition and the brand that owns them', async () => {
    const report = await stockOf(reader, { brandId: w.fixture.brand.id, locationId: w.fixture.storeLocation });
    const of = (styleCode: string, size: string, condition: string) =>
      report.rows.find(
        (each) =>
          each.product.kind === 'counted' &&
          each.product.styleCode === styleCode &&
          each.product.size === size &&
          each.condition === condition,
      );
    // G1's P1 size 0: 8 counted, the one damaged confirmed, so damaged and quarantined where it is (goods-in 8.3).
    expect(figures(of(style.P1, sizeCode(0), 'good'))).toEqual({
      physical: 7,
      available: 0,
      waiting: 7,
      held: 0,
      heldByKind: [],
      mrpValue: { kind: 'unknown' },
      cost: { kind: 'unknown' },
    });
    expect(figures(of(style.P1, sizeCode(0), 'damaged'))).toEqual({
      physical: 1,
      available: 0,
      waiting: 0,
      held: 1,
      heldByKind: [{ kind: 'quarantine', quantity: 1 }],
      mrpValue: { kind: 'unknown' },
      cost: { kind: 'unknown' },
    });
    expect(figures(of(style.P1, sizeCode(1), 'good'))).toMatchObject({ physical: 10, waiting: 10 });
    // G5's excess piece taken in stays under its excess hold until the PT route (goods-in 4.9).
    expect(figures(of(style.P5, sizeCode(0), 'good'))).toMatchObject({
      physical: 3,
      waiting: 2,
      held: 1,
      heldByKind: [{ kind: 'excess', quantity: 1 }],
    });
    expect(of(style.P1, sizeCode(0), 'good')?.owner).toEqual({ kind: 'brand', brandId: w.fixture.brand.id });
    expect(of(style.P1, sizeCode(0), 'good')?.grnIds).toEqual([G1.grnId]);
    expect((await stockOf(reader, { brandId: w.fixture.brand.id, condition: 'damaged' })).rows).toHaveLength(1);
  });

  it('PRD-ACS-008 cost is masked without the cost field class; MRP needs none', async () => {
    const noCost = await w.enrol('RPT-NO-COST', STOCK_VIEW);
    const report = await stockOf(noCost, { brandId: w.owned.brandId, locationId: floor });
    expect(figures(report.rows[0])).toMatchObject({
      mrpValue: { kind: 'known', value: 199_900 },
      cost: { kind: 'masked' },
    });
  });

  it('PRD-STK-001 the report pages by a cursor, and refuses a cursor it did not give', async () => {
    const first = await stockOf(reader, { brandId: w.fixture.brand.id, limit: '2' });
    expect(first.rows).toHaveLength(2);
    const second = await stockOf(reader, { brandId: w.fixture.brand.id, limit: '2', after: first.next ?? '' });
    expect(second.rows.map((each) => each.rowKey)).not.toContain(first.rows[0]?.rowKey);
    const refused = await w.get(reader, '/api/reports/stock?after=bm90LWEtY3Vyc29y');
    expect(refused.status).toBe(400);
    expect(errorOf(refused)?.code).toBe('kernel.invalid-request');
  });
});

describe('who sees the reports (goods-in 9.1, 12 test 20)', () => {
  it('PRD-EXC-011 PRD-ACS-005 a reader scoped to one brand sees only its bookings, receipts, suppliers and stock', async () => {
    const scoped = await w.enrol(
      'RPT-BRAND-O',
      [
        { recordType: BOOKING_TYPE, action: 'view' },
        { recordType: 'receiving.arrival', action: 'view' },
        { recordType: 'stock.damage_report', action: 'view' },
        ...STOCK_VIEW,
      ],
      {
        scope: {
          kind: 'dimensions',
          legalEntity: { kind: 'all' },
          place: { kind: 'all' },
          brand: { kind: 'selected', members: [w.owned.brandId] },
        },
      },
    );
    expect((await bookingStatus(scoped)).bookings.map((each) => each.bookingId)).toEqual([K4.id]);
    expect((await receiptProblems(scoped)).rows).toEqual([]);
    expect((await supplierReport(scoped)).rows.map((each) => each.brandId)).toEqual([w.owned.brandId]);
    const stock = await stockOf(scoped);
    expect(stock.rows.length).toBeGreaterThan(0);
    expect(stock.rows.every((each) => each.brandId === w.owned.brandId)).toBe(true);
  });

  it('PRD-EXC-011 a reader with no grant of view on bookings or Arrivals is refused those reports', async () => {
    const stockOnly = await w.enrol('RPT-STOCK-ONLY', STOCK_VIEW);
    for (const path of ['booking-status', 'receipt-problems', 'supplier-performance']) {
      const refused = await w.get(stockOnly, `/api/reports/${path}`);
      expect(refused.status, path).toBe(403);
      expect(errorOf(refused)?.code).toBe('access.not-authorised');
    }
    // The supplier report reads GRNs too: a reader of bookings alone is refused it.
    const bookingsOnly = await w.enrol('RPT-BOOKINGS-ONLY', [{ recordType: BOOKING_TYPE, action: 'view' }]);
    const refused = await w.get(bookingsOnly, '/api/reports/supplier-performance');
    expect(refused.status).toBe(403);
    expect(errorOf(refused)?.code).toBe('access.not-authorised');
  });
});

/** The rows of the first sheet of an exported file, as text. */
async function sheetOf(base64: string): Promise<string[][]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(Buffer.from(base64, 'base64') as unknown as ArrayBuffer);
  const rows: string[][] = [];
  workbook.worksheets[0]?.eachRow((row) => {
    rows.push(
      (row.values as (string | number | undefined)[])
        .slice(1)
        .map((value) => (value === undefined ? '' : String(value))),
    );
  });
  return rows;
}

describe('the exports (goods-in 9.1)', () => {
  it('PRD-EXC-010 each report exports to XLSX as shown, Unknown written as the word', async () => {
    const booking = reportExportSchema.parse(
      ok(await w.get(reader, `/api/reports/booking-status/export?brandId=${w.owned.brandId}`)),
    );
    expect(booking.fileName).toMatch(/^booking-status-\d{4}-\d{2}-\d{2}\.xlsx$/);
    const bookingRows = await sheetOf(booking.contentBase64);
    expect(bookingRows[0]).toEqual(['Booking status']);
    const bookingHeader = bookingRows[2] ?? [];
    const k4 = (name: string) => bookingRows[3]?.[bookingHeader.indexOf(name)];
    expect([k4('Booking'), k4('Style code'), k4('Ordered'), k4('Delivered'), k4('Outstanding')]).toEqual([
      K4.number,
      style.P4,
      '3',
      '3',
      '0',
    ]);
    expect(k4('Delivered by GRN')).toBe(G4.arrival.grn?.number);

    const problems = reportExportSchema.parse(
      ok(await w.get(reader, `/api/reports/receipt-problems/export?brandId=${w.fixture.brand.id}`)),
    );
    const problemRows = await sheetOf(problems.contentBase64);
    // The title, the time read, the header and the three lines.
    expect(problemRows).toHaveLength(6);
    const problemHeader = problemRows[2] ?? [];
    const excess = (name: string) => problemRows[3]?.[problemHeader.indexOf(name)];
    expect([excess('GRN'), excess('Extra'), excess('Held as'), excess('Decision')]).toEqual([
      G5.arrival.grn?.number,
      '1',
      'Excess',
      'Accepted',
    ]);

    const supplier = reportExportSchema.parse(
      ok(await w.get(reader, `/api/reports/supplier-performance/export?brandId=${w.fixture.brand.id}`)),
    );
    const supplierRows = await sheetOf(supplier.contentBase64);
    const supplierHeader = supplierRows[3] ?? [];
    const unknownSeason = supplierRows.slice(4).find((each) => each[supplierHeader.indexOf('Season')] === 'Unknown');
    expect(unknownSeason?.[supplierHeader.indexOf('Fill rate')]).toBe('Unknown');
    expect(unknownSeason?.[supplierHeader.indexOf('Damage rate')]).toBe('0');
  });

  it('PRD-SEC-007 the stock report’s export with cost writes the sensitive-access record', async () => {
    const auditor = await w.enrol('RPT-AUDITOR', [{ recordType: 'audit.sensitive_access_record', action: 'view' }]);
    const exported = await w.post(reader, '/api/reports/stock/export', { brandId: w.owned.brandId });
    const file = reportExportSchema.parse(ok(exported));
    expect(file.fileName).toMatch(/^stock-report-\d{4}-\d{2}-\d{2}\.xlsx$/);
    const rows = await sheetOf(file.contentBase64);
    const header = rows[2] ?? [];
    expect(header).toContain('Cost (₹)');
    const floorRow = rows.slice(3).find((each) => each[header.indexOf('Available')] === '1');
    expect(floorRow?.[header.indexOf('MRP value (₹)')]).toBe('1999.00');
    expect(floorRow?.[header.indexOf('Cost (₹)')]).toBe('945.00');
    expect(floorRow?.[header.indexOf('Counted on GRN')]).toBe(G4.arrival.grn?.number);
    const history = accessHistoryPageSchema.parse(
      ok(await w.get(auditor, '/api/access/history/sensitive-access-records')),
    );
    const records = history.entries.filter(
      (each) => each.user?.id === reader.user.id && each.record?.recordType === 'reports.stock_report_export',
    );
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ kind: 'sensitive-access', fieldClass: 'cost', exposure: 'exported' });
  });
});

describe('the stock report after a PT reversal (goods-in 6.4, 9.5)', () => {
  it('PRD-MOD-015 DEC-137 the MRP and cost of goods whose PT was reversed are Unknown again, never the reversed PT’s', async () => {
    // Run last: a GRN of brand O of its own, one piece, its PT approved, then reversed before the scan-in.
    const P6 = syntheticCode('RPT-P6');
    const { grnId } = await w.issuedGrn([{ style: P6, sizeAt: 0, counted: 1 }], { brand: 'owned', by: receiver });
    const { revisionId, requestId } = await w.submittedPt(grnId, [w.ptRow(P6, 0, {}, w.owned.code)]);
    ok(await w.decide(w.people.ptApprover, requestId, revisionId));
    const rowOf = async () =>
      (await stockOf(reader, { brandId: w.owned.brandId, locationId: w.fixture.storeLocation })).rows.find(
        (each) => each.product.kind === 'product' && each.product.styleCode === P6,
      );
    expect(figures(await rowOf())).toMatchObject({
      physical: 1,
      mrpValue: { kind: 'known', value: 199_900 },
      cost: { kind: 'known', value: 94_500 },
    });
    const read = await w.grnPt(grnId);
    const proposed = ptReversalProposedSchema.parse(
      ok(
        await w.post(w.people.ptMaker, `/api/merchandise/pt/revisions/${revisionId}/reversals`, {
          versionToken: read.pt?.versionToken,
          reason: 'SYNTHETIC: MRP keyed wrongly',
        }),
      ),
    );
    ok(await w.decide(w.people.ptApprover, proposed.requestId, proposed.ptReversalId));
    expect(figures(await rowOf())).toMatchObject({
      physical: 1,
      mrpValue: { kind: 'unknown' },
      cost: { kind: 'unknown' },
    });
  });
});
