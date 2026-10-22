import { uuidv7 } from '@apparel-os/domain';
import { trialBalanceSchema, type PtRevisionRead } from '@apparel-os/schemas';
import ExcelJS from 'exceljs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { skuOn } from '../src/modules/merchandise/catalogue/index.js';
import { availability, custody } from '../src/modules/stock/ledger/index.js';
import { syntheticCode, syntheticName } from './fixtures/synthetic.js';
import { asUserIn } from './support/damage.js';
import { STORE_FILE_PATH, syntheticPdfUpload } from './support/opening-app.js';
import { decided } from './support/organisation.js';
import { ptApprovalWorld, type PtApprovalWorld } from './support/pt-approval.js';

// S2-F06-T01: a PT approved or rejected, through the whole application on real PostgreSQL (goods-in 6.1 to 6.6, 10.3,
// 12 tests 11, 12 and the approval part of 13; PRD-REC-015, PRD-REC-017, PRD-REC-018, PRD-MER-013, PRD-PTW-010,
// PRD-ACS-006, PRD-ACS-015, PRD-INT-004, PRD-INT-005; DEC-135, DEC-140, DEC-141). The PT file travels through the import
// routes; its approval and rejection are `access`'s Decide, as the approval panel in My work makes them; the review
// and the download are the PT's own routes. Policies 1 and 3 report no values yet, so the gate opens on the one value of
// a TEST-ONLY check each, labelled synthetic (support/pt-approval.ts). Every person, place, list, product, account,
// amount and number is SYNTHETIC.

let w: PtApprovalWorld;

beforeAll(async () => {
  w = await ptApprovalWorld('PTA');
}, 900_000);

afterAll(async () => {
  await (w as PtApprovalWorld | undefined)?.close();
});

const errorOf = (call: { body: Record<string, unknown> }) =>
  (call.body as { error?: { kind: string; code: string; missing?: Record<string, string>[] } }).error;

/** The SYNTHETIC trial balance of the book's period, as Accounts reads it (books-and-posting 12). */
async function trialBalance() {
  const read = await w.get(
    w.people.accountsReader,
    `/api/finance/books/${w.fixture.bookId}/trial-balance?periodId=${w.periodId}`,
  );
  expect(read.status, JSON.stringify(read.body)).toBe(200);
  return trialBalanceSchema.parse(read.body);
}

/** How much an account moved on a side between two trial balances. */
function moved(
  before: Awaited<ReturnType<typeof trialBalance>>,
  after: Awaited<ReturnType<typeof trialBalance>>,
  accountId: string,
  side: 'debitPaise' | 'creditPaise',
): number {
  const of = (read: typeof before) => read.rows.find((row) => row.accountId === accountId)?.[side] ?? 0;
  return of(after) - of(before);
}

/**
 * The stock of a style at the fixture's whole-store unit, as its approver may see it (stock-ledger 13.6): each custody
 * row in good or damaged condition with its SKU's code and size, or none while Unknown, and, per SKU, what is covered
 * and available.
 */
async function stockOfStyle(styleCode: string) {
  const person = w.people.ptApprover.user.id;
  return asUserIn(w.api.app, w.organisation, person, async (context) => {
    const { rows } = await custody(context, { siteId: w.fixture.siteId, businessUnitId: w.fixture.wholeStore });
    const found: {
      skuId: string | null;
      skuCode: string | null;
      size: string | null;
      condition: string;
      quantity: number;
      accepted: number;
      receiptOriginId: string;
    }[] = [];
    for (const row of rows) {
      if (row.quantity === 0) continue;
      if (row.skuId === null) continue;
      const read = await skuOn(context, row.skuId, w.fixture.siteId, w.setup.today());
      if ('refusal' in read || read.sku.styleCode !== styleCode) continue;
      found.push({
        skuId: row.skuId,
        skuCode: read.sku.code,
        size: read.sku.size ?? null,
        condition: row.condition,
        quantity: row.quantity,
        accepted: row.acceptedQuantity,
        receiptOriginId: row.receiptOriginId,
      });
    }
    const covered = new Map<string, { covered: number; available: number }>();
    for (const skuId of new Set(found.map((row) => row.skuId ?? ''))) {
      const answer = await availability(context, {
        siteId: w.fixture.siteId,
        businessUnitId: w.fixture.wholeStore,
        skuId,
      });
      covered.set(skuId, {
        covered: answer.rows.reduce((sum, row) => sum + row.coveredQuantity, 0),
        available: answer.rows.reduce((sum, row) => sum + row.available, 0),
      });
    }
    return { rows: found, covered };
  });
}

