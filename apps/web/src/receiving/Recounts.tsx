import { zodResolver } from '@hookform/resolvers/zod';
import { RECEIVING_CAPS, RECOUNT_TYPE, type Arrival, type Grn, type GrnLine, type Recount } from '@apparel-os/schemas';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { useSubmission } from '../api/command';
import { Button } from '../components/Button';
import { StatusBadge } from '../components/StatusBadge';
import { describedBy, FormField } from '../forms/FormField';
import { formatDateTime } from '../history/format';
import { t } from '../messages/catalogue';
import { formatQuantity } from '../setup/format';
import { inputClass, SubmissionBanner, Th, useGranted } from '../setup/parts';
import { stateIdOf } from '../setup/states';
import { useTimeZone } from '../shell/session';
import { unknownText } from './names';

// A recount of a GRN's lines on the GRN (goods-in 4.7, 4.11, section 11; PRD-REC-019; S2-F02-T05): the recounts with
// their state, the lines each recounts and why; and, for whoever may propose one, the proposal: the pieces counted
// again of the lines concerned and why, naming the GRN's recount version shown (code-house-rules 12.7). A different
// person approves it in My work. The GRN keeps its original count. Times read in the Organisation's timezone
// (design-language 8); a person the reader cannot name is Unknown, never an identifier (PRD-MOD-015).

/** The reads a recount makes stale. */
const RECOUNT_READS = ['readArrival', 'readReceivingInbox'] as const;

/** Whether the Arrival is being read again, which makes the recount version it showed stale (12.7). */
interface Reading {
  readonly shown: boolean;
  readonly now: () => boolean;
}

/** A person's name from their sign-in, as the Arrival names them; Unknown when it does not (PRD-MOD-015). */
function personOf(arrival: Arrival, userId: string): string {
  return arrival.people.find((each) => each.userId === userId)?.name ?? unknownText();
}

/** The recounts of a GRN, oldest first, each with its state, why, who and when, and the lines it recounts. */
export function RecountsView({ arrival, grn }: { arrival: Arrival; grn: Grn }) {
  const timeZone = useTimeZone();
  if (grn.recounts.length === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      <h4 className="m-0 text-body font-semibold">{t('receive.recounts')}</h4>
      {grn.recounts.map((recount) => (
        <RecountItem key={recount.id} recount={recount} arrival={arrival} timeZone={timeZone} />
      ))}
    </div>
  );
}

function RecountItem({ recount, arrival, timeZone }: { recount: Recount; arrival: Arrival; timeZone: string }) {
  return (
    <section
      aria-label={t('receive.recount.of', { at: formatDateTime(recount.proposedAt, timeZone) })}
      className="flex flex-col gap-1 rounded-card border border-border bg-raised p-3 text-body-sm"
    >
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge state={stateIdOf(recount.state)} />
        <span>
          {t('receive.recount.by', {
            name: personOf(arrival, recount.proposedBy),
            at: formatDateTime(recount.proposedAt, timeZone),
          })}
        </span>
      </div>
      <p className="m-0 break-words">{t('receive.recount.why', { reason: recount.reason })}</p>
      <ul className="m-0 list-none p-0">
        {recount.lines.map((line) => (
          <li key={line.grnLineId}>
            {t('receive.recount.line', {
              line: formatQuantity(line.lineNumber),
              before: formatQuantity(line.countedBefore),
              after: formatQuantity(line.countedAfter),
            })}
          </li>
        ))}
      </ul>
      {recount.decision !== null && (
        <p className="m-0 text-caption text-text-2">
          {t('receive.recount.decided', {
            name: personOf(arrival, recount.decision.decidedBy),
            at: formatDateTime(recount.decision.decidedAt, timeZone),
          })}
        </p>
      )}
    </section>
  );
}

/** Pieces counted again: blank keeps the line's count; otherwise whole pieces up to the cap (goods-in 4.8). */
const recounted = z
  .string()
  .trim()
  .refine((text) => text === '' || (/^\d{1,7}$/.test(text) && Number(text) <= RECEIVING_CAPS.pieces), {
    message: 'receive.pieces.invalid',
  });

const recountFormSchema = z
  .object({ reason: z.string().trim().min(1), counts: z.record(z.string(), recounted) })
  .refine((form) => Object.values(form.counts).some((text) => text.trim() !== ''), {
    path: ['reason'],
    message: 'receive.recount.none',
  });
type RecountForm = z.input<typeof recountFormSchema>;

/**
 * Propose a recount of the GRN's lines (goods-in 4.7, 4.11), for whoever holds create on recounts, while none waits:
 * each line's pieces as counted again, blank to keep its count, and why. It names the recount version shown, so it
 * waits while the Arrival is read again (code-house-rules 12.7). The server refuses, naming why, a line a recount does
 * not change, and any recount while the GRN's PT is attached.
 */
