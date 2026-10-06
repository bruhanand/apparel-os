import type { ReactNode } from 'react';
import { isMessageId, t, type MessageId } from '../messages/catalogue';

/** The catalogue message of a Zod issue code, as React Hook Form's resolver reports it in an error's `type`. */
export function issueMessage(type: string | undefined): MessageId {
  const id = `issue.${type ?? 'custom'}`;
  return isMessageId(id) ? id : 'issue.custom';
}

/**
 * A form field of design-language 10.7: the label above (with a red * and the word "Required" for screen readers),
 * the control, then help or the error below, which shows on blur and on submit. The error text comes from the issue
 * code, never from the input. The control names `${id}-error` in aria-describedby when it has one.
 */
export function FormField({
  id,
  label,
  required = false,
  error,
  children,
}: {
  id: string;
  label: MessageId;
  required?: boolean;
  error?: { type?: string | number | undefined } | undefined;
  children: ReactNode;
}) {
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
      {error !== undefined && (
        <p id={`${id}-error`} className="text-caption font-semibold text-d-fg">
          ! {t(issueMessage(error.type === undefined ? undefined : String(error.type)))}
        </p>
      )}
    </div>
  );
}
