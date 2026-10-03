import { describe, expect, it } from 'vitest';
import { addPaise, paise } from './money.js';

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
