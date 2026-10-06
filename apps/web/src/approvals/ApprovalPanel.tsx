import { zodResolver } from '@hookform/resolvers/zod';
import { totpCodeSchema, type ApprovalRequestView, type DecisionRequest, type ErrorBody } from '@apparel-os/schemas';
import { useQuery } from '@tanstack/react-query';
import { useEffect, type ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { api } from '../api';
import { useSubmission, type SubmissionState } from '../api/command';
import { failureBody, readQuery } from '../api/query';
import { Banner } from '../components/Banner';
import { Button } from '../components/Button';
import { ErrorState, LoadingState } from '../components/StandardStates';
import { StatusBadge } from '../components/StatusBadge';
import { UnavailableState, missingText } from '../components/UnavailableState';
import { describedBy, FormField } from '../forms/FormField';
import { AsOf } from '../history/AsOf';
import { formatDateTime } from '../history/format';
import { isMessageId, t, type MessageId } from '../messages/catalogue';
import { formatPaise } from '../setup/format';
import { stateIdOf } from '../setup/states';
import { useSession } from '../shell/session';
import { RefusalBanner } from '../sign-in/RefusalBanner';
import { DocumentFacts } from './DocumentFacts';

// The approval panel (design-language 10.14; access-and-approvals 9.3, 9.5, 9.6; spec section 6 "Approval panel"):
// the request bound to one version (PRD-ACS-007), its preparers, its value on its basis (PRD-ACS-015), and the
// decision, given by an authorised person other than the preparers (PRD-ACS-006, POL-02.08) with a reason
// (POL-02.23, DEC-104) and a fresh authenticator code (access-and-approvals 3.3). Whether the reader may decide comes
// from the server, which checks it again at the decision; the panel never decides it.

interface Reason {
  readonly id: string;
  readonly code: string;
  readonly kind: 'approve' | 'reject';
  readonly text: string;
}

/** What the panel shows (spec section 6): the decision form, why it is unavailable, the decision, or the end. */
export type PanelCase = 'decide' | 'unavailable' | 'decided' | 'superseded' | 'closed';

export function panelCase(view: ApprovalRequestView): PanelCase {
  if (view.decision !== undefined) return 'decided';
  if (view.state === 'Superseded') return 'superseded';
  if (view.state !== 'Awaiting approval') return 'closed';
  return view.decidable.kind === 'available' ? 'decide' : 'unavailable';
}

function codeMessage(code: string): MessageId {
  const id = `error.${code}`;
  return isMessageId(id) ? id : 'error.unknown-code';
}

function actionTitle(actionType: string): string {
  const id = `approval.action.${actionType}`;
  return isMessageId(id) ? t(id) : actionType;
}

function nameOf(id: string, names: ReadonlyMap<string, string>): string {
  return names.get(id) ?? id;
}

function valueText(view: ApprovalRequestView): string {
  switch (view.value.kind) {
    case 'none':
      return t('approval.value.none');
    case 'unknown':
      return t('approval.value.unknown', { basis: t(`approval.basis.${view.value.basis}`) });
    case 'known':
      return t('approval.value.known', {
        amount: formatPaise(view.value.amount),
        basis: t(`approval.basis.${view.value.basis}`),
      });
  }
}

const decisionFormSchema = (reason: 'listed' | 'free-text') =>
  z.object({
    outcome: z.enum(['approve', 'reject']),
    reasonId: reason === 'listed' ? z.uuid() : z.string(),
    text: reason === 'free-text' ? z.string().trim().min(1) : z.string(),
    comment: z.string(),
    totpCode: totpCodeSchema,
  });
type DecisionForm = z.input<ReturnType<typeof decisionFormSchema>>;

/**
 * The decision form: outcome, a reason of that outcome's kind or free text, a comment, a fresh code. Only the
 * outcomes the server says are open can be chosen; one with no reason of its kind in force is shown disabled, with
 * what it lacks (POL-02.23; PRD-UXP-003).
 */
function DecisionFields({
  view,
  reasonKind,
  outcomes,
  reasons,
  submission,
  onDecide,
}: {
  view: ApprovalRequestView;
  reasonKind: 'listed' | 'free-text';
  outcomes: readonly ('approve' | 'reject')[];
  reasons: readonly Reason[];
  submission: SubmissionState;
  onDecide: (body: DecisionRequest) => void;
}) {
  const form = useForm<DecisionForm>({
    resolver: zodResolver(decisionFormSchema(reasonKind)),
    mode: 'onBlur',
    defaultValues: { outcome: outcomes[0] ?? 'approve', reasonId: '', text: '', comment: '', totpCode: '' },
  });
  const { session } = useSession();
  // A code is used once; it is cleared after every attempt and when the session locks (PRD-SEC-006; 3.3).
  useEffect(() => {
    if (session.state === 'locked' || submission.kind === 'refused' || submission.kind === 'done') {
      form.setValue('totpCode', '');
    }
  }, [session.state, submission.kind, form]);
  const outcome = form.watch('outcome');
  const errors = form.formState.errors;
  const offered = reasons.filter((reason) => reason.kind === outcome);
  return (
    <form
      noValidate
      className="flex flex-col gap-3 bg-sunken p-4"
      onSubmit={(event) => {
        void form.handleSubmit((values) => {
          onDecide({
            versionId: view.document.versionId,
            outcome: values.outcome,
            reason:
              reasonKind === 'listed'
                ? { kind: 'listed', reasonId: values.reasonId }
                : { kind: 'free-text', text: values.text.trim() },
            ...(values.comment.trim() === '' ? {} : { comment: values.comment.trim() }),
            totpCode: values.totpCode,
          });
        })(event);
      }}
    >
      {submission.kind === 'refused' && <RefusalBanner refusal={submission.refusal} />}
      <fieldset className="flex flex-wrap gap-4">
        <legend className="text-body-sm font-semibold">{t('approval.outcome')}</legend>
        <label className="flex items-center gap-2">
          <input type="radio" value="approve" disabled={!outcomes.includes('approve')} {...form.register('outcome')} />
          {t('approval.outcome.approve')}
        </label>
        <label className="flex items-center gap-2">
          <input type="radio" value="reject" disabled={!outcomes.includes('reject')} {...form.register('outcome')} />
          {t('approval.outcome.reject')}
        </label>
        {(['approve', 'reject'] as const)
          .filter((each) => !outcomes.includes(each))
          .map((each) => (
            <p key={each} className="w-full text-body-sm text-text-2">
              {t(`approval.outcome-unavailable.${each}`)}
            </p>
          ))}
      </fieldset>
      {reasonKind === 'listed' ? (
        <FormField id="decision-reason" label="approval.reason" required error={errors.reasonId}>
          <select
            id="decision-reason"
            className="h-9 rounded-control border border-control bg-surface px-2"
            {...describedBy('decision-reason', { invalid: errors.reasonId !== undefined, help: false })}
            {...form.register('reasonId')}
          >
            <option value="">{t('approval.reason.choose')}</option>
            {offered.map((reason) => (
              <option key={reason.id} value={reason.id}>
                {t('approval.reason.option', { code: reason.code, text: reason.text })}
              </option>
            ))}
          </select>
        </FormField>
      ) : (
        <FormField
          id="decision-text"
          label="approval.reason-text"
          required
          error={errors.text}
          help="approval.reason-text.help"
        >
          <textarea
            id="decision-text"
            rows={3}
            className="rounded-control border border-control bg-surface p-2"
            {...describedBy('decision-text', { invalid: errors.text !== undefined, help: true })}
            {...form.register('text')}
          />
        </FormField>
      )}
      <FormField id="decision-comment" label="approval.comment">
        <textarea
          id="decision-comment"
          rows={2}
          className="rounded-control border border-control bg-surface p-2"
          {...form.register('comment')}
        />
      </FormField>
      <FormField id="decision-code" label="approval.code" required error={errors.totpCode} help="approval.code.help">
        <input
          id="decision-code"
          inputMode="numeric"
          autoComplete="one-time-code"
          className="h-9 w-40 rounded-control border border-control bg-surface px-2 font-mono"
          {...describedBy('decision-code', { invalid: errors.totpCode !== undefined, help: true })}
          {...form.register('totpCode')}
        />
      </FormField>
      <div className="flex justify-end gap-2">
        {outcome === 'approve' ? (
          <Button type="submit" variant="primary" label="approval.approve" disabled={submission.kind === 'pending'} />
        ) : (
          <Button
            type="submit"
            variant="destructive"
            label="approval.reject"
            disabled={submission.kind === 'pending'}
          />
        )}
      </div>
    </form>
  );
}

/** The panel as shown, from the request read; the container reads it and sends the decision. */
export function ApprovalPanelView({
  view,
  names,
  reasons,
  submission,
  onDecide,
  facts,
  timeZone,
}: {
  view: ApprovalRequestView;
  names: ReadonlyMap<string, string>;
  reasons: readonly Reason[];
  submission: SubmissionState;
  onDecide: (body: DecisionRequest) => void;
  facts?: ReactNode;
  timeZone?: string;
}) {
  const shown = panelCase(view);
  return (
    <section
      aria-labelledby="approval-title"
      className="flex flex-col rounded-card border border-border bg-surface shadow-e1"
    >
      <header className="flex flex-col gap-1 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <h2 id="approval-title" className="text-h2 font-semibold">
            {actionTitle(view.actionType)}
          </h2>
          <StatusBadge state={stateIdOf(view.state)} />
          <span className="flex-1" />
          <AsOf asOf={view.asOf} {...(timeZone === undefined ? {} : { timeZone })} />
        </div>
        <p className="text-body-sm text-text-2">
          {t('approval.prepared-by', {
            names: view.preparers.map((id) => nameOf(id, names)).join(', '),
            time: formatDateTime(view.requestedAt, timeZone),
          })}
        </p>
        <p className="text-body-sm text-text-2">
          {t('approval.version')} <span className="font-mono">{view.document.versionId}</span>
        </p>
      </header>
      <div className="flex flex-col gap-3 px-4 pb-4">
        <div className="flex flex-col">
          <span className="text-label font-semibold text-text-2">{t('approval.value')}</span>
          <span className="text-kpi font-semibold tabular-nums">{valueText(view)}</span>
        </div>
        {facts}
        {shown === 'decide' && <Banner tone="success" message="approval.can-decide" />}
        {shown === 'unavailable' && view.decidable.kind === 'unavailable' && (
          <Banner
            tone={view.decidable.code === 'access.self-preparation' ? 'danger' : 'warning'}
            role="status"
            message={codeMessage(view.decidable.code)}
          >
            {view.decidable.missing.length > 0 && (
              <ul className="list-none p-0">
                {view.decidable.missing.map((item, index) => (
                  <li key={index}>{missingText(item)}</li>
                ))}
              </ul>
            )}
          </Banner>
        )}
        {shown === 'superseded' && <Banner tone="info" message="error.access.approval-superseded" />}
        {shown === 'closed' && <Banner tone="info" message="error.access.approval-not-open" />}
        {shown === 'decided' && view.decision !== undefined && (
          <Banner tone={view.decision.outcome === 'Approved' ? 'success' : 'danger'} message="approval.decided">
            <span>
              {t(view.decision.outcome === 'Approved' ? 'approval.approved-by' : 'approval.rejected-by', {
                name: nameOf(view.decision.approverId, names),
                time: formatDateTime(view.decision.decidedAt, timeZone),
              })}
            </span>
            <span>
              {t('approval.decided-reason', {
                reason:
                  view.decision.reason.kind === 'listed'
                    ? t('approval.reason.option', { code: view.decision.reason.code, text: view.decision.reason.text })
                    : view.decision.reason.text,
              })}
            </span>
            {view.decision.comment !== undefined && (
              <span>{t('approval.decided-comment', { comment: view.decision.comment })}</span>
            )}
          </Banner>
        )}
      </div>
      {shown === 'decide' && view.decidable.kind === 'available' && (
        <DecisionFields
          view={view}
          reasonKind={view.decidable.reason}
          outcomes={view.decidable.outcomes}
          reasons={reasons}
          submission={submission}
          onDecide={onDecide}
        />
      )}
    </section>
  );
}

/** Whether the person's role assignments grant view on a record type: a read they lack is not attempted. */
function grants(recordType: string, list: readonly { recordType: string; action: string }[]): boolean {
  return list.some((grant) => grant.recordType === recordType && grant.action === 'view');
}

/**
 * The panel for one request: it reads the request, the reasons in force and the users' names (where the reader's
 * role assignments grant them), and sends the decision. After any answer it reads the request again, so a reload or a
 * second approver shows the current state and nothing is decided twice (spec section 10; PRD-INT-002).
 */
export function ApprovalPanel({ requestId }: { requestId: string }) {
  const { session } = useSession();
  const granted = session.state === 'signed-out' ? [] : session.grants;
  const request = useQuery(readQuery(api, 'readApprovalRequest', { params: { requestId } }));
  const reasons = useQuery({
    ...readQuery(api, 'listApprovalReasons', {}),
    enabled: grants('access.approval_reason', granted),
  });
  const users = useQuery({ ...readQuery(api, 'listUsers', {}), enabled: grants('access.user', granted) });
  const submission = useSubmission('decideApproval', [
    'readApprovalRequest',
    'listMyWork',
    'listUsers',
    'listRoles',
    'listRoleAssignments',
    'listApprovalReasonRecords',
    'listApprovalReasons',
  ]);
  if (request.isPending) return <LoadingState rows={4} />;
  if (request.isError) {
    const body: ErrorBody | null = failureBody(request.error);
    if (body?.kind === 'not-authorised' || body?.kind === 'unavailable') {
      return <UnavailableState missing={body.missing ?? []} />;
    }
    return (
      <ErrorState
        what="approval.what"
        error={body}
        onRetry={() => {
          void request.refetch();
        }}
      />
    );
  }
  const names = new Map(
    (users.data?.users ?? []).map((user) => [user.id, user.versions[0]?.displayName ?? user.login] as const),
  );
  return (
    <ApprovalPanelView
      view={request.data}
      names={names}
      reasons={reasons.data?.reasons ?? []}
      submission={submission.state}
      facts={<DocumentFacts view={request.data} />}
      onDecide={(body) => {
        void submission.submit({ params: { requestId }, body }).then(() => request.refetch());
      }}
    />
  );
}
