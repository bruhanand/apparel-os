import {
  bookingInForceStateSchema,
  type BookingStatusFilters,
  type BookingStatusReport as Report,
  type ReportNames,
} from '@apparel-os/schemas';
import { useInfiniteQuery } from '@tanstack/react-query';
import { Fragment, useState } from 'react';
import { api } from '../api';
import { ApiFailure } from '../api/query';
import { BookingView } from '../booking/BookingView';
import { useBookingNames } from '../booking/names';
import { Button } from '../components/Button';
import { EmptyState } from '../components/StandardStates';
import { StatusBadge } from '../components/StatusBadge';
import { AsOf } from '../history/AsOf';
import { t } from '../messages/catalogue';
import { optionText } from '../receiving/names';
import { formatDate, formatQuantity } from '../setup/format';
import { ListRead, Th, Toolbar } from '../setup/parts';
import { stateIdOf } from '../setup/states';
import { useTimeZone } from '../shell/session';
import { ArrivalDrill, cell, ExportButton, FilterSelect, GrnLinks, nameIn } from './parts';

// Reports › Booking status (goods-in 3.6, 3.10, 9.3, 9.5, section 11; PRD-BKG-005; S2-F11-T02): per booking and line,
// ordered, delivered, cancelled, outstanding and overdue, by brand, season, supplier, destination and state, with the
// time it was read; a booking opens where it is kept, and its delivered pieces open the GRNs they came from (the
// drill-down, goods-in 9.1); Load more; Export to XLSX. Also shown, its filters fixed, for a row of the supplier report.

async function readPage(filters: BookingStatusFilters, after: string | undefined): Promise<Report> {
  const result = await api.call('readBookingStatusReport', {
    query: { ...filters, ...(after === undefined ? {} : { after }) },
  });
  if (result.ok) return result.data;
  throw new ApiFailure(result.status, result.error);
}

function BookingRows({
  booking,
  names,
  onBooking,
  onGrn,
}: {
  booking: Report['bookings'][number];
  names: ReportNames;
  onBooking: () => void;
  onGrn: (grn: ReportNames['grns'][number]) => void;
}) {
  return (
    <Fragment>
      <tr className="bg-sunken">
        <td className={cell} colSpan={9}>
          <span className="flex flex-wrap items-center gap-3">
            <button type="button" className="font-semibold text-accent underline" onClick={onBooking}>
              {booking.number}
            </button>
            <StatusBadge state={stateIdOf(booking.state)} />
            <span>
              {t('report.booking.header', {
                brand: nameIn(names.brands, booking.brandId),
                season: nameIn(names.seasons, booking.seasonValueId),
                supplier: nameIn(names.suppliers, booking.supplierPartyId),
                destination: nameIn(names.sites, booking.destinationSiteId),
              })}
            </span>
            <span className="text-text-2">
              {t('booking.window.range', {
                from: formatDate(booking.status.deliveryWindow.from),
                to: formatDate(booking.status.deliveryWindow.to),
              })}
            </span>
          </span>
        </td>
      </tr>
      {booking.status.lines.map((line) => (
        <tr key={line.lineKey}>
          <td className={cell}>
            {t('report.booking.line', {
              style: line.styleCode,
              colour: line.colour ?? t('report.none'),
              size: line.size ?? t('report.none'),
            })}
          </td>
          <td className={cell}>{formatDate(line.dueDate)}</td>
          <td className={`${cell} tabular-nums`}>{formatQuantity(line.ordered)}</td>
          <td className={`${cell} tabular-nums`}>{formatQuantity(line.delivered)}</td>
          <td className={`${cell} tabular-nums`}>{formatQuantity(line.cancelled)}</td>
          <td className={`${cell} tabular-nums`}>{formatQuantity(line.outstanding)}</td>
          <td className={`${cell} tabular-nums`}>{formatQuantity(line.overDelivered)}</td>
          <td className={cell}>{line.overdue ? <StatusBadge state="overdue" /> : null}</td>
          <td className={cell}>
            <GrnLinks
              names={names}
              grnIds={[
                ...new Set(
                  booking.deliveries.filter((each) => each.lineKey === line.lineKey).map((each) => each.grnId),
                ),
              ]}
              onOpen={onGrn}
            />
          </td>
        </tr>
      ))}
    </Fragment>
  );
}

