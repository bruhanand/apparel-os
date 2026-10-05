// The other tests of shared-calculations 12.5 that need no counter: property tests on random synthetic bills, the
// order test and the snapshot test (PRD-MOD-014, PRD-ACP-010, PRD-POS-014, PRD-OFF-009). The random source is a
// seeded integer generator, so every run checks the same bills and a failure can be replayed. Every value is SYNTHETIC.

import { known } from '@apparel-os/domain';
import { describe, expect, it } from 'vitest';
import {
  type BillLineInput,
  type Offer,
  type PriceBillInput,
  type PricedBill,
  canonicalJson,
  checkTenders,
  priceBill,
  pricedBillReference,
  returnValue,
  splitRefund,
  spreadGroupDiscount,
} from '../src/index.js';
import { SYN_ROUNDING, SYN_TAX, synBill, synOffer, synRule } from './synthetic.js';

/** xorshift32: integers only, seeded. */
function generator(seed: number): (below: number) => number {
  let state = seed >>> 0 || 1;
  return (below: number) => {
    state ^= state << 13;
    state >>>= 0;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return state % below;
  };
}

const RUNS = 300;

function randomBill(random: (below: number) => number, distinct = false): PriceBillInput {
  const count = 1 + random(4);
  const used = new Set<number>();
  const lines: BillLineInput[] = [];
  for (let i = 0; i < count; i += 1) {
    let mrp = 10000 + random(400000);
    while (distinct && used.has(mrp)) mrp += 1;
    used.add(mrp);
    const brand = random(3) === 0 ? 'SYN-BR-B' : 'SYN-BR-A';
    lines.push({
      id: `L${String(i + 1)}`,
      item: `SYN-SKU-${String(i + 1)}`,
      brand,
      classification: known(brand === 'SYN-BR-B' && random(2) === 0 ? 'SYN-HSN-1' : 'SYN-HSN-2'),
      quantity: 1 + random(distinct ? 1 : 3),
      mrp: known(mrp),
      startPrice: { source: 'mrp' },
      ...(brand === 'SYN-BR-B' && random(4) === 0
        ? { manualDiscount: { kind: 'rate' as const, rate: String(random(30)) + '.5' } }
        : {}),
    });
  }
  const pool: Offer[] = [
    synOffer('SYN-P', { kind: 'percentage', rate: `${String(1 + random(40))}.${String(random(10))}` }),
    synOffer('SYN-F', { kind: 'flat', amountPerUnit: random(30000) }, { approvedAt: '2026-09-02T00:00:00Z' }),
    synOffer(
      'SYN-K',
      { kind: 'basket', threshold: random(500000), discount: { kind: 'amount', amount: random(60000) } },
      { approvedAt: '2026-09-03T00:00:00Z' },
    ),
    synOffer(
      'SYN-KR',
      { kind: 'basket', threshold: random(500000), discount: { kind: 'rate', rate: String(1 + random(25)) } },
      { approvedAt: '2026-09-04T00:00:00Z' },
    ),
  ];
  const offers = pool.filter(() => random(2) === 0);
  const rules =
    random(2) === 0
      ? [synRule('SYN-CR', ['SYN-P', 'SYN-F', 'SYN-K'], random(2) === 0 ? 'on-value-left' : 'on-start-value')]
      : [];
  return synBill(lines, { offers, combinationRules: rules });
}

function amountsOf(value: unknown, path = '$'): [string, unknown][] {
  if (typeof value === 'number') return [[path, value]];
  if (Array.isArray(value)) return value.flatMap((item: unknown, i) => amountsOf(item, `${path}[${String(i)}]`));
  if (typeof value === 'object' && value !== null) {
    return Object.entries(value).flatMap(([k, v]) => amountsOf(v, `${path}.${k}`));
  }
  return [];
}

