// Rounding rules (shared-calculations 3.3). An exact fraction becomes whole paise only at a named rounding step. The
// modes are the mechanism; which one applies is a versioned rule passed in, never a default (PRD-MOD-015, GC7-3 to
// GC7-5). The three roundings the PRD fixes need no rule: spread shares and part-line refunds round down
// (PRD-POS-023, PRD-RET-024), and ticket MARGIN rounds half up to two decimals (PRD-PTW-011).

import { type Fraction, compare, div, floor, fraction, isInteger, sub } from './fraction.js';

/**
 * The four modes of 3.3. They act on the magnitude: `down` toward zero, `up` away from zero, `half-up` to the nearest
 * with a half away from zero, `half-to-even` to the nearest with a half to the even neighbour. Amounts are never
 * negative (3.1), so for amounts these are the usual floor, ceiling and nearest roundings.
 */
export type RoundingMode = 'half-up' | 'half-to-even' | 'up' | 'down';

export const ROUNDING_MODES: readonly RoundingMode[] = ['half-up', 'half-to-even', 'up', 'down'];

/** A rounding rule version for discounts or the bill: the unit in paise and the mode. */
export interface RoundingRule {
  readonly version: string;
  /** The unit in whole paise, above zero: 1 paise, or a larger unit such as 100 paise. */
  readonly unit: number;
  readonly mode: RoundingMode;
}

/** A tax rounding rule version also names its level: each line, or the bill (3.3). */
export interface TaxRoundingRule extends RoundingRule {
  readonly level: 'line' | 'bill';
}

const HALF = fraction(1n, 2n);

/** Rounds an exact value to an integer under a mode. */
export function roundToInteger(value: Fraction, mode: RoundingMode): bigint {
  const negative = value.n < 0n;
  const magnitude = negative ? fraction(-value.n, value.d) : value;
  const low = floor(magnitude);
  let result: bigint;
  if (isInteger(magnitude)) {
    result = low;
  } else {
    const rest = sub(magnitude, fraction(low));
    const side = compare(rest, HALF);
    switch (mode) {
      case 'down':
        result = low;
        break;
      case 'up':
        result = low + 1n;
        break;
      case 'half-up':
        result = side >= 0 ? low + 1n : low;
        break;
      case 'half-to-even':
        result = side > 0 || (side === 0 && low % 2n !== 0n) ? low + 1n : low;
        break;
    }
  }
  return negative ? -result : result;
}

/** Checks a rule's shape; a malformed rule is a defect in the caller (10.3: unit above zero, one of the four modes). */
export function assertRoundingRule(rule: RoundingRule): void {
  if (!Number.isSafeInteger(rule.unit) || rule.unit <= 0) {
    throw new RangeError(`Rounding rule ${rule.version}: the unit must be whole paise above zero`);
  }
  if (!ROUNDING_MODES.includes(rule.mode)) {
    throw new RangeError(`Rounding rule ${rule.version}: unknown mode`);
  }
}

/** A named rounding step: an exact amount in paise to whole paise under a rule version (3.3). */
export function roundByRule(value: Fraction, rule: RoundingRule): bigint {
  assertRoundingRule(rule);
  const unit = fraction(BigInt(rule.unit));
  return roundToInteger(div(value, unit), rule.mode) * BigInt(rule.unit);
}

/** The PRD's own step for spread shares and part-line refunds: down to whole paise (PRD-POS-023, PRD-RET-024). */
export function roundDownToPaise(value: Fraction): bigint {
  return roundToInteger(value, 'down');
}

/**
 * An exact value that must already be whole paise. A fraction here means a rounding step is missing, which is a
 * defect, never a business condition (3.2), so it throws.
 */
export function exactPaise(value: Fraction): bigint {
  if (!isInteger(value))
    throw new Error('Defect: a fraction of a paise reached a result without a named rounding step');
  return value.n;
}
