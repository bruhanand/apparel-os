import {
  bulkTotals,
  totpCodeSchema,
  type ApprovalRequestView,
  type BulkDecisionAnswer,
  type BulkTotal,
} from '@apparel-os/schemas';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../api';
import { useSubmission } from '../api/command';
import { readQuery } from '../api/query';
import { Banner } from '../components/Banner';
import { Button } from '../components/Button';
import { missingText } from '../components/UnavailableState';
import { describedBy, FormField } from '../forms/FormField';
import { isMessageId, t, type MessageId } from '../messages/catalogue';
import { formatPaise } from '../setup/format';
import { RefusalBanner } from '../sign-in/RefusalBanner';

// Bulk approval on My work's approvals (access-and-approvals 9.9, 14; design-language 10.9 "Selection", "bulk bar";
// PRD-ACS-011, PRD-ACS-019, POL-02.19, PRD-MOD-015; S1-F05-T02): the bulk bar shows the items selected and, for each
// basis, the sum of the known values and how many are of Unknown value, never added as zero, and never totals two
// bases together. Approving them sends one request; the server decides each item on its own, rechecked, and an item
// that fails stays in My work for individual review, with its reason shown here.

/** What one basis's total says (PRD-ACS-019, PRD-MOD-015). */
export function totalText(total: BulkTotal): string {
  const basis = t(`approval.basis.${total.basis}`);
  const known =
    total.known === null
      ? t('bulk.total.no-known', { basis })
      : t('bulk.total.known', { amount: formatPaise(total.known), basis });
  return total.unknownCount === 0 ? known : `${known} · ${t('bulk.total.unknown', { count: total.unknownCount })}`;
}

function codeMessage(code: string): MessageId {
  const id = `error.${code}`;
  return isMessageId(id) ? id : 'error.unknown-code';
}

/**
 * The bulk bar (design-language 10.9): `--tint`, "n selected", the totals, the action and Clear. Its results stay on
 * screen after the decision: each item approved, or left for individual review with its reason (PRD-UXP-003).
 */
export function BulkBar({
  selected,
  labels,
  onClear,
}: {
  selected: readonly ApprovalRequestView[];
  /** What each selected request is, in words, by request identifier. */
  labels: ReadonlyMap<string, string>;
  onClear: () => void;
}) {
  const [approving, setApproving] = useState(false);
  const [results, setResults] = useState<BulkDecisionAnswer | undefined>(undefined);
  const submission = useSubmission('decideApprovalsInBulk', ['listMyWork', 'readApprovalRequest']);
  const reasons = useQuery({ ...readQuery(api, 'listApprovalReasons', {}), enabled: approving });
  const [reasonId, setReasonId] = useState('');
  const [code, setCode] = useState('');
  const totals = bulkTotals(selected.map((view) => view.value));
  const ready = reasonId !== '' && totpCodeSchema.safeParse(code).success && selected.length > 0;
  // Shown when a selection exists (design-language 10.9), and while the last bulk decision's results are on screen.
  if (selected.length === 0 && results === undefined) return null;
  return (
    <section
      aria-label={t('bulk.label')}
      className="flex flex-col gap-3 rounded-card bg-tint px-4 py-3 text-on-tint"
      data-testid="bulk-bar"
    >
      {selected.length > 0 && (
        <div className="flex flex-wrap items-center gap-3">
          <span className="font-semibold">{t('bulk.selected', { count: selected.length })}</span>
          <ul className="flex list-none flex-wrap gap-x-3 p-0 tabular-nums" aria-label={t('bulk.totals')}>
            {totals.totals.map((total) => (
              <li key={total.basis}>{totalText(total)}</li>
            ))}
            {totals.noValueCount > 0 && <li>{t('bulk.total.no-value', { count: totals.noValueCount })}</li>}
          </ul>
          <span className="flex-1" />
          <Button
            label="bulk.approve"
            variant="primary"
            onClick={() => {
              setApproving(true);
            }}
          />
          <Button label="bulk.clear" onClick={onClear} />
        </div>
      )}
      {approving && selected.length > 0 && (
        <form
          noValidate
          className="flex flex-wrap items-end gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (!ready) return;
            void submission
              .submit({
                body: {
                  items: selected.map((view) => ({ requestId: view.id, versionId: view.document.versionId })),
                  reason: { kind: 'listed', reasonId },
                  totpCode: code,
                },
              })
              .then((answer) => {
                setCode('');
                if (answer === undefined) return;
                setResults(answer);
                setApproving(false);
                onClear();
              });
          }}
        >
          {submission.state.kind === 'refused' && <RefusalBanner refusal={submission.state.refusal} />}
          <FormField id="bulk-reason" label="approval.reason" required>
            <select
              id="bulk-reason"
              className="h-9 rounded-control border border-control bg-surface px-2 text-text"
              value={reasonId}
              {...describedBy('bulk-reason', { invalid: false, help: false })}
              onChange={(event) => {
                setReasonId(event.target.value);
              }}
            >
              <option value="">{t('approval.reason.choose')}</option>
              {(reasons.data?.reasons ?? [])
                .filter((reason) => reason.kind === 'approve')
                .map((reason) => (
                  <option key={reason.id} value={reason.id}>
                    {t('approval.reason.option', { code: reason.code, text: reason.text })}
                  </option>
                ))}
            </select>
          </FormField>
          <FormField id="bulk-code" label="approval.code" required help="bulk.code.help">
            <input
              id="bulk-code"
              inputMode="numeric"
              autoComplete="one-time-code"
              className="h-9 w-40 rounded-control border border-control bg-surface px-2 font-mono text-text"
              value={code}
              {...describedBy('bulk-code', { invalid: false, help: true })}
              onChange={(event) => {
                setCode(event.target.value);
              }}
            />
          </FormField>
          <Button
            type="submit"
            variant="primary"
            label="bulk.approve-selected"
            disabled={!ready || submission.state.kind === 'pending'}
          />
        </form>
      )}
      {results !== undefined && (
        <div className="flex flex-col gap-2" role="status" aria-label={t('bulk.results')}>
          <span className="font-semibold">
            {t('bulk.results.summary', {
              approved: results.items.filter((item) => item.outcome === 'Approved').length,
              review: results.items.filter((item) => item.outcome === 'individual-review').length,
            })}
          </span>
          <ul className="flex list-none flex-col gap-1 p-0">
            {results.items.map((item) => (
              <li key={item.requestId} className="flex flex-col">
                <span>
                  {labels.get(item.requestId) ?? t('my-work.kind.approval')} ·{' '}
                  {item.outcome === 'Approved' ? t('bulk.item.approved') : t('bulk.item.review')}
                </span>
                {item.outcome === 'individual-review' && (
                  <Banner tone="warning" message={codeMessage(item.code)}>
                    {item.missing.length > 0 && (
                      <ul className="list-none p-0">
                        {item.missing.map((missing, index) => (
                          <li key={index}>{missingText(missing)}</li>
                        ))}
                      </ul>
                    )}
                  </Banner>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
