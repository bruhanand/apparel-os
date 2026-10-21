import { zodResolver } from '@hookform/resolvers/zod';
import {
  ARRIVAL_TYPE,
  GRN_TYPE,
  RECEIVING_CAPS,
  type Arrival,
  type CountLine,
  type EvidenceFile,
  type Inbox,
} from '@apparel-os/schemas';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { api } from '../api';
import { useSubmission } from '../api/command';
import { readQuery } from '../api/query';
import { Banner } from '../components/Banner';
import { Button } from '../components/Button';
import { StatusBadge } from '../components/StatusBadge';
import { missingText } from '../components/UnavailableState';
import { EvidenceList, EvidencePicker, useChosenFile, useStoreEvidence } from '../files/Evidence';
import { describedBy, FormField } from '../forms/FormField';
import { AsOf } from '../history/AsOf';
import { formatDateTime } from '../history/format';
import { useMarkedAttribute } from '../merchandise/marked';
import { t } from '../messages/catalogue';
import { useBusinessToday } from '../setup/business-date';
import { formatDate, formatList, formatQuantity } from '../setup/format';
import { Card, GrantedButton, inputClass, ListRead, SubmissionBanner, Th, Toolbar, useGranted } from '../setup/parts';
import { stateIdOf } from '../setup/states';
import { useTimeZone } from '../shell/session';
import { optionText, unknownText, useMasterNames, useProducts } from './names';

// Receive Goods › an Arrival: its details, its supplier invoices first, its photos, the count line by line and its GRN
// (goods-in 4.2 to 4.5, section 11; PRD-REC-003 to PRD-REC-008; DEC-133, DEC-138; S2-F02-T02). The count is saved as
// it goes and resumed by anyone counting; a line names its product where one is set up, with its batch and expiry
// where the product's tracking profile requires them. The GRN is issued with no approval once nothing blocks it, and
// is printed with quantities only, never a price, tax or value. Dates read DD MMM YYYY and times the Organisation's
// (design-language 8); anything the reader cannot name is Unknown, never an identifier (PRD-MOD-015).

/** The reads a change of an Arrival makes stale. */
const ARRIVAL_READS = ['readArrival', 'readReceivingInbox'] as const;

/**
 * Whether the Arrival is being read again, as it is after every change saved here, which makes the versions it showed
 * stale. An action that names a version the screen shows (issuing the GRN, changing or removing a line) waits for the
 * read, so it never sends the version a save has just replaced (code-house-rules 12.7): `shown` disables it on screen,
 * and `now` asks the read itself when it is pressed, before the screen has caught up with a save.
 */
interface Reading {
  readonly shown: boolean;
  readonly now: () => boolean;
}

/** The reason a version-checked action waits while the Arrival is read again. */
const READING = 'receive.reading-again';

type Unit = Inbox['units'][number];

/** A person's name from their sign-in, as the Arrival names them; Unknown when it does not (PRD-MOD-015). */
function personOf(arrival: Arrival, userId: string): string {
  return arrival.people.find((each) => each.userId === userId)?.name ?? unknownText();
}

/** The people named, as one text. */
const peopleOf = (arrival: Arrival, userIds: readonly string[]) =>
  formatList(userIds.map((id) => personOf(arrival, id)));

/** A document's number and its date as design-language 8 writes it: "<number> of DD MMM YYYY". */
const numberOfDate = (number: string, date: string) => t('receive.number-of-date', { number, date: formatDate(date) });

/** A batch and its expiry date, "<code>, expires DD MMM YYYY", or None. */
const batchText = (batch: { readonly code: string; readonly expiryDate: string } | null) =>
  batch === null
    ? t('receive.none')
    : t('receive.batch.text', { code: batch.code, date: formatDate(batch.expiryDate) });

