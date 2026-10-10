import {
  FINANCIAL_PERIOD_TYPE,
  PERIOD_REOPENING_TYPE,
  reopeningDraftSchema,
  type NamedCorrection,
  type PeriodCloseRow,
  type ReopeningView,
} from '@apparel-os/schemas';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../api';
import { useSubmission } from '../api/command';
import { readQuery } from '../api/query';
import { ApprovalPanel } from '../approvals/ApprovalPanel';
import { Banner } from '../components/Banner';
import { Button } from '../components/Button';
import { EmptyState } from '../components/StandardStates';
import { StatusBadge } from '../components/StatusBadge';
import { AsOf } from '../history/AsOf';
import { formatDateTime } from '../history/format';
import { t } from '../messages/catalogue';
import { useSession, useTimeZone } from '../shell/session';
import { formatDate } from '../setup/format';
import { Card, GrantedButton, HistoryTab, inputClass, ListRead, SubmissionBanner, Th, Toolbar } from '../setup/parts';
import { FormActions, RecordDrawer } from '../setup/RecordDrawer';
import { stateIdOf } from '../setup/states';
import { BookPicker } from './BookPicker';

// Money › Period close (books-and-posting 4.2, 4.3, 14; ui-blueprint Money › Period close; PRD-LED-009, PRD-LED-019,
// PRD-LED-020; DEC-106, DEC-107; S1-F09-T03): each period of a book with its state, locked in date order by an
// authorised Accounts user; a reopening of a Locked period requested with its reason and the corrections it names,
// decided by a different authorised person from My work; the reopenings with their named corrections and which have
// posted; and the withdrawal of one awaiting its decision or in force (RR-489). Who may lock, request, approve and
// withdraw is KDPS's (V-01).

const READS = ['readPeriodClose', 'listPeriods', 'listMyWork'] as const;

const blankCorrection = (): NamedCorrection => ({ module: '', recordType: '', recordId: '' });

/** Locks one period (4.2): the server refuses it while an earlier period is still Open, naming that one. */
function LockButton({ periodId }: { periodId: string }) {
  const submission = useSubmission('lockPeriod', READS);
  return (
    <div className="flex flex-col gap-2">
      <SubmissionBanner state={submission.state} done="period-close.locked" />
      <div>
        <GrantedButton
          label="period-close.lock"
          recordType={FINANCIAL_PERIOD_TYPE}
          action="edit"
          onClick={() => {
            void submission.submit({ params: { periodId }, body: {} });
          }}
        />
      </div>
    </div>
  );
}

/** A request to reopen a Locked period: its reason and the corrections it names, each a source record (4.3 step 1). */
function ReopeningForm({ period }: { period: PeriodCloseRow }) {
  const [reason, setReason] = useState('');
  const [corrections, setCorrections] = useState<NamedCorrection[]>([blankCorrection()]);
  const [invalid, setInvalid] = useState(false);
  const submission = useSubmission('requestReopening', READS);
  const set = (index: number, change: Partial<NamedCorrection>) => {
    setCorrections(corrections.map((each, at) => (at === index ? { ...each, ...change } : each)));
  };
  return (
    <form
      id="period-reopening-form"
      aria-label={t('period-close.request')}
      noValidate
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        const parsed = reopeningDraftSchema.safeParse({ reason, corrections });
        setInvalid(!parsed.success);
        if (!parsed.success) return;
        void submission.submit({ params: { periodId: period.id }, body: parsed.data });
      }}
    >
      <SubmissionBanner state={submission.state} />
      {invalid && <Banner tone="danger" role="alert" message="period-close.form-invalid" />}
      <p className="m-0 text-body-sm text-text-2">
        {t('period-close.request.for', {
          code: period.code,
          first: formatDate(period.firstDay),
          last: formatDate(period.lastDay),
        })}
      </p>
      <label className="flex flex-col gap-1" htmlFor="period-reopening-reason">
        <span className="text-body-sm font-semibold">{t('period-close.reason')}</span>
        <textarea
          id="period-reopening-reason"
          className="min-h-20 rounded-control border border-control bg-surface p-2"
          value={reason}
          onChange={(event) => {
            setReason(event.target.value);
          }}
        />
      </label>
      {corrections.map((correction, index) => (
        <fieldset key={index} className="flex flex-col gap-2 rounded-card border border-border p-3">
          <legend className="px-1 text-body-sm font-semibold">
            {t('period-close.correction', { number: index + 1 })}
          </legend>
          {(
            [
              ['module', 'period-close.correction.module'],
              ['recordType', 'period-close.correction.record-type'],
              ['recordId', 'period-close.correction.record-id'],
            ] as const
          ).map(([field, label]) => (
            <label key={field} className="flex flex-col gap-1" htmlFor={`period-correction-${field}-${String(index)}`}>
              <span className="text-body-sm">{t(label)}</span>
              <input
                id={`period-correction-${field}-${String(index)}`}
                className={`${inputClass} font-mono`}
                value={correction[field]}
                onChange={(event) => {
                  set(index, { [field]: event.target.value.trim() });
                }}
              />
            </label>
          ))}
        </fieldset>
      ))}
      <div>
        <Button
          size="small"
          variant="ghost"
          label="period-close.correction.add"
          onClick={() => {
            setCorrections([...corrections, blankCorrection()]);
          }}
        />
      </div>
      <FormActions form="period-reopening-form" pending={submission.state.kind === 'pending'} />
    </form>
  );
}

