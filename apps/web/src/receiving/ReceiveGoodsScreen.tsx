import { zodResolver } from '@hookform/resolvers/zod';
import { ARRIVAL_TYPE, BOOKING_TYPE, RECEIVING_CAPS, type Inbox, type InboxView } from '@apparel-os/schemas';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { api } from '../api';
import { useSubmission } from '../api/command';
import { readQuery } from '../api/query';
import { Button } from '../components/Button';
import { UnknownInCell } from '../components/cells';
import { EmptyState } from '../components/StandardStates';
import { StatusBadge } from '../components/StatusBadge';
import { UnavailableState } from '../components/UnavailableState';
import { describedBy, FormField } from '../forms/FormField';
import { AsOf } from '../history/AsOf';
import { formatDateTime } from '../history/format';
import { formatDate } from '../setup/format';
import { t } from '../messages/catalogue';
import { instantOfLocal, LOCAL_DATE_TIME } from '../setup/business-date';
import { formatList } from '../setup/format';
import { Card, GrantedButton, inputClass, ListRead, SubmissionBanner, Th, Toolbar, useGranted } from '../setup/parts';
import { FormActions, RecordDrawer } from '../setup/RecordDrawer';
import { stateIdOf } from '../setup/states';
import { useTimeZone } from '../shell/session';
import { ArrivalView } from './ArrivalView';
import { inForce, optionText, unknownText, useMasterNames } from './names';

// Receive Goods › Inbox (goods-in 4.1, 4.2, section 11; PRD-REC-001, PRD-REC-002, PRD-LIF-001, POL-10.08;
// S2-F02-T02): one inbox per Site, Pending and History. Each unit of the Site shows whether receiving is available
// there, naming what is missing; "Goods arrived" records an Arrival at a unit that may receive, and an Arrival opens
// where its invoices, photos and count are entered and its GRN issued. "Receive against booking" opens the same
// workflow, naming one booking of the supplier and brand that goods may be received against, whose open lines show as
// the expected goods (goods-in 3.7, 4.1, 4.2; PRD-REC-002; S2-F02-T04).

type Unit = Inbox['units'][number];

const INBOX_READS = ['readReceivingInbox'] as const;

const arrivalFormSchema = z.object({
  businessUnitId: z.uuid(),
  receivingLocationId: z.uuid(),
  supplierPartyId: z.uuid(),
  brandId: z.uuid(),
  transporter: z.string().trim().min(1),
  lorryReceiptNumber: z.string().trim().min(1),
  lorryReceiptDate: z.iso.date(),
  vehicleNumber: z.string(),
  ewayBillNumber: z.string(),
  cartons: z
    .string()
    .regex(/^[1-9]\d{0,5}$/, { message: 'receive.cartons.invalid' })
    .refine((text) => Number(text) <= RECEIVING_CAPS.cartons, { message: 'receive.cartons.invalid' })
    .transform((text) => Number(text)),
  arrivedAt: z.string().regex(LOCAL_DATE_TIME),
  bookingId: z.union([z.literal(''), z.uuid()]),
});
/** "Receive against booking" names one booking (goods-in 4.2). */
const againstBookingSchema = arrivalFormSchema.refine((form) => form.bookingId !== '', {
  path: ['bookingId'],
  message: 'receive.booking.required',
});
type ArrivalFormInput = z.input<typeof arrivalFormSchema>;
type ArrivalFormOutput = z.output<typeof arrivalFormSchema>;

/**
 * Records an Arrival at a unit of the Site that may receive (goods-in 4.2); it opens once recorded. Against a booking,
 * it names one of the supplier and brand chosen that goods may be received against: Approved, Issued or Confirmed.
 */
