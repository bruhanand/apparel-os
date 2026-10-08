import { describe, expect, it } from 'vitest';
import { checkFormat, couldRepeat, formatNumber, patternOf, type FormatPart } from './format.js';

// S1-F08-T01: the parts of a number format and the check that two series in one display scope can never give the same
// text (numbering-and-audit 3.5, 7 test 5; PRD-MOD-008). Every format here is SYNTHETIC; no format has a default.

const synBill: FormatPart[] = [
  { kind: 'text', text: 'SYN/' },
  { kind: 'scope' },
  { kind: 'text', text: '/' },
  { kind: 'year' },
  { kind: 'text', text: '/' },
  { kind: 'sequence', width: 5 },
];

describe('formatting a number (numbering-and-audit 3.5)', () => {
  it('puts fixed text, the scope part, the year label and the sequence at its width together', () => {
    const pattern = patternOf(synBill, { scopeText: 'D01', financialYear: 'FY-SYN-1' });
    expect(formatNumber(pattern, 42)).toBe('SYN/D01/FY-SYN-1/00042');
  });

  it('gives no text to a number that does not fit the width', () => {
    const pattern = patternOf([{ kind: 'sequence', width: 2 }], {});
    expect(formatNumber(pattern, 99)).toBe('99');
    expect(formatNumber(pattern, 100)).toBeUndefined();
  });
});

describe('a format is checked before a series uses it (numbering-and-audit 3.5)', () => {
  it('takes exactly one sequence part with a width', () => {
    expect(checkFormat([{ kind: 'text', text: 'SYN' }], { yearly: true })).toBe('numbering.format-invalid');
    expect(
      checkFormat(
        [
          { kind: 'sequence', width: 3 },
          { kind: 'sequence', width: 3 },
        ],
        { yearly: true },
      ),
    ).toBe('numbering.format-invalid');
    expect(checkFormat([{ kind: 'sequence', width: 0 }], { yearly: true })).toBe('numbering.format-invalid');
    expect(checkFormat([{ kind: 'sequence', width: 16 }], { yearly: true })).toBe('numbering.format-invalid');
    expect(checkFormat(synBill, { yearly: true })).toBeUndefined();
  });

  it('refuses empty fixed text and a scope or year part named twice', () => {
    expect(
      checkFormat(
        [
          { kind: 'text', text: '' },
          { kind: 'sequence', width: 3 },
        ],
        { yearly: true },
      ),
    ).toBe('numbering.format-invalid');
    expect(checkFormat([{ kind: 'year' }, { kind: 'year' }, { kind: 'sequence', width: 3 }], { yearly: true })).toBe(
      'numbering.format-invalid',
    );
  });

  it('refuses the year label for a kind that does not restart each financial year', () => {
    expect(checkFormat(synBill, { yearly: false })).toBe('numbering.format-not-for-kind');
  });
});

describe('two series in one display scope never give the same text (numbering-and-audit 3.5, 7 test 5)', () => {
  it('PRD-MOD-008 a format without the scope part could repeat text across two device series', () => {
    const noDevice: FormatPart[] = [{ kind: 'text', text: 'SYN-' }, { kind: 'year' }, { kind: 'sequence', width: 4 }];
    const first = patternOf(noDevice, { scopeText: 'D01', financialYear: 'FY-SYN-1' });
    const second = patternOf(noDevice, { scopeText: 'D02', financialYear: 'FY-SYN-1' });
    expect(couldRepeat(first, second)).toBe(true);
  });

  it('PRD-MOD-008 the scope part keeps two device series apart', () => {
    const first = patternOf(synBill, { scopeText: 'D01', financialYear: 'FY-SYN-1' });
    const second = patternOf(synBill, { scopeText: 'D02', financialYear: 'FY-SYN-1' });
    expect(couldRepeat(first, second)).toBe(false);
  });

  it('PRD-MOD-008 a scope text made of digits can still meet another series sequence', () => {
    // "A1" + 3 digits and "A" + 4 digits both give A1001.
    const first = patternOf([{ kind: 'text', text: 'A' }, { kind: 'scope' }, { kind: 'sequence', width: 3 }], {
      scopeText: '1',
    });
    const second = patternOf(
      [
        { kind: 'text', text: 'A' },
        { kind: 'sequence', width: 4 },
      ],
      {},
    );
    expect(couldRepeat(first, second)).toBe(true);
  });

  it('PRD-MOD-008 texts of different lengths never meet', () => {
    const first = patternOf([{ kind: 'sequence', width: 3 }], {});
    const second = patternOf([{ kind: 'sequence', width: 4 }], {});
    expect(couldRepeat(first, second)).toBe(false);
  });

  it('PRD-MOD-008 differing fixed text keeps formats apart', () => {
    const first = patternOf(
      [
        { kind: 'text', text: 'X' },
        { kind: 'sequence', width: 3 },
      ],
      {},
    );
    const second = patternOf(
      [
        { kind: 'text', text: 'Y' },
        { kind: 'sequence', width: 3 },
      ],
      {},
    );
    expect(couldRepeat(first, second)).toBe(false);
  });
});