/** A table cell's text; an Unknown value is a blank cell that a screen reader reads as unknown (design-language 8). */
function Cell({ text, numeric = false }: { text: string | undefined; numeric?: boolean }) {
  return (
    <td className={numeric ? 'px-3 tabular-nums' : 'px-3'}>
      {text ?? <span className="sr-only">{unknownText()}</span>}
    </td>
  );
}

function Facts({ rows }: { rows: readonly (readonly [Parameters<typeof t>[0], string])[] }) {
  return (
    <dl className="m-0 grid grid-cols-[max-content_1fr] gap-x-4 gap-y-2 text-body-sm">
      {rows.map(([label, text]) => (
        <div key={label} className="contents">
          <dt className="text-text-2">{t(label)}</dt>
          <dd className="m-0 break-words">{text}</dd>
        </div>
      ))}
    </dl>
  );
}

const invoiceFormSchema = z.object({ number: z.string().trim().min(1), date: z.iso.date() });
type InvoiceForm = z.input<typeof invoiceFormSchema>;

/**
 * A supplier invoice with its file (goods-in 4.2; DEC-133). A number the supplier used on another Arrival is refused
 * as a possible duplicate; the receiver corrects it, or confirms it is right and records it.
 */
function InvoiceForm({ arrival }: { arrival: Arrival }) {
  const form = useForm<InvoiceForm>({
    resolver: zodResolver(invoiceFormSchema),
    mode: 'onBlur',
    defaultValues: { number: '', date: '' },
  });
  const chosen = useChosenFile();
  const storing = useStoreEvidence();
  const submission = useSubmission('recordArrivalInvoice', ARRIVAL_READS);
  const [stored, setStored] = useState<EvidenceFile | null>(null);
  const [fileMissing, setFileMissing] = useState(false);
  const errors = form.formState.errors;
  const duplicate =
    submission.state.kind === 'refused' && submission.state.refusal?.code === 'receiving.possible-duplicate-invoice';
  const send = async (entered: InvoiceForm, confirm: boolean) => {
    let file = stored;
    if (file === null) {
      if (chosen.file === null) {
        setFileMissing(true);
        return;
      }
      file = (await storing.store(chosen.file)) ?? null;
      if (file === null) return;
      setStored(file);
    }
    const recorded = await submission.submit({
      params: { arrivalId: arrival.id },
      body: {
        number: entered.number,
        date: entered.date,
        file,
        ...(confirm ? { confirmPossibleDuplicate: true } : {}),
      },
    });
    if (recorded !== undefined) {
      form.reset();
      chosen.clear();
      setStored(null);
    }
  };
  return (
    <form
      id="receive-invoice-form"
      aria-label={t('receive.add-invoice')}
      noValidate
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        void form.handleSubmit((entered) => send(entered, false))(event);
      }}
    >
      {storing.banner}
      <SubmissionBanner state={submission.state} done="receive.invoice-added" />
      {duplicate && (
        <div className="flex flex-col gap-2">
          <p className="m-0 text-body-sm">{t('receive.duplicate-note')}</p>
          <div>
            <Button
              label="receive.confirm-duplicate"
              onClick={() => {
                void form.handleSubmit((entered) => send(entered, true))();
              }}
            />
          </div>
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField id="receive-invoice-number" label="receive.invoice-number" required error={errors.number}>
          <input
            id="receive-invoice-number"
            maxLength={RECEIVING_CAPS.codeText}
            className={inputClass}
            {...describedBy('receive-invoice-number', { invalid: errors.number !== undefined, help: false })}
            {...form.register('number')}
          />
        </FormField>
        <FormField id="receive-invoice-date" label="receive.invoice-date" required error={errors.date}>
          <input
            id="receive-invoice-date"
            type="date"
            className={inputClass}
            {...describedBy('receive-invoice-date', { invalid: errors.date !== undefined, help: false })}
            {...form.register('date')}
          />
        </FormField>
      </div>
      <EvidencePicker
        id="receive-invoice-file"
        label="receive.invoice-file"
        resetKey={chosen.resetKey}
        onChange={(file) => {
          chosen.choose(file);
          setStored(null);
          setFileMissing(false);
        }}
      />
      {fileMissing && <p className="m-0 text-caption font-semibold text-d-fg">{t('receive.invoice-file.missing')}</p>}
      <div>
        <Button
          type="submit"
          variant="primary"
          label="receive.add-invoice"
          disabled={submission.state.kind === 'pending'}
        />
      </div>
    </form>
  );
}

