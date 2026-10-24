import { describe, expect, it } from 'vitest';
import { ptIdentityParts } from './identity.js';

// S2-F06-T01: the identity step of a PT approval for one style and size (goods-in 6.3 steps 4 and 5; stock-ledger 13.14;
// GI-1): the GRN's counted pieces take the SKUs of the PT's rows by quantity, an origin that names a SKU of the rows
// keeping it first, and every piece the PT covers moves to a new receipt origin of one SKU and one P RATE, so the cost
// each origin takes is the P RATE of its rows (PRD-PTW-010). Every value is SYNTHETIC.

const origin = (n: number) => `01900000-0000-7000-8000-${String(n).padStart(12, '0')}`;
const SKU_X = '01900000-0000-7000-8000-0000000000aa';
const SKU_Y = '01900000-0000-7000-8000-0000000000bb';

function counter() {
  let next = 100;
  return () => origin(++next);
}

describe('the identity step of a PT approval (goods-in 6.3 steps 4 and 5)', () => {
  it('PRD-PTW-010 GI-1 gives every covered piece a new origin of one SKU and one P RATE, an origin naming a SKU keeping it first', () => {
    // Worked by hand: O1 (no SKU, 3 pieces) and O2 (SKU X, 2 pieces); rows X at 945.00, X at 950.00, Y 3 at 800.00.
    // O2 keeps X for its 2 pieces, split 1 at 945.00 and 1 at 950.00; O1 takes Y for its 3 pieces at 800.00.
    const split = ptIdentityParts(
      [
        { receiptOriginId: origin(1), skuId: null, units: 3 },
        { receiptOriginId: origin(2), skuId: SKU_X, units: 2 },
      ],
      [
        { skuId: SKU_X, pRatePaise: 94_500, quantity: 1 },
        { skuId: SKU_Y, pRatePaise: 80_000, quantity: 3 },
        { skuId: SKU_X, pRatePaise: 95_000, quantity: 1 },
      ],
      counter(),
    );
    expect(split).toEqual({
      kind: 'parts',
      parts: [
        { receiptOriginId: origin(1), skuId: SKU_Y, pRatePaise: 80_000, quantity: 3, newReceiptOriginId: origin(101) },
        { receiptOriginId: origin(2), skuId: SKU_X, pRatePaise: 94_500, quantity: 1, newReceiptOriginId: origin(102) },
        { receiptOriginId: origin(2), skuId: SKU_X, pRatePaise: 95_000, quantity: 1, newReceiptOriginId: origin(103) },
      ],
    });
  });

  it('PRD-PTW-010 merges rows of one SKU and one P RATE into one part of an origin', () => {
    const split = ptIdentityParts(
      [{ receiptOriginId: origin(1), skuId: null, units: 5 }],
      [
        { skuId: SKU_X, pRatePaise: 94_500, quantity: 2 },
        { skuId: SKU_X, pRatePaise: 94_500, quantity: 3 },
      ],
      counter(),
    );
    expect(split).toEqual({
      kind: 'parts',
      parts: [
        { receiptOriginId: origin(1), skuId: SKU_X, pRatePaise: 94_500, quantity: 5, newReceiptOriginId: origin(101) },
      ],
    });
  });

  it('PRD-REC-016 splits nothing when the rows do not add up to the pieces', () => {
    expect(
      ptIdentityParts(
        [{ receiptOriginId: origin(1), skuId: null, units: 4 }],
        [{ skuId: SKU_X, pRatePaise: 94_500, quantity: 3 }],
        counter(),
      ),
    ).toEqual({ kind: 'mismatch', units: 4, rows: 3 });
  });
});
