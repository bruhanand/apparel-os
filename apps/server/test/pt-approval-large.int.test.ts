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

// S2-F06-T01 and code review 7: a large PT's approval posted through the queued job, by the worker as the application
// composes it (goods-in 6.3, 6.6, 12 test 21; module-map 6.2 flow E; stock-ledger 10.6; access-and-approvals 9.8;
// books-and-posting 10; PRD-PRF-001, PRD-INT-004; DEC-097). The application queues a PT of more than
// PT_POSTED_WITH_DECISION_ROWS rows, a technical cap, and its worker (worker.module.ts) posts it, one at a time per
// book, under the service identity the worker's registry gives it. The approval click records the decision and a
// request to post; the job posts the whole PT in one transaction and uses the decision; a refused job posts nothing,
// leaves the decision unused, shows the PT Failed and raises the unfinished operation; posted again once the period
// is reopened for it, it posts once. Every person, place, list, product, account, amount and number is SYNTHETIC; the
// times measured are a development laptop's, against a test container.

let w: PtApprovalWorld;
let worker: PtPostingWorker | undefined;

beforeAll(async () => {
  // The application's own composition: no posting queue given, so it queues as `app.module.ts` does.
  w = await ptApprovalWorld('PTL');
  // The consumer registers when the worker starts and is handed the events recorded from then on (code-house-rules
  // 12.8 "Consumers"), so the worker runs before any approval is clicked.
  worker = await startPtPostingWorker(w);
}, 900_000);

afterAll(async () => {
  await worker?.stop();
  await (w as PtApprovalWorld | undefined)?.close();
});

/** The code of a refused call's error envelope (code-house-rules 12.3). */
const codeOf = (call: { body: Record<string, unknown> }) => (call.body as { error?: { code: string } }).error?.code;

