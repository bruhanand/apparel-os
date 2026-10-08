import { uuidv7 } from '@apparel-os/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  availability,
  custody,
  pieceByCode,
  rebuildAndCompare,
  type Goods,
  type LedgerItem,
} from '../src/modules/stock/ledger/index.js';
import { lockTable } from '../src/kernel/index.js';
import { UNREGISTERED_MODULE } from './fixtures/stock-ledger.js';
import { syntheticCode } from './fixtures/synthetic.js';
import { connect, sqlState } from './support/postgres.js';
import {
  addSyntheticSku,
  APPROVE_DOCUMENT,
  APPROVE_ON_COST,
  at,
  BRAND_A,
  BRAND_B,
  PLACES,
  SKUS,
  StockWorld,
  SYNTHETIC_DOCUMENT_TYPE,
  SYNTHETIC_MODULE,
  written,
  type Actor,
} from './support/stock-ledger.js';

// S1-F10-T02: the ledger's unvalued operations (stock-ledger 13.1 to 13.6, 13.8; 10.3, 10.4), posted by a synthetic
// caller through the real command runner, access and row-level security on real PostgreSQL (DEC-112, H1 to H6). Every
// place, SKU, document and actor is SYNTHETIC.

const world = new StockWorld();

beforeAll(async () => {
  await world.start('stockops');
});

afterAll(async () => {
  await world.stop();
});

const line = () => uuidv7();
let codeNumber = 0;
/** SYNTHETIC piece codes, never used before in this file. */
const codes = (count: number) => Array.from({ length: count }, () => syntheticCode(`PIECE-${String(++codeNumber)}`));

type Sku = (typeof SKUS)[keyof typeof SKUS];

/** Receives goods by a receipt count (13.4) and answers the new receipt origin. */
async function receive(
  sku: Sku,
  quantity: number,
  place = at('rack'),
  pieceCodes?: readonly string[],
): Promise<string> {
  const result = written(
    await world.post(world.poster, [
      {
        kind: 'receipt-count',
        lineId: line(),
        skuId: sku.skuId,
        quantity,
        to: place,
        condition: 'good',
        owner: { kind: 'organisation', legalEntityId: PLACES.legalEntity },
        ...(pieceCodes === undefined ? {} : { pieceCodes }),
      },
    ]),
  );
  const [origin] = result.receiptOriginIds;
  if (origin === undefined) throw new Error('no origin');
  return origin;
}

async function refusal(actor: Actor, items: readonly LedgerItem[]) {
  const result = await world.post(actor, items);
  if (result.kind !== 'refused') throw new Error('posted');
  return result.refusal;
}

async function custodyOf(skuId: string) {
  return (await world.run(world.poster.user.id, (context) => custody(context, { skuId }))).rows;
}

async function rebuild() {
  return (await world.run(world.poster.user.id, (context) => rebuildAndCompare(context))).differences;
}

const toBin = { businessUnitId: at('bin').businessUnitId, locationId: at('bin').locationId };

function move(sku: Sku, quantity: number, extra: Partial<Goods> = {}): LedgerItem {
  return {
    kind: 'location-move',
    lineId: line(),
    from: at('rack'),
    to: toBin,
    condition: 'good',
    goods: { skuId: sku.skuId, quantity, ...extra },
  };
}

describe('receipt count (stock-ledger 13.4)', () => {
  it('PRD-REC-008 a receipt count creates a receipt origin and its custody at the place counted', async () => {
    const result = written(
      await world.post(world.poster, [
        {
          kind: 'receipt-count',
          lineId: line(),
          skuId: SKUS.quantityA.skuId,
          quantity: 10,
          to: at('rack'),
          condition: 'good',
          owner: { kind: 'unknown' },
        },
      ]),
    );
    expect(result.movementIds).toHaveLength(1);
    expect(result.receiptOriginIds).toHaveLength(1);
    expect(await custodyOf(SKUS.quantityA.skuId)).toMatchObject([
      {
        locationId: at('rack').locationId,
        condition: 'good',
        quantity: 10,
        acceptedQuantity: 0,
        receiptOriginId: result.receiptOriginIds[0],
      },
    ]);
    expect(await rebuild()).toEqual([]);
  });

  it('PRD-MER-015 piece-tracked goods are counted with one new piece code each; a code already used is refused', async () => {
    const pieceCodes = codes(2);
    await receive(SKUS.pieceA, 2, at('rack'), pieceCodes);
    const piece = await world.run(world.poster.user.id, (context) => pieceByCode(context, pieceCodes[0] ?? ''));
    expect(piece).toMatchObject({
      locationId: at('rack').locationId,
      condition: 'good',
      inCustody: true,
      ptRevisionId: null,
    });
    expect(piece?.movements.map((each) => each.kind)).toEqual(['receipt-count']);
    const reused = await refusal(world.poster, [
      {
        kind: 'receipt-count',
        lineId: line(),
        skuId: SKUS.pieceA.skuId,
        quantity: 1,
        to: at('rack'),
        condition: 'good',
        owner: { kind: 'unknown' },
        pieceCodes: [pieceCodes[1] ?? ''],
      },
    ]);
    expect(reused.code).toBe('stock.invalid-item');
    const missing = await refusal(world.poster, [
      {
        kind: 'receipt-count',
        lineId: line(),
        skuId: SKUS.pieceA.skuId,
        quantity: 1,
        to: at('rack'),
        condition: 'good',
        owner: { kind: 'unknown' },
      },
    ]);
    expect(missing.code).toBe('stock.invalid-item');
  });

  it('PRD-MER-011 batch and expiry are present exactly when the tracking profile requires them', async () => {
    const lineId = line();
    const item = {
      kind: 'receipt-count',
      lineId,
      skuId: SKUS.batchA.skuId,
      quantity: 1,
      to: at('rack'),
      condition: 'good',
      owner: { kind: 'unknown' },
    } as const;
    expect(await refusal(world.poster, [item])).toEqual({
      kind: 'refused',
      code: 'stock.invalid-item',
      missing: [{ kind: 'line', lineId }, { kind: 'batch' }],
    });
    written(
      await world.post(world.poster, [
        { ...item, batch: { code: syntheticCode('BATCH-1'), expiryDate: '2099-01-31' } },
      ]),
    );
  });

  it('stock-ledger 13.8 place-invalid: a location that is not of the Site and unit named', async () => {
    const wrong = { ...at('rack'), locationId: at('floor').locationId };
    const refused = await refusal(world.poster, [
      {
        kind: 'receipt-count',
        lineId: line(),
        skuId: SKUS.quantityA.skuId,
        quantity: 1,
        to: wrong,
        condition: 'good',
        owner: { kind: 'unknown' },
      },
    ]);
    expect(refused.code).toBe('stock.place-invalid');
  });

  it('stock-ledger 13.2 PRD-LIF-014 an unregistered caller and a historical-reference source post nothing', async () => {
    const item: LedgerItem = {
      kind: 'receipt-count',
      lineId: line(),
      skuId: SKUS.quantityA.skuId,
      quantity: 1,
      to: at('rack'),
      condition: 'good',
      owner: { kind: 'unknown' },
    };
    const other = await world.post(world.poster, [item], {
      source: { ...world.source(), module: UNREGISTERED_MODULE },
    });
    expect(other.kind === 'refused' && other.refusal.code).toBe('stock.caller-not-registered');
    const history = await world.post(world.poster, [item], {
      source: { ...world.source(), importKind: 'historical-reference' },
    });
    expect(history.kind === 'refused' && history.refusal.code).toBe('stock.historical-reference-source');
  });
});

