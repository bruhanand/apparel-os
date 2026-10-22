import { trialBalanceSchema, type GrnPtRead } from '@apparel-os/schemas';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PT_POSTED_WITH_DECISION_ROWS } from '../src/modules/merchandise/pt/index.js';
import { syntheticCode } from './fixtures/synthetic.js';
import {
  ptApprovalWorld,
  startPtPostingWorker,
  type PtApprovalWorld,
  type PtPostingWorker,
} from './support/pt-approval.js';

// S2-F06-T01: a large PT's approval posted through the queued job (goods-in 6.3, 6.6, 12 test 21; module-map 6.2 flow
// E; stock-ledger 10.6; access-and-approvals 9.8; PRD-PRF-001, PRD-INT-004; DEC-097). The application queues a PT of
// more than PT_POSTED_WITH_DECISION_ROWS rows, a technical cap, and a worker composed with the PT's posting consumer
// posts it, one at a time per book, as no production worker composes it yet (RR-602). The approval click records the
// decision and a request to post; the job posts the whole PT in one transaction and uses the decision; a refused job
// posts nothing, leaves the decision unused and shows the PT Failed. Every person, place, list, product, account, amount
// and number is SYNTHETIC; the times measured are a development laptop's, against a test container.

let w: PtApprovalWorld;
let worker: PtPostingWorker | undefined;

beforeAll(async () => {
  w = await ptApprovalWorld('PTL', { queue: { kind: 'queued-above', rows: PT_POSTED_WITH_DECISION_ROWS } });
  // The consumer registers when the worker starts and is handed the events recorded from then on (code-house-rules
  // 12.8 "Consumers"), so the worker runs before any approval is clicked.
  worker = await startPtPostingWorker(w);
}, 900_000);

afterAll(async () => {
  await worker?.stop();
  await (w as PtApprovalWorld | undefined)?.close();
});

/** Waits, at most the time given, until the GRN's newest PT revision is in a state other than Queued. */
async function settled(grnId: string, withinMs: number): Promise<GrnPtRead> {
  const until = Date.now() + withinMs;
  for (;;) {
    const read = await w.grnPt(grnId);
    if (read.pt?.revisions[0]?.state !== 'Queued' || Date.now() > until) return read;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
}

/** The book's trial balance, as Accounts reads it (books-and-posting 12). */
async function trialBalance() {
  const read = await w.get(
    w.people.accountsReader,
    `/api/finance/books/${w.fixture.bookId}/trial-balance?periodId=${w.periodId}`,
  );
  expect(read.status, JSON.stringify(read.body)).toBe(200);
  return trialBalanceSchema.parse(read.body);
}

/** A GRN of the owned brand of `styles` styles of two sizes, 50 pieces each, and its PT of one piece a row, submitted. */
async function largePt(label: string, styles: number) {
  const codes = Array.from({ length: styles }, (_, at) => syntheticCode(`${label}-${String(at)}`));
  const sizes: readonly (0 | 1)[] = [0, 1];
  const { grnId } = await w.issuedGrn(
    codes.flatMap((style) => sizes.map((sizeAt) => ({ style, sizeAt, counted: 50 }))),
    { brand: 'owned' },
  );
  const rows = codes.flatMap((style) =>
    sizes.flatMap((sizeAt) => Array.from({ length: 50 }, () => w.ptRow(style, sizeAt, {}, w.owned.code))),
  );
  return { grnId, rows, ...(await w.submittedPt(grnId, rows)) };
}

describe('a large PT posted by the queued job (goods-in 6.6; 12 test 21)', () => {
  it('PRD-PRF-001 DEC-097 a 10,000-line PT approval records a request to post, then the job posts it whole', async () => {
    // SYNTHETIC: 100 styles of two sizes, 50 pieces each, one piece a row: 10,000 rows, 200 new products.
    const { grnId, rows, revisionId, requestId } = await largePt('PTL-BIG', 100);
    expect(rows).toHaveLength(10_000);
    const before = await trialBalance();
    const clicked = performance.now();
    const approved = await w.decide(w.people.ptApprover, requestId, revisionId);
    const clickMs = performance.now() - clicked;
    expect(approved.status, JSON.stringify(approved.body)).toBe(200);
    // The click has no stock or money effect: the PT shows Queued until its job posts it (access-and-approvals 9.8).
    const read = await settled(grnId, 600_000);
    const postedMs = performance.now() - clicked;
    expect(read.pt?.revisions[0]?.state).toBe('Official');
    expect(read.pt?.revisions[0]?.number).toMatch(/^SYN-PT-\d{5}$/);
    // SYNTHETIC hand-worked: 10,000 pieces at P RATE 945.00 = 9,450,000.00 into stock value.
    const after = await trialBalance();
    const debited =
      (after.rows.find((row) => row.accountId === w.accounts.INV)?.debitPaise ?? 0) -
      (before.rows.find((row) => row.accountId === w.accounts.INV)?.debitPaise ?? 0);
    expect(debited).toBe(945_000_000);
    process.stdout.write(
      `PRD-PRF-001 SYNTHETIC 10,000-line PT approval: click ${String(Math.round(clickMs))} ms, ` +
        `posted by the job ${String(Math.round(postedMs))} ms after the click\n`,
    );
  }, 900_000);

  it('PRD-INT-004 DEC-097 a refused job posts nothing, keeps the decision unused and shows the PT Failed with why', async () => {
    // SYNTHETIC: 11 styles of two sizes, 50 pieces each: 1,100 rows, above the cap; the period it posts into locked,
    // which the click does not ask, since it posts nothing (books-and-posting 10).
    const { grnId, revisionId, requestId } = await largePt('PTL-FAIL', 11);
    const { setup } = w;
    const locked = await setup.asPreparerDo((c, p) => setup.books.lockPeriod(c, p, w.periodId));
    if (locked.kind !== 'success') throw new Error(`lock refused: ${locked.refusal.code}`);
    const approved = await w.decide(w.people.ptApprover, requestId, revisionId);
    expect(approved.status, JSON.stringify(approved.body)).toBe(200);
    const read = await settled(grnId, 300_000);
    expect(read.pt?.revisions[0]?.state).toBe('Failed');
    const review = await w.revision(revisionId);
    expect(review.failure?.code).toBe('stock.posting-refused');
    expect(JSON.stringify(review.failure?.missing)).toContain('period-locked');
    // The decision stays Approved and unused: nothing of the PT is posted and it has no number (9.8 step 4).
    expect(review.request?.state).toBe('Approved');
    expect(review.number).toBeNull();
  }, 900_000);
});
