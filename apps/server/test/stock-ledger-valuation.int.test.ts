import { known, paise, uuidv7 } from '@apparel-os/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  inventoryReconciliation,
  rebuildAndCompare,
  value,
  type LedgerItem,
  type SkuFacts,
} from '../src/modules/stock/ledger/index.js';
import { syntheticCode } from './fixtures/synthetic.js';
import { written } from './support/stock-ledger.js';
import { ValuedWorld, type At, type SyntheticAccount, type SyntheticCombination } from './support/stock-valued.js';

// S1-F10-T03: valuation and the hand-off to Post (stock-ledger 7, 13.1, 13.4, 13.6, 13.8; books-and-posting 8, 10,
// 15 tests 4, 5, 7 and 8). The ledger runs through the real command runner, access, row-level security, `finance` ·
// books (cost setting, Check postable, Hold periods, Post) and `exceptions` on real PostgreSQL; the organisation
// records are real, read through stand-ins of the ledger's declared reads (RR-436). Every value is SYNTHETIC: the
// story, P RATEs, accounts and maps are those of stock-ledger 11 and books-and-posting 16, written by hand.

const world = new ValuedWorld();

beforeAll(async () => {
  await world.start('stockval');
}, 600_000);

afterAll(async () => {
  await world.stop();
});

let codeNumber = 0;
const codes = (count: number) => Array.from({ length: count }, () => syntheticCode(`VPIECE-${String(++codeNumber)}`));
const line = () => uuidv7();
const rupees = (amount: number) => paise(Math.round(amount * 100));
/** A credit balance in the trial balance, debit positive (books-and-posting 12). */
const credit = (amount: number) => -Math.round(amount * 100);

const post = (items: readonly LedgerItem[], source = world.source()) => world.post(world.poster, items, { source });
const posted = async (items: readonly LedgerItem[]) => written(await post(items));

async function refused(items: readonly LedgerItem[]) {
  const result = await post(items);
  if (result.kind !== 'refused') throw new Error('posted');
  return result.refusal;
}

/** Receives pieces, then covers, accepts and establishes their cost at a P RATE in one request (13.4, 13.5). */
async function receiveAt(at: At, sku: SkuFacts, count: number, pRate: number | null, legalEntityId: string) {
  const pieceCodes = codes(count);
  const receipt = await posted([
    {
      kind: 'receipt-count',
      lineId: line(),
      skuId: sku.skuId,
      quantity: count,
      to: at,
      condition: 'good',
      owner: { kind: 'organisation', legalEntityId },
      pieceCodes,
    },
  ]);
  const originId = receipt.receiptOriginIds[0] ?? '';
  const ptRevisionId = uuidv7();
  const goods = { skuId: sku.skuId, quantity: count, pieceCodes };
  await posted([
    { kind: 'record-coverage', lineId: line(), ptRevisionId, receiptOriginId: originId, pieceCodes },
    { kind: 'record-acceptance', lineId: line(), at, goods },
    ...(pRate === null
      ? []
      : [
          {
            kind: 'cost-established' as const,
            lineId: line(),
            receiptOriginId: originId,
            ptRevisionId,
            pRatePaise: rupees(pRate),
          },
        ]),
  ]);
  return { originId, pieceCodes, ptRevisionId };
}

