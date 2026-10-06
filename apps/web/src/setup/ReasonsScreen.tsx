import { routes, type ReasonRecord } from '@apparel-os/schemas';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../api';
import { useSubmission } from '../api/command';
import { readQuery } from '../api/query';
import { ApprovalPanel } from '../approvals/ApprovalPanel';
import { Button } from '../components/Button';
import { EmptyState } from '../components/StandardStates';
import { StatusBadge } from '../components/StatusBadge';
import { describedBy, FormField } from '../forms/FormField';
import { useKeptDraft } from '../forms/use-kept-draft';
import { useRouteForm } from '../forms/use-route-form';
import { AsOf } from '../history/AsOf';
import { KeptDraftBanner } from '../lock/KeptDraftBanner';
import { t } from '../messages/catalogue';
import { formatDate } from './format';
import { Card, GrantedButton, HistoryTab, inputClass, ListRead, SubmissionBanner, Th, Toolbar } from './parts';
import { RecordDrawer } from './RecordDrawer';
import { stateIdOf } from './states';

// Setup › Reason codes (access-and-approvals 9.5, 14; POL-02.23, DEC-104): every approve and reject reason with each
// version. The list itself is KDPS's (KDPS Owner question 45); on dev every reason is SYNTHETIC. A change to the list
// is approved by a different authorised person, with a reason in their own words (DEC-104). Until approve and reject
// reasons are in force, every other decision is unavailable and says so.

const LIST_READS = ['listApprovalReasonRecords', 'listApprovalReasons', 'listMyWork'] as const;

/** A new reason: its code and kind, which stay fixed, its text and start. */
function NewReasonForm() {
  const form = useRouteForm(routes.prepareApprovalReason, { kind: 'approve' });
  const kept = useKeptDraft(routes.prepareApprovalReason, form, 'setup.new-reason');
  const submission = useSubmission('prepareApprovalReason', LIST_READS);
  const errors = form.formState.errors;
  return (
    <form
      noValidate
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        void form.handleSubmit(async (values) => {
          const done = await submission.submit({ body: values });
          if (done !== undefined) {
            kept.forget();
            form.reset({ kind: values.kind });
          }
        })(event);
      }}
    >
      {kept.offered !== null && <KeptDraftBanner onRestore={kept.restore} onDiscard={kept.discard} />}
      <SubmissionBanner state={submission.state} />
      <FormField id="reason-code" label="reason.code" required error={errors.code}>
        <input
          id="reason-code"
          className={`${inputClass} font-mono`}
          {...describedBy('reason-code', { invalid: errors.code !== undefined, help: false })}
          {...form.register('code')}
        />
      </FormField>
      <FormField id="reason-kind" label="reason.kind" required error={errors.kind}>
        <select
          id="reason-kind"
          className={inputClass}
          {...describedBy('reason-kind', { invalid: errors.kind !== undefined, help: false })}
          {...form.register('kind')}
        >
          <option value="approve">{t('reason.kind.approve')}</option>
          <option value="reject">{t('reason.kind.reject')}</option>
        </select>
      </FormField>
      <FormField id="reason-text" label="reason.text" required error={errors.text}>
        <input
          id="reason-text"
          className={inputClass}
          {...describedBy('reason-text', { invalid: errors.text !== undefined, help: false })}
          {...form.register('text')}
        />
      </FormField>
      <FormField
        id="reason-from"
        label="setup.valid-from"
        required
        error={errors.validFrom}
        help="setup.valid-from-help"
      >
        <input
          id="reason-from"
          type="date"
          className={inputClass}
          {...describedBy('reason-from', { invalid: errors.validFrom !== undefined, help: true })}
          {...form.register('validFrom')}
        />
      </FormField>
      <div className="flex justify-end">
        <Button
          type="submit"
          variant="primary"
          label="setup.request-approval"
          disabled={submission.state.kind === 'pending'}
        />
      </div>
    </form>
  );
}

/** A new version of a reason: its text and start. */
function ReasonVersionForm({ reason }: { reason: ReasonRecord }) {
  const form = useRouteForm(routes.prepareApprovalReasonVersion, { text: reason.versions[0]?.text ?? '' });
  const kept = useKeptDraft(routes.prepareApprovalReasonVersion, form, `setup.reason-version.${reason.id}`);
  const submission = useSubmission('prepareApprovalReasonVersion', LIST_READS);
  const errors = form.formState.errors;
  return (
    <form
      noValidate
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        void form.handleSubmit(async (values) => {
          const done = await submission.submit({ params: { reasonId: reason.id }, body: values });
          if (done !== undefined) kept.forget();
        })(event);
      }}
    >
      {kept.offered !== null && <KeptDraftBanner onRestore={kept.restore} onDiscard={kept.discard} />}
      <SubmissionBanner state={submission.state} />
      <FormField id="reason-version-text" label="reason.text" required error={errors.text}>
        <input
          id="reason-version-text"
          className={inputClass}
          {...describedBy('reason-version-text', { invalid: errors.text !== undefined, help: false })}
          {...form.register('text')}
        />
      </FormField>
      <FormField
        id="reason-version-from"
        label="setup.valid-from"
        required
        error={errors.validFrom}
        help="setup.valid-from-help"
      >
        <input
          id="reason-version-from"
          type="date"
          className={inputClass}
          {...describedBy('reason-version-from', { invalid: errors.validFrom !== undefined, help: true })}
          {...form.register('validFrom')}
        />
      </FormField>
      <div className="flex justify-end">
        <Button
          type="submit"
          variant="primary"
          label="setup.request-approval"
          disabled={submission.state.kind === 'pending'}
        />
      </div>
    </form>
  );
}

