import { describe, expect, it } from 'vitest';
import { destinationAllowed, originToScan, progressOf, type CoveredGoods } from './scan-in.js';

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
  held: 0,
  ...changes,
});

describe('what waits for the scan-in (goods-in 7.2, 7.3)', () => {
  it('PRD-REC-021 counts a piece as waiting while it is at the receiving location, good, not accepted and not held', () => {
    expect(progressOf([row()], RECEIVING)).toEqual([{ skuId: 'sku-a', covered: 3, accepted: 0, waiting: 3, held: 0 }]);
  });

  it('PRD-REC-022 an accepted piece moved to the floor no longer waits; the origin is covered once', () => {
    expect(progressOf([row({ quantity: 2 }), row({ locationId: FLOOR, quantity: 1, accepted: 1 })], RECEIVING)).toEqual(
      [{ skuId: 'sku-a', covered: 3, accepted: 1, waiting: 2, held: 0 }],
    );
  });

  it('PRD-DMG-001 a piece under a damage hold, or damaged, is held and does not wait', () => {
    expect(
      progressOf([row({ quantity: 2, held: 1 }), row({ condition: 'damaged', quantity: 1, held: 1 })], RECEIVING),
    ).toEqual([{ skuId: 'sku-a', covered: 3, accepted: 0, waiting: 1, held: 2 }]);
  });

  it('PRD-REC-021 holds on a balance count once, never more than its units', () => {
    expect(progressOf([row({ held: 5 })], RECEIVING)).toEqual([
      { skuId: 'sku-a', covered: 3, accepted: 0, waiting: 0, held: 3 },
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
      { skuId: 'sku-a', covered: 3, accepted: 0, waiting: 3, held: 0 },
      { skuId: 'sku-b', covered: 3, accepted: 0, waiting: 1, held: 0 },
    ]);
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
  const at = (atStore: boolean, kind: string, id = FLOOR) => destinationAllowed({ atStore }, { id, kind }, RECEIVING);

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
