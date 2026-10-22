import { describe, expect, it } from 'vitest';
import { matchGrn, type GrnGoods, type MatchedRow } from './match.js';

// S2-F04-T02: the match of goods-in 5.4: the file's QTY per style (DESIGN) and size adds up to the GRN's good pieces,
// no style and size the GRN lacks, none of the GRN's missing; text compared ignoring case and spaces at the ends;
// colour never compared (PRD-REC-016, DEC-135, DEC-138; goods-in 12 tests 8 and 9). Every value is SYNTHETIC.

const line = (n: number) => `01900000-0000-7000-8000-${String(n).padStart(12, '0')}`;

const goods: GrnGoods = [
  { styleCode: 'SYN-A', size: 'M', quantity: 3, grnLineIds: [line(1)] },
  { styleCode: 'SYN-A', size: 'L', quantity: 2, grnLineIds: [line(2), line(3)] },
  { styleCode: 'SYN-B', size: null, quantity: 1, grnLineIds: [line(4)] },
];

const row = (rowNumber: number, styleCode: string, sizeCode: string, quantity: number): MatchedRow => ({
  rowNumber,
  styleCode,
  sizeCode,
  quantity,
});

describe('the match of a PT file against its GRN (goods-in 5.4)', () => {
  it('PRD-REC-016 DEC-138 matches rows of one piece or several per style and size, ignoring case and spaces at the ends', () => {
    const matched = matchGrn(
      [row(3, 'syn-a ', 'm', 1), row(4, 'SYN-A', 'M', 2), row(5, 'SYN-A', 'L', 2)],
      goods.slice(0, 2),
    );
    expect(matched.issues).toEqual([]);
    expect(matched.coverage).toEqual([
      { styleCode: 'SYN-A', size: 'M', quantity: 3, grnLineIds: [line(1)], rowNumbers: [3, 4] },
      { styleCode: 'SYN-A', size: 'L', quantity: 2, grnLineIds: [line(2), line(3)], rowNumbers: [5] },
    ]);
  });

  it('PRD-REC-016 lists a quantity that differs, a style and size the GRN lacks, and one the file misses', () => {
    const matched = matchGrn([row(3, 'SYN-A', 'M', 2), row(4, 'SYN-C', 'M', 1), row(5, 'SYN-A', 'M', 2)], goods);
    expect(matched.issues).toEqual([
      {
        code: 'merchandise.pt-quantity-differs-from-grn',
        field: 'qty',
        rowNumber: 3,
        missing: [{ kind: 'pt-style-size', styleCode: 'SYN-A', size: 'M', fileQuantity: '4', grnQuantity: '3' }],
      },
      {
        code: 'merchandise.pt-style-size-not-on-grn',
        field: 'design',
        rowNumber: 4,
        missing: [{ kind: 'pt-style-size', styleCode: 'SYN-C', size: 'M', fileQuantity: '1' }],
      },
      {
        code: 'merchandise.pt-style-size-missing',
        missing: [{ kind: 'pt-style-size', styleCode: 'SYN-A', size: 'L', grnQuantity: '2' }],
      },
      {
        code: 'merchandise.pt-style-size-missing',
        missing: [{ kind: 'pt-style-size', styleCode: 'SYN-B', grnQuantity: '1' }],
      },
    ]);
  });
});
