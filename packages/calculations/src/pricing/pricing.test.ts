import { unknownValue } from '@apparel-os/domain';
import { describe, expect, it } from 'vitest';
import {
  SYN_ROUNDING,
  SYN_TAX,
  synBill,
  synLine,
  synOffer,
  synRoundingWithout,
  synRule,
} from '../../test/synthetic.js';
import type { TaxRateRule } from '../tax-rules/records.js';
import { listApplicableOffers } from './list-offers.js';
import { compareTiedSets } from './offers.js';
import { priceBill } from './price-bill.js';
import { spreadGroupDiscount } from './spread.js';
import type { PricedBill } from './types.js';

// Unit tests of shared-calculations section 5 beyond the golden cases. Every value is synthetic (12.3).

function priced(result: ReturnType<typeof priceBill>): PricedBill {
  if (!result.ok) throw new Error(`refused: ${JSON.stringify(result.refusals)}`);
  return result.value;
}

const P10 = synOffer('SYN-P10', { kind: 'percentage', rate: '10' });
const P20 = synOffer('SYN-P20', { kind: 'percentage', rate: '20' }, { approvedAt: '2026-09-02T00:00:00Z' });
const B21 = synOffer('SYN-B21', {
  kind: 'buy-x-get-y',
  buy: 2,
  get: 1,
  reward: { kind: 'free' },
  rewardUnits: 'lowest-value-first',
});

describe('spread of a group discount (5.6)', () => {
  it('PRD-POS-023 rounds each share down and gives the paise left to the largest line', () => {
    expect(spreadGroupDiscount(24000n, [140000n, 170000n])).toEqual([10838n, 13162n]);
  });

  it('PRD-POS-023 gives the paise left to the first of equal largest lines', () => {
    expect(spreadGroupDiscount(10n, [3n, 3n, 3n])).toEqual([4n, 3n, 3n]);
  });

  it('PRD-POS-023 spreads nothing over lines worth nothing', () => {
    expect(spreadGroupDiscount(0n, [0n, 0n])).toEqual([0n, 0n]);
    expect(() => spreadGroupDiscount(1n, [0n])).toThrow(/Defect/);
  });
});

describe('offers: which lines earn a group discount (GC7-11, RR-042)', () => {
  it('PRD-POS-023 RR-042 refuses, naming GC7-11, when buy-X-get-Y units are left over after complete sets', () => {
    const result = priceBill(
      synBill(
        ['A1', 'A2', 'A3', 'A4'].map((id) => synLine(id, 100000)),
        { offers: [B21] },
      ),
    );
    expect(result).toEqual({ ok: false, refusals: [{ code: 'not-decided', question: 'GC7-11', input: 'SYN-B21' }] });
  });

  it('PRD-OFR-001 gives no discount when no complete set is made, where both readings agree', () => {
    const bill = priced(priceBill(synBill([synLine('A1', 100000), synLine('A2', 100000)], { offers: [B21] })));
    expect(bill.offers.considered).toEqual([{ offer: 'SYN-B21', version: 'syn-b21-1' }]);
    expect(bill.offers.applied).toEqual([]);
    expect(bill.amountDue).toBe(200000);
  });
});

