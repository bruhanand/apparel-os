import { describe, expect, it } from 'vitest';
import { coverageFrom, type PartitionBound } from './coverage.js';

const month = (iso: string): Date => new Date(`${iso}-01T00:00:00Z`);
const bound = (parent: string, from: string, to: string): PartitionBound => ({
  parent,
  lower: month(from),
  upper: month(to),
});
const AT = new Date('2026-10-20T10:00:00Z');

describe('coverageFrom: how far the audit partitions reach (numbering-and-audit 4.4; DEC-112, CH-5)', () => {
  it('reaches the end of the unbroken run of months from the current one, for the table that reaches least', () => {
    const coverage = coverageFrom(
      ['a', 'b'],
      [
        bound('a', '2026-10', '2026-11'),
        bound('a', '2026-11', '2026-12'),
        bound('a', '2026-12', '2027-01'),
        bound('b', '2026-10', '2026-11'),
        bound('b', '2026-11', '2026-12'),
      ],
      AT,
    );
    expect(coverage).toEqual({ coveredUntil: month('2026-12'), coversNextMonth: true });
  });

  it('raises the alert when next month is not covered', () => {
    expect(coverageFrom(['a'], [bound('a', '2026-10', '2026-11')], AT)).toEqual({
      coveredUntil: month('2026-11'),
      coversNextMonth: false,
    });
  });

  it('stops at a gap, and covers nothing when the current month is missing', () => {
    expect(coverageFrom(['a'], [bound('a', '2026-10', '2026-11'), bound('a', '2026-12', '2027-01')], AT)).toEqual({
      coveredUntil: month('2026-11'),
      coversNextMonth: false,
    });
    expect(coverageFrom(['a', 'b'], [bound('a', '2026-10', '2026-11'), bound('b', '2026-11', '2026-12')], AT)).toEqual({
      coveredUntil: null,
      coversNextMonth: false,
    });
  });
});
