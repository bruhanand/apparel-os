import type { CostFormula, CostPoolMode } from '@apparel-os/schemas';
import { afterAll, describe, expect, it } from 'vitest';
import { asVerifier, invariantsHold, rebuilds, trialBalance } from './harness/stock/checks.js';
import { holdStep, sendBehind } from './harness/stock/concurrency.js';
import { StockHarness, type StepSent } from './harness/stock/harness.js';
import { ScenarioRun, type PlaceName } from './harness/stock/scenario.js';

// S1-F10-T07: the concurrency cases of stock-ledger 11.9 on the stock harness (S1-F10 spec 3.6; PRD-INT-002 to
// PRD-INT-005, PRD-SEC-016, PRD-ACP-018). Each pair of steps runs on two connections; the test keeps the first under
// its locks, sends the second, waits until PostgreSQL shows the second waiting for a lock, then lets the first go on
// (code-house-rules 10.3). The large posting against counter sales is in stock-posting-job.int.test.ts. Every value is
// SYNTHETIC; every expected value is written by hand.

const worlds: StockHarness[] = [];

afterAll(async () => {
  for (const world of worlds) await world.stop();
});

interface Stocked {
  readonly harness: StockHarness;
  readonly run: ScenarioRun;
}

/** A world under the combination given, with receipts costed and sellable where named. */
async function stocked(
  formula: CostFormula,
  poolMode: CostPoolMode,
  receipts: readonly { receipt: string; at: PlaceName; count: number; pRatePaise: number }[],
  options: { pieceTracked?: boolean; secondStore?: boolean } = {},
): Promise<Stocked> {
  const harness = new StockHarness();
  worlds.push(harness);
  await harness.start('concurrency');
  const pieceTracked = options.pieceTracked ?? true;
  const fixtures = await harness.fixtures(formula, poolMode, {
    pieceTracked,
    ...(options.secondStore === true ? { secondStore: true } : {}),
  });
  const run = new ScenarioRun(harness, fixtures, pieceTracked);
  for (const { receipt, at, count, pRatePaise } of receipts) {
    await run.done(
      pieceTracked
        ? { command: 'receipt', receipt, at, pieces: count }
        : { command: 'receipt', receipt, at, quantity: count },
    );
    await run.done({ command: 'receipt-acceptance', receipt });
    await run.done({ command: 'pt-coverage', receipt });
    await run.done({ command: 'pt-approval', receipt, pRatePaise });
  }
  return { harness, run };
}

function written(sent: StepSent): StepSent & { kind: 'written' } {
  if (sent.kind !== 'written') throw new Error(`not written: ${JSON.stringify(sent)}`);
  return sent;
}

/** The cost of goods sold a sale's movement posted, as the read-only role reads its posting-source rows (H6). */
async function costOf(harness: StockHarness, movementId: string): Promise<number> {
  return asVerifier(harness.database, async (client) => {
    const rows = await client.query<{ amount: string }>(
      `select coalesce(sum(amount_paise), 0)::text as amount from finance.posting_source where item_key = $1`,
      [movementId],
    );
    return Number(rows.rows[0]?.amount ?? 0);
  });
}

async function checksHold({ harness }: Stocked): Promise<void> {
  await rebuilds(harness, harness.preparer.user.id);
  await invariantsHold(harness.database);
}