export function ProposeRecount({ grn, reading }: { grn: Grn; reading: Reading }) {
  const mayPropose = useGranted(RECOUNT_TYPE, 'create');
  const form = useForm<RecountForm>({
    resolver: zodResolver(recountFormSchema),
    mode: 'onBlur',
    defaultValues: { reason: '', counts: Object.fromEntries(grn.lines.map((line) => [line.id, ''])) },
  });
  const submission = useSubmission('proposeRecount', RECOUNT_READS);
  if (!mayPropose) return null;
  if (grn.recounts.some((recount) => recount.state === 'Awaiting approval')) {
    return <p className="m-0 text-body-sm text-text-2">{t('receive.recount.waiting')}</p>;
  }
  const errors = form.formState.errors;
  const reasonMessage = errors.reason?.message;
  return (
    <form
      aria-label={t('receive.recount.propose')}
      noValidate
      className="flex flex-col gap-3 rounded-card border border-border bg-raised p-3"
      onSubmit={(event) => {
        void form.handleSubmit(async (entered) => {
          if (reading.now()) return;
          const proposed = await submission.submit({
            params: { grnId: grn.id },
            body: {
              versionToken: grn.recountVersionToken,
              reason: entered.reason,
              lines: grn.lines.flatMap((line) => {
                const text = entered.counts[line.id]?.trim() ?? '';
                return text === '' ? [] : [{ grnLineId: line.id, countedQuantity: Number(text) }];
              }),
            },
          });
          if (proposed !== undefined) form.reset();
        })(event);
      }}
    >
      <h4 className="m-0 text-body font-semibold">{t('receive.recount.propose')}</h4>
      <p className="m-0 text-body-sm text-text-2">{t('receive.recount.intro')}</p>
      <SubmissionBanner state={submission.state} done="receive.recount.proposed" />
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-body" aria-label={t('receive.recount.lines')}>
          <thead>
            <tr>
              <Th label="receive.line-number" />
              <Th label="receive.style-code" />
              <Th label="receive.colour" />
              <Th label="receive.size" />
              <Th label="receive.counted-quantity" />
              <Th label="receive.recount.pieces" />
            </tr>
          </thead>
          <tbody>
            {grn.lines.map((line) => (
              <RecountRow key={line.id} line={line} form={form} />
            ))}
          </tbody>
        </table>
      </div>
      <FormField
        id={`recount-${grn.id}-reason`}
        label="receive.recount.reason"
        required
        error={errors.reason}
        message={reasonMessage === 'receive.recount.none' ? 'receive.recount.none' : undefined}
      >
        <textarea
          id={`recount-${grn.id}-reason`}
          maxLength={RECEIVING_CAPS.reason}
          rows={2}
          className="rounded-control border border-control bg-surface p-2"
          {...describedBy(`recount-${grn.id}-reason`, { invalid: errors.reason !== undefined, help: false })}
          {...form.register('reason')}
        />
      </FormField>
      <div>
        <Button
          type="submit"
          variant="primary"
          label="receive.recount.send"
          disabled={submission.state.kind === 'pending' || reading.shown}
          {...(reading.shown ? { reason: 'receive.reading-again' as const } : {})}
        />
      </div>
    </form>
  );
}

/** One GRN line of the proposal: its identity, its count now and the pieces counted again. */
function RecountRow({ line, form }: { line: GrnLine; form: ReturnType<typeof useForm<RecountForm>> }) {
  const id = `recount-${line.id}`;
  const invalid = form.formState.errors.counts?.[line.id] !== undefined;
  return (
    <tr className="h-10 border-t border-border">
      <td className="px-3 tabular-nums">{formatQuantity(line.lineNumber)}</td>
      <td className="px-3">{line.styleCode ?? line.description ?? <span className="sr-only">{unknownText()}</span>}</td>
      <td className="px-3">{line.colour ?? t('receive.none')}</td>
      <td className="px-3">{line.size ?? t('receive.none')}</td>
      <td className="px-3 tabular-nums">{formatQuantity(line.recounted?.countedQuantity ?? line.countedQuantity)}</td>
      <td className="px-3">
        <input
          id={id}
          inputMode="numeric"
          aria-label={t('receive.recount.pieces.of', { line: formatQuantity(line.lineNumber) })}
          className={`${inputClass} w-28`}
          {...(invalid ? { 'aria-invalid': true } : {})}
          {...form.register(`counts.${line.id}`)}
        />
      </td>
    </tr>
  );
}
