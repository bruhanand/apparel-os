// Imported amounts (imports-and-opening-data 5, 6.2; shared-calculations 3.1, 3.2): an amount a file gives in rupees
// becomes whole paise by exact decimal arithmetic, and a named calculation adds decimals exactly (PRD-MOD-014). A value
// with more decimals than paise gets no paise value: the mapping would have to name a rounding rule, and which rule
// each money column uses is OPEN (GC6-13, Accounts), so it stays Unknown (class C-2; PRD-MOD-015).

import { type Paise } from '@apparel-os/domain';
import { amountOut } from './amounts.js';
import { type DecimalString, formatDecimal, parseDecimal } from './decimal.js';
import { add, fraction, isInteger, mul, ZERO } from './fraction.js';

/** An amount in rupees as whole paise, or `finer-than-paise` when it has more decimals than paise. */
export type ImportedPaise = { readonly kind: 'paise'; readonly paise: Paise } | { readonly kind: 'finer-than-paise' };

/** Reads a non-negative decimal string of rupees as whole paise, exactly. Malformed text is a caller defect. */
export function rupeesToPaise(text: DecimalString): ImportedPaise {
  const inPaise = mul(parseDecimal(text), fraction(100n));
  if (!isInteger(inPaise)) return { kind: 'finer-than-paise' };
  return { kind: 'paise', paise: amountOut(inPaise.n) };
}

/** The exact sum of non-negative decimal strings, as the shortest decimal string. */
export function sumDecimals(texts: readonly DecimalString[]): DecimalString {
  return formatDecimal(texts.reduce((total, text) => add(total, parseDecimal(text)), ZERO));
}
