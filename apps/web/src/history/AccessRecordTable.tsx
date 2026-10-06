import type { AccessHistoryEntry } from '@apparel-os/schemas';
import { isMessageId, t } from '../messages/catalogue';
import { formatDateTime } from './format';
import { actorName } from './HistoryTimeline';

function kindText(kind: string): string {
  const id = `access-kind.${kind}`;
  return isMessageId(id) ? t(id) : kind;
}

function recordTypeText(recordType: string): string {
  const id = `record-type.${recordType}`;
  return isMessageId(id) ? t(id) : recordType;
}

/** What else an access record names: the record and field class of a sensitive access, how it was exposed. */
function detailOf(entry: AccessHistoryEntry): string {
  const parts: string[] = [];
  if (entry.record !== null) parts.push(recordTypeText(entry.record.recordType));
  if (entry.fieldClass !== null) parts.push(entry.fieldClass);
  if (entry.exposure !== null) parts.push(t(`history.exposure.${entry.exposure}`));
  if (entry.identityVerification !== null) parts.push(entry.identityVerification);
  return parts.join(' · ');
}

/**
 * The access history report as a data table (numbering-and-audit 5.2; design-language 10.9), newest first: when, the
 * kind of event, its outcome, the user (none for a failed sign-in whose login matched no user, PRD-SEC-014) and the
 * network address.
 */
export function AccessRecordTable({
  entries,
  timeZone,
}: {
  entries: readonly AccessHistoryEntry[];
  timeZone?: string;
}) {
  return (
    <div className="overflow-x-auto rounded-control border border-border">
      <table className="w-full border-collapse text-body-sm">
        <thead className="bg-sunken text-left text-text-2">
          <tr className="h-10">
            <th scope="col" className="px-3 font-semibold">
              {t('history.column.time')}
            </th>
            <th scope="col" className="px-3 font-semibold">
              {t('history.column.event')}
            </th>
            <th scope="col" className="px-3 font-semibold">
              {t('history.column.outcome')}
            </th>
            <th scope="col" className="px-3 font-semibold">
              {t('history.column.user')}
            </th>
            <th scope="col" className="px-3 font-semibold">
              {t('history.column.address')}
            </th>
            <th scope="col" className="px-3 font-semibold">
              {t('history.column.detail')}
            </th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => (
            <tr key={entry.id} className="h-10 border-t border-border hover:bg-hover">
              <td className="px-3 tabular-nums">
                <time dateTime={entry.occurredAt}>{formatDateTime(entry.occurredAt, timeZone)}</time>
              </td>
              <td className="px-3">{kindText(entry.kind)}</td>
              <td className="px-3">{t(`history.outcome.${entry.outcome}`)}</td>
              <td className="px-3">{entry.user === null ? t('history.no-user') : actorName(entry.user)}</td>
              <td className="px-3 font-mono">{entry.networkAddress ?? ''}</td>
              <td className="px-3">{detailOf(entry)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