/** Waits, at most the time given, until the GRN's newest PT revision is in a state other than Posting. */
async function settled(grnId: string, withinMs: number): Promise<GrnPtRead> {
  const until = Date.now() + withinMs;
  for (;;) {
    const read = await w.grnPt(grnId);
    if (read.pt?.revisions[0]?.state !== 'Posting' || Date.now() > until) return read;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
}

/** Waits, at most the time given, until an exception is raised on the record. */
async function raisedOn(recordId: string, withinMs: number) {
  const until = Date.now() + withinMs;
  for (;;) {
    const raised = await w.exceptionsOn([recordId]);
    if (raised.length > 0 || Date.now() > until) return raised;
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

/** The stock value debited since the balance before (books-and-posting 16.1: the SYNTHETIC account INV). */
function inventoryDebited(before: Awaited<ReturnType<typeof trialBalance>>, after: typeof before): number {
  const debit = (balance: typeof before) =>
    balance.rows.find((row) => row.accountId === w.accounts.INV)?.debitPaise ?? 0;
  return debit(after) - debit(before);
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

describe('a large PT posted by the worker the application composes (goods-in 6.6; 12 test 21)', () => {
  it('PRD-PRF-001 DEC-097 a 10,000-line PT approval records a request to post, then the worker posts it whole', async () => {
    // SYNTHETIC: 100 styles of two sizes, 50 pieces each, one piece a row: 10,000 rows, 200 new products.
    const { grnId, rows, revisionId, requestId } = await largePt('PTL-BIG', 100);
    expect(rows).toHaveLength(10_000);
    expect(rows.length).toBeGreaterThan(PT_POSTED_WITH_DECISION_ROWS);
    const before = await trialBalance();
    const clicked = performance.now();
    const approved = await w.decide(w.people.ptApprover, requestId, revisionId);
    const clickMs = performance.now() - clicked;
    expect(approved.status, JSON.stringify(approved.body)).toBe(200);
    // The click has no stock or money effect: the PT shows Posting until its job posts it (stock-ledger 10.6).
    const read = await settled(grnId, 600_000);
    const postedMs = performance.now() - clicked;
    expect(read.pt?.revisions[0]?.state).toBe('Official');
    expect(read.pt?.revisions[0]?.number).toMatch(/^SYN-PT-\d{5}$/);
    // SYNTHETIC hand-worked: 10,000 pieces at P RATE 945.00 = 9,450,000.00 into stock value.
    expect(inventoryDebited(before, await trialBalance())).toBe(945_000_000);
    process.stdout.write(
      `PRD-PRF-001 SYNTHETIC 10,000-line PT approval: click ${String(Math.round(clickMs))} ms, ` +
        `posted by the job ${String(Math.round(postedMs))} ms after the click\n`,
    );
  }, 900_000);

  it('PRD-INT-004 PRD-EXC-001 DEC-097 a refused job posts nothing and raises the unfinished operation; posted again once the period is reopened for it, it posts once', async () => {
    // SYNTHETIC: 11 styles of two sizes, 50 pieces each: 1,100 rows, above the cap; the period it posts into locked,
    // which the click does not ask, since it posts nothing (books-and-posting 10).
    const { grnId, revisionId, requestId } = await largePt('PTL-FAIL', 11);
    await w.lockPeriod();
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
    // The unfinished operation, raised in a step of its own by the failure's consumer, to whoever its routing names
    // (books-and-posting 10 step 3; SYNTHETIC routing, V-03), linking the revision and saying why.
    const [raised, ...more] = await raisedOn(revisionId, 120_000);
    expect(more).toEqual([]);
    expect(raised).toMatchObject({
      type: 'merchandise.pt-posting-refused',
      state: 'Unresolved',
      ownerUserId: w.people.ptApprover.user.id,
      recordId: review.ptId,
      versionId: revisionId,
    });
    expect(raised?.raisingEvent).toMatch(/^merchandise\.pt-posting-failed:/);
    expect(raised?.comment).toContain('stock.posting-refused');
    // Not finished while the PT is not posted: closing it is refused, naming the revision (access-and-approvals 12.3).
    const early = await w.post(w.people.ptApprover, `/api/exceptions/exceptions/${raised?.id ?? ''}/close`, {});
    expect(early.status, JSON.stringify(early.body)).toBe(422);
    // Accounts reopen the period for the PT, a different person approving (books-and-posting 4.3); then whoever may
    // approve PTs there posts it again, with the same decision (access-and-approvals 9.8 step 5).
    await w.reopenFor(revisionId);
    const before = await trialBalance();
    const again = await w.post(w.people.secondApprover, `/api/merchandise/pt/revisions/${revisionId}/post-again`, {});
    expect(again.status, JSON.stringify(again.body)).toBe(200);
    // Posting or posted, it is not Failed, so a second Post again is refused (goods-in 6.6).
    const twice = await w.post(w.people.secondApprover, `/api/merchandise/pt/revisions/${revisionId}/post-again`, {});
    expect(twice.status, JSON.stringify(twice.body)).toBe(422);
    expect(codeOf(twice)).toBe('merchandise.pt-not-failed');
    const posted = await settled(grnId, 300_000);
    expect(posted.pt?.revisions[0]?.state, JSON.stringify((await w.revision(revisionId)).failure)).toBe('Official');
    // SYNTHETIC hand-worked: 1,100 pieces at P RATE 945.00 = 1,039,500.00, posted once.
    expect(inventoryDebited(before, await trialBalance())).toBe(103_950_000);
    const official = await w.revision(revisionId);
    expect(official.failure).toBeUndefined();
    expect(official.number).toMatch(/^SYN-PT-\d{5}$/);
    // Posted, the PT is no longer Failed: posting it again is refused.
    const after = await w.post(w.people.secondApprover, `/api/merchandise/pt/revisions/${revisionId}/post-again`, {});
    expect(after.status).toBe(422);
    expect(codeOf(after)).toBe('merchandise.pt-not-failed');
    // The operation is finished: its owner closes the exception (12.3).
    const closed = await w.post(w.people.ptApprover, `/api/exceptions/exceptions/${raised?.id ?? ''}/close`, {});
    expect(closed.status, JSON.stringify(closed.body)).toBe(200);
  }, 900_000);
});