/** A GRN of the owned brand counted, and its PT file submitted with the rows given; answers both. */
async function ownedPt(
  label: string,
  lines: readonly { readonly sizeAt: 0 | 1; readonly counted: number }[],
  rows: (style: string) => readonly Parameters<PtApprovalWorld['ptRow']>[2][],
) {
  const style = syntheticCode(label);
  const { grnId, arrivalId } = await w.issuedGrn(
    lines.map((line) => ({ style, ...line })),
    { brand: 'owned' },
  );
  const submitted = await w.submittedPt(
    grnId,
    rows(style).map((values, at) => w.ptRow(style, lines[at % lines.length]?.sizeAt ?? 0, values, w.owned.code)),
  );
  return { style, grnId, arrivalId, ...submitted };
}

describe('approving a PT (goods-in 6.3; 12 test 11)', () => {
  it('PRD-REC-017 PRD-PTW-010 DEC-140 makes the PT Official, gives the pieces their SKUs, covers them and posts their cost against the receipt account', async () => {
    const style = syntheticCode('PTA-OWNED');
    const { grnId } = await w.issuedGrn(
      [
        { style, sizeAt: 0, counted: 2 },
        { style, sizeAt: 1, counted: 1 },
      ],
      { brand: 'owned' },
    );
    const { revisionId, requestId } = await w.submittedPt(grnId, [
      w.ptRow(style, 0, {}, w.owned.code),
      w.ptRow(style, 0, {}, w.owned.code),
      w.ptRow(style, 1, {}, w.owned.code),
    ]);
    const before = await trialBalance();
    const approved = await w.decide(w.people.ptApprover, requestId, revisionId);
    expect(approved.status, JSON.stringify(approved.body)).toBe(200);
    const read = await w.grnPt(grnId);
    expect(read.pt?.revisions[0]?.state).toBe('Official');
    expect(read.pt?.revisions[0]?.number).toMatch(/^SYN-PT-\d{5}$/);
    // The GRN keeps its mark: the PT stands, so no other file is uploaded for it (goods-in 5.1).
    expect(read.mark).toMatchObject({ kind: 'set', ptRevisionId: revisionId });
    // The new products, confirmed with SKU codes drawn from the SYNTHETIC series (RR-585; goods-in 6.3 step 2).
    const review = await w.revision(revisionId);
    expect(review.state).toBe('Official');
    expect(review.newProducts).toHaveLength(2);
    for (const product of review.newProducts) expect(product.skuCode).toMatch(/^SYN-SKU-\d{6}$/);
    // SYNTHETIC hand-worked: 3 pieces at P RATE 945.00 = 2,835.00, debited to stock value and credited to the receipt
    // account, not the supplier (books-and-posting 7.2; DEC-140).
    const after = await trialBalance();
    expect(moved(before, after, w.accounts.INV, 'debitPaise')).toBe(283_500);
    expect(moved(before, after, w.accounts.RCPT, 'creditPaise')).toBe(283_500);
    // The pieces carry their SKUs, a size of the size set by the row's size code, the stock unit Piece (RR-585); they
    // are covered and still at the receiving location, not accepted, so nothing is sellable (goods-in 6.3, 12 test 13).
    const stock = await stockOfStyle(style);
    expect(stock.rows.map((row) => ({ size: row.size, quantity: row.quantity, accepted: row.accepted }))).toEqual(
      expect.arrayContaining([
        { size: w.code.size(0), quantity: 2, accepted: 0 },
        { size: w.code.size(1), quantity: 1, accepted: 0 },
      ]),
    );
    for (const [, each] of stock.covered) expect(each).toMatchObject({ available: 0 });
    expect([...stock.covered.values()].reduce((sum, each) => sum + each.covered, 0)).toBe(3);
  });

  it('PRD-ACS-006 PRD-REC-017 refuses the uploader, who prepared it, whatever their authority', async () => {
    const { revisionId, requestId } = await ownedPt('PTA-SELF', [{ sizeAt: 0, counted: 1 }], () => [{}]);
    const own = await w.decide(w.people.ptMaker, requestId, revisionId);
    expect(own.status, JSON.stringify(own.body)).toBe(422);
    expect(errorOf(own)?.code).toBe('access.self-preparation');
    expect((await w.revision(revisionId)).state).toBe('Awaiting approval');
  });

  it("PRD-ACS-015 POL-02.09 judges the approver's limit on P RATE times QTY, never on MRP", async () => {
    // SYNTHETIC: 2 pieces at P RATE 945.00 = 1,890.00, above the low limit of 10.00 (support/pt-approval.ts).
    const { revisionId, requestId } = await ownedPt('PTA-LIMIT', [{ sizeAt: 0, counted: 2 }], () => [
      { QTY: 2, NAG: 2 },
    ]);
    const request = await w.get(w.people.ptApprover, `/api/access/approval-requests/${requestId}`);
    expect(request.status, JSON.stringify(request.body)).toBe(200);
    expect(JSON.stringify(request.body.value)).toContain('189000');
    const low = await w.decide(w.people.lowLimitApprover, requestId, revisionId);
    expect(low.status, JSON.stringify(low.body)).toBe(403);
    expect(errorOf(low)?.code).toBe('access.above-approval-limit');
    const high = await w.decide(w.people.ptApprover, requestId, revisionId);
    expect(high.status, JSON.stringify(high.body)).toBe(200);
  });

  it('DEC-141 POL-01.05 records the cost of goods the brand still owns and posts nothing for them', async () => {
    // The receiving world's brand keeps its goods until they are sold (sale to the customer; support/receiving.ts).
    const style = syntheticCode('PTA-BRAND-OWNED');
    const { grnId } = await w.issuedGrn([{ style, sizeAt: 0, counted: 2 }]);
    const { revisionId, requestId } = await w.submittedPt(grnId, [w.ptRow(style, 0, { QTY: 2, NAG: 2 })]);
    const before = await trialBalance();
    const approved = await w.decide(w.people.ptApprover, requestId, revisionId);
    expect(approved.status, JSON.stringify(approved.body)).toBe(200);
    expect((await w.revision(revisionId)).state).toBe('Official');
    const after = await trialBalance();
    expect(moved(before, after, w.accounts.INV, 'debitPaise')).toBe(0);
    expect(moved(before, after, w.accounts.RCPT, 'creditPaise')).toBe(0);
    const stock = await stockOfStyle(style);
    expect(stock.rows.reduce((sum, row) => sum + row.quantity, 0)).toBe(2);
  });

  it('POL-09.12 refuses the whole approval while the book has no posting map, and changes nothing', async () => {
    // The second receiving world's book has no cost setting, period or map (support/pt-approval.ts).
    const style = syntheticCode('PTA-UNMAPPED');
    const { grnId } = await w.issuedGrn([{ style, sizeAt: 0, counted: 1 }], { world: w.unmapped });
    const { revisionId, requestId } = await w.submittedPt(grnId, [w.ptRow(style, 0, {}, w.unmapped.brand.code)]);
    const refused = await w.decide(w.people.ptApprover, requestId, revisionId);
    expect(refused.status, JSON.stringify(refused.body)).toBe(403);
    expect(errorOf(refused)).toMatchObject({ code: 'configuration.operation-unavailable' });
    expect(errorOf(refused)?.missing).toContainEqual({
      kind: 'posting-map',
      bookId: w.unmapped.bookId,
      eventKind: 'stock.cost-established',
    });
    const read = await w.grnPt(grnId);
    expect(read.pt?.revisions[0]).toMatchObject({
      state: 'Awaiting approval',
      request: { state: 'Awaiting approval' },
    });
    expect(read.mark).toMatchObject({ kind: 'set', ptRevisionId: revisionId });
  });

  it("RR-585 refuses a new product whose size is not in its category's size set, naming the row", async () => {
    // A third size on the size list, not in the casual category's size set (structure-and-masters 4.1).
    const { setup } = w;
    const sizeCode = syntheticCode('PTA-XL');
    const proposed = await setup.asPreparerDo((c, p) =>
      setup.catalogue.proposeVocabularyValue(c, p, {
        attributeId: w.fixture.sizes.attributeId,
        code: sizeCode,
        name: syntheticName('XL'),
      }),
    );
    if (proposed.kind !== 'success') throw new Error(proposed.refusal.code);
    decided(await setup.decide(proposed.answer.requestId, proposed.answer.proposalId));
    const confirmed = await setup.run(setup.preparer.id, (c) =>
      setup.catalogue.proposal(c, proposed.answer.proposalId),
    );
    const style = syntheticCode('PTA-XL-STYLE');
    const arrival = await w.post(w.people.receiver, '/api/receiving/arrivals', {
      businessUnitId: w.fixture.wholeStore,
      receivingLocationId: w.fixture.storeLocation,
      supplierPartyId: w.fixture.supplier.id,
      brandId: w.owned.brandId,
      transporter: syntheticName('Transporter'),
      lorryReceipt: { number: 'SYN-LR-XL', date: setup.today() },
      cartons: 1,
      arrivedAt: new Date(w.clock.now().getTime() - 3_600_000).toISOString(),
    });
    expect(arrival.status, JSON.stringify(arrival.body)).toBe(200);
    const arrivalId = (arrival.body as { arrivalId: string }).arrivalId;
    const stored = await w.post(w.people.receiver, STORE_FILE_PATH, syntheticPdfUpload('PT-APPROVAL', 'XL'));
    expect(stored.status, JSON.stringify(stored.body)).toBe(200);
    const file = stored.body as { storedFileId: string; receiptId: string };
    expect(
      (
        await w.post(w.people.receiver, `/api/receiving/arrivals/${arrivalId}/invoices`, {
          number: `SYN-INV-XL-${uuidv7().slice(-6)}`,
          date: setup.today(),
          file: { storedFileId: file.storedFileId, fileReceiptId: file.receiptId },
        })
      ).status,
    ).toBe(200);
    const saved = await w.post(w.people.receiver, `/api/receiving/arrivals/${arrivalId}/count-lines`, {
      goods: 'on-invoice',
      styleCode: style,
      colour: 'SYNTHETIC NAVY',
      sizeValueId: confirmed?.valueId ?? null,
      skuId: null,
      description: null,
      invoiceQuantity: 1,
      countedQuantity: 1,
      extra: null,
      damage: null,
      batch: null,
    });
    expect(saved.status, JSON.stringify(saved.body)).toBe(200);
    const issued = await w.post(w.people.receiver, `/api/receiving/arrivals/${arrivalId}/grn`, {
      versionToken: (await w.arrival(arrivalId)).versionToken,
    });
    expect(issued.status, JSON.stringify(issued.body)).toBe(200);
    const grnId = (issued.body as { grnId: string }).grnId;
    const { revisionId, requestId } = await w.submittedPt(grnId, [
      { ...w.ptRow(style, 0, {}, w.owned.code), SIZE: sizeCode },
    ]);
    const refused = await w.decide(w.people.ptApprover, requestId, revisionId);
    expect(refused.status, JSON.stringify(refused.body)).toBe(422);
    expect(errorOf(refused)).toMatchObject({
      code: 'merchandise.pt-size-not-in-size-set',
      missing: [
        { kind: 'pt-row', rowNumber: '2' },
        { kind: 'record', recordType: 'merchandise.category', recordId: w.lists.categories.CASUAL?.id },
        { kind: 'size', size: sizeCode },
      ],
    });
  });
});

