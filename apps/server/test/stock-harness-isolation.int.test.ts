import type { CostPoolMode } from '@apparel-os/schemas';
import { sql } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { custody, value } from '../src/modules/stock/ledger/index.js';
import { invariantsHold, rebuilds, trialBalance } from './harness/stock/checks.js';
import { StockHarness } from './harness/stock/harness.js';
import { ScenarioRun } from './harness/stock/scenario.js';
import { grantSynthetic } from './support/grants.js';
import { connect } from './support/postgres.js';

// S1-F10-T07: who sees and who may post what, on the stock harness (S1-F10 spec 3.6 "Isolation"; stock-ledger 14.1,
// 14.3; books-and-posting 15 test 18; code-house-rules 6.2; PRD-SEC-005). A seller scoped to one Store posts a sale
// whose cost pool lies outside what the seller may read (a whole-book pool, or a Site pool, SL-25 (c) and (e)), and
// still reads no pool, no valuation and no other place's stock. Every value is SYNTHETIC.

const worlds: StockHarness[] = [];

afterAll(async () => {
  for (const world of worlds) await world.stop();
});

/** A world with pieces costed and sellable at S1 and at W1, under moving average and the pool mode given. */
async function stocked(poolMode: CostPoolMode) {
  const harness = new StockHarness();
  worlds.push(harness);
  await harness.start('isolation');
  const fixtures = await harness.fixtures('moving-average', poolMode);
  const run = new ScenarioRun(harness, fixtures, true);
  for (const [receipt, at] of [
    ['R0', 'W1'],
    ['R1', 'S1'],
  ] as const) {
    await run.done({ command: 'receipt', receipt, at, pieces: 3 });
    await run.done({ command: 'receipt-acceptance', receipt });
    await run.done({ command: 'pt-coverage', receipt });
    await run.done({ command: 'pt-approval', receipt, pRatePaise: 10_000 });
  }
  return { harness, fixtures, run };
}

/** Rows of a stock table the actor's transaction can see, after row-level security. */
async function visible(harness: StockHarness, actorId: string, table: string): Promise<number> {
  return harness.run(actorId, async (context) => {
    const rows = await context.tx.execute<{ n: number }>(sql`select count(*)::integer as n from ${sql.raw(table)}`);
    return rows.rows[0]?.n ?? 0;
  });
}

describe('a Store-scoped seller posts against a pool it cannot read (code-house-rules 6.2; stock-ledger 14.3)', () => {
  it.each(['book', 'site'] as const)(
    'PRD-SEC-005 a seller scoped to S1 sells at S1 under a %s pool, and still reads no pool, valuation or W1 stock',
    async (poolMode) => {
      const { harness, fixtures, run } = await stocked(poolMode);
      const storeId = await harness.storeOf(fixtures.s1.businessUnitId);
      if (storeId === null) throw new Error('S1 has a Store');
      const seller = await harness.scopedPoster('S1-SELLER', [{ type: 'store', id: storeId }]);

      const sold = await run.done({ command: 'sale', sale: 'B1', at: 'S1', pieces: 'R1:0' }, seller);
      expect(sold.written.movementIds).toHaveLength(1);

      // What the seller reads afterwards: S1's stock only; no pool, layer, valuation or W1 balance (SL-25 (c), (e)).
      for (const table of ['stock.cost_pool', 'stock.valuation', 'stock.valuation_layer']) {
        expect(await visible(harness, seller.user.id, table), table).toBe(0);
      }
      const held = await harness.run(seller.user.id, (c) => value(c, { bookId: fixtures.bookId }));
      expect(held.pools).toEqual([]);
      const seen = await harness.run(seller.user.id, (c) => custody(c, { skuId: fixtures.sku.skuId }));
      expect(new Set(seen.rows.map((row) => row.siteId))).toEqual(new Set([fixtures.s1.siteId]));

      // A sale at W1, outside the seller's scope, is refused and commits nothing: W1's rows are hidden from the seller
      // at steps 2 to 5, so no pool is admitted (14.3 "Pool admission").
      const before = await harness.run(harness.preparer.user.id, (c) => value(c, { bookId: fixtures.bookId }));
      const outside = await run.do({ command: 'sale', sale: 'B2', at: 'W1', pieces: 'R0:0' }, seller);
      expect(outside).toMatchObject({ kind: 'refused', refusal: { code: 'stock.invalid-item' } });
      expect(await harness.run(harness.preparer.user.id, (c) => value(c, { bookId: fixtures.bookId }))).toMatchObject({
        pools: before.pools,
      });

      // The sale took its value from the pool, as anyone's would (7.3): 2 of S1's pieces and, in a book pool, W1's 3
      // left at 100.00 each; the books agree with the ledger.
      const all = await harness.run(harness.preparer.user.id, (c) => value(c, { bookId: fixtures.bookId }));
      const left = all.pools.reduce((sum, pool) => sum + pool.valuePaise, 0);
      expect(left).toBe(5 * 10_000);
      expect((await trialBalance(harness, fixtures)).COGS).toBe(10_000);
      await rebuilds(harness, harness.preparer.user.id);
      await invariantsHold(harness.database);
    },
    600_000,
  );
});

