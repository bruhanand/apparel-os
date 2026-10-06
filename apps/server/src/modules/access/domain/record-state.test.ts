import { describe, expect, it } from 'vitest';
import { recordState } from './record-state.js';

// S1-F01-T16: the state an access setup screen shows for one version of a user, role, reason or one role assignment
// (docs/plan/stage-1/s1-f01-first-access/spec.md section 6; design-language 7, states 9, 38, 53, 54, 6, 63, 64;
// code-house-rules 7.3; DEC-105, DEC-117). SYNTHETIC dates.

const TODAY = '2026-10-07';

describe('recordState', () => {
  it('a version waiting for its decision is Awaiting approval; its request ended by a newer version is Superseded', () => {
    expect(recordState({ decision: 'Awaiting approval', start: TODAY, today: TODAY })).toBe('Awaiting approval');
    expect(recordState({ decision: 'Awaiting approval', start: TODAY, today: TODAY, requestState: 'Superseded' })).toBe(
      'Superseded',
    );
  });

  it('an approved version is Scheduled before its start, In force on its dates and Ended from its end', () => {
    expect(recordState({ decision: 'Approved', start: '2026-10-08', today: TODAY })).toBe('Scheduled');
    expect(recordState({ decision: 'Approved', start: TODAY, today: TODAY })).toBe('In force');
    expect(recordState({ decision: 'Approved', start: '2026-10-01', end: '2026-10-08', today: TODAY })).toBe(
      'In force',
    );
    expect(recordState({ decision: 'Approved', start: '2026-10-01', end: TODAY, today: TODAY })).toBe('Ended');
  });

  it('a rejected version is Rejected', () => {
    expect(recordState({ decision: 'Rejected', start: TODAY, today: TODAY })).toBe('Rejected');
  });

  it('DEC-117 a withdrawn request, and an approved assignment withdrawn before its start, are Withdrawn', () => {
    expect(recordState({ decision: 'Withdrawn', start: TODAY, today: TODAY })).toBe('Withdrawn');
    expect(recordState({ decision: 'Approved', start: '2026-10-09', today: TODAY, withdrawn: true })).toBe('Withdrawn');
  });
});
