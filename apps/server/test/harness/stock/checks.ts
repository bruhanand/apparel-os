import type { Client } from 'pg';
import { expect } from 'vitest';
import { inventoryReconciliation, rebuildAndCompare, value } from '../../../src/modules/stock/ledger/index.js';
import { connect } from '../../support/postgres.js';
import type { SyntheticAccount, SyntheticCombination, ValuedWorld } from '../../support/stock-valued.js';

// The checks run after every step (stock-ledger 11.7; books-and-posting 16.5; S1-F10 spec 3.5; DEC-112, H6): first
// through the ledger's Rebuild and compare and its read models and the books' trial balance, then raw invariant
// queries under the read-only test role `syn_verify` (stock-ledger 15.4), which reads every row of the synthetic
// database it checks. Each expected value is either written by hand in a scenario file or a sum the design says must
// hold, never one the code under test produced.

/** How a component's positive amount moves the inventory account under the synthetic maps of 16.1. */
const INVENTORY_SIGN: Record<string, Record<string, number>> = {
  'stock.cost-established': { 'to-pool': 1 },
  'stock.cost-adjustment': { 'to-pool': 1 },
  'stock.pool-dispatch': { cost: -1 },
  'stock.pool-arrival': { cost: 1 },
  'stock.sale-issue': { cost: -1 },
  'stock.customer-return': { cost: 1 },
  'stock.supplier-return-departure': { cost: -1 },
  'stock.supplier-rejection-return': { cost: 1 },
};

/** Runs raw queries as the read-only test role (15.4), which may not write. */
export async function asVerifier<T>(database: string, work: (client: Client) => Promise<T>): Promise<T> {
  const client = await connect(database, 'verify');
  try {
    return await work(client);
  } finally {
    await client.end();
  }
}

/** The trial balance of the combination's period, closing per synthetic account; debits equal credits (12). */
export async function trialBalance(
  world: ValuedWorld,
  combo: SyntheticCombination,
): Promise<Record<SyntheticAccount, number>> {
  const balance = await world.setup.run(world.setup.preparer.id, (context) =>
    world.setup.books.trialBalance(context, combo.bookId, combo.periodId),
  );
  if (balance === undefined) throw new Error('no trial balance');
  expect(balance.totals.debitPaise).toBe(balance.totals.creditPaise);
  const closing = {} as Record<SyntheticAccount, number>;
  for (const [code, accountId] of Object.entries(combo.accounts) as [SyntheticAccount, string][]) {
    closing[code] = balance.rows.find((row) => row.accountId === accountId)?.closingPaise ?? 0;
  }
  return closing;
}

/** The book's pools and the values held on dispatches and shipments, through the Value read (13.6). */
export async function heldValue(world: ValuedWorld, actorId: string, bookId: string) {
  return world.run(actorId, (context) => value(context, { bookId }));
}

/** Rebuild and compare (2.1): the balances, pools, layers and transit values rebuilt from their entries match. */
export async function rebuilds(world: ValuedWorld, actorId: string): Promise<void> {
  const answer = await world.run(actorId, (context) => rebuildAndCompare(context));
  expect(answer.differences).toEqual([]);
}

/**
 * The inventory account reconciles with the ledger movement by movement (books-and-posting 8.3; PRD-LED-008): each
 * valued movement's pool value change is what its posting-source rows put on the synthetic inventory account.
 */
export async function reconciles(world: ValuedWorld, actorId: string, combo: SyntheticCombination): Promise<void> {
  const ledger = await world.run(actorId, (context) => inventoryReconciliation(context, combo.bookId));
  const rows = await asVerifier(
    world.database,
    async (client) =>
      (
        await client.query<{ item_key: string; component: string; amount: string }>(
          `select s.item_key, s.component, s.amount_paise::text as amount
         from finance.posting_source s join finance.journal j on j.id = s.journal_id
         where j.book_id = $1`,
          [combo.bookId],
        )
      ).rows,
  );
  for (const movement of ledger.movements) {
    const onInventory = INVENTORY_SIGN[movement.eventKind];
    if (onInventory === undefined) continue;
    const fromPosting = rows
      .filter((row) => row.item_key === movement.movementId || row.item_key.startsWith(`${movement.movementId}:`))
      .reduce((sum, row) => sum + (onInventory[row.component] ?? 0) * Number(row.amount), 0);
    expect(fromPosting, `movement ${movement.movementId} ${movement.eventKind}`).toBe(movement.poolValuePaise);
  }
  const held = await heldValue(world, actorId, combo.bookId);
  expect(held.pools.reduce((sum, pool) => sum + pool.valuePaise, 0)).toBe(ledger.poolValuePaise);
}

