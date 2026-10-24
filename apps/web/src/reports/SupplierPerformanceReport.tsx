import type {
  ReportNames,
  SupplierPerformanceFilters,
  SupplierPerformanceReport as Report,
  SupplierPerformanceRow,
} from '@apparel-os/schemas';
import { useQuery } from '@tanstack/react-query';
import { Fragment, useState } from 'react';
import { BookingView } from '../booking/BookingView';
import { api } from '../api';
import { readQuery } from '../api/query';
import { useBookingNames } from '../booking/names';
import { Button } from '../components/Button';
import { EmptyState } from '../components/StandardStates';
import { AsOf } from '../history/AsOf';
import { t } from '../messages/catalogue';
import { optionText, unknownText } from '../receiving/names';
import { formatDate, formatQuantity } from '../setup/format';
import { ListRead, Th, Toolbar } from '../setup/parts';
import { useTimeZone } from '../shell/session';
import { ArrivalDrill, cell, ExportButton, FilterSelect, GrnLinks, nameIn, RateInCell } from './parts';

// Reports › Supplier performance (goods-in 9.3, 9.5, section 11; PRD-BKG-011, PRD-EXC-009; S2-F11-T02): per supplier,
// brand and season, the fill rate, the on-time delivery and the damage rate, each with the whole numbers it is worked
// from and its definition beside the table, a blank cell read as unknown where it has no measure (design-language 8;
// PRD-MOD-015), with the time read and the business date the windows are compared with. Each figure drills down to the
// records it is worked from (goods-in 9.1): the fill rate to its bookings, the on-time and damage rates to their GRNs,
// each opening where it is kept; Export to XLSX.

/** What the screen opens from a figure's records: a booking, or the Arrival a GRN was issued from. */
type Drill =
  | { readonly kind: 'booking'; readonly bookingId: string }
  | { readonly kind: 'grn'; readonly grn: ReportNames['grns'][number]; readonly places: ReportNames };

function seasonText(report: Report, row: SupplierPerformanceRow): string {
  return row.season.kind === 'value' ? nameIn(report.names.seasons, row.season.seasonValueId) : unknownText();
}

/** The records each figure of a row is worked from (goods-in 9.1), each opening where it is kept. */
function Records({
  row,
  names,
  onDrill,
}: {
  row: SupplierPerformanceRow;
  names: ReportNames;
  onDrill: (drill: Drill) => void;
}) {
  const grns = (grnIds: readonly string[]) =>
    grnIds.length === 0 ? (
      t('report.supplier.records.none')
    ) : (
      <GrnLinks
        names={names}
        grnIds={grnIds}
        onOpen={(grn) => {
          onDrill({ kind: 'grn', grn, places: names });
        }}
      />
    );
  return (
    <dl className="m-0 grid grid-cols-[max-content_1fr] gap-x-4 gap-y-2 text-body-sm">
      <dt className="text-text-2">{t('report.supplier.records.fill')}</dt>
      <dd className="m-0 flex flex-wrap gap-2">
        {row.records.bookings.length === 0
          ? t('report.supplier.records.none')
          : row.records.bookings.map((booking) => (
              <button
                key={booking.bookingId}
                type="button"
                className="text-accent underline"
                onClick={() => {
                  onDrill({ kind: 'booking', bookingId: booking.bookingId });
                }}
              >
                {booking.number}
              </button>
            ))}
      </dd>
      <dt className="text-text-2">{t('report.supplier.records.on-time')}</dt>
      <dd className="m-0">{grns(row.records.timedGrnIds)}</dd>
      <dt className="text-text-2">{t('report.supplier.records.damage')}</dt>
      <dd className="m-0">{grns(row.records.countedGrnIds)}</dd>
    </dl>
  );
}

/** A rate in a row's cell, with the whole numbers it is worked from. */
function RateFigure({ rate, children }: { rate: SupplierPerformanceRow['fill']['rate']; children: React.ReactNode }) {
  return (
    <span className="flex flex-col">
      <span className="text-right font-semibold tabular-nums">
        <RateInCell rate={rate} />
      </span>
      {children}
    </span>
  );
}

