import { BOOKING_TYPE, bookingStateSchema, type BookingList, type BookingPageQuery } from '@apparel-os/schemas';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../api';
import { ApiFailure } from '../api/query';
import { Button } from '../components/Button';
import { EmptyState } from '../components/StandardStates';
import { StatusBadge } from '../components/StatusBadge';
import { FormField } from '../forms/FormField';
import { AsOf } from '../history/AsOf';
import { t, type MessageId } from '../messages/catalogue';
import { optionText } from '../receiving/names';
import { formatDate, formatPaise, formatQuantity } from '../setup/format';
import { GrantedButton, inputClass, ListRead, Th, Toolbar } from '../setup/parts';
import { stateIdOf } from '../setup/states';
import { useTimeZone } from '../shell/session';
import { BookingForm } from './BookingForm';
import { BookingView } from './BookingView';
import { referenceOf } from './facts';
import { useBookingNames } from './names';

// Booking › Bookings (goods-in 3.1 to 3.4, section 11; PRD-BKG-001, PRD-UXP-003; S2-F01-T03): every booking the reader
// may see, newest first, filtered by state, brand, season, supplier and destination, each with its state, window and
// totals. A booking opens where its documents, terms, lines and submission are; a new one is entered by hand from the
// booking document (DEC-136). The approval is decided from My work.

type Filters = Omit<BookingPageQuery, 'after' | 'limit'>;

/** One page of the bookings, after the cursor the server gave, or the refusal thrown as ApiFailure. */
async function readPage(filters: Filters, after: string | undefined): Promise<BookingList> {
  const result = await api.call('listBookings', { query: { ...filters, ...(after === undefined ? {} : { after }) } });
  if (result.ok) return result.data;
  throw new ApiFailure(result.status, result.error);
}

function FilterSelect({
  id,
  label,
  value,
  options,
  onChange,
}: {
  id: string;
  label: MessageId;
  value: string | undefined;
  options: readonly { readonly value: string; readonly text: string }[];
  onChange: (value: string | undefined) => void;
}) {
  return (
    <FormField id={id} label={label}>
      <select
        id={id}
        className={inputClass}
        value={value ?? ''}
        onChange={(event) => {
          onChange(event.target.value === '' ? undefined : event.target.value);
        }}
      >
        <option value="">{t('booking.filter.any')}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.text}
          </option>
        ))}
      </select>
    </FormField>
  );
}