describe('location move and condition change (stock-ledger 13.4)', () => {
  it('PRD-STK-013 PRD-STK-005 a quantity move takes the oldest receipt origin first and keeps condition', async () => {
    const sku = SKUS.quantityA2;
    const older = await receive(sku, 3);
    const newer = await receive(sku, 4);
    written(await world.post(world.poster, [move(sku, 5)]));
    const rows = await custodyOf(sku.skuId);
    const held = (location: 'rack' | 'bin', origin: string) =>
      rows.find((row) => row.locationId === at(location).locationId && row.receiptOriginId === origin)?.quantity ?? 0;
    expect([held('bin', older), held('bin', newer), held('rack', older), held('rack', newer)]).toEqual([3, 2, 0, 2]);
    expect(rows.every((row) => row.condition === 'good')).toBe(true);
    expect(await rebuild()).toEqual([]);
  });

  it('PRD-INT-005 a move of more than is available is refused and moves nothing', async () => {
    const sku = SKUS.quantityB;
    await receive(sku, 2);
    expect((await refusal(world.poster, [move(sku, 3)])).code).toBe('stock.insufficient-available');
    expect((await custodyOf(sku.skuId)).map((row) => row.quantity)).toEqual([2]);
  });

  it('DEC-066 MM-13 a move between units of one Site needs the same book, legal entity and tax registration', async () => {
    const sku = SKUS.quantityA;
    await receive(sku, 4, at('floor'));
    const goods = { skuId: sku.skuId, quantity: 1 };
    const sameBook = { businessUnitId: at('floor2').businessUnitId, locationId: at('floor2').locationId };
    written(
      await world.post(world.poster, [
        { kind: 'location-move', lineId: line(), from: at('floor'), to: sameBook, condition: 'good', goods },
      ]),
    );
    const otherBook = {
      businessUnitId: at('otherBookFloor').businessUnitId,
      locationId: at('otherBookFloor').locationId,
    };
    const refused = await refusal(world.poster, [
      { kind: 'location-move', lineId: line(), from: at('floor'), to: otherBook, condition: 'good', goods },
    ]);
    expect(refused.code).toBe('stock.route-not-allowed');
    expect(await rebuild()).toEqual([]);
  });

  it('PRD-MER-016 piece-tracked goods move by their piece codes; a piece elsewhere is refused', async () => {
    const pieceCodes = codes(3);
    await receive(SKUS.pieceB, 3, at('rack'), pieceCodes);
    const first = [pieceCodes[0] ?? ''];
    written(await world.post(world.poster, [move(SKUS.pieceB, 1, { pieceCodes: first })]));
    const moved = await world.run(world.poster.user.id, (context) => pieceByCode(context, first[0] ?? ''));
    expect(moved?.locationId).toBe(at('bin').locationId);
    expect(moved?.movements.map((each) => each.kind)).toEqual(['receipt-count', 'location-move']);
    expect((await refusal(world.poster, [move(SKUS.pieceB, 1, { pieceCodes: first })])).code).toBe(
      'stock.piece-not-at-place',
    );
    expect(await rebuild()).toEqual([]);
  });

  it('PRD-DMG-010 POL-17.02 goods become damaged by a condition change, and never good again by one', async () => {
    const sku = SKUS.quantityB;
    const lineId = line();
    await receive(sku, 2, at('back'));
    written(
      await world.post(world.poster, [
        {
          kind: 'condition-change',
          lineId,
          at: at('back'),
          from: 'good',
          to: 'damaged',
          goods: { skuId: sku.skuId, quantity: 1 },
        },
      ]),
    );
    const rows = (await custodyOf(sku.skuId)).filter((row) => row.locationId === at('back').locationId);
    expect(rows.map((row) => `${row.condition} ${String(row.quantity)}`).sort()).toEqual(['damaged 1', 'good 1']);
    const back = await refusal(world.poster, [
      {
        kind: 'condition-change',
        lineId,
        at: at('back'),
        from: 'damaged',
        to: 'good',
        goods: { skuId: sku.skuId, quantity: 1 },
      },
    ]);
    expect(back).toEqual({
      kind: 'refused',
      code: 'stock.condition-route',
      missing: [
        { kind: 'line', lineId },
        { kind: 'condition', from: 'damaged', to: 'good' },
      ],
    });
    expect(await rebuild()).toEqual([]);
  });
});

/** Goods at the floor made reservable: received, covered by a PT revision and accepted at the Store Site (6.3). */
async function reservable(sku: Sku, quantity: number, pieceCodes?: readonly string[]) {
  const origin = await receive(sku, quantity, at('floor'), pieceCodes);
  const goods: Goods = {
    skuId: sku.skuId,
    quantity,
    ...(pieceCodes === undefined ? { receiptOriginId: origin } : { pieceCodes }),
  };
  const revision = uuidv7();
  const covered = written(
    await world.post(world.poster, [
      {
        kind: 'record-coverage',
        lineId: line(),
        ptRevisionId: revision,
        receiptOriginId: origin,
        ...(pieceCodes === undefined ? { quantity } : { pieceCodes }),
      },
      { kind: 'record-acceptance', lineId: line(), at: at('floor'), goods },
    ]),
  );
  return { origin, revision, goods, coverageId: covered.coverageIds[0] ?? '' };
}

function reserve(goods: Goods, reservationKind: 'transfer' | 'supplier-return' = 'transfer'): LedgerItem {
  return { kind: 'reserve', lineId: line(), reservationKind, at: at('floor'), goods: [goods] };
}

