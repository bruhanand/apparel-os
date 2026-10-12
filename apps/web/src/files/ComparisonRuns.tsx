import {
  COMPARISON_RUN_TYPE,
  comparisonRunKindSchema,
  type ComparisonBalanceLine,
  type ComparisonLine,
  type ComparisonRunKind,
  type ComparisonRunRead,
  type ComparisonSide,
} from '@apparel-os/schemas';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../api';
import { useSubmission } from '../api/command';
import { readQuery } from '../api/query';
import { EmptyState } from '../components/StandardStates';
import { AsOf } from '../history/AsOf';
import { formatDateTime } from '../history/format';
import { t } from '../messages/catalogue';
import { useBusinessToday } from '../setup/business-date';
import { Card, GrantedButton, inputClass, ListRead, SubmissionBanner, Th } from '../setup/parts';
import { formatPaise } from '../setup/format';
import { useTimeZone } from '../shell/session';

// Comparison runs on Setup › File intake and saved layouts (imports-and-opening-data 10.3, 13.1, 14, 16; PRD-LIF-027,
// POL-14.07; S1-F13-T01): run a comparison of two sets by the key its kind names (the manifest, or the count, against
// the earlier POS's last SOH; the count against the manifest), and read each run with both sides as it kept them and
// every line. A line the other side does not list says so, never zero (I-1). The server shows only the runs and
// batches inside the reader's scope; neither side is ever changed. S1-F13-T02 adds the run of opening dues, advances
// or deposits against the closed-books balances (10.4; POL-14.03), whose lines are totals in paise per party and per
// account.

const READS = ['listComparisonRuns'] as const;

function sideText(side: ComparisonSide): string {
  return side.kind === 'batch'
    ? t('comparison.side.batch', { set: t(`comparison.set.${side.set}`), code: side.batchCode })
    : t('comparison.side.count');
}

function quantityText(side: ComparisonLine['left']): string {
  if (side.state === 'listed') return String(side.quantity);
  return t(side.state === 'unknown' ? 'comparison.unknown' : 'comparison.not-listed');
}

function amountText(side: ComparisonBalanceLine['left']): string {
  if (side.state === 'listed') return formatPaise(side.paise);
  return t(side.state === 'unknown' ? 'comparison.unknown' : 'comparison.not-listed');
}

function balanceKey(line: ComparisonBalanceLine): string {
  if (line.keyedBy === 'unresolved') return t('comparison.balance.unresolved');
  const account = line.account ?? '';
  return line.keyedBy === 'account'
    ? t('comparison.balance.account-total', { account })
    : `${account} · ${line.party ?? ''}`;
}

