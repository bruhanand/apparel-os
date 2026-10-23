import {
  PT_REVERSAL_REASON_CAP,
  ptReversalProposedSchema,
  ptReversalReadSchema,
  trialBalanceSchema,
} from '@apparel-os/schemas';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { skuOn } from '../src/modules/merchandise/catalogue/index.js';
import { availability, custody, rebuildAndCompare } from '../src/modules/stock/ledger/index.js';
import type { SyntheticPtRow } from './fixtures/pt.js';
import { syntheticCode, syntheticName } from './fixtures/synthetic.js';
import { asUserIn, RECEIVER_REPORTER_AUTHORITY } from './support/damage.js';
import { approved, decided } from './support/organisation.js';
import { ptApprovalWorld, type Person, type PtApprovalWorld } from './support/pt-approval.js';
import { placeScope } from './support/receiving.js';

// S2-F09-T01: a PT reversed before the scan-in, through the whole application on real PostgreSQL (goods-in 6.4, 6.7,
// 10.3, 12 test 15; stock-ledger 7.5, 13.21; DEC-137, PRD-REC-019, PRD-ACS-006, PRD-ACS-015, PRD-INT-004). The PT file
// travels through the import routes and is approved through `access`'s Decide, as the approval panel in My work makes
// it; the reversal is proposed through its route and approved there too; the stock and the books are read through the
// ledger's reads and the trial balance. Policies 1 and 3 report no values yet, so the gate opens on the one value of a
// TEST-ONLY check each, labelled synthetic (support/pt-approval.ts). Every person, place, list, product, account,
// amount, reason and number is SYNTHETIC.

let w: PtApprovalWorld;

