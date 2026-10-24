import { useTimeZone } from '../shell/session';

// A date field's today (RR-381): the Organisation's business date under its configured time zone, whatever the
// device's (PRD-MOD-017, DEC-118; design-language 8). The server still checks every date it is sent (GC2-7).

/** The business date of an instant under a time zone, as YYYY-MM-DD. */
export function businessToday(timeZone: string, now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone })
    .formatToParts(now)
    .reduce<Record<string, string>>((all, part) => ({ ...all, [part.type]: part.value }), {});
  return `${parts.year ?? ''}-${parts.month ?? ''}-${parts.day ?? ''}`;
}

/** The business date after the one given, as YYYY-MM-DD. */
export function businessDayAfter(date: string): string {
  const next = new Date(`${date}T00:00:00.000Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return next.toISOString().slice(0, 10);
}

/** A `datetime-local` field's value: a date and a time to the minute, seconds optional, with no time zone. */
export const LOCAL_DATE_TIME = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/;

/** The wall clock an instant shows in a time zone, read as if it were UTC, in milliseconds. */
function wallClock(at: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
    timeZone,
  })
    .formatToParts(new Date(at))
    .reduce<Record<string, string>>((all, part) => ({ ...all, [part.type]: part.value }), {});
  const part = (name: string) => Number(parts[name] ?? Number.NaN);
  return Date.UTC(part('year'), part('month') - 1, part('day'), part('hour'), part('minute'), part('second'));
}

/**
 * The instant a `datetime-local` value stands for when it is the Organisation's wall clock, whatever the device's
 * (code-house-rules 9; PRD-MOD-017, DEC-118), as an ISO 8601 timestamp in UTC. Worked out with `Intl`: the zone's
 * offset at the wall clock read as UTC, then again at the instant that gives, so a day the zone changes its offset
 * keeps the offset in force then.
 */
export function instantOfLocal(local: string, timeZone: string): string {
  const match = LOCAL_DATE_TIME.exec(local);
  if (match === null) throw new Error('Not a datetime-local value');
  const [, year, month, day, hour, minute, second] = match;
  const wanted = Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second ?? '0'),
  );
  const first = wanted - (wallClock(wanted, timeZone) - wanted);
  return new Date(wanted - (wallClock(first, timeZone) - first)).toISOString();
}

/** The Organisation's today, for a date field's opening value and its earliest day. */
export function useBusinessToday(): string {
  return businessToday(useTimeZone());
}
