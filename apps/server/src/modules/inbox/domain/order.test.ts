import { describe, expect, it } from 'vitest';
import { compareWork, type Orderable } from './order.js';

// S1-F01-T13: the order of My work (access-and-approvals 11.2, 15 test 20; PRD-ACS-009, PRD-MOD-015). Synthetic items.

function item(id: string, due: string | null, exposure: Orderable['exposure'], arrived = 0): Orderable {
  return { id, dueAt: due === null ? null : new Date(due), exposure, recordedAt: new Date(arrived) };
}

const sorted = (items: Orderable[]) => [...items].sort(compareWork).map((each) => each.id);

describe('My work order (PRD-ACS-009, PRD-MOD-015)', () => {
  it('orders by due time, earliest first, then exposure, largest first', () => {
    expect(
      sorted([
        item('late-big', '2026-10-08T10:00:00Z', { kind: 'known', amount: 900_00 }),
        item('early-small', '2026-10-07T10:00:00Z', { kind: 'known', amount: 1_00 }),
        item('early-big', '2026-10-07T10:00:00Z', { kind: 'known', amount: 500_00 }),
      ]),
    ).toEqual(['early-big', 'early-small', 'late-big']);
  });

  it('puts an Unknown exposure above every known amount at the same due time, never as zero', () => {
    expect(
      sorted([
        item('zero', '2026-10-07T10:00:00Z', { kind: 'known', amount: 0 }),
        item('big', '2026-10-07T10:00:00Z', { kind: 'known', amount: 1_000_000_00 }),
        item('unknown', '2026-10-07T10:00:00Z', { kind: 'unknown' }),
      ]),
    ).toEqual(['unknown', 'big', 'zero']);
  });

  it('puts an item with no due time after every item with one, and no value after any exposure', () => {
    expect(
      sorted([
        item('none-none', null, { kind: 'none' }),
        item('none-unknown', null, { kind: 'unknown' }),
        item('due-none', '2026-10-09T10:00:00Z', { kind: 'none' }),
        item('none-known', null, { kind: 'known', amount: 1 }),
      ]),
    ).toEqual(['due-none', 'none-unknown', 'none-known', 'none-none']);
  });

  it('keeps the order of arrival for ties', () => {
    expect(sorted([item('second', null, { kind: 'none' }, 2), item('first', null, { kind: 'none' }, 1)])).toEqual([
      'first',
      'second',
    ]);
  });
});
