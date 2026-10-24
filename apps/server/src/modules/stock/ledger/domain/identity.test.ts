import { describe, expect, it } from 'vitest';
import { splitIdentity } from './identity.js';

// The identity step's split rule (stock-ledger 13.14; goods-in 6.3 step 4; GI-1): the receipt origins of one style and
// size take the SKUs the PT's rows give it, by quantity. Worked examples written by hand; every identifier SYNTHETIC.

const RED = 'origin-red-m';
const BLUE = 'origin-blue-m';
const NAMED = 'origin-named-x';

/** New origin identifiers in the order the split asks for them, as the caller would make them. */
function newIds(): () => string {
  let made = 0;
  return () => `new-origin-${String(++made)}`;
}

describe('splitIdentity (stock-ledger 13.14; goods-in 6.3 step 4)', () => {
  it('PRD-DMG-005 PRD-REC-016 DEC-138 fills the PT rows in their order from the origins in theirs, every unit once', () => {
    expect(
      splitIdentity(
        [
          { receiptOriginId: RED, skuId: null, units: 5 },
          { receiptOriginId: BLUE, skuId: null, units: 3 },
        ],
        [
          { skuId: 'sku-a', quantity: 6 },
          { skuId: 'sku-b', quantity: 2 },
        ],
        newIds(),
      ),
    ).toEqual({
      kind: 'split',
      parts: [
        { receiptOriginId: RED, skuId: 'sku-a', quantity: 5, newReceiptOriginId: 'new-origin-1' },
        { receiptOriginId: BLUE, skuId: 'sku-a', quantity: 1, newReceiptOriginId: 'new-origin-2' },
        { receiptOriginId: BLUE, skuId: 'sku-b', quantity: 2, newReceiptOriginId: 'new-origin-3' },
      ],
    });
  });

  it('PRD-DMG-005 DEC-138 an origin that already names a SKU of the rows keeps it as far as that row goes; the rest is corrected', () => {
    expect(
      splitIdentity(
        [
          { receiptOriginId: RED, skuId: null, units: 2 },
          { receiptOriginId: NAMED, skuId: 'sku-x', units: 4 },
        ],
        [
          { skuId: 'sku-x', quantity: 3 },
          { skuId: 'sku-y', quantity: 3 },
        ],
        newIds(),
      ),
    ).toEqual({
      kind: 'split',
      parts: [
        { receiptOriginId: RED, skuId: 'sku-y', quantity: 2, newReceiptOriginId: 'new-origin-1' },
        { receiptOriginId: NAMED, skuId: 'sku-x', quantity: 3 },
        { receiptOriginId: NAMED, skuId: 'sku-y', quantity: 1, newReceiptOriginId: 'new-origin-2' },
      ],
    });
  });

  it('PRD-DMG-005 DEC-138 an origin naming a SKU the rows do not give is corrected whole', () => {
    expect(
      splitIdentity(
        [{ receiptOriginId: NAMED, skuId: 'sku-x', units: 4 }],
        [{ skuId: 'sku-y', quantity: 4 }],
        newIds(),
      ),
    ).toEqual({
      kind: 'split',
      parts: [{ receiptOriginId: NAMED, skuId: 'sku-y', quantity: 4, newReceiptOriginId: 'new-origin-1' }],
    });
  });

  it('PRD-REC-016 DEC-138 rows of one SKU count together', () => {
    expect(
      splitIdentity(
        [{ receiptOriginId: RED, skuId: null, units: 4 }],
        [
          { skuId: 'sku-a', quantity: 1 },
          { skuId: 'sku-b', quantity: 2 },
          { skuId: 'sku-a', quantity: 1 },
        ],
        newIds(),
      ),
    ).toEqual({
      kind: 'split',
      parts: [
        { receiptOriginId: RED, skuId: 'sku-a', quantity: 2, newReceiptOriginId: 'new-origin-1' },
        { receiptOriginId: RED, skuId: 'sku-b', quantity: 2, newReceiptOriginId: 'new-origin-2' },
      ],
    });
  });

  it('PRD-REC-016 answers a mismatch when the rows do not add up to the units, and splits nothing', () => {
    expect(
      splitIdentity(
        [
          { receiptOriginId: RED, skuId: null, units: 5 },
          { receiptOriginId: BLUE, skuId: null, units: 3 },
        ],
        [{ skuId: 'sku-a', quantity: 7 }],
        newIds(),
      ),
    ).toEqual({ kind: 'mismatch', units: 8, rows: 7 });
  });

  it('stock-ledger 14.1 refuses quantities that are not whole numbers above zero', () => {
    expect(() =>
      splitIdentity([{ receiptOriginId: RED, skuId: null, units: 2 }], [{ skuId: 'sku-a', quantity: 1.5 }], newIds()),
    ).toThrow(/whole/);
    expect(() =>
      splitIdentity([{ receiptOriginId: RED, skuId: null, units: -1 }], [{ skuId: 'sku-a', quantity: 1 }], newIds()),
    ).toThrow(/whole/);
  });
});
