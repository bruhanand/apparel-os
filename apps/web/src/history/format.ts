import { t, type MessageId } from '../messages/catalogue';

/**
 * A time as design-language 8 writes it: DD MMM YYYY, HH:mm on the 24-hour clock, in the Organisation's timezone
 * whatever the device's (PRD-MOD-017; DEC-118; RR-310). The timezone is required: screens take it from the session
 * read (`useTimeZone`), so a time is never shown in the device's timezone by default.
 */
export function formatDateTime(iso: string, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-IN', {
    year: 'numeric',
    month: 'numeric',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone,
  }).formatToParts(new Date(iso));
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((each) => each.type === type)?.value ?? '';
  return t('date.date-time', {
    day: part('day'),
    month: t(`date.month.${part('month')}` as MessageId),
    year: part('year'),
    hour: part('hour'),
    minute: part('minute'),
  });
}
