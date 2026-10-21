import { zodResolver } from '@hookform/resolvers/zod';
import {
  DAMAGE_CAPS,
  DAMAGE_REPORT_TYPE,
  DAMAGE_REVERSAL_TYPE,
  type DamageReport,
  type DamageRound,
} from '@apparel-os/schemas';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { api } from '../api';
import { useSubmission } from '../api/command';
import { readQuery } from '../api/query';
import { Button } from '../components/Button';
import { StatusBadge } from '../components/StatusBadge';
import { EvidenceList, EvidencePicker, useChosenFile, useStoreEvidence } from '../files/Evidence';
import { describedBy, FormField } from '../forms/FormField';
import { AsOf } from '../history/AsOf';
import { formatDateTime } from '../history/format';
import { t } from '../messages/catalogue';
import { formatQuantity } from '../setup/format';
import { Card, GrantedButton, inputClass, ListRead, SubmissionBanner } from '../setup/parts';
import { stateIdOf } from '../setup/states';
import { useTimeZone } from '../shell/session';

// Damage at or after receipt (goods-in 8, 8.5, section 11; PRD-DMG-001 to PRD-DMG-006, PRD-STK-017; S2-F08-T01):
// reporting damage on a GRN line's goods, which holds them at once, and the report with its decisions, asking for its
// decision again and proposing a reversal of a mistaken confirmation. The decision itself is made in My work. Times read
// in the Organisation's timezone (design-language 8).

/** The reads a change of a report makes stale. */
const DAMAGE_READS = ['readDamageReport', 'readDamageReversal'] as const;

/** Whole pieces, from one up to the cap (goods-in 8.5 "Input caps"). */
const pieces = z
  .string()
  .regex(/^\d{1,7}$/, { message: 'receive.pieces.invalid' })
  .refine((text) => Number(text) >= 1 && Number(text) <= DAMAGE_CAPS.pieces, { message: 'receive.pieces.invalid' })
  .transform((text) => Number(text));

const reportFormSchema = z.object({ quantity: pieces, description: z.string().trim().min(1) });
type ReportFormInput = z.input<typeof reportFormSchema>;
type ReportFormOutput = z.output<typeof reportFormSchema>;

/**
 * Report damage on the goods of a GRN line where they are (goods-in 8.1, 8.2): the pieces, what is wrong and a photo.
 * Once reported, the report is shown.
 */
export function ReportDamage({ grnLineId, locationId }: { grnLineId: string; locationId: string }) {
  const [reportId, setReportId] = useState<string | null>(null);
  const form = useForm<ReportFormInput, unknown, ReportFormOutput>({
    resolver: zodResolver(reportFormSchema),
    mode: 'onBlur',
    defaultValues: { quantity: '', description: '' },
  });
  const chosen = useChosenFile();
  const storing = useStoreEvidence();
  const submission = useSubmission('reportDamage', DAMAGE_READS);
  const errors = form.formState.errors;
  if (reportId !== null) return <DamageReportView reportId={reportId} />;
  const send = async (entered: ReportFormOutput) => {
    const photo = chosen.file === null ? undefined : await storing.store(chosen.file);
    if (chosen.file !== null && photo === undefined) return;
    const reported = await submission.submit({
      body: {
        locationId,
        goods: { kind: 'grn-line', grnLineId },
        quantity: entered.quantity,
        description: entered.description,
        ...(photo === undefined ? {} : { photos: [photo] }),
      },
    });
    if (reported !== undefined) setReportId(reported.damageReportId);
  };
  const id = (field: string) => `damage-${grnLineId}-${field}`;
  return (
    <form
      aria-label={t('damage.report')}
      noValidate
      className="flex flex-col gap-3 rounded-card border border-border bg-raised p-3"
      onSubmit={(event) => {
        void form.handleSubmit(send)(event);
      }}
    >
      <p className="m-0 text-body-sm text-text-2">{t('damage.report.intro')}</p>
      {storing.banner}
      <SubmissionBanner state={submission.state} done="damage.reported" />
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField id={id('quantity')} label="damage.quantity" required error={errors.quantity}>
          <input
            id={id('quantity')}
            inputMode="numeric"
            className={inputClass}
            {...describedBy(id('quantity'), { invalid: errors.quantity !== undefined, help: false })}
            {...form.register('quantity')}
          />
        </FormField>
        <FormField id={id('description')} label="damage.description" required error={errors.description}>
          <textarea
            id={id('description')}
            maxLength={DAMAGE_CAPS.text}
            rows={2}
            className="rounded-control border border-control bg-surface p-2"
            {...describedBy(id('description'), { invalid: errors.description !== undefined, help: false })}
            {...form.register('description')}
          />
        </FormField>
      </div>
      <EvidencePicker id={id('photo')} label="damage.photo" resetKey={chosen.resetKey} onChange={chosen.choose} />
      <div>
        <Button type="submit" variant="primary" label="damage.send" disabled={submission.state.kind === 'pending'} />
      </div>
    </form>
  );
}

/** One round of the decision: when it was asked and what was decided (goods-in 8.5). */
function roundText(round: DamageRound, timeZone: string): string {
  if (round.decision === null) return t('damage.round.waiting');
  return t('damage.round.decided', {
    outcome: t(`state.${stateIdOf(round.decision.outcome)}`),
    at: formatDateTime(round.decision.decidedAt, timeZone),
  });
}

