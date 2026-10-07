import type { ApiClient, RouteTable } from '@apparel-os/schemas';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { countingRequests, lastRequestAt, noteRequest, startIdleLock } from './idle-lock';

// S1-F01-T30: the screen shows its lock when the idle limit passes, on a timer and without polling (access-and-approvals
// 3.3; PRD-ACS-017; RR-301). The limit is a SYNTHETIC 15 seconds, as in the browser journeys; no value is a KDPS value.

const SECOND = 1000;
const LIMIT = 15;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-07T09:00:00Z'));
  noteRequest(0);
});
afterEach(() => {
  vi.useRealTimers();
});

function start(onIdle: () => void) {
  return startIdleLock({ idleLockSeconds: LIMIT, onIdle });
}

describe('the screen timer of the idle lock', () => {
  it('locks once the idle limit has passed with no request, and not before', () => {
    const onIdle = vi.fn();
    start(onIdle);
    vi.advanceTimersByTime((LIMIT - 1) * SECOND);
    expect(onIdle).not.toHaveBeenCalled();
    vi.advanceTimersByTime(SECOND);
    expect(onIdle).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(10 * LIMIT * SECOND);
    expect(onIdle).toHaveBeenCalledTimes(1);
  });

  it('counts the person as active while requests keep coming: the limit runs from the last one, as the server counts it', () => {
    const onIdle = vi.fn();
    start(onIdle);
    vi.advanceTimersByTime(10 * SECOND);
    noteRequest();
    vi.advanceTimersByTime(10 * SECOND);
    noteRequest();
    vi.advanceTimersByTime(14 * SECOND);
    expect(onIdle).not.toHaveBeenCalled();
    vi.advanceTimersByTime(SECOND);
    expect(onIdle).toHaveBeenCalledTimes(1);
  });

  it('keeps one timer and never polls', () => {
    start(vi.fn());
    expect(vi.getTimerCount()).toBe(1);
    vi.advanceTimersByTime(5 * SECOND);
    noteRequest();
    vi.advanceTimersByTime(5 * SECOND);
    expect(vi.getTimerCount()).toBe(1);
  });

  it('locks at once when a check finds the limit passed while the page slept', () => {
    const onIdle = vi.fn();
    const lock = start(onIdle);
    // A suspended tab: the clock moves on, the timer does not fire.
    vi.setSystemTime(Date.now() + 2 * LIMIT * SECOND);
    lock.check();
    expect(onIdle).toHaveBeenCalledTimes(1);
  });

  it('does not lock on a check made before the limit', () => {
    const onIdle = vi.fn();
    const lock = start(onIdle);
    vi.advanceTimersByTime(5 * SECOND);
    lock.check();
    expect(onIdle).not.toHaveBeenCalled();
    vi.advanceTimersByTime(10 * SECOND);
    expect(onIdle).toHaveBeenCalledTimes(1);
  });

  it('stops without locking, for a session that was signed out or locked by the server meanwhile', () => {
    const onIdle = vi.fn();
    const lock = start(onIdle);
    lock.stop();
    vi.advanceTimersByTime(10 * LIMIT * SECOND);
    expect(onIdle).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('counts the start as activity, so a request long before it does not lock at once', () => {
    noteRequest(Date.now() - 60 * SECOND);
    const onIdle = vi.fn();
    start(onIdle);
    vi.advanceTimersByTime((LIMIT - 1) * SECOND);
    expect(onIdle).not.toHaveBeenCalled();
  });
});

describe('what counts as a request of the session', () => {
  const table = {
    health: { access: { kind: 'public' } },
    session: { access: { kind: 'own' } },
    users: { access: { kind: 'action', action: 'view', recordType: 'access.user' } },
  } as unknown as RouteTable;
  const client = { call: vi.fn(() => Promise.resolve({ ok: true })) } as unknown as ApiClient<RouteTable>;

  it('notes every call of a route that needs a session, when it is sent, and no call of a public route', async () => {
    const counted = countingRequests(client, table);
    noteRequest(0);
    await counted.call('health', {});
    expect(lastRequestAt()).toBe(0);
    vi.advanceTimersByTime(3 * SECOND);
    await counted.call('session', {});
    expect(lastRequestAt()).toBe(Date.now());
    vi.advanceTimersByTime(3 * SECOND);
    await counted.call('users', {});
    expect(lastRequestAt()).toBe(Date.now());
  });
});
