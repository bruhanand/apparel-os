import type {
  SupplierPerformanceFilters,
  SupplierPerformanceReport as Report,
  SupplierPerformanceRow,
} from '@apparel-os/schemas';
import { useQuery } from '@tanstack/react-query';
import { Fragment, useState } from 'react';
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
import { BookingStatusTable } from './BookingStatusReport';
import { cell, ExportButton, FilterSelect, nameIn, rateText } from './parts';
import { ReceiptProblemsTable } from './ReceiptProblemsReport';

// Reports › Supplier performance (goods-in 9.3, 9.5, section 11; PRD-BKG-011, PRD-EXC-009; S2-F11-T02): per supplier,
// brand and season, the fill rate, the on-time delivery and the damage rate, each with the whole numbers it is worked
// from and its definition beside the table, Unknown where it has no measure (PRD-MOD-015), with the time read and the
// business date the windows are compared with. A row drills down to its bookings, in the booking status, and to its
// GRNs' problems, in the receipt problems (goods-in 9.1); Export to XLSX.

interface Drill {
  readonly row: SupplierPerformanceRow;
  readonly what: 'bookings' | 'problems';
}

function seasonText(report: Report, row: SupplierPerformanceRow): string {
  return row.season.kind === 'value' ? nameIn(report.names.seasons, row.season.seasonValueId) : unknownText();
}

function Rows({ report, onDrill }: { report: Report; onDrill: (drill: Drill) => void }) {
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
          {report.rows.map((row) => (
            <tr
              key={`${row.supplierPartyId}|${row.brandId}|${row.season.kind === 'value' ? row.season.seasonValueId : ''}`}
            >
              <td className={cell}>
                <span className="flex flex-col">
                  <span>{nameIn(report.names.suppliers, row.supplierPartyId)}</span>
                  <span className="text-caption text-text-2">{nameIn(report.names.brands, row.brandId)}</span>
                </span>
              </td>
              <td className={cell}>{seasonText(report, row)}</td>
              <td className={cell}>
                <span className="flex flex-col">
                  <span className="font-semibold tabular-nums">{rateText(row.fill.rate)}</span>
                  <span className="text-caption text-text-2">
                    {t('report.supplier.fill.of', {
                      delivered: formatQuantity(row.fill.delivered),
                      ordered: formatQuantity(row.fill.ordered),
                      bookings: formatQuantity(row.fill.bookings),
                    })}
                  </span>
                </span>
              </td>
              <td className={cell}>
                <span className="flex flex-col">
                  <span className="font-semibold tabular-nums">{rateText(row.timeliness.rate)}</span>
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
                </span>
              </td>
              <td className={cell}>
                <span className="flex flex-col">
                  <span className="font-semibold tabular-nums">{rateText(row.damage.rate)}</span>
                  <span className="text-caption text-text-2">
                    {t('report.supplier.damage.of', {
                      damaged: formatQuantity(row.damage.damaged),
                      counted: formatQuantity(row.damage.counted),
                    })}
                  </span>
                </span>
              </td>
              <td className={cell}>
                <span className="flex flex-wrap gap-2">
                  {row.season.kind === 'value' && (
                    <Button
                      size="small"
                      label="report.supplier.open-bookings"
                      onClick={() => {
                        onDrill({ row, what: 'bookings' });
                      }}
                    />
                  )}
                  <Button
                    size="small"
                    label="report.supplier.open-problems"
                    onClick={() => {
                      onDrill({ row, what: 'problems' });
                    }}
                  />
                </span>
              </td>
            </tr>
          ))}
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
  if (drill !== null) {
    const { row } = drill;
    return (
      <div className="flex flex-col gap-4">
        <Toolbar>
          <Button
            label="report.back"
            onClick={() => {
              setDrill(null);
            }}
          />
        </Toolbar>
        {drill.what === 'bookings' && row.season.kind === 'value' ? (
          <Fragment>
            <h2 className="text-h2 font-semibold">{t('report.supplier.bookings-of')}</h2>
            <BookingStatusTable
              filters={{
                supplierPartyId: row.supplierPartyId,
                brandId: row.brandId,
                seasonValueId: row.season.seasonValueId,
              }}
            />
          </Fragment>
        ) : (
          <Fragment>
            <h2 className="text-h2 font-semibold">{t('report.supplier.problems-of')}</h2>
            <ReceiptProblemsTable filters={{ supplierPartyId: row.supplierPartyId, brandId: row.brandId }} />
          </Fragment>
        )}
      </div>
    );
  }
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
