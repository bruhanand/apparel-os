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

function operationText(operation: string): string {
  const id = `history.operation.${operation}`;
  return isMessageId(id) ? t(id) : operation;
}

function fieldClassText(fieldClass: string): string {
  const id = `field-class.${fieldClass}`;
  return isMessageId(id) ? t(id) : fieldClass;
}

/**
 * What else an access record names (numbering-and-audit 5.1, 5.2; visual review finding 8): for a permission change,
 * the record type and operation its audit record changed, or where to read it when the reader may not; for a
 * sensitive access, the record, field class and how it was exposed; for a sign-in, session or credential event, the
 * device (none registered, for the back office) and any identity verification of a recovery.
 */
function detailOf(entry: AccessHistoryEntry): string {
  if (entry.kind === 'permission-changed') {
    return entry.change === null
      ? t('history.detail.change-not-shown')
      : `${recordTypeText(entry.change.recordType)} · ${operationText(entry.change.operation)}`;
  }
  const parts: string[] = [];
  if (entry.record !== null) parts.push(recordTypeText(entry.record.recordType));
  if (entry.fieldClass !== null) parts.push(fieldClassText(entry.fieldClass));
  if (entry.exposure !== null) parts.push(t(`history.exposure.${entry.exposure}`));
  if (entry.record === null)
    parts.push(t(entry.deviceId === null ? 'history.detail.no-device' : 'history.detail.device'));
  if (entry.identityVerification !== null) parts.push(entry.identityVerification);
  return parts.join(' · ');
}

/** Whose access the record is about: the user, or why none is named (PRD-SEC-014). */
function userText(entry: AccessHistoryEntry): string {
  if (entry.user !== null) return actorName(entry.user);
  return t(entry.kind === 'permission-changed' ? 'history.not-one-user' : 'history.no-user');
}

/**
 * The access history report as a data table (numbering-and-audit 5.2; design-language 10.9), newest first: when, the
 * kind of event, its outcome, the user (none for a failed sign-in whose login matched no user, PRD-SEC-014; none for
 * a permission change to a role, setting or service identity), the network address and the detail.
 */
export function AccessRecordTable({ entries, timeZone }: { entries: readonly AccessHistoryEntry[]; timeZone: string }) {
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
              <td className="px-3">{userText(entry)}</td>
              <td className="px-3 font-mono">{entry.networkAddress ?? ''}</td>
              <td className="px-3">{detailOf(entry)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
