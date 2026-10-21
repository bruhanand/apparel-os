import { paise, uuidv7 } from '@apparel-os/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  custody,
  rebuildAndCompare,
  splitIdentity,
  value,
  type IdentityPart,
  type IdentitySplit,
  type LedgerItem,
  type Owner,
  type SkuFacts,
} from '../src/modules/stock/ledger/index.js';
import { connect } from './support/postgres.js';
import { APPROVE_DOCUMENT, written, type Actor } from './support/stock-ledger.js';
import { ValuedWorld, type At, type SyntheticCombination } from './support/stock-valued.js';

// S2-F02-T01 (GI-1): the receipt count of goods of a product not yet set up, counted with their identity as described
// (style code, colour, size) and their SKU Unknown, in good condition and not quarantined; and the identity step that
// gives a style and size's receipt origins the SKUs of the PT's rows, by quantity, as linked records keeping the
// originals (stock-ledger 2.2, 2.3, 13.4, 13.14; goods-in 4.5, 6.3 step 4; PRD-DMG-005, PRD-REC-008). Posted by the
// synthetic caller through the real command runner, access, row-level security and `finance` · books on real
// PostgreSQL. Every place, SKU, style code, colour, size and document is SYNTHETIC.

const world = new ValuedWorld();
let combo: SyntheticCombination & { registrationId: string };
let owner: Owner;

beforeAll(async () => {
  await world.start('stockident');
  combo = await world.book('moving-average', 'book');
  owner = { kind: 'organisation', legalEntityId: combo.legalEntityId };
}, 600_000);

afterAll(async () => {
  await world.stop();
});

const line = () => uuidv7();
let styleNumber = 0;
/** A SYNTHETIC style code, never used before in this file. */
const style = () => `SYN-STYLE-${String(++styleNumber)}`;
/** The SYNTHETIC brand the goods of this file are counted under, unless a test names another (13.14; RR-555). */
const BRAND = uuidv7();

/**
 * A receipt count of goods of a product not yet set up: SKU Unknown, identity as described, under the brand the
 * caller names, as receiving names its Arrival's (13.4, 13.14; GI-1, RR-555).
 */
function described(
  quantity: number,
  identity: { styleCode: string; colour: string | null; size: string | null },
  to: At = combo.w1,
  brandId: string = BRAND,
): LedgerItem {
  return {
    kind: 'receipt-count',
    lineId: line(),
    skuId: null,
    described: identity,
    brandId,
    quantity,
    to,
    condition: 'good',
    owner,
  };
}

const read = <T>(work: Parameters<typeof world.run<T>>[1]) => world.run(world.poster.user.id, work);
const rebuild = async () => (await read((context) => rebuildAndCompare(context))).differences;
const custodyAt = async (at: At) =>
  (await read((context) => custody(context, { siteId: at.siteId, businessUnitId: at.businessUnitId }))).rows;

/** The receipt origins written, with their identity, parent and quantity, as the verifier role reads them (15.4). */
async function origins(ids: readonly string[]) {
  const client = await connect(world.database, 'verify');
  try {
    const result = await client.query<{
      id: string;
      origin_kind: string;
      parent_origin_id: string | null;
      sku_id: string | null;
      described_style_code: string | null;
      described_colour: string | null;
      described_size: string | null;
      quantity: number;
      owner_kind: string | null;
    }>(
      `select o.id, o.origin_kind, o.parent_origin_id, o.sku_id, o.described_style_code, o.described_colour,
              o.described_size, o.quantity, s.owner_kind
         from stock.receipt_origin o join stock.receipt_origin_state s on s.receipt_origin_id = o.id
        where o.id = any($1::uuid[]) order by o.id`,
      [ids],
    );
    return result.rows;
  } finally {
    await client.end();
  }
}

