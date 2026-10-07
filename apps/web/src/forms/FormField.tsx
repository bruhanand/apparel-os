import type { ReactNode } from 'react';
import { isMessageId, t, type MessageId } from '../messages/catalogue';

/**
 * The catalogue message of a Zod issue code, as React Hook Form's resolver reports it in an error's `type`, or of a
 * refusal code a screen checks before the request goes (`access.starts-in-past`, S1-F01-T34), which has the server's
 * own message.
 */
export function issueMessage(type: string | undefined): MessageId {
  const issue = `issue.${type ?? 'custom'}`;
  if (isMessageId(issue)) return issue;
  const refusal = `error.${type ?? ''}`;
  return isMessageId(refusal) ? refusal : 'issue.custom';
}

/**
 * A form field of design-language 10.7: the label above (with a red * and the word "Required" for screen readers),
 * the control, then help or the error below, which shows on blur and on submit. The error text comes from the issue
 * code, never from the input; `message` gives an error a check of the screen found, not the route schema. Help shows
 * until an error replaces it. The control names `${id}-error`, or else `${id}-help`, in aria-describedby
 * (describedBy).
 */
export function FormField({
  id,
  label,
  required = false,
  error,
  message,
  help,
  children,
}: {
  id: string;
  label: MessageId;
  required?: boolean;
  error?: { type?: string | number | undefined } | undefined;
  message?: MessageId | undefined;
  help?: MessageId;
  children: ReactNode;
}) {
  const shown =
    message ??
    (error === undefined ? undefined : issueMessage(error.type === undefined ? undefined : String(error.type)));
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-body-sm font-semibold text-text">
        {t(label)}
        {required && (
          <>
            {' '}
            <span aria-hidden="true" className="text-d-fg">
              *
            </span>{' '}
            <span className="sr-only">{t('form.required')}</span>
          </>
        )}
      </label>
      {children}
      {shown !== undefined ? (
        <p id={`${id}-error`} className="text-caption font-semibold text-d-fg">
          ! {t(shown)}
        </p>
      ) : (
        help !== undefined && (
          <p id={`${id}-help`} className="text-caption text-text-2">
            {t(help)}
          </p>
        )
      )}
    </div>
  );
}

/** The accessibility attributes of a field's control: invalid while it shows an error, described by it or its help. */
export function describedBy(
  id: string,
  { invalid, help }: { invalid: boolean; help: boolean },
): { 'aria-invalid'?: true; 'aria-describedby'?: string } {
  if (invalid) return { 'aria-invalid': true, 'aria-describedby': `${id}-error` };
  return help ? { 'aria-describedby': `${id}-help` } : {};
}
