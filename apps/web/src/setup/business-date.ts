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

/** The Organisation's today, for a date field's opening value and its earliest day. */
export function useBusinessToday(): string {
  return businessToday(useTimeZone());
}
