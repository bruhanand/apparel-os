import type { ApiClient, RouteTable } from '@apparel-os/schemas';

// The screen's own lock timer (access-and-approvals 3.3; PRD-ACS-017; S1-F01-T30; RR-301). The server locks a session at
// the first request after the idle limit, counting every authenticated request as activity and nothing else. So the
// screen counts the same: the limit runs from the last request the page sent to a route that needs a session, not from
// pointer or key activity, which the server never sees. When the limit passes the screen shows its lock without waiting
// for a request, so an unattended screen does not stay readable; the server stays the real check and locks, if it has
// not already, at the next request (the unlock then reaches it, `whileLocked`). One timer, re-armed for what is left;
// nothing polls, since a request of its own would keep the session from ever locking.

let lastRequest = 0;

/** Notes a request of the session, at the instant it is sent: the server's last activity is the request's start. */
export function noteRequest(at: number = Date.now()): void {
  lastRequest = at;
}

/** The instant of the last request noted, in milliseconds; 0 before any. */
export function lastRequestAt(): number {
  return lastRequest;
}

/**
 * The client with each call to a route that needs a session noted as a request of the session, as the server notes
 * it in Authenticate. A public route (sign-in, the health check) is not one.
 */
export function countingRequests<T extends RouteTable>(client: ApiClient<T>, table: T): ApiClient<T> {
  return {
    call(name, input) {
      if (table[name]?.access.kind !== 'public') noteRequest();
      return client.call(name, input);
    },
  };
}

export interface IdleLockOptions {
  /** The idle-lock limit in force, from the session read (a setting of `access`, never a secret). */
  readonly idleLockSeconds: number;
  /** Called once, when the limit has passed with no request. */
  readonly onIdle: () => void;
}

export interface IdleLock {
  /** Locks at once if the limit has passed, for a page that was suspended or throttled in the background. */
  check(): void;
  stop(): void;
}

/** Starts the timer; the start counts as activity (the session read, the sign-in or the unlock that led here). */
export function startIdleLock({ idleLockSeconds, onIdle }: IdleLockOptions): IdleLock {
  const limit = idleLockSeconds * 1000;
  const startedAt = Date.now();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;
  const idleSince = () => Math.max(lastRequest, startedAt);
  const arm = () => {
    timer = setTimeout(fire, Math.max(0, idleSince() + limit - Date.now()));
  };
  const fire = () => {
    timer = undefined;
    if (stopped) return;
    if (Date.now() >= idleSince() + limit) {
      stopped = true;
      onIdle();
      return;
    }
    arm();
  };
  arm();
  return {
    check() {
      if (stopped) return;
      clearTimeout(timer);
      fire();
    },
    stop() {
      stopped = true;
      clearTimeout(timer);
      timer = undefined;
    },
  };
}