describe('property tests on random synthetic bills (shared-calculations 12.5)', () => {
  it('PRD-POS-023 spread shares add up to the discount', () => {
    const random = generator(11);
    for (let run = 0; run < RUNS; run += 1) {
      const weights = Array.from({ length: 1 + random(6) }, () => BigInt(random(10_000_000)));
      const total = weights.reduce((a, b) => a + b, 0n);
      if (total === 0n) continue;
      const discount = BigInt(random(Number(total < 2_000_000_000n ? total : 2_000_000_000n) + 1));
      const shares = spreadGroupDiscount(discount, weights);
      expect(shares.reduce((a, b) => a + b, 0n)).toBe(discount);
      expect(shares.every((s) => s >= 0n)).toBe(true);
    }
  });

  it('PRD-MOD-014 PRD-ACP-010 prices every line at or above zero, with only whole paise and consistent totals', () => {
    const random = generator(23);
    let priced = 0;
    let withOffers = 0;
    let combined = 0;
    for (let run = 0; run < RUNS; run += 1) {
      const result = priceBill(randomBill(random));
      if (!result.ok) {
        // Only the business refusals a random bill can meet: a slab no single rate fits, or a rule the design leaves open.
        expect(
          result.refusals.every((r) => ['slab-undetermined', 'not-decided', 'invalid-amount'].includes(r.code)),
        ).toBe(true);
        continue;
      }
      priced += 1;
      const bill = result.value;
      if (bill.offers.applied.length > 0) withOffers += 1;
      if (bill.lines.some((l) => l.offerDiscounts.length + l.spreadShares.length > 1)) combined += 1;
      // No fraction reaches a result: every number is a safe integer, and no amount is negative.
      for (const [path, value] of amountsOf(bill)) {
        expect(Number.isSafeInteger(value), path).toBe(true);
        expect(value as number, path).toBeGreaterThanOrEqual(0);
      }
      for (const line of bill.lines) {
        const taken =
          [...line.offerDiscounts, ...line.spreadShares].reduce((a, d) => a + d.amount, 0) + (line.manualDiscount ?? 0);
        expect(line.startValue - taken).toBe(line.value);
        const tax = line.tax.components.reduce((a, c) => a + c.amount, 0);
        expect(line.taxableValue + tax).toBe(line.amountPaid);
      }
      expect(bill.lines.reduce((a, l) => a + l.amountPaid, 0)).toBe(bill.totals.billTotal);
      expect(bill.amountDue + bill.roundOffDown - bill.roundOffUp).toBe(bill.totals.billTotal);
    }
    // The random bills exercise offers, and offers combined on one line, not only plain lines.
    expect(priced).toBeGreaterThan(RUNS / 2);
    expect(withOffers).toBeGreaterThan(RUNS / 4);
    expect(combined).toBeGreaterThan(RUNS / 20);
  });

  it('PRD-POS-006 accepts tender lines that add up to the amount due, and refuses any that do not', () => {
    const random = generator(37);
    for (let run = 0; run < RUNS; run += 1) {
      const result = priceBill(randomBill(random));
      if (!result.ok) continue;
      const bill = result.value;
      const parts = 1 + random(3);
      const lines: { kind: string; amount: number }[] = [];
      let left: number = bill.amountDue;
      for (let i = 0; i < parts - 1 && left > 1; i += 1) {
        const amount = 1 + random(left - 1);
        lines.push({ kind: i === 0 ? 'cash' : `syn-tender-${String(i)}`, amount });
        left -= amount;
      }
      lines.push({ kind: 'card', amount: left });
      const reference = pricedBillReference(bill);
      const checked = checkTenders({ bill, allocation: { billReference: reference, lines } });
      expect(checked.ok).toBe(true);
      if (checked.ok) expect(checked.value.lines.reduce((a, l) => a + l.amount, 0)).toBe(bill.amountDue);
      const off = lines.map((l, i) => (i === 0 ? { ...l, amount: l.amount + 1 } : l));
      expect(checkTenders({ bill, allocation: { billReference: reference, lines: off } })).toMatchObject({
        ok: false,
        refusals: [{ code: 'allocation-mismatch' }],
      });
    }
  });

  it('PRD-RET-024 refunds of all units of a line add up to its paid value', () => {
    const random = generator(41);
    for (let run = 0; run < RUNS; run += 1) {
      const sold = 1 + random(12);
      const paid = random(5_000_000);
      const earlier: { quantity: number; refund: number; status: 'completed' | 'pending' }[] = [];
      let left = sold;
      while (left > 0) {
        const quantity = 1 + random(left);
        const result = returnValue({
          line: { id: 'L1', soldQuantity: sold, paidValue: paid },
          earlierReturns: earlier,
          quantity,
        });
        if (!result.ok) throw new Error('refused');
        earlier.push({ quantity, refund: result.value.refund, status: random(2) === 0 ? 'completed' : 'pending' });
        left -= quantity;
      }
      expect(earlier.reduce((a, r) => a + r.refund, 0)).toBe(paid);
    }
  });

  it('PRD-RET-022 split refunds add up to the refund and respect each cap', () => {
    const random = generator(53);
    for (let run = 0; run < RUNS; run += 1) {
      const tenders = Array.from({ length: 1 + random(4) }, (_, i) => {
        const allocation = random(2_000_000);
        return { tender: `syn-tender-${String(i)}`, allocation, remaining: random(allocation + 1) };
      });
      const room = tenders.reduce((a, t) => a + t.remaining, 0);
      const refund = random(room + 1);
      const result = splitRefund({ tenders, refund });
      if (!result.ok) throw new Error('refused');
      expect(result.value.shares.reduce((a, s) => a + s.amount, 0)).toBe(refund);
      result.value.shares.forEach((share, i) => {
        expect(share.amount).toBeLessThanOrEqual(tenders[i]?.remaining ?? 0);
      });
    }
  });
});

