import { t } from '../messages/catalogue';
import { formatDateTime } from './format';

/** The trust chip's "as of" (design-language 10.4): the time the server read the rows (PRD-PRF-004, PRD-MOD-003). */
export function AsOf({ asOf, timeZone }: { asOf: string; timeZone?: string }) {
  return (
    <span className="inline-flex h-6 items-center rounded-full border border-border bg-sunken px-2 text-caption text-text-2">
      {t('history.as-of', { time: formatDateTime(asOf, timeZone) })}
    </span>
  );
}
