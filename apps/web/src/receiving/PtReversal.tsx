import { zodResolver } from '@hookform/resolvers/zod';
import { PT_REVERSAL_REASON_CAP, PT_TYPE, type GrnPtRead } from '@apparel-os/schemas';
import { useQuery } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { api } from '../api';
import { useSubmission } from '../api/command';
import { readQuery } from '../api/query';
import { StatusBadge } from '../components/StatusBadge';
import { describedBy, FormField } from '../forms/FormField';
import { formatDateTime } from '../history/format';
import { t } from '../messages/catalogue';
import { GrantedButton, ListRead, SubmissionBanner, useGranted } from '../setup/parts';
import { stateIdOf } from '../setup/states';
import { useTimeZone } from '../shell/session';
import { unknownText } from './names';
import { PtReview } from './PtReview';

// A PT reversed before the scan-in (goods-in 6.4, 6.7, section 11; DEC-137, PRD-REC-019; S2-F09-T01): on the GRN's PT
// file, each reversal with its reason and state, and, for whoever may change the PT while its newest revision is
// Official, the proposal of a reversal with a reason; in My work, the approval panel's facts of a reversal, then the
// review of the PT it reverses. A different person approves it there. Every word comes from the message catalogue
// (code-house-rules 12.13).

const PT_READS = ['readGrnPt', 'readReceivingInbox', 'listMyWork'] as const;

const reversalFormSchema = z.object({ reason: z.string().trim().min(1).max(PT_REVERSAL_REASON_CAP) });
type ReversalForm = z.input<typeof reversalFormSchema>;

type Revision = NonNullable<GrnPtRead['pt']>['revisions'][number];
type Reversal = Revision['reversals'][number];

/** One reversal: its state and reason, who proposed it and when, and who decided it and when. */
function ReversalLine({ reversal, nameOf }: { reversal: Reversal; nameOf: (userId: string) => string }) {
  const timeZone = useTimeZone();
  return (
    <li className="flex flex-col gap-1">
      <span className="flex flex-wrap items-center gap-2">
        <StatusBadge state={stateIdOf(reversal.state)} />
        <span>{reversal.reason}</span>
      </span>
      <span className="text-caption text-text-2">
        {t('pt.reversal.by', {
          name: nameOf(reversal.proposedBy),
          at: formatDateTime(reversal.proposedAt, timeZone),
        })}
      </span>
      {reversal.decided !== undefined && (
        <span className="text-caption text-text-2">
          {t('pt.reversal.decided', {
            name: nameOf(reversal.decided.by),
            at: formatDateTime(reversal.decided.at, timeZone),
          })}
        </span>
      )}
    </li>
  );
}

/**
 * The reversals of the GRN's PT, newest first, and the proposal of one while its newest revision is Official and none
 * waits (goods-in 6.4). The proposal sends the PT's version shown, so it waits while the PT is read again (12.7).
 */