describe('the goods Booking took in and the damage the count found (goods-in 4.6, 6.3 step 5, 8.4)', () => {
  it('PRD-REC-013 POL-17.02 ends the excess hold by the PT route and covers the extra pieces with the rest', async () => {
    const style = syntheticCode('PTA-EXCESS');
    const { arrivalId, grnId } = await w.issuedGrn([{ style, sizeAt: 0, counted: 3, invoice: 2, extra: 'received' }], {
      brand: 'owned',
    });
    const held = (await w.arrival(arrivalId)).grn?.lines[0]?.heldLine;
    if (held?.requestId == null) throw new Error('no held line');
    const taken = await w.decide(w.people.bookingApprover, held.requestId, held.versionToken);
    expect(taken.status, JSON.stringify(taken.body)).toBe(200);
    const { revisionId, requestId } = await w.submittedPt(grnId, [w.ptRow(style, 0, { QTY: 3, NAG: 3 }, w.owned.code)]);
    const approved = await w.decide(w.people.ptApprover, requestId, revisionId);
    expect(approved.status, JSON.stringify(approved.body)).toBe(200);
    const stock = await stockOfStyle(style);
    expect(stock.rows).toEqual([expect.objectContaining({ condition: 'good', quantity: 3, accepted: 0 })]);
    expect([...stock.covered.values()][0]).toMatchObject({ covered: 3, available: 0 });
  });

  it('DEC-137 PRD-DMG-005 leaves the pieces confirmed damaged out of the PT, their product Unknown and uncovered', async () => {
    const style = syntheticCode('PTA-DAMAGED');
    const { arrivalId, grnId } = await w.issuedGrn([{ style, sizeAt: 0, counted: 3, damaged: 1 }], {
      brand: 'owned',
    });
    const report = (await w.arrival(arrivalId)).grn?.lines[0]?.damage?.damageReportId ?? '';
    const reportRead = await w.get(w.people.operations, `/api/stock/damage-reports/${report}`);
    expect(reportRead.status, JSON.stringify(reportRead.body)).toBe(200);
    const { versionToken, rounds } = reportRead.body.report as {
      versionToken: string;
      rounds: { requestId: string }[];
    };
    const confirmed = await w.decide(w.people.operations, rounds[0]?.requestId ?? '', versionToken);
    expect(confirmed.status, JSON.stringify(confirmed.body)).toBe(200);
    const { revisionId, requestId } = await w.submittedPt(grnId, [w.ptRow(style, 0, { QTY: 2, NAG: 2 }, w.owned.code)]);
    const before = await trialBalance();
    const approved = await w.decide(w.people.ptApprover, requestId, revisionId);
    expect(approved.status, JSON.stringify(approved.body)).toBe(200);
    // SYNTHETIC hand-worked: the 2 good pieces only, 2 x 945.00 = 1,890.00 (goods-in 8.4).
    expect(moved(before, await trialBalance(), w.accounts.INV, 'debitPaise')).toBe(189_000);
    const stock = await stockOfStyle(style);
    expect(stock.rows).toEqual([expect.objectContaining({ condition: 'good', quantity: 2 })]);
    // The damaged piece stays as counted, of Unknown product, under its quarantine (stock-ledger 13.17; RR-600).
    const damaged = await asUserIn(w.api.app, w.organisation, w.people.ptApprover.user.id, async (context) => {
      const { rows } = await custody(context, { siteId: w.fixture.siteId, businessUnitId: w.fixture.wholeStore });
      return rows.filter((row) => row.condition === 'damaged' && row.skuId === null && row.quantity > 0);
    });
    expect(damaged.length).toBeGreaterThan(0);
  });

  it('DEC-137 refuses the approval while damage reported on the GRN after the upload waits, and once it changed the good pieces', async () => {
    const { grnId, arrivalId, revisionId, requestId } = await ownedPt(
      'PTA-LATE-DAMAGE',
      [{ sizeAt: 0, counted: 2 }],
      () => [{ QTY: 2, NAG: 2 }],
    );
    const lineId = (await w.arrival(arrivalId)).grn?.lines[0]?.id ?? '';
    const reported = await w.post(w.people.receiver, '/api/stock/damage-reports', {
      locationId: w.fixture.storeLocation,
      goods: { kind: 'grn-line', grnLineId: lineId },
      quantity: 1,
      description: 'SYNTHETIC stain found before the PT',
    });
    expect(reported.status, JSON.stringify(reported.body)).toBe(200);
    const waiting = await w.decide(w.people.ptApprover, requestId, revisionId);
    expect(waiting.status, JSON.stringify(waiting.body)).toBe(422);
    expect(errorOf(waiting)?.code).toBe('merchandise.pt-held-lines-open');
    const report = reported.body as { damageReportId: string; versionToken: string; requestId: string };
    const confirmed = await w.decide(w.people.operations, report.requestId, report.versionToken);
    expect(confirmed.status, JSON.stringify(confirmed.body)).toBe(200);
    const changed = await w.decide(w.people.ptApprover, requestId, revisionId);
    expect(changed.status, JSON.stringify(changed.body)).toBe(422);
    expect(errorOf(changed)?.code).toBe('merchandise.pt-grn-changed');
    expect((await w.grnPt(grnId)).pt?.revisions[0]?.state).toBe('Awaiting approval');
  });
});