function placeHold(
  goods: readonly Goods[],
  holdKind: 'damage' | 'ordinary' = 'damage',
  place = at('floor'),
): LedgerItem {
  return {
    kind: 'place-hold',
    lineId: line(),
    holdKind,
    reason: 'SYNTHETIC reason',
    at: place,
    condition: 'good',
    goods,
  };
}

describe('coverage and acceptance (stock-ledger 13.5)', () => {
  it('PRD-REC-015 PRD-INT-005 coverage never overlaps: another revision, or more than the origin, is refused', async () => {
    const origin = await receive(SKUS.quantityA, 5, at('back'));
    const cover = (ptRevisionId: string, quantity: number): LedgerItem => ({
      kind: 'record-coverage',
      lineId: line(),
      ptRevisionId,
      receiptOriginId: origin,
      quantity,
    });
    const revision = uuidv7();
    const covered = written(await world.post(world.poster, [cover(revision, 3)]));
    expect((await refusal(world.poster, [cover(uuidv7(), 1)])).code).toBe('stock.coverage-overlap');
    expect((await refusal(world.poster, [cover(revision, 3)])).code).toBe('stock.coverage-overlap');
    written(await world.post(world.poster, [cover(revision, 2)]));
    // PRD-REC-019 a linked correction removes a coverage record once.
    const [first] = covered.coverageIds;
    written(await world.post(world.poster, [{ kind: 'remove-coverage', lineId: line(), coverageId: first ?? '' }]));
    expect(
      (await refusal(world.poster, [{ kind: 'remove-coverage', lineId: line(), coverageId: first ?? '' }])).code,
    ).toBe('stock.exceeds-source');
    expect(await rebuild()).toEqual([]);
  });

  it('PRD-REC-019 coverage a reservation relies on cannot be removed', async () => {
    const { goods, coverageId } = await reservable(SKUS.quantityA2, 2);
    written(await world.post(world.poster, [reserve({ ...goods, quantity: 1 })]));
    expect((await refusal(world.poster, [{ kind: 'remove-coverage', lineId: line(), coverageId }])).code).toBe(
      'stock.exceeds-source',
    );
  });

  it('PRD-REC-021 acceptance records units in custody at the Site; a piece elsewhere, or more than is unaccepted, is refused', async () => {
    const pieceCodes = codes(2);
    await receive(SKUS.pieceA, 2, at('floor'), pieceCodes);
    const accept = (goods: Goods, place = at('floor')): LedgerItem => ({
      kind: 'record-acceptance',
      lineId: line(),
      at: place,
      goods,
    });
    written(
      await world.post(world.poster, [
        accept({ skuId: SKUS.pieceA.skuId, quantity: 1, pieceCodes: [pieceCodes[0] ?? ''] }),
      ]),
    );
    expect(
      (
        await refusal(world.poster, [
          accept({ skuId: SKUS.pieceA.skuId, quantity: 1, pieceCodes: [pieceCodes[1] ?? ''] }, at('back')),
        ])
      ).code,
    ).toBe('stock.piece-not-at-place');
    await receive(SKUS.quantityB, 2, at('floor'));
    expect((await refusal(world.poster, [accept({ skuId: SKUS.quantityB.skuId, quantity: 3 })])).code).toBe(
      'stock.exceeds-source',
    );
    written(await world.post(world.poster, [accept({ skuId: SKUS.quantityB.skuId, quantity: 2 })]));
    // Acceptance moves with the goods inside the Site (13.4 "Keeps condition and acceptance").
    written(
      await world.post(world.poster, [
        {
          kind: 'location-move',
          lineId: line(),
          from: at('floor'),
          to: { businessUnitId: at('back').businessUnitId, locationId: at('back').locationId },
          condition: 'good',
          goods: { skuId: SKUS.quantityB.skuId, quantity: 1 },
        },
      ]),
    );
    const back = (await custodyOf(SKUS.quantityB.skuId)).find(
      (row) => row.locationId === at('back').locationId && row.acceptedQuantity > 0,
    );
    expect(back?.acceptedQuantity).toBe(1);
    expect(await rebuild()).toEqual([]);
  });
});

describe('holds (stock-ledger 13.5; 6.1, 6.2)', () => {
  it('PRD-DMG-001 PRD-DMG-003 a damage hold blocks a move at once; only its own release event ends it', async () => {
    const sku = SKUS.quantityA;
    await receive(sku, 2, at('bin'));
    const fromBin = (quantity: number): LedgerItem => ({
      kind: 'location-move',
      lineId: line(),
      from: at('bin'),
      to: { businessUnitId: at('rack').businessUnitId, locationId: at('rack').locationId },
      condition: 'good',
      goods: { skuId: sku.skuId, quantity },
    });
    const placed = written(
      await world.post(world.poster, [placeHold([{ skuId: sku.skuId, quantity: 2 }], 'damage', at('bin'))]),
    );
    const [holdId] = placed.holdIds;
    const blocked = await refusal(world.poster, [fromBin(1)]);
    expect(blocked.code).toBe('stock.held');
    expect(blocked.missing).toContainEqual({ kind: 'hold', holdKind: 'damage', holdId });
    const wrong = await refusal(world.poster, [
      { kind: 'release-hold', lineId: line(), holdId: holdId ?? '', event: 'released' },
    ]);
    expect(wrong.code).toBe('stock.wrong-release-event');
    written(
      await world.post(world.poster, [
        { kind: 'release-hold', lineId: line(), holdId: holdId ?? '', event: 'report-rejected' },
      ]),
    );
    written(await world.post(world.poster, [fromBin(2)]));
    expect(await rebuild()).toEqual([]);
  });

  it('PRD-REC-006 holds coexist; a hold on units not in custody at the place is refused', async () => {
    const sku = SKUS.quantityA2;
    await receive(sku, 2, at('bin'));
    written(await world.post(world.poster, [placeHold([{ skuId: sku.skuId, quantity: 2 }], 'ordinary', at('bin'))]));
    written(await world.post(world.poster, [placeHold([{ skuId: sku.skuId, quantity: 1 }], 'damage', at('bin'))]));
    expect(
      (await refusal(world.poster, [placeHold([{ skuId: sku.skuId, quantity: 9 }], 'ordinary', at('bin'))])).code,
    ).toBe('stock.not-in-custody');
  });
});