function Rows({ report, onDrill }: { report: Report; onDrill: (drill: Drill) => void }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <div className="overflow-x-auto rounded-card border border-border bg-surface">
      <table className="w-full border-collapse text-body" aria-label={t('report.supplier.table')}>
        <thead>
          <tr>
            <Th label="report.supplier.column.supplier" />
            <Th label="report.supplier.column.season" />
            <Th label="report.supplier.column.fill" />
            <Th label="report.supplier.column.on-time" />
            <Th label="report.supplier.column.damage" />
            <Th label="report.supplier.column.records" />
          </tr>
        </thead>
        <tbody>
          {report.rows.map((row) => {
            const key = JSON.stringify([
              row.supplierPartyId,
              row.brandId,
              row.season.kind === 'value' ? row.season.seasonValueId : null,
            ]);
            return (
              <Fragment key={key}>
                <tr>
                  <td className={cell}>
                    <span className="flex flex-col">
                      <span>{nameIn(report.names.suppliers, row.supplierPartyId)}</span>
                      <span className="text-caption text-text-2">{nameIn(report.names.brands, row.brandId)}</span>
                    </span>
                  </td>
                  <td className={cell}>{seasonText(report, row)}</td>
                  <td className={cell}>
                    <RateFigure rate={row.fill.rate}>
                      <span className="text-caption text-text-2">
                        {t('report.supplier.fill.of', {
                          delivered: formatQuantity(row.fill.delivered),
                          ordered: formatQuantity(row.fill.ordered),
                          bookings: formatQuantity(row.fill.bookings),
                        })}
                      </span>
                    </RateFigure>
                  </td>
                  <td className={cell}>
                    <RateFigure rate={row.timeliness.rate}>
                      <span className="text-caption text-text-2">
                        {t('report.supplier.on-time.of', {
                          onTime: formatQuantity(row.timeliness.onTime),
                          delivered: formatQuantity(row.timeliness.delivered),
                          late: formatQuantity(row.timeliness.late),
                        })}
                      </span>
                      {row.timeliness.unknown > 0 && (
                        <span className="text-caption text-text-2">
                          {t('report.supplier.on-time.unknown', { count: formatQuantity(row.timeliness.unknown) })}
                        </span>
                      )}
                    </RateFigure>
                  </td>
                  <td className={cell}>
                    <RateFigure rate={row.damage.rate}>
                      <span className="text-caption text-text-2">
                        {t('report.supplier.damage.of', {
                          damaged: formatQuantity(row.damage.damaged),
                          counted: formatQuantity(row.damage.counted),
                        })}
                      </span>
                      {row.damage.unknown > 0 && (
                        <span className="text-caption text-text-2">
                          {t('report.supplier.damage.unknown', { count: formatQuantity(row.damage.unknown) })}
                        </span>
                      )}
                    </RateFigure>
                  </td>
                  <td className={cell}>
                    <Button
                      size="small"
                      label={open === key ? 'report.supplier.records.close' : 'report.supplier.records.open'}
                      onClick={() => {
                        setOpen(open === key ? null : key);
                      }}
                    />
                  </td>
                </tr>
                {open === key && (
                  <tr>
                    <td className={cell} colSpan={6}>
                      <Records row={row} names={report.names} onDrill={onDrill} />
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** The definitions of the three metrics, beside the table (goods-in 9.3, 9.5; PRD-EXC-009). */
function Definitions({ report }: { report: Report }) {
  return (
    <dl className="m-0 grid gap-1 text-body-sm text-text-2">
      <dt className="font-semibold">{t('report.supplier.column.fill')}</dt>
      <dd className="m-0">{t('report.supplier.definition.fill', { date: formatDate(report.businessDate) })}</dd>
      <dt className="font-semibold">{t('report.supplier.column.on-time')}</dt>
      <dd className="m-0">{t('report.supplier.definition.on-time')}</dd>
      <dt className="font-semibold">{t('report.supplier.column.damage')}</dt>
      <dd className="m-0">{t('report.supplier.definition.damage')}</dd>
    </dl>
  );
}

/** Reports › Supplier performance. */
export function SupplierPerformanceScreen() {
  const timeZone = useTimeZone();
  const names = useBookingNames();
  const [filters, setFilters] = useState<SupplierPerformanceFilters>({});
  const [drill, setDrill] = useState<Drill | null>(null);
  const query = useQuery(readQuery(api, 'readSupplierPerformanceReport', { query: filters }));
  const set = (field: keyof SupplierPerformanceFilters) => (value: string | undefined) => {
    setFilters({ ...filters, [field]: value });
  };
  const options = (records: readonly Parameters<typeof optionText>[0][]) =>
    records.map((record) => ({ value: record.id, text: optionText(record) }));
  const back = () => {
    setDrill(null);
  };
  if (drill?.kind === 'booking') return <BookingView bookingId={drill.bookingId} onBack={back} />;
  if (drill?.kind === 'grn') return <ArrivalDrill grn={drill.grn} places={drill.places} onBack={back} />;
  return (
    <div className="flex flex-col gap-4">
      <Toolbar>
        <span className="flex-1" />
        <ExportButton fetchFile={() => api.call('exportSupplierPerformanceReport', { query: filters })} />
        <Button
          label="setup.refresh"
          onClick={() => {
            void query.refetch();
          }}
        />
      </Toolbar>
      <p className="m-0 text-body-sm text-text-2">{t('report.supplier.intro')}</p>
      <div className="grid gap-3 sm:grid-cols-3" role="search" aria-label={t('report.filters')}>
        <FilterSelect
          id="report-supplier-supplier"
          label="report.filter.supplier"
          value={filters.supplierPartyId}
          options={options(names.suppliers)}
          onChange={set('supplierPartyId')}
        />
        <FilterSelect
          id="report-supplier-brand"
          label="report.filter.brand"
          value={filters.brandId}
          options={options(names.brands)}
          onChange={set('brandId')}
        />
        <FilterSelect
          id="report-supplier-season"
          label="report.filter.season"
          value={filters.seasonValueId}
          options={options(names.seasons)}
          onChange={set('seasonValueId')}
        />
      </div>
      <ListRead query={query} what="report.supplier.what">
        {(report) => (
          <div className="flex flex-col gap-3">
            <div className="flex justify-end">
              <AsOf asOf={report.asOf} timeZone={timeZone} />
            </div>
            {report.rows.length === 0 ? (
              <EmptyState title="report.supplier.empty.title" body="report.supplier.empty.body" />
            ) : (
              <Rows report={report} onDrill={setDrill} />
            )}
            <Definitions report={report} />
          </div>
        )}
      </ListRead>
    </div>
  );
}
