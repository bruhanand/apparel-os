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