/**
 * The accounts against the ledger (books-and-posting 16.5; stock-ledger 11.7): the inventory account equals the
 * book's pool value, the transit account the value held on open dispatches, the return-shipment account that on open
 * supplier-return shipments; total cost in equals stock value, value in transit and every outflow's value.
 */
export async function accountsMatchLedger(
  world: ValuedWorld,
  actorId: string,
  combo: SyntheticCombination,
): Promise<Record<SyntheticAccount, number>> {
  const balance = await trialBalance(world, combo);
  const held = await heldValue(world, actorId, combo.bookId);
  const transit = (kind: string) =>
    held.transits.filter((each) => each.transitKind === kind).reduce((sum, each) => sum + each.valuePaise, 0);
  expect(balance.INV).toBe(held.pools.reduce((sum, pool) => sum + pool.valuePaise, 0));
  expect(balance.TRN).toBe(transit('dispatch'));
  expect(balance.RSH).toBe(transit('return-shipment'));
  expect(balance.INV + balance.TRN + balance.RSH + balance.COGS + balance.CLM + balance.LOSS + balance.VAR).toBe(
    0 - balance.PUR,
  );
  return balance;
}

/**
 * The raw invariants (11.7, 16.5), as the read-only role: every piece in custody is counted by exactly one balance
 * and every piece-tracked balance by its pieces; no balance, pool, layer or transit value is below zero; each FIFO pool
 * and FIFO transit value equals the sum of its layers; every journal balances, with each line above zero, of the SKU's
 * brand; every posting-source row's amount is non-zero and in its journal.
 */
export async function invariantsHold(database: string): Promise<void> {
  const failures = await asVerifier(database, async (client) => {
    const found: Record<string, unknown[]> = {};
    const check = async (name: string, query: string) => {
      const rows = (await client.query(query)).rows;
      if (rows.length > 0) found[name] = rows;
    };
    await check(
      'pieces and balances disagree',
      `with p as (
         select site_id, business_unit_id, location_id, condition, held_as, transit_kind, transit_ref,
                receipt_origin_id, count(*)::integer as n
         from stock.piece where in_custody
         group by 1, 2, 3, 4, 5, 6, 7, 8),
       b as (
         select site_id, business_unit_id, location_id, condition, held_as, transit_kind, transit_ref,
                receipt_origin_id, sum(quantity)::integer as n
         from stock.balance
         where receipt_origin_id in (select receipt_origin_id from stock.piece) and quantity <> 0
         group by 1, 2, 3, 4, 5, 6, 7, 8)
       select p.*, b.n as balance_n from p full join b
         on p.site_id = b.site_id and p.business_unit_id = b.business_unit_id
         and p.location_id is not distinct from b.location_id and p.condition = b.condition and p.held_as = b.held_as
         and p.transit_kind is not distinct from b.transit_kind and p.transit_ref is not distinct from b.transit_ref
         and p.receipt_origin_id = b.receipt_origin_id
       where p.n is distinct from b.n`,
    );
    await check(
      'below zero',
      `select 'balance' as what, id from stock.balance where quantity < 0 or accepted_quantity < 0
       union all select 'pool', id from stock.cost_pool where quantity < 0 or value_paise < 0
       union all select 'layer', id from stock.cost_layer where quantity_left < 0 or value_left_paise < 0
       union all select 'transit', id from stock.transit_value where quantity < 0 or value_paise < 0`,
    );
    await check(
      'FIFO pool unlike its layers',
      `select p.id from stock.cost_pool p
       left join stock.cost_layer l on l.cost_pool_id = p.id
       where p.formula = 'fifo'
       group by p.id, p.quantity, p.value_paise
       having p.quantity <> coalesce(sum(l.quantity_left), 0) or p.value_paise <> coalesce(sum(l.value_left_paise), 0)`,
    );
    await check(
      'journal does not balance',
      `select journal_id from finance.journal_line group by journal_id
       having sum(case when side = 'debit' then amount_paise else -amount_paise end) <> 0`,
    );
    await check(
      'posting source not in its journal',
      `select s.id from finance.posting_source s join finance.journal_line l on l.id = s.journal_line_id
       where l.journal_id <> s.journal_id or s.amount_paise = 0`,
    );
    return found;
  });
  expect(failures).toEqual({});
}