describe('a receipt count of goods of a product not yet set up (stock-ledger 13.4; goods-in 4.5; GI-1)', () => {
  it('PRD-DMG-005 PRD-REC-008 goods with Unknown SKU and an identity as described are counted in good condition, not quarantined', async () => {
    const styleCode = style();
    const result = written(await world.post(world.poster, [described(5, { styleCode, colour: 'SYN RED', size: 'M' })]));
    expect(result.holdIds).toEqual([]);
    expect(result.posting).toBeNull();
    const [originId] = result.receiptOriginIds;
    expect(await origins(result.receiptOriginIds)).toEqual([
      {
        id: originId,
        origin_kind: 'receipt',
        parent_origin_id: null,
        sku_id: null,
        described_style_code: styleCode,
        described_colour: 'SYN RED',
        described_size: 'M',
        quantity: 5,
        owner_kind: 'organisation',
      },
    ]);
    expect((await custodyAt(combo.w1)).filter((row) => row.receiptOriginId === originId)).toEqual([
      expect.objectContaining({ skuId: null, condition: 'good', heldAs: 'custody', quantity: 5, acceptedQuantity: 0 }),
    ]);
    expect(await rebuild()).toEqual([]);
  });

  it('stock-ledger 13.14 goods of Unknown SKU need an identity as described, in good condition, by quantity; a SKU takes none', async () => {
    const identity = { styleCode: style(), colour: null, size: null };
    const refusals = await Promise.all(
      [
        { ...described(1, identity), described: undefined },
        described(1, { styleCode: ' ', colour: null, size: null }),
        described(1, { styleCode: style(), colour: '', size: 'M' }),
        { ...described(1, identity), condition: 'unidentified' },
        { ...described(1, identity), pieceCodes: ['SYN-PIECE-NO'] },
        { ...described(1, identity), skuId: world.sku(false).skuId },
      ].map(async (item) => {
        const result = await world.post(world.poster, [item as LedgerItem]);
        return result.kind === 'refused' ? result.refusal.code : 'written';
      }),
    );
    expect(refusals).toEqual(Array.from({ length: 6 }, () => 'stock.invalid-item'));
  });

  it('PRD-DMG-005 a style code with no colour or size stated keeps them Unknown', async () => {
    const styleCode = style();
    const result = written(await world.post(world.poster, [described(2, { styleCode, colour: null, size: null })]));
    expect(await origins(result.receiptOriginIds)).toMatchObject([
      { sku_id: null, described_style_code: styleCode, described_colour: null, described_size: null, quantity: 2 },
    ]);
  });
});

/** A fresh SYNTHETIC warehouse unit in the book, so each test reads only its own custody. */
async function freshUnit(): Promise<At> {
  return world.unit(combo, await world.site('central-warehouse'), 'warehouse');
}

/** A document approved by a different person, the approval the identity route runs under (13.14; access 9.5). */
async function approvedDocument(preparer: Actor = world.poster) {
  const document = { recordId: uuidv7(), versionId: uuidv7() };
  const { decision } = await world.approve(preparer, document);
  if (decision.kind !== 'success') throw new Error(decision.refusal.code);
  return {
    source: world.source(document.recordId, document.versionId),
    approval: { decisionId: decision.answer.decisionId, actionType: APPROVE_DOCUMENT },
  };
}

/** The parts of an identity step from the split rule, a new origin for each part that does not keep its own. */
function partsOf(split: IdentitySplit): readonly IdentityPart[] {
  if (split.kind !== 'split') throw new Error(`mismatch ${String(split.units)} ${String(split.rows)}`);
  return split.parts;
}

const identity = (at: At, parts: readonly IdentityPart[]): LedgerItem => ({
  kind: 'identity-resolved',
  lineId: line(),
  at: { siteId: at.siteId, businessUnitId: at.businessUnitId },
  parts,
});

/** Posts under a fresh approval, as PT approval does (goods-in 6.3). */
async function underApproval(items: readonly LedgerItem[]) {
  return world.post(world.poster, items, await approvedDocument());
}

/** Custody at a unit by SKU, all conditions, good units and accepted units summed (13.6). */
async function bySku(at: At) {
  const totals = new Map<string, { quantity: number; accepted: number; conditions: string[] }>();
  for (const row of await custodyAt(at)) {
    const key = row.skuId ?? 'unknown';
    const total = totals.get(key) ?? { quantity: 0, accepted: 0, conditions: [] };
    total.quantity += row.quantity;
    total.accepted += row.acceptedQuantity;
    if (!total.conditions.includes(row.condition)) total.conditions.push(row.condition);
    totals.set(key, total);
  }
  return Object.fromEntries(totals);
}