function NewArrivalForm({
  units,
  againstBooking,
  onRecorded,
}: {
  units: readonly Unit[];
  againstBooking: boolean;
  onRecorded: (arrivalId: string) => void;
}) {
  const names = useMasterNames();
  // The arrival time is typed as the Organisation's wall clock, as the screens show times (code-house-rules 9).
  const timeZone = useTimeZone();
  const form = useForm<ArrivalFormInput, unknown, ArrivalFormOutput>({
    resolver: zodResolver(againstBooking ? againstBookingSchema : arrivalFormSchema),
    mode: 'onBlur',
    defaultValues: {
      businessUnitId: '',
      receivingLocationId: '',
      supplierPartyId: '',
      brandId: '',
      transporter: '',
      lorryReceiptNumber: '',
      lorryReceiptDate: '',
      vehicleNumber: '',
      ewayBillNumber: '',
      cartons: '',
      arrivedAt: '',
      bookingId: '',
    },
  });
  const supplierPartyId = form.watch('supplierPartyId');
  const brandId = form.watch('brandId');
  const bookings = useQuery({
    ...readQuery(api, 'listBookings', { query: { receivable: 'true', brandId, supplierPartyId } }),
    enabled: useGranted(BOOKING_TYPE, 'view') && againstBooking && supplierPartyId !== '' && brandId !== '',
  });
  const submission = useSubmission('recordArrival', INBOX_READS);
  const errors = form.formState.errors;
  const available = units.filter((unit) => unit.receiving.state === 'available');
  const unitId = form.watch('businessUnitId');
  const locations = available.find((unit) => unit.businessUnitId === unitId)?.locations ?? [];
  const suppliers = inForce(names.parties).filter((party) =>
    party.roles.some(
      (role) =>
        role.role === 'supplier' && role.versions.some((version) => version.state === 'In force' && version.held),
    ),
  );
  const maxLength = {
    transporter: RECEIVING_CAPS.longText,
    lorryReceiptNumber: RECEIVING_CAPS.codeText,
    vehicleNumber: RECEIVING_CAPS.shortText,
    ewayBillNumber: RECEIVING_CAPS.shortText,
    cartons: undefined,
  } as const;
  const text = (
    name: 'transporter' | 'lorryReceiptNumber' | 'vehicleNumber' | 'ewayBillNumber' | 'cartons',
    id: string,
    label: Parameters<typeof t>[0],
    required: boolean,
  ) => (
    <FormField
      id={id}
      label={label}
      required={required}
      error={errors[name]}
      message={name === 'cartons' && errors.cartons !== undefined ? 'receive.cartons.invalid' : undefined}
    >
      <input
        id={id}
        className={inputClass}
        {...(name === 'cartons' ? { inputMode: 'numeric' as const } : { maxLength: maxLength[name] })}
        {...describedBy(id, { invalid: errors[name] !== undefined, help: false })}
        {...form.register(name)}
      />
    </FormField>
  );
  const select = (
    name: 'businessUnitId' | 'receivingLocationId' | 'supplierPartyId' | 'brandId',
    id: string,
    label: Parameters<typeof t>[0],
    options: readonly { readonly value: string; readonly text: string }[],
  ) => (
    <FormField id={id} label={label} required error={errors[name]}>
      <select
        id={id}
        className={inputClass}
        {...describedBy(id, { invalid: errors[name] !== undefined, help: false })}
        {...form.register(name)}
      >
        <option value="">{t('setup.choose')}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.text}
          </option>
        ))}
      </select>
    </FormField>
  );
  return (
    <form
      id="receive-arrival-form"
      aria-label={t(againstBooking ? 'receive.new.against' : 'receive.new')}
      noValidate
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        void form.handleSubmit(async (entered) => {
          const recorded = await submission.submit({
            body: {
              businessUnitId: entered.businessUnitId,
              receivingLocationId: entered.receivingLocationId,
              supplierPartyId: entered.supplierPartyId,
              brandId: entered.brandId,
              transporter: entered.transporter,
              lorryReceipt: { number: entered.lorryReceiptNumber, date: entered.lorryReceiptDate },
              ...(entered.vehicleNumber.trim() === '' ? {} : { vehicleNumber: entered.vehicleNumber }),
              ...(entered.ewayBillNumber.trim() === '' ? {} : { ewayBillNumber: entered.ewayBillNumber }),
              cartons: entered.cartons,
              arrivedAt: instantOfLocal(entered.arrivedAt, timeZone),
              ...(againstBooking && entered.bookingId !== '' ? { bookingId: entered.bookingId } : {}),
            },
          });
          if (recorded !== undefined) onRecorded(recorded.arrivalId);
        })(event);
      }}
    >
      <p className="m-0 text-body-sm text-text-2">
        {t(againstBooking ? 'receive.new.against.intro' : 'receive.new.intro')}
      </p>
      <SubmissionBanner state={submission.state} done="receive.recorded" />
      {select(
        'businessUnitId',
        'receive-unit',
        'receive.unit',
        available.map((unit) => ({
          value: unit.businessUnitId,
          text: t('receive.option', { code: unit.code, name: unit.name }),
        })),
      )}
      {select(
        'receivingLocationId',
        'receive-location',
        'receive.location',
        locations.map((location) => ({
          value: location.id,
          text: t('receive.option', { code: location.code, name: location.name }),
        })),
      )}
      {select(
        'supplierPartyId',
        'receive-supplier',
        'receive.supplier',
        suppliers.map((party) => ({ value: party.id, text: optionText(party) })),
      )}
      {select(
        'brandId',
        'receive-brand',
        'receive.brand',
        inForce(names.brands).map((brand) => ({ value: brand.id, text: optionText(brand) })),
      )}
      {againstBooking && (
        <FormField
          id="receive-booking"
          label="receive.booking"
          help="receive.booking.help"
          required
          error={errors.bookingId}
          message={errors.bookingId === undefined ? undefined : 'receive.booking.required'}
        >
          <select
            id="receive-booking"
            className={inputClass}
            {...describedBy('receive-booking', { invalid: errors.bookingId !== undefined, help: true })}
            {...form.register('bookingId')}
          >
            <option value="">{t('setup.choose')}</option>
            {(bookings.data?.bookings ?? []).flatMap((booking) =>
              booking.number === undefined
                ? []
                : [
                    <option key={booking.id} value={booking.id}>
                      {t('receive.booking.option', {
                        number: booking.number,
                        from: formatDate(booking.deliveryWindow.from),
                        to: formatDate(booking.deliveryWindow.to),
                      })}
                    </option>,
                  ],
            )}
          </select>
        </FormField>
      )}
      {text('transporter', 'receive-transporter', 'receive.transporter', true)}
      {text('lorryReceiptNumber', 'receive-lr-number', 'receive.lorry-receipt-number', true)}
      <FormField id="receive-lr-date" label="receive.lorry-receipt-date" required error={errors.lorryReceiptDate}>
        <input
          id="receive-lr-date"
          type="date"
          className={inputClass}
          {...describedBy('receive-lr-date', { invalid: errors.lorryReceiptDate !== undefined, help: false })}
          {...form.register('lorryReceiptDate')}
        />
      </FormField>
      {text('vehicleNumber', 'receive-vehicle', 'receive.vehicle-number', false)}
      {text('ewayBillNumber', 'receive-eway', 'receive.eway-bill-number', false)}
      {text('cartons', 'receive-cartons', 'receive.cartons', true)}
      <FormField
        id="receive-arrived-at"
        label="receive.arrived-at"
        help="receive.arrived-at.help"
        required
        error={errors.arrivedAt}
      >
        <input
          id="receive-arrived-at"
          type="datetime-local"
          className={inputClass}
          {...describedBy('receive-arrived-at', { invalid: errors.arrivedAt !== undefined, help: true })}
          {...form.register('arrivedAt')}
        />
      </FormField>
      <FormActions form="receive-arrival-form" label="receive.record" pending={submission.state.kind === 'pending'} />
    </form>
  );
}

