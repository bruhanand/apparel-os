import { describe, expect, it } from 'vitest';
import { addPaise, decimalText, paise, rupeesText } from './money.js';

describe('PRD-MOD-014 rupeesText', () => {
  it('PRD-MOD-014 writes paise as rupees with two decimals, exactly', () => {
    expect(rupeesText(paise(94_500))).toBe('945.00');
    expect(rupeesText(paise(199_905))).toBe('1999.05');
    expect(rupeesText(paise(7))).toBe('0.07');
    expect(rupeesText(paise(0))).toBe('0.00');
  });

  it('PRD-MOD-014 keeps the sign of a negative amount, under a rupee too', () => {
    expect(rupeesText(paise(-50))).toBe('-0.50');
    expect(rupeesText(paise(-12_345))).toBe('-123.45');
  });

  it('PRD-MOD-014 is exact at the edge of the safe range, never through a binary fraction', () => {
    expect(rupeesText(paise(Number.MAX_SAFE_INTEGER))).toBe('90071992547409.91');
    expect(rupeesText(paise(Number.MIN_SAFE_INTEGER))).toBe('-90071992547409.91');
  });
});

describe('PRD-MOD-014 decimalText', () => {
  it('PRD-MOD-014 writes a decimal text with the places asked, exactly', () => {
    expect(decimalText('52.73', 2)).toBe('52.73');
    expect(decimalText('52.7', 2)).toBe('52.70');
    expect(decimalText('52', 2)).toBe('52.00');
    expect(decimalText('-0.5', 2)).toBe('-0.50');
  });

  it('PRD-MOD-014 refuses a text that is no decimal, or has more places than asked, rather than round it', () => {
    expect(() => decimalText('52.735', 2)).toThrow(RangeError);
    expect(() => decimalText('1e3', 2)).toThrow(RangeError);
    expect(() => decimalText('', 2)).toThrow(RangeError);
  });
});

describe('paise', () => {
  it('accepts safe integers, including zero and negatives', () => {
    expect(paise(0)).toBe(0);
    expect(paise(12_345)).toBe(12_345);
    expect(paise(-50)).toBe(-50);
    expect(paise(Number.MAX_SAFE_INTEGER)).toBe(Number.MAX_SAFE_INTEGER);
  });

  it('keeps a single representation of zero', () => {
    expect(Object.is(paise(-0), 0)).toBe(true);
  });

  it('rejects fractions', () => {
    expect(() => paise(1.5)).toThrow(RangeError);
  });

  it('rejects integers beyond the safe range', () => {
    expect(() => paise(Number.MAX_SAFE_INTEGER + 1)).toThrow(RangeError);
    expect(() => paise(Number.MIN_SAFE_INTEGER - 1)).toThrow(RangeError);
  });

  it('rejects NaN and infinity', () => {
    expect(() => paise(Number.NaN)).toThrow(RangeError);
    expect(() => paise(Number.POSITIVE_INFINITY)).toThrow(RangeError);
  });
});

describe('addPaise', () => {
  it('adds exactly', () => {
    expect(addPaise(paise(10), paise(5))).toBe(15);
    expect(addPaise(paise(10), paise(-25))).toBe(-15);
  });

  it('rejects a result outside the safe integer range', () => {
    expect(() => addPaise(paise(Number.MAX_SAFE_INTEGER), paise(1))).toThrow(RangeError);
    expect(() => addPaise(paise(Number.MIN_SAFE_INTEGER), paise(-1))).toThrow(RangeError);
  });
});