/** The report's facts, as its screen and its approval panels show them. */
export function DamageReportFacts({ report }: { report: DamageReport }) {
  const timeZone = useTimeZone();
  return (
    <div className="flex flex-col gap-3">
      <dl className="m-0 grid grid-cols-[max-content_1fr] gap-x-4 gap-y-2 text-body-sm">
        <dt className="text-text-2">{t('damage.quantity')}</dt>
        <dd className="m-0 tabular-nums">{formatQuantity(report.quantity)}</dd>
        <dt className="text-text-2">{t('damage.description')}</dt>
        <dd className="m-0 break-words">{report.description}</dd>
        <dt className="text-text-2">{t('damage.reported-at')}</dt>
        <dd className="m-0">{formatDateTime(report.reportedAt, timeZone)}</dd>
      </dl>
      <h4 className="m-0 text-body font-semibold">{t('damage.photos')}</h4>
      <EvidenceList attachmentIds={report.photoAttachmentIds} />
      <h4 className="m-0 text-body font-semibold">{t('damage.decisions')}</h4>
      <ul aria-label={t('damage.decisions')} className="m-0 flex list-none flex-col gap-1 p-0 text-body-sm">
        {report.rounds.map((round) => (
          <li key={round.id}>
            <span className="font-semibold">{t(`damage.round.${round.kind}`)}</span>: {roundText(round, timeZone)}
          </li>
        ))}
      </ul>
      {report.reversals.length > 0 && (
        <>
          <h4 className="m-0 text-body font-semibold">{t('damage.reversals')}</h4>
          <ul aria-label={t('damage.reversals')} className="m-0 flex list-none flex-col gap-1 p-0 text-body-sm">
            {report.reversals.map((reversal) => (
              <li key={reversal.id}>
                {t('damage.reversal.line', {
                  reason: reversal.reason,
                  state: t(`state.${stateIdOf(reversal.outcome ?? reversal.requestState ?? 'Awaiting approval')}`),
                })}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

const reversalFormSchema = z.object({ reason: z.string().trim().min(1) });
type ReversalForm = z.input<typeof reversalFormSchema>;

/** A damage report with its decisions, and the changes the reader may make to it (goods-in 8.3, 8.5). */
export function DamageReportView({ reportId }: { reportId: string }) {
  const timeZone = useTimeZone();
  const queryClient = useQueryClient();
  const read = readQuery(api, 'readDamageReport', { params: { damageReportId: reportId } });
  const query = useQuery(read);
  const renewal = useSubmission('renewDamageDecision', DAMAGE_READS);
  const proposal = useSubmission('proposeDamageReversal', DAMAGE_READS);
  const form = useForm<ReversalForm>({
    resolver: zodResolver(reversalFormSchema),
    mode: 'onBlur',
    defaultValues: { reason: '' },
  });
  // An action naming the version shown waits while the report is read again (code-house-rules 12.7).
  const reading = () => query.isFetching || queryClient.isFetching({ queryKey: read.queryKey }) > 0;
  const waiting = reading() ? ('damage.reading-again' as const) : undefined;
  return (
    <ListRead query={query} what="damage.what">
      {({ asOf, report }) => {
        const awaitingReversal = report.reversals.some((each) => each.outcome === null);
        return (
          <Card>
            <div className="flex flex-wrap items-center gap-3">
              <h3 className="m-0 text-h3 font-semibold">{t('damage.title', { number: report.number })}</h3>
              <StatusBadge state={stateIdOf(report.state)} />
              <span className="flex-1" />
              <AsOf asOf={asOf} timeZone={timeZone} />
            </div>
            <DamageReportFacts report={report} />
            {report.state === 'Submitted' && (
              <div className="flex flex-col gap-2">
                <SubmissionBanner state={renewal.state} done="damage.renewed" />
                <p className="m-0 text-caption text-text-2">{t('damage.renew.help')}</p>
                <div>
                  <GrantedButton
                    label="damage.renew"
                    recordType={DAMAGE_REPORT_TYPE}
                    action="create"
                    waiting={waiting}
                    onClick={() => {
                      if (reading()) return;
                      void renewal.submit({
                        params: { damageReportId: report.id },
                        body: { versionToken: report.versionToken },
                      });
                    }}
                  />
                </div>
              </div>
            )}
            {report.state === 'Confirmed' && !awaitingReversal && (
              <form
                aria-label={t('damage.reversal.propose')}
                noValidate
                className="flex flex-col gap-2"
                onSubmit={(event) => {
                  event.preventDefault();
                }}
              >
                <SubmissionBanner state={proposal.state} done="damage.reversal.proposed" />
                <FormField
                  id="damage-reversal-reason"
                  label="damage.reversal.reason"
                  required
                  error={form.formState.errors.reason}
                >
                  <textarea
                    id="damage-reversal-reason"
                    maxLength={DAMAGE_CAPS.text}
                    rows={2}
                    className="rounded-control border border-control bg-surface p-2"
                    {...describedBy('damage-reversal-reason', {
                      invalid: form.formState.errors.reason !== undefined,
                      help: false,
                    })}
                    {...form.register('reason')}
                  />
                </FormField>
                <div>
                  <GrantedButton
                    label="damage.reversal.propose"
                    recordType={DAMAGE_REVERSAL_TYPE}
                    action="create"
                    waiting={waiting}
                    onClick={() => {
                      if (reading()) return;
                      void form.handleSubmit(async (entered) => {
                        const proposed = await proposal.submit({
                          params: { damageReportId: report.id },
                          body: { reason: entered.reason, versionToken: report.versionToken },
                        });
                        if (proposed !== undefined) form.reset();
                      })();
                    }}
                  />
                </div>
              </form>
            )}
          </Card>
        );
      }}
    </ListRead>
  );
}