/** The kind and legs of the movements written, as the verifier role reads them. */
async function movementLegs(ids: readonly string[]) {
  const client = await connect(world.database, 'verify');
  try {
    const result = await client.query<{ kind: string; direction: string; sku_id: string | null; quantity: number }>(
      `select m.kind, l.direction, l.sku_id, sum(l.quantity)::integer as quantity
         from stock.movement m join stock.movement_leg l on l.movement_id = m.id
        where m.id = any($1::uuid[]) group by 1, 2, 3 order by 1, 2, 3`,
      [ids],
    );
    return result.rows;
  } finally {
    await client.end();
  }
}

describe('the identity step (stock-ledger 13.14; goods-in 6.3 step 4; GI-1)', () => {
  it('PRD-DMG-005 splits one style and size into the PT SKUs by quantity, as new origins linked to the originals', async () => {
    const at = await freshUnit();
    const styleCode = style();
    const received = written(
      await world.post(world.poster, [
        described(5, { styleCode, colour: 'SYN RED', size: 'M' }, at),
        described(3, { styleCode, colour: 'SYN BLUE', size: 'M' }, at),
      ]),
    );
    const [red, blue] = received.receiptOriginIds as [string, string];
    const skuA = world.sku(false);
    const skuB = world.sku(false);
    // SYNTHETIC PT rows for the style and size: 6 of A and 2 of B; colour is not compared (DEC-138).
    const parts = partsOf(
      splitIdentity(
        [
          { receiptOriginId: red, skuId: null, units: 5 },
          { receiptOriginId: blue, skuId: null, units: 3 },
        ],
        [
          { skuId: skuA.skuId, quantity: 6 },
          { skuId: skuB.skuId, quantity: 2 },
        ],
        uuidv7,
      ),
    );
    const result = written(await underApproval([identity(at, parts)]));
    // Quantities conserved: 8 units Unknown before, 6 of A and 2 of B after, none Unknown, all good and not accepted.
    expect(await bySku(at)).toEqual({
      [skuA.skuId]: { quantity: 6, accepted: 0, conditions: ['good'] },
      [skuB.skuId]: { quantity: 2, accepted: 0, conditions: ['good'] },
    });
    // The originals are kept as they were; each new origin names its parent.
    const made = await origins(result.receiptOriginIds);
    expect(
      made.map(({ origin_kind, parent_origin_id, sku_id, quantity, owner_kind }) => ({
        origin_kind,
        parent_origin_id,
        sku_id,
        quantity,
        owner_kind,
      })),
    ).toEqual(
      expect.arrayContaining([
        {
          origin_kind: 'identity-resolved',
          parent_origin_id: red,
          sku_id: skuA.skuId,
          quantity: 5,
          owner_kind: 'organisation',
        },
        {
          origin_kind: 'identity-resolved',
          parent_origin_id: blue,
          sku_id: skuA.skuId,
          quantity: 1,
          owner_kind: 'organisation',
        },
        {
          origin_kind: 'identity-resolved',
          parent_origin_id: blue,
          sku_id: skuB.skuId,
          quantity: 2,
          owner_kind: 'organisation',
        },
      ]),
    );
    expect(made).toHaveLength(3);
    const originals = await origins([red, blue]);
    expect(originals.find((row) => row.id === red)).toMatchObject({
      origin_kind: 'receipt',
      sku_id: null,
      quantity: 5,
      described_colour: 'SYN RED',
    });
    expect(originals.find((row) => row.id === blue)).toMatchObject({
      origin_kind: 'receipt',
      sku_id: null,
      quantity: 3,
      described_colour: 'SYN BLUE',
    });
    const legs = await movementLegs(result.movementIds);
    expect(legs).toHaveLength(3);
    expect(legs).toEqual(
      expect.arrayContaining([
        { kind: 'identity-resolved', direction: 'in', sku_id: skuA.skuId, quantity: 6 },
        { kind: 'identity-resolved', direction: 'in', sku_id: skuB.skuId, quantity: 2 },
        { kind: 'identity-resolved', direction: 'out', sku_id: null, quantity: 8 },
      ]),
    );
    expect(result.posting).toBeNull();
    expect(await rebuild()).toEqual([]);
  });

  it('goods-in 6.3 step 4 corrects an origin that named another SKU, keeping what the PT confirms', async () => {
    const at = await freshUnit();
    const skuX = world.sku(false);
    const skuY = world.sku(false);
    const received = written(
      await world.post(world.poster, [
        { ...known(skuX, 4, at) },
        described(2, { styleCode: style(), colour: null, size: 'L' }, at),
      ]),
    );
    const [named, unknown] = received.receiptOriginIds as [string, string];
    // SYNTHETIC PT rows: 3 of X, 3 of Y. The line that named X keeps 3 and gives 1 to Y; the Unknown line takes Y.
    const parts = partsOf(
      splitIdentity(
        [
          { receiptOriginId: named, skuId: skuX.skuId, units: 4 },
          { receiptOriginId: unknown, skuId: null, units: 2 },
        ],
        [
          { skuId: skuX.skuId, quantity: 3 },
          { skuId: skuY.skuId, quantity: 3 },
        ],
        uuidv7,
      ),
    );
    const result = written(await underApproval([identity(at, parts)]));
    expect(await bySku(at)).toEqual({
      [skuX.skuId]: { quantity: 3, accepted: 0, conditions: ['good'] },
      [skuY.skuId]: { quantity: 3, accepted: 0, conditions: ['good'] },
    });
    const kept = (await custodyAt(at)).filter((row) => row.skuId === skuX.skuId);
    expect(kept.map((row) => row.receiptOriginId)).toEqual([named]);
    expect(
      (await origins(result.receiptOriginIds)).map((row) => [row.parent_origin_id, row.sku_id, row.quantity]),
    ).toEqual(
      expect.arrayContaining([
        [named, skuY.skuId, 1],
        [unknown, skuY.skuId, 2],
      ]),
    );
    expect(await rebuild()).toEqual([]);
  });

  it('PRD-STK-003 PRD-REC-017 nothing is sellable before coverage and acceptance: Unknown goods take no coverage, resolved goods none until the PT route', async () => {
    const at = await freshUnit();
    const received = written(
      await world.post(world.poster, [described(4, { styleCode: style(), colour: null, size: 'S' }, at)]),
    );
    const [origin] = received.receiptOriginIds as [string];
    const cover = (receiptOriginId: string): LedgerItem => ({
      kind: 'record-coverage',
      lineId: line(),
      ptRevisionId: uuidv7(),
      receiptOriginId,
      quantity: 4,
    });
    expect(await world.post(world.poster, [cover(origin)])).toMatchObject({
      kind: 'refused',
      refusal: {
        code: 'stock.invalid-item',
        missing: expect.arrayContaining([{ kind: 'identity-unknown', receiptOriginId: origin }]) as unknown,
      },
    });
    const sku = world.sku(false);
    written(
      await underApproval([
        identity(at, [{ receiptOriginId: origin, skuId: sku.skuId, quantity: 4, newReceiptOriginId: uuidv7() }]),
      ]),
    );
    const reserve: LedgerItem = {
      kind: 'reserve',
      lineId: line(),
      reservationKind: 'transfer',
      at,
      goods: [{ skuId: sku.skuId, quantity: 1 }],
    };
    expect(await world.post(world.poster, [reserve])).toMatchObject({
      kind: 'refused',
      refusal: { code: 'stock.not-covered' },
    });
  });

  it('goods-in 6.3 steps 4 and 5 the identity step, coverage and cost of its new origins post in one request', async () => {
    const at = await freshUnit();
    const received = written(
      await world.post(world.poster, [described(4, { styleCode: style(), colour: 'SYN GREEN', size: 'XL' }, at)]),
    );
    const [origin] = received.receiptOriginIds as [string];
    const sku = world.sku(false);
    const madeId = uuidv7();
    const ptRevisionId = uuidv7();
    const result = written(
      await underApproval([
        identity(at, [{ receiptOriginId: origin, skuId: sku.skuId, quantity: 4, newReceiptOriginId: madeId }]),
        { kind: 'record-coverage', lineId: line(), ptRevisionId, receiptOriginId: madeId, quantity: 4 },
        // SYNTHETIC P RATE ₹100.00 a piece.
        { kind: 'cost-established', lineId: line(), receiptOriginId: madeId, ptRevisionId, pRatePaise: paise(10_000) },
      ]),
    );
    expect(result.receiptOriginIds).toEqual([madeId]);
    expect(result.coverageIds).toHaveLength(1);
    expect(result.posting?.kind).toBe('posted');
    const [pool] = (await read((context) => value(context, { bookId: combo.bookId, skuId: sku.skuId }))).pools;
    expect(pool).toMatchObject({ quantity: 4, valuePaise: 40_000 });
    expect(await origins([madeId])).toMatchObject([
      { origin_kind: 'identity-resolved', parent_origin_id: origin, quantity: 4 },
    ]);
    // Official and valued, still not accepted at the Site, so still not sellable (6.3; goods-in 6.3 last bullet).
    const reserve: LedgerItem = {
      kind: 'reserve',
      lineId: line(),
      reservationKind: 'transfer',
      at,
      goods: [{ skuId: sku.skuId, quantity: 1 }],
    };
    expect(await world.post(world.poster, [reserve])).toMatchObject({
      kind: 'refused',
      refusal: { code: 'stock.not-accepted' },
    });
    expect(await rebuild()).toEqual([]);
  });

  it('PRD-DMG-005 POL-17.02 the identity step runs only under the approved route, and gives every free unit exactly one SKU', async () => {
    const at = await freshUnit();
    const received = written(
      await world.post(world.poster, [described(3, { styleCode: style(), colour: null, size: 'M' }, at)]),
    );
    const [origin] = received.receiptOriginIds as [string];
    const sku = world.sku(false);
    const part = (quantity: number, extra: Partial<IdentityPart> = {}): IdentityPart => ({
      receiptOriginId: origin,
      skuId: sku.skuId,
      quantity,
      newReceiptOriginId: uuidv7(),
      ...extra,
    });
    const code = async (items: readonly LedgerItem[], approved = true) => {
      const result = approved ? await underApproval(items) : await world.post(world.poster, items);
      return result.kind === 'refused' ? result.refusal : 'written';
    };
    expect(await code([identity(at, [part(3)])], false)).toMatchObject({ code: 'stock.condition-route' });
    expect(await code([identity(at, [part(2)])])).toMatchObject({
      code: 'stock.invalid-item',
      missing: expect.arrayContaining([
        { kind: 'identity-units', receiptOriginId: origin, units: '3', named: '2' },
      ]) as unknown,
    });
    expect(await code([identity(at, [part(2), part(2)])])).toMatchObject({ code: 'stock.insufficient-available' });
    // An origin of Unknown SKU has no SKU to keep; a piece-tracked SKU is not the goods' unit (DEC-137).
    const keeping: IdentityPart = { receiptOriginId: origin, skuId: sku.skuId, quantity: 3 };
    expect(await code([identity(at, [keeping])])).toMatchObject({
      code: 'stock.invalid-item',
      missing: expect.arrayContaining([expect.objectContaining({ kind: 'identity-keeps' })]) as unknown,
    });
    expect(await code([identity(at, [part(3, { skuId: world.sku(true).skuId })])])).toMatchObject({
      code: 'stock.invalid-item',
      missing: expect.arrayContaining([expect.objectContaining({ kind: 'tracking' })]) as unknown,
    });
    // A new origin's identifier must be new.
    expect(await code([identity(at, [part(3, { newReceiptOriginId: origin })])])).toMatchObject({
      code: 'stock.invalid-item',
    });
    expect(await bySku(at)).toEqual({ unknown: { quantity: 3, accepted: 0, conditions: ['good'] } });
    expect(await rebuild()).toEqual([]);
  });

  it('PRD-REC-013 units still held keep their identity and their hold; the free units take the SKU', async () => {
    const at = await freshUnit();
    const skuX = world.sku(false);
    const skuY = world.sku(false);
    const received = written(await world.post(world.poster, [known(skuX, 5, at)]));
    const [origin] = received.receiptOriginIds as [string];
    const held = written(
      await world.post(world.poster, [
        {
          kind: 'place-hold',
          lineId: line(),
          holdKind: 'excess',
          reason: 'SYNTHETIC excess left held',
          at,
          condition: 'good',
          goods: [{ skuId: skuX.skuId, quantity: 2, receiptOriginId: origin }],
        },
      ]),
    );
    const toY = (quantity: number) =>
      identity(at, [{ receiptOriginId: origin, skuId: skuY.skuId, quantity, newReceiptOriginId: uuidv7() }]);
    expect(await underApproval([toY(5)])).toMatchObject({
      kind: 'refused',
      refusal: {
        code: 'stock.held',
        missing: expect.arrayContaining([expect.objectContaining({ holdId: held.holdIds[0] })]) as unknown,
      },
    });
    written(await underApproval([toY(3)]));
    expect(await bySku(at)).toEqual({
      [skuX.skuId]: { quantity: 2, accepted: 0, conditions: ['good'] },
      [skuY.skuId]: { quantity: 3, accepted: 0, conditions: ['good'] },
    });
    expect(await rebuild()).toEqual([]);
  });

  it('POL-17.02 wrong goods taken in return to good only through the identity route, once their quarantine is released', async () => {
    const at = await freshUnit();
    const skuX = world.sku(false);
    const received = written(await world.post(world.poster, [{ ...known(skuX, 3, at), condition: 'wrong' }]));
    const [origin] = received.receiptOriginIds as [string];
    const quarantine = written(
      await world.post(world.poster, [
        {
          kind: 'place-hold',
          lineId: line(),
          holdKind: 'quarantine',
          reason: 'SYNTHETIC wrong goods',
          at,
          condition: 'wrong',
          goods: [{ skuId: skuX.skuId, quantity: 3, receiptOriginId: origin }],
        },
      ]),
    );
    const keep = identity(at, [{ receiptOriginId: origin, skuId: skuX.skuId, quantity: 3 }]);
    expect(await underApproval([keep])).toMatchObject({ kind: 'refused', refusal: { code: 'stock.held' } });
    const release: LedgerItem = {
      kind: 'release-hold',
      lineId: line(),
      holdId: quarantine.holdIds[0] ?? '',
      event: 'approved-decision',
    };
    const result = written(await underApproval([release, keep]));
    expect(result.receiptOriginIds).toEqual([]);
    expect(await bySku(at)).toEqual({ [skuX.skuId]: { quantity: 3, accepted: 0, conditions: ['good'] } });
    expect(await rebuild()).toEqual([]);
  });

  it('PRD-STK-009 a count freeze over the goods stops the identity step', async () => {
    const at = await freshUnit();
    const received = written(
      await world.post(world.poster, [described(2, { styleCode: style(), colour: null, size: null }, at)]),
    );
    const [origin] = received.receiptOriginIds as [string];
    const freeze = written(
      await world.post(world.poster, [
        {
          kind: 'start-count-freeze',
          lineId: line(),
          siteId: at.siteId,
          businessUnitId: at.businessUnitId,
          reason: 'SYNTHETIC count',
          scope: [{ locationId: at.locationId }],
        },
      ]),
    );
    const step = identity(at, [
      { receiptOriginId: origin, skuId: world.sku(false).skuId, quantity: 2, newReceiptOriginId: uuidv7() },
    ]);
    expect(await underApproval([step])).toMatchObject({
      kind: 'refused',
      refusal: { code: 'stock.count-freeze-active' },
    });
    written(
      await world.post(world.poster, [{ kind: 'end-count-freeze', lineId: line(), holdId: freeze.holdIds[0] ?? '' }]),
    );
    written(await underApproval([step]));
  });
});

