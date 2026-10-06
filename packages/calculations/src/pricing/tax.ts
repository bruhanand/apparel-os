// Tax on each line's value after all discounts (shared-calculations 5.8; PRD-TAX-005, PRD-OFR-005, POL-10.02,
// POL-10.05). No rate, slab, component, share or date is set here: they come in as the rules in force (section 10).
// The value compared with a slab is named by the rule (GC7-2); the price basis says whether prices include tax
// (GC7-1); the components and shares come from the registration (GC7-8); the taxable value with tax included is the
// price paid less the rounded components, the Proposed reading of 5.8 (GC7-3).

import { formatDecimal, parseDecimal, parsePercent } from '../numbers/decimal.js';
import { type Fraction, ONE, add, compare, div, fraction, mul } from '../numbers/fraction.js';
import { type TaxRoundingRule, roundByRule } from '../numbers/rounding.js';
import type { ComparedValue, RegistrationApplicability, TaxRateRule, TaxSlab } from '../tax-rules/records.js';

export interface TaxAtRate {
  readonly taxableValue: bigint;
  readonly components: readonly { readonly component: string; readonly rate: string; readonly amount: bigint }[];
  readonly amountPaid: bigint;
}

/**
 * The tax of a line value at one rate. With tax included, each component is worked out on the exact taxable value,
 * rounded by the tax rounding rule, and the taxable value is what is left; without, tax is added to the value.
 */
export function taxAtRate(
  value: bigint,
  ratePercent: string,
  registration: RegistrationApplicability,
  pricesIncludeTax: boolean,
  rule: TaxRoundingRule,
): TaxAtRate {
  const rate = parsePercent(ratePercent);
  const exactTaxable: Fraction = pricesIncludeTax ? div(fraction(value), add(ONE, rate)) : fraction(value);
  const components = registration.components.map((c) => {
    const share = parseDecimal(c.share);
    return {
      component: c.component,
      rate: formatDecimal(mul(parseDecimal(ratePercent), share)),
      amount: roundByRule(mul(mul(exactTaxable, rate), share), rule),
    };
  });
  const tax = components.reduce((acc, c) => acc + c.amount, 0n);
  if (pricesIncludeTax) {
    const taxableValue = value - tax;
    if (taxableValue < 0n) throw new Error('Defect: tax above the price paid');
    return { taxableValue, components, amountPaid: value };
  }
  return { taxableValue: value, components, amountPaid: value + tax };
}

/** Whether a compared value falls in a slab; each bound says which side its own value falls on (10.1). */
function inSlab(compared: Fraction, slabs: readonly TaxSlab[], index: number): boolean {
  const slab = slabs[index];
  if (slab === undefined) return false;
  const lower = compare(compared, fraction(BigInt(slab.lowerBound)));
  const aboveLower = lower > 0 || (lower === 0 && slab.boundIn === 'this-slab');
  const next = slabs[index + 1];
  if (next === undefined) return aboveLower;
  const upper = compare(compared, fraction(BigInt(next.lowerBound)));
  const belowUpper = upper < 0 || (upper === 0 && next.boundIn === 'slab-below');
  return aboveLower && belowUpper;
}

function comparedAmount(at: TaxAtRate, compared: ComparedValue, quantity: bigint): Fraction {
  const tax = at.components.reduce((acc, c) => acc + c.amount, 0n);
  const amount = compared.tax === 'excluded' ? at.taxableValue : at.taxableValue + tax;
  return compared.per === 'unit' ? fraction(amount, quantity) : fraction(amount);
}

export type RateFound =
  { readonly kind: 'found'; readonly rate: string; readonly at: TaxAtRate } | { readonly kind: 'undetermined' };

/**
 * The rate a rule gives a value (5.8). A slab rule is tried slab by slab: the line is worked out at that slab's rate
 * and the slab is kept if the compared value falls in it. No slab or more than one is undetermined: the answer is the
 * CA's (GC7-2), so the caller refuses.
 */
export function findRate(
  rule: TaxRateRule,
  value: bigint,
  quantity: bigint,
  registration: RegistrationApplicability,
  pricesIncludeTax: boolean,
  rounding: TaxRoundingRule,
): RateFound {
  if (rule.kind === 'single-rate') {
    return {
      kind: 'found',
      rate: rule.rate,
      at: taxAtRate(value, rule.rate, registration, pricesIncludeTax, rounding),
    };
  }
  const fits: RateFound[] = [];
  rule.slabs.forEach((slab, index) => {
    const at = taxAtRate(value, slab.rate, registration, pricesIncludeTax, rounding);
    if (inSlab(comparedAmount(at, rule.comparedValue, quantity), rule.slabs, index)) {
      fits.push({ kind: 'found', rate: slab.rate, at });
    }
  });
  const only = fits[0];
  return fits.length === 1 && only !== undefined ? only : { kind: 'undetermined' };
}

/** Two rate strings name the same rate. */
export function sameRate(a: string, b: string): boolean {
  return compare(parseDecimal(a), parseDecimal(b)) === 0;
}
