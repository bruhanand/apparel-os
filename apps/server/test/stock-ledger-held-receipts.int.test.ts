import { uuidv7 } from '@apparel-os/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  custody,
  rebuildAndCompare,
  type LedgerItem,
  type NamedGoods,
  type Owner,
} from '../src/modules/stock/ledger/index.js';
import { connect } from './support/postgres.js';
import { APPROVE_DOCUMENT, written } from './support/stock-ledger.js';
import { ValuedWorld, type At, type SyntheticCombination } from './support/stock-valued.js';

// S2-F02-T03: the ledger support the findings at the count need (stock-ledger 13.16; goods-in 4.4, 4.5; PRD-REC-006,
// PRD-REC-012, PRD-REC-013, PRD-DMG-005, POL-17.02). A GRN's one ledger request counts each line's received pieces
// and holds them in the same request: excess under an excess hold, wrong goods and unidentified goods in quarantine,
// damage under a damage hold. A receipt count may name the origin it makes, so the later items of the request name its
// goods; and unidentified goods are counted with no identity as described, in quarantine. Posted by the synthetic
// caller through the real command runner, access, row-level security and `finance` · books on real PostgreSQL. Every
// place, SKU, style code and document is SYNTHETIC.

const world = new ValuedWorld();
let combo: SyntheticCombination & { registrationId: string };
let owner: Owner;

beforeAll(async () => {
  await world.start('stockheld');
  combo = await world.book('moving-average', 'book');
  owner = { kind: 'organisation', legalEntityId: combo.legalEntityId };
}, 600_000);

afterAll(async () => {
  await world.stop();
});

const line = () => uuidv7();
/** The SYNTHETIC brand the goods of Unknown SKU of this file are counted under (13.14; RR-555). */
const BRAND = uuidv7();
let styleNumber = 0;
const style = () => `SYN-HELD-STYLE-${String(++styleNumber)}`;

const read = <T>(work: Parameters<typeof world.run<T>>[1]) => world.run(world.poster.user.id, work);
const rebuild = async () => (await read((context) => rebuildAndCompare(context))).differences;

/** A fresh SYNTHETIC warehouse unit in the book, so each test reads only its own custody. */
async function freshUnit(): Promise<At> {
  return world.unit(combo, await world.site('central-warehouse'), 'warehouse');
}

/** Custody of one origin at a unit, by condition (13.6). */
async function custodyOf(at: At, originId: string) {
  const rows = (await read((context) => custody(context, { siteId: at.siteId, businessUnitId: at.businessUnitId })))
    .rows;
  return Object.fromEntries(
    rows.filter((row) => row.receiptOriginId === originId).map((row) => [row.condition, row.quantity]),
  );
}

/** Each hold of the origin with the units it still claims, by kind and condition, as the verifier reads them (15.4). */
async function holdsOf(originId: string) {
  const client = await connect(world.database, 'verify');
  try {
    const result = await client.query<{ kind: string; condition: string; quantity: number }>(
      `select h.kind, b.condition, sum(c.quantity)::int as quantity
         from stock.hold_claim c
         join stock.hold h on h.id = c.hold_id
         join stock.balance b on b.id = c.balance_id
        where b.receipt_origin_id = $1 and c.quantity > 0
        group by h.kind, b.condition order by h.kind, b.condition`,
      [originId],
    );
    return result.rows;
  } finally {
    await client.end();
  }
}

/** The origin's SKU and identity as described, as the verifier reads them. */
async function originRow(originId: string) {
  const client = await connect(world.database, 'verify');
  try {
    const result = await client.query<{
      sku_id: string | null;
      brand_id: string | null;
      described_style_code: string | null;
      quantity: number;
    }>('select sku_id, brand_id, described_style_code, quantity from stock.receipt_origin where id = $1', [originId]);
    return result.rows[0];
  } finally {
    await client.end();
  }
}

const hold = (
  at: At,
  holdKind: 'excess' | 'quarantine' | 'damage',
  condition: 'good' | 'wrong' | 'unidentified',
  goods: NamedGoods,
): LedgerItem => ({
  kind: 'place-hold',
  lineId: line(),
  holdKind,
  reason: `SYNTHETIC ${holdKind} at the count`,
  at,
  condition,
  goods: [goods],
});