beforeAll(async () => {
  w = await ptApprovalWorld('PTR');
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
 * The stock of a style at the fixture's whole-store unit, as the PT's approver may see it (stock-ledger 13.6): each
 * custody row of a known SKU with its size, condition and accepted pieces, and, per SKU, what is covered.
 */
async function stockOfStyle(styleCode: string) {
  return asUserIn(w.api.app, w.organisation, w.people.ptApprover.user.id, async (context) => {
    const { rows } = await custody(context, { siteId: w.fixture.siteId, businessUnitId: w.fixture.wholeStore });
    const found: { skuId: string; size: string | null; condition: string; quantity: number; accepted: number }[] = [];
    for (const row of rows) {
      if (row.quantity === 0 || row.skuId === null) continue;
      const read = await skuOn(context, row.skuId, w.fixture.siteId, w.setup.today());
      if ('refusal' in read || read.sku.styleCode !== styleCode) continue;
      found.push({
        skuId: row.skuId,
        size: read.sku.size ?? null,
        condition: row.condition,
        quantity: row.quantity,
        accepted: row.acceptedQuantity,
      });
    }
    // An origin's covered quantity, wherever its units are, once each (stock-ledger 13.9).
    const covered = new Map<string, number>();
    for (const skuId of new Set(found.map((row) => row.skuId))) {
      const answer = await availability(context, {
        siteId: w.fixture.siteId,
        businessUnitId: w.fixture.wholeStore,
        skuId,
      });
      for (const row of answer.rows) covered.set(row.receiptOriginId, row.coveredQuantity);
    }
    return { rows: found, covered: [...covered.values()].reduce((sum, each) => sum + each, 0) };
  });
}

/** The ledger's projections rebuilt from its entries, as the approver may read them (stock-ledger 2.1, 13.6). */
const rebuilt = async () =>
  (await asUserIn(w.api.app, w.organisation, w.people.ptApprover.user.id, (context) => rebuildAndCompare(context)))
    .differences;

/**
 * A GRN of the owned brand, or of the fixture's brand, which keeps its goods until they are sold (DEC-141), counted, its
 * PT file of the rows given submitted and approved by a different person; answers its parts and the rows.
 */
async function approvedPt(
  label: string,
  lines: readonly { readonly sizeAt: 0 | 1; readonly counted: number }[],
  values: readonly SyntheticPtRow[],
  brand: 'owned' | 'fixture' = 'owned',
) {
  const style = syntheticCode(label);
  const { grnId, arrivalId } = await w.issuedGrn(
    lines.map((line) => ({ style, ...line })),
    { brand },
  );
  const rows = values.map((each, at) =>
    w.ptRow(style, lines[at % lines.length]?.sizeAt ?? 0, each, brand === 'owned' ? w.owned.code : undefined),
  );
  const { revisionId, requestId } = await w.submittedPt(grnId, rows);
  const decision = await w.decide(w.people.ptApprover, requestId, revisionId);
  expect(decision.status, JSON.stringify(decision.body)).toBe(200);
  return { style, grnId, arrivalId, revisionId, rows };
}

/** Proposes the revision's reversal with a SYNTHETIC reason, at the PT's version its GRN's screen reads now. */
async function propose(grnId: string, revisionId: string, person: Person = w.people.ptMaker) {
  const read = await w.grnPt(grnId);
  return w.post(person, `/api/merchandise/pt/revisions/${revisionId}/reversals`, {
    versionToken: read.pt?.versionToken,
    reason: 'SYNTHETIC: P RATE keyed with the handling left out',
  });
}

/** A reversal proposed: its identifier and the approval request a different person decides. */
async function proposed(grnId: string, revisionId: string) {
  const call = await propose(grnId, revisionId);
  expect(call.status, JSON.stringify(call.body)).toBe(200);
  return ptReversalProposedSchema.parse(call.body);
}

describe('reversing a PT before the scan-in (goods-in 6.4; 12 test 15)', () => {
  it('DEC-137 PRD-REC-019 takes off the coverage and the cost with its journal, keeps the PT and its reversal, clears the GRN mark, and a corrected file is approved again', async () => {
    // SYNTHETIC: three pieces at P RATE 945.00 = 2,835.00, posted to stock value against the receipt account.
    const { style, grnId, revisionId, rows } = await approvedPt(
      'PTR-OWNED',
      [
        { sizeAt: 0, counted: 2 },
        { sizeAt: 1, counted: 1 },
      ],
      [{}, {}, {}],
    );
    const approvedStock = await stockOfStyle(style);
    expect(approvedStock.covered).toBe(3);
    const before = await trialBalance();

    const { ptReversalId, requestId } = await proposed(grnId, revisionId);
    // Proposed, the PT stands as it was until a different person approves the reversal (PRD-ACS-006).
    let read = await w.grnPt(grnId);
    expect(read.pt?.revisions[0]).toMatchObject({
      revisionId,
      state: 'Official',
      reversals: [{ reversalId: ptReversalId, state: 'Awaiting approval' }],
    });
    const own = await w.decide(w.people.ptMaker, requestId, ptReversalId);
    expect(own.status, JSON.stringify(own.body)).toBe(422);
    expect(errorOf(own)?.code).toBe('access.self-preparation');
    // The approval panel's facts in My work (goods-in 6.7, section 11).
    const panel = await w.get(w.people.ptApprover, `/api/merchandise/pt/reversals/${ptReversalId}`);
    expect(panel.status, JSON.stringify(panel.body)).toBe(200);
    expect(ptReversalReadSchema.parse(panel.body)).toMatchObject({
      revisionId,
      number: read.pt?.revisions[0]?.number,
      grn: { grnId },
      reversal: {
        reversalId: ptReversalId,
        state: 'Awaiting approval',
        reason: 'SYNTHETIC: P RATE keyed with the handling left out',
        proposedBy: w.people.ptMaker.user.id,
      },
    });

    const done = await w.decide(w.people.ptApprover, requestId, ptReversalId);
    expect(done.status, JSON.stringify(done.body)).toBe(200);
    read = await w.grnPt(grnId);
    // The PT and its reversal kept as linked records; the GRN waits for a corrected file (goods-in 6.4).
    expect(read.pt?.revisions[0]).toMatchObject({
      revisionId,
      state: 'Reversed',
      reversals: [{ reversalId: ptReversalId, state: 'Approved', decided: { by: w.people.ptApprover.user.id } }],
    });
    expect(read.mark).toMatchObject({
      kind: 'not-set',
      lastChange: { ptRevisionId: revisionId, reason: 'pt-reversed' },
    });
    expect(read.upload).toEqual({ kind: 'ready' });
    // SYNTHETIC hand-worked: the cost's journal reversed, 2,835.00 credited to stock value and debited to the receipt
    // account, nothing left as a variance (stock-ledger 7.5; books-and-posting 7.1).
    const reversed = await trialBalance();
    expect(moved(before, reversed, w.accounts.INV, 'creditPaise')).toBe(283_500);
    expect(moved(before, reversed, w.accounts.RCPT, 'debitPaise')).toBe(283_500);
    expect(moved(before, reversed, w.accounts.VAR, 'debitPaise')).toBe(0);
    // The pieces stay where they are, uncovered, keeping the SKUs the PT gave them until a corrected PT sets them again.
    const reversedStock = await stockOfStyle(style);
    expect(reversedStock.covered).toBe(0);
    expect(
      reversedStock.rows.map(({ skuId, size, quantity, accepted }) => ({ skuId, size, quantity, accepted })),
    ).toEqual(
      expect.arrayContaining(
        approvedStock.rows.map(({ skuId, size, quantity, accepted }) => ({ skuId, size, quantity, accepted })),
      ),
    );
    expect(await rebuilt()).toEqual([]);

    // The corrected file: P RATE 900.00, so MARGIN (1,999.00 − 900.00) ÷ 1,999.00 = 54.9775 (shared-calculations 6).
    const corrected = await w.submittedPt(
      grnId,
      rows.map((row) => ({ ...row, 'P RATE': 900, MARGIN: 54.9775 })),
    );
    expect(corrected.revisionId).not.toBe(revisionId);
    const again = await w.decide(w.people.secondApprover, corrected.requestId, corrected.revisionId);
    expect(again.status, JSON.stringify(again.body)).toBe(200);
    read = await w.grnPt(grnId);
    expect(read.pt?.revisions.map((each) => each.state)).toEqual(['Official', 'Reversed']);
    expect(read.mark).toMatchObject({ kind: 'set', ptRevisionId: corrected.revisionId });
    // SYNTHETIC: 3 pieces at 900.00 = 2,700.00 posted again (goods-in 6.3).
    const after = await trialBalance();
    expect(moved(reversed, after, w.accounts.INV, 'debitPaise')).toBe(270_000);
    expect(moved(reversed, after, w.accounts.RCPT, 'creditPaise')).toBe(270_000);
    const correctedStock = await stockOfStyle(style);
    expect(correctedStock.covered).toBe(3);
    expect(new Set(correctedStock.rows.map((row) => row.skuId))).toEqual(
      new Set(approvedStock.rows.map((row) => row.skuId)),
    );
    expect(await rebuilt()).toEqual([]);
  });

  it('DEC-137 PRD-REC-019 a corrected PT reversed in turn is followed by another corrected file, approved from where the pieces are', async () => {
    const { style, grnId, revisionId, rows } = await approvedPt('PTR-TWICE', [{ sizeAt: 0, counted: 2 }], [{}, {}]);
    const reverse = async (revision: string) => {
      const { ptReversalId, requestId } = await proposed(grnId, revision);
      const done = await w.decide(w.people.ptApprover, requestId, ptReversalId);
      expect(done.status, JSON.stringify(done.body)).toBe(200);
    };
    const correct = async (pRate: number, margin: number) => {
      const file = await w.submittedPt(
        grnId,
        rows.map((row) => ({ ...row, 'P RATE': pRate, MARGIN: margin })),
      );
      const done = await w.decide(w.people.ptApprover, file.requestId, file.revisionId);
      expect(done.status, JSON.stringify(done.body)).toBe(200);
      return file.revisionId;
    };
    await reverse(revisionId);
    // SYNTHETIC: P RATE 900.00, MARGIN 54.9775; then 950.00, MARGIN (1,999.00 − 950.00) ÷ 1,999.00 = 52.4762.
    const second = await correct(900, 54.9775);
    await reverse(second);
    const before = await trialBalance();
    await correct(950, 52.4762);
    const read = await w.grnPt(grnId);
    expect(read.pt?.revisions.map((each) => each.state)).toEqual(['Official', 'Reversed', 'Reversed']);
    // SYNTHETIC: 2 pieces at 950.00 = 1,900.00.
    expect(moved(before, await trialBalance(), w.accounts.INV, 'debitPaise')).toBe(190_000);
    expect((await stockOfStyle(style)).covered).toBe(2);
    expect(await rebuilt()).toEqual([]);
  });

  it('DEC-141 POL-01.05 of goods the brand still owns records their cost Unknown again and posts nothing, and the corrected file is approved again', async () => {
    // The fixture's brand keeps its goods until they are sold (support/receiving.ts), so their cost was recorded only.
    const { style, grnId, revisionId, rows } = await approvedPt(
      'PTR-BRAND',
      [{ sizeAt: 0, counted: 2 }],
      [{ QTY: 2, NAG: 2 }],
      'fixture',
    );
    const before = await trialBalance();
    const { ptReversalId, requestId } = await proposed(grnId, revisionId);
    // SYNTHETIC: approved on the cost it reverses, 2 pieces at 945.00 (domain-model 5; PRD-ACS-015).
    const request = await w.get(w.people.ptApprover, `/api/access/approval-requests/${requestId}`);
    expect(request.status, JSON.stringify(request.body)).toBe(200);
    expect(JSON.stringify(request.body.value)).toContain('189000');
    const done = await w.decide(w.people.ptApprover, requestId, ptReversalId);
    expect(done.status, JSON.stringify(done.body)).toBe(200);
    expect((await w.grnPt(grnId)).pt?.revisions[0]?.state).toBe('Reversed');
    const after = await trialBalance();
    for (const account of [w.accounts.INV, w.accounts.RCPT, w.accounts.VAR]) {
      expect(moved(before, after, account, 'debitPaise')).toBe(0);
      expect(moved(before, after, account, 'creditPaise')).toBe(0);
    }
    expect((await stockOfStyle(style)).covered).toBe(0);
    const corrected = await w.submittedPt(
      grnId,
      rows.map((row) => ({ ...row, 'P RATE': 900, MARGIN: 54.9775 })),
    );
    const again = await w.decide(w.people.ptApprover, corrected.requestId, corrected.revisionId);
    expect(again.status, JSON.stringify(again.body)).toBe(200);
    expect((await stockOfStyle(style)).covered).toBe(2);
  });

  it('PRD-ACS-006 PRD-REC-019 a rejected reversal changes nothing, and the PT may be proposed for reversal again', async () => {
    const { style, grnId, revisionId } = await approvedPt('PTR-REJECT', [{ sizeAt: 0, counted: 1 }], [{}]);
    const before = await trialBalance();
    const first = await proposed(grnId, revisionId);
    const rejected = await w.decide(w.people.ptApprover, first.requestId, first.ptReversalId, 'reject');
    expect(rejected.status, JSON.stringify(rejected.body)).toBe(200);
    const read = await w.grnPt(grnId);
    expect(read.pt?.revisions[0]).toMatchObject({
      state: 'Official',
      reversals: [{ reversalId: first.ptReversalId, state: 'Rejected' }],
    });
    expect(read.mark).toMatchObject({ kind: 'set', ptRevisionId: revisionId });
    const after = await trialBalance();
    expect(moved(before, after, w.accounts.INV, 'creditPaise')).toBe(0);
    expect((await stockOfStyle(style)).covered).toBe(1);
    const second = await proposed(grnId, revisionId);
    expect(second.ptReversalId).not.toBe(first.ptReversalId);
  });

  it('PRD-REC-019 refuses a revision not Official, a second reversal while one waits, and a version no longer shown', async () => {
    const style = syntheticCode('PTR-REFUSALS');
    const { grnId } = await w.issuedGrn([{ style, sizeAt: 0, counted: 1 }], { brand: 'owned' });
    const draft = await w.submittedPt(grnId, [w.ptRow(style, 0, {}, w.owned.code)]);
    const notOfficial = await propose(grnId, draft.revisionId);
    expect(notOfficial.status, JSON.stringify(notOfficial.body)).toBe(422);
    expect(errorOf(notOfficial)?.code).toBe('merchandise.pt-not-official');
    const done = await w.decide(w.people.ptApprover, draft.requestId, draft.revisionId);
    expect(done.status, JSON.stringify(done.body)).toBe(200);
    const stale = (await w.grnPt(grnId)).pt?.versionToken;
    await proposed(grnId, draft.revisionId);
    const again = await propose(grnId, draft.revisionId);
    expect(again.status, JSON.stringify(again.body)).toBe(422);
    expect(errorOf(again)?.code).toBe('merchandise.pt-reversal-open');
    const old = await w.post(w.people.ptMaker, `/api/merchandise/pt/revisions/${draft.revisionId}/reversals`, {
      versionToken: stale,
      reason: 'SYNTHETIC: read before the first proposal',
    });
    expect(old.status, JSON.stringify(old.body)).toBe(409);
    expect(errorOf(old)?.code).toBe('kernel.stale-version');
    // A reason of spaces only says nothing (goods-in 6.7).
    const blank = await w.post(w.people.ptMaker, `/api/merchandise/pt/revisions/${draft.revisionId}/reversals`, {
      versionToken: (await w.grnPt(grnId)).pt?.versionToken,
      reason: '   ',
    });
    expect(blank.status, JSON.stringify(blank.body)).toBe(400);
  });

  it('PRD-REC-019 refuses a PT whose goods were reported damaged since its approval', async () => {
    const { style, grnId, revisionId } = await approvedPt(
      'PTR-DAMAGED',
      [{ sizeAt: 0, counted: 2 }],
      [{ QTY: 2, NAG: 2 }],
    );
    const [row] = (await stockOfStyle(style)).rows;
    if (row === undefined) throw new Error('The PT gave the pieces no SKU');
    const reported = await w.post(w.people.receiver, '/api/stock/damage-reports', {
      locationId: w.fixture.storeLocation,
      goods: { kind: 'product', skuId: row.skuId },
      quantity: 1,
      description: 'SYNTHETIC torn seam found before the scan-in',
    });
    expect(reported.status, JSON.stringify(reported.body)).toBe(200);
    const held = await propose(grnId, revisionId);
    expect(held.status, JSON.stringify(held.body)).toBe(422);
    expect(errorOf(held)?.code).toBe('merchandise.pt-goods-held');
  });

  it('PRD-ACS-006 shows the reversal to a reader of the PT, and to no one who may not see the GRN', async () => {
    const { grnId, revisionId } = await approvedPt('PTR-READ', [{ sizeAt: 0, counted: 1 }], [{}]);
    // The longest reason the route takes, which the table's check takes too (PT_REVERSAL_REASON_CAP; goods-in 6.7).
    const path = `/api/merchandise/pt/revisions/${revisionId}/reversals`;
    const versionToken = (await w.grnPt(grnId)).pt?.versionToken;
    const tooLong = await w.post(w.people.ptMaker, path, {
      versionToken,
      reason: 'S'.repeat(PT_REVERSAL_REASON_CAP + 1),
    });
    expect(tooLong.status, JSON.stringify(tooLong.body)).toBe(400);
    const call = await w.post(w.people.ptMaker, path, { versionToken, reason: 'S'.repeat(PT_REVERSAL_REASON_CAP) });
    expect(call.status, JSON.stringify(call.body)).toBe(200);
    const { ptReversalId } = ptReversalProposedSchema.parse(call.body);
    const read = await w.get(w.people.ptReader, `/api/merchandise/pt/reversals/${ptReversalId}`);
    expect(read.status, JSON.stringify(read.body)).toBe(200);
    expect(ptReversalReadSchema.parse(read.body).reversal.reason).toHaveLength(PT_REVERSAL_REASON_CAP);
    const other = await w.enrol('PTR-OTHER-STORE', [{ recordType: 'merchandise.pt', action: 'view' }], {
      scope: placeScope([{ type: 'store', id: w.fixture.otherStoreId }]),
    });
    const hidden = await w.get(other, `/api/merchandise/pt/reversals/${ptReversalId}`);
    expect(hidden.status, JSON.stringify(hidden.body)).toBe(404);
    expect(errorOf(hidden)?.code).toBe('merchandise.record-not-found');
  });
});

describe('a reversal refused once a piece is scanned in (goods-in 6.4, 7.4; 12 test 15)', () => {
  let scanner: Person;
  let floor: string;

  beforeAll(async () => {
    scanner = await w.enrol('PTR-SCANNER', [
      ...RECEIVER_REPORTER_AUTHORITY,
      { recordType: 'receiving.scan', action: 'create' },
    ]);
    floor = (
      await approved(w.setup, (c, p) =>
        w.setup.organisation.prepareLocation(c, p, {
          code: syntheticCode('PTR-FLOOR'),
          siteId: w.fixture.siteId,
          businessUnitId: w.fixture.wholeStore,
          name: syntheticName('Shop floor'),
          kind: 'floor',
          validFrom: w.setup.today(),
        }),
      )
    ).recordId;
  }, 120_000);

  const scanned = async (grnId: string, barcode: string) => {
    const call = await w.post(scanner, `/api/receiving/grns/${grnId}/scans`, {
      barcode,
      destinationLocationId: floor,
    });
    expect(call.status, JSON.stringify(call.body)).toBe(200);
    expect(call.body).toMatchObject({ outcome: 'accepted' });
  };

  it('DEC-137 refuses the proposal after one scan, and nothing changes', async () => {
    const { style, grnId, revisionId, rows } = await approvedPt('PTR-SCANNED', [{ sizeAt: 0, counted: 2 }], [{}, {}]);
    await scanned(grnId, String(rows[0]?.BARCODE));
    const refused = await propose(grnId, revisionId);
    expect(refused.status, JSON.stringify(refused.body)).toBe(422);
    expect(errorOf(refused)?.code).toBe('merchandise.pt-scanned-in');
    expect((await w.grnPt(grnId)).pt?.revisions[0]).toMatchObject({ state: 'Official', reversals: [] });
    expect((await stockOfStyle(style)).covered).toBe(2);
  });

  it('DEC-137 PRD-INT-003 refuses the approval under the locks when a piece was scanned in after the proposal', async () => {
    const { style, grnId, revisionId, rows } = await approvedPt('PTR-RACE', [{ sizeAt: 0, counted: 2 }], [{}, {}]);
    const before = await trialBalance();
    const { ptReversalId, requestId } = await proposed(grnId, revisionId);
    await scanned(grnId, String(rows[1]?.BARCODE));
    const refused = await w.decide(w.people.ptApprover, requestId, ptReversalId);
    expect(refused.status, JSON.stringify(refused.body)).toBe(422);
    expect(errorOf(refused)?.code).toBe('merchandise.pt-scanned-in');
    // Nothing of the reversal is written: the PT stands, its coverage and cost with it (PRD-INT-004).
    const read = await w.grnPt(grnId);
    expect(read.pt?.revisions[0]).toMatchObject({
      state: 'Official',
      reversals: [{ reversalId: ptReversalId, state: 'Awaiting approval' }],
    });
    expect(read.mark).toMatchObject({ kind: 'set', ptRevisionId: revisionId });
    expect(moved(before, await trialBalance(), w.accounts.INV, 'creditPaise')).toBe(0);
    expect((await stockOfStyle(style)).covered).toBe(2);
  });
});

// Last in the file: it locks the book's period, which every posting above needs open.
describe('the reversal in a locked period (goods-in 6.7; books-and-posting 10; SL-23)', () => {
  it('POL-09.12 PRD-LED-009 PRD-EXC-001 refuses the whole reversal in a locked period and raises the unfinished operation; approved again once the period is reopened for it, it posts', async () => {
    const { style, grnId, revisionId } = await approvedPt('PTR-LOCKED', [{ sizeAt: 0, counted: 1 }], [{}]);
    const { ptReversalId, requestId } = await proposed(grnId, revisionId);
    await w.lockPeriod();
    const refused = await w.decide(w.people.ptApprover, requestId, ptReversalId);
    expect(refused.status, JSON.stringify(refused.body)).toBe(422);
    expect(errorOf(refused)?.code).toBe('stock.posting-refused');
    expect(JSON.stringify(errorOf(refused))).toContain('period-locked');
    // Nothing is written: the PT stands and its reversal still waits (PRD-INT-004).
    expect((await w.grnPt(grnId)).pt?.revisions[0]).toMatchObject({
      state: 'Official',
      reversals: [{ reversalId: ptReversalId, state: 'Awaiting approval' }],
    });
    // Step 3: the unfinished operation, raised in a command of its own after the refusal, linking the reversal.
    const [raised, ...more] = await w.exceptionsOn([ptReversalId]);
    expect(more).toEqual([]);
    expect(raised).toMatchObject({
      type: 'merchandise.pt-posting-refused',
      state: 'Unresolved',
      versionId: ptReversalId,
    });
    expect(raised?.comment).toContain('stock.posting-refused');
    // The operation is not finished while the reversal waits (access-and-approvals 12.3).
    const early = await w.post(w.people.ptApprover, `/api/exceptions/exceptions/${raised?.id ?? ''}/close`, {});
    expect(early.status, JSON.stringify(early.body)).not.toBe(200);
    // Step 5: Accounts reopen the period for the reversal, a different person approving (books-and-posting 4.3); the
    // request still waits, so the approver approves again, and it posts once.
    const asked = await w.setup.asPreparerDo((c, p) =>
      w.setup.books.requestReopening(c, p, w.periodId, {
        reason: 'SYNTHETIC reopening for a PT reversal refused in a locked period',
        corrections: [{ module: 'merchandise', recordType: 'merchandise.pt_reversal', recordId: ptReversalId }],
      }),
    );
    if (asked.kind !== 'success') throw new Error(`reopening refused: ${asked.refusal.code}`);
    decided(await w.setup.decide(asked.answer.requestId, asked.answer.reopeningId));
    const done = await w.decide(w.people.ptApprover, requestId, ptReversalId);
    expect(done.status, JSON.stringify(done.body)).toBe(200);
    expect((await w.grnPt(grnId)).pt?.revisions[0]?.state).toBe('Reversed');
    expect((await stockOfStyle(style)).covered).toBe(0);
    expect(await w.exceptionsOn([ptReversalId])).toHaveLength(1);
    const closed = await w.post(w.people.ptApprover, `/api/exceptions/exceptions/${raised?.id ?? ''}/close`, {});
    expect(closed.status, JSON.stringify(closed.body)).toBe(200);
  });
});
