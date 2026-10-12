import { paise } from '@apparel-os/domain';
import { afterAll, describe, expect, it } from 'vitest';
import { asVerifier, invariantsHold, rebuilds, trialBalance } from './harness/stock/checks.js';
import { holdStep } from './harness/stock/concurrency.js';
import { StockHarness, type StepSent } from './harness/stock/harness.js';
import { ScenarioRun } from './harness/stock/scenario.js';
import { gate, waitUntilAnyWaitingForLock } from './support/transactions.js';

// S1-F10-T07: the injected failures of S1-F10 spec 3.6 on the stock harness, under the locks (stock-ledger 10.4,
// 13.1; books-and-posting 4.5, 10, 15 tests 8 and 9; access-and-approvals 9.6, 9.7; DEC-097, DEC-105). A missing map
// refused at Plan, with its exception, replay and post after the map is approved, is scenario P4 (books-and-posting
// 16.4); a queued posting refused at commit is in stock-posting-job.int.test.ts. Concurrent steps run on separate
// connections, ordered by what PostgreSQL reports (code-house-rules 10.3). Every value is SYNTHETIC.

const worlds: StockHarness[] = [];

afterAll(async () => {
  for (const world of worlds) await world.stop();
});

async function stocked() {
  const harness = new StockHarness();
  worlds.push(harness);
  await harness.start('failures');
  const fixtures = await harness.fixtures('moving-average', 'book');
  const run = new ScenarioRun(harness, fixtures, true);
  await run.done({ command: 'receipt', receipt: 'R1', at: 'S1', pieces: 3 });
  await run.done({ command: 'receipt-acceptance', receipt: 'R1' });
  await run.done({ command: 'pt-coverage', receipt: 'R1' });
  await run.done({ command: 'pt-approval', receipt: 'R1', pRatePaise: 10_000 });
  return { harness, fixtures, run };
}

/** What the read-only role counts (H6): movements, journals of the book, and uses of a decision. */
async function counts(harness: StockHarness, bookId: string, decisionId?: string) {
  return asVerifier(harness.database, async (client) => {
    const rows = await client.query<{ movements: number; journals: number; uses: number }>(
      `select (select count(*) from stock.movement)::integer as movements,
              (select count(*) from finance.journal where book_id = $1)::integer as journals,
              (select count(*) from access.approval_use where approval_decision_id = $2)::integer as uses`,
      [bookId, decisionId ?? '00000000-0000-7000-8000-000000000000'],
    );
    return rows.rows[0];
  });
}

function refusalOf(sent: StepSent | undefined) {
  return sent?.kind === 'refused' ? sent.refusal : undefined;
}

describe('a period locked against stock postings (books-and-posting 4.5; 15 test 9; PRD-LED-009, PRD-INT-003)', () => {
  it('PRD-LED-009 PRD-INT-003 books-and-posting 15 test 9 a lock waits for a sale in flight in its period; a sale after the lock is refused', async () => {
    const { harness, fixtures, run } = await stocked();
    // The sale holds the period row in shared mode from step 7 until it commits (10.3).
    const sale = await holdStep(run, await run.prepared({ command: 'sale', sale: 'B1', at: 'S1', pieces: 'R1:0' }));
    let locked = false;
    const locking = harness.lockPeriod(fixtures.periodId).then(() => {
      locked = true;
    });
    await waitUntilAnyWaitingForLock(harness.database, [sale.pid]);
    expect(locked).toBe(false);
    expect((await sale.release()).kind).toBe('written');
    await locking;
    expect(await harness.periodStates(fixtures.bookId)).toEqual(['Locked']);
    const after = await run.do({ command: 'sale', sale: 'B2', at: 'S1', pieces: 'R1:1' });
    expect(refusalOf(after)?.code).toBe('stock.posting-refused');
    expect(JSON.stringify(refusalOf(after))).toContain('finance.period-locked');
    expect((await trialBalance(harness, fixtures)).COGS).toBe(10_000);
    await rebuilds(harness, harness.preparer.user.id);
    await invariantsHold(harness.database);
  }, 600_000);

  it('PRD-INT-003 PRD-INT-004 a period locked after Plan refuses the sale under the locks, and nothing commits', async () => {
    const { harness, fixtures, run } = await stocked();
    const before = await counts(harness, fixtures.bookId);
    const planned = gate();
    const goOn = gate();
    const sending = run.send(await run.prepared({ command: 'sale', sale: 'B1', at: 'S1', pieces: 'R1:0' }), {
      afterPlan: async () => {
        planned.open();
        await goOn.wait;
      },
    });
    // Check postable at Plan found the period Open; it is locked before the sale takes it at step 7 (4.5).
    await planned.wait;
    await harness.lockPeriod(fixtures.periodId);
    goOn.open();
    const sent = await sending;
    expect(refusalOf(sent)?.code).toBe('stock.posting-refused');
    expect(JSON.stringify(refusalOf(sent))).toContain('finance.period-locked');
    expect(await counts(harness, fixtures.bookId)).toEqual(before);
    await rebuilds(harness, harness.preparer.user.id);
    await invariantsHold(harness.database);
  }, 600_000);
});