/** The report's table and pages, for the filters given. */
export function BookingStatusTable({ filters }: { filters: BookingStatusFilters }) {
  const timeZone = useTimeZone();
  const [open, setOpen] = useState<
    { kind: 'booking'; bookingId: string } | { kind: 'grn'; grn: ReportNames['grns'][number] } | null
  >(null);
  const query = useInfiniteQuery({
    queryKey: ['readBookingStatusReport', 'pages', filters],
    queryFn: ({ pageParam }) => readPage(filters, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last: Report) => last.next ?? undefined,
  });
  const back = () => {
    setOpen(null);
  };
  if (open?.kind === 'booking') return <BookingView bookingId={open.bookingId} onBack={back} />;
  if (open?.kind === 'grn') return <ArrivalDrill grn={open.grn} onBack={back} />;
  return (
    <ListRead query={query} what="report.booking-status.what">
      {({ pages }) => {
        const asOf = pages[0]?.asOf;
        const rows = pages.flatMap((page) => page.bookings.map((booking) => ({ booking, names: page.names })));
        return (
          <div className="flex flex-col gap-3">
            <div className="flex justify-end">{asOf !== undefined && <AsOf asOf={asOf} timeZone={timeZone} />}</div>
            {rows.length === 0 ? (
              <EmptyState title="report.booking-status.empty.title" body="report.booking-status.empty.body" />
            ) : (
              <div className="overflow-x-auto rounded-card border border-border bg-surface">
                <table className="w-full border-collapse text-body" aria-label={t('report.booking-status.table')}>
                  <thead>
                    <tr>
                      <Th label="report.booking.column.line" />
                      <Th label="report.booking.column.due" />
                      <Th label="report.booking.column.ordered" />
                      <Th label="report.booking.column.delivered" />
                      <Th label="report.booking.column.cancelled" />
                      <Th label="report.booking.column.outstanding" />
                      <Th label="report.booking.column.over-delivered" />
                      <Th label="report.booking.column.overdue" />
                      <Th label="report.booking.column.grns" />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(({ booking, names }) => (
                      <BookingRows
                        key={booking.bookingId}
                        booking={booking}
                        names={names}
                        onBooking={() => {
                          setOpen({ kind: 'booking', bookingId: booking.bookingId });
                        }}
                        onGrn={(grn) => {
                          setOpen({ kind: 'grn', grn });
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
  );
}

/** Reports › Booking status. */
export function BookingStatusScreen() {
  const names = useBookingNames();
  const [filters, setFilters] = useState<BookingStatusFilters>({});
  const set = (field: keyof BookingStatusFilters) => (value: string | undefined) => {
    setFilters({ ...filters, [field]: value });
  };
  const options = (records: readonly Parameters<typeof optionText>[0][]) =>
    records.map((record) => ({ value: record.id, text: optionText(record) }));
  return (
    <div className="flex flex-col gap-4">
      <Toolbar>
        <span className="flex-1" />
        <ExportButton fetchFile={() => api.call('exportBookingStatusReport', { query: filters })} />
      </Toolbar>
      <p className="m-0 text-body-sm text-text-2">{t('report.booking-status.intro')}</p>
      <div className="grid gap-3 sm:grid-cols-5" role="search" aria-label={t('report.filters')}>
        <FilterSelect
          id="report-booking-state"
          label="report.filter.state"
          value={filters.state}
          options={bookingInForceStateSchema.options.map((state) => ({
            value: state,
            text: t(`state.${stateIdOf(state)}`),
          }))}
          onChange={(value) => {
            setFilters({ ...filters, state: bookingInForceStateSchema.safeParse(value).data });
          }}
        />
        <FilterSelect
          id="report-booking-brand"
          label="report.filter.brand"
          value={filters.brandId}
          options={options(names.brands)}
          onChange={set('brandId')}
        />
        <FilterSelect
          id="report-booking-season"
          label="report.filter.season"
          value={filters.seasonValueId}
          options={options(names.seasons)}
          onChange={set('seasonValueId')}
        />
        <FilterSelect
          id="report-booking-supplier"
          label="report.filter.supplier"
          value={filters.supplierPartyId}
          options={options(names.suppliers)}
          onChange={set('supplierPartyId')}
        />
        <FilterSelect
          id="report-booking-destination"
          label="report.filter.destination"
          value={filters.destinationSiteId}
          options={options(names.sites)}
          onChange={set('destinationSiteId')}
        />
      </div>
      <BookingStatusTable filters={filters} />
    </div>
  );
}
