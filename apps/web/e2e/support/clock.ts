import { HARNESS_ORIGIN } from './world';

// The journeys' dates and times: the server's clock read in the Organisation's timezone, never the browser's or the
// runner's (code-house-rules 9, 10.1; code reviews 7 and 10 of stage 2). The server of the journeys answers its time
// and the Organisation timezone it reads on its harness (apps/server/test/browser/serve.ts). Every value is SYNTHETIC.

/** The server's time now, as its harness answers it. */
export async function serverNow(): Promise<Date> {
  const response = await fetch(`${HARNESS_ORIGIN}/now`);
  if (!response.ok) throw new Error(`The journeys' server did not answer its time: ${String(response.status)}`);
  return new Date(await response.text());
}

let timezone: Promise<string> | undefined;

/** The Organisation timezone the journeys' server reads for every Organisation, asked of its harness once. */
function organisationTimezone(): Promise<string> {
  timezone ??= fetch(`${HARNESS_ORIGIN}/timezone`).then(async (response) => {
    if (!response.ok) throw new Error(`The journeys' server did not answer its timezone: ${String(response.status)}`);
    return response.text();
  });
  return timezone;
}

/** The Organisation's date and wall-clock time at an instant, read through Intl in its timezone. */
function wallClock(instant: Date, timeZone: string): { readonly date: string; readonly time: string } {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(instant);
  const part = (type: Intl.DateTimeFormatPartTypes): string => {
    const value = parts.find((each) => each.type === type)?.value;
    if (value === undefined) throw new Error(`The date has no ${type}`);
    return value;
  };
  return { date: `${part('year')}-${part('month')}-${part('day')}`, time: `${part('hour')}:${part('minute')}` };
}

/**
 * The business date so many days from the server's today in the Organisation's timezone, as a date field takes it
 * (YYYY-MM-DD). The days are added to the date itself, a calendar step that no timezone changes.
 */
export async function organisationDate(days = 0): Promise<string> {
  const { date } = wallClock(await serverNow(), await organisationTimezone());
  const [year, month, day] = date.split('-').map(Number);
  if (year === undefined || month === undefined || day === undefined) throw new Error(`Not a date: ${date}`);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

/**
 * The Organisation's wall clock so many minutes from the server's now, as a `datetime-local` field takes it
 * (YYYY-MM-DDTHH:mm), whatever the browser's time zone.
 */
export async function organisationTime(minutes: number): Promise<string> {
  const instant = new Date((await serverNow()).getTime() + minutes * 60_000);
  const { date, time } = wallClock(instant, await organisationTimezone());
  return `${date}T${time}`;
}

/** An hour before the server's now, on the Organisation's wall clock. */
export function anHourAgo(): Promise<string> {
  return organisationTime(-60);
}
