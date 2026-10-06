/**
 * The kernel's clock (code-house-rules 9). Code reads the time only through it, never `new Date()` or `Date.now()` in
 * a command or in `domain/`, so that tests can set it. The server runs in UTC; a business date is never taken from
 * the server's or the database's time zone, only from the Organisation's timezone (business-date.ts; PRD-MOD-009).
 */
export interface Clock {
  /** The current instant. */
  now(): Date;
}

/** The server's own clock. The one place that reads the system time. */
export const systemClock: Clock = {
  now: () => new Date(),
};
