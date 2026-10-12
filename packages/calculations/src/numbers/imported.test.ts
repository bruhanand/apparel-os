import { describe, expect, it } from 'vitest';
import { rupeesToPaise, sumDecimals } from './imported.js';

// imports-and-opening-data 6.2 and 5 "Calculated": an imported amount becomes whole paise by exact decimal
// arithmetic, and a named sum adds decimals exactly (PRD-MOD-014).

describe('rupeesToPaise (imports-and-opening-data 6.2; class C-2)', () => {
  it.each([
    ['0', 0],
    ['1', 100],
    ['1.5', 150],
    ['499.99', 49_999],
    ['0.10', 10],
    ['1.000', 100],
  ])('PRD-MOD-014 reads %s rupees as %d paise exactly', (text, expected) => {
    expect(rupeesToPaise(text)).toEqual({ kind: 'paise', paise: expected });
  });

  it.each(['0.001', '1.005', '0.30000000000000004'])(
    'PRD-MOD-014 gives %s no paise value: it has more decimals than paise, and no rounding rule is named',
    (text) => {
      expect(rupeesToPaise(text)).toEqual({ kind: 'finer-than-paise' });
    },
  );
});

describe('sumDecimals (section 5 "Calculated")', () => {
  it('PRD-MOD-014 adds exactly, never in binary floating point', () => {
    expect(sumDecimals(['0.1', '0.2'])).toBe('0.3');
    expect(sumDecimals(['2.5', '2.5', '9'])).toBe('14');
  });
});
