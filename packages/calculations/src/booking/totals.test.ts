import { describe, expect, it } from 'vitest';
import { bookingTotals } from './index.js';

// goods-in 3.1 and 3.9: a booking's totals. Every line here is SYNTHETIC.

describe('a booking’s totals (goods-in 3.1)', () => {
  it('PRD-BKG-003 totals pieces, cost and MRP for the booking and each style, a style matched ignoring case and spaces', () => {
    const totals = bookingTotals([
      { styleCode: 'SYN-ST-1', quantity: 10, indicativeCost: 50_000, mrp: 99_900 },
      { styleCode: 'syn-st-2 ', quantity: 5, indicativeCost: 30_000, mrp: 99_900 },
      { styleCode: ' syn-st-1', quantity: 30, indicativeCost: 50_000, mrp: 109_900 },
    ]);
    // 40 pieces at 500.00 and 5 at 300.00; MRP 10 at 999.00, 30 at 1,099.00 and 5 at 999.00 (worked by hand).
    expect(totals).toEqual({
      booking: { pieces: 45, cost: 2_150_000, mrp: 4_795_500 },
      styles: [
        { styleCode: 'SYN-ST-1', pieces: 40, cost: 2_000_000, mrp: 4_296_000 },
        { styleCode: 'syn-st-2', pieces: 5, cost: 150_000, mrp: 499_500 },
      ],
    });
  });

  it('PRD-BKG-003 a Draft with no line yet totals no pieces and no value', () => {
    expect(bookingTotals([])).toEqual({ booking: { pieces: 0, cost: 0, mrp: 0 }, styles: [] });
  });
});
