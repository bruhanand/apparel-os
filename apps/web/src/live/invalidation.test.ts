import { describe, expect, it } from 'vitest';
import { followStream, keyIsStale, parseMessage, staleReads, type Stale } from './invalidation';

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
    // A record named elsewhere than the read's path, as in a query, is not the read's record.
    expect(keyIsStale(stale, ['readException', { params: { exceptionId: OTHER }, query: { note: EXCEPTION } }])).toBe(
      false,
    );
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

describe('the browser’s stream (code-house-rules 12.12; deployment.md section 5)', () => {
  /** A SYNTHETIC EventSource: the test opens it and sends its messages. */
  function fakeSource() {
    const listeners = new Map<string, ((event: MessageEvent<string>) => void)[]>();
    return {
      readyState: 1,
      addEventListener(type: string, listener: (event: MessageEvent<string>) => void) {
        listeners.set(type, [...(listeners.get(type) ?? []), listener]);
      },
      emit(type: string, data: string) {
        for (const listener of listeners.get(type) ?? []) listener({ data } as MessageEvent<string>);
      },
    };
  }

  it('deployment.md 5 every open, the first and each reconnect, reads everything on screen again', () => {
    const source = fakeSource();
    const stale: Stale[] = [];
    followStream(source, (each) => stale.push(each));
    source.emit('open', '');
    source.emit('open', '');
    expect(stale).toEqual([{ kind: 'everything' }, { kind: 'everything' }]);
  });

  it('a message makes its record’s reads stale', () => {
    const source = fakeSource();
    const stale: Stale[] = [];
    followStream(source, (each) => stale.push(each));
    source.emit(
      'exceptions.raised',
      JSON.stringify({
        kind: 'event',
        type: 'exceptions.raised',
        subject: { module: 'exceptions', recordType: 'exceptions.exception', recordId: EXCEPTION },
      }),
    );
    expect(stale).toHaveLength(1);
    expect(keyIsStale(stale[0] ?? { kind: 'reads', reads: [] }, ['listMyWork', {}])).toBe(true);
  });
});