describe('reservations (stock-ledger 13.5; 6.2, 6.3)', () => {
  it('PRD-TRF-006 a reservation needs covered and accepted goods', async () => {
    const sku = SKUS.quantityB;
    const origin = await receive(sku, 2, at('floor'));
    const goods = { skuId: sku.skuId, quantity: 2, receiptOriginId: origin };
    expect((await refusal(world.poster, [reserve(goods)])).code).toBe('stock.not-covered');
    written(
      await world.post(world.poster, [
        { kind: 'record-coverage', lineId: line(), ptRevisionId: uuidv7(), receiptOriginId: origin, quantity: 2 },
      ]),
    );
    expect((await refusal(world.poster, [reserve(goods)])).code).toBe('stock.not-accepted');
    written(await world.post(world.poster, [{ kind: 'record-acceptance', lineId: line(), at: at('floor'), goods }]));
    written(await world.post(world.poster, [reserve(goods)]));
  });

  it('PRD-INT-005 PRD-TRF-022 reservations never overlap, and end only by their own event', async () => {
    const pieceCodes = codes(2);
    const { goods } = await reservable(SKUS.pieceA, 2, pieceCodes);
    const one = { ...goods, quantity: 1, pieceCodes: [pieceCodes[0] ?? ''] };
    const made = written(await world.post(world.poster, [reserve(one)]));
    expect((await refusal(world.poster, [reserve(one)])).code).toBe('stock.reservation-overlap');
    // A reserved piece never leaves its unit by a location move (13.9; product owner, 8 Oct 2026).
    expect(
      (
        await refusal(world.poster, [
          {
            kind: 'location-move',
            lineId: line(),
            from: at('floor'),
            to: { businessUnitId: at('floor2').businessUnitId, locationId: at('floor2').locationId },
            condition: 'good',
            goods: one,
          },
        ])
      ).code,
    ).toBe('stock.reserved');
    const [reservationId] = made.reservationIds;
    const end = (event: string): LedgerItem => ({
      kind: 'end-reservation',
      lineId: line(),
      reservationId: reservationId ?? '',
      event,
    });
    expect((await refusal(world.poster, [end('withdrawn')])).code).toBe('stock.wrong-release-event');
    written(await world.post(world.poster, [end('cancelled')]));
    expect((await refusal(world.poster, [end('cancelled')])).code).toBe('stock.exceeds-source');
    written(await world.post(world.poster, [reserve(one)]));
    expect(await rebuild()).toEqual([]);
  });

  it('PRD-TRF-007 a hold falling on reserved units keeps the reservation; available counts each once', async () => {
    const sku = SKUS.quantityA;
    const { goods } = await reservable(sku, 4);
    written(await world.post(world.poster, [reserve({ ...goods, quantity: 2 })]));
    written(
      await world.post(world.poster, [
        placeHold([{ skuId: sku.skuId, quantity: 1, receiptOriginId: goods.receiptOriginId ?? '' }]),
      ]),
    );
    const rows = (
      await world.run(world.poster.user.id, (context) =>
        availability(context, {
          siteId: at('floor').siteId,
          businessUnitId: at('floor').businessUnitId,
          skuId: sku.skuId,
        }),
      )
    ).rows.filter((row) => row.receiptOriginId === goods.receiptOriginId);
    expect(rows).toMatchObject([{ quantity: 4, reserved: 2, heldOutsideReservations: 1, available: 1 }]);
  });
});

describe('count freeze (stock-ledger 13.5; 8.1)', () => {
  it('PRD-STK-009 a freeze stops every movement into or out of its scope until the count closes', async () => {
    const sku = SKUS.quantityB;
    await receive(sku, 3, at('rack'));
    const started = written(
      await world.post(world.poster, [
        {
          kind: 'start-count-freeze',
          lineId: line(),
          siteId: at('rack').siteId,
          businessUnitId: at('rack').businessUnitId,
          reason: 'SYNTHETIC cycle count',
          scope: [{ locationId: at('rack').locationId }],
        },
      ]),
    );
    const [freezeId] = started.holdIds;
    // Its expected quantities are the balances in its scope under its lock (8.1).
    expect(started.expected.some((row) => row.skuId === sku.skuId && row.quantity >= 3)).toBe(true);
    const out = await refusal(world.poster, [move(sku, 1)]);
    expect(out).toMatchObject({ code: 'stock.count-freeze-active' });
    expect(out.missing).toContainEqual({ kind: 'count-freeze', holdId: freezeId });
    // Into the scope too: a receipt count at the frozen location.
    expect(
      (
        await refusal(world.poster, [
          {
            kind: 'receipt-count',
            lineId: line(),
            skuId: sku.skuId,
            quantity: 1,
            to: at('rack'),
            condition: 'good',
            owner: { kind: 'unknown' },
          },
        ])
      ).code,
    ).toBe('stock.count-freeze-active');
    // A second freeze over the same units.
    expect(
      (
        await refusal(world.poster, [
          {
            kind: 'start-count-freeze',
            lineId: line(),
            siteId: at('rack').siteId,
            businessUnitId: at('rack').businessUnitId,
            reason: 'SYNTHETIC second count',
            scope: [{ skuId: sku.skuId }],
          },
        ])
      ).code,
    ).toBe('stock.count-freeze-active');
    // An ordinary release cannot end it; only the count's closure does, once.
    expect(
      (
        await refusal(world.poster, [
          { kind: 'release-hold', lineId: line(), holdId: freezeId ?? '', event: 'released' },
        ])
      ).code,
    ).toBe('stock.invalid-item');
    written(await world.post(world.poster, [{ kind: 'end-count-freeze', lineId: line(), holdId: freezeId ?? '' }]));
    expect(
      (await refusal(world.poster, [{ kind: 'end-count-freeze', lineId: line(), holdId: freezeId ?? '' }])).code,
    ).toBe('stock.exceeds-source');
    written(await world.post(world.poster, [move(sku, 1)]));
    expect(await rebuild()).toEqual([]);
  });
});

