import { zodResolver } from '@hookform/resolvers/zod';
import { BOOKING_CAPS, type Booking, type BookingLineDraft, type BookingStatus } from '@apparel-os/schemas';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { useSubmission } from '../api/command';
import { Button } from '../components/Button';
import { describedBy, FormField } from '../forms/FormField';
import { t, type MessageId } from '../messages/catalogue';
import { formatQuantity } from '../setup/format';
import { Card, inputClass, SubmissionBanner, Th } from '../setup/parts';
import { optionText } from '../receiving/names';
import { TotalsView } from './facts';
import {
  cellKey,
  draftLineOf,
  gridLines,
  inputOf,
  lineProblems,
  splitList,
  type LineInput,
  type LineProblems,
} from './lines';
import { useBookingNames } from './names';

// The booking form (goods-in 3.1, section 11; PRD-BKG-001, PRD-BKG-003, PRD-BKG-014; DEC-130, DEC-136; S2-F01-T03):
// the header, the size-colour grid that enters one style's lines at once, the lines one by one, and the totals of the
// booking and of each style, shown as the lines are typed. A new booking names its brand and destination Site, fixed
// for its life; a Draft is saved as its next version, naming its version token (code-house-rules 12.7). Nothing is
// read from the booking document: it is entered by hand (DEC-136).

export const BOOKING_READS = ['listBookings', 'readBooking', 'listMyWork'] as const;

const headerSchema = (isNew: boolean) =>
  z
    .object({
      brandId: isNew ? z.uuid() : z.string(),
      destinationSiteId: isNew ? z.uuid() : z.string(),
      supplierPartyId: z.uuid(),
      seasonValueId: z.uuid(),
      windowFrom: z.iso.date(),
      windowTo: z.iso.date(),
    })
    .refine((header) => header.windowFrom <= header.windowTo, {
      message: 'booking.window.invalid',
      path: ['windowTo'],
    });
type Header = z.input<ReturnType<typeof headerSchema>>;

const EMPTY_LINE: LineInput = {
  styleCode: '',
  colour: '',
  size: '',
  quantity: '',
  cost: '',
  mrp: '',
  deliveryDate: '',
};

