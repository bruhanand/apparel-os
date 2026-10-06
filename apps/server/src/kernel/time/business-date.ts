/**
 * The business date of an instant under a timezone (code-house-rules 9; PRD-MOD-009), as `YYYY-MM-DD`. Worked out
 * with the built-in Intl API; no date library is added (code-house-rules 9, 10.6).
 *
 * The timezone is the Organisation's, an Organisation setting in `configuration` with no default
 * (domain-model 3.6). This function never supplies one: it refuses a timezone Intl does not know.
 */
export function businessDateIn(instant: Date, timezone: string): string {
  if (Number.isNaN(instant.getTime())) throw new RangeError('The instant is not a valid time');
  const parts = formatterFor(timezone).formatToParts(instant);
  const part = (type: 'year' | 'month' | 'day'): string => {
    const value = parts.find((candidate) => candidate.type === type)?.value;
    if (value === undefined) throw new Error(`Intl gave no ${type} for the business date`);
    return value;
  };
  return `${part('year')}-${part('month')}-${part('day')}`;
}

/** Whether Intl knows the timezone, so that a business date can be worked out under it. */
export function isKnownTimezone(timezone: string): boolean {
  try {
    formatterFor(timezone);
    return true;
  } catch {
    return false;
  }
}

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timezone: string): Intl.DateTimeFormat {
  if (timezone === '') throw new RangeError('A timezone is required; there is no default');
  let formatter = formatters.get(timezone);
  if (formatter === undefined) {
    // en-CA with numeric parts gives the four-digit year, two-digit month and day of the ISO calendar. The
    // Gregorian calendar and Latin digits are named, so no locale default can change them.
    formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      calendar: 'gregory',
      numberingSystem: 'latn',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    formatters.set(timezone, formatter);
  }
  return formatter;
}