export function PtReversals({ read, reading }: { read: GrnPtRead; reading: boolean }) {
  const proposal = useSubmission('proposePtReversal', PT_READS);
  const mayChange = useGranted(PT_TYPE, 'edit');
  const form = useForm<ReversalForm>({
    resolver: zodResolver(reversalFormSchema),
    mode: 'onBlur',
    defaultValues: { reason: '' },
  });
  const pt = read.pt;
  if (pt === null) return null;
  const nameOf = (userId: string) => read.people.find((person) => person.userId === userId)?.name ?? unknownText();
  const reversals = pt.revisions.flatMap((revision) => revision.reversals);
  // The newest revision, while it is Official and no reversal of it waits.
  const newest = pt.revisions.at(0);
  const reversible =
    newest?.state === 'Official' && !newest.reversals.some((each) => each.state === 'Awaiting approval')
      ? newest
      : undefined;
  return (
    <div className="flex flex-col gap-2">
      <SubmissionBanner state={proposal.state} done="pt.reversal.proposed" />
      {reversals.length > 0 && (
        <>
          <h4 className="m-0 text-body font-semibold">{t('pt.reversals')}</h4>
          <ul aria-label={t('pt.reversals')} className="m-0 flex list-none flex-col gap-2 p-0">
            {reversals.map((reversal) => (
              <ReversalLine key={reversal.reversalId} reversal={reversal} nameOf={nameOf} />
            ))}
          </ul>
        </>
      )}
      {reversible !== undefined && mayChange && (
        <form
          aria-label={t('pt.reversal.title')}
          noValidate
          className="flex flex-col gap-2"
          onSubmit={(event) => {
            event.preventDefault();
          }}
        >
          <h4 className="m-0 text-body font-semibold">{t('pt.reversal.title')}</h4>
          <p className="m-0 text-caption text-text-2">{t('pt.reversal.intro')}</p>
          <FormField id="pt-reversal-reason" label="pt.reversal.reason" required error={form.formState.errors.reason}>
            <textarea
              id="pt-reversal-reason"
              maxLength={PT_REVERSAL_REASON_CAP}
              rows={2}
              className="rounded-control border border-control bg-surface p-2"
              {...describedBy('pt-reversal-reason', {
                invalid: form.formState.errors.reason !== undefined,
                help: false,
              })}
              {...form.register('reason')}
            />
          </FormField>
          <div>
            <GrantedButton
              label="pt.reversal.propose"
              recordType={PT_TYPE}
              action="edit"
              waiting={reading || proposal.state.kind === 'pending' ? 'pt.reading-again' : undefined}
              onClick={() => {
                if (reading) return;
                void form.handleSubmit(async (entered) => {
                  const proposed = await proposal.submit({
                    params: { revisionId: reversible.revisionId },
                    body: { versionToken: pt.versionToken, reason: entered.reason },
                  });
                  if (proposed !== undefined) form.reset();
                })();
              }}
            />
          </div>
        </form>
      )}
    </div>
  );
}

/**
 * A reversal as its approver reads it in My work (goods-in 6.7, section 11): the PT's number, its GRN, why it is
 * reversed, who proposed it and when, and what approving it does; then the review of the PT it reverses.
 */
export function PtReversalFacts({ reversalId }: { reversalId: string }) {
  const timeZone = useTimeZone();
  const query = useQuery({
    ...readQuery(api, 'readPtReversal', { params: { reversalId } }),
    enabled: useGranted(PT_TYPE, 'view'),
  });
  return (
    <ListRead query={query} what="pt.reversal.what">
      {(read) => {
        const nameOf = (userId: string) =>
          read.people.find((person) => person.userId === userId)?.name ?? unknownText();
        return (
          <div className="flex flex-col gap-3">
            <dl className="m-0 grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-body-sm">
              <dt className="text-text-2">{t('pt.revision.pt-number')}</dt>
              <dd className="m-0">{read.number}</dd>
              <dt className="text-text-2">{t('pt.review.grn')}</dt>
              <dd className="m-0">{read.grn.number}</dd>
              <dt className="text-text-2">{t('pt.reversal.panel.reason')}</dt>
              <dd className="m-0">{read.reversal.reason}</dd>
              <dt className="text-text-2">{t('pt.reversal.panel.proposed')}</dt>
              <dd className="m-0">
                {t('pt.revision.uploaded-by', {
                  name: nameOf(read.reversal.proposedBy),
                  at: formatDateTime(read.reversal.proposedAt, timeZone),
                })}
              </dd>
              <dt className="text-text-2">{t('pt.revision.state')}</dt>
              <dd className="m-0">
                <StatusBadge state={stateIdOf(read.reversal.state)} />
              </dd>
            </dl>
            <p className="m-0 text-body-sm">{t('pt.reversal.panel.effect')}</p>
            <PtReview revisionId={read.revisionId} title="pt.reversal.panel.rows" />
          </div>
        );
      }}
    </ListRead>
  );
}
