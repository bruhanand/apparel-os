// Costing and ticket margin (shared-calculations section 8; PRD-PTW-010, PRD-PTW-011, POL-03.06 to POL-03.08).
// Server only: this is the costing entry point, which the counter bundle never holds (2.1, 2.3; PRD-OFF-004).
// Each brand's costing profile is OPEN (V-15); nothing here is a formula for any brand. A profile version, owned by
// `merchandise` · PT, comes in as data.

import { type MaybeKnown, type Paise, isKnown, known, unknownValue } from '@apparel-os/domain';
import { amountIn, amountOut } from '../numbers/amounts.js';
import { formatFixed, parsePercent } from '../numbers/decimal.js';
import { type Fraction, HUNDRED, add, div, fraction, isInteger, mul, sub, toExactString } from '../numbers/fraction.js';
import { type RoundingMode, exactPaise, roundToInteger } from '../numbers/rounding.js';
import { type Result, ok, refusal, refused } from '../result.js';

/**
 * One step of a costing profile, from BASIC to P RATE (POL-03.06): a percentage or flat discount, a percentage or flat
 * addition, a charge spread over the lines of a document, a non-recoverable tax addition, and a rounding step.
 * Recoverable tax is kept apart from cost and is never a step. A spread charge names the line's share as an input,
 * because how a charge is spread over a document's lines is the profile's basis, worked out by the caller.
 */
export type CostingStep =
  | { readonly kind: 'discount-rate'; readonly rate: string }
  | { readonly kind: 'discount-amount'; readonly input: string }
  | { readonly kind: 'addition-rate'; readonly rate: string }
  | { readonly kind: 'addition-amount'; readonly input: string }
  | { readonly kind: 'spread-charge'; readonly input: string }
  | { readonly kind: 'non-recoverable-tax'; readonly rate: string }
  | { readonly kind: 'rounding'; readonly unit: number; readonly mode: RoundingMode };

export interface CostingProfile {
  readonly version: string;
  readonly steps: readonly CostingStep[];
}

export interface CostLineInput {
  readonly basic: MaybeKnown<number>;
  /** Named amounts a step reads, such as a flat addition or this line's share of a spread charge. */
  readonly amounts: Readonly<Record<string, MaybeKnown<number>>>;
  readonly profile: CostingProfile;
}

export interface CostLine {
  readonly profileVersion: string;
  /** Unknown, with the missing inputs listed, when an input is Unknown or missing (POL-03.08; 3.4). */
  readonly pRate: MaybeKnown<Paise>;
  readonly missing: readonly string[];
  /** Each step's exact value in paise, as `n` or `n/d`; empty when P RATE is Unknown. */
  readonly steps: readonly { readonly kind: CostingStep['kind']; readonly value: string }[];
}