function RunLines({ runId }: { runId: string }) {
  const timeZone = useTimeZone();
  const [differencesOnly, setDifferencesOnly] = useState(true);
  const query = useQuery(readQuery(api, 'readComparisonRun', { params: { runId } }));
  return (
    <Card>
      <ListRead query={query} what="comparison.what">
        {(run: ComparisonRunRead) => {
          const lines = differencesOnly ? run.lines.filter((line) => line.result !== 'same') : run.lines;
          const balanceLines = differencesOnly
            ? run.balanceLines.filter((line) => line.result !== 'same')
            : run.balanceLines;
          const rows = [
            ...lines.map((line) => ({
              lineNumber: line.lineNumber,
              key: line.barcode ?? line.skuId ?? t('comparison.unresolved'),
              left: quantityText(line.left),
              right: quantityText(line.right),
              result: line.result,
            })),
            ...balanceLines.map((line) => ({
              lineNumber: line.lineNumber,
              key: balanceKey(line),
              left: amountText(line.left),
              right: amountText(line.right),
              result: line.result,
            })),
          ];
          return (
            <div className="flex flex-col gap-3">
              <h3 className="m-0 text-h3 font-semibold">
                {t(`comparison.run.${run.run}`)} · {sideText(run.left)} · {sideText(run.right)}
              </h3>
              <AsOf asOf={run.asOf} timeZone={timeZone} />
              <label className="flex items-center gap-2 text-body-sm">
                <input
                  type="checkbox"
                  checked={differencesOnly}
                  onChange={(event) => {
                    setDifferencesOnly(event.target.checked);
                  }}
                />
                {t('comparison.differences-only')}
              </label>
              {rows.length === 0 ? (
                <EmptyState title="comparison.lines.empty.title" body="comparison.lines.empty.body" />
              ) : (
                <div className="overflow-x-auto rounded-card border border-border">
                  <table className="w-full border-collapse text-body" aria-label={t('comparison.lines')}>
                    <thead>
                      <tr>
                        <Th label={run.key === 'party-and-account' ? 'comparison.balance.key' : 'comparison.key'} />
                        <Th label="comparison.left" />
                        <Th label="comparison.right" />
                        <Th label="comparison.result" />
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((line) => (
                        <tr key={line.lineNumber} className="h-10 border-t border-border">
                          <td className="px-3 font-mono text-body-sm">{line.key}</td>
                          <td className="px-3">{line.left}</td>
                          <td className="px-3">{line.right}</td>
                          <td className="px-3">{t(`comparison.result.${line.result}`)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        }}
      </ListRead>
    </Card>
  );
}

/** The form of Run a comparison: the run kind, the batches it reads, and the unit counted. */
function RunForm() {
  const today = useBusinessToday();
  const run = useSubmission('runComparison', READS);
  const [kind, setKind] = useState<ComparisonRunKind>('manifest-against-soh');
  const [manifest, setManifest] = useState('');
  const [soh, setSoh] = useState('');
  const [unit, setUnit] = useState('');
  const [balances, setBalances] = useState('');
  const [closedBooks, setClosedBooks] = useState('');
  const manifests = useQuery(readQuery(api, 'importOutcomes', { query: { kind: 'opening-balance' } }));
  const sohs = useQuery(readQuery(api, 'importOutcomes', { query: { kind: 'historical-reference' } }));
  const structure = useQuery(readQuery(api, 'readMasterLists', { query: { date: today } }));
  const units = structure.data?.businessUnits ?? [];
  const counted = units.find((each) => each.id === unit);
  const count = counted === undefined ? undefined : { siteId: counted.siteId, businessUnitId: counted.id };
  const body =
    kind === 'manifest-against-soh'
      ? manifest !== '' && soh !== ''
        ? { run: kind, manifest: { batchId: manifest }, stockOnHand: { batchId: soh } }
        : undefined
      : kind === 'count-against-manifest'
        ? count !== undefined && manifest !== ''
          ? { run: kind, count, manifest: { batchId: manifest } }
          : undefined
        : kind === 'count-against-soh'
          ? count !== undefined && soh !== ''
            ? { run: kind, count, stockOnHand: { batchId: soh } }
            : undefined
          : balances !== '' && closedBooks !== ''
            ? { run: kind, balances: { batchId: balances }, closedBooks: { batchId: closedBooks } }
            : undefined;
  const select = (
    id: string,
    label: Parameters<typeof t>[0],
    value: string,
    options: readonly { value: string; label: string }[],
    onChange: (value: string) => void,
  ) => (
    <label className="flex flex-col gap-1" htmlFor={id}>
      <span className="text-body-sm font-semibold">{t(label)}</span>
      <select
        id={id}
        className={inputClass}
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
        }}
      >
        <option value="">{t('comparison.choose')}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
  const batches = (list: typeof manifests.data) =>
    (list?.batches ?? [])
      .filter((batch) => batch.state !== 'Failed')
      .map((batch) => ({ value: batch.batchId, label: `${batch.code} · ${batch.target}` }));
  return (
    <Card title="comparison.run.title">
      <SubmissionBanner state={run.state} done="comparison.run.done" />
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1" htmlFor="comparison-kind">
          <span className="text-body-sm font-semibold">{t('comparison.kind')}</span>
          <select
            id="comparison-kind"
            className={inputClass}
            value={kind}
            onChange={(event) => {
              setKind(comparisonRunKindSchema.parse(event.target.value));
            }}
          >
            {comparisonRunKindSchema.options.map((each) => (
              <option key={each} value={each}>
                {t(`comparison.run.${each}`)}
              </option>
            ))}
          </select>
        </label>
        {(kind === 'count-against-manifest' || kind === 'count-against-soh') &&
          select(
            'comparison-unit',
            'comparison.unit',
            unit,
            units.map((each) => ({ value: each.id, label: `${each.code} · ${each.name}` })),
            setUnit,
          )}
        {(kind === 'manifest-against-soh' || kind === 'count-against-manifest') &&
          select('comparison-manifest', 'comparison.manifest', manifest, batches(manifests.data), setManifest)}
        {(kind === 'manifest-against-soh' || kind === 'count-against-soh') &&
          select('comparison-soh', 'comparison.soh', soh, batches(sohs.data), setSoh)}
        {kind === 'balances-against-closed-books' &&
          select('comparison-balances', 'comparison.balances', balances, batches(manifests.data), setBalances)}
        {kind === 'balances-against-closed-books' &&
          select('comparison-closed-books', 'comparison.closed-books', closedBooks, batches(sohs.data), setClosedBooks)}
        <GrantedButton
          label="comparison.run"
          recordType={COMPARISON_RUN_TYPE}
          action="create"
          variant="primary"
          onClick={() => {
            if (body !== undefined) void run.submit({ body });
          }}
        />
      </div>
    </Card>
  );
}

export function ComparisonRuns() {
  const timeZone = useTimeZone();
  const [opened, setOpened] = useState<string | null>(null);
  const query = useQuery(readQuery(api, 'listComparisonRuns', {}));
  return (
    <div className="flex flex-col gap-4">
      <RunForm />
      <Card title="comparison.title">
        <ListRead query={query} what="comparison.what">
          {(list) => (
            <div className="flex flex-col gap-3">
              <AsOf asOf={list.asOf} timeZone={timeZone} />
              {list.runs.length === 0 ? (
                <EmptyState title="comparison.empty.title" body="comparison.empty.body" />
              ) : (
                <div className="overflow-x-auto rounded-card border border-border">
                  <table className="w-full border-collapse text-body" aria-label={t('comparison.table')}>
                    <thead>
                      <tr>
                        <Th label="comparison.kind" />
                        <Th label="comparison.left" />
                        <Th label="comparison.right" />
                        <Th label="comparison.ran" />
                        <Th label="comparison.counts" />
                      </tr>
                    </thead>
                    <tbody>
                      {list.runs.map((run) => (
                        <tr key={run.runId} className="h-10 border-t border-border align-top">
                          <td className="px-3">
                            <span className="flex flex-col">
                              <span>{t(`comparison.run.${run.run}`)}</span>
                              <button
                                type="button"
                                className="self-start text-caption text-accent underline"
                                onClick={() => {
                                  setOpened(run.runId);
                                }}
                              >
                                {t('comparison.open')}
                              </button>
                            </span>
                          </td>
                          <td className="px-3 text-body-sm">{sideText(run.left)}</td>
                          <td className="px-3 text-body-sm">{sideText(run.right)}</td>
                          <td className="px-3 text-body-sm">{formatDateTime(run.runAt, timeZone)}</td>
                          <td className="px-3 text-body-sm">
                            {t('comparison.counts.text', {
                              same: run.counts.same,
                              different: run.counts.different,
                              notListed: run.counts['not-listed-left'] + run.counts['not-listed-right'],
                              unknown: run.counts.unknown + run.counts.unresolved,
                            })}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </ListRead>
      </Card>
      {opened !== null && <RunLines key={opened} runId={opened} />}
    </div>
  );
}