/** Photos of the cartons, seals and any damage (PRD-REC-007). */
function PhotoForm({ arrival }: { arrival: Arrival }) {
  const chosen = useChosenFile();
  const storing = useStoreEvidence();
  const submission = useSubmission('attachArrivalPhotos', ARRIVAL_READS);
  return (
    <div className="flex flex-col gap-2">
      {storing.banner}
      <SubmissionBanner state={submission.state} done="receive.photos-added" />
      <EvidencePicker
        id="receive-photo-file"
        label="receive.photo-file"
        resetKey={chosen.resetKey}
        onChange={chosen.choose}
      />
      <div>
        <Button
          label="receive.add-photo"
          disabled={chosen.file === null || submission.state.kind === 'pending'}
          onClick={() => {
            void (async () => {
              if (chosen.file === null) return;
              const file = await storing.store(chosen.file);
              if (file === undefined) return;
              const added = await submission.submit({ params: { arrivalId: arrival.id }, body: { files: [file] } });
              if (added !== undefined) chosen.clear();
            })();
          }}
        />
      </div>
    </div>
  );
}

/** Whole pieces, up to the cap on a line (goods-in 4.8 "Input caps"). */
const pieces = z
  .string()
  .regex(/^\d{1,7}$/, { message: 'receive.pieces.invalid' })
  .refine((text) => Number(text) <= RECEIVING_CAPS.pieces, { message: 'receive.pieces.invalid' })
  .transform((text) => Number(text));

const lineFormSchema = z
  .object({
    styleCode: z.string().trim().min(1),
    colour: z.string(),
    sizeValueId: z.string(),
    skuId: z.string(),
    batchCode: z.string(),
    expiryDate: z.string(),
    invoiceQuantity: pieces,
    countedQuantity: pieces,
  })
  .refine((line) => line.invoiceQuantity > 0 || line.countedQuantity > 0, {
    message: 'receive.pieces.none',
    path: ['countedQuantity'],
  })
  .refine((line) => (line.batchCode.trim() === '') === (line.expiryDate === ''), {
    message: 'receive.batch.both',
    path: ['expiryDate'],
  });
type LineFormInput = z.input<typeof lineFormSchema>;
type LineFormOutput = z.output<typeof lineFormSchema>;

function lineDefaults(line: CountLine | undefined): LineFormInput {
  return {
    styleCode: line?.styleCode ?? '',
    colour: line?.colour ?? '',
    sizeValueId: line?.size?.valueId ?? '',
    skuId: line?.skuId ?? '',
    batchCode: line?.batch?.code ?? '',
    expiryDate: line?.batch?.expiryDate ?? '',
    invoiceQuantity: line === undefined ? '' : String(line.invoiceQuantity),
    countedQuantity: line === undefined ? '' : String(line.countedQuantity),
  };
}

/**
 * One line of the count, by style code as the invoice writes it, colour as it names it and size from the size list,
 * the values of the attribute the Organisation marks as its size list (RR-556), with the invoice and counted
 * quantities (goods-in 4.3; DEC-138). A missing colour or size stays missing
 * (PRD-MER-005). The product is one of the Arrival's brand with the line's style code, when one is set up; its batch
 * and expiry are asked for where its tracking profile at the Site requires them (PRD-MER-011), and the GRN waits for
 * them. Editing a line names the version shown (code-house-rules 12.7).
 */
