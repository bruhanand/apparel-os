import { describe, expect, it } from 'vitest';
import { lockTable, planLockRuns, queuedLockKey, type LockTarget } from './lock-helper.js';

// S1-F01-T03: the order the lock helper takes one step's rows in (code-house-rules 8.2; PRD-INT-003). The tables and
// identifiers are synthetic; the integration test proves the order on PostgreSQL.

const document = lockTable('access', 'approval_request');
const version = lockTable('access', 'role_assignment_version');

const ID_1 = '01900000-0000-7000-8000-000000000001';
const ID_2 = '01900000-0000-7000-8000-000000000002';
const ID_3 = '01900000-0000-7000-8000-000000000003';
const ID_4 = '01900000-0000-7000-8000-0000000000aa';

const target = (table: typeof document, id: string, mode: LockTarget['mode'] = 'exclusive'): LockTarget => ({
  table,
  id,
  mode,
});

describe('planLockRuns (code-house-rules 8.2)', () => {
  it('PRD-INT-003 orders every row of the step by ascending identifier, whatever order it was given in', () => {
    const runs = planLockRuns([target(document, ID_3), target(document, ID_1), target(document, ID_2)]);
    expect(runs).toEqual([{ table: document, mode: 'exclusive', ids: [ID_1, ID_2, ID_3] }]);
  });

  it('PRD-INT-003 orders across tables, and makes one statement of each run of one table in one mode', () => {
    const runs = planLockRuns([
      target(version, ID_4),
      target(document, ID_3),
      target(version, ID_2),
      target(document, ID_1),
    ]);
    expect(runs).toEqual([
      { table: document, mode: 'exclusive', ids: [ID_1] },
      { table: version, mode: 'exclusive', ids: [ID_2] },
      { table: document, mode: 'exclusive', ids: [ID_3] },
      { table: version, mode: 'exclusive', ids: [ID_4] },
    ]);
  });

  it('splits a run where the mode changes, so each statement takes one lock strength', () => {
    const runs = planLockRuns([
      target(document, ID_1, 'shared'),
      target(document, ID_2, 'exclusive'),
      target(document, ID_3, 'shared'),
    ]);
    expect(runs.map((run) => [run.mode, run.ids])).toEqual([
      ['shared', [ID_1]],
      ['exclusive', [ID_2]],
      ['shared', [ID_3]],
    ]);
  });

  it('locks a row named twice once, and exclusively when it is named in both modes', () => {
    const runs = planLockRuns([
      target(document, ID_1, 'shared'),
      target(document, ID_1, 'exclusive'),
      target(document, ID_1, 'shared'),
      target(document, ID_2, 'shared'),
      target(document, ID_2, 'shared'),
    ]);
    expect(runs).toEqual([
      { table: document, mode: 'exclusive', ids: [ID_1] },
      { table: document, mode: 'shared', ids: [ID_2] },
    ]);
  });

  it('compares identifiers in their lower-case form, which is PostgreSQL uuid order', () => {
    const upper = ID_4.toUpperCase();
    const runs = planLockRuns([target(document, upper), target(document, ID_3)]);
    expect(runs).toEqual([{ table: document, mode: 'exclusive', ids: [ID_3, ID_4] }]);
  });

  it('plans nothing for no targets', () => {
    expect(planLockRuns([])).toEqual([]);
  });

  it.each([
    ['an identifier that is not a UUID', () => planLockRuns([target(document, 'not-a-uuid')])],
    ['a quoted schema', () => lockTable('access"; drop table x; --', 'approval_request')],
    ['an upper-case table', () => lockTable('access', 'Approval')],
    ['an empty table', () => lockTable('access', '')],
    [
      'a mode that is neither',
      () => planLockRuns([{ table: document, id: ID_1, mode: 'update' as unknown as LockTarget['mode'] }]),
    ],
  ])('refuses %s', (_, plan) => {
    expect(plan).toThrow();
  });
});

describe('queued lock tables (code-house-rules 8.2; stock-ledger 14.3)', () => {
  const anchor = lockTable('stock', 'unit_anchor', { queued: true });

  it('PRD-INT-003 keeps a table queued through the plan, in the same order as any other', () => {
    const runs = planLockRuns([target(anchor, ID_2, 'shared'), target(document, ID_1)]);
    expect(runs).toEqual([
      { table: document, mode: 'exclusive', ids: [ID_1] },
      { table: { schema: 'stock', table: 'unit_anchor', queued: true }, mode: 'shared', ids: [ID_2] },
    ]);
  });

  it('keys each queued row by the last 64 bits of its identifier, as a signed bigint', () => {
    expect(queuedLockKey(ID_1)).toBe('-9223372036854775807');
    expect(queuedLockKey('01900000-0000-7000-0000-0000000000aa')).toBe('170');
    expect(queuedLockKey('01900000-0000-7000-7FFF-FFFFFFFFFFFF')).toBe('9223372036854775807');
  });
});
