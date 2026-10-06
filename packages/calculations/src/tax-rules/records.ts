// The tax-rule records the calculations read (shared-calculations section 10; PRD-TAX-005, POL-10.02, POL-10.05,
// POL-10.06). `finance` · tax rules owns and stores them (module-map 4.14); this file holds only their pure part: the
// shapes, the checks of 10.1 and 10.3 that need no database, and the choice of the version in force on a business
// date (10.2). No rate, slab, component, share, rounding rule or date is set here: every value comes in as data, and
// stays OPEN until Accounts and the CA supply it (V-18, GC7-1 to GC7-3, GC7-8).

import { type EffectiveDates, type IsoDate, isInForce } from '../dates.js';
import { type DecimalString, parseDecimal } from '../numbers/decimal.js';
import { ONE, compare, sum } from '../numbers/fraction.js';
import { type RoundingRule, type TaxRoundingRule, assertRoundingRule } from '../numbers/rounding.js';

/** One HSN entry the Organisation uses, as the version in force (10.1). */
export interface GoodsClassification {
  readonly code: string;
  readonly version: string;
}

/** Which side a slab's own lower bound falls on: in this slab, or in the slab below (10.1). */
export type BoundSide = 'this-slab' | 'slab-below';

export interface TaxSlab {
  /** In paise. The lowest slab starts at zero (10.3). */
  readonly lowerBound: number;
  readonly boundIn: BoundSide;
  readonly rate: DecimalString;
}

/**
 * The value a slab is compared with. The rule names it, because which value it is stays OPEN for the CA (GC7-2):
 * per unit or per line, before or after discounts, with or without tax.
 */
export interface ComparedValue {
  readonly per: 'unit' | 'line';
  readonly discounts: 'before' | 'after';
  readonly tax: 'excluded' | 'included';
}

/** For one classification: its rate, or its value slabs, each with a rate (10.1). */
export type TaxRateRule =
  | {
      readonly kind: 'single-rate';
      readonly version: string;
      readonly classification: string;
      readonly rate: DecimalString;
    }
  | {
      readonly kind: 'slabs';
      readonly version: string;
      readonly classification: string;
      readonly comparedValue: ComparedValue;
      readonly slabs: readonly TaxSlab[];
    };

export interface TaxComponentShare {
  readonly component: string;
  readonly share: DecimalString;
}

/** For one tax registration: whether a counter sale carries output tax, and its components' shares (10.1, GC7-8). */
export interface RegistrationApplicability {
  readonly version: string;
  readonly registration: string;
  readonly chargesTax: boolean;
  readonly components: readonly TaxComponentShare[];
}

/** Whether selling prices include tax (10.1, GC7-1). */
export interface PriceBasis {
  readonly version: string;
  readonly pricesIncludeTax: boolean;
}

/** The answer of "Read tax rules" for one business date and registration (10.2), as the calculations take it. */
export interface TaxRulesInForce {
  readonly priceBasis?: PriceBasis;
  readonly registration?: RegistrationApplicability;
  readonly classifications: readonly GoodsClassification[];
  readonly rateRules: readonly TaxRateRule[];
}

/** The rounding rules in force, one per kind (3.3, 10.1). A missing kind is refused when a step needs it. */
export interface RoundingRulesInForce {
  readonly discount?: RoundingRule;
  readonly tax?: TaxRoundingRule;
  readonly bill?: RoundingRule;
}

/** The checks of 10.1 and 10.3 on a rate rule. A rule that fails them is a defect in its owner, so it throws. */
export function assertRateRule(rule: TaxRateRule): void {
  if (rule.kind === 'single-rate') {
    parseDecimal(rule.rate);
    return;
  }
  if (rule.slabs.length === 0) throw new RangeError(`Rate rule ${rule.version}: no slabs`);
  rule.slabs.forEach((slab, index) => {
    parseDecimal(slab.rate);
    if (!Number.isSafeInteger(slab.lowerBound) || slab.lowerBound < 0) {
      throw new RangeError(`Rate rule ${rule.version}: a lower bound must be whole paise, not negative`);
    }
    const previous = rule.slabs[index - 1];
    if (index === 0 && slab.lowerBound !== 0) {
      throw new RangeError(`Rate rule ${rule.version}: the lowest slab starts at zero (10.3)`);
    }
    if (previous !== undefined && slab.lowerBound <= previous.lowerBound) {
      throw new RangeError(`Rate rule ${rule.version}: slabs must rise by lower bound`);
    }
  });
}

/** Shares add up to the whole rate when the registration charges tax, and there are none when it does not (10.1). */
export function assertApplicability(applicability: RegistrationApplicability): void {
  if (!applicability.chargesTax) {
    if (applicability.components.length > 0) {
      throw new RangeError(`Applicability ${applicability.version}: no components when no tax is charged`);
    }
    return;
  }
  const total = sum(applicability.components.map((c) => parseDecimal(c.share)));
  if (applicability.components.length === 0 || compare(total, ONE) !== 0) {
    throw new RangeError(`Applicability ${applicability.version}: component shares must add up to one`);
  }
}

const TAX_LEVELS: readonly TaxRoundingRule['level'][] = ['line', 'bill'];

export function assertTaxRoundingRule(rule: TaxRoundingRule): void {
  assertRoundingRule(rule);
  if (!(TAX_LEVELS as readonly string[]).includes(rule.level)) {
    throw new RangeError(`Rounding rule ${rule.version}: the tax level is each line or the bill`);
  }
}

/** A stored version with its dates and whether it is approved (structure-and-masters 2.2; 10.1). */
export type DatedVersion<T> = T & EffectiveDates & { readonly approved: boolean };

/**
 * The approved version in force on a business date, or undefined when none is (10.2). Approved versions never
 * overlap (10.3); two in force on one date is a defect in the stored data, so it throws.
 */
export function versionInForce<T>(versions: readonly DatedVersion<T>[], on: IsoDate): DatedVersion<T> | undefined {
  const found = versions.filter((v) => v.approved && isInForce(v, on));
  if (found.length > 1) throw new Error('Defect: two approved versions are in force on one date');
  return found[0];
}