async function trialBalance(combo: SyntheticCombination): Promise<Record<SyntheticAccount, number>> {
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

const read = <T>(work: Parameters<typeof world.run<T>>[1]) => world.run(world.poster.user.id, work);
const rebuild = async () => (await read((context) => rebuildAndCompare(context))).differences;

/**
 * The inventory account reconciles with the ledger movement by movement (books-and-posting 8.3; PRD-LED-008): each
 * valued movement's pool value change is what its posting-source rows put on the synthetic inventory account.
 */
async function reconciles(combo: SyntheticCombination) {
  const ledger = await read((context) => inventoryReconciliation(context, combo.bookId));
  const sources = await world.setup.run(world.setup.preparer.id, async (context) => {
    const { sql } = await import('drizzle-orm');
    const rows = await context.tx.execute<{ item_key: string; account_id: string; side: string; amount: string }>(sql`
      select s.item_key, l.account_id, l.side, s.amount_paise as amount
      from finance.posting_source s
      join finance.journal j on j.id = s.journal_id
      join finance.journal_line l on l.journal_id = j.id
      where j.book_id = ${combo.bookId}::uuid and s.source_module = ${'test-syn-stock-ledger'}`);
    return rows.rows;
  });
  expect(sources.length).toBeGreaterThan(0);
  // Each component's signed amount lands on the inventory account by the map's side for it (16.1).
  for (const movement of ledger.movements) {
    const kind = movement.eventKind;
    const onInventory = SYNTHETIC_INVENTORY_SIGN[kind];
    if (onInventory === undefined) continue;
    const rows = await world.setup.run(world.setup.preparer.id, async (context) => {
      const { sql } = await import('drizzle-orm');
      return (
        await context.tx.execute<{ component: string; amount: string }>(sql`
          select component, amount_paise as amount from finance.posting_source
          where item_key = ${movement.movementId} or item_key like ${`${movement.movementId}:%`}`)
      ).rows;
    });
    const fromPosting = rows.reduce((sum, row) => sum + (onInventory[row.component] ?? 0) * Number(row.amount), 0);
    expect(fromPosting).toBe(movement.poolValuePaise);
  }
  expect(await poolTotal(combo)).toBe(ledger.poolValuePaise);
}

/** How a component's positive amount moves the inventory account under the synthetic maps of 16.1. */
const SYNTHETIC_INVENTORY_SIGN: Record<string, Record<string, number>> = {
  'stock.cost-established': { 'to-pool': 1 },
  'stock.cost-adjustment': { 'to-pool': 1 },
  'stock.pool-dispatch': { cost: -1 },
  'stock.pool-arrival': { cost: 1 },
  'stock.sale-issue': { cost: -1 },
  'stock.customer-return': { cost: 1 },
  'stock.supplier-return-departure': { cost: -1 },
  'stock.supplier-rejection-return': { cost: 1 },
};

async function poolTotal(combo: SyntheticCombination) {
  return (await read((context) => value(context, { bookId: combo.bookId }))).pools.reduce(
    (sum, pool) => sum + pool.valuePaise,
    0,
  );
}

async function pools(combo: SyntheticCombination, sku: SkuFacts) {
  return (await read((context) => value(context, { bookId: combo.bookId, skuId: sku.skuId }))).pools;
}

/**
 * The story of stock-ledger 11.1, steps 1 to 7, as ledger requests: receipts R1 at W1 and R2 at S1 with their cost
 * established; 4 R1 pieces reserved, dispatched, counted at S1 and accepted; a sale of 3 R1 and 2 R2 pieces; 1 R1
 * piece returned; R1's cost up ₹15.00 a piece; 1 R2 piece returned to its supplier and handed over.
 */
async function story(combo: SyntheticCombination, sku: SkuFacts) {
  const r1 = await receiveAt(combo.w1, sku, 10, 100, combo.legalEntityId);
  const r2 = await receiveAt(combo.s1, sku, 6, 130, combo.legalEntityId);
  expect(await rebuild()).toEqual([]);
  const moving = r1.pieceCodes.slice(0, 4);
  const transfer = await posted([
    {
      kind: 'reserve',
      lineId: line(),
      reservationKind: 'transfer',
      at: combo.w1,
      goods: [{ skuId: sku.skuId, quantity: 4, pieceCodes: moving }],
    },
  ]);
  const dispatchId = uuidv7();
  await posted([
    {
      kind: 'dispatch',
      lineId: line(),
      dispatchId,
      reservationId: transfer.reservationIds[0] ?? '',
      from: combo.w1,
      to: { siteId: combo.s1.siteId, businessUnitId: combo.s1.businessUnitId },
      goods: { skuId: sku.skuId, quantity: 4, pieceCodes: moving },
    },
  ]);
  expect(await rebuild()).toEqual([]);
  await posted([
    {
      kind: 'arrival-count',
      lineId: line(),
      dispatchId,
      from: { siteId: combo.w1.siteId, businessUnitId: combo.w1.businessUnitId },
      to: combo.s1,
      goods: { skuId: sku.skuId, quantity: 4, pieceCodes: moving },
    },
    {
      kind: 'record-acceptance',
      lineId: line(),
      at: combo.s1,
      goods: { skuId: sku.skuId, quantity: 4, pieceCodes: moving },
    },
  ]);
  const sold = [...moving.slice(0, 3), ...r2.pieceCodes.slice(0, 2)];
  const sale = await posted([
    {
      kind: 'sale-issue',
      lineId: line(),
      at: combo.s1,
      handover: 'now',
      goods: { skuId: sku.skuId, quantity: 5, pieceCodes: sold },
    },
  ]);
  const saleMovementId = sale.movementIds[0] ?? '';
  await posted([
    {
      kind: 'customer-return',
      lineId: line(),
      saleMovementId,
      to: combo.s1,
      condition: 'good',
      goods: { skuId: sku.skuId, quantity: 1, pieceCodes: [moving[0] ?? ''] },
    },
  ]);
  expect(await rebuild()).toEqual([]);
  await posted([{ kind: 'cost-adjustment', lineId: line(), receiptOriginId: r1.originId, amountPaise: rupees(150) }]);
  const returning = [r2.pieceCodes[2] ?? ''];
  const reserved = await posted([
    {
      kind: 'reserve',
      lineId: line(),
      reservationKind: 'supplier-return',
      at: combo.s1,
      goods: [{ skuId: sku.skuId, quantity: 1, pieceCodes: returning }],
    },
  ]);
  const shipmentId = uuidv7();
  await posted([
    {
      kind: 'supplier-return-departure',
      lineId: line(),
      shipmentId,
      reservationId: reserved.reservationIds[0] ?? '',
      from: combo.s1,
      goods: { skuId: sku.skuId, quantity: 1, pieceCodes: returning },
    },
  ]);
  await posted([
    {
      kind: 'supplier-handover',
      lineId: line(),
      shipmentId,
      from: { siteId: combo.s1.siteId, businessUnitId: combo.s1.businessUnitId },
      goods: { skuId: sku.skuId, quantity: 1, pieceCodes: returning },
    },
  ]);
  expect(await rebuild()).toEqual([]);
  return { r1, r2, saleMovementId };
}

describe('the story under moving average and Site pools (stock-ledger 11.3; books-and-posting 16.2, 16.3)', () => {
  it('PRD-LED-014 PRD-LED-015 PRD-MOD-013 each step values in posting order and posts its journal; the end state is 11.6', async () => {
    const combo = await world.book('moving-average', 'site');
    const sku = world.sku(true);
    await story(combo, sku);
    const found = await pools(combo, sku);
    const at = (place: At) => found.find((pool) => pool.siteId === place.siteId);
    // stock-ledger 11.3, step 7: W1 6 / 690.00, S1 5 / 615.00; a new pool keeps the cost setting read at Plan (14.2).
    expect([at(combo.w1)?.quantity, at(combo.w1)?.valuePaise]).toEqual([6, rupees(690)]);
    expect([at(combo.s1)?.quantity, at(combo.s1)?.valuePaise]).toEqual([5, rupees(615)]);
    expect(found.every((pool) => pool.formula === 'moving-average' && pool.poolMode === 'site')).toBe(true);
    expect(found.every((pool) => pool.costSettingVersionId === combo.costVersionId)).toBe(true);
    // books-and-posting 16.3, moving average and Site pools.
    expect(await trialBalance(combo)).toMatchObject({
      INV: rupees(1305),
      COGS: rupees(502),
      CLM: rupees(123),
      TRN: 0,
      RSH: 0,
      PUR: credit(1930),
    });
    await reconciles(combo);
  }, 300_000);
});

describe('the story under FIFO and a book pool (stock-ledger 11.4; books-and-posting 16.2, 16.3)', () => {
  it('PRD-LED-014 POL-09.07 a sale takes the oldest layer; a return makes a layer with lineage; a late cost follows the lineage', async () => {
    const combo = await world.book('fifo', 'book');
    const sku = world.sku(true);
    await story(combo, sku);
    const [pool] = await pools(combo, sku);
    // stock-ledger 11.4, step 7: L1 4 @ 115.00 · L2 6 @ 130.00 · L3 1 @ 115.00 = 11 / 1,355.00.
    expect(pool?.siteId).toBeNull();
    expect(pool?.layers.map((layer) => [layer.quantityLeft, layer.valueLeftPaise])).toEqual([
      [4, rupees(460)],
      [6, rupees(780)],
      [1, rupees(115)],
    ]);
    expect(pool?.layers[2]?.fromLayerId).toBe(pool?.layers[0]?.id);
    expect(await trialBalance(combo)).toMatchObject({
      INV: rupees(1355),
      COGS: rupees(460),
      CLM: rupees(115),
      TRN: 0,
      RSH: 0,
      PUR: credit(1930),
    });
    await reconciles(combo);
  }, 300_000);
});

describe('the story under the other two combinations (stock-ledger 11.2, 11.5, 11.6; books-and-posting 16.3)', () => {
  // Hand-written from stock-ledger 11.6 and books-and-posting 16.3, in rupees.
  it.each([
    ['moving-average', 'book', 1333.75, 475, 121.25],
    ['fifo', 'site', 1280, 520, 130],
  ] as const)(
    'PRD-ACP-018 %s with a %s pool ends at stock %d, cost of goods sold %d, supplier claim %d',
    async (formula, poolMode, stock, cogs, claim) => {
      const combo = await world.book(formula, poolMode);
      const sku = world.sku(true);
      await story(combo, sku);
      expect(await trialBalance(combo)).toMatchObject({
        INV: rupees(stock),
        COGS: rupees(cogs),
        CLM: rupees(claim),
        TRN: 0,
        RSH: 0,
        PUR: credit(1930),
      });
      expect(await poolTotal(combo)).toBe(rupees(stock));
      await reconciles(combo);
    },
    300_000,
  );
});

describe('value Unknown and cost established in transit (stock-ledger 7.2, 7.6; books-and-posting 15 test 5)', () => {
  it('PRD-ACP-004 PRD-MOD-015 pre-PT movements post nothing; cost established on units in transit goes onto the dispatch', async () => {
    const combo = await world.book('fifo', 'site');
    const sku = world.sku(true);
    const r1 = await receiveAt(combo.w1, sku, 3, null, combo.legalEntityId);
    const reservation = await posted([
      {
        kind: 'reserve',
        lineId: line(),
        reservationKind: 'transfer',
        at: combo.w1,
        goods: [{ skuId: sku.skuId, quantity: 2, pieceCodes: r1.pieceCodes.slice(0, 2) }],
      },
    ]);
    const dispatchId = uuidv7();
    const dispatched = await posted([
      {
        kind: 'dispatch',
        lineId: line(),
        dispatchId,
        reservationId: reservation.reservationIds[0] ?? '',
        from: combo.w1,
        to: { siteId: combo.s1.siteId, businessUnitId: combo.s1.businessUnitId },
        goods: { skuId: sku.skuId, quantity: 2, pieceCodes: r1.pieceCodes.slice(0, 2) },
      },
    ]);
    // G2: custody without cost; no journal (PRD-ACP-004).
    expect(dispatched.posting).toBeNull();
    expect(await trialBalance(combo)).toMatchObject({ INV: 0, TRN: 0, PUR: 0 });
    const established = await posted([
      {
        kind: 'cost-established',
        lineId: line(),
        receiptOriginId: r1.originId,
        ptRevisionId: r1.ptRevisionId,
        pRatePaise: rupees(100),
      },
    ]);
    expect(established.posting?.kind).toBe('posted');
    // 7.6: the unit at W1 enters its pool; the two in transit between Site pools go onto the dispatch.
    expect(await trialBalance(combo)).toMatchObject({ INV: rupees(100), TRN: rupees(200), PUR: credit(300) });
    await posted([
      {
        kind: 'arrival-count',
        lineId: line(),
        dispatchId,
        from: { siteId: combo.w1.siteId, businessUnitId: combo.w1.businessUnitId },
        to: combo.s1,
        goods: { skuId: sku.skuId, quantity: 2, pieceCodes: r1.pieceCodes.slice(0, 2) },
      },
    ]);
    expect(await trialBalance(combo)).toMatchObject({ INV: rupees(300), TRN: 0, PUR: credit(300) });
    const s1Pool = (await pools(combo, sku)).find((pool) => pool.siteId === combo.s1.siteId);
    expect(s1Pool?.layers.map((layer) => [layer.quantityLeft, layer.valueLeftPaise])).toEqual([[2, rupees(200)]]);
    expect(await rebuild()).toEqual([]);
    await reconciles(combo);
  }, 300_000);
});

describe('one Site, two units in two books (books-and-posting 15 test 7; PRD-ACP-013, PRD-ORG-005)', () => {
  it('PRD-LED-002 each posting goes to its own unit’s book and keeps the mapping version it used', async () => {
    const first = await world.book('moving-average', 'book');
    const second = await world.book('moving-average', 'book');
    const counter = await world.unit(
      { bookId: second.bookId, legalEntityId: second.legalEntityId, registrationId: second.registrationId },
      first.s1.siteId,
      'warehouse',
    );
    const sku = world.sku(false);
    for (const [at, legalEntityId] of [
      [first.s1, first.legalEntityId],
      [counter, second.legalEntityId],
    ] as const) {
      const receipt = await posted([
        {
          kind: 'receipt-count',
          lineId: line(),
          skuId: sku.skuId,
          quantity: 2,
          to: at,
          condition: 'good',
          owner: { kind: 'organisation', legalEntityId },
        },
      ]);
      const ptRevisionId = uuidv7();
      const result = await posted([
        {
          kind: 'record-coverage',
          lineId: line(),
          ptRevisionId,
          receiptOriginId: receipt.receiptOriginIds[0] ?? '',
          quantity: 2,
        },
        {
          kind: 'cost-established',
          lineId: line(),
          receiptOriginId: receipt.receiptOriginIds[0] ?? '',
          ptRevisionId,
          pRatePaise: rupees(50),
        },
      ]);
      expect(result.posting?.kind).toBe('posted');
    }
    expect(await trialBalance(first)).toMatchObject({ INV: rupees(100), PUR: credit(100) });
    expect(await trialBalance(second)).toMatchObject({ INV: rupees(100), PUR: credit(100) });
    const mappings = await world.setup.run(world.setup.preparer.id, async (context) => {
      const { sql } = await import('drizzle-orm');
      return (
        await context.tx.execute<{ book_id: string; business_unit_id: string; mapping_version_id: string | null }>(sql`
          select distinct j.book_id, l.business_unit_id, l.mapping_version_id from finance.journal j
          join finance.journal_line l on l.journal_id = j.id
          where j.book_id in (${first.bookId}::uuid, ${second.bookId}::uuid)`)
      ).rows;
    });
    expect(mappings.find((row) => row.business_unit_id === counter.businessUnitId)?.book_id).toBe(second.bookId);
    expect(mappings.find((row) => row.business_unit_id === first.s1.businessUnitId)?.book_id).toBe(first.bookId);
    expect(mappings.every((row) => row.mapping_version_id !== null)).toBe(true);
  }, 300_000);
});

describe('refusals of the valued items (stock-ledger 13.4, 13.8)', () => {
  let combo: SyntheticCombination;
  beforeAll(async () => {
    combo = await world.book('moving-average', 'site');
  }, 300_000);

  it('PRD-SEC-017 a book with no approved cost setting takes no valued item (no-cost-setting)', async () => {
    const bare = await world.book(null, 'book', { maps: [] });
    const sku = world.sku(false);
    const receipt = await posted([
      {
        kind: 'receipt-count',
        lineId: line(),
        skuId: sku.skuId,
        quantity: 1,
        to: bare.w1,
        condition: 'good',
        owner: { kind: 'organisation', legalEntityId: bare.legalEntityId },
      },
    ]);
    const refusal = await refused([
      {
        kind: 'cost-established',
        lineId: line(),
        receiptOriginId: receipt.receiptOriginIds[0] ?? '',
        ptRevisionId: uuidv7(),
        pRatePaise: rupees(1),
      },
    ]);
    expect(refusal.code).toBe('stock.no-cost-setting');
  }, 300_000);

  it('SL-2 G10a an outflow that does not divide into whole paise is refused and changes nothing', async () => {
    const sku = world.sku(false);
    // SYNTHETIC: two receipts at the Store, 2 units at 10 paise and 1 at 11, so the pool is 3 / 31 paise.
    for (const [quantity, pRate] of [
      [2, 10],
      [1, 11],
    ] as const) {
      const receipt = await posted([
        {
          kind: 'receipt-count',
          lineId: line(),
          skuId: sku.skuId,
          quantity,
          to: combo.s1,
          condition: 'good',
          owner: { kind: 'organisation', legalEntityId: combo.legalEntityId },
        },
      ]);
      const originId = receipt.receiptOriginIds[0] ?? '';
      const ptRevisionId = uuidv7();
      await posted([
        { kind: 'record-coverage', lineId: line(), ptRevisionId, receiptOriginId: originId, quantity },
        {
          kind: 'record-acceptance',
          lineId: line(),
          at: combo.s1,
          goods: { skuId: sku.skuId, quantity, receiptOriginId: originId },
        },
        { kind: 'cost-established', lineId: line(), receiptOriginId: originId, ptRevisionId, pRatePaise: paise(pRate) },
      ]);
    }
    const sell = (quantity: number): LedgerItem => ({
      kind: 'sale-issue',
      lineId: line(),
      at: combo.s1,
      handover: 'now',
      goods: { skuId: sku.skuId, quantity },
    });
    expect(await refused([sell(1)])).toMatchObject({
      code: 'stock.rule-not-set',
      missing: expect.arrayContaining([{ kind: 'open-question', question: 'SL-2' }]) as unknown,
    });
    expect((await pools(combo, sku)).map((pool) => [pool.quantity, pool.valuePaise])).toEqual([[3, 31]]);
    // An outflow that empties the pool takes all 31 paise (7.3), but naming that value per receipt origin, 2 units
    // and 1, needs the rounding rule too (14.2 `valuation`; SL-2): refused until it is set. Reported as a design gap.
    expect((await refused([sell(3)])).code).toBe('stock.rule-not-set');
  }, 120_000);

  it('PRD-STK-003 a sale needs coverage and acceptance at the Store (not-sellable); billed-retained timing is SL-17', async () => {
    const sku = world.sku(false);
    const receipt = await posted([
      {
        kind: 'receipt-count',
        lineId: line(),
        skuId: sku.skuId,
        quantity: 2,
        to: combo.s1,
        condition: 'good',
        owner: { kind: 'organisation', legalEntityId: combo.legalEntityId },
      },
    ]);
    const goods = { skuId: sku.skuId, quantity: 1 };
    expect((await refused([{ kind: 'sale-issue', lineId: line(), at: combo.s1, handover: 'now', goods }])).code).toBe(
      'stock.not-sellable',
    );
    await posted([
      {
        kind: 'record-coverage',
        lineId: line(),
        ptRevisionId: uuidv7(),
        receiptOriginId: receipt.receiptOriginIds[0] ?? '',
        quantity: 2,
      },
      { kind: 'record-acceptance', lineId: line(), at: combo.s1, goods: { skuId: sku.skuId, quantity: 2 } },
    ]);
    expect(
      await refused([{ kind: 'sale-issue', lineId: line(), at: combo.s1, handover: 'billed-retained', goods }]),
    ).toMatchObject({
      code: 'stock.rule-not-set',
      missing: expect.arrayContaining([{ kind: 'open-question', question: 'SL-17' }]) as unknown,
    });
    // Pre-PT cost: the sale moves custody, its value is Unknown and nothing posts (PRD-MOD-015).
    const sale = await posted([{ kind: 'sale-issue', lineId: line(), at: combo.s1, handover: 'now', goods }]);
    expect(sale.posting).toBeNull();
    const back = await refused([
      {
        kind: 'customer-return',
        lineId: line(),
        saleMovementId: sale.movementIds[0] ?? '',
        to: combo.s1,
        condition: 'good',
        goods: { skuId: sku.skuId, quantity: 2 },
      },
    ]);
    expect(back.code).toBe('stock.exceeds-source');
  }, 120_000);

  it('PRD-TRF-004 a dispatch stays inside its legal entity (route-not-allowed)', async () => {
    const other = await world.book('moving-average', 'site');
    const sku = world.sku(true);
    const r = await receiveAt(combo.w1, sku, 1, 10, combo.legalEntityId);
    const reservation = await posted([
      {
        kind: 'reserve',
        lineId: line(),
        reservationKind: 'transfer',
        at: combo.w1,
        goods: [{ skuId: sku.skuId, quantity: 1, pieceCodes: r.pieceCodes }],
      },
    ]);
    const refusal = await refused([
      {
        kind: 'dispatch',
        lineId: line(),
        dispatchId: uuidv7(),
        reservationId: reservation.reservationIds[0] ?? '',
        from: combo.w1,
        to: { siteId: other.s1.siteId, businessUnitId: other.s1.businessUnitId },
        goods: { skuId: sku.skuId, quantity: 1, pieceCodes: r.pieceCodes },
      },
    ]);
    expect(refusal.code).toBe('stock.route-not-allowed');
  }, 300_000);
});

describe('no valid map (books-and-posting 10, 15 tests 4 and 8; SL-23 Outcome A, DEC-105)', () => {
  it('PRD-INT-004 PRD-EXC-001 nothing commits; the exception survives; a replay raises none; with the map it posts once', async () => {
    const combo = await world.book('moving-average', 'book', { maps: [] });
    await world.routePostingRefused(combo.w1.siteId);
    const sku = world.sku(false);
    const receipt = await posted([
      {
        kind: 'receipt-count',
        lineId: line(),
        skuId: sku.skuId,
        quantity: 2,
        to: combo.w1,
        condition: 'good',
        owner: { kind: 'organisation', legalEntityId: combo.legalEntityId },
      },
    ]);
    const originId = receipt.receiptOriginIds[0] ?? '';
    const ptRevisionId = uuidv7();
    const items: LedgerItem[] = [
      { kind: 'record-coverage', lineId: line(), ptRevisionId, receiptOriginId: originId, quantity: 2 },
      { kind: 'cost-established', lineId: line(), receiptOriginId: originId, ptRevisionId, pRatePaise: rupees(10) },
    ];
    const source = world.source();
    const key = uuidv7();
    const attempt = async () => {
      let raised: Awaited<ReturnType<typeof world.raisePostingRefused>> | undefined;
      const result = await world.post(world.poster, items, {
        source,
        afterRefusal: async (refusal) => {
          raised = await world.raisePostingRefused(key, combo.w1.siteId, source, refusal);
        },
      });
      return { result, raised };
    };
    const first = await attempt();
    expect(first.result).toMatchObject({ kind: 'refused', refusal: { code: 'stock.posting-refused' } });
    expect(first.result.kind === 'refused' && first.result.refusal.missing).toEqual(
      expect.arrayContaining([
        { kind: 'posting', code: 'finance.no-posting-map' },
        { kind: 'posting-map', bookId: combo.bookId, eventKind: 'stock.cost-established' },
      ]),
    );
    expect(first.raised, JSON.stringify(first.raised)).toMatchObject({ kind: 'done', value: { replayed: false } });
    // Nothing committed: no coverage, no pool, no journal (PRD-INT-004).
    expect(await pools(combo, sku)).toEqual([]);
    expect(await trialBalance(combo)).toMatchObject({ INV: 0, PUR: 0 });
    const replay = await attempt();
    expect(replay.raised).toMatchObject({
      kind: 'done',
      value: { replayed: true, exceptionId: first.raised?.kind === 'done' ? first.raised.value.exceptionId : '' },
    });
    // After the map is approved, the document posts once (books-and-posting 10 step 5).
    await world.map(combo.bookId, combo.accounts, 'stock.cost-established');
    const done = await attempt();
    expect(done.result.kind).toBe('written');
    expect(await trialBalance(combo)).toMatchObject({ INV: rupees(20), PUR: credit(20) });
    // books-and-posting 15 test 4: Post given the same items again answers the first result, with no second journal.
    const journals =
      done.result.kind === 'written' && done.result.written.posting?.kind === 'posted'
        ? done.result.written.posting.journals
        : [];
    const again = await world.setup.run(world.setup.preparer.id, async (context) => {
      const { sql } = await import('drizzle-orm');
      const rows = (
        await context.tx.execute<{ item_key: string; component: string; amount: string }>(sql`
          select item_key, component, amount_paise as amount from finance.posting_source
          where journal_id = ${journals[0]?.journalId ?? uuidv7()}::uuid`)
      ).rows;
      return world.setup.books.checkPostable(context, {
        sourceModule: 'test-syn-stock-ledger',
        items: rows.map((row) => ({
          itemKey: row.item_key,
          eventKind: 'stock.cost-established',
          businessUnitId: combo.w1.businessUnitId,
          brandId: sku.brandId,
          businessDate: world.setup.today(),
          components: [{ component: row.component, amount: known(paise(Number(row.amount))) }],
        })),
      });
    });
    expect(again.map((check) => check.kind)).toEqual(['posted']);
    expect(await trialBalance(combo)).toMatchObject({ INV: rupees(20) });
  }, 300_000);
});