/**
 * A reopening: its reason, state, request and named corrections, which have posted (14); withdrawn while awaiting its
 * decision or in force, by its requester or a person holding cancel (RR-489).
 */
function Reopening({ reopening, onOpenApproval }: { reopening: ReopeningView; onOpenApproval: (id: string) => void }) {
  const timeZone = useTimeZone();
  const withdrawal = useSubmission('withdrawReopening', READS);
  const { session } = useSession();
  const userId = session.state === 'signed-out' ? undefined : session.user.userId;
  const withdraw = () => {
    void withdrawal.submit({ params: { reopeningId: reopening.id }, body: {} });
  };
  return (
    <li
      aria-label={t('period-close.reopening', { at: formatDateTime(reopening.requestedAt, timeZone) })}
      className="flex flex-col gap-2 border-b border-border pb-3 last:border-b-0"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold">{t('period-close.reopening.title')}</span>
        <StatusBadge state={stateIdOf(reopening.state)} />
        <span className="text-caption text-text-2">
          {t('period-close.requested-at', { at: formatDateTime(reopening.requestedAt, timeZone) })}
        </span>
      </div>
      <p className="m-0 text-body-sm">{reopening.reason}</p>
      <ul className="m-0 flex list-none flex-col gap-1 p-0" aria-label={t('period-close.corrections')}>
        {reopening.corrections.map((correction) => (
          <li key={`${correction.module}|${correction.recordType}|${correction.recordId}`} className="text-body-sm">
            <span className="font-mono">
              {correction.module} · {correction.recordType} · {correction.recordId}
            </span>{' '}
            —{' '}
            {correction.postedJournalId === undefined
              ? t('period-close.correction.to-post')
              : t('period-close.correction.posted')}
          </li>
        ))}
      </ul>
      <SubmissionBanner state={withdrawal.state} done="period-close.withdrawn" />
      <div className="flex flex-wrap gap-2">
        {reopening.request?.state === 'Awaiting approval' && (
          <Button
            size="small"
            variant="ghost"
            label="setup.open-approval"
            onClick={() => {
              onOpenApproval(reopening.request?.id ?? '');
            }}
          />
        )}
        {(reopening.state === 'In force' || reopening.state === 'Awaiting approval') &&
          // RR-489 (product owner, 10 Oct 2026): the requester withdraws their own; anyone else needs cancel.
          (reopening.requestedByUserId === userId ? (
            <Button variant="secondary" label="period-close.withdraw" onClick={withdraw} />
          ) : (
            <GrantedButton
              label="period-close.withdraw"
              recordType={PERIOD_REOPENING_TYPE}
              action="cancel"
              onClick={withdraw}
            />
          ))}
      </div>
    </li>
  );
}

