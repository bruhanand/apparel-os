import { paise } from '@apparel-os/domain';
import type { AssignmentScope } from '@apparel-os/schemas';
import { describe, expect, it } from 'vitest';
import type { LimitRow } from './approval-limits.js';
import { grantActionCovers, limitGivesAction, scopeWithin, type GrantAction } from './stand-ins.js';

// Stand-in grants (access-and-approvals 10; PRD-ACS-018, POL-02.20; S1-F05-T02). Every scope, limit and value here is
// SYNTHETIC.

const ALL: AssignmentScope = {
  kind: 'dimensions',
  legalEntity: { kind: 'all' },
  place: { kind: 'all' },
  brand: { kind: 'all' },
};
const site = (id: string) => ({ type: 'site' as const, id });
const atSites = (...ids: string[]): AssignmentScope => ({
  kind: 'dimensions',
  legalEntity: { kind: 'all' },
  place: { kind: 'selected', members: ids.map(site) },
  brand: { kind: 'all' },
});

const limit = (amount: number | null, unlimited = false, coversUnknown = false): LimitRow => ({
  id: 'limit',
  holder: { kind: 'role', roleId: 'role', scope: ALL },
  amount: amount === null ? null : paise(amount),
  unlimited,
  coversUnknown,
});
const action = (amount: number | null, unlimited = false, coversUnknown = false): GrantAction => ({
  actionType: 'test-syn.approve',
  amount: amount === null ? null : paise(amount),
  unlimited,
  coversUnknown,
});

describe('a grant is never wider than its giver (access-and-approvals 10)', () => {
  it('a scope is within all members, and within selected members only by the same members', () => {
    expect(scopeWithin(atSites('a'), ALL)).toBe(true);
    expect(scopeWithin(atSites('a'), atSites('a', 'b'))).toBe(true);
    expect(scopeWithin(atSites('a', 'c'), atSites('a', 'b'))).toBe(false);
    expect(scopeWithin(ALL, atSites('a'))).toBe(false);
  });

  it('PRD-ACS-005 an empty dimension is within nothing, and nothing is within one', () => {
    const empty: AssignmentScope = { ...ALL, brand: { kind: 'empty' } };
    expect(scopeWithin(empty, ALL)).toBe(false);
    expect(scopeWithin(ALL, empty)).toBe(false);
  });

  it('POL-02.09 a limit gives an action up to its own amount, unlimited only from unlimited, Unknown only from Unknown', () => {
    expect(limitGivesAction(limit(1_000), action(1_000))).toBe(true);
    expect(limitGivesAction(limit(1_000), action(1_001))).toBe(false);
    expect(limitGivesAction(limit(null, true), action(9_999_999))).toBe(true);
    expect(limitGivesAction(limit(1_000), action(null, true))).toBe(false);
    expect(limitGivesAction(limit(null, true), action(null, true))).toBe(true);
    expect(limitGivesAction(limit(1_000), action(10, false, true))).toBe(false);
    expect(limitGivesAction(limit(1_000, false, true), action(10, false, true))).toBe(true);
  });
});

describe('a value within a grant action (access-and-approvals 9.3, 10; PRD-ACS-016)', () => {
  it('a known value up to the amount, an Unknown one only under explicit authority over Unknown', () => {
    expect(grantActionCovers(action(500), { kind: 'known', amountPaise: paise(500) })).toBe(true);
    expect(grantActionCovers(action(500), { kind: 'known', amountPaise: paise(501) })).toBe(false);
    expect(grantActionCovers(action(500), { kind: 'unknown' })).toBe(false);
    expect(grantActionCovers(action(null, true), { kind: 'unknown' })).toBe(false);
    expect(grantActionCovers(action(null, false, true), { kind: 'unknown' })).toBe(true);
  });
});