describe('stock-ledger 11.9 concurrency on separate connections (code-house-rules 10.3)', () => {
  it('PRD-INT-005 two tills sell the last piece at once: one succeeds, the other is refused under the lock', async () => {
    const world = await stocked('moving-average', 'book', [{ receipt: 'R1', at: 'S1', count: 1, pRatePaise: 10_000 }]);
    const { run } = world;
    const first = await holdStep(run, await run.prepared({ command: 'sale', sale: 'B1', at: 'S1', pieces: 'R1:0' }));
    const second = await sendBehind(
      run,
      first,
      await run.prepared({ command: 'sale', sale: 'B2', at: 'S1', pieces: 'R1:0' }),
    );
    written(await first.release());
    expect(await second.sent).toMatchObject({ kind: 'refused', refusal: { code: 'stock.piece-not-at-place' } });
    expect((await trialBalance(world.harness, run.fixtures)).COGS).toBe(10_000);
    await checksHold(world);
  }, 600_000);

  it('PRD-INT-005 two transfer approvals reserve the same piece: one succeeds, the other is refused', async () => {
    const world = await stocked('moving-average', 'book', [{ receipt: 'R1', at: 'W1', count: 1, pRatePaise: 10_000 }]);
    const { run } = world;
    const transfer = (name: string) =>
      run.prepared({
        command: 'transfer-approval',
        transfer: name,
        from: 'W1',
        to: 'S1',
        pieces: 'R1:0',
        approvedPaise: 10_000,
      });
    const first = await holdStep(run, await transfer('T1'));
    const second = await sendBehind(run, first, await transfer('T2'));
    written(await first.release());
    expect(await second.sent).toMatchObject({ kind: 'refused', refusal: { code: 'stock.reservation-overlap' } });
    await checksHold(world);
  }, 600_000);

  it('PRD-INT-002 the same request sent twice at once has one effect and one answer; the same key with changed content is refused and kept', async () => {
    const world = await stocked('moving-average', 'book', [{ receipt: 'R1', at: 'S1', count: 2, pRatePaise: 10_000 }]);
    const { harness, run } = world;
    const pending = await run.prepared({ command: 'sale', sale: 'B1', at: 'S1', pieces: 'R1:0' });
    const { uuidv7 } = await import('@apparel-os/domain');
    const key = uuidv7();
    // The second waits on the first's key row (code-house-rules 12.4), then answers the first's result.
    const first = await holdStep(run, pending, { key });
    const second = await sendBehind(run, first, pending, { key });
    const one = await first.release();
    const two = await second.sent;
    const movements = written(one).written.movementIds;
    expect(movements).toHaveLength(1);
    expect(two).toMatchObject({ kind: 'replayed', answer: { movementIds: movements } });
    expect(await costOf(harness, movements[0] ?? '')).toBe(10_000);
    expect((await trialBalance(harness, run.fixtures)).COGS).toBe(10_000);
    // Changed content under the same key: refused, and the request kept for investigation (stock-ledger 10.1).
    const other = await run.prepared({ command: 'sale', sale: 'B2', at: 'S1', pieces: 'R1:1' });
    await expect(
      harness.send(pending.document, pending.name, pending.transition, other.items, pending.approval, { key }),
    ).rejects.toMatchObject({ code: 'kernel.idempotency-key-reused' });
    const kept = await asVerifier(harness.database, async (client) => {
      const rows = await client.query<{ n: number }>(
        `select count(*)::integer as n from kernel.idempotency_conflict where reason = 'content-changed'`,
      );
      return rows.rows[0]?.n;
    });
    expect(kept).toBe(1);
    expect((await trialBalance(harness, run.fixtures)).COGS).toBe(10_000);
    await checksHold(world);
  }, 600_000);

  it('PRD-INT-003 sales of one SKU at two Stores under a book pool: values follow posting order, with no deadlock', async () => {
    // FIFO, quantity-tracked, one book pool: R1's unit at 100.00 entered first, R2's at 200.00 after it (7.4).
    const world = await stocked(
      'fifo',
      'book',
      [
        { receipt: 'R1', at: 'S1', count: 1, pRatePaise: 10_000 },
        { receipt: 'R2', at: 'S2', count: 1, pRatePaise: 20_000 },
      ],
      { pieceTracked: false, secondStore: true },
    );
    const { harness, run } = world;
    // S2 posts first and takes the oldest layer, R1's, though its own goods are R2's; S1 waits on the pool, then
    // takes what is left: the value follows posting order, not the place (7.10).
    const atS2 = await holdStep(run, await run.prepared({ command: 'sale', sale: 'B2', at: 'S2', quantity: 1 }));
    const atS1 = await sendBehind(
      run,
      atS2,
      await run.prepared({ command: 'sale', sale: 'B1', at: 'S1', quantity: 1 }),
    );
    const s2 = written(await atS2.release());
    const s1 = written(await atS1.sent);
    expect(await costOf(harness, s2.written.movementIds[0] ?? '')).toBe(10_000);
    expect(await costOf(harness, s1.written.movementIds[0] ?? '')).toBe(20_000);
    expect((await trialBalance(harness, run.fixtures)).COGS).toBe(30_000);
    await checksHold(world);
  }, 600_000);

  it('PRD-STK-009 a count freeze starts while a sale is on its way: the sale is refused under the lock', async () => {
    const world = await stocked('moving-average', 'book', [{ receipt: 'R1', at: 'S1', count: 2, pRatePaise: 10_000 }]);
    const { run } = world;
    const freeze = await holdStep(
      run,
      await run.prepared({ command: 'count-freeze', count: 'C1', at: 'S1', locations: ['S1'] }),
    );
    // The sale waits on S1's unit anchor, which the freeze start holds exclusively (14.3).
    const sale = await sendBehind(
      run,
      freeze,
      await run.prepared({ command: 'sale', sale: 'B1', at: 'S1', pieces: 'R1:0' }),
    );
    written(await freeze.release());
    expect(await sale.sent).toMatchObject({ kind: 'refused', refusal: { code: 'stock.count-freeze-active' } });
    expect((await trialBalance(world.harness, run.fixtures)).COGS).toBe(0);
    await checksHold(world);
  }, 600_000);

  it('PRD-INT-003 two documents drawing on one journal series while touching the same stock, items in opposite orders, do not deadlock', async () => {
    const world = await stocked('moving-average', 'book', [{ receipt: 'R1', at: 'S1', count: 4, pRatePaise: 10_000 }]);
    const { harness, run } = world;
    // A second SKU, Y, costed and sellable at S1 in the same book (stock-ledger 10.3: rows in ascending order).
    const y = await harness.catalogueSku(true);
    const runY = new ScenarioRun(harness, { ...run.fixtures, sku: y }, true);
    await runY.done({ command: 'receipt', receipt: 'RY', at: 'S1', pieces: 4 });
    await runY.done({ command: 'receipt-acceptance', receipt: 'RY' });
    await runY.done({ command: 'pt-coverage', receipt: 'RY' });
    await runY.done({ command: 'pt-approval', receipt: 'RY', pRatePaise: 20_000 });
    const bill = async (name: string, x: string, yPieces: string, xFirst: boolean) => {
      const onX = await run.prepared({ command: 'sale', sale: name, at: 'S1', pieces: x });
      const onY = await runY.prepared({ command: 'sale', sale: name, at: 'S1', pieces: yPieces });
      return { ...onX, items: xFirst ? [...onX.items, ...onY.items] : [...onY.items, ...onX.items] };
    };
    const first = await holdStep(run, await bill('B1', 'R1:0', 'RY:0', true));
    const second = await sendBehind(run, first, await bill('B2', 'R1:1', 'RY:1', false));
    written(await first.release());
    written(await second.sent);
    expect((await trialBalance(harness, run.fixtures)).COGS).toBe(2 * (10_000 + 20_000));
    await checksHold(world);
  }, 600_000);
});