describe('rejecting a PT (goods-in 6.3 "Reject")', () => {
  it("PRD-REC-017 ends the draft and clears the GRN's mark, so a corrected file is uploaded and approved", async () => {
    const { style, grnId, revisionId, requestId } = await ownedPt('PTA-REJECT', [{ sizeAt: 0, counted: 1 }], () => [
      { 'P RATE': 950, MARGIN: 52.4762 },
    ]);
    const rejected = await w.decide(w.people.ptApprover, requestId, revisionId, 'reject');
    expect(rejected.status, JSON.stringify(rejected.body)).toBe(200);
    const read = await w.grnPt(grnId);
    expect(read.pt?.revisions[0]).toMatchObject({ state: 'Rejected', request: { state: 'Rejected' } });
    expect(read.mark).toMatchObject({
      kind: 'not-set',
      lastChange: { reason: 'pt-rejected', ptRevisionId: revisionId },
    });
    expect(read.upload).toEqual({ kind: 'ready' });
    const again = await w.submittedPt(grnId, [w.ptRow(style, 0, {}, w.owned.code)]);
    const approved = await w.decide(w.people.ptApprover, again.requestId, again.revisionId);
    expect(approved.status, JSON.stringify(approved.body)).toBe(200);
    const after = await w.grnPt(grnId);
    expect(after.pt?.revisions.map((each) => each.state)).toEqual(['Official', 'Rejected']);
  });
});

