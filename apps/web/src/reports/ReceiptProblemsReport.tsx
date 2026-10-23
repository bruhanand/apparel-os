import type {
  ReceiptProblemRow,
  ReceiptProblemsFilters,
  ReceiptProblemsReport as Report,
  ReportNames,
} from '@apparel-os/schemas';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../api';
import { ApiFailure } from '../api/query';
import { useBookingNames } from '../booking/names';
import { Button } from '../components/Button';
import { EmptyState } from '../components/StandardStates';
import { StatusBadge } from '../components/StatusBadge';
import { FormField } from '../forms/FormField';
import { AsOf } from '../history/AsOf';
import { formatDateTime } from '../history/format';
import { t } from '../messages/catalogue';
import { optionText, unknownText } from '../receiving/names';
import { formatDate, formatList, formatQuantity } from '../setup/format';
import { inputClass, ListRead, Th, Toolbar } from '../setup/parts';
import { stateIdOf } from '../setup/states';
import { useTimeZone } from '../shell/session';
import { ArrivalDrill, cell, ExportButton, FilterSelect, nameIn, personIn } from './parts';

// Reports › Receipt problems (goods-in 4.4, 4.9, 9.3, 9.5, section 11; PRD-REC-006; S2-F11-T02): per GRN and line,
// shortage, excess, wrong, unidentified and damage, each with its decision and who made it, by Site, supplier, brand
// and the GRN's dates, with the time it was read; a GRN opens the Arrival it was issued from (the drill-down, goods-in
// 9.1); Load more; Export to XLSX. A damage report the person may not see is Unknown (PRD-MOD-015). Also shown, its
// filters fixed, for a row of the supplier report.

async function readPage(filters: ReceiptProblemsFilters, after: string | undefined): Promise<Report> {
  const result = await api.call('readReceiptProblemsReport', {
    query: { ...filters, ...(after === undefined ? {} : { after }) },
  });
  if (result.ok) return result.data;
  throw new ApiFailure(result.status, result.error);
}

/** The goods of a line: by style, colour and size as counted, or what unidentified goods look like. */
function goodsText(line: ReceiptProblemRow['line']): string {
  if (line.goods === 'unidentified')
    return t('report.problems.unidentified-goods', { description: line.description ?? unknownText() });
  return t('report.booking.line', {
    style: line.styleCode ?? unknownText(),
    colour: line.colour ?? t('report.none'),
    size: line.size ?? t('report.none'),
  });
}

/** The findings of a line as the count recorded them, or as recounted (goods-in 4.4, 4.11). */
function findingsText(line: ReceiptProblemRow['line']): string {
  const findings = line.recounted?.findings ?? line.findings;
  const parts = [
    ...(findings.shortage > 0 ? [t('report.problems.short', { count: formatQuantity(findings.shortage) })] : []),
    ...(findings.extra > 0
      ? [
          t(line.goods === 'on-invoice' ? 'report.problems.excess' : `report.problems.${line.goods}`, {
            count: formatQuantity(findings.extra),
          }),
        ]
      : []),
    ...(line.extra === 'not-received' ? [t('report.problems.not-received')] : []),
    ...(findings.damaged > 0 ? [t('report.problems.damaged', { count: formatQuantity(findings.damaged) })] : []),
  ];
  return formatList(parts);
}

function HeldDecision({ row, names, timeZone }: { row: ReceiptProblemRow; names: ReportNames; timeZone: string }) {
  const held = row.line.heldLine;
  if (held === null) return null;
  return (
    <span className="flex flex-col gap-1">
      <StatusBadge state={stateIdOf(held.state)} />
      {held.decision !== null && (
        <span className="text-caption text-text-2">
          {t('report.decided', {
            person: personIn(names, held.decision.decidedBy),
            time: formatDateTime(held.decision.decidedAt, timeZone),
          })}
        </span>
      )}
    </span>
  );
}

function DamageDecision({ row, names, timeZone }: { row: ReceiptProblemRow; names: ReportNames; timeZone: string }) {
  const report = row.damageReport;
  if (report === null) return null;
  if (report.kind === 'unknown') return <span>{unknownText()}</span>;
  return (
    <span className="flex flex-col gap-1">
      <span>{report.number}</span>
      <StatusBadge state={stateIdOf(report.state)} />
      {report.decision !== null && (
        <span className="text-caption text-text-2">
          {t('report.decided', {
            person: personIn(names, report.decision.decidedBy),
            time: formatDateTime(report.decision.decidedAt, timeZone),
          })}
        </span>
      )}
    </span>
  );
}