function LineForm({
  arrival,
  editing,
  reading,
  onDone,
}: {
  arrival: Arrival;
  editing?: CountLine | undefined;
  reading: Reading;
  onDone: () => void;
}) {
  const today = useBusinessToday();
  const sizeList = useMarkedAttribute('size');
  const values = useQuery({
    ...readQuery(api, 'listVocabularyValues', { query: {} }),
    enabled: useGranted('merchandise.vocabulary_value', 'view'),
  });
  const products = useProducts();
  const maySeeSkus = useGranted('merchandise.sku', 'view');
  const form = useForm<LineFormInput, unknown, LineFormOutput>({
    resolver: zodResolver(lineFormSchema),
    mode: 'onBlur',
    defaultValues: lineDefaults(editing),
  });
  const submission = useSubmission('saveCountLine', ARRIVAL_READS);
  const errors = form.formState.errors;
  const attributeId = sizeList.kind === 'set' ? sizeList.attributeId : undefined;
  const skus = products.of(arrival.brandId, form.watch('styleCode'));
  const skuId = form.watch('skuId');
  const named = skus.some((sku) => sku.id === skuId);
  const tracking = useQuery({
    ...readQuery(api, 'readSkuAsOf', { params: { recordId: skuId }, query: { date: today, siteId: arrival.siteId } }),
    enabled: named && maySeeSkus,
  });
  const batchRequired = named && tracking.data?.sku.tracking?.batchExpiryRequired === true;
  const sizes = (values.data?.records ?? []).filter((each) => each.attributeId === attributeId);
  const formId = editing === undefined ? 'receive-line-form' : `receive-line-form-${editing.lineId}`;
  const field = (name: string) => `${formId}-${name}`;
  return (
    <form
      id={formId}
      aria-label={t(editing === undefined ? 'receive.add-line' : 'receive.edit-line')}
      noValidate
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        void form.handleSubmit(async (entered) => {
          // A change names the line's version shown: it waits while the Arrival is read again (12.7).
          if (editing !== undefined && reading.now()) return;
          const saved = await submission.submit({
            params: { arrivalId: arrival.id },
            body: {
              ...(editing === undefined
                ? {}
                : { line: { lineId: editing.lineId, versionToken: editing.versionToken } }),
              styleCode: entered.styleCode,
              colour: entered.colour.trim() === '' ? null : entered.colour,
              sizeValueId: entered.sizeValueId === '' ? null : entered.sizeValueId,
              skuId: named ? entered.skuId : null,
              invoiceQuantity: entered.invoiceQuantity,
              countedQuantity: entered.countedQuantity,
              batch:
                batchRequired && entered.batchCode.trim() !== ''
                  ? { code: entered.batchCode, expiryDate: entered.expiryDate }
                  : null,
            },
          });
          if (saved !== undefined) {
            form.reset(lineDefaults(undefined));
            onDone();
          }
        })(event);
      }}
    >
      <SubmissionBanner state={submission.state} done="receive.line-saved" />
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField id={field('style')} label="receive.style-code" required error={errors.styleCode}>
          <input
            id={field('style')}
            maxLength={RECEIVING_CAPS.codeText}
            className={inputClass}
            {...describedBy(field('style'), { invalid: errors.styleCode !== undefined, help: false })}
            {...form.register('styleCode')}
          />
        </FormField>
        <FormField id={field('colour')} label="receive.colour" help="receive.colour.help">
          <input
            id={field('colour')}
            maxLength={RECEIVING_CAPS.codeText}
            className={inputClass}
            {...describedBy(field('colour'), { invalid: false, help: true })}
            {...form.register('colour')}
          />
        </FormField>
        <FormField id={field('size')} label="receive.size" help="receive.size.help">
          <select
            id={field('size')}
            className={inputClass}
            {...describedBy(field('size'), { invalid: false, help: true })}
            {...form.register('sizeValueId')}
          >
            <option value="">{t('receive.no-size')}</option>
            {sizes.map((each) => (
              <option key={each.id} value={each.id}>
                {optionText(each)}
              </option>
            ))}
          </select>
          {sizeList.kind === 'not-set' && (
            <p role="status" className="m-0 text-body-sm text-text-2">
              {t('receive.size.not-marked')}
            </p>
          )}
        </FormField>
        <FormField id={field('product')} label="receive.product" help="receive.product.help">
          <select
            id={field('product')}
            className={inputClass}
            {...describedBy(field('product'), { invalid: false, help: true })}
            {...form.register('skuId')}
          >
            <option value="">{t('receive.no-product')}</option>
            {skus.map((sku) => (
              <option key={sku.id} value={sku.id}>
                {sku.code}
              </option>
            ))}
          </select>
        </FormField>
        <FormField
          id={field('invoice')}
          label="receive.invoice-quantity"
          required
          error={errors.invoiceQuantity}
          message={errors.invoiceQuantity === undefined ? undefined : 'receive.pieces.invalid'}
        >
          <input
            id={field('invoice')}
            inputMode="numeric"
            className={inputClass}
            {...describedBy(field('invoice'), { invalid: errors.invoiceQuantity !== undefined, help: false })}
            {...form.register('invoiceQuantity')}
          />
        </FormField>
        <FormField
          id={field('counted')}
          label="receive.counted-quantity"
          required
          error={errors.countedQuantity}
          message={
            errors.countedQuantity === undefined
              ? undefined
              : errors.countedQuantity.message === 'receive.pieces.none'
                ? 'receive.pieces.none'
                : 'receive.pieces.invalid'
          }
        >
          <input
            id={field('counted')}
            inputMode="numeric"
            className={inputClass}
            {...describedBy(field('counted'), { invalid: errors.countedQuantity !== undefined, help: false })}
            {...form.register('countedQuantity')}
          />
        </FormField>
        {batchRequired && (
          <>
            <FormField id={field('batch')} label="receive.batch-code" help="receive.batch.help">
              <input
                id={field('batch')}
                maxLength={RECEIVING_CAPS.codeText}
                className={inputClass}
                {...describedBy(field('batch'), { invalid: false, help: true })}
                {...form.register('batchCode')}
              />
            </FormField>
            <FormField
              id={field('expiry')}
              label="receive.expiry-date"
              error={errors.expiryDate}
              message={errors.expiryDate === undefined ? undefined : 'receive.batch.both'}
            >
              <input
                id={field('expiry')}
                type="date"
                className={inputClass}
                {...describedBy(field('expiry'), { invalid: errors.expiryDate !== undefined, help: false })}
                {...form.register('expiryDate')}
              />
            </FormField>
          </>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          type="submit"
          variant="primary"
          label={editing === undefined ? 'receive.save-line' : 'receive.save-change'}
          disabled={submission.state.kind === 'pending' || (editing !== undefined && reading.shown)}
          {...(editing !== undefined && reading.shown ? { reason: READING } : {})}
        />
        {editing !== undefined && <Button label="action.cancel" onClick={onDone} />}
      </div>
    </form>
  );
}

