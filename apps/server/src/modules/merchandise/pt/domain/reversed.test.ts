import { describe, expect, it } from 'vitest';
import type { PtBasis } from '../../../receiving/index.js';
import type { PtRevisionGoods } from '../../../stock/ledger/index.js';
import { goodsAfterReversals, originsNotWaiting, type ReversedOrigin } from './reversed.js';

// S2-F09-T01: what a PT's reversal leaves for the PT after it (goods-in 6.7; stock-ledger 13.19, 13.21). SYNTHETIC
// identifiers, styles and quantities.

const grnOrigin = '00000000-0000-7000-8000-000000000001';
const line = '00000000-0000-7000-8000-0000000000aa';
const hold = '00000000-0000-7000-8000-0000000000bb';
const skuNavy = '00000000-0000-7000-8000-00000000000a';
const skuRed = '00000000-0000-7000-8000-00000000000b';

/** A GRN of one style and size: three good pieces on one origin, an excess hold the PT route ends. */
const basis: PtBasis = {
  grnId: '00000000-0000-7000-8000-0000000000cc',
  undecided: [],
  goods: [
    {
      styleCode: 'SYN-STYLE',
      size: 'M',
      quantity: 3,
      parts: [
        {
          grnLineId: line,
          receiptOriginId: grnOrigin,
          skuId: null,
          quantity: 3,
          releases: [{ holdId: hold, event: 'pt-route' }],
        },
      ],
    },
  ],
};

const origin = (parent: string, id: string, skuId: string, quantity: number): ReversedOrigin => ({
  parentReceiptOriginId: parent,
  receiptOriginId: id,
  skuId,
  quantity,
});

describe('goodsAfterReversals (goods-in 6.7)', () => {
  it('DEC-137 leaves the GRN goods as they are while no PT of them was reversed', () => {
    expect(goodsAfterReversals(basis, [])).toEqual({ kind: 'goods', basis });
  });

  it('DEC-137 PRD-REC-019 takes the pieces from the reversed PT origins, with their SKUs and no hold to end again', () => {
    const first = '00000000-0000-7000-8000-000000000011';
    const second = '00000000-0000-7000-8000-000000000012';
    const answer = goodsAfterReversals(basis, [
      origin(grnOrigin, first, skuNavy, 2),
      origin(grnOrigin, second, skuRed, 1),
    ]);
    expect(answer).toEqual({
      kind: 'goods',
      basis: {
        ...basis,
        goods: [
          {
            ...basis.goods[0],
            parts: [
              { grnLineId: line, receiptOriginId: first, skuId: skuNavy, quantity: 2, releases: [] },
              { grnLineId: line, receiptOriginId: second, skuId: skuRed, quantity: 1, releases: [] },
            ],
          },
        ],
      },
    });
  });

  it('DEC-137 follows the pieces down every PT reversed in turn to where they are now', () => {
    const first = '00000000-0000-7000-8000-000000000021';
    const later = '00000000-0000-7000-8000-000000000022';
    const answer = goodsAfterReversals(basis, [origin(grnOrigin, first, skuNavy, 3), origin(first, later, skuNavy, 3)]);
    expect(answer.kind === 'goods' && answer.basis.goods[0]?.parts).toEqual([
      { grnLineId: line, receiptOriginId: later, skuId: skuNavy, quantity: 3, releases: [] },
    ]);
  });

  it('PRD-REC-019 answers the style and size whose pieces no longer add up, as when the GRN changed since', () => {
    const answer = goodsAfterReversals(basis, [origin(grnOrigin, '00000000-0000-7000-8000-000000000031', skuNavy, 2)]);
    expect(answer).toEqual({ kind: 'changed', styleCode: 'SYN-STYLE', size: 'M' });
  });
});

describe('originsNotWaiting (goods-in 6.7, 8.4)', () => {
  const row = (values: Partial<PtRevisionGoods>): PtRevisionGoods => ({
    ptRevisionId: '00000000-0000-7000-8000-000000000041',
    receiptOriginId: '00000000-0000-7000-8000-000000000042',
    skuId: skuNavy,
    covered: 2,
    locationId: '00000000-0000-7000-8000-000000000043',
    condition: 'good',
    quantity: 2,
    accepted: 0,
    held: 0,
    ...values,
  });

  it('PRD-REC-019 names no origin while every piece waits where the approval left it', () => {
    expect(originsNotWaiting([row({})])).toEqual([]);
  });

  it('PRD-REC-019 PRD-DMG-010 names an origin with a piece accepted, held or damaged since', () => {
    for (const changed of [{ accepted: 1 }, { held: 1 }, { condition: 'damaged' as const, quantity: 1 }]) {
      expect(originsNotWaiting([row({}), row(changed)])).toEqual(['00000000-0000-7000-8000-000000000042']);
    }
  });
});
