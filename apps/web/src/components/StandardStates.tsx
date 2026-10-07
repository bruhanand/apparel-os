import type { ErrorBody } from '@apparel-os/schemas';
import { displayReference } from '../api/reference';
import { isMessageId, t, type MessageId } from '../messages/catalogue';
import { Button } from './Button';

/** The text of a refusal code, or a plain statement when the catalogue has none yet (code-house-rules 12.13). */
export function codeText(code: string): string {
  const id = `error.${code}`;
  return t(isMessageId(id) ? id : 'error.unknown-code');
}

/**
 * Empty (design-language 10.13): the neutral mark of design-system 3.7 (a 40 px sunken circle with a border and a bold
 * "0" in --text-3), a title, one line saying why the list is empty, naming the scope,
 * and at most one secondary action, passed as children.
 */
export function EmptyState({
  title,
  body,
  children,
}: {
  title: MessageId;
  body: MessageId;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
      <span
        aria-hidden="true"
        className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-sunken font-bold text-text-3"
      >
        {t('empty-state.mark')}
      </span>
      <h2 className="text-h3 font-semibold">{t(title)}</h2>
      <p className="max-w-prose text-body text-text-2">{t(body)}</p>
      {children}
    </div>
  );
}

/** Loading (design-language 10.13): skeleton rows at the real row height, busy, still under reduced motion. */
export function LoadingState({ rows }: { rows: number }) {
  return (
    <div aria-busy="true" aria-label={t('loading.label')} className="flex flex-col gap-2 p-4">
      {Array.from({ length: rows }, (_, row) => (
        <div key={row} className="skeleton h-10 rounded-control bg-sunken" />
      ))}
    </div>
  );
}

/**
 * Error (design-language 10.13): "Couldn't load …", the cause from the refusal code, the reference in its display
 * form, and Retry. `error` is null when no answer came. The screen keeps the user's filters and selection.
 */
export function ErrorState({
  what,
  error,
  onRetry,
}: {
  what: MessageId;
  error: Pick<ErrorBody, 'kind' | 'code' | 'reference'> | null;
  onRetry: () => void;
}) {
  return (
    <div role="alert" className="flex flex-col items-center gap-2 px-4 py-10 text-center">
      <span
        aria-hidden="true"
        className="flex h-10 w-10 items-center justify-center rounded-full bg-d-bg font-bold text-d-fg"
      >
        ✕
      </span>
      <h2 className="text-h3 font-semibold">{t('error-state.title', { what: t(what) })}</h2>
      <p className="max-w-prose text-body text-text-2">
        {error === null ? t('error-state.no-answer') : codeText(error.code)}
      </p>
      {error !== null && (
        <p className="text-caption text-text-3">
          <span>{t('error-state.reference')}</span>{' '}
          <span className="font-mono" data-reference={error.reference}>
            {displayReference(error.reference)}
          </span>
        </p>
      )}
      <Button label="error-state.retry" variant="primary" onClick={onRetry} />
    </div>
  );
}
