import { known, unknownValue } from '@apparel-os/domain';
import { describe, expect, it } from 'vitest';
import { costLine, matchCost, ticketMargin } from './index.js';

// shared-calculations section 8, beyond the golden cases CG-21, CG-21b and CG-22. Every profile here is SYNTHETIC; none
// is a formula for any brand (V-15).

describe('cost a line (section 8)', () => {
  it('POL-03.06 runs flat steps, a spread charge, non-recoverable tax and a rounding step in order', () => {
    const result = costLine({
      basic: known(100000),
      amounts: { 'syn-freight': known(1234), 'syn-flat-off': known(500) },
      profile: {
        version: 'syn-cost-2',
        steps: [
          { kind: 'discount-amount', input: 'syn-flat-off' },
          { kind: 'spread-charge', input: 'syn-freight' },
          { kind: 'non-recoverable-tax', rate: '2.5' },
          { kind: 'rounding', unit: 100, mode: 'half-up' },
        ],
      },
    });
    // 1,000.00 − 5.00 = 995.00; + 12.34 = 1,007.34; + 2.5% = 1,032.5235; rounded to 1,033.00.
    expect(result).toEqual({
      ok: true,
      value: {
        profileVersion: 'syn-cost-2',
        pRate: known(103300),
        missing: [],
        steps: [
          { kind: 'discount-amount', value: '99500' },
          { kind: 'spread-charge', value: '100734' },
          { kind: 'non-recoverable-tax', value: '2065047/20' },
          { kind: 'rounding', value: '103300' },
        ],
      },
    });
  });

  it('POL-03.08 lists every missing input and gives Unknown P RATE', () => {
    const result = costLine({
      basic: unknownValue(),
      amounts: { 'syn-flat-off': unknownValue() },
      profile: {
        version: 'syn-cost-3',
        steps: [
          { kind: 'discount-amount', input: 'syn-flat-off' },
          { kind: 'spread-charge', input: 'syn-freight' },
        ],
      },
    });
    expect(result).toEqual({
      ok: true,
      value: {
        profileVersion: 'syn-cost-3',
        pRate: unknownValue(),
        missing: ['basic', 'syn-flat-off', 'syn-freight'],
        steps: [],
      },
    });
  });

  it('POL-03.08 gives Unknown P RATE, listing the rounding step, when no step makes it whole paise (3.4)', () => {
    const result = costLine({
      basic: known(100001),
      amounts: {},
      profile: { version: 'syn-cost-4', steps: [{ kind: 'discount-rate', rate: '50' }] },
    });
    expect(result).toEqual({
      ok: true,
      value: {
        profileVersion: 'syn-cost-4',
        pRate: unknownValue(),
        missing: ['rounding step'],
        steps: [{ kind: 'discount-rate', value: '100001/2' }],
      },
    });
  });
});

describe('matching check (POL-03.07)', () => {
  it('POL-03.07 returns the difference and whether it lies within the tolerance, deciding nothing', () => {
    expect(
      matchCost({ pRate: known(94500), supplierCost: known(94000), tolerance: { amount: 500, boundary: 'inclusive' } }),
    ).toEqual({
      difference: known(500),
      direction: known('p-rate-higher'),
      withinTolerance: known(true),
    });
    expect(
      matchCost({ pRate: known(94500), supplierCost: known(94000), tolerance: { amount: 500, boundary: 'exclusive' } })
        .withinTolerance,
    ).toEqual(known(false));
    expect(
      matchCost({ pRate: unknownValue(), supplierCost: known(1), tolerance: { amount: 0, boundary: 'inclusive' } })
        .difference,
    ).toEqual(unknownValue());
  });
});

describe('ticket margin (PRD-PTW-011)', () => {
  it('PRD-PTW-011 rounds half up to two decimals', () => {
    expect(ticketMargin({ mrp: known(200000), pRate: known(100000) })).toEqual({ ok: true, value: known('50.00') });
    // (8.00 − 7.99) ÷ 8.00 × 100 = 0.125, half up to 0.13.
    expect(ticketMargin({ mrp: known(800), pRate: known(799) })).toEqual({ ok: true, value: known('0.13') });
  });

  it('PRD-MOD-015 gives Unknown MARGIN for an Unknown P RATE or MRP', () => {
    expect(ticketMargin({ mrp: known(199900), pRate: unknownValue() })).toEqual({ ok: true, value: unknownValue() });
    expect(ticketMargin({ mrp: unknownValue(), pRate: known(1) })).toEqual({ ok: true, value: unknownValue() });
  });

  it('PRD-PTW-011 gives an exact negative margin, and refuses one that needs rounding (GC7-15)', () => {
    // (8.00 − 8.08) ÷ 8.00 × 100 = −1, exact to two decimals.
    expect(ticketMargin({ mrp: known(800), pRate: known(808) })).toEqual({ ok: true, value: known('-1.00') });
    // (8.00 − 8.01) ÷ 8.00 × 100 = −0.125: what half up means below zero is open.
    expect(ticketMargin({ mrp: known(800), pRate: known(801) })).toEqual({
      ok: false,
      refusals: [{ code: 'not-decided', input: 'margin', question: 'GC7-15' }],
    });
  });

  it('PRD-PTW-011 refuses a zero MRP, which gives no margin (Proposed, section 8)', () => {
    expect(ticketMargin({ mrp: known(0), pRate: known(1) })).toEqual({
      ok: false,
      refusals: [{ code: 'invalid-amount', input: 'mrp' }],
    });
  });
});
