import { HARNESS_ORIGIN } from './world';

// The journeys' times on the server's clock, never the browser's or the runner's (code-house-rules 9, 10.1; code
// review 7 of stage 2): the server of the journeys answers its own time on its harness (apps/server/test/browser/
// serve.ts). Every value is SYNTHETIC.

/** The server's time now, as its harness answers it. */
export async function serverNow(): Promise<Date> {
  const response = await fetch(`${HARNESS_ORIGIN}/now`);
  if (!response.ok) throw new Error(`The journeys' server did not answer its time: ${String(response.status)}`);
  return new Date(await response.text());
}

/**
 * An hour before the server's now, as a `datetime-local` field takes it: the Organisation's wall clock, Etc/UTC on the
 * journeys' server, whatever the browser's time zone (code-house-rules 9).
 */
export async function anHourAgo(): Promise<string> {
  const now = await serverNow();
  return new Date(now.getTime() - 3_600_000).toISOString().slice(0, 16);
}
