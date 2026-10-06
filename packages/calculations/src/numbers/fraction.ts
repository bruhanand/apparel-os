// Exact fractions of two BigInt integers (shared-calculations 3.2). Every intermediate value of a calculation is one
// of these; nothing is held in binary floating point (PRD-MOD-014, domain-model invariant 18).

/** An exact fraction, always in lowest terms with a positive denominator. */
export interface Fraction {
  readonly n: bigint;
  readonly d: bigint;
}

function gcd(a: bigint, b: bigint): bigint {
  let x = a < 0n ? -a : a;
  let y = b < 0n ? -b : b;
  while (y !== 0n) {
    const t = x % y;
    x = y;
    y = t;
  }
  return x;
}

export function fraction(n: bigint, d = 1n): Fraction {
  if (d === 0n) throw new RangeError('A fraction cannot have a zero denominator');
  const sign = d < 0n ? -1n : 1n;
  const g = gcd(n, d);
  const divisor = g === 0n ? 1n : g;
  return { n: (sign * n) / divisor, d: (sign * d) / divisor };
}

export const ZERO: Fraction = fraction(0n);
export const ONE: Fraction = fraction(1n);
export const HUNDRED: Fraction = fraction(100n);

export function fromInteger(value: number | bigint): Fraction {
  if (typeof value === 'number' && !Number.isSafeInteger(value)) {
    throw new RangeError(`Expected a safe integer, got ${String(value)}`);
  }
  return fraction(BigInt(value));
}

export function add(a: Fraction, b: Fraction): Fraction {
  return fraction(a.n * b.d + b.n * a.d, a.d * b.d);
}

export function sub(a: Fraction, b: Fraction): Fraction {
  return fraction(a.n * b.d - b.n * a.d, a.d * b.d);
}

export function mul(a: Fraction, b: Fraction): Fraction {
  return fraction(a.n * b.n, a.d * b.d);
}

export function div(a: Fraction, b: Fraction): Fraction {
  if (b.n === 0n) throw new RangeError('Division by zero');
  return fraction(a.n * b.d, a.d * b.n);
}

export function sum(values: readonly Fraction[]): Fraction {
  return values.reduce(add, ZERO);
}

/** -1, 0 or 1. */
export function compare(a: Fraction, b: Fraction): number {
  const left = a.n * b.d;
  const right = b.n * a.d;
  return left < right ? -1 : left > right ? 1 : 0;
}

export function isInteger(a: Fraction): boolean {
  return a.d === 1n;
}

export function isNegative(a: Fraction): boolean {
  return a.n < 0n;
}

/** The largest integer not above the fraction. */
export function floor(a: Fraction): bigint {
  const q = a.n / a.d; // BigInt division truncates toward zero
  return a.n < 0n && q * a.d !== a.n ? q - 1n : q;
}

export function min(a: Fraction, b: Fraction): Fraction {
  return compare(a, b) <= 0 ? a : b;
}

/** Canonical text of an exact value: `12`, `-3` or `1001/3`. Used where an exact intermediate is shown. */
export function toExactString(a: Fraction): string {
  return a.d === 1n ? a.n.toString() : `${a.n.toString()}/${a.d.toString()}`;
}