describe('reading the books of stock postings by scope and Organisation (books-and-posting 15 test 18; S1-F10 spec 3.6)', () => {
  it('PRD-SEC-005 PRD-PRF-004 books-and-posting 15 test 18 a reader scoped to S1 sees only S1’s lines, and the trial balance says it is partial', async () => {
    const { harness, fixtures, run } = await stocked('book');
    await run.done({ command: 'sale', sale: 'B1', at: 'S1', pieces: 'R1:0' });
    const storeId = await harness.storeOf(fixtures.s1.businessUnitId);
    if (storeId === null) throw new Error('S1 has a Store');
    const reader = await harness.scopedPoster('S1-READER', [{ type: 'store', id: storeId }]);
    await grantSynthetic(
      harness.database,
      { kind: 'user', id: reader.user.id },
      [{ recordType: 'finance.journal', action: 'view' }],
      {
        scope: {
          kind: 'dimensions',
          legalEntity: { kind: 'all' },
          place: { kind: 'selected', members: [{ type: 'store', id: storeId }] },
          brand: { kind: 'all' },
        },
      },
    );

    const closing = async (actorId: string) => {
      const balance = await harness.run(actorId, (c) =>
        harness.setup.books.trialBalance(c, fixtures.bookId, fixtures.periodId),
      );
      if (balance === undefined) throw new Error('no trial balance');
      const of = (account: 'INV' | 'PUR' | 'COGS') =>
        balance.rows.find((row) => row.accountId === fixtures.accounts[account])?.closingPaise ?? 0;
      return { partial: balance.partial, INV: of('INV'), PUR: of('PUR'), COGS: of('COGS') };
    };
    // The whole book: R0 at W1 and R1 at S1, 3 pieces each at 100.00, and one piece of R1 sold (written by hand).
    expect(await closing(harness.setup.preparer.id)).toEqual({
      partial: false,
      INV: 50_000,
      PUR: -60_000,
      COGS: 10_000,
    });
    // S1's lines only: R1's cost established at its receiving place and the sale at S1; W1's R0 is hidden.
    expect(await closing(reader.user.id)).toEqual({ partial: true, INV: 20_000, PUR: -30_000, COGS: 10_000 });
  }, 600_000);

  it('PRD-ORG-002 PRD-MOD-001 the second Organisation’s database holds none of the first’s stock or journals', async () => {
    const { harness } = await stocked('book');
    const count = async (database: string) => {
      const owner = await connect(database, 'migration');
      try {
        const rows = await owner.query<{ movements: number; journals: number; pools: number }>(
          `select (select count(*) from stock.movement)::integer as movements,
                  (select count(*) from finance.journal)::integer as journals,
                  (select count(*) from stock.cost_pool)::integer as pools`,
        );
        return rows.rows[0];
      } finally {
        await owner.end();
      }
    };
    const [first, second] = harness.world.organisations;
    const ours = await count(first.database);
    expect(ours?.pools).toBe(1);
    expect(ours?.movements).toBeGreaterThan(0);
    expect(ours?.journals).toBeGreaterThan(0);
    expect(await count(second.database)).toEqual({ movements: 0, journals: 0, pools: 0 });
  }, 600_000);
});
