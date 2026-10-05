import { describe, expect, it } from 'vitest';
import { formatDecimal, formatFixed, parseDecimal, parsePercent } from './decimal.js';
import { add, compare, div, floor, fraction, mul, sub, toExactString } from './fraction.js';
import { exactPaise, roundByRule, roundDownToPaise, roundToInteger } from './rounding.js';

// shared-calculations 3.1 to 3.3: exact fractions, decimal strings and named rounding steps.

describe('exact fractions (shared-calculations 3.2)', () => {
  it('PRD-MOD-014 keeps every intermediate exact, in lowest terms', () => {
    const third = fraction(1n, 3n);
    expect(add(third, third)).toEqual(fraction(2n, 3n));
    expect(mul(fraction(6n, 4n), fraction(2n))).toEqual(fraction(3n));
    expect(sub(fraction(1n), third)).toEqual(fraction(2n, 3n));
    expect(div(fraction(1n), fraction(-3n))).toEqual({ n: -1n, d: 3n });
    expect(toExactString(fraction(1001n, 3n))).toBe('1001/3');
    expect(compare(fraction(1n, 3n), fraction(333n, 1000n))).toBe(1);
  });

  it('floors toward minus infinity', () => {
    expect(floor(fraction(7n, 2n))).toBe(3n);
    expect(floor(fraction(-7n, 2n))).toBe(-4n);
  });

  it('refuses a zero denominator', () => {
    expect(() => fraction(1n, 0n)).toThrow(RangeError);
    expect(() => div(fraction(1n), fraction(0n))).toThrow(RangeError);
  });
});

describe('decimal strings (shared-calculations 3.1)', () => {
  it('reads rates exactly, never as JavaScript numbers', () => {
    expect(parseDecimal('2.5')).toEqual(fraction(5n, 2n));
    expect(parseDecimal('0.1')).toEqual(fraction(1n, 10n));
    expect(parsePercent('10')).toEqual(fraction(1n, 10n));
  });

  it.each(['', '1e3', '-1', '.5', '1.', ' 1', '1,5', 'NaN'])('refuses the malformed text "%s"', (text) => {
    expect(() => parseDecimal(text)).toThrow(RangeError);
  });

  it('writes the shortest exact decimal, and refuses a value with no terminating expansion', () => {
    expect(formatDecimal(fraction(5n))).toBe('5');
    expect(formatDecimal(fraction(1n, 2n))).toBe('0.5');
    expect(formatDecimal(fraction(-1n, 8n))).toBe('-0.125');
    expect(() => formatDecimal(fraction(1n, 3n))).toThrow(RangeError);
    expect(formatFixed(fraction(5273n, 100n), 2)).toBe('52.73');
    expect(formatFixed(fraction(50n), 2)).toBe('50.00');
  });
});

describe('rounding (shared-calculations 3.3)', () => {
  it('PRD-MOD-015 applies each of the four modes as named, never a default', () => {
    const half = fraction(5n, 2n);
    expect(roundToInteger(half, 'half-up')).toBe(3n);
    expect(roundToInteger(half, 'half-to-even')).toBe(2n);
    expect(roundToInteger(fraction(7n, 2n), 'half-to-even')).toBe(4n);
    expect(roundToInteger(half, 'up')).toBe(3n);
    expect(roundToInteger(half, 'down')).toBe(2n);
    expect(roundToInteger(fraction(21n, 10n), 'half-up')).toBe(2n);
    expect(roundToInteger(fraction(29n, 10n), 'down')).toBe(2n);
    expect(roundToInteger(fraction(4n), 'up')).toBe(4n);
  });

  it('acts on the magnitude of a negative value', () => {
    expect(roundToInteger(fraction(-5n, 2n), 'half-up')).toBe(-3n);
    expect(roundToInteger(fraction(-5n, 2n), 'down')).toBe(-2n);
  });

  it('rounds to a rule unit larger than one paise', () => {
    const rule = { version: 'syn-round-test', unit: 100, mode: 'half-up' as const };
    expect(roundByRule(fraction(286050n), rule)).toBe(286100n);
    expect(roundByRule(fraction(286049n), rule)).toBe(286000n);
  });

  it('refuses a malformed rule', () => {
    expect(() => roundByRule(fraction(1n), { version: 'syn-round-test', unit: 0, mode: 'up' })).toThrow(RangeError);
    expect(() => roundByRule(fraction(1n), { version: 'syn-round-test', unit: 1.5, mode: 'up' })).toThrow(RangeError);
  });

  it('PRD-POS-023 PRD-RET-024 rounds the PRD-fixed steps down to whole paise', () => {
    expect(roundDownToPaise(fraction(100000n, 3n))).toBe(33333n);
  });

  it('PRD-MOD-014 treats a fraction reaching a result without a named step as a defect', () => {
    expect(exactPaise(fraction(12n))).toBe(12n);
    expect(() => exactPaise(fraction(5n, 2n))).toThrow(/named rounding step/);
  });
});