/** The size-colour grid of one style (goods-in 3.1): colours down, sizes across, quantities in the cells. */
function GridBuilder({ onAdd }: { onAdd: (lines: LineInput[]) => void }) {
  const [styleCode, setStyleCode] = useState('');
  const [cost, setCost] = useState('');
  const [mrp, setMrp] = useState('');
  const [coloursText, setColoursText] = useState('');
  const [sizesText, setSizesText] = useState('');
  const [cells, setCells] = useState<Record<string, string>>({});
  const [problem, setProblem] = useState(false);
  const colours = splitList(coloursText);
  const sizes = splitList(sizesText);
  const text = (id: string, label: MessageId, value: string, set: (value: string) => void) => (
    <FormField id={id} label={label}>
      <input
        id={id}
        className={inputClass}
        value={value}
        {...describedBy(id, { invalid: false, help: false })}
        onChange={(event) => {
          set(event.target.value);
        }}
      />
    </FormField>
  );
  return (
    <section aria-label={t('booking.grid')} className="flex flex-col gap-3 rounded-card border border-border p-3">
      <h4 className="text-body font-semibold">{t('booking.grid')}</h4>
      <p className="m-0 text-body-sm text-text-2">{t('booking.grid.intro')}</p>
      <div className="grid gap-3 sm:grid-cols-3">
        {text('booking-grid-style', 'booking.line.style', styleCode, setStyleCode)}
        {text('booking-grid-cost', 'booking.line.cost', cost, setCost)}
        {text('booking-grid-mrp', 'booking.line.mrp', mrp, setMrp)}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {text('booking-grid-colours', 'booking.grid.colours', coloursText, setColoursText)}
        {text('booking-grid-sizes', 'booking.grid.sizes', sizesText, setSizesText)}
      </div>
      {colours.length > 0 && sizes.length > 0 && (
        <div className="overflow-x-auto">
          <table className="border-collapse text-body-sm" aria-label={t('booking.grid.cells')}>
            <thead>
              <tr>
                <Th label="booking.line.colour" />
                {sizes.map((size) => (
                  <th key={size} scope="col" className="h-10 bg-sunken px-3 text-left font-semibold text-text-2">
                    {size}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {colours.map((colour) => (
                <tr key={colour} className="border-t border-border">
                  <th scope="row" className="px-3 text-left font-normal">
                    {colour}
                  </th>
                  {sizes.map((size) => (
                    <td key={size} className="px-1 py-1">
                      <input
                        aria-label={t('booking.grid.cell', { colour, size })}
                        inputMode="numeric"
                        className={`${inputClass} w-20`}
                        value={cells[cellKey(colour, size)] ?? ''}
                        onChange={(event) => {
                          setCells({ ...cells, [cellKey(colour, size)]: event.target.value });
                        }}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {problem && <p className="m-0 text-caption font-semibold text-d-fg">{t('booking.grid.invalid')}</p>}
      <div>
        <Button
          label="booking.grid.add"
          onClick={() => {
            const lines = gridLines({ styleCode, cost, mrp, colours, sizes, cells });
            if (lines.length === 0 || lines.some((line) => Object.keys(lineProblems(line)).length > 0)) {
              setProblem(true);
              return;
            }
            setProblem(false);
            onAdd(lines);
            setCells({});
          }}
        />
      </div>
    </section>
  );
}

const FIELDS: readonly { readonly field: keyof LineInput; readonly label: MessageId }[] = [
  { field: 'styleCode', label: 'booking.line.style' },
  { field: 'colour', label: 'booking.line.colour' },
  { field: 'size', label: 'booking.line.size' },
  { field: 'quantity', label: 'booking.line.quantity' },
  { field: 'cost', label: 'booking.line.cost' },
  { field: 'mrp', label: 'booking.line.mrp' },
  { field: 'deliveryDate', label: 'booking.line.delivery-date' },
];

/** The lines, each changed in place or removed; a line with a problem names its fields (PRD-UXP-003). */
function LinesTable({
  lines,
  problems,
  onChange,
}: {
  lines: readonly LineInput[];
  problems: readonly LineProblems[] | undefined;
  onChange: (lines: LineInput[]) => void;
}) {
  return (
    <div className="overflow-x-auto rounded-card border border-border">
      <table className="w-full border-collapse text-body-sm" aria-label={t('booking.lines')}>
        <thead>
          <tr>
            <Th label="booking.line.number" />
            {FIELDS.map(({ field, label }) => (
              <Th key={field} label={label} />
            ))}
            <Th label="booking.line.actions" />
          </tr>
        </thead>
        <tbody>
          {lines.map((line, index) => (
            <tr key={index} className="border-t border-border">
              <td className="px-3 tabular-nums">{formatQuantity(index + 1)}</td>
              {FIELDS.map(({ field, label }) => {
                const invalid = problems?.[index]?.[field] === true;
                return (
                  <td key={field} className="px-1 py-1">
                    <input
                      aria-label={t('booking.line.field', { field: t(label), number: index + 1 })}
                      aria-invalid={invalid}
                      type={field === 'deliveryDate' ? 'date' : 'text'}
                      maxLength={
                        field === 'styleCode' || field === 'colour' || field === 'size'
                          ? BOOKING_CAPS.codeText
                          : undefined
                      }
                      className={`${inputClass} w-full min-w-24 ${invalid ? 'border-d-fg' : ''}`}
                      value={line[field]}
                      onChange={(event) => {
                        onChange(
                          lines.map((each, at) => (at === index ? { ...each, [field]: event.target.value } : each)),
                        );
                      }}
                    />
                  </td>
                );
              })}
              <td className="px-1">
                <Button
                  size="small"
                  variant="ghost"
                  label="booking.line.remove"
                  labelParams={{ number: index + 1 }}
                  onClick={() => {
                    onChange(lines.filter((_each, at) => at !== index));
                  }}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * A new booking, or the next Draft of one (goods-in 3.1). `booking` given: its brand and destination stay, and the
 * form starts from its newest version, each line keeping its key so the next version continues it (3.10). `effective`
 * given, for a change of an approved booking, the window's end and the lines' dates start as extensions left them
 * (3.5). `onSaved` receives the booking saved.
 */
export function BookingForm({
  booking,
  effective,
  waiting,
  onSaved,
}: {
  booking?: Booking;
  effective?: BookingStatus | undefined;
  /** While set, saving waits, its reason the message given: the booking is being read again. */
  waiting?: MessageId | undefined;
  onSaved: (bookingId: string) => void;
}) {
  const isNew = booking === undefined;
  const names = useBookingNames();
  const version = booking?.version;
  const form = useForm<Header>({
    resolver: zodResolver(headerSchema(isNew)),
    mode: 'onBlur',
    defaultValues: {
      brandId: booking?.brandId ?? '',
      destinationSiteId: booking?.destinationSiteId ?? '',
      supplierPartyId: version?.supplierPartyId ?? '',
      seasonValueId: version?.season.valueId ?? '',
      windowFrom: version?.deliveryWindow.from ?? '',
      windowTo: effective?.deliveryWindow.to ?? version?.deliveryWindow.to ?? '',
    },
  });
  const [lines, setLines] = useState<LineInput[]>(
    version?.lines.map((line) =>
      inputOf(line, effective?.lines.find((each) => each.lineKey === line.lineKey)?.deliveryDate ?? line.deliveryDate),
    ) ?? [],
  );
  const [problems, setProblems] = useState<LineProblems[] | undefined>(undefined);
  const record = useSubmission('recordBooking', BOOKING_READS);
  const save = useSubmission('saveBookingDraft', BOOKING_READS);
  const submission = isNew ? record : save;
  const errors = form.formState.errors;
  const complete = lines.map(draftLineOf).filter((line): line is BookingLineDraft => line !== undefined);
  const select = (
    id: string,
    field: 'brandId' | 'destinationSiteId' | 'supplierPartyId' | 'seasonValueId',
    label: MessageId,
    options: readonly { id: string; code: string; versions: readonly { state: string; name?: string }[] }[],
    help?: MessageId,
  ) => (
    <FormField id={id} label={label} required error={errors[field]} {...(help === undefined ? {} : { help })}>
      <select
        id={id}
        className={inputClass}
        {...describedBy(id, { invalid: errors[field] !== undefined, help: help !== undefined })}
        {...form.register(field)}
      >
        <option value="">{t('setup.choose')}</option>
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {optionText(option)}
          </option>
        ))}
      </select>
    </FormField>
  );
  return (
    <form
      id="booking-form"
      aria-label={t(isNew ? 'booking.new' : 'booking.change')}
      noValidate
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        void form.handleSubmit(async (header) => {
          const found = lines.map(lineProblems);
          if (found.some((each) => Object.keys(each).length > 0)) {
            setProblems(found);
            return;
          }
          setProblems(undefined);
          const content = {
            supplierPartyId: header.supplierPartyId,
            seasonValueId: header.seasonValueId,
            deliveryWindow: { from: header.windowFrom, to: header.windowTo },
            lines: complete,
          };
          const saved =
            booking === undefined
              ? await record.submit({
                  body: { brandId: header.brandId, destinationSiteId: header.destinationSiteId, ...content },
                })
              : await save.submit({
                  params: { bookingId: booking.id },
                  body: { versionToken: booking.versionToken, ...content },
                });
          if (saved !== undefined) onSaved(saved.bookingId);
        })(event);
      }}
    >
      <SubmissionBanner state={submission.state} done="booking.saved" />
      <Card title="booking.header">
        <div className="grid gap-3 sm:grid-cols-2">
          {isNew && select('booking-brand', 'brandId', 'booking.brand', names.brands)}
          {isNew &&
            select('booking-site', 'destinationSiteId', 'booking.destination', names.sites, 'booking.destination.help')}
          {select('booking-supplier', 'supplierPartyId', 'booking.supplier', names.suppliers, 'booking.supplier.help')}
          {select('booking-season', 'seasonValueId', 'booking.season', names.seasons, 'booking.season.help')}
          <FormField id="booking-window-from" label="booking.window.from" required error={errors.windowFrom}>
            <input
              id="booking-window-from"
              type="date"
              className={inputClass}
              {...describedBy('booking-window-from', { invalid: errors.windowFrom !== undefined, help: false })}
              {...form.register('windowFrom')}
            />
          </FormField>
          <FormField
            id="booking-window-to"
            label="booking.window.to"
            required
            error={errors.windowTo}
            {...(errors.windowTo?.message === 'booking.window.invalid' ? { message: 'booking.window.invalid' } : {})}
          >
            <input
              id="booking-window-to"
              type="date"
              className={inputClass}
              {...describedBy('booking-window-to', { invalid: errors.windowTo !== undefined, help: false })}
              {...form.register('windowTo')}
            />
          </FormField>
        </div>
        {names.seasonMarked === 'not-set' && (
          <p role="status" className="m-0 text-body-sm text-text-2">
            {t('budget.season.not-marked')}
          </p>
        )}
      </Card>
      <Card title="booking.lines">
        <GridBuilder
          onAdd={(added) => {
            setLines([...lines, ...added]);
          }}
        />
        {lines.length === 0 ? (
          <p className="m-0 text-body-sm text-text-2">{t('booking.lines.none')}</p>
        ) : (
          <LinesTable lines={lines} problems={problems} onChange={setLines} />
        )}
        {problems !== undefined && (
          <p role="alert" className="m-0 text-caption font-semibold text-d-fg">
            {t('booking.lines.invalid')}
          </p>
        )}
        <div>
          <Button
            label="booking.line.add"
            onClick={() => {
              setLines([...lines, EMPTY_LINE]);
            }}
          />
        </div>
      </Card>
      <Card title="booking.totals">
        <TotalsView lines={complete} />
        <p className="m-0 text-caption text-text-2">{t('booking.totals.note')}</p>
      </Card>
      <div>
        <Button
          type="submit"
          variant="primary"
          label="booking.save"
          disabled={submission.state.kind === 'pending' || waiting !== undefined}
          {...(waiting === undefined ? {} : { reason: waiting })}
        />
      </div>
    </form>
  );
}
