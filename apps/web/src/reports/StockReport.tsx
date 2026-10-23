import {
  STOCK_OWNER_NAMES,
  stockConditionSchema,
  type ReportNames,
  type StockOwner,
  type StockRecordGrn,
  type StockRecords as Records,
  type StockReport as Report,
  type StockReportFilters,
  type StockReportRow,
} from '@apparel-os/schemas';
import { useInfiniteQuery } from '@tanstack/react-query';
import { Fragment, useState } from 'react';
import { api } from '../api';
import { useSubmission } from '../api/command';
import { ApiFailure } from '../api/query';
import { Button } from '../components/Button';
import { AmountInCell, CostInCell, numberCell, UnknownInCell } from '../components/cells';
import { EmptyState } from '../components/StandardStates';
import { AsOf } from '../history/AsOf';
import { t } from '../messages/catalogue';
import { optionText } from '../receiving/names';
import { formatQuantity } from '../setup/format';
import { ListRead, SubmissionBanner, Th, Toolbar } from '../setup/parts';
import { useTimeZone } from '../shell/session';
import { productDetail, productText } from '../stock/results';
import { StockRecords } from '../stock/StockRecords';
import { useFilterLists } from '../stock/StockSearchScreen';
import { ArrivalDrill, cell, FilterSelect, GrnLinks, nameIn, saveFile } from './parts';

// Reports › Stock (goods-in 9.2, 9.3, 9.5, section 11; PRD-PRO-001, PRD-ORG-015, PRD-ACS-008; S2-F11-T02): stock by
// product, size, location, condition and owner, with the quantities of stock search apart, the MRP value for everyone
// and the cost only for whoever may see it, Hidden otherwise; a blank cell read as unknown while goods have no PT
// (design-language 8; PRD-MOD-015); the time read; a row opens the GRNs its pieces were counted on and the records
// behind its figures, its PT and its movements (the drill-down, goods-in 9.1); Load more; Export to XLSX, which records
// the access when it carries cost.

async function readPage(filters: StockReportFilters, after: string | undefined): Promise<Report> {
  const result = await api.call('readStockReport', {
    query: { ...filters, ...(after === undefined ? {} : { after }) },
  });
  if (result.ok) return result.data;
  throw new ApiFailure(result.status, result.error);
}

/**
 * The owner of a row's goods (goods-in 9.3; PRD-ORG-015), its party named from the list `STOCK_OWNER_NAMES` says; a
 * blank cell read as unknown while Unknown.
 */
function Owner({ names, owner }: { names: ReportNames; owner: StockOwner }) {
  if (owner.kind === 'unknown') return <UnknownInCell />;
  const name = nameIn(names[STOCK_OWNER_NAMES[owner.kind]], owner.partyId);
  return <>{t(`report.stock.owner.${owner.kind}`, { name })}</>;
}

function Row({
  row,
  names,
  onGrn,
}: {
  row: StockReportRow;
  names: ReportNames;
  onGrn: (grn: StockRecordGrn, places: Pick<ReportNames, 'businessUnits' | 'locations'>) => void;
}) {
  const detail = productDetail(row.product);
  const [records, setRecords] = useState(false);
  return (
    <Fragment>
      <tr>
        <td className={cell}>
          <span className="flex flex-col">
            <span className="font-semibold">{productText(row.product)}</span>
            {detail !== null && <span className="text-caption text-text-2">{detail}</span>}
            {row.frozen && <span className="text-caption text-text-2">{t('stock-search.frozen')}</span>}
          </span>
        </td>
        <td className={cell}>{nameIn(names.brands, row.brandId)}</td>
        <td className={cell}>
          {t('stock-search.place', {
            site: nameIn(names.sites, row.siteId),
            unit: nameIn(names.businessUnits, row.businessUnitId),
            location: nameIn(names.locations, row.locationId),
          })}
        </td>
        <td className={cell}>{t(`condition.${row.condition}`)}</td>
        <td className={cell}>
          <Owner names={names} owner={row.owner} />
        </td>
        <td className={`${cell} ${numberCell}`}>{formatQuantity(row.physical)}</td>
        <td className={cell}>
          <span className="flex flex-col">
            <span className="tabular-nums">{formatQuantity(row.available)}</span>
            <span className="text-caption text-text-2">{t(`stock-search.available.${row.availableAs}`)}</span>
          </span>
        </td>
        <td className={`${cell} ${numberCell}`}>{formatQuantity(row.waiting)}</td>
        <td className={cell}>
          <span className="flex flex-col">
            <span className="tabular-nums">{formatQuantity(row.held)}</span>
            {row.heldByKind.map((each) => (
              <span key={each.kind} className="text-caption text-text-2">
                {t('stock-search.held.kind', {
                  kind: t(`hold-kind.${each.kind}`),
                  count: formatQuantity(each.quantity),
                })}
              </span>
            ))}
          </span>
        </td>
        <td className={`${cell} ${numberCell}`}>
          <AmountInCell amount={row.mrpValue} />
        </td>
        <td className={`${cell} ${numberCell}`}>
          <CostInCell cost={row.cost} />
        </td>
        <td className={cell}>
          <span className="flex flex-col gap-2">
            <GrnLinks
              names={names}
              grnIds={row.grnIds}
              onOpen={(grn) => {
                onGrn(grn, names);
              }}
            />
            <span>
              <Button
                size="small"
                label={records ? 'stock-search.records.close' : 'stock-search.records.open'}
                onClick={() => {
                  setRecords(!records);
                }}
              />
            </span>
          </span>
        </td>
      </tr>
      {records && (
        <tr>
          <td className={cell} colSpan={12}>
            <StockRecords of={{ of: 'report', key: row.rowKey }} onGrn={onGrn} />
          </td>
        </tr>
      )}
    </Fragment>
  );
}