describe('what the actor cannot see (stock-ledger 14.1, 14.3; code-house-rules 6.2; DEC-117)', () => {
  it('DEC-117 a brand-limited move inside a count freeze over another brand too is refused generically, naming nothing of it', async () => {
    const back = at('back');
    await receive(SKUS.quantityA2, 2, back);
    await receive(SKUS.pieceB, 1, back, codes(1));
    const started = written(
      await world.post(world.poster, [
        {
          kind: 'start-count-freeze',
          lineId: line(),
          siteId: back.siteId,
          businessUnitId: back.businessUnitId,
          reason: 'SYNTHETIC full count',
          scope: [{ locationId: back.locationId }],
        },
      ]),
    );
    const [freezeId] = started.holdIds;
    const lineId = line();
    const item: LedgerItem = {
      kind: 'location-move',
      lineId,
      from: back,
      to: { businessUnitId: at('floor').businessUnitId, locationId: at('floor').locationId },
      condition: 'good',
      goods: { skuId: SKUS.quantityA2.skuId, quantity: 1 },
    };
    const hidden = await refusal(world.brandLimited, [item]);
    expect(hidden).toEqual({ kind: 'refused', code: 'stock.blocked', missing: [{ kind: 'line', lineId }] });
    expect(JSON.stringify(hidden)).not.toContain(freezeId);
    // The reader scoped to every brand is told which freeze it is (13.8 `count-freeze-active`).
    const seen = await refusal(world.poster, [item]);
    expect(seen.code).toBe('stock.count-freeze-active');
    expect(seen.missing).toContainEqual({ kind: 'count-freeze', holdId: freezeId });
    written(await world.post(world.poster, [{ kind: 'end-count-freeze', lineId: line(), holdId: freezeId ?? '' }]));
    written(await world.post(world.brandLimited, [{ ...item, lineId: line() }]));
  });

  it('DEC-117 a brand-limited reservation of goods a hold over another brand too claims counts that claim, and says only blocked', async () => {
    const sku = SKUS.quantityA2;
    const origin = await receive(sku, 2, at('floor2'));
    const goods = { skuId: sku.skuId, quantity: 2, receiptOriginId: origin };
    written(
      await world.post(world.poster, [
        { kind: 'record-coverage', lineId: line(), ptRevisionId: uuidv7(), receiptOriginId: origin, quantity: 2 },
        { kind: 'record-acceptance', lineId: line(), at: at('floor2'), goods },
      ]),
    );
    await receive(SKUS.quantityB, 1, at('floor2'));
    const held = written(
      await world.post(world.poster, [
        placeHold(
          [
            { skuId: sku.skuId, quantity: 1, receiptOriginId: origin },
            { skuId: SKUS.quantityB.skuId, quantity: 1 },
          ],
          'ordinary',
          at('floor2'),
        ),
      ]),
    );
    const reserveAt = (quantity: number): LedgerItem => ({
      kind: 'reserve',
      lineId: line(),
      reservationKind: 'transfer',
      at: at('floor2'),
      goods: [{ ...goods, quantity }],
    });
    // Whoever can see the hold is told it is held, with its kind.
    const seen = await refusal(world.poster, [reserveAt(2)]);
    expect(seen.code).toBe('stock.held');
    expect(seen.missing).toContainEqual({ kind: 'hold', holdKind: 'ordinary', holdId: held.holdIds[0] });
    // The brand-limited actor cannot see the hold, which records brand B too: the refusal is generic.
    const hidden = await refusal(world.brandLimited, [reserveAt(2)]);
    expect(hidden.code).toBe('stock.blocked');
    expect(hidden.missing).toEqual([{ kind: 'line', lineId: expect.any(String) as string }]);
    expect(JSON.stringify(hidden)).not.toContain(held.holdIds[0]);
    // The one unit the hidden hold leaves free is reservable, as it is for anyone (6.2).
    written(await world.post(world.brandLimited, [reserveAt(1)]));
    expect(await rebuild()).toEqual([]);
  });
});

describe('approval use (access-and-approvals 9.7, 9.8; stock-ledger 10.4, 13.1; DEC-097)', () => {
  const damage = (place = at('rack')): LedgerItem => ({
    kind: 'condition-change',
    lineId: line(),
    at: place,
    from: 'good',
    to: 'damaged',
    goods: { skuId: SKUS.quantityA.skuId, quantity: 1 },
  });

  it('DEC-097 an approved document posts once with its decision; the decision is never used again', async () => {
    const document = { recordId: uuidv7(), versionId: uuidv7() };
    const { decision } = await world.approve(world.poster, document);
    if (decision.kind !== 'success') throw new Error(decision.refusal.code);
    const approval = { decisionId: decision.answer.decisionId, actionType: APPROVE_DOCUMENT };
    const source = world.source(document.recordId, document.versionId);
    const posted = written(await world.post(world.poster, [damage()], { source, approval }));
    // The use is the approval evidence, and the movement keeps it (13.3; PRD-INT-004), read as the owner.
    const owner = await connect(world.database, 'migration');
    try {
      const evidence = await owner.query<{ uses: string; carried: string }>(
        `select (select count(*) from access.approval_use where approval_decision_id = $1)::text as uses,
                (select count(*) from stock.movement m join access.approval_use u on u.id = m.approval_use_id
                 where m.id = $2 and u.approval_decision_id = $1)::text as carried`,
        [approval.decisionId, posted.movementIds[0]],
      );
      expect(evidence.rows[0]).toEqual({ uses: '1', carried: '1' });
    } finally {
      await owner.end();
    }
    const again = await world.post(world.poster, [damage()], { source, approval });
    expect(again.kind === 'refused' && again.refusal.code).toBe('access.approval-used');
  });

  it('PRD-ACS-007 a version other than the one decided is refused for renewed approval', async () => {
    const document = { recordId: uuidv7(), versionId: uuidv7() };
    const { decision } = await world.approve(world.poster, document);
    if (decision.kind !== 'success') throw new Error(decision.refusal.code);
    const changed = await world.post(world.poster, [damage()], {
      source: world.source(document.recordId, uuidv7()),
      approval: { decisionId: decision.answer.decisionId, actionType: APPROVE_DOCUMENT },
    });
    expect(changed.kind === 'refused' && changed.refusal.code).toBe('access.approval-version-changed');
  });

  it('PRD-ACS-006 an approver who is among the preparers of the version posted is refused under the lock', async () => {
    const document = { recordId: uuidv7(), versionId: uuidv7() };
    const { decision } = await world.approve(world.poster, document);
    if (decision.kind !== 'success') throw new Error(decision.refusal.code);
    const selfPrepared = await world.post(world.poster, [damage()], {
      source: world.source(document.recordId, document.versionId),
      approval: {
        decisionId: decision.answer.decisionId,
        actionType: APPROVE_DOCUMENT,
        preparers: [world.poster.user.id, world.approver.user.id],
      },
    });
    expect(selfPrepared.kind === 'refused' && selfPrepared.refusal.code).toBe('access.self-preparation');
  });

  it('POL-02.09 a request on a cost basis has no eligible approver while no approval limit exists (S1-F05)', async () => {
    const { decision } = await world.approve(
      world.poster,
      { recordId: uuidv7(), versionId: uuidv7() },
      APPROVE_ON_COST,
    );
    expect(decision.kind === 'refusal' && decision.refusal.code).toBe('access.no-approval-limit');
  });
});