describe('offers: amounts (5.5)', () => {
  it('PRD-OFR-001 takes the highest-valued reward unit at a rate and spreads it', () => {
    const B11 = synOffer('SYN-B11', {
      kind: 'buy-x-get-y',
      buy: 1,
      get: 1,
      reward: { kind: 'rate', rate: '50' },
      rewardUnits: 'highest-value-first',
    });
    const bill = priced(priceBill(synBill([synLine('A1', 100000), synLine('A2', 200000)], { offers: [B11] })));
    // 50% of the 2,000.00 unit is 1,000.00, spread 1 : 2 as 333.33 and 666.66, the paise left to the larger line.
    expect(bill.lines.map((l) => l.spreadShares)).toEqual([
      [{ offer: 'SYN-B11', amount: 33333 }],
      [{ offer: 'SYN-B11', amount: 66667 }],
    ]);
    expect(bill.versions.rounding.discount).toBe('syn-round-1');
  });

  it('PRD-MOD-014 GC7-14 refuses a free unit whose value is not whole paise, since no rounding step is named for it', () => {
    const P25 = synOffer('SYN-P25', { kind: 'percentage', rate: '25' });
    const B11 = synOffer('SYN-B11', {
      kind: 'buy-x-get-y',
      buy: 1,
      get: 1,
      reward: { kind: 'free' },
      rewardUnits: 'lowest-value-first',
    });
    // 25% of 2,000.02 rounds to 500.01; the 1,500.01 left over two units is 750.005 a unit.
    const result = priceBill(
      synBill([synLine('A1', 100001, { quantity: 2 })], {
        offers: [P25, B11],
        combinationRules: [synRule('SYN-C9', ['SYN-P25', 'SYN-B11'])],
      }),
    );
    expect(result).toEqual({ ok: false, refusals: [{ code: 'not-decided', question: 'GC7-14', input: 'SYN-B11' }] });
  });

  it('POL-19.04 applies combined offers to the start value when the rule says so', () => {
    const onStart = priced(
      priceBill(
        synBill([synLine('A1', 100000)], {
          offers: [P10, P20],
          combinationRules: [synRule('SYN-C2', ['SYN-P10', 'SYN-P20'], 'on-start-value')],
        }),
      ),
    );
    expect(onStart.lines[0]?.value).toBe(70000);
    const onLeft = priced(
      priceBill(
        synBill([synLine('A1', 100000)], {
          offers: [P10, P20],
          combinationRules: [synRule('SYN-C2', ['SYN-P10', 'SYN-P20'])],
        }),
      ),
    );
    // 10% of 1,000.00, then 20% of the 900.00 left.
    expect(onLeft.lines[0]?.offerDiscounts).toEqual([
      { offer: 'SYN-P10', amount: 10000 },
      { offer: 'SYN-P20', amount: 18000 },
    ]);
  });

  it('PRD-OFR-021 applies offers that overlap nothing alongside, with no rule', () => {
    const F100 = synOffer(
      'SYN-F100',
      { kind: 'flat', amountPerUnit: 10000 },
      { goods: { brands: ['SYN-BR-B'], items: [] } },
    );
    const bill = priced(
      priceBill(
        synBill([synLine('A1', 100000), synLine('B1', 100000, { brand: 'SYN-BR-B' })], { offers: [P10, F100] }),
      ),
    );
    expect(bill.offers.applied.map((o) => o.offer)).toEqual(['SYN-F100', 'SYN-P10']);
    expect(bill.totals.offerDiscount).toBe(20000);
  });

  it('PRD-SEC-017 refuses a percentage offer when no discount rounding rule is in force', () => {
    const rounding = synRoundingWithout('discount');
    expect(priceBill(synBill([synLine('A1', 100000)], { offers: [P10], rounding }))).toEqual({
      ok: false,
      refusals: [{ code: 'rounding-rule-missing', input: 'discount' }],
    });
  });

  it('PRD-OFR-002 considers only offers in force at the Store or its group on the business date', () => {
    const elsewhere = synOffer(
      'SYN-PA',
      { kind: 'percentage', rate: '10' },
      { places: { stores: ['SYN-S2'], storeGroups: [] } },
    );
    const later = synOffer('SYN-PB', { kind: 'percentage', rate: '10' }, { effectiveFrom: '2026-10-11' });
    const ended = synOffer('SYN-PC', { kind: 'percentage', rate: '10' }, { effectiveTo: '2026-10-10' });
    const atStore = synOffer(
      'SYN-PD',
      { kind: 'percentage', rate: '10' },
      { places: { stores: ['SYN-S1'], storeGroups: [] } },
    );
    const bill = priced(priceBill(synBill([synLine('A1', 100000)], { offers: [elsewhere, later, ended, atStore] })));
    expect(bill.offers.considered.map((o) => o.offer)).toEqual(['SYN-PD']);
  });
});

