import { zodResolver } from '@hookform/resolvers/zod';
import { ARRIVAL_TYPE, type Inbox, type InboxView } from '@apparel-os/schemas';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { api } from '../api';
import { useSubmission } from '../api/command';
import { readQuery } from '../api/query';
import { Button } from '../components/Button';
import { EmptyState } from '../components/StandardStates';
import { StatusBadge } from '../components/StatusBadge';
import { UnavailableState } from '../components/UnavailableState';
import { describedBy, FormField } from '../forms/FormField';
import { AsOf } from '../history/AsOf';
import { formatDateTime } from '../history/format';
import { t } from '../messages/catalogue';
import { Card, GrantedButton, inputClass, ListRead, SubmissionBanner, Th, Toolbar, useGranted } from '../setup/parts';
import { FormActions, RecordDrawer } from '../setup/RecordDrawer';
import { stateIdOf } from '../setup/states';
import { useTimeZone } from '../shell/session';
import { ArrivalView } from './ArrivalView';
import { inForce, optionText, useMasterNames } from './names';

// Receive Goods › Inbox (goods-in 4.1, 4.2, section 11; PRD-REC-001, PRD-REC-002, PRD-LIF-001, POL-10.08;
// S2-F02-T02): one inbox per Site, Pending and History. Each unit of the Site shows whether receiving is available
// there, naming what is missing; "Goods arrived" records an Arrival at a unit that may receive, and an Arrival opens
// where its invoices, photos and count are entered and its GRN issued. "Receive against booking" opens the same
// workflow once bookings are received against (S2-F02-T04).

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
    .transform((text) => Number(text)),
  arrivedAt: z.string().min(1),
});
type ArrivalFormInput = z.input<typeof arrivalFormSchema>;
type ArrivalFormOutput = z.output<typeof arrivalFormSchema>;

/** The instant a `datetime-local` value stands for, in the browser's own time. */
function instantOf(local: string): string {
  return new Date(local).toISOString();
}

/** Records an Arrival at a unit of the Site that may receive (goods-in 4.2); it opens once recorded. */
function NewArrivalForm({ units, onRecorded }: { units: readonly Unit[]; onRecorded: (arrivalId: string) => void }) {
  const names = useMasterNames();
  const form = useForm<ArrivalFormInput, unknown, ArrivalFormOutput>({
    resolver: zodResolver(arrivalFormSchema),
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
    },
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
        {...(name === 'cartons' ? { inputMode: 'numeric' as const } : {})}
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
      aria-label={t('receive.new')}
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
              arrivedAt: instantOf(entered.arrivedAt),
            },
          });
          if (recorded !== undefined) onRecorded(recorded.arrivalId);
        })(event);
      }}
    >
      <p className="m-0 text-body-sm text-text-2">{t('receive.new.intro')}</p>
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
      <FormField id="receive-arrived-at" label="receive.arrived-at" required error={errors.arrivedAt}>
        <input
          id="receive-arrived-at"
          type="datetime-local"
          className={inputClass}
          {...describedBy('receive-arrived-at', { invalid: errors.arrivedAt !== undefined, help: false })}
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
    return unit === undefined ? id : t('receive.option', { code: unit.code, name: unit.name });
  };
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
              <td className="px-3">{names.partyText(entry.supplierPartyId)}</td>
              <td className="px-3">{names.brandText(entry.brandId)}</td>
              <td className="px-3">{unitText(entry.businessUnitId)}</td>
              <td className="px-3">{entry.invoiceNumbers.join(', ')}</td>
              <td className="px-3 tabular-nums">
                {t('receive.pieces.counted', { count: entry.countedPieces, lines: entry.lines })}
              </td>
              <td className="px-3">
                <span className="flex flex-wrap items-center gap-2">
                  <StatusBadge state={stateIdOf(entry.state)} />
                  {entry.grn !== null && <span className="text-body-sm">{entry.grn.number}</span>}
                  <span className="text-caption text-text-2">{t(`receive.waiting.${entry.waitingFor}`)}</span>
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
  const [recording, setRecording] = useState(false);
  const query = useQuery(readQuery(api, 'readReceivingInbox', { params: { siteId }, query: { view } }));
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
            setRecording(true);
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
              {recording && (
                <RecordDrawer
                  title={t('receive.new')}
                  onClose={() => {
                    setRecording(false);
                  }}
                  details={
                    <NewArrivalForm
                      units={inbox.units}
                      onRecorded={(arrivalId) => {
                        setRecording(false);
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