/** A receipt count of a known SKU (13.4). */
function known(sku: SkuFacts, quantity: number, to: At): Extract<LedgerItem, { kind: 'receipt-count' }> {
  return { kind: 'receipt-count', lineId: line(), skuId: sku.skuId, quantity, to, condition: 'good', owner };
}

/** The brand of each receipt origin, movement and SKU balance of goods of Unknown SKU, as the verifier role reads it. */
async function brandsOf(at: At, originIds: readonly string[], movementIds: readonly string[]) {
  const client = await connect(world.database, 'verify');
  try {
    const origins = await client.query<{ id: string; brand_id: string | null }>(
      `select id, brand_id::text as brand_id from stock.receipt_origin where id = any($1::uuid[]) order by id`,
      [originIds],
    );
    const movements = await client.query<{ brand_ids: string[] }>(
      `select brand_ids::text[] as brand_ids from stock.movement where id = any($1::uuid[]) order by id`,
      [movementIds],
    );
    const totals = await client.query<{ brand_id: string | null; quantity: number }>(
      `select brand_id::text as brand_id, quantity from stock.sku_balance
        where site_id = $1 and business_unit_id = $2 and sku_id is null order by quantity`,
      [at.siteId, at.businessUnitId],
    );
    return { origins: origins.rows, movements: movements.rows, totals: totals.rows };
  } finally {
    await client.end();
  }
}

