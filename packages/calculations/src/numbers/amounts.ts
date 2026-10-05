// Amounts in and out (shared-calculations 3.1). Every INR amount is an integer number of paise, the Paise type of
// @apparel-os/domain (PRD-MOD-014). Amounts are never negative: a discount, a refund or a round-off says its direction
// by its name. A negative or fractional amount coming in is a defect in the caller, so it throws.

import { type Paise, paise } from '@apparel-os/domain';
import { type Fraction, fraction } from './fraction.js';

/** Reads an incoming amount as a BigInt, refusing anything but a non-negative safe integer. */
export function amountIn(value: number, what: string): bigint {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${what} must be whole paise, not negative, got ${String(value)}`);
  }
  return BigInt(value);
}

export function amountFraction(value: number, what: string): Fraction {
  return fraction(amountIn(value, what));
}

/** Turns a whole BigInt amount into Paise for a result. A negative or unsafe value is a defect. */
export function amountOut(value: bigint): Paise {
  if (value < 0n) throw new Error(`Defect: an amount went below zero (${value.toString()} paise)`);
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) throw new RangeError('Amount beyond the safe integer range');
  return paise(Number(value));
}