/** The report's table and pages, for the filters given. */
export function ReceiptProblemsTable({ filters }: { filters: ReceiptProblemsFilters }) {
  const timeZone = useTimeZone();
  const [open, setOpen] = useState<ReportNames['grns'][number] | null>(null);
  const query = useInfiniteQuery({
    queryKey: ['readReceiptProblemsReport', 'pages', filters],
    queryFn: ({ pageParam }) => readPage(filters, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last: Report) => last.next ?? undefined,
  });
  if (open !== null) {
    return (
      <ArrivalDrill
        grn={open}
        onBack={() => {
          setOpen(null);
        }}
      />
    );
  }
  return (
    <ListRead query={query} what="report.problems.what">
      {({ pages }) => {
        const asOf = pages[0]?.asOf;
        const rows = pages.flatMap((page) => page.rows.map((row) => ({ row, names: page.names })));
        return (
          <div className="flex flex-col gap-3">
            <div className="flex justify-end">{asOf !== undefined && <AsOf asOf={asOf} timeZone={timeZone} />}</div>
            {rows.length === 0 ? (
              <EmptyState title="report.problems.empty.title" body="report.problems.empty.body" />
            ) : (
              <div className="overflow-x-auto rounded-card border border-border bg-surface">
                <table className="w-full border-collapse text-body" aria-label={t('report.problems.table')}>
                  <thead>
                    <tr>
                      <Th label="report.problems.column.grn" />
                      <Th label="report.problems.column.supplier" />
                      <Th label="report.problems.column.goods" />
                      <Th label="report.problems.column.counted" />
                      <Th label="report.problems.column.findings" />
                      <Th label="report.problems.column.held" />
                      <Th label="report.problems.column.damage" />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(({ row, names }) => (
                      <tr key={row.line.id}>
                        <td className={cell}>
                          <span className="flex flex-col">
                            <button
                              type="button"
                              className="text-left text-accent underline"
                              onClick={() => {
                                setOpen({
                                  grnId: row.grnId,
                                  number: row.grnNumber,
                                  arrivalId: row.arrivalId,
                                  siteId: row.siteId,
                                });
                              }}
                            >
                              {row.grnNumber}
                            </button>
                            <span className="text-caption text-text-2">
                              {t('report.problems.grn-of', {
                                date: formatDate(row.businessDate),
                                site: nameIn(names.sites, row.siteId),
                              })}
                            </span>
                          </span>
                        </td>
                        <td className={cell}>
                          <span className="flex flex-col">
                            <span>{nameIn(names.suppliers, row.supplierPartyId)}</span>
                            <span className="text-caption text-text-2">{nameIn(names.brands, row.brandId)}</span>
                          </span>
                        </td>
                        <td className={cell}>{goodsText(row.line)}</td>
                        <td className={`${cell} tabular-nums`}>
                          {t('report.problems.counted', {
                            invoiced: formatQuantity(row.line.invoiceQuantity),
                            counted: formatQuantity(row.line.recounted?.countedQuantity ?? row.line.countedQuantity),
                          })}
                        </td>
                        <td className={cell}>{findingsText(row.line)}</td>
                        <td className={cell}>
                          <HeldDecision row={row} names={names} timeZone={timeZone} />
                        </td>
                        <td className={cell}>
                          <DamageDecision row={row} names={names} timeZone={timeZone} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {query.hasNextPage && (
              <div>
                <Button
                  label="report.more"
                  disabled={query.isFetchingNextPage}
                  onClick={() => {
                    void query.fetchNextPage();
                  }}
                />
              </div>
            )}
          </div>
        );
      }}
    </ListRead>
  );
}

/** Reports › Receipt problems. */
export function ReceiptProblemsScreen() {
  const names = useBookingNames();
  const [filters, setFilters] = useState<ReceiptProblemsFilters>({});
  const set = (field: keyof ReceiptProblemsFilters) => (value: string | undefined) => {
    setFilters({ ...filters, [field]: value === '' ? undefined : value });
  };
  const options = (records: readonly Parameters<typeof optionText>[0][]) =>
    records.map((record) => ({ value: record.id, text: optionText(record) }));
  const date = (field: 'from' | 'to', label: 'report.filter.from' | 'report.filter.to') => (
    <FormField id={`report-problems-${field}`} label={label}>
      <input
        id={`report-problems-${field}`}
        type="date"
        className={inputClass}
        value={filters[field] ?? ''}
        onChange={(event) => {
          set(field)(event.target.value);
        }}
      />
    </FormField>
  );
  return (
    <div className="flex flex-col gap-4">
      <Toolbar>
        <span className="flex-1" />
        <ExportButton fetchFile={() => api.call('exportReceiptProblemsReport', { query: filters })} />
      </Toolbar>
      <p className="m-0 text-body-sm text-text-2">{t('report.problems.intro')}</p>
      <div className="grid gap-3 sm:grid-cols-5" role="search" aria-label={t('report.filters')}>
        <FilterSelect
          id="report-problems-site"
          label="report.filter.site"
          value={filters.siteId}
          options={options(names.sites)}
          onChange={set('siteId')}
        />
        <FilterSelect
          id="report-problems-supplier"
          label="report.filter.supplier"
          value={filters.supplierPartyId}
          options={options(names.suppliers)}
          onChange={set('supplierPartyId')}
        />
        <FilterSelect
          id="report-problems-brand"
          label="report.filter.brand"
          value={filters.brandId}
          options={options(names.brands)}
          onChange={set('brandId')}
        />
        {date('from', 'report.filter.from')}
        {date('to', 'report.filter.to')}
      </div>
      <ReceiptProblemsTable filters={filters} />
    </div>
  );
}