describe('the brand of goods of a product not yet set up (stock-ledger 13.14, 14.1; RR-555)', () => {
  it('RR-555 PRD-SEC-005 goods of Unknown SKU take the brand they are counted under: a person scoped to it counts, sees and resolves them', async () => {
    const at = await freshUnit();
    const otherBrand = uuidv7();
    const brandLimited = await world.actor(`BRAND-${String(++styleNumber)}`, {
      kind: 'dimensions',
      legalEntity: { kind: 'all' },
      place: { kind: 'all' },
      brand: { kind: 'selected', members: [BRAND] },
    });
    const styleCode = style();
    const counted = written(await world.post(brandLimited, [described(4, { styleCode, colour: null, size: 'M' }, at)]));
    const [originId] = counted.receiptOriginIds as [string];
    // Another brand's goods of a product not yet set up at the same unit, counted by a person over every brand.
    const other = written(
      await world.post(world.poster, [described(3, { styleCode: style(), colour: null, size: 'M' }, at, otherBrand)]),
    );
    // Each brand's goods of Unknown SKU at the unit have a SKU balance of their own, of their brand (14.1, 14.2).
    expect(await brandsOf(at, [originId], [...counted.movementIds])).toEqual({
      origins: [{ id: originId, brand_id: BRAND }],
      movements: [{ brand_ids: [BRAND] }],
      totals: [
        { brand_id: otherBrand, quantity: 3 },
        { brand_id: BRAND, quantity: 4 },
      ],
    });
    // The person scoped to the brand sees its goods and only them (access-and-approvals 5.3).
    const seen = await world.run(brandLimited.user.id, (context) =>
      custody(context, { siteId: at.siteId, businessUnitId: at.businessUnitId }),
    );
    expect(seen.rows.map((row) => ({ origin: row.receiptOriginId, quantity: row.quantity }))).toEqual([
      { origin: originId, quantity: 4 },
    ]);
    expect(seen.rows.some((row) => row.receiptOriginId === other.receiptOriginIds[0])).toBe(false);
    // And gives them their SKU, a product of the brand, under the PT approval's route (goods-in 6.3 step 4).
    const sku = world.sku(false, BRAND);
    const resolved = written(
      await world.post(
        brandLimited,
        [identity(at, [{ receiptOriginId: originId, skuId: sku.skuId, quantity: 4, newReceiptOriginId: uuidv7() }])],
        await approvedDocument(brandLimited),
      ),
    );
    expect((await brandsOf(at, [], [...resolved.movementIds])).movements).toEqual([{ brand_ids: [BRAND] }]);
    expect(await bySku(at)).toEqual({
      [sku.skuId]: { quantity: 4, accepted: 0, conditions: ['good'] },
      unknown: { quantity: 3, accepted: 0, conditions: ['good'] },
    });
    expect(await rebuild()).toEqual([]);
  });

  it('PRD-STK-009 RR-555 a count freeze over a brand stops a receipt count of its goods of Unknown SKU, not another brand’s', async () => {
    const at = await freshUnit();
    const frozenBrand = uuidv7();
    const freeze = written(
      await world.post(world.poster, [
        {
          kind: 'start-count-freeze',
          lineId: line(),
          siteId: at.siteId,
          businessUnitId: at.businessUnitId,
          reason: 'SYNTHETIC count',
          scope: [{ brandId: frozenBrand }],
        },
      ]),
    );
    const count = described(2, { styleCode: style(), colour: null, size: null }, at, frozenBrand);
    expect(await world.post(world.poster, [count])).toMatchObject({
      kind: 'refused',
      refusal: { code: 'stock.count-freeze-active' },
    });
    written(await world.post(world.poster, [described(2, { styleCode: style(), colour: null, size: null }, at)]));
    written(
      await world.post(world.poster, [{ kind: 'end-count-freeze', lineId: line(), holdId: freeze.holdIds[0] ?? '' }]),
    );
    written(await world.post(world.poster, [{ ...count, lineId: line() }]));
  });

  it('PRD-SEC-005 RR-555 a receipt count of goods of Unknown SKU names the brand they are counted under', async () => {
    const result = await world.post(world.poster, [
      { ...described(1, { styleCode: style(), colour: null, size: null }), brandId: undefined } as LedgerItem,
    ]);
    expect(result.kind === 'refused' ? result.refusal : 'written').toMatchObject({
      code: 'stock.invalid-item',
      missing: expect.arrayContaining([{ kind: 'brand' }]) as unknown,
    });
  });
});
