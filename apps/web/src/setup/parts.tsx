import type { PermissionAction } from '@apparel-os/schemas';
import type { UseQueryResult } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import type { SubmissionState } from '../api/command';
import { failureBody } from '../api/query';
import { Banner } from '../components/Banner';
import { Button } from '../components/Button';
import { ErrorState, LoadingState } from '../components/StandardStates';
import { UnavailableState } from '../components/UnavailableState';
import { ActorHistory, RecordHistory } from '../history/HistoryReads';
import { t, type MessageId } from '../messages/catalogue';
import { useSession } from '../shell/session';
import { RefusalBanner } from '../sign-in/RefusalBanner';
import { recordTypeName } from './describe';

// Parts the access setup screens share (design-language 10.1, 10.9, 10.12, 10.13, 10.15; PRD-UXP-003).

/** Whether one of the person's role assignments grants an action on a record type (access-and-approvals 7.2). */
export function useGranted(recordType: string, action: PermissionAction): boolean {
  const { session } = useSession();
  if (session.state === 'signed-out') return false;
  return session.grants.some((grant) => grant.recordType === recordType && grant.action === action);
}

/**
 * An action button that is disabled, with the missing permission named beside it and as its tooltip, when no role
 * assignment grants it (design-language 10.1, 10.18; PRD-UXP-003). The server checks it again.
 */
export function GrantedButton({
  label,
  recordType,
  action,
  variant = 'secondary',
  onClick,
}: {
  label: MessageId;
  recordType: string;
  action: PermissionAction;
  variant?: 'primary' | 'secondary';
  onClick: () => void;
}) {
  const granted = useGranted(recordType, action);
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <Button
        label={label}
        variant={variant}
        disabled={!granted}
        {...(granted ? {} : { reason: 'setup.needs-permission' as const })}
        onClick={onClick}
      />
      {!granted && (
        <span className="text-caption text-text-2">
          {t('setup.needs', { action: t(`action.${action}`), recordType: recordTypeName(recordType) })}
        </span>
      )}
    </span>
  );
}

/** The standard states of a list read (design-language 10.13): loading, unavailable naming what is missing, error. */
export function ListRead<T>({
  query,
  what,
  children,
}: {
  query: UseQueryResult<T>;
  what: MessageId;
  children: (data: T) => ReactNode;
}) {
  if (query.isPending) return <LoadingState rows={4} />;
  if (query.isError) {
    const body = failureBody(query.error);
    if (body?.kind === 'not-authorised' || body?.kind === 'unavailable') {
      return <UnavailableState missing={body.missing ?? []} />;
    }
    return (
      <ErrorState
        what={what}
        error={body}
        onRetry={() => {
          void query.refetch();
        }}
      />
    );
  }
  return <>{children(query.data)}</>;
}

/** What a preparation answered: sent for approval, or the refusal with what is missing (PRD-UXP-003). */
export function SubmissionBanner({ state }: { state: SubmissionState }) {
  if (state.kind === 'done') return <Banner tone="success" role="status" message="setup.sent-for-approval" />;
  if (state.kind === 'refused') return <RefusalBanner refusal={state.refusal} />;
  return null;
}

/** A table's header cell (design-language 10.9). */
export function Th({ label }: { label: MessageId }) {
  return (
    <th scope="col" className="h-10 bg-sunken px-3 text-left text-body-sm font-semibold text-text-2">
      {t(label)}
    </th>
  );
}

/** The History tab of a record's drawer (RR-312), with what a person changed beside it for a user. */
export function HistoryTab({
  recordType,
  recordId,
  actorId,
}: {
  recordType: string;
  recordId: string;
  actorId?: string;
}) {
  return (
    <div className="flex flex-col gap-4">
      <section className="flex flex-col gap-2">
        <h3 className="text-h3 font-semibold">{t('setup.history.record')}</h3>
        <RecordHistory recordType={recordType} recordId={recordId} />
      </section>
      {actorId !== undefined && (
        <section className="flex flex-col gap-2">
          <h3 className="text-h3 font-semibold">{t('setup.history.actor')}</h3>
          <ActorHistory actorId={actorId} />
        </section>
      )}
    </div>
  );
}

/** A heading with the list's actions, above a table (design-language 10.9 toolbar). */
export function Toolbar({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-center gap-3">{children}</div>;
}

/** A solid card in a drawer (design-language 10.15). */
export function Card({ title, children }: { title?: MessageId; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3 rounded-card border border-border bg-surface p-4">
      {title !== undefined && <h3 className="text-h3 font-semibold">{t(title)}</h3>}
      {children}
    </section>
  );
}

/** The input classes of design-language 10.7. */
export const inputClass = 'h-9 rounded-control border border-control bg-surface px-2';
