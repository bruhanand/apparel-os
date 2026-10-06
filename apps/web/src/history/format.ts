import { t, type MessageId } from '../messages/catalogue';

/**
 * A time as design-language 8 writes it: DD MMM YYYY, HH:mm on the 24-hour clock. It is shown in the device's time
 * zone unless one is given; whether screens should show the Organisation's time zone instead is RR-310.
 */
export function formatDateTime(iso: string, timeZone?: string): string {
  const parts = new Intl.DateTimeFormat('en-IN', {
    year: 'numeric',
    month: 'numeric',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    ...(timeZone === undefined ? {} : { timeZone }),
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
