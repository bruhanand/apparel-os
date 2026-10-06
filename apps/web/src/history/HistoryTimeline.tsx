import type { AuditHistoryEntry, HistoryActor, HistoryChange } from '@apparel-os/schemas';
import { isMessageId, t } from '../messages/catalogue';
import { formatDateTime } from './format';

/** A person or service identity by name; one no longer found is Unknown (design-language 8). */
export function actorName(actor: HistoryActor): string {
  return actor.name ?? t('history.unknown-actor');
}

/** An operation in words, or its code where the catalogue has none yet. */
function operationText(operation: string): string {
  const id = `history.operation.${operation}`;
  return isMessageId(id) ? t(id) : operation;
}

function sourceText(kind: string): string {
  const id = `history.source.${kind}`;
  return isMessageId(id) ? t(id) : kind;
}

/** A recorded value as text: empty for none, a string as it is, anything else as JSON. */
function valueText(value: unknown): string {
  if (value === null || value === undefined) return t('history.empty-value');
  return typeof value === 'string' ? value : JSON.stringify(value);
}

/**
 * One changed field (numbering-and-audit 4.3; design-language 10.6). A masked value arrives without its values and
 * shows the Restricted chip; an encrypted field and a secret show only that they changed.
 */
function Change({ change }: { change: HistoryChange }) {
  let detail: React.ReactNode;
  if (change.kind === 'value' || change.kind === 'restricted') {
    detail = t('history.changed-from-to', { before: valueText(change.before), after: valueText(change.after) });
  } else if (change.kind === 'masked') {
    detail = (
      <span
        title={t('history.restricted.help')}
        aria-label={`${change.field}: ${t('history.restricted')}`}
        className="inline-flex h-6 items-center gap-1 rounded-chip bg-sunken px-2 text-caption font-semibold text-text-2"
      >
        <span aria-hidden="true">🔒</span>
        {t('history.restricted')}
      </span>
    );
  } else if (change.kind === 'encrypted') {
    detail = t('history.encrypted');
  } else {
    detail = t('history.secret');
  }
  return (
    <li className="flex flex-wrap items-center gap-2 text-body-sm">
      <span className="font-mono text-text-2">{change.field}</span>
      <span>{detail}</span>
    </li>
  );
}

/**
 * The history of a record or of an actor as a timeline, oldest first (numbering-and-audit 4.1, 4.5; PRD-ACS-013):
 * when, who (and for whom, for a job), what, the reason, the version, the changed fields and the source.
 */
export function HistoryTimeline({ entries, timeZone }: { entries: readonly AuditHistoryEntry[]; timeZone?: string }) {
  return (
    <ol className="flex flex-col gap-3">
      {entries.map((entry) => (
        <li key={entry.id} className="flex flex-col gap-2 rounded-card border border-border bg-surface p-4">
          <div className="flex flex-wrap items-baseline gap-2">
            <time dateTime={entry.occurredAt} className="text-body-sm tabular-nums text-text-2">
              {formatDateTime(entry.occurredAt, timeZone)}
            </time>
            <span className="font-semibold">{actorName(entry.actor)}</span>
            {entry.onBehalfOf !== null && (
              <span className="text-text-2">{t('history.on-behalf-of', { name: actorName(entry.onBehalfOf) })}</span>
            )}
            <span>{operationText(entry.operation)}</span>
          </div>
          <dl className="grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1 text-body-sm">
            {entry.reason !== null && (
              <>
                <dt className="text-text-2">{t('history.reason')}</dt>
                <dd>{entry.reason}</dd>
              </>
            )}
            {entry.versionId !== null && (
              <>
                <dt className="text-text-2">{t('history.version')}</dt>
                <dd className="font-mono">{entry.versionId}</dd>
              </>
            )}
            <dt className="text-text-2">{t('history.source')}</dt>
            <dd>{sourceText(entry.source.kind)}</dd>
          </dl>
          {entry.changes.length === 0 ? (
            <p className="text-body-sm text-text-3">{t('history.no-changes')}</p>
          ) : (
            <ul aria-label={t('history.changes')} className="flex flex-col gap-1">
              {entry.changes.map((change) => (
                <Change key={change.field} change={change} />
              ))}
            </ul>
          )}
        </li>
      ))}
    </ol>
  );
}
