import { describe, expect, it } from 'vitest';
import { keyIsStale, parseMessage, staleReads } from './invalidation';

// S1-F08-T04: what a live update makes stale (code-house-rules 12.12; deployment.md section 5). Identifiers are
// SYNTHETIC.

const EXCEPTION = '01900000-0000-7000-8000-00000000e001';
const OTHER = '01900000-0000-7000-8000-00000000e002';

describe('live updates in the browser (code-house-rules 12.12)', () => {
  it('a work item’s change makes My work stale, and nothing else', () => {
    const stale = staleReads({
      kind: 'event',
      type: 'inbox.work-item-changed',
      subject: { module: 'inbox', recordType: 'inbox.work_item', recordId: OTHER },
    });
    expect(keyIsStale(stale, ['listMyWork', {}])).toBe(true);
    expect(keyIsStale(stale, ['listFailedJobs', {}])).toBe(false);
  });

  it('an exception’s change makes its own record stale, not another’s', () => {
    const stale = staleReads({
      kind: 'event',
      type: 'exceptions.assigned',
      subject: { module: 'exceptions', recordType: 'exceptions.exception', recordId: EXCEPTION },
    });
    expect(keyIsStale(stale, ['readException', { params: { exceptionId: EXCEPTION } }])).toBe(true);
    expect(keyIsStale(stale, ['readException', { params: { exceptionId: OTHER } }])).toBe(false);
  });

  it('deployment.md 5 a resync makes every read stale', () => {
    expect(keyIsStale(staleReads({ kind: 'resync' }), ['listUsers', {}])).toBe(true);
  });

  it('PRD-SEC-006 a message the schema refuses is ignored', () => {
    expect(parseMessage('{"kind":"event","type":"x","subject":{"recordId":"1"},"name":"n"}')).toBeNull();
    expect(parseMessage('not json')).toBeNull();
    expect(parseMessage('{"kind":"resync"}')).toEqual({ kind: 'resync' });
  });
});