describe('a map made invalid between Plan and the locks (books-and-posting 6.2, 10 step 2; 15 test 8)', () => {
  it('POL-09.12 PRD-INT-004 an account retired by a same-day version after Plan refuses the sale under the locks, and nothing commits', async () => {
    const { harness, fixtures, run } = await stocked();
    // A day on, so a version of the account can start on the sale's own date (no version starts in the past, 6.3).
    harness.advanceDays(1);
    const before = await counts(harness, fixtures.bookId);
    const planned = gate();
    const goOn = gate();
    const sending = run.send(await run.prepared({ command: 'sale', sale: 'B1', at: 'S1', pieces: 'R1:0' }), {
      afterPlan: async () => {
        planned.open();
        await goOn.wait;
      },
    });
    // Check postable at Plan found the sale's map valid; then COGS, an account on its lines, is retired from today
    // (6.2 condition 3), so the map is no longer valid when Post checks again under the locks (10 step 2).
    await planned.wait;
    await harness.retireAccount(fixtures.accounts.COGS);
    goOn.open();
    const sent = await sending;
    expect(refusalOf(sent)?.code).toBe('stock.posting-refused');
    expect(JSON.stringify(refusalOf(sent))).toContain('finance.map-account-not-in-force');
    expect(await counts(harness, fixtures.bookId)).toEqual(before);
    await rebuilds(harness, harness.preparer.user.id);
    await invariantsHold(harness.database);
  }, 600_000);
});

describe('a receipt origin that appears between Plan and the locks (stock-ledger 13.1 "Plan staleness", 13.8)', () => {
  it('stock-ledger 13.8 code-house-rules 12.3 a sale refused as plan-stale answers a refusal the till submits again under a new key, and the new key posts', async () => {
    const harness = new StockHarness();
    worlds.push(harness);
    await harness.start('failures');
    const fixtures = await harness.fixtures('moving-average', 'book', { pieceTracked: false });
    const run = new ScenarioRun(harness, fixtures, false);
    await run.done({ command: 'receipt', receipt: 'R1', at: 'S1', quantity: 3 });
    await run.done({ command: 'receipt-acceptance', receipt: 'R1' });
    await run.done({ command: 'pt-coverage', receipt: 'R1' });
    await run.done({ command: 'pt-approval', receipt: 'R1', pRatePaise: 10_000 });
    const before = await counts(harness, fixtures.bookId);
    const planned = gate();
    const goOn = gate();
    // The sale names no origin, so Plan names every origin of the SKU with stock at S1 (13.1).
    const pending = await run.prepared({ command: 'sale', sale: 'B1', at: 'S1', quantity: 1 });
    const sending = run.send(pending, {
      afterPlan: async () => {
        planned.open();
        await goOn.wait;
      },
    });
    await planned.wait;
    // A new origin of the same SKU at S1 commits between the sale's Plan and its locks.
    await run.done({ command: 'receipt', receipt: 'R2', at: 'S1', quantity: 2 });
    const movementsBefore = (await counts(harness, fixtures.bookId))?.movements;
    goOn.open();
    const sent = await sending;
    // A refusal the till may submit again, not a defect (code-house-rules 12.3: `refused`, kept under its key).
    expect(refusalOf(sent)).toMatchObject({ kind: 'refused', code: 'stock.plan-stale' });
    expect((await counts(harness, fixtures.bookId))?.movements).toBe(movementsBefore);
    if (sent.kind !== 'refused') throw new Error('not refused');
    expect(await sent.replay()).toMatchObject({
      kind: 'refusal',
      replayed: true,
      refusal: { code: 'stock.plan-stale' },
    });
    // Submitted again under a new key, the sale finds every origin locked and posts.
    expect((await run.send(pending)).kind).toBe('written');
    expect((await counts(harness, fixtures.bookId))?.journals).toBeGreaterThan(before?.journals ?? 0);
    await rebuilds(harness, harness.preparer.user.id);
    await invariantsHold(harness.database);
  }, 600_000);
});