describe('plan staleness (stock-ledger 13.1)', () => {
  it('stock-ledger 13.1 a receipt origin that appears between Plan and Lock refuses the request as plan-stale', async () => {
    const sku = SKUS.batchA;
    const place = at('floor');
    const receipt = (code: string): LedgerItem => ({
      kind: 'receipt-count',
      lineId: line(),
      skuId: sku.skuId,
      quantity: 1,
      to: place,
      condition: 'good',
      owner: { kind: 'unknown' },
      batch: { code, expiryDate: '2099-06-30' },
    });
    written(await world.post(world.poster, [receipt(syntheticCode('BATCH-2'))]));
    let planned!: () => void;
    const afterPlan = new Promise<void>((resolve) => (planned = resolve));
    let proceed!: () => void;
    const mayLock = new Promise<void>((resolve) => (proceed = resolve));
    const lineId = line();
    const stale = world.run(world.poster.user.id, async (context) => {
      const plan = await world.ledger.plan(context, {
        source: world.source(),
        actor: { kind: 'user', userId: world.poster.user.id, roleAssignmentId: world.poster.roleAssignmentId },
        items: [
          {
            kind: 'location-move',
            lineId,
            from: place,
            to: { businessUnitId: at('back').businessUnitId, locationId: at('back').locationId },
            condition: 'good',
            goods: { skuId: sku.skuId, quantity: 1 },
          },
        ],
      });
      if (plan.kind !== 'done') throw new Error(plan.refusal.code);
      planned();
      await mayLock;
      return world.ledger.recheck(context, await world.ledger.lock(context, plan.value));
    });
    await afterPlan;
    written(await world.post(world.poster, [receipt(syntheticCode('BATCH-3'))]));
    proceed();
    const checked = await stale;
    expect(checked.kind === 'refused' && checked.refusal).toEqual({
      kind: 'conflict',
      code: 'stock.plan-stale',
      missing: [{ kind: 'line', lineId }],
    });
  });
});

// S1-F10 review fixes: each correctness finding first as a failing test (S1 to S10, T7).

/** Places a fresh SYNTHETIC SKU's goods at the floor, covered and accepted as given (6.3). */
async function onFloor(options: { quantity: number; covered: number; accepted: number }) {
  const sku = addSyntheticSku();
  const origin = await receive(sku, options.quantity, at('floor'));
  const items: LedgerItem[] = [];
  if (options.covered > 0) {
    items.push({
      kind: 'record-coverage',
      lineId: line(),
      ptRevisionId: uuidv7(),
      receiptOriginId: origin,
      quantity: options.covered,
    });
  }
  if (options.accepted > 0) {
    items.push({
      kind: 'record-acceptance',
      lineId: line(),
      at: at('floor'),
      goods: { skuId: sku.skuId, quantity: options.accepted, receiptOriginId: origin },
    });
  }
  if (items.length > 0) written(await world.post(world.poster, items));
  return { sku, origin };
}

async function availableAt(skuId: string, place = at('floor')) {
  return (
    await world.run(world.poster.user.id, (context) =>
      availability(context, { siteId: place.siteId, businessUnitId: place.businessUnitId, skuId }),
    )
  ).rows;
}

describe('review fixes: reservations never exceed covered stock (stock-ledger 6.2, 13.9; S1)', () => {
  it('PRD-TRF-006 PRD-INT-005 an origin split across two units reserves at most its covered quantity in all', async () => {
    const { sku, origin } = await onFloor({ quantity: 5, covered: 3, accepted: 5 });
    const goods = (quantity: number) => ({ skuId: sku.skuId, quantity, receiptOriginId: origin });
    // Two of its units move to the other unit of the Site, with their acceptance (13.4).
    written(
      await world.post(world.poster, [
        {
          kind: 'location-move',
          lineId: line(),
          from: at('floor'),
          to: { businessUnitId: at('floor2').businessUnitId, locationId: at('floor2').locationId },
          condition: 'good',
          goods: goods(2),
        },
      ]),
    );
    written(await world.post(world.poster, [reserve(goods(3))]));
    const elsewhere: LedgerItem = {
      kind: 'reserve',
      lineId: line(),
      reservationKind: 'transfer',
      at: at('floor2'),
      goods: [goods(1)],
    };
    expect((await refusal(world.poster, [elsewhere])).code).toBe('stock.not-covered');
    expect(await rebuild()).toEqual([]);
  });

  it('PRD-TRF-006 within one unit too: a second location of the origin finds its coverage taken', async () => {
    const { sku, origin } = await onFloor({ quantity: 4, covered: 2, accepted: 4 });
    const goods = (quantity: number) => ({ skuId: sku.skuId, quantity, receiptOriginId: origin });
    written(
      await world.post(world.poster, [
        {
          kind: 'location-move',
          lineId: line(),
          from: at('floor'),
          to: { businessUnitId: at('back').businessUnitId, locationId: at('back').locationId },
          condition: 'good',
          goods: goods(2),
        },
      ]),
    );
    written(await world.post(world.poster, [reserve(goods(2))]));
    const atBack: LedgerItem = {
      kind: 'reserve',
      lineId: line(),
      reservationKind: 'transfer',
      at: at('back'),
      goods: [goods(1)],
    };
    expect((await refusal(world.poster, [atBack])).code).toBe('stock.not-covered');
  });
});

describe('review fixes: overlapping holds count once (stock-ledger 6.2; S2)', () => {
  it('PRD-REC-006 two holds on the same units count once; releasing one leaves the other', async () => {
    const { sku, origin } = await onFloor({ quantity: 2, covered: 2, accepted: 2 });
    const goods = (quantity: number) => ({ skuId: sku.skuId, quantity, receiptOriginId: origin });
    const ordinary = written(await world.post(world.poster, [placeHold([goods(2)], 'ordinary')]));
    written(await world.post(world.poster, [placeHold([goods(1)])]));
    expect((await availableAt(sku.skuId))[0]).toMatchObject({ quantity: 2, heldOutsideReservations: 2, available: 0 });
    written(
      await world.post(world.poster, [
        { kind: 'release-hold', lineId: line(), holdId: ordinary.holdIds[0] ?? '', event: 'released' },
      ]),
    );
    expect((await availableAt(sku.skuId))[0]).toMatchObject({ quantity: 2, heldOutsideReservations: 1, available: 1 });
    expect((await refusal(world.poster, [reserve(goods(2))])).code).toBe('stock.held');
    written(await world.post(world.poster, [reserve(goods(1))]));
    expect(await rebuild()).toEqual([]);
  });
});