/** Booking › Bookings. The bookings are read a page at a time; Load more reads the next (code-house-rules 12.1). */
export function BookingsScreen() {
  const timeZone = useTimeZone();
  const names = useBookingNames();
  const [filters, setFilters] = useState<Filters>({});
  const [open, setOpen] = useState<string | null>(null);
  const query = useInfiniteQuery({
    queryKey: ['listBookings', 'pages', filters],
    queryFn: ({ pageParam }) => readPage(filters, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last: BookingList) => last.next ?? undefined,
  });
  if (open === 'new') {
    return (
      <div className="flex flex-col gap-4">
        <Toolbar>
          <Button
            label="booking.back"
            onClick={() => {
              setOpen(null);
            }}
          />
        </Toolbar>
        <h2 className="text-h2 font-semibold">{t('booking.new')}</h2>
        <p className="m-0 text-body-sm text-text-2">{t('booking.new.intro')}</p>
        <BookingForm onSaved={setOpen} />
      </div>
    );
  }
  if (open !== null) {
    return (
      <BookingView
        bookingId={open}
        onBack={() => {
          setOpen(null);
        }}
      />
    );
  }
  const set = (field: keyof Filters) => (value: string | undefined) => {
    setFilters({ ...filters, [field]: value });
  };
  const options = (records: readonly Parameters<typeof optionText>[0][]) =>
    records.map((record) => ({ value: record.id, text: optionText(record) }));
  return (
    <div className="flex flex-col gap-4">
      <Toolbar>
        <GrantedButton
          label="booking.new"
          recordType={BOOKING_TYPE}
          action="create"
          variant="primary"
          onClick={() => {
            setOpen('new');
          }}
        />
        <span className="flex-1" />
        <Button
          label="setup.refresh"
          onClick={() => {
            void query.refetch();
          }}
        />
      </Toolbar>
      <p className="m-0 text-body-sm text-text-2">{t('booking.intro')}</p>
      <div className="grid gap-3 sm:grid-cols-5" role="search" aria-label={t('booking.filters')}>
        <FilterSelect
          id="booking-filter-state"
          label="booking.state"
          value={filters.state}
          options={bookingStateSchema.options.map((state) => ({ value: state, text: t(`state.${stateIdOf(state)}`) }))}
          onChange={(value) => {
            setFilters({ ...filters, state: bookingStateSchema.safeParse(value).data });
          }}
        />
        <FilterSelect
          id="booking-filter-brand"
          label="booking.brand"
          value={filters.brandId}
          options={options(names.brands)}
          onChange={set('brandId')}
        />
        <FilterSelect
          id="booking-filter-season"
          label="booking.season"
          value={filters.seasonValueId}
          options={options(names.seasons)}
          onChange={set('seasonValueId')}
        />
        <FilterSelect
          id="booking-filter-supplier"
          label="booking.supplier"
          value={filters.supplierPartyId}
          options={options(names.suppliers)}
          onChange={set('supplierPartyId')}
        />
        <FilterSelect
          id="booking-filter-destination"
          label="booking.destination"
          value={filters.siteId}
          options={options(names.sites)}
          onChange={set('siteId')}
        />
      </div>
      <ListRead query={query} what="booking.what">
        {({ pages }) => {
          const bookings = pages.flatMap((page) => page.bookings);
          const asOf = pages[0]?.asOf;
          return (
            <div className="flex flex-col gap-3">
              <div className="flex justify-end">{asOf !== undefined && <AsOf asOf={asOf} timeZone={timeZone} />}</div>
              {bookings.length === 0 ? (
                <EmptyState title="booking.empty.title" body="booking.empty.body" />
              ) : (
                <div className="overflow-x-auto rounded-card border border-border bg-surface">
                  <table className="w-full border-collapse text-body" aria-label={t('booking.list')}>
                    <thead>
                      <tr>
                        <Th label="booking.reference" />
                        <Th label="booking.state" />
                        <Th label="booking.brand" />
                        <Th label="booking.season" />
                        <Th label="booking.supplier" />
                        <Th label="booking.destination" />
                        <Th label="booking.window" />
                        <Th label="booking.totals.pieces" />
                        <Th label="booking.totals.cost" />
                      </tr>
                    </thead>
                    <tbody>
                      {bookings.map((booking) => (
                        <tr key={booking.id} className="h-10 border-t border-border hover:bg-hover">
                          <td className="px-3">
                            <button
                              type="button"
                              className="text-accent underline"
                              onClick={() => {
                                setOpen(booking.id);
                              }}
                            >
                              {referenceOf(booking)}
                            </button>
                          </td>
                          <td className="px-3">
                            <StatusBadge state={stateIdOf(booking.state)} />
                          </td>
                          <td className="px-3">{names.brand.text(booking.brandId)}</td>
                          <td className="px-3">{names.season.text(booking.seasonValueId)}</td>
                          <td className="px-3">{names.party.text(booking.supplierPartyId)}</td>
                          <td className="px-3">{names.site.text(booking.destinationSiteId)}</td>
                          <td className="px-3">
                            {t('booking.window.range', {
                              from: formatDate(booking.deliveryWindow.from),
                              to: formatDate(booking.deliveryWindow.to),
                            })}
                          </td>
                          <td className="px-3 tabular-nums">{formatQuantity(booking.totals.pieces)}</td>
                          <td className="px-3 tabular-nums">{formatPaise(booking.totals.cost)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {query.hasNextPage && (
                <div>
                  <Button
                    label="organisation.load-more"
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