describe('offers: no line below zero (5.5, 5.6)', () => {
  it('POL-19.04 GC7-9 refuses, never caps, a combined offer on the start value that would take a line below zero', () => {
    const P50 = synOffer('SYN-P50', { kind: 'percentage', rate: '50' });
    const K = synOffer(
      'SYN-K18',
      { kind: 'basket', threshold: 100000, discount: { kind: 'amount', amount: 180000 } },
      { approvedAt: '2026-09-02T00:00:00Z' },
    );
    // 50% leaves 500.00 on each 1,000.00 line; the basket on the start value would spread 900.00 to each.
    const result = priceBill(
      synBill([synLine('A1', 100000), synLine('A2', 100000)], {
        offers: [P50, K],
        combinationRules: [synRule('SYN-C8', ['SYN-P50', 'SYN-K18'], 'on-start-value')],
      }),
    );
    expect(result).toEqual({ ok: false, refusals: [{ code: 'not-decided', question: 'GC7-9', input: 'line A1' }] });
  });

  it('PRD-POS-023 GC7-16 refuses when the paise left by a spread would take the largest line below zero', () => {
    const K = synOffer('SYN-K299', { kind: 'basket', threshold: 0, discount: { kind: 'amount', amount: 299 } });
    // Three lines of 1.00: shares of 0.99 each leave 0.02 for the first line, which has only 0.01 left.
    const result = priceBill(synBill([synLine('A1', 100), synLine('A2', 100), synLine('A3', 100)], { offers: [K] }));
    expect(result).toEqual({ ok: false, refusals: [{ code: 'not-decided', question: 'GC7-16', input: 'line A1' }] });
  });
});

describe('offers: which apply (5.4)', () => {
  it('POL-19.04 GC7-9 refuses when the rules that permit a set give different orders', () => {
    const result = priceBill(
      synBill([synLine('A1', 100000)], {
        offers: [P10, P20],
        combinationRules: [synRule('SYN-C3', ['SYN-P10', 'SYN-P20']), synRule('SYN-C4', ['SYN-P20', 'SYN-P10'])],
      }),
    );
    expect(result).toEqual({ ok: false, refusals: [{ code: 'not-decided', question: 'GC7-9', input: 'line A1' }] });
  });

  it('POL-19.04 GC7-9 refuses when every pair is permitted but no one rule orders all of a line offers', () => {
    const P30 = synOffer('SYN-P30', { kind: 'percentage', rate: '30' });
    const result = priceBill(
      synBill([synLine('A1', 100000)], {
        offers: [P10, P20, P30],
        combinationRules: [
          synRule('SYN-C5', ['SYN-P10', 'SYN-P20']),
          synRule('SYN-C6', ['SYN-P20', 'SYN-P30']),
          synRule('SYN-C7', ['SYN-P10', 'SYN-P30']),
        ],
      }),
    );
    expect(result).toEqual({ ok: false, refusals: [{ code: 'not-decided', question: 'GC7-9', input: 'line A1' }] });
  });

  it('PRD-OFR-021 breaks a tie by the earlier approval time, then the lower identity, a shorter list first', () => {
    const early = synOffer('SYN-Z', { kind: 'percentage', rate: '1' }, { approvedAt: '2026-08-01T00:00:00Z' });
    const late = synOffer('SYN-A', { kind: 'percentage', rate: '1' }, { approvedAt: '2026-09-01T00:00:00Z' });
    const sameTime = synOffer('SYN-B', { kind: 'percentage', rate: '1' }, { approvedAt: '2026-09-01T00:00:00Z' });
    expect(compareTiedSets([early], [late])).toBeLessThan(0);
    expect(compareTiedSets([late], [sameTime])).toBeLessThan(0);
    expect(compareTiedSets([late], [late, sameTime])).toBeLessThan(0);
    expect(compareTiedSets([late, early], [early])).toBeGreaterThan(0);
  });

  it('PRD-OFR-003 PRD-OFR-021 lists eligible offers and the set checkout would apply, and why', () => {
    const F110 = synOffer('SYN-F110', { kind: 'flat', amountPerUnit: 11000 }, { approvedAt: '2026-09-05T00:00:00Z' });
    const C1 = synRule('SYN-C1', ['SYN-P10', 'SYN-F110']);
    const result = listApplicableOffers({
      store: 'SYN-S1',
      storeGroups: ['SYN-G1'],
      businessDate: '2026-10-10',
      lines: [synLine('A1', 220000)],
      priceLists: [],
      offers: [P10, F110],
      combinationRules: [C1],
      rounding: SYN_ROUNDING,
    });
    expect(result).toEqual({
      ok: true,
      value: {
        eligible: [
          {
            offer: 'SYN-F110',
            version: 'syn-f110-1',
            effectiveFrom: '2026-10-01',
            effectiveTo: null,
            combinationRules: [{ rule: 'SYN-C1', version: 'syn-c1-1' }],
          },
          {
            offer: 'SYN-P10',
            version: 'syn-p10-1',
            effectiveFrom: '2026-10-01',
            effectiveTo: null,
            combinationRules: [{ rule: 'SYN-C1', version: 'syn-c1-1' }],
          },
        ],
        candidates: [
          { offers: ['SYN-F110', 'SYN-P10'], totalDiscount: 33000 },
          { offers: ['SYN-P10'], totalDiscount: 22000 },
          { offers: ['SYN-F110'], totalDiscount: 11000 },
          { offers: [], totalDiscount: 0 },
        ],
        chosen: ['SYN-F110', 'SYN-P10'],
      },
    });
  });
});

