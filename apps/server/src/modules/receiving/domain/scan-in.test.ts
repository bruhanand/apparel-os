import type { LocationKind } from '@apparel-os/schemas';
import { describe, expect, it } from 'vitest';
import { destinationAllowed, originToScan, progressOf, scanInComplete, type CoveredGoods } from './scan-in.js';

// The scan-in's rules (goods-in 7.2, 7.3, 7.5; PRD-REC-021, PRD-REC-022; S2-F07-T01), worked by hand. SYNTHETIC
// identifiers.

const RECEIVING = 'loc-receiving';
const FLOOR = 'loc-floor';

const row = (changes: Partial<CoveredGoods> = {}): CoveredGoods => ({
  receiptOriginId: 'origin-1',
  skuId: 'sku-a',
  covered: 3,
  locationId: RECEIVING,
  condition: 'good',
  quantity: 3,
  accepted: 0,
  damageHeld: 0,
  otherHeld: 0,
  ...changes,
});

describe('what waits for the scan-in (goods-in 7.2, 7.3)', () => {
  it('PRD-REC-021 counts a piece as waiting while it is at the receiving location, good, not accepted and not held', () => {
    expect(progressOf([row()], RECEIVING)).toEqual([
      { skuId: 'sku-a', covered: 3, accepted: 0, waiting: 3, damaged: 0, held: 0 },
    ]);
  });

  it('PRD-REC-022 an accepted piece moved to the floor no longer waits; the origin is covered once', () => {
    expect(progressOf([row({ quantity: 2 }), row({ locationId: FLOOR, quantity: 1, accepted: 1 })], RECEIVING)).toEqual(
      [{ skuId: 'sku-a', covered: 3, accepted: 1, waiting: 2, damaged: 0, held: 0 }],
    );
  });

  it('PRD-DMG-001 a piece under a damage hold, or damaged, is under a damage report and does not wait', () => {
    expect(
      progressOf(
        [row({ quantity: 2, damageHeld: 1 }), row({ condition: 'damaged', quantity: 1, damageHeld: 1 })],
        RECEIVING,
      ),
    ).toEqual([{ skuId: 'sku-a', covered: 3, accepted: 0, waiting: 1, damaged: 2, held: 0 }]);
  });

  it('PRD-REC-022 a piece under another hold, or in another condition, neither waits nor is under a damage report', () => {
    expect(
      progressOf(
        [row({ quantity: 2, otherHeld: 1 }), row({ condition: 'wrong', quantity: 1, otherHeld: 0 })],
        RECEIVING,
      ),
    ).toEqual([{ skuId: 'sku-a', covered: 3, accepted: 0, waiting: 1, damaged: 0, held: 2 }]);
  });

  it('PRD-REC-021 holds on a balance count once, never more than its units, damage holds first', () => {
    expect(progressOf([row({ damageHeld: 2, otherHeld: 5 })], RECEIVING)).toEqual([
      { skuId: 'sku-a', covered: 3, accepted: 0, waiting: 0, damaged: 2, held: 1 },
    ]);
    expect(progressOf([row({ damageHeld: 5 })], RECEIVING)).toEqual([
      { skuId: 'sku-a', covered: 3, accepted: 0, waiting: 0, damaged: 3, held: 0 },
    ]);
  });

  it('PRD-REC-021 counts each product of the PT apart, an origin with none in custody covered all the same', () => {
    expect(
      progressOf(
        [
          row(),
          row({ receiptOriginId: 'origin-2', skuId: 'sku-b', covered: 1, quantity: 1 }),
          row({
            receiptOriginId: 'origin-3',
            skuId: 'sku-b',
            covered: 2,
            locationId: null,
            condition: null,
            quantity: 0,
          }),
        ],
        RECEIVING,
      ),
    ).toEqual([
      { skuId: 'sku-a', covered: 3, accepted: 0, waiting: 3, damaged: 0, held: 0 },
      { skuId: 'sku-b', covered: 3, accepted: 0, waiting: 1, damaged: 0, held: 0 },
    ]);
  });
});

describe('when the scan-in is complete (goods-in 7.3)', () => {
  const complete = (rows: readonly CoveredGoods[]) => scanInComplete(progressOf(rows, RECEIVING));

  it('PRD-REC-022 complete once every piece the PT covers is accepted or under a damage report', () => {
    expect(complete([row({ locationId: FLOOR, accepted: 3 })])).toBe(true);
    expect(complete([row({ locationId: FLOOR, quantity: 2, accepted: 2 }), row({ quantity: 1, damageHeld: 1 })])).toBe(
      true,
    );
    expect(
      complete([row({ locationId: FLOOR, quantity: 2, accepted: 2 }), row({ condition: 'damaged', quantity: 1 })]),
    ).toBe(true);
  });

  it('PRD-REC-022 not complete while a piece waits, or is under another hold, which no scan accepts', () => {
    expect(complete([row({ locationId: FLOOR, quantity: 2, accepted: 2 }), row({ quantity: 1 })])).toBe(false);
    expect(complete([row({ locationId: FLOOR, quantity: 2, accepted: 2 }), row({ quantity: 1, otherHeld: 1 })])).toBe(
      false,
    );
  });
});

describe('which piece a scan takes (goods-in 7.2; PRD-STK-013)', () => {
  it('PRD-STK-013 takes the oldest origin of the product with a piece waiting', () => {
    const rows = [
      row({ receiptOriginId: 'origin-2' }),
      row({ receiptOriginId: 'origin-1', quantity: 1, accepted: 1 }),
      row({ receiptOriginId: 'origin-3', skuId: 'sku-b' }),
    ];
    expect(originToScan(rows, 'sku-a', RECEIVING)).toBe('origin-2');
    expect(originToScan([...rows, row({ receiptOriginId: 'origin-0', quantity: 1 })], 'sku-a', RECEIVING)).toBe(
      'origin-0',
    );
  });

  it('PRD-REC-022 takes nothing when no piece of the product waits', () => {
    expect(originToScan([row({ accepted: 3 })], 'sku-a', RECEIVING)).toBeUndefined();
    expect(originToScan([row()], 'sku-b', RECEIVING)).toBeUndefined();
  });
});

describe('where a piece may go (goods-in 7.2)', () => {
  const at = (atStore: boolean, kind: LocationKind, id = FLOOR) =>
    destinationAllowed({ atStore }, { id, kind }, RECEIVING);

  it('PRD-REC-021 at a Store the floor or the backstore; at a warehouse a bin', () => {
    expect(at(true, 'floor')).toBe(true);
    expect(at(true, 'backstore')).toBe(true);
    expect(at(true, 'bin')).toBe(false);
    expect(at(true, 'zone')).toBe(false);
    expect(at(false, 'bin')).toBe(true);
    expect(at(false, 'floor')).toBe(false);
    expect(at(false, 'rack')).toBe(false);
  });

  it('PRD-REC-022 never the receiving location itself, so what waits there is what is not scanned in', () => {
    expect(at(true, 'backstore', RECEIVING)).toBe(false);
    expect(at(false, 'bin', RECEIVING)).toBe(false);
  });
});
