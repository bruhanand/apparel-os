// PRD-MOD-014: INR is stored as integer paise and never as binary floating point.
// A Paise value is a safe integer. Tax, discount and rounding rules (PRD-MOD-007) are not here.

declare const paiseBrand: unique symbol;

/** An amount of INR in whole paise. */
export type Paise = number & { readonly [paiseBrand]: true };

/** Accepts only safe integers. Throws for fractions, NaN, Infinity and integers beyond the safe range. */
export function paise(value: number): Paise {
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(`Paise must be a safe integer, got ${String(value)}`);
  }
  // Number.isSafeInteger accepts -0; keep one representation of zero.
  return (value === 0 ? 0 : value) as Paise;
}

/** Adds two amounts and refuses a result outside the safe integer range. */
export function addPaise(a: Paise, b: Paise): Paise {
  return paise(a + b);
}

/**
 * An amount in paise as rupees with two decimals, exactly, as an export or a file writes it: through integer
 * arithmetic, never a binary fraction, its sign kept for an amount under a rupee (PRD-MOD-014; S2-F06-T01 code review 7).
 */
export function rupeesText(amount: Paise): string {
  const value = BigInt(amount);
  const sign = value < 0n ? '-' : '';
  const magnitude = value < 0n ? -value : value;
  return `${sign}${String(magnitude / 100n)}.${String(magnitude % 100n).padStart(2, '0')}`;
}

/** A decimal written out: an optional sign, digits, and digits after one point. */
const DECIMAL = /^(-?)(\d+)(?:\.(\d+))?$/;

/**
 * A decimal text, such as a numeric column PostgreSQL gives as text, written with the places asked, exactly: the
 * places it lacks padded with zeros. Throws for a text that is no decimal, or that has more places than asked, rather
 * than round it (PRD-MOD-014).
 */
export function decimalText(text: string, places: number): string {
  const match = DECIMAL.exec(text);
  if (match === null) throw new RangeError(`Not a decimal: ${text}`);
  const [, sign = '', whole = '', fraction = ''] = match;
  if (fraction.length > places) throw new RangeError(`More than ${String(places)} places: ${text}`);
  return places === 0 ? `${sign}${whole}` : `${sign}${whole}.${fraction.padEnd(places, '0')}`;
}