describe('approvals at once (12 test 12)', () => {
  it('PRD-ACP-002 PRD-INT-005 two approvals of one PT at once: one succeeds, the other is refused, and the pieces are covered once', async () => {
    const { style, revisionId, requestId } = await ownedPt('PTA-RACE', [{ sizeAt: 0, counted: 2 }], () => [
      { QTY: 2, NAG: 2 },
    ]);
    const before = await trialBalance();
    const answers = await Promise.all([
      w.decide(w.people.ptApprover, requestId, revisionId),
      w.decide(w.people.secondApprover, requestId, revisionId),
    ]);
    expect(answers.map((each) => each.status).sort()).toEqual([200, 422]);
    const loser = answers.find((each) => each.status === 422);
    expect(errorOf(loser ?? { body: {} })?.code).toBe('access.approval-not-open');
    expect(moved(before, await trialBalance(), w.accounts.INV, 'debitPaise')).toBe(189_000);
    const stock = await stockOfStyle(style);
    expect([...stock.covered.values()].reduce((sum, each) => sum + each.covered, 0)).toBe(2);
  });

  it('PRD-ACP-002 a recount racing a PT approval: the approval succeeds and the recount is refused, the PT standing', async () => {
    const { grnId, arrivalId, revisionId, requestId } = await ownedPt(
      'PTA-RECOUNT-RACE',
      [{ sizeAt: 0, counted: 2 }],
      () => [{ QTY: 2, NAG: 2 }],
    );
    const lineId = (await w.arrival(arrivalId)).grn?.lines[0]?.id ?? '';
    const [approved, recount] = await Promise.all([
      w.decide(w.people.ptApprover, requestId, revisionId),
      w.post(w.people.receiver, `/api/receiving/grns/${grnId}/recounts`, {
        versionToken: grnId,
        reason: 'SYNTHETIC recount',
        lines: [{ grnLineId: lineId, countedQuantity: 3 }],
      }),
    ]);
    expect(approved.status, JSON.stringify(approved.body)).toBe(200);
    expect(recount.status, JSON.stringify(recount.body)).toBe(422);
    expect(errorOf(recount)?.code).toBe('receiving.pt-attached');
  });
});