describe('a document changed after its approval (access-and-approvals 9.6, 9.7; PRD-ACS-007; stock-ledger 11.9)', () => {
  it('PRD-ACS-007 DEC-097 posting a version the decision did not approve is refused, nothing commits and the decision stays unused', async () => {
    const harness = new StockHarness();
    worlds.push(harness);
    await harness.start('failures');
    const fixtures = await harness.fixtures('moving-average', 'book');
    const run = new ScenarioRun(harness, fixtures, true);
    await run.done({ command: 'receipt', receipt: 'R1', at: 'W1', pieces: 2 });
    await run.done({ command: 'receipt-acceptance', receipt: 'R1' });
    await run.done({ command: 'pt-coverage', receipt: 'R1' });
    // The PT approval is decided on version 1; then the PT document changes (15.2).
    const pending = await run.prepared({ command: 'pt-approval', receipt: 'R1', pRatePaise: 10_000 });
    const decisionId = pending.approval?.decisionId ?? '';
    await harness.change(pending.document);
    const before = await counts(harness, fixtures.bookId, decisionId);
    const sent = await run.send(pending);
    expect(refusalOf(sent)?.code).toBe('access.approval-version-changed');
    expect(await counts(harness, fixtures.bookId, decisionId)).toEqual(before);
    expect(before?.uses).toBe(0);
    // The changed version, approved again by a different person, posts once (PRD-ACS-006).
    const again = await harness.approveDocument(pending.document, pending.approval?.actionType ?? '', {
      kind: 'known',
      amountPaise: paise(20_000),
    });
    const posted = await run.send({
      ...pending,
      approval: { decisionId: again, actionType: pending.approval?.actionType ?? '' },
    });
    expect(posted.kind).toBe('written');
    expect((await counts(harness, fixtures.bookId, again))?.uses).toBe(1);
    expect((await counts(harness, fixtures.bookId, decisionId))?.uses).toBe(0);
    expect((await trialBalance(harness, fixtures)).INV).toBe(20_000);
    await rebuilds(harness, harness.preparer.user.id);
    await invariantsHold(harness.database);
  }, 600_000);
});

describe('a transfer valued for its approval at its pool’s cost (stock-ledger 13.10 "Value for approval"; product owner, 11 Oct 2026)', () => {
  it('PRD-ACS-015 PRD-ACS-016 an approver’s cost limit routes a transfer; one approved on an Unknown value is refused under the lock', async () => {
    const harness = new StockHarness();
    worlds.push(harness);
    await harness.start('failures');
    const fixtures = await harness.fixtures('moving-average', 'book');
    const run = new ScenarioRun(harness, fixtures, true);
    // SYNTHETIC: two receipts of a piece at ₹60,000.00, each within the checker's SYNTHETIC limit of ₹1,00,000.00,
    // the two together above it.
    for (const receipt of ['R1', 'R2']) {
      await run.done({ command: 'receipt', receipt, at: 'W1', pieces: 1 });
      await run.done({ command: 'receipt-acceptance', receipt });
      await run.done({ command: 'pt-coverage', receipt });
      await run.done({ command: 'pt-approval', receipt, pRatePaise: 6_000_000 });
    }
    const transfer = (name: string, pieces: string, approvedPaise: number | null) =>
      run.prepared({ command: 'transfer-approval', transfer: name, from: 'W1', to: 'S1', pieces, approvedPaise });
    // Above the checker's limit the checker cannot decide it: it is for an approver whose limit covers it.
    await expect(transfer('T1', 'R1:0,R2:0', 12_000_000)).rejects.toThrow(/access\.above-approval-limit/);
    // Approved on an Unknown value, it is refused under the lock, since the ledger values it at ₹60,000.00 (DEC-066).
    const unknown = await transfer('T2', 'R1:0', null);
    const refused = await run.send(unknown);
    expect(refusalOf(refused)?.code).toMatch(/^access\./);
    // Within the limit, on the pool's cost of the piece, it is written once.
    const within = await transfer('T3', 'R1:0', 6_000_000);
    expect((await run.send(within)).kind).toBe('written');
    await rebuilds(harness, harness.preparer.user.id);
    await invariantsHold(harness.database);
  }, 600_000);
});