describe('order (shared-calculations 12.5)', () => {
  it('PRD-POS-004 gives the same amounts for the same lines in another order', () => {
    const random = generator(67);
    for (let run = 0; run < RUNS; run += 1) {
      const input = randomBill(random, true);
      const reversed = { ...input, lines: [...input.lines].reverse() };
      const a = priceBill(input);
      const b = priceBill(reversed);
      expect(a.ok).toBe(b.ok);
      if (!a.ok || !b.ok) continue;
      const byId = (bill: PricedBill) => canonicalJson([...bill.lines].sort((x, y) => (x.id < y.id ? -1 : 1)));
      expect(byId(b.value)).toBe(byId(a.value));
      expect(canonicalJson(b.value.totals)).toBe(canonicalJson(a.value.totals));
      expect(canonicalJson(b.value.offers)).toBe(canonicalJson(a.value.offers));
    }
  });
});

describe('snapshot (shared-calculations 12.5)', () => {
  it('PRD-POS-014 PRD-OFF-009 prices a stored bill again with its recorded versions to the same result', () => {
    // Rule data held by version, as an owner would answer for a version a bill recorded.
    const basisPool = [SYN_TAX.priceBasis, { version: 'syn-basis-excl', pricesIncludeTax: false }];
    const roundingPool = {
      discount: [SYN_ROUNDING.discount, { version: 'syn-round-2', unit: 100, mode: 'up' as const }],
      bill: [SYN_ROUNDING.bill, { version: 'syn-round-bill-100', unit: 100, mode: 'half-up' as const }],
    };
    const random = generator(79);
    for (let run = 0; run < RUNS / 3; run += 1) {
      const input = randomBill(random);
      const first = priceBill(input);
      if (!first.ok) continue;
      const recorded = first.value.versions;
      const replay = priceBill({
        ...input,
        offers: input.offers.filter((o) =>
          first.value.offers.considered.some((c) => c.offer === o.id && c.version === o.version),
        ),
        combinationRules: input.combinationRules.filter((r) =>
          first.value.offers.combinationRules.some((c) => c.version === r.version),
        ),
        tax: { ...SYN_TAX, priceBasis: basisPool.find((b) => b?.version === recorded.priceBasis) },
        rounding: {
          ...(recorded.rounding.discount === null
            ? {}
            : { discount: roundingPool.discount.find((r) => r?.version === recorded.rounding.discount) }),
          tax: SYN_ROUNDING.tax,
          bill: roundingPool.bill.find((r) => r?.version === recorded.rounding.bill),
        },
      } as PriceBillInput);
      expect(replay.ok).toBe(true);
      if (replay.ok) expect(canonicalJson(replay.value)).toBe(canonicalJson(first.value));
    }
  });
});