describe('manual discounts (5.7)', () => {
  it('PRD-POS-003 GC7-7 refuses a manual discount on a line that has an offer', () => {
    const result = priceBill(
      synBill([synLine('A1', 100000, { manualDiscount: { kind: 'amount', amount: 100 } })], { offers: [P10] }),
    );
    expect(result).toEqual({
      ok: false,
      refusals: [{ code: 'manual-discount-not-permitted', line: 'A1', input: 'manual-discount' }],
    });
  });

  it('PRD-POS-003 applies an amount or a rate, the rate by the discount rounding rule', () => {
    const byAmount = priced(
      priceBill(synBill([synLine('A1', 110000, { manualDiscount: { kind: 'amount', amount: 11000 } })])),
    );
    expect(byAmount.lines[0]).toMatchObject({ manualDiscount: 11000, value: 99000, taxableValue: 90000 });
    const byRate = priced(
      priceBill(synBill([synLine('A1', 110000, { manualDiscount: { kind: 'rate', rate: '12.5' } })])),
    );
    expect(byRate.lines[0]).toMatchObject({ manualDiscount: 13750, value: 96250, taxableValue: 87500 });
    expect(byRate.versions.rounding.discount).toBe('syn-round-1');
  });

  it('PRD-POS-003 refuses a manual discount of nothing or above the line value', () => {
    for (const amount of [0, 110001]) {
      expect(priceBill(synBill([synLine('A1', 110000, { manualDiscount: { kind: 'amount', amount } })]))).toEqual({
        ok: false,
        refusals: [{ code: 'invalid-amount', line: 'A1', input: 'manual-discount' }],
      });
    }
  });
});

describe('refusals (5.10)', () => {
  it('PRD-MOD-015 names every failing line and input at once', () => {
    const result = priceBill(
      synBill([
        synLine('A1', 100000, { quantity: 1.5 }),
        synLine('A2', 100000, { quantity: 0 }),
        synLine('A3', 100000, { classification: unknownValue() }),
        synLine('A4', 100000, { startPrice: { source: 'price-list', priceList: 'SYN-PL9' } }),
      ]),
    );
    expect(result).toEqual({
      ok: false,
      refusals: [
        { code: 'invalid-quantity', line: 'A1', input: 'quantity' },
        { code: 'invalid-quantity', line: 'A2', input: 'quantity' },
        { code: 'classification-unknown', line: 'A3', input: 'classification' },
        { code: 'price-unknown', line: 'A4', input: 'price-list' },
      ],
    });
  });

  it('PRD-SEC-017 refuses with no price basis or registration applicability in force', () => {
    const result = priceBill(
      synBill([synLine('A1', 100000)], {
        tax: { classifications: SYN_TAX.classifications, rateRules: SYN_TAX.rateRules },
      }),
    );
    expect(result).toEqual({
      ok: false,
      refusals: [
        { code: 'no-tax-rule', input: 'price-basis' },
        { code: 'no-tax-rule', input: 'registration-applicability' },
      ],
    });
  });

  it('PRD-TAX-005 GC7-12 refuses tax rounded at the bill level until 5.8 says how it is carried to lines', () => {
    const rounding = {
      ...SYN_ROUNDING,
      tax: { version: 'syn-round-bill-tax', unit: 1, mode: 'half-up' as const, level: 'bill' as const },
    };
    expect(priceBill(synBill([synLine('A1', 100000)], { rounding }))).toEqual({
      ok: false,
      refusals: [{ code: 'not-decided', input: 'tax', question: 'GC7-12' }],
    });
  });

  it('PRD-POS-004 refuses two lines with one identity as a caller defect', () => {
    expect(() => priceBill(synBill([synLine('A1', 100000), synLine('A1', 100000)]))).toThrow(/unique/);
  });
});

