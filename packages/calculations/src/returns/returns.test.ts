import { describe, expect, it } from 'vitest';
import { SYN_ROUNDING, synBill, synLine } from '../../test/synthetic.js';
import { priceBill } from '../pricing/price-bill.js';
import type { PricedBill } from '../pricing/types.js';
import { exchangeDifference } from './exchange.js';
import { returnValue } from './return-value.js';
import { splitRefund } from './split-refund.js';

// shared-calculations section 7, beyond the golden cases CG-16 to CG-19. Synthetic values (12.3).

function bill(mrp: number, billRule = SYN_ROUNDING.bill): PricedBill {
  const result = priceBill(synBill([synLine('A1', mrp)], { rounding: { ...SYN_ROUNDING, bill: billRule } }));
  if (!result.ok) throw new Error('synthetic bill refused');
  return result.value;
}

describe('return value (7.1)', () => {
  it('PRD-RET-024 returns a whole line at once for its whole paid value', () => {
    expect(
      returnValue({ line: { id: 'L1', soldQuantity: 3, paidValue: 100000 }, earlierReturns: [], quantity: 3 }),
    ).toEqual({
      ok: true,
      value: { line: 'L1', quantity: 3, refund: 100000, remainingQuantity: 0 },
    });
  });

  it('PRD-RET-024 takes two units at the rounded-down unit value', () => {
    expect(
      returnValue({ line: { id: 'L1', soldQuantity: 3, paidValue: 100000 }, earlierReturns: [], quantity: 2 }),
    ).toMatchObject({
      ok: true,
      value: { refund: 66666 },
    });
  });

  it('PRD-RET-005 refuses a quantity that is not whole and above zero', () => {
    for (const quantity of [0, 1.5, -1]) {
      expect(
        returnValue({ line: { id: 'L1', soldQuantity: 3, paidValue: 100000 }, earlierReturns: [], quantity }),
      ).toEqual({
        ok: false,
        refusals: [{ code: 'invalid-quantity', line: 'L1', input: 'quantity' }],
      });
    }
  });
});

describe('exchange difference (7.2)', () => {
  it('PRD-RET-007 has no difference for equal value', () => {
    expect(exchangeDifference({ returnedValue: 110000, replacement: bill(110000) })).toEqual({
      ok: true,
      value: { outcome: 'none', amount: 0, cheaperReplacementRuleVersion: null },
    });
  });

  it('PRD-RET-008 credits or refuses a cheaper replacement as its rule says', () => {
    expect(
      exchangeDifference({
        returnedValue: 110000,
        replacement: bill(100000),
        cheaperReplacementRule: { version: 'syn-cheaper-credit', outcome: 'credit' },
      }),
    ).toEqual({
      ok: true,
      value: { outcome: 'credit', amount: 10000, cheaperReplacementRuleVersion: 'syn-cheaper-credit' },
    });
    expect(
      exchangeDifference({
        returnedValue: 110000,
        replacement: bill(100000),
        cheaperReplacementRule: { version: 'syn-cheaper-refuse', outcome: 'refuse' },
      }),
    ).toEqual({ ok: false, refusals: [{ code: 'cheaper-replacement-refused', input: 'cheaper-replacement-rule' }] });
  });

  it('PRD-RET-008 GC7-13 does not compare a replacement bill that has a round-off', () => {
    const rounded = bill(110050, { version: 'syn-round-bill-100', unit: 100, mode: 'half-up' });
    expect(rounded.roundOffUp).toBe(50);
    expect(exchangeDifference({ returnedValue: 100000, replacement: rounded })).toEqual({
      ok: false,
      refusals: [{ code: 'not-decided', input: 'replacement round-off', question: 'GC7-13' }],
    });
  });
});

describe('split-tender refunds (7.3)', () => {
  it('PRD-RET-022 moves the share of a tender with no room left to the others in proportion', () => {
    const result = splitRefund({
      tenders: [
        { tender: 'cash', allocation: 60000, remaining: 0 },
        { tender: 'card', allocation: 30000, remaining: 30000 },
        { tender: 'upi', allocation: 10000, remaining: 10000 },
      ],
      refund: 20000,
    });
    // Cash would take 120.00 but has no room; card and UPI take 60.00 and 20.00, then 90.00 and 30.00 more, 3 : 1.
    expect(result).toEqual({
      ok: true,
      value: {
        refund: 20000,
        shares: [
          { tender: 'cash', amount: 0 },
          { tender: 'card', amount: 15000 },
          { tender: 'upi', amount: 5000 },
        ],
      },
    });
  });

  it('PRD-RET-022 gives paise left to the first of equal largest allocations', () => {
    const result = splitRefund({
      tenders: [
        { tender: 'card', allocation: 50000, remaining: 50000 },
        { tender: 'upi', allocation: 50000, remaining: 50000 },
      ],
      refund: 101,
    });
    expect(result).toMatchObject({ ok: true, value: { shares: [{ amount: 51 }, { amount: 50 }] } });
  });

  it('PRD-RET-022 refuses more remaining than allocated as a caller defect', () => {
    expect(() => splitRefund({ tenders: [{ tender: 'card', allocation: 1, remaining: 2 }], refund: 1 })).toThrow(
      RangeError,
    );
  });
});
