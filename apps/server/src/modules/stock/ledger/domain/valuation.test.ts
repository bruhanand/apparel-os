import { describe, expect, it } from 'vitest';
import { enter, issue, newPool, share, type PoolState } from './valuation.js';

// The cost formulas as plain rules (stock-ledger 7.3, 7.4, 7.10; PRD-LED-014). The numbers are the SYNTHETIC story of
// stock-ledger 11.2 and 11.4, in paise, written by hand from those tables.

let next = 0;
const ids = () => `id-${String(++next)}`;

function pool(formula: PoolState['formula']): PoolState {
  return newPool({
    id: ids(),
    bookId: 'book',
    skuId: 'sku',
    mode: 'book',
    siteId: null,
    formula,
    costSettingVersionId: 'cost-version',
    legalEntityId: 'le',
    brandId: 'brand',
  });
}

describe('share (7.10; SL-2)', () => {
  it('is exact in whole paise, or undefined when it does not divide', () => {
    expect(share(178_000, 5, 16)).toBe(55_625);
    expect(share(100, 1, 3)).toBeUndefined();
    expect(share(0, 1, 3)).toBe(0);
  });
});

describe('moving weighted average (7.3; stock-ledger 11.2)', () => {
  it('PRD-LED-014 averages receipts and issues at value × q ÷ quantity', () => {
    const p = pool('moving-average');
    enter(p, { quantity: 10, value: 100_000, sequence: 1, at: new Date(0), newLayerId: ids, origin: 'R1' });
    enter(p, { quantity: 6, value: 78_000, sequence: 2, at: new Date(0), newLayerId: ids, origin: 'R2' });
    expect([p.quantity, p.value]).toEqual([16, 178_000]);
    const taken = issue(p, { quantity: 5 });
    expect(taken?.reduce((sum, each) => sum + each.value, 0)).toBe(55_625);
    expect([p.quantity, p.value]).toEqual([11, 122_375]);
  });

  it('G10a an outflow that does not divide is refused and changes nothing; one that empties takes all that is left', () => {
    const p = pool('moving-average');
    enter(p, { quantity: 3, value: 100, sequence: 1, at: new Date(0), newLayerId: ids, origin: 'R1' });
    expect(issue(p, { quantity: 1 })).toBeUndefined();
    expect([p.quantity, p.value]).toEqual([3, 100]);
    expect(issue(p, { quantity: 3 })?.[0]?.value).toBe(100);
    expect([p.quantity, p.value]).toEqual([0, 0]);
  });
});

describe('FIFO (7.4; stock-ledger 11.4)', () => {
  it('PRD-LED-014 POL-09.07 an outflow takes the oldest layer first, whatever piece left', () => {
    const p = pool('fifo');
    enter(p, { quantity: 10, value: 100_000, sequence: 1, at: new Date(0), newLayerId: ids, origin: 'R1' });
    enter(p, { quantity: 6, value: 78_000, sequence: 2, at: new Date(0), newLayerId: ids, origin: 'R2' });
    const taken = issue(p, { quantity: 5, pieceIds: ['a', 'b', 'c', 'd', 'e'] });
    expect(taken?.map((each) => [each.layer?.receiptOriginId, each.quantity, each.value, each.pieceId])).toEqual([
      ['R1', 1, 10_000, 'a'],
      ['R1', 1, 10_000, 'b'],
      ['R1', 1, 10_000, 'c'],
      ['R1', 1, 10_000, 'd'],
      ['R1', 1, 10_000, 'e'],
    ]);
    expect([p.quantity, p.value]).toEqual([11, 128_000]);
    expect(p.layers.map((layer) => [layer.quantityLeft, layer.valueLeft])).toEqual([
      [5, 50_000],
      [6, 78_000],
    ]);
  });

  it('a quantity outflow spans layers, and a layer that empties gives all it holds', () => {
    const p = pool('fifo');
    enter(p, { quantity: 3, value: 100, sequence: 1, at: new Date(0), newLayerId: ids, origin: 'R1' });
    enter(p, { quantity: 2, value: 50, sequence: 2, at: new Date(0), newLayerId: ids, origin: 'R2' });
    const taken = issue(p, { quantity: 4 });
    expect(taken?.map((each) => [each.quantity, each.value])).toEqual([
      [3, 100],
      [1, 25],
    ]);
    expect(issue(p, { quantity: 1 })?.[0]?.value).toBe(25);
    expect([p.quantity, p.value]).toEqual([0, 0]);
  });
});