describe('tax (5.8)', () => {
  const brandB = { brand: 'SYN-BR-B', hsn: 'SYN-HSN-1' };
  const F200B = synOffer(
    'SYN-F200',
    { kind: 'flat', amountPerUnit: 20000 },
    { goods: { brands: ['SYN-BR-B'], items: [] } },
  );
  const F260B = synOffer(
    'SYN-F260',
    { kind: 'flat', amountPerUnit: 26000 },
    { goods: { brands: ['SYN-BR-B'], items: [] } },
  );

  function withHsn1Rule(rule: TaxRateRule) {
    return { ...SYN_TAX, rateRules: [rule, ...SYN_TAX.rateRules.filter((r) => r.classification !== 'SYN-HSN-1')] };
  }

  it('PRD-TAX-005 charges no tax where the registration charges none, and needs no tax rounding rule', () => {
    const tax = {
      ...SYN_TAX,
      registration: { version: 'syn-reg-none', registration: 'SYN-REG-2', chargesTax: false, components: [] },
    };
    const rounding = synRoundingWithout('tax');
    const bill = priced(priceBill(synBill([synLine('A1', 110000)], { tax, rounding })));
    expect(bill.lines[0]).toMatchObject({
      taxableValue: 110000,
      amountPaid: 110000,
      tax: { rate: null, rateRuleVersion: null, components: [] },
    });
    expect(bill.versions.rounding.tax).toBeNull();
  });

  it('POL-10.02 finds the slab on the value before discounts when the rule compares that value', () => {
    const rule: TaxRateRule = {
      ...(SYN_TAX.rateRules[0] as Extract<TaxRateRule, { kind: 'slabs' }>),
      comparedValue: { per: 'unit', discounts: 'before', tax: 'excluded' },
    };
    const bill = priced(
      priceBill(synBill([synLine('B1', 180000, brandB)], { offers: [F260B], tax: withHsn1Rule(rule) })),
    );
    // 20% from the start value 1,800.00, applied to 1,540.00: tax 128.33 + 128.33, taxable 1,283.34.
    expect(bill.lines[0]).toMatchObject({ value: 154000, taxableValue: 128334, slabChange: null, tax: { rate: '20' } });
  });

  it('POL-10.02 compares a line value with tax when the rule says so', () => {
    const rule: TaxRateRule = {
      ...(SYN_TAX.rateRules[0] as Extract<TaxRateRule, { kind: 'slabs' }>),
      comparedValue: { per: 'line', discounts: 'after', tax: 'included' },
    };
    const bill = priced(priceBill(synBill([synLine('B1', 150000, brandB)], { tax: withHsn1Rule(rule) })));
    expect(bill.lines[0]).toMatchObject({ taxableValue: 125000, tax: { rate: '20' } });
  });

  it('PRD-OFR-005 marks the rate before the discount as Unknown when no single slab gives it', () => {
    const bill = priced(priceBill(synBill([synLine('B1', 170000, brandB)], { offers: [F200B] })));
    expect(bill.lines[0]?.slabChange).toEqual({
      rateBeforeDiscounts: unknownValue(),
      taxableValueBeforeDiscounts: unknownValue(),
      rateAfterDiscounts: '10',
    });
    expect(bill.lines[0]).toMatchObject({ value: 150000, taxableValue: 136364 });
  });

  it('PRD-MER-009 keeps MRP, start price, discount and tax apart and never carries cost', () => {
    const bill = priced(priceBill(synBill([synLine('A1', 110000)])));
    const text = JSON.stringify(bill).toLowerCase();
    expect(text).not.toMatch(/cost|margin|basic|p ?rate/);
    expect(bill.lines[0]).toMatchObject({ mrp: 110000, startPrice: 110000, value: 110000, taxableValue: 100000 });
  });
});
