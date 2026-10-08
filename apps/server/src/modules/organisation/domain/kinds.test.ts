import { describe, expect, it } from 'vitest';
import { kindOfActionType, organisationApprovalRules, versionState } from './kinds.js';

// The state a master version shows (design-language 7; DM-4, DEC-105; code-house-rules 7.3) and the approval rules of
// master changes (access-and-approvals 8; structure-and-masters 2.3; GC2-2, DEC-105).

describe('the state of a master version', () => {
  const today = '2026-10-08';

  it('names each state from the decision and the dates', () => {
    expect(versionState({ decision: 'Awaiting approval', start: today, today })).toBe('Awaiting approval');
    expect(versionState({ decision: 'Awaiting approval', start: today, today, requestState: 'Superseded' })).toBe(
      'Superseded',
    );
    expect(versionState({ decision: 'Rejected', start: today, today })).toBe('Rejected');
    expect(versionState({ decision: 'Approved', start: '2026-10-09', today })).toBe('Scheduled');
    expect(versionState({ decision: 'Approved', start: today, today })).toBe('In force');
    expect(versionState({ decision: 'Approved', start: '2026-10-01', end: '2026-10-09', today })).toBe('In force');
    expect(versionState({ decision: 'Approved', start: '2026-10-01', end: today, today })).toBe('Ended');
  });
});

describe('the approval rules of master changes', () => {
  it('PRD-ACS-006 each is independent, with no value, approved on its own record type', () => {
    for (const rule of organisationApprovalRules) {
      expect(rule).toMatchObject({ module: 'organisation', independent: true, value: 'none', synthetic: false });
      expect(rule.actionType).toBe(`${rule.recordType}.change`);
      expect(kindOfActionType(rule.actionType)).toBe(rule.recordType.slice('organisation.'.length));
    }
  });
});