/** The lines of the count as they stand, each with who counted it, and its edit and removal while it is counted. */
function CountTable({ arrival, open, reading }: { arrival: Arrival; open: boolean; reading: Reading }) {
  const [editing, setEditing] = useState<string | null>(null);
  const removal = useSubmission('removeCountLine', ARRIVAL_READS);
  const mayEdit = useGranted(ARRIVAL_TYPE, 'edit');
  const products = useProducts();
  return (
    <div className="flex flex-col gap-3">
      <SubmissionBanner state={removal.state} done="receive.line-removed" />
      <div className="overflow-x-auto rounded-card border border-border bg-surface">
        <table className="w-full border-collapse text-body" aria-label={t('receive.lines')}>
          <thead>
            <tr>
              <Th label="receive.style-code" />
              <Th label="receive.colour" />
              <Th label="receive.size" />
              <Th label="receive.product" />
              <Th label="receive.batch" />
              <Th label="receive.invoice-quantity" />
              <Th label="receive.counted-quantity" />
              <Th label="receive.counted-by" />
              {open && mayEdit && <Th label="receive.line-actions" />}
            </tr>
          </thead>
          <tbody>
            {arrival.lines.map((line) => (
              <tr key={line.lineId} className="h-10 border-t border-border">
                <Cell text={line.styleCode} />
                <Cell text={line.colour ?? t('receive.none')} />
                <Cell text={line.size?.code ?? t('receive.none')} />
                <Cell text={line.skuId === null ? t('receive.none') : products.skuText(line.skuId)} />
                <Cell text={batchText(line.batch)} />
                <Cell text={formatQuantity(line.invoiceQuantity)} numeric />
                <Cell text={formatQuantity(line.countedQuantity)} numeric />
                <Cell text={peopleOf(arrival, line.countedBy)} />
                {open && mayEdit && (
                  <td className="px-3">
                    <span className="flex flex-wrap gap-2">
                      <Button
                        size="small"
                        variant="ghost"
                        label="receive.edit-line"
                        disabled={reading.shown}
                        {...(reading.shown ? { reason: READING } : {})}
                        onClick={() => {
                          setEditing(line.lineId);
                        }}
                      />
                      <Button
                        size="small"
                        variant="ghost"
                        label="receive.remove-line"
                        disabled={removal.state.kind === 'pending' || reading.shown}
                        {...(reading.shown ? { reason: READING } : {})}
                        onClick={() => {
                          if (reading.now()) return;
                          void removal.submit({
                            params: { arrivalId: arrival.id, lineId: line.lineId },
                            body: { lineVersionToken: line.versionToken },
                          });
                        }}
                      />
                    </span>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {open && mayEdit && (
        <Card title={editing === null ? 'receive.add-line' : 'receive.edit-line'}>
          {editing === null ? (
            <LineForm key="new" arrival={arrival} reading={reading} onDone={() => undefined} />
          ) : (
            <LineForm
              key={editing}
              arrival={arrival}
              editing={arrival.lines.find((line) => line.lineId === editing)}
              reading={reading}
              onDone={() => {
                setEditing(null);
              }}
            />
          )}
        </Card>
      )}
    </div>
  );
}

/**
 * Issue the GRN, with no approval, once nothing blocks it (goods-in 4.5). It names the Arrival's version shown, so it
 * waits while the Arrival is read again after a change (code-house-rules 12.7).
 */
function IssueGrn({ arrival, reading }: { arrival: Arrival; reading: Reading }) {
  const submission = useSubmission('issueGrn', ARRIVAL_READS);
  return (
    <Card title="receive.issue">
      <SubmissionBanner state={submission.state} done="receive.grn-issued" />
      {arrival.blocking.length > 0 && (
        <div className="flex flex-col gap-1">
          <p className="m-0 text-body-sm font-semibold">{t('receive.blocked')}</p>
          <ul aria-label={t('receive.blocked')} className="m-0 list-disc pl-5 text-body-sm">
            {arrival.blocking.map((item, index) => (
              <li key={index}>{missingText(item)}</li>
            ))}
          </ul>
        </div>
      )}
      <p className="m-0 text-body-sm text-text-2">{t('receive.issue.intro')}</p>
      <div>
        <GrantedButton
          label="receive.issue-grn"
          recordType={GRN_TYPE}
          action="create"
          variant="primary"
          waiting={reading.shown ? READING : undefined}
          onClick={() => {
            if (reading.now()) return;
            void submission.submit({ params: { arrivalId: arrival.id }, body: { versionToken: arrival.versionToken } });
          }}
        />
      </div>
    </Card>
  );
}

/** The GRN as printed: its header and lines, quantities only, never a price, tax or value (goods-in 4.5). */
function GrnPrint({ arrival, unit, location }: { arrival: Arrival; unit: string; location: string }) {
  const timeZone = useTimeZone();
  const names = useMasterNames();
  const products = useProducts();
  const grn = arrival.grn;
  if (grn === null) return null;
  return (
    <section
      aria-label={t('receive.grn', { number: grn.number })}
      className="flex flex-col gap-3 rounded-card border border-border bg-surface p-4"
    >
      <div className="flex flex-wrap items-center gap-3">
        <h3 className="text-h3 font-semibold">{t('receive.grn', { number: grn.number })}</h3>
        <span className="flex-1" />
        <Button
          label="receive.print"
          onClick={() => {
            window.print();
          }}
        />
      </div>
      <Facts
        rows={[
          ['receive.grn.date', formatDate(grn.businessDate)],
          ['receive.supplier', names.partyText(arrival.supplierPartyId) ?? unknownText()],
          ['receive.brand', names.brandText(arrival.brandId) ?? unknownText()],
          ['receive.unit', unit],
          ['receive.location', location],
          [
            'receive.invoices',
            formatList(arrival.invoices.map((invoice) => numberOfDate(invoice.number, invoice.date))),
          ],
          ['receive.transporter', arrival.transporter],
          ['receive.lorry-receipt', numberOfDate(arrival.lorryReceipt.number, arrival.lorryReceipt.date)],
          ['receive.vehicle-number', arrival.vehicleNumber ?? t('receive.none')],
          ['receive.eway-bill-number', arrival.ewayBillNumber ?? t('receive.none')],
          ['receive.cartons', formatQuantity(arrival.cartons)],
          ['receive.arrived-at', formatDateTime(arrival.arrivedAt, timeZone)],
          ['receive.grn.counted-by', peopleOf(arrival, grn.countedBy)],
          [
            'receive.grn.entered-by',
            t('receive.grn.entered-at', {
              name: personOf(arrival, grn.enteredBy),
              at: formatDateTime(grn.issuedAt, timeZone),
            }),
          ],
        ]}
      />
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-body" aria-label={t('receive.grn-lines')}>
          <thead>
            <tr>
              <Th label="receive.line-number" />
              <Th label="receive.style-code" />
              <Th label="receive.colour" />
              <Th label="receive.size" />
              <Th label="receive.product" />
              <Th label="receive.batch" />
              <Th label="receive.invoice-quantity" />
              <Th label="receive.counted-quantity" />
            </tr>
          </thead>
          <tbody>
            {grn.lines.map((line) => (
              <tr key={line.lineNumber} className="h-10 border-t border-border">
                <Cell text={formatQuantity(line.lineNumber)} numeric />
                <Cell text={line.styleCode} />
                <Cell text={line.colour ?? t('receive.none')} />
                <Cell text={line.size ?? t('receive.none')} />
                <Cell text={line.skuId === null ? t('receive.none') : products.skuText(line.skuId)} />
                <Cell text={batchText(line.batch)} />
                <Cell text={formatQuantity(line.invoiceQuantity)} numeric />
                <Cell text={formatQuantity(line.countedQuantity)} numeric />
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="m-0 text-caption text-text-2">{t('receive.grn.note')}</p>
    </section>
  );
}

/** Receive Goods › an Arrival, opened from the inbox. */
export function ArrivalView({
  arrivalId,
  units,
  onBack,
}: {
  arrivalId: string;
  units: readonly Unit[];
  onBack: () => void;
}) {
  const timeZone = useTimeZone();
  const names = useMasterNames();
  const mayEdit = useGranted(ARRIVAL_TYPE, 'edit');
  const queryClient = useQueryClient();
  const read = readQuery(api, 'readArrival', { params: { arrivalId } });
  const query = useQuery(read);
  const reading: Reading = {
    shown: query.isFetching,
    now: () => queryClient.isFetching({ queryKey: read.queryKey }) > 0,
  };
  return (
    <div className="flex flex-col gap-4">
      <Toolbar>
        <Button label="receive.back" onClick={onBack} />
        <span className="flex-1" />
        <Button
          label="setup.refresh"
          onClick={() => {
            void query.refetch();
          }}
        />
      </Toolbar>
      <ListRead query={query} what="receive.arrival.what">
        {({ asOf, arrival }) => {
          const unit = units.find((each) => each.businessUnitId === arrival.businessUnitId);
          const unitText =
            unit === undefined ? unknownText() : t('receive.option', { code: unit.code, name: unit.name });
          const location = unit?.locations.find((each) => each.id === arrival.receivingLocationId);
          const locationText =
            location === undefined ? unknownText() : t('receive.option', { code: location.code, name: location.name });
          const supplierText = names.partyText(arrival.supplierPartyId) ?? unknownText();
          const open = arrival.state === 'In progress';
          return (
            <div className="flex flex-col gap-4">
              <div className="flex flex-wrap items-center gap-3">
                <h2 className="text-h2 font-semibold">{t('receive.arrival.title', { supplier: supplierText })}</h2>
                <StatusBadge state={stateIdOf(arrival.state)} />
                <span className="flex-1" />
                <AsOf asOf={asOf} timeZone={timeZone} />
              </div>
              <Card title="receive.details">
                <Facts
                  rows={[
                    ['receive.unit', unitText],
                    ['receive.location', locationText],
                    ['receive.supplier', supplierText],
                    ['receive.brand', names.brandText(arrival.brandId) ?? unknownText()],
                    ['receive.transporter', arrival.transporter],
                    ['receive.lorry-receipt', numberOfDate(arrival.lorryReceipt.number, arrival.lorryReceipt.date)],
                    ['receive.vehicle-number', arrival.vehicleNumber ?? t('receive.none')],
                    ['receive.eway-bill-number', arrival.ewayBillNumber ?? t('receive.none')],
                    ['receive.cartons', formatQuantity(arrival.cartons)],
                    ['receive.arrived-at', formatDateTime(arrival.arrivedAt, timeZone)],
                    [
                      'receive.recorded-by',
                      t('receive.recorded-at', {
                        name: personOf(arrival, arrival.recordedBy),
                        at: formatDateTime(arrival.recordedAt, timeZone),
                      }),
                    ],
                  ]}
                />
              </Card>
              <Card title="receive.invoices">
                {arrival.invoices.length === 0 ? (
                  <Banner tone="warning" role="status" message="receive.invoices.first" />
                ) : (
                  <ul aria-label={t('receive.invoices')} className="m-0 flex list-none flex-col gap-3 p-0">
                    {arrival.invoices.map((invoice) => (
                      <li key={invoice.id} className="flex flex-col gap-1 border-t border-border pt-2">
                        <span className="font-semibold">
                          {t('receive.invoice.line', { number: invoice.number, date: formatDate(invoice.date) })}
                        </span>
                        {(invoice.possibleDuplicateOf.length > 0 || invoice.possibleDuplicateElsewhere) && (
                          <span className="text-caption text-text-2">{t('receive.invoice.duplicate-confirmed')}</span>
                        )}
                        <EvidenceList attachmentIds={[invoice.attachmentId]} />
                      </li>
                    ))}
                  </ul>
                )}
                {open && mayEdit && <InvoiceForm arrival={arrival} />}
              </Card>
              <Card title="receive.photos">
                <EvidenceList attachmentIds={arrival.photoAttachmentIds} />
                {open && mayEdit && <PhotoForm arrival={arrival} />}
              </Card>
              <Card title="receive.count">
                <p className="m-0 text-body-sm text-text-2">{t('receive.count.intro')}</p>
                {arrival.invoices.length === 0 && open ? (
                  <p className="m-0 text-body-sm">{t('error.receiving.invoice-required')}</p>
                ) : (
                  <CountTable arrival={arrival} open={open} reading={reading} />
                )}
              </Card>
              {open ? (
                <IssueGrn arrival={arrival} reading={reading} />
              ) : (
                <GrnPrint arrival={arrival} unit={unitText} location={locationText} />
              )}
            </div>
          );
        }}
      </ListRead>
    </div>
  );
}