/** One period's drawer: its state and lock, its reopenings, and the request of a new one (4.2, 4.3, 14). */
function PeriodDrawer({ period, onClose }: { period: PeriodCloseRow; onClose: () => void }) {
  const timeZone = useTimeZone();
  const [panel, setPanel] = useState<string | null>(null);
  const [requesting, setRequesting] = useState(false);
  return (
    <RecordDrawer
      reference={period.code}
      title={t('period-close.period-title', { code: period.code })}
      state={period.state}
      onClose={onClose}
      history={<HistoryTab recordType={FINANCIAL_PERIOD_TYPE} recordId={period.id} />}
      details={
        <>
          <Card title="period-close.lock-card">
            <p className="m-0 text-body-sm">
              {t('finance.period.option', {
                code: period.code,
                first: formatDate(period.firstDay),
                last: formatDate(period.lastDay),
              })}
            </p>
            {period.lockedAt === undefined ? (
              <LockButton periodId={period.id} />
            ) : (
              <p className="m-0 text-body-sm">
                {t('period-close.locked-at', { at: formatDateTime(period.lockedAt, timeZone) })}
              </p>
            )}
          </Card>
          <Card title="period-close.reopenings">
            {period.reopenings.length === 0 ? (
              <p className="m-0 text-body-sm text-text-2">{t('period-close.no-reopenings')}</p>
            ) : (
              <ol className="m-0 flex list-none flex-col gap-3 p-0">
                {period.reopenings.map((reopening) => (
                  <Reopening key={reopening.id} reopening={reopening} onOpenApproval={setPanel} />
                ))}
              </ol>
            )}
            {period.state !== 'Open' && !requesting && (
              <div>
                <GrantedButton
                  label="period-close.request"
                  recordType={PERIOD_REOPENING_TYPE}
                  action="create"
                  onClick={() => {
                    setRequesting(true);
                  }}
                />
              </div>
            )}
            {requesting && <ReopeningForm period={period} />}
          </Card>
          {panel !== null && <ApprovalPanel requestId={panel} />}
        </>
      }
    />
  );
}

function BookPeriods({
  bookId,
  open,
  setOpen,
}: {
  bookId: string;
  open: string | null;
  setOpen: (id: string | null) => void;
}) {
  const timeZone = useTimeZone();
  const query = useQuery(readQuery(api, 'readPeriodClose', { params: { bookId } }));
  return (
    <ListRead query={query} what="period-close.what">
      {(close) => {
        const shown = close.periods.find((period) => period.id === open);
        return (
          <div className="flex flex-col gap-3">
            <div className="flex justify-end">
              <AsOf asOf={close.asOf} timeZone={timeZone} />
            </div>
            {close.periods.length === 0 ? (
              <EmptyState title="period-close.empty.title" body="period-close.empty.body" />
            ) : (
              <div className="overflow-x-auto rounded-card border border-border bg-surface">
                <table className="w-full border-collapse text-body" aria-label={t('screen.money.period-close')}>
                  <thead>
                    <tr>
                      <Th label="period-close.period" />
                      <Th label="period-close.dates" />
                      <Th label="period-close.state" />
                      <Th label="period-close.in-force" />
                    </tr>
                  </thead>
                  <tbody>
                    {close.periods.map((period) => (
                      <tr key={period.id} className="h-10 border-t border-border hover:bg-hover">
                        <td className="px-3">
                          <button
                            type="button"
                            className="font-mono text-accent underline"
                            onClick={() => {
                              setOpen(period.id);
                            }}
                          >
                            {period.code}
                          </button>
                        </td>
                        <td className="px-3">
                          {t('period-close.dates.value', {
                            first: formatDate(period.firstDay),
                            last: formatDate(period.lastDay),
                          })}
                        </td>
                        <td className="px-3">
                          <StatusBadge state={stateIdOf(period.state)} />
                        </td>
                        <td className="px-3">
                          {t('period-close.in-force.count', {
                            count: period.reopenings.filter((each) => each.state === 'In force').length,
                          })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {shown !== undefined && (
              <PeriodDrawer
                period={shown}
                onClose={() => {
                  setOpen(null);
                }}
              />
            )}
          </div>
        );
      }}
    </ListRead>
  );
}

/** Money › Period close. */
export function PeriodCloseScreen() {
  const [bookId, setBookId] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-4">
      <Toolbar>
        <BookPicker
          value={bookId}
          onChange={(next) => {
            setBookId(next);
            setOpen(null);
          }}
        />
      </Toolbar>
      {bookId === null ? (
        <EmptyState title="period-close.choose.title" body="period-close.choose.body" />
      ) : (
        <BookPeriods bookId={bookId} open={open} setOpen={setOpen} />
      )}
    </div>
  );
}