const refusalCode = async (items: readonly LedgerItem[]) => {
  const result = await world.post(world.poster, items);
  return result.kind === 'refused' ? result.refusal.code : 'written';
};

describe('a receipt count holds the goods it counts in the same request (stock-ledger 13.16; goods-in 4.5)', () => {
  it('PRD-REC-013 PRD-DMG-005 the excess of goods of a product not yet set up goes under an excess hold on the origin the count makes', async () => {
    const at = await freshUnit();
    const originId = uuidv7();
    const result = written(
      await world.post(world.poster, [
        {
          kind: 'receipt-count',
          lineId: line(),
          receiptOriginId: originId,
          skuId: null,
          described: { styleCode: style(), colour: null, size: null },
          brandId: BRAND,
          quantity: 12,
          to: at,
          condition: 'good',
          owner,
        },
        hold(at, 'excess', 'good', { skuId: null, receiptOriginId: originId, quantity: 2 }),
      ]),
    );
    expect(result.receiptOriginIds).toEqual([originId]);
    expect(await custodyOf(at, originId)).toEqual({ good: 12 });
    expect(await holdsOf(originId)).toEqual([{ kind: 'excess', condition: 'good', quantity: 2 }]);
    expect(await rebuild()).toEqual([]);
  });

  it('PRD-REC-012 POL-17.02 wrong goods of a known product are counted in the wrong condition and quarantined', async () => {
    const at = await freshUnit();
    const sku = world.sku(false);
    const originId = uuidv7();
    written(
      await world.post(world.poster, [
        {
          kind: 'receipt-count',
          lineId: line(),
          receiptOriginId: originId,
          skuId: sku.skuId,
          quantity: 3,
          to: at,
          condition: 'wrong',
          owner,
        },
        hold(at, 'quarantine', 'wrong', { skuId: sku.skuId, receiptOriginId: originId, quantity: 3 }),
      ]),
    );
    expect(await custodyOf(at, originId)).toEqual({ wrong: 3 });
    expect(await holdsOf(originId)).toEqual([{ kind: 'quarantine', condition: 'wrong', quantity: 3 }]);
    expect(await rebuild()).toEqual([]);
  });

  it('PRD-DMG-005 POL-17.02 unidentified goods are counted with no identity as described, in quarantine, under the brand named', async () => {
    const at = await freshUnit();
    const originId = uuidv7();
    written(
      await world.post(world.poster, [
        {
          kind: 'receipt-count',
          lineId: line(),
          receiptOriginId: originId,
          skuId: null,
          described: null,
          brandId: BRAND,
          quantity: 4,
          to: at,
          condition: 'unidentified',
          owner,
        },
        hold(at, 'quarantine', 'unidentified', { skuId: null, receiptOriginId: originId, quantity: 4 }),
      ]),
    );
    expect(await originRow(originId)).toEqual({
      sku_id: null,
      brand_id: BRAND,
      described_style_code: null,
      quantity: 4,
    });
    expect(await custodyOf(at, originId)).toEqual({ unidentified: 4 });
    expect(await holdsOf(originId)).toEqual([{ kind: 'quarantine', condition: 'unidentified', quantity: 4 }]);
    expect(await rebuild()).toEqual([]);
  });

  it('PRD-DMG-001 a damage hold falls on pieces the same request counts, beside their excess hold (6.2)', async () => {
    const at = await freshUnit();
    const sku = world.sku(false);
    const originId = uuidv7();
    const result = written(
      await world.post(world.poster, [
        {
          kind: 'receipt-count',
          lineId: line(),
          receiptOriginId: originId,
          skuId: sku.skuId,
          quantity: 6,
          to: at,
          condition: 'good',
          owner,
        },
        hold(at, 'excess', 'good', { skuId: sku.skuId, receiptOriginId: originId, quantity: 1 }),
        hold(at, 'damage', 'good', { skuId: sku.skuId, receiptOriginId: originId, quantity: 2 }),
      ]),
    );
    // The holds are written in the order of their items, which the caller reads them back by.
    expect(result.holdIds).toHaveLength(2);
    expect(await holdsOf(originId)).toEqual([
      { kind: 'damage', condition: 'good', quantity: 2 },
      { kind: 'excess', condition: 'good', quantity: 1 },
    ]);
    expect(await rebuild()).toEqual([]);
  });

  it('PRD-MOD-015 stock-ledger 13.16 unidentified goods carry no identity and only the unidentified condition; an origin named is new and named once', async () => {
    const at = await freshUnit();
    const unidentified = (overrides: Record<string, unknown> = {}) =>
      ({
        kind: 'receipt-count',
        lineId: line(),
        skuId: null,
        described: null,
        brandId: BRAND,
        quantity: 1,
        to: at,
        condition: 'unidentified',
        owner,
        ...overrides,
      }) as LedgerItem;
    const taken = written(await world.post(world.poster, [unidentified({ receiptOriginId: uuidv7() })]))
      .receiptOriginIds[0];
    const twice = uuidv7();
    const later = uuidv7();
    expect(
      await Promise.all([
        // Unidentified goods are never in good condition: they are quarantined (goods-in 4.4).
        refusalCode([unidentified({ condition: 'good' })]),
        // Goods with an identity as described are in good condition, not unidentified (13.14).
        refusalCode([unidentified({ described: { styleCode: style(), colour: null, size: null } })]),
        refusalCode([unidentified({ brandId: undefined })]),
        // An origin the request names is a new one, named by one count only.
        refusalCode([unidentified({ receiptOriginId: taken })]),
        refusalCode([unidentified({ receiptOriginId: twice }), unidentified({ receiptOriginId: twice })]),
        // A hold names an origin only after the count that makes it.
        refusalCode([
          hold(at, 'quarantine', 'unidentified', { skuId: null, receiptOriginId: later, quantity: 1 }),
          unidentified({ receiptOriginId: later }),
        ]),
        // A hold claims only what the count put there.
        (async () => {
          const counted = uuidv7();
          return refusalCode([
            unidentified({ receiptOriginId: counted, quantity: 2 }),
            hold(at, 'quarantine', 'unidentified', { skuId: null, receiptOriginId: counted, quantity: 3 }),
          ]);
        })(),
      ]),
    ).toEqual([
      'stock.invalid-item',
      'stock.invalid-item',
      'stock.invalid-item',
      'stock.invalid-item',
      'stock.invalid-item',
      'stock.invalid-item',
      'stock.not-in-custody',
    ]);
    expect(await rebuild()).toEqual([]);
  });

  it('POL-17.02 PRD-DMG-010 unidentified goods taken in return to good only through the identity route, once their quarantine ends', async () => {
    const at = await freshUnit();
    const originId = uuidv7();
    const placed = written(
      await world.post(world.poster, [
        {
          kind: 'receipt-count',
          lineId: line(),
          receiptOriginId: originId,
          skuId: null,
          described: null,
          brandId: BRAND,
          quantity: 2,
          to: at,
          condition: 'unidentified',
          owner,
        },
        hold(at, 'quarantine', 'unidentified', { skuId: null, receiptOriginId: originId, quantity: 2 }),
      ]),
    );
    const quarantine = placed.holdIds[0] ?? '';
    const sku = world.sku(false, BRAND);
    const document = { recordId: uuidv7(), versionId: uuidv7() };
    const { decision } = await world.approve(world.poster, document);
    if (decision.kind !== 'success') throw new Error(decision.refusal.code);
    const resolved = uuidv7();
    written(
      await world.post(
        world.poster,
        [
          { kind: 'release-hold', lineId: line(), holdId: quarantine, event: 'approved-decision' },
          {
            kind: 'identity-resolved',
            lineId: line(),
            at: { siteId: at.siteId, businessUnitId: at.businessUnitId },
            parts: [{ receiptOriginId: originId, skuId: sku.skuId, quantity: 2, newReceiptOriginId: resolved }],
          },
        ],
        {
          source: world.source(document.recordId, document.versionId),
          approval: { decisionId: decision.answer.decisionId, actionType: APPROVE_DOCUMENT },
        },
      ),
    );
    expect(await custodyOf(at, originId)).toEqual({});
    expect(await custodyOf(at, resolved)).toEqual({ good: 2 });
    expect(await rebuild()).toEqual([]);
  });
});