function ReasonDrawer({ reason, onClose }: { reason: ReasonRecord; onClose: () => void }) {
  const [changing, setChanging] = useState(false);
  const [panel, setPanel] = useState<string | null>(null);
  const latest = reason.versions[0];
  return (
    <RecordDrawer
      reference={reason.code}
      title={latest?.text ?? reason.code}
      {...(latest === undefined ? {} : { state: latest.state })}
      onClose={onClose}
      history={<HistoryTab recordType="access.approval_reason" recordId={reason.id} />}
      details={
        <>
          <Card title="setup.versions">
            <p className="m-0 text-body-sm text-text-2">{t(`reason.kind.${reason.kind}`)}</p>
            <ol className="m-0 flex list-none flex-col gap-3 p-0">
              {reason.versions.map((version) => (
                <li key={version.id} className="flex flex-col gap-1 border-b border-border pb-3 last:border-b-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{version.text}</span>
                    <StatusBadge state={stateIdOf(version.state)} />
                  </div>
                  <span className="text-body-sm text-text-2">
                    {t('dates.from', { from: formatDate(version.validFrom) })}
                  </span>
                  {version.request?.state === 'Awaiting approval' && (
                    <div>
                      <Button
                        size="small"
                        variant="ghost"
                        label="setup.open-approval"
                        onClick={() => {
                          setPanel(version.request?.id ?? null);
                        }}
                      />
                    </div>
                  )}
                </li>
              ))}
            </ol>
          </Card>
          {panel !== null && <ApprovalPanel requestId={panel} />}
          <Card title="setup.reasons.change">
            {changing ? (
              <ReasonVersionForm reason={reason} />
            ) : (
              <GrantedButton
                label="setup.reasons.change"
                recordType="access.approval_reason"
                action="edit"
                onClick={() => {
                  setChanging(true);
                }}
              />
            )}
          </Card>
        </>
      }
    />
  );
}

/** Setup › Reason codes. */
export function ReasonsScreen() {
  const query = useQuery(readQuery(api, 'listApprovalReasonRecords', {}));
  const [open, setOpen] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-4">
      <Toolbar>
        <GrantedButton
          label="setup.reasons.new"
          recordType="access.approval_reason"
          action="create"
          variant="primary"
          onClick={() => {
            setOpen('new');
          }}
        />
        <span className="flex-1" />
        <Button
          label="setup.refresh"
          onClick={() => {
            void query.refetch();
          }}
        />
      </Toolbar>
      <ListRead query={query} what="setup.reasons.what">
        {(list) => {
          const shown = list.reasons.find((reason) => reason.id === open);
          return (
            <div className="flex flex-col gap-3">
              <div className="flex justify-end">
                <AsOf asOf={list.asOf} />
              </div>
              {list.reasons.length === 0 ? (
                <EmptyState title="setup.reasons.empty.title" body="setup.reasons.empty.body" />
              ) : (
                <div className="overflow-x-auto rounded-card border border-border bg-surface">
                  <table className="w-full border-collapse text-body">
                    <thead>
                      <tr>
                        <Th label="reason.code" />
                        <Th label="reason.kind" />
                        <Th label="reason.text" />
                        <Th label="setup.latest-version" />
                      </tr>
                    </thead>
                    <tbody>
                      {list.reasons.map((reason) => {
                        const latest = reason.versions[0];
                        return (
                          <tr key={reason.id} className="h-10 border-t border-border hover:bg-hover">
                            <td className="px-3">
                              <button
                                type="button"
                                className="font-mono text-accent underline"
                                onClick={() => {
                                  setOpen(reason.id);
                                }}
                              >
                                {reason.code}
                              </button>
                            </td>
                            <td className="px-3">{t(`reason.kind.${reason.kind}`)}</td>
                            <td className="px-3">{latest?.text}</td>
                            <td className="px-3">
                              {latest !== undefined && <StatusBadge state={stateIdOf(latest.state)} />}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              {shown !== undefined && (
                <ReasonDrawer
                  reason={shown}
                  onClose={() => {
                    setOpen(null);
                  }}
                />
              )}
            </div>
          );
        }}
      </ListRead>
      {open === 'new' && (
        <RecordDrawer
          title={t('setup.reasons.new')}
          onClose={() => {
            setOpen(null);
          }}
          details={<NewReasonForm />}
        />
      )}
    </div>
  );
}
