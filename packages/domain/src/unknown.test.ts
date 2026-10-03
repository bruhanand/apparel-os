import { describe, expect, it } from 'vitest';
import { paise } from './money.js';
import { isKnown, known, unknownValue } from './unknown.js';

describe('MaybeKnown', () => {
  it('keeps Unknown distinct from zero', () => {
    const zero = known(paise(0));
    const missing = unknownValue();
    expect(isKnown(zero)).toBe(true);
    expect(isKnown(missing)).toBe(false);
    expect(missing).not.toEqual(zero);
    expect(missing.kind).toBe('unknown');
    expect('value' in missing).toBe(false);
  });

  it('keeps the known value as given', () => {
    const value = known('');
    expect(isKnown(value) && value.value).toBe('');
  });
});