/**
 * The report as an XLSX file, as shown (goods-in 9.1): a command, since with cost it is an export of a restricted field,
 * which the server records (goods-in 9.5); its refusal shown with its reason.
 */
function StockExportButton({ filters }: { filters: StockReportFilters }) {
  const submission = useSubmission('exportStockReport', []);
  const pending = submission.state.kind === 'pending';
  return (
    <span className="inline-flex flex-col gap-2">
      <Button
        label="report.export"
        disabled={pending}
        {...(pending ? { reason: 'report.export.pending' as const } : {})}
        onClick={() => {
          void (async () => {
            const file = await submission.submit({ body: filters });
            if (file === undefined) return;
            saveFile(file);
            // A new key for the next export: an export's answer is never kept (code-house-rules 12.4).
            submission.reset();
          })();
        }}
      />
      {submission.state.kind === 'refused' && <SubmissionBanner state={submission.state} />}
    </span>
  );
}

/** Reports › Stock. Rows are read a page at a time; Load more reads the next (code-house-rules 12.1). */
export function StockReportScreen() {
  const timeZone = useTimeZone();
  const lists = useFilterLists();
  const [filters, setFilters] = useState<StockReportFilters>({});
  const [open, setOpen] = useState<{ grn: StockRecordGrn; places: Records['places'] } | null>(null);
  const query = useInfiniteQuery({
    queryKey: ['readStockReport', 'pages', filters],
    queryFn: ({ pageParam }) => readPage(filters, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last: Report) => last.next ?? undefined,
  });
  const set = (field: keyof StockReportFilters) => (value: string | undefined) => {
    setFilters({
      ...filters,
      [field]: value,
      // A narrower place belongs to the wider one chosen.
      ...(field === 'siteId' ? { businessUnitId: undefined, locationId: undefined } : {}),
      ...(field === 'businessUnitId' ? { locationId: undefined } : {}),
    });
  };
  const options = (records: readonly Parameters<typeof optionText>[0][]) =>
    records.map((record) => ({ value: record.id, text: optionText(record) }));
  if (open !== null) {
    return (
      <ArrivalDrill
        grn={open.grn}
        places={open.places}
        onBack={() => {
          setOpen(null);
        }}
      />
    );
  }
  return (
    <div className="flex flex-col gap-4">
      <Toolbar>
        <span className="flex-1" />
        <StockExportButton filters={filters} />
      </Toolbar>
      <p className="m-0 text-body-sm text-text-2">{t('report.stock.intro')}</p>
      <div className="grid gap-3 sm:grid-cols-5" role="search" aria-label={t('report.filters')}>
        <FilterSelect
          id="report-stock-brand"
          label="report.filter.brand"
          value={filters.brandId}
          options={options(lists.brands)}
          onChange={set('brandId')}
        />
        <FilterSelect
          id="report-stock-site"
          label="report.filter.site"
          value={filters.siteId}
          options={options(lists.sites)}
          onChange={set('siteId')}
        />
        <FilterSelect
          id="report-stock-unit"
          label="report.filter.unit"
          value={filters.businessUnitId}
          options={options(
            lists.units.filter((unit) => filters.siteId === undefined || unit.siteId === filters.siteId),
          )}
          onChange={set('businessUnitId')}
        />
        <FilterSelect
          id="report-stock-location"
          label="report.filter.location"
          value={filters.locationId}
          options={options(
            lists.locations.filter(
              (location) =>
                (filters.siteId === undefined || location.siteId === filters.siteId) &&
                (filters.businessUnitId === undefined || location.businessUnitId === filters.businessUnitId),
            ),
          )}
          onChange={set('locationId')}
        />
        <FilterSelect
          id="report-stock-condition"
          label="report.filter.condition"
          value={filters.condition}
          options={stockConditionSchema.options.map((condition) => ({
            value: condition,
            text: t(`condition.${condition}`),
          }))}
          onChange={(value) => {
            setFilters({ ...filters, condition: stockConditionSchema.safeParse(value).data });
          }}
        />
      </div>
      <ListRead query={query} what="report.stock.what">
        {({ pages }) => {
          const asOf = pages[0]?.asOf;
          const rows = pages.flatMap((page) => page.rows.map((row) => ({ row, names: page.names })));
          return (
            <div className="flex flex-col gap-3">
              <div className="flex justify-end">{asOf !== undefined && <AsOf asOf={asOf} timeZone={timeZone} />}</div>
              {rows.length === 0 ? (
                <EmptyState title="report.stock.empty.title" body="report.stock.empty.body" />
              ) : (
                <div className="overflow-x-auto rounded-card border border-border bg-surface">
                  <table className="w-full border-collapse text-body" aria-label={t('report.stock.table')}>
                    <thead>
                      <tr>
                        <Th label="stock-search.column.goods" />
                        <Th label="stock-search.column.brand" />
                        <Th label="stock-search.column.place" />
                        <Th label="report.stock.column.condition" />
                        <Th label="report.stock.column.owner" />
                        <Th label="stock-search.column.physical" />
                        <Th label="stock-search.column.available" />
                        <Th label="stock-search.column.waiting" />
                        <Th label="stock-search.column.held" />
                        <Th label="report.stock.column.mrp" />
                        <Th label="stock-search.column.cost" />
                        <Th label="report.stock.column.grns" />
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map(({ row, names }) => (
                        <Row
                          key={row.rowKey}
                          row={row}
                          names={names}
                          onGrn={(grn, places) => {
                            setOpen({ grn, places });
                          }}
                        />
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
    </div>
  );
}
