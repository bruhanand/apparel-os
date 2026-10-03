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