describe('review fixes: blocked names the item it blocks (stock-ledger 13.8; S3)', () => {
  it('DEC-117 a hidden claim on the second item is refused naming that item, not the first', async () => {
    const free = await onFloor({ quantity: 1, covered: 1, accepted: 1 });
    const held = await onFloor({ quantity: 2, covered: 2, accepted: 2 });
    const other = addSyntheticSku(BRAND_B);
    await receive(other, 1, at('floor'));
    written(
      await world.post(world.poster, [
        placeHold(
          [
            { skuId: held.sku.skuId, quantity: 2, receiptOriginId: held.origin },
            { skuId: other.skuId, quantity: 1 },
          ],
          'ordinary',
        ),
      ]),
    );
    const first = reserve({ skuId: free.sku.skuId, quantity: 1, receiptOriginId: free.origin });
    const second = reserve({ skuId: held.sku.skuId, quantity: 1, receiptOriginId: held.origin });
    expect(await refusal(world.brandLimited, [first, second])).toEqual({
      kind: 'refused',
      code: 'stock.blocked',
      missing: [{ kind: 'line', lineId: second.lineId }],
    });
  });
});

describe('review fixes: Rebuild and compare (stock-ledger 2.1, 13.6; S4)', () => {
  it('PRD-MOD-012 a balance or SKU balance missing for its legs is a difference', async () => {
    const sku = addSyntheticSku();
    await receive(sku, 3, at('bin'));
    const owner = await connect(world.database, 'migration');
    try {
      // As the owner, outside every command: take the projection rows away, as a fault would.
      await owner.query('begin');
      await owner.query(
        'create temp table kept_balance on commit drop as select * from stock.balance where sku_id = $1',
        [sku.skuId],
      );
      await owner.query(
        'create temp table kept_total on commit drop as select * from stock.sku_balance where sku_id = $1',
        [sku.skuId],
      );
      await owner.query('delete from stock.balance where sku_id = $1', [sku.skuId]);
      await owner.query('delete from stock.sku_balance where sku_id = $1', [sku.skuId]);
      await owner.query('commit');
      expect(await rebuild()).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ table: 'balance', id: null, column: 'quantity', stored: null, rebuilt: 3 }),
          expect.objectContaining({ table: 'sku_balance', id: null, column: 'quantity', stored: null, rebuilt: 3 }),
        ]),
      );
      // Put the projection back as the entries give it, so the other tests' checks hold.
      const total = uuidv7();
      const place = at('bin');
      await owner.query(
        `insert into stock.sku_balance (id, site_id, business_unit_id, sku_id, stock_unit, quantity, store_id,
           legal_entity_id, brand_id)
         values ($1, $2, $3, $4, 'piece', 3, null, $5, $6)`,
        [total, place.siteId, place.businessUnitId, sku.skuId, PLACES.legalEntity, BRAND_A],
      );
      await owner.query(
        `insert into stock.balance (id, sku_balance_id, site_id, business_unit_id, location_id, condition, held_as,
           sku_id, receipt_origin_id, count_date, quantity, accepted_quantity, store_id, legal_entity_id, brand_id)
         select $1, $2, l.site_id, l.business_unit_id, l.location_id, l.condition, l.held_as, l.sku_id,
                l.receipt_origin_id, o.count_date, l.quantity, 0, l.store_id, l.legal_entity_id, l.brand_id
         from stock.movement_leg l join stock.receipt_origin o on o.id = l.receipt_origin_id where l.sku_id = $3`,
        [uuidv7(), total, sku.skuId],
      );
    } finally {
      await owner.end();
    }
    expect(await rebuild()).toEqual([]);
  });

  it('PRD-MOD-003 says when it is partial: a reader who cannot see every row is told so', async () => {
    await receive(addSyntheticSku(BRAND_B), 1, at('bin'));
    const whole = await world.run(world.poster.user.id, (context) => rebuildAndCompare(context));
    expect(whole.partial).toBe(false);
    const part = await world.run(world.brandLimited.user.id, (context) => rebuildAndCompare(context));
    expect(part.partial).toBe(true);
    expect(typeof part.asOf).toBe('string');
  });
});

describe('review fixes: named pieces lock their receipt origins (stock-ledger 10.3 step 2; S6)', () => {
  it('SL-24 a move of named pieces holds their origin shared until it commits', async () => {
    const pieceCodes = codes(1);
    const origin = await receive(SKUS.pieceA, 1, at('rack'), pieceCodes);
    let state: string | undefined;
    written(
      await world.post(world.poster, [move(SKUS.pieceA, 1, { pieceCodes })], {
        hold: async () => {
          const other = await connect(world.database, 'migration');
          try {
            await other.query('begin');
            state = await sqlState(
              other.query('select 1 from stock.receipt_origin where id = $1 for update nowait', [origin]),
            );
          } finally {
            await other.query('rollback');
            await other.end();
          }
        },
      }),
    );
    expect(state).toBe('55P03');
  });
});

describe('review fixes: condition change only from good (stock-ledger 2.3, 13.4; S7)', () => {
  it('PRD-DMG-010 POL-17.02 damaged goods never become wrong or unidentified by a condition change', async () => {
    const sku = addSyntheticSku();
    await receive(sku, 1, at('back'));
    const change = (from: 'good' | 'damaged', to: 'damaged' | 'wrong'): LedgerItem => ({
      kind: 'condition-change',
      lineId: line(),
      at: at('back'),
      from,
      to,
      goods: { skuId: sku.skuId, quantity: 1 },
    });
    written(await world.post(world.poster, [change('good', 'damaged')]));
    expect((await refusal(world.poster, [change('damaged', 'wrong')])).code).toBe('stock.condition-route');
  });
});

