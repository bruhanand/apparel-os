// Rates and percentages come in as decimal strings, such as "10" or "2.5", and are read exactly; they are never
// JavaScript numbers (shared-calculations 3.1).

import { type Fraction, fraction, HUNDRED, div } from './fraction.js';

/** A non-negative decimal written as a string: digits, optionally a point and more digits. */
export type DecimalString = string;

const DECIMAL = /^(\d+)(?:\.(\d+))?$/;

/** Reads a non-negative decimal string exactly. Malformed text is a caller defect, so it throws. */
export function parseDecimal(text: DecimalString): Fraction {
  const match = DECIMAL.exec(text);
  if (match === null) throw new RangeError(`"${text}" is not a non-negative decimal string`);
  const whole = match[1] ?? '0';
  const part = match[2] ?? '';
  return fraction(BigInt(whole + part), 10n ** BigInt(part.length));
}

/** A percentage such as "10" as the exact fraction 1/10. */
export function parsePercent(text: DecimalString): Fraction {
  return div(parseDecimal(text), HUNDRED);
}

/**
 * Writes an exact value as the shortest decimal string, such as "5" or "2.5". Only a value with a terminating decimal
 * expansion can be written; anything else is a defect in the caller.
 */
export function formatDecimal(value: Fraction): DecimalString {
  let d = value.d;
  let twos = 0n;
  let fives = 0n;
  while (d % 2n === 0n) {
    d /= 2n;
    twos += 1n;
  }
  while (d % 5n === 0n) {
    d /= 5n;
    fives += 1n;
  }
  if (d !== 1n) throw new RangeError('The value has no terminating decimal expansion');
  const places = twos > fives ? twos : fives;
  const scaled = (value.n * 10n ** places) / value.d;
  const negative = scaled < 0n;
  const digits = (negative ? -scaled : scaled).toString().padStart(Number(places) + 1, '0');
  const cut = digits.length - Number(places);
  const text = places === 0n ? digits : `${digits.slice(0, cut)}.${digits.slice(cut)}`;
  return (negative ? '-' : '') + text;
}

/** Writes an exact value with exactly `places` decimals; the value must already be a multiple of 10^-places. */
export function formatFixed(value: Fraction, places: number): string {
  const scale = 10n ** BigInt(places);
  if ((value.n * scale) % value.d !== 0n) throw new RangeError(`The value is not a multiple of 10^-${String(places)}`);
  const scaled = (value.n * scale) / value.d;
  const negative = scaled < 0n;
  const digits = (negative ? -scaled : scaled).toString().padStart(places + 1, '0');
  const cut = digits.length - places;
  const text = places === 0 ? digits : `${digits.slice(0, cut)}.${digits.slice(cut)}`;
  return (negative ? '-' : '') + text;
}