/** Cost a line (11): P RATE and its steps, or Unknown. Costing returns Unknown instead of refusing (3.4). */
export function costLine(input: CostLineInput): Result<CostLine> {
  const missing: string[] = [];
  if (!isKnown(input.basic)) missing.push('basic');
  const amountOf = (name: string): Fraction | undefined => {
    const value = input.amounts[name];
    if (value === undefined || !isKnown(value)) {
      if (!missing.includes(name)) missing.push(name);
      return undefined;
    }
    return fraction(amountIn(value.value, `Costing input ${name}`));
  };
  // Read every named input first, so all missing inputs are listed together.
  for (const step of input.profile.steps) {
    if (step.kind === 'discount-amount' || step.kind === 'addition-amount' || step.kind === 'spread-charge') {
      amountOf(step.input);
    }
  }
  if (missing.length > 0 || !isKnown(input.basic)) {
    return ok({ profileVersion: input.profile.version, pRate: unknownValue(), missing, steps: [] });
  }

  let value = fraction(amountIn(input.basic.value, 'BASIC'));
  const steps: { kind: CostingStep['kind']; value: string }[] = [];
  for (const step of input.profile.steps) {
    switch (step.kind) {
      case 'discount-rate':
        value = sub(value, mul(value, parsePercent(step.rate)));
        break;
      case 'addition-rate':
      case 'non-recoverable-tax':
        value = add(value, mul(value, parsePercent(step.rate)));
        break;
      case 'discount-amount':
        value = sub(value, amountOf(step.input) ?? fraction(0n));
        break;
      case 'addition-amount':
      case 'spread-charge':
        value = add(value, amountOf(step.input) ?? fraction(0n));
        break;
      case 'rounding':
        if (!Number.isSafeInteger(step.unit) || step.unit <= 0)
          throw new RangeError('A rounding step needs a unit above zero');
        value = fraction(roundToInteger(div(value, fraction(BigInt(step.unit))), step.mode) * BigInt(step.unit));
        break;
    }
    if (value.n < 0n) throw new RangeError(`Profile ${input.profile.version}: a step took the cost below zero`);
    steps.push({ kind: step.kind, value: toExactString(value) });
  }
  // A P RATE that is not whole paise needs a rounding step the profile does not have (3.2, POL-03.06).
  if (!isInteger(value))
    return refused(refusal('rounding-rule-missing', { input: `costing profile ${input.profile.version}` }));
  return ok({ profileVersion: input.profile.version, pRate: known(amountOut(exactPaise(value))), missing: [], steps });
}

export interface MatchingTolerance {
  /** In paise. */
  readonly amount: number;
  /** Whether a difference equal to the tolerance lies within it; the profile states it (POL-03.06). */
  readonly boundary: 'inclusive' | 'exclusive';
}

export interface CostMatch {
  readonly difference: MaybeKnown<Paise>;
  readonly direction: MaybeKnown<'p-rate-higher' | 'p-rate-lower' | 'equal'>;
  readonly withinTolerance: MaybeKnown<boolean>;
}

/** The matching check (POL-03.07): the difference between P RATE and the supplier-provided cost. It decides nothing. */
export function matchCost(input: {
  readonly pRate: MaybeKnown<number>;
  readonly supplierCost: MaybeKnown<number>;
  readonly tolerance: MatchingTolerance;
}): CostMatch {
  if (!isKnown(input.pRate) || !isKnown(input.supplierCost)) {
    return { difference: unknownValue(), direction: unknownValue(), withinTolerance: unknownValue() };
  }
  const pRate = amountIn(input.pRate.value, 'P RATE');
  const supplier = amountIn(input.supplierCost.value, 'Supplier cost');
  const tolerance = amountIn(input.tolerance.amount, 'Tolerance');
  const difference = pRate > supplier ? pRate - supplier : supplier - pRate;
  const within = input.tolerance.boundary === 'inclusive' ? difference <= tolerance : difference < tolerance;
  return {
    difference: known(amountOut(difference)),
    direction: known(pRate > supplier ? 'p-rate-higher' : pRate < supplier ? 'p-rate-lower' : 'equal'),
    withinTolerance: known(within),
  };
}

/**
 * Ticket MARGIN (PRD-PTW-011): (MRP − P RATE) ÷ MRP × 100, rounded half up to two decimal places. Unknown P RATE
 * gives Unknown MARGIN. A P RATE above the MRP gives a negative margin, rounded half away from zero.
 */
export function ticketMargin(input: {
  readonly mrp: MaybeKnown<number>;
  readonly pRate: MaybeKnown<number>;
}): Result<MaybeKnown<string>> {
  if (!isKnown(input.mrp) || !isKnown(input.pRate)) return ok(unknownValue());
  const mrp = amountIn(input.mrp.value, 'MRP');
  const pRate = amountIn(input.pRate.value, 'P RATE');
  if (mrp === 0n) return refused(refusal('invalid-amount', { input: 'mrp' }));
  const exact = mul(div(fraction(mrp - pRate), fraction(mrp)), HUNDRED);
  const hundredths = roundToInteger(mul(exact, HUNDRED), 'half-up');
  return ok(known(formatFixed(fraction(hundredths, 100n), 2)));
}