describe('the PT review and its download (goods-in 6.2, 6.5)', () => {
  let reviewed: { revisionId: string; style: string };

  beforeAll(async () => {
    const { style, revisionId, requestId } = await ownedPt(
      'PTA-REVIEW',
      [
        { sizeAt: 0, counted: 2 },
        { sizeAt: 1, counted: 1 },
      ],
      () => [{}, {}, { 'P RATE': 900, MARGIN: 54.9775 }],
    );
    reviewed = { revisionId, style };
    // Awaiting approval: the review shows it as the approver sees it.
    const review = await w.revision(revisionId, w.people.ptApprover, '?limit=2');
    expect(review).toMatchObject({ state: 'Awaiting approval', number: null });
    expect(review.rows).toHaveLength(2);
    expect(review.next).toBe(review.rows.at(-1)?.rowNumber);
    const draftDownload = await w.get(w.people.ptApprover, `/api/merchandise/pt/revisions/${revisionId}/download`);
    expect(draftDownload.status).toBe(422);
    expect(errorOf(draftDownload)?.code).toBe('merchandise.pt-not-official');
    const approved = await w.decide(w.people.ptApprover, requestId, revisionId);
    expect(approved.status, JSON.stringify(approved.body)).toBe(200);
  });

  it('PRD-PTW-011 DEC-140 shows the totals with BASIC beside P RATE, the margins and the new products with their codes', async () => {
    const review: PtRevisionRead = await w.revision(reviewed.revisionId);
    // SYNTHETIC hand-worked: MRP 3 x 1,999.00; BASIC 3 x 700.00; P RATE 945.00 + 945.00 + 900.00 = 2,790.00.
    expect(review.totals).toEqual({
      rows: 3,
      pieces: 3,
      mrpPaise: 599_700,
      basicPaise: { kind: 'amount', paise: 210_000 },
      costPaise: { kind: 'amount', paise: 279_000 },
    });
    expect(review.rows[0]).toMatchObject({
      basicPaise: { kind: 'amount', paise: 70_000 },
      pRatePaise: { kind: 'amount', paise: 94_500 },
      margin: { kind: 'margin', value: '52.73' },
      product: 'proposed',
    });
    expect(review.grn.number).toMatch(/^SYN-GRN-/);
    expect(review.newProducts.every((each) => each.skuCode !== undefined)).toBe(true);
  });

  it('PRD-ACS-008 masks BASIC, P RATE and MARGIN for a reader not granted cost or margin, and refuses them the download', async () => {
    const review = await w.revision(reviewed.revisionId, w.people.ptReader);
    expect(review.totals.costPaise).toEqual({ kind: 'masked', fieldClass: 'cost' });
    expect(review.rows[0]).toMatchObject({
      pRatePaise: { kind: 'masked', fieldClass: 'cost' },
      margin: { kind: 'masked', fieldClass: 'margin' },
    });
    const refused = await w.get(w.people.ptReader, `/api/merchandise/pt/revisions/${reviewed.revisionId}/download`);
    expect(refused.status).toBe(403);
    expect(errorOf(refused)).toMatchObject({ code: 'access.not-authorised' });
  });

  it("PRD-PTW-008 PRD-PTW-009 downloads an Official PT as XLSX in the template's columns", async () => {
    const download = await w.get(w.people.ptApprover, `/api/merchandise/pt/revisions/${reviewed.revisionId}/download`);
    expect(download.status, JSON.stringify(download.body)).toBe(200);
    const { fileName, contentBase64 } = download.body as { fileName: string; contentBase64: string };
    expect(fileName).toMatch(/^SYN-PT-\d{5}\.xlsx$/);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(Buffer.from(contentBase64, 'base64') as unknown as ArrayBuffer);
    const [sheet] = workbook.worksheets;
    const header = (sheet?.getRow(1).values as unknown[]).slice(1);
    expect(header.slice(0, 20)).toEqual([
      'SEASON',
      'BRAND',
      'COLOR',
      'GENDER',
      'SUB CATEGORY',
      'TYPE',
      'ITEM',
      'FIT',
      'SIZE',
      'BARCODE',
      'DESIGN',
      'HSN',
      'QTY',
      'MRP',
      'BASIC',
      'P RATE',
      'INPUT TAX',
      'OUTPUT TAX',
      'NAG',
      'MARGIN',
    ]);
    const third = (sheet?.getRow(4).values as unknown[]).slice(1);
    expect(third[1]).toBe(w.owned.code);
    expect(third[10]).toBe(reviewed.style);
    expect(third[12]).toBe(1);
    expect(third[15]).toBe(900);
    expect(sheet?.rowCount).toBe(4);
  });
});

describe('the approval in a locked period (goods-in 6.3; books-and-posting 10)', () => {
  it('PRD-LED-009 refuses the whole approval while the period it posts into is locked', async () => {
    const { grnId, revisionId, requestId } = await ownedPt('PTA-LOCKED', [{ sizeAt: 0, counted: 1 }], () => [{}]);
    const { setup } = w;
    const locked = await setup.asPreparerDo((c, p) => setup.books.lockPeriod(c, p, w.periodId));
    if (locked.kind !== 'success') throw new Error(`lock refused: ${locked.refusal.code}`);
    const refused = await w.decide(w.people.ptApprover, requestId, revisionId);
    expect(refused.status, JSON.stringify(refused.body)).toBe(422);
    expect(JSON.stringify(errorOf(refused))).toContain('period-locked');
    expect((await w.grnPt(grnId)).pt?.revisions[0]?.state).toBe('Awaiting approval');
  });
});