/** The units of the Site where receiving is not available, each naming what is missing (goods-in 4.1). */
function UnitsUnavailable({ units }: { units: readonly Unit[] }) {
  const blocked = units.filter((unit) => unit.receiving.state === 'unavailable');
  if (blocked.length === 0) return null;
  return (
    <Card title="receive.units">
      <ul aria-label={t('receive.units')} className="m-0 flex list-none flex-col gap-3 p-0">
        {blocked.map((unit) => (
          <li key={unit.businessUnitId} className="flex flex-col gap-2">
            <span className="font-semibold">
              {t('receive.unit.unavailable', { unit: t('receive.option', { code: unit.code, name: unit.name }) })}
            </span>
            <UnavailableState missing={unit.receiving.missing} />
          </li>
        ))}
      </ul>
    </Card>
  );
}

function InboxTable({ inbox, onOpen }: { inbox: Inbox; onOpen: (arrivalId: string) => void }) {
  const timeZone = useTimeZone();
  const names = useMasterNames();
  const unitText = (id: string) => {
    const unit = inbox.units.find((each) => each.businessUnitId === id);
    return unit === undefined ? undefined : t('receive.option', { code: unit.code, name: unit.name });
  };
  // An Unknown name is a blank cell that a screen reader reads as unknown (design-language 8; PRD-MOD-015).
  const cell = (text: string | undefined) => text ?? <span className="sr-only">{unknownText()}</span>;
  if (inbox.entries.length === 0) {
    return <EmptyState title={`receive.empty.${inbox.view}.title`} body={`receive.empty.${inbox.view}.body`} />;
  }
  return (
    <div className="overflow-x-auto rounded-card border border-border bg-surface">
      <table className="w-full border-collapse text-body" aria-label={t('receive.list')}>
        <thead>
          <tr>
            <Th label="receive.arrived-at" />
            <Th label="receive.supplier" />
            <Th label="receive.brand" />
            <Th label="receive.unit" />
            <Th label="receive.invoices" />
            <Th label="receive.pieces" />
            <Th label="receive.state" />
          </tr>
        </thead>
        <tbody>
          {inbox.entries.map((entry) => (
            <tr key={entry.arrivalId} className="h-10 border-t border-border hover:bg-hover">
              <td className="px-3">
                <button
                  type="button"
                  className="text-accent underline"
                  onClick={() => {
                    onOpen(entry.arrivalId);
                  }}
                >
                  {formatDateTime(entry.arrivedAt, timeZone)}
                </button>
              </td>
              <td className="px-3">{cell(names.partyText(entry.supplierPartyId))}</td>
              <td className="px-3">{cell(names.brandText(entry.brandId))}</td>
              <td className="px-3">{cell(unitText(entry.businessUnitId))}</td>
              <td className="px-3">{formatList(entry.invoiceNumbers)}</td>
              <td className="px-3 tabular-nums">
                {t('receive.pieces.counted', { count: entry.countedPieces, lines: entry.lines })}
              </td>
              <td className="px-3">
                <span className="flex flex-wrap items-center gap-2">
                  <StatusBadge state={stateIdOf(entry.state)} />
                  {entry.grn !== null && <span className="text-body-sm">{entry.grn.number}</span>}
                  <span className="text-caption text-text-2">
                    {entry.waitingFor === 'unknown' ? (
                      // Unknown to a reader who may not see its stock: a blank a screen reader reads (goods-in 7.5).
                      <UnknownInCell />
                    ) : (
                      t(entry.waitingFor === null ? 'receive.waiting.done' : `receive.waiting.${entry.waitingFor}`)
                    )}
                  </span>
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** The inbox of one Site, Pending or History (goods-in 4.1). */
function SiteInbox({ siteId }: { siteId: string }) {
  const timeZone = useTimeZone();
  const [view, setView] = useState<InboxView>('pending');
  const [open, setOpen] = useState<string | null>(null);
  const [recording, setRecording] = useState<'goods' | 'booking' | null>(null);
  // The page shown: the first, or the one after a delivery (code-house-rules 12.1).
  const [after, setAfter] = useState<string | undefined>(undefined);
  const query = useQuery(
    readQuery(api, 'readReceivingInbox', {
      params: { siteId },
      query: after === undefined ? { view } : { view, after },
    }),
  );
  if (open !== null) {
    return (
      <ArrivalView
        arrivalId={open}
        units={query.data?.units ?? []}
        onBack={() => {
          setOpen(null);
        }}
      />
    );
  }
  return (
    <div className="flex flex-col gap-4">
      <Toolbar>
        <GrantedButton
          label="receive.goods-arrived"
          recordType={ARRIVAL_TYPE}
          action="create"
          variant="primary"
          onClick={() => {
            setRecording('goods');
          }}
        />
        <GrantedButton
          label="receive.against-booking"
          recordType={ARRIVAL_TYPE}
          action="create"
          onClick={() => {
            setRecording('booking');
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
      <div
        role="tablist"
        aria-label={t('screen.receiving.inbox')}
        className="flex flex-wrap gap-2 border-b border-border"
      >
        {(['pending', 'history'] as const).map((each) => (
          <button
            key={each}
            type="button"
            role="tab"
            id={`receive-tab-${each}`}
            aria-selected={view === each}
            aria-controls="receive-tab-panel"
            className={
              view === each
                ? 'h-11 border-b-2 border-accent px-3 font-semibold text-text'
                : 'h-11 px-3 text-text-2 hover:text-accent'
            }
            onClick={() => {
              setView(each);
              setAfter(undefined);
            }}
          >
            {t(`receive.tab.${each}`)}
          </button>
        ))}
      </div>
      <div id="receive-tab-panel" role="tabpanel" aria-labelledby={`receive-tab-${view}`}>
        <ListRead query={query} what="receive.what">
          {(inbox) => (
            <div className="flex flex-col gap-3">
              <div className="flex justify-end">
                <AsOf asOf={inbox.asOf} timeZone={timeZone} />
              </div>
              <UnitsUnavailable units={inbox.units} />
              <InboxTable inbox={inbox} onOpen={setOpen} />
              {(inbox.next !== null || after !== undefined) && (
                <div className="flex flex-wrap gap-2">
                  {after !== undefined && (
                    <Button
                      label="receive.first-page"
                      onClick={() => {
                        setAfter(undefined);
                      }}
                    />
                  )}
                  {inbox.next !== null && (
                    <Button
                      label="receive.next-page"
                      onClick={() => {
                        setAfter(inbox.next ?? undefined);
                      }}
                    />
                  )}
                </div>
              )}
              {recording !== null && (
                <RecordDrawer
                  title={t(recording === 'booking' ? 'receive.new.against' : 'receive.new')}
                  onClose={() => {
                    setRecording(null);
                  }}
                  details={
                    <NewArrivalForm
                      key={recording}
                      units={inbox.units}
                      againstBooking={recording === 'booking'}
                      onRecorded={(arrivalId) => {
                        setRecording(null);
                        setOpen(arrivalId);
                      }}
                    />
                  }
                />
              )}
            </div>
          )}
        </ListRead>
      </div>
    </div>
  );
}

/** Receive Goods › Inbox. */
export function ReceiveGoodsScreen() {
  const sites = useQuery({
    ...readQuery(api, 'listSites', { query: {} }),
    enabled: useGranted('organisation.site', 'view'),
  });
  const [siteId, setSiteId] = useState('');
  const shown = inForce(sites.data?.records);
  return (
    <div className="flex flex-col gap-4">
      <p className="m-0 text-body-sm text-text-2">{t('receive.intro')}</p>
      <FormField id="receive-site" label="receive.site" help="receive.site.help">
        <select
          id="receive-site"
          className={`${inputClass} max-w-md`}
          value={siteId}
          {...describedBy('receive-site', { invalid: false, help: true })}
          onChange={(event) => {
            setSiteId(event.target.value);
          }}
        >
          <option value="">{t('setup.choose')}</option>
          {shown.map((site) => (
            <option key={site.id} value={site.id}>
              {optionText(site)}
            </option>
          ))}
        </select>
      </FormField>
      {siteId !== '' && <SiteInbox key={siteId} siteId={siteId} />}
    </div>
  );
}