describe('review fixes: a unit anchor not locked is refused (stock-ledger 14.3; S9)', () => {
  it('stock-ledger 10.3 a missing unit anchor never skips the count-freeze interlock', async () => {
    const sku = addSyntheticSku();
    await receive(sku, 1, at('rack'));
    const checked = await world.run(world.poster.user.id, async (context) => {
      const plan = await world.ledger.plan(context, {
        source: world.source(),
        actor: { kind: 'user', userId: world.poster.user.id, roleAssignmentId: world.poster.roleAssignmentId },
        items: [move(sku, 1)],
      });
      if (plan.kind !== 'done') throw new Error(plan.refusal.code);
      const locked = await world.ledger.lock(context, plan.value);
      const anchor = { table: lockTable('stock', 'unit_anchor'), id: uuidv7(), mode: 'shared' as const };
      return world.ledger.recheck(context, { ...locked, missing: [anchor] });
    });
    expect(checked.kind === 'refused' && checked.refusal.code).toBe('stock.invalid-item');
  });
});

describe('review fixes: Availability given coverage and acceptance (stock-ledger 13.6; S10)', () => {
  it('PRD-TRF-006 units not covered or not accepted are not available', async () => {
    const { sku, origin } = await onFloor({ quantity: 3, covered: 0, accepted: 0 });
    expect((await availableAt(sku.skuId))[0]).toMatchObject({ quantity: 3, available: 0 });
    written(
      await world.post(world.poster, [
        { kind: 'record-coverage', lineId: line(), ptRevisionId: uuidv7(), receiptOriginId: origin, quantity: 2 },
      ]),
    );
    expect((await availableAt(sku.skuId))[0]).toMatchObject({ available: 0 });
    written(
      await world.post(world.poster, [
        {
          kind: 'record-acceptance',
          lineId: line(),
          at: at('floor'),
          goods: { skuId: sku.skuId, quantity: 3, receiptOriginId: origin },
        },
      ]),
    );
    expect((await availableAt(sku.skuId))[0]).toMatchObject({ coveredQuantity: 2, acceptedQuantity: 3, available: 2 });
  });
});

describe('review fixes: Record use rechecks what Verify under lock checks (access-and-approvals 9.8; T7)', () => {
  it('DEC-097 a use for another document or action type is refused as not for the document', async () => {
    const document = { recordId: uuidv7(), versionId: uuidv7() };
    const { decision } = await world.approve(world.poster, document);
    if (decision.kind !== 'success') throw new Error(decision.refusal.code);
    const use = (recordId: string, actionType: string) =>
      world.run(world.poster.user.id, (context) =>
        world.access.recordUse(context, {
          useId: uuidv7(),
          decisionId: decision.answer.decisionId,
          actionType,
          document: {
            module: SYNTHETIC_MODULE,
            recordType: SYNTHETIC_DOCUMENT_TYPE,
            recordId,
            versionId: document.versionId,
          },
          preparers: [world.poster.user.id],
          value: { kind: 'none' },
          actor: { kind: 'user', id: world.poster.user.id },
        }),
      );
    expect((await use(uuidv7(), APPROVE_DOCUMENT))?.code).toBe('access.approval-not-for-document');
    expect((await use(document.recordId, APPROVE_ON_COST))?.code).toBe('access.approval-not-for-document');
    expect(await use(document.recordId, APPROVE_DOCUMENT)).toBeUndefined();
  });
});

describe('a location move carries reserved units inside one unit (stock-ledger 13.9; product owner, 8 Oct 2026)', () => {
  const toBack = { businessUnitId: at('back').businessUnitId, locationId: at('back').locationId };

  it('POL-17.01 PRD-TRF-022 reserved units move with their claim inside the unit; the reservation is not broken', async () => {
    const { sku, origin } = await onFloor({ quantity: 3, covered: 3, accepted: 3 });
    const goods = (quantity: number) => ({ skuId: sku.skuId, quantity, receiptOriginId: origin });
    const made = written(await world.post(world.poster, [reserve(goods(2))]));
    // Between two units the reserved units stay: a location move never takes them out of their unit.
    const leaving: LedgerItem = {
      kind: 'location-move',
      lineId: line(),
      from: at('floor'),
      to: { businessUnitId: at('floor2').businessUnitId, locationId: at('floor2').locationId },
      condition: 'good',
      goods: goods(3),
    };
    expect((await refusal(world.poster, [leaving])).code).toBe('stock.reserved');
    written(
      await world.post(world.poster, [
        { kind: 'location-move', lineId: line(), from: at('floor'), to: toBack, condition: 'good', goods: goods(3) },
      ]),
    );
    expect(await availableAt(sku.skuId)).toMatchObject([
      { locationId: at('back').locationId, quantity: 3, reserved: 2, available: 1 },
    ]);
    expect(await rebuild()).toEqual([]);
    // The reservation still holds its units where they now are, and ends by its own event, once.
    const [reservationId] = made.reservationIds;
    const end: LedgerItem = {
      kind: 'end-reservation',
      lineId: line(),
      reservationId: reservationId ?? '',
      event: 'cancelled',
    };
    written(await world.post(world.poster, [end]));
    expect((await availableAt(sku.skuId, at('back')))[0]).toMatchObject({ reserved: 0, available: 3 });
    expect((await refusal(world.poster, [{ ...end, lineId: line() }])).code).toBe('stock.exceeds-source');
    expect(await rebuild()).toEqual([]);
  });

  it('POL-17.01 a reserved piece moves inside its unit and stays reserved; held goods are still refused', async () => {
    const pieceCodes = codes(2);
    const { goods } = await reservable(SKUS.pieceB, 2, pieceCodes);
    const first = { ...goods, quantity: 1, pieceCodes: [pieceCodes[0] ?? ''] };
    const second = { ...goods, quantity: 1, pieceCodes: [pieceCodes[1] ?? ''] };
    written(await world.post(world.poster, [reserve(first)]));
    written(
      await world.post(world.poster, [
        { kind: 'location-move', lineId: line(), from: at('floor'), to: toBack, condition: 'good', goods: first },
      ]),
    );
    const moved = await world.run(world.poster.user.id, (context) => pieceByCode(context, pieceCodes[0] ?? ''));
    expect(moved?.locationId).toBe(at('back').locationId);
    const again: LedgerItem = {
      kind: 'reserve',
      lineId: line(),
      reservationKind: 'transfer',
      at: at('back'),
      goods: [first],
    };
    expect((await refusal(world.poster, [again])).code).toBe('stock.reservation-overlap');
    written(await world.post(world.poster, [placeHold([second], 'ordinary')]));
    expect(
      (
        await refusal(world.poster, [
          { kind: 'location-move', lineId: line(), from: at('floor'), to: toBack, condition: 'good', goods: second },
        ])
      ).code,
    ).toBe('stock.held');
    expect(await rebuild()).toEqual([]);
  });
});
