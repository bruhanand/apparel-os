import {
  BOOKING_TYPE,
  type Booking,
  type BookingLineStatus,
  type BookingStatus,
  type EvidenceFile,
} from '@apparel-os/schemas';
import { useState } from 'react';
import { useSubmission } from '../api/command';
import { ApprovalPanel } from '../approvals/ApprovalPanel';
import { Button } from '../components/Button';
import { StatusBadge } from '../components/StatusBadge';
import { EvidenceList, EvidencePicker, useChosenFile, useStoreEvidence } from '../files/Evidence';
import { FormField } from '../forms/FormField';
import { formatDateTime } from '../history/format';
import { t, type MessageId } from '../messages/catalogue';
import { formatDate, formatQuantity } from '../setup/format';
import { Card, GrantedButton, inputClass, SubmissionBanner } from '../setup/parts';
import { stateIdOf } from '../setup/states';
import { AmendmentLines, extensionEnd } from './AmendmentLines';
import { ReceiptLinkLines } from './ReceiptLinkLines';
import { BOOKING_READS } from './BookingForm';
import { given } from './StatusView';

// An approved booking's lifecycle on its screen (goods-in 3.4 to 3.8, 3.10, section 11; PRD-BKG-005, PRD-BKG-013;
// POL-05.01, POL-05.04, POL-05.07; DEC-099; S2-F01-T04): the version in force with each line's ordered, delivered,
// cancelled and outstanding quantities and whether it is overdue; Issued and Confirmed, recorded by Booking with their
// dates since nothing is sent from the app; a cancellation of an undelivered balance and an extension of the window,
// each proposed here and approved by a different person in My work; and the amendments proposed. Each action names the
// version token the screen shows, so it waits while the booking is read again (code-house-rules 12.7).

/** The reason a version-checked action waits while the booking is read again. */
const READING: MessageId = 'booking.reading-again';

/**
 * The supplier's communication with a change, a cancellation or an extension after issue (goods-in 3.5; POL-05.04):
 * a file stored first, then handed to the command. `files` answers the evidence, nothing when no file is needed or
 * chosen, or undefined when storing it was refused.
 */
export function useCommunication(id: string, needed: boolean) {
  const chosen = useChosenFile();
  const storing = useStoreEvidence();
  return {
    element: needed ? (
      <div className="flex flex-col gap-1">
        {storing.banner}
        <EvidencePicker id={id} label="booking.communication" resetKey={chosen.resetKey} onChange={chosen.choose} />
        <p className="m-0 text-caption text-text-2">{t('booking.communication.help')}</p>
      </div>
    ) : null,
    files: async (): Promise<{ readonly communication?: EvidenceFile[] } | undefined> => {
      if (!needed || chosen.file === null) return {};
      const file = await storing.store(chosen.file);
      return file === undefined ? undefined : { communication: [file] };
    },
    clear: chosen.clear,
  };
}

/** Whether the version in force was issued, so a change of it carries the supplier's communication (POL-05.04). */
export const issued = (booking: Booking) => booking.issue !== undefined;

function DateField({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: MessageId;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <FormField id={id} label={label} required>
      <input
        id={id}
        type="date"
        className={inputClass}
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
        }}
      />
    </FormField>
  );
}

/** Records that the approved version in force was sent to the supplier (goods-in 3.4; DEC-099). */
export function IssueCard({ booking, waiting }: { booking: Booking; waiting: boolean }) {
  const [date, setDate] = useState('');
  const submission = useSubmission('recordBookingIssue', BOOKING_READS);
  return (
    <Card title="booking.issue.title">
      <SubmissionBanner state={submission.state} done="booking.issued" />
      <p className="m-0 text-body-sm text-text-2">{t('booking.issue.intro')}</p>
      <div className="grid gap-3 sm:grid-cols-3">
        <DateField id="booking-issued-on" label="booking.issue.date" value={date} onChange={setDate} />
      </div>
      <div>
        <GrantedButton
          label="booking.issue.record"
          recordType={BOOKING_TYPE}
          action="edit"
          waiting={waiting ? READING : date === '' ? 'booking.needs-date' : undefined}
          onClick={() => {
            void submission.submit({
              params: { bookingId: booking.id },
              body: { versionToken: booking.versionToken, issuedOn: date },
            });
          }}
        />
      </div>
    </Card>
  );
}

/** Records the supplier's acceptance of the version issued, with their confirmation (goods-in 3.4; POL-05.01). */
export function ConfirmCard({ booking, waiting }: { booking: Booking; waiting: boolean }) {
  const [date, setDate] = useState('');
  const chosen = useChosenFile();
  const storing = useStoreEvidence();
  const submission = useSubmission('recordBookingConfirmation', BOOKING_READS);
  return (
    <Card title="booking.confirm.title">
      {storing.banner}
      <SubmissionBanner state={submission.state} done="booking.confirmed" />
      <p className="m-0 text-body-sm text-text-2">{t('booking.confirm.intro')}</p>
      <div className="grid gap-3 sm:grid-cols-3">
        <DateField id="booking-confirmed-on" label="booking.confirm.date" value={date} onChange={setDate} />
      </div>
      <EvidencePicker
        id="booking-confirmation-file"
        label="booking.confirm.file"
        resetKey={chosen.resetKey}
        onChange={chosen.choose}
      />
      <div>
        <GrantedButton
          label="booking.confirm.record"
          recordType={BOOKING_TYPE}
          action="edit"
          waiting={
            waiting
              ? READING
              : date === ''
                ? 'booking.needs-date'
                : chosen.file === null
                  ? 'booking.needs-file'
                  : undefined
          }
          onClick={() => {
            void (async () => {
              if (chosen.file === null) return;
              const file = await storing.store(chosen.file);
              if (file === undefined) return;
              const done = await submission.submit({
                params: { bookingId: booking.id },
                body: { versionToken: booking.versionToken, confirmedOn: date, files: [file] },
              });
              if (done !== undefined) chosen.clear();
            })();
          }}
        />
      </div>
    </Card>
  );
}

const lineText = (line: BookingLineStatus) =>
  t('booking.cancel.line', {
    number: line.lineNumber,
    style: line.styleCode,
    colour: given(line.colour),
    size: given(line.size),
    outstanding: formatQuantity(line.outstanding),
  });

/**
 * Proposes cancelling the undelivered balance of chosen lines, or of the whole booking (goods-in 3.5; POL-05.07,
 * PRD-BKG-013), for a different person to approve in My work.
 */
export function CancelCard({
  booking,
  status,
  waiting,
}: {
  booking: Booking;
  status: BookingStatus;
  waiting: boolean;
}) {
  const open = status.lines.filter((line) => line.outstanding > 0);
  const [whole, setWhole] = useState(false);
  const [chosen, setChosen] = useState<readonly string[]>([]);
  const communication = useCommunication('booking-cancel-communication', issued(booking));
  const submission = useSubmission('proposeBookingCancellation', BOOKING_READS);
  if (open.length === 0) return null;
  return (
    <Card title="booking.cancel.title">
      <SubmissionBanner state={submission.state} done="booking.cancel.proposed" />
      <p className="m-0 text-body-sm text-text-2">{t('booking.cancel.intro')}</p>
      <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
        <legend className="sr-only">{t('booking.cancel.title')}</legend>
        <label className="flex items-center gap-2 text-body-sm">
          <input
            type="checkbox"
            checked={whole}
            onChange={(event) => {
              setWhole(event.target.checked);
            }}
          />
          {t('booking.cancel.whole')}
        </label>
        {!whole &&
          open.map((line) => (
            <label key={line.lineKey} className="flex items-center gap-2 text-body-sm">
              <input
                type="checkbox"
                checked={chosen.includes(line.lineKey)}
                onChange={(event) => {
                  setChosen(
                    event.target.checked ? [...chosen, line.lineKey] : chosen.filter((each) => each !== line.lineKey),
                  );
                }}
              />
              {lineText(line)}
            </label>
          ))}
      </fieldset>
      {communication.element}
      <div>
        <GrantedButton
          label="booking.cancel.propose"
          recordType={BOOKING_TYPE}
          action="edit"
          waiting={waiting ? READING : !whole && chosen.length === 0 ? 'booking.needs-lines' : undefined}
          onClick={() => {
            void (async () => {
              const files = await communication.files();
              if (files === undefined) return;
              const scope = whole ? { kind: 'whole' as const } : { kind: 'lines' as const, lineKeys: [...chosen] };
              const done = await submission.submit({
                params: { bookingId: booking.id },
                body: { versionToken: booking.versionToken, scope, ...files },
              });
              if (done !== undefined) {
                setChosen([]);
                setWhole(false);
                communication.clear();
              }
            })();
          }}
        />
      </div>
    </Card>
  );
}

/** Proposes extending the delivery window and the dates of lines (goods-in 3.5, 3.8; POL-05.07). */
export function ExtendCard({
  booking,
  status,
  waiting,
}: {
  booking: Booking;
  status: BookingStatus;
  waiting: boolean;
}) {
  const [windowTo, setWindowTo] = useState(status.deliveryWindow.to);
  const [dates, setDates] = useState<Readonly<Record<string, string>>>({});
  const communication = useCommunication('booking-extend-communication', issued(booking));
  const submission = useSubmission('proposeBookingExtension', BOOKING_READS);
  const dated = status.lines.filter((line) => line.deliveryDate !== null && line.outstanding > 0);
  return (
    <Card title="booking.extend.title">
      <SubmissionBanner state={submission.state} done="booking.extend.proposed" />
      <p className="m-0 text-body-sm text-text-2">{t('booking.extend.intro')}</p>
      <div className="grid gap-3 sm:grid-cols-3">
        <DateField
          id="booking-extend-window-to"
          label="booking.extend.window-to"
          value={windowTo}
          onChange={setWindowTo}
        />
        {dated.map((line) => (
          <FormField
            key={line.lineKey}
            id={`booking-extend-line-${String(line.lineNumber)}`}
            label="booking.line.delivery-date"
          >
            <input
              id={`booking-extend-line-${String(line.lineNumber)}`}
              type="date"
              aria-label={t('booking.extend.line', { number: line.lineNumber })}
              className={inputClass}
              value={dates[line.lineKey] ?? ''}
              onChange={(event) => {
                setDates({ ...dates, [line.lineKey]: event.target.value });
              }}
            />
          </FormField>
        ))}
      </div>
      {communication.element}
      <div>
        <GrantedButton
          label="booking.extend.propose"
          recordType={BOOKING_TYPE}
          action="edit"
          waiting={waiting ? READING : windowTo === '' ? 'booking.needs-date' : undefined}
          onClick={() => {
            void (async () => {
              const files = await communication.files();
              if (files === undefined) return;
              const lines = Object.entries(dates)
                .filter(([, date]) => date !== '')
                .map(([lineKey, deliveryDate]) => ({ lineKey, deliveryDate }));
              const done = await submission.submit({
                params: { bookingId: booking.id },
                body: { versionToken: booking.versionToken, windowTo, lines, ...files },
              });
              if (done !== undefined) {
                setDates({});
                communication.clear();
              }
            })();
          }}
        />
      </div>
    </Card>
  );
}

/** The cancellations and extensions proposed, each with its state, and its approval panel while it waits (3.5). */
export function AmendmentsCard({ booking, timeZone }: { booking: Booking; timeZone: string }) {
  const [panel, setPanel] = useState<string | null>(null);
  if (booking.amendments.length === 0) return null;
  return (
    <Card title="booking.amendments">
      <ul aria-label={t('booking.amendments')} className="m-0 flex list-none flex-col gap-3 p-0">
        {[...booking.amendments].reverse().map((amendment) => {
          const at = formatDateTime(amendment.proposedAt, timeZone);
          return (
            <li key={amendment.id} className="flex flex-col gap-1 text-body-sm">
              <span className="flex flex-wrap items-center gap-2">
                <span>
                  {amendment.kind === 'extension'
                    ? t('booking.amendment.extension', { to: formatDate(extensionEnd(amendment)), at })
                    : t('booking.amendment.cancellation', { at })}
                </span>
                <StatusBadge state={stateIdOf(amendment.state)} />
                {amendment.state === 'Awaiting approval' && amendment.request !== undefined && (
                  <Button
                    size="small"
                    label="setup.open-approval"
                    onClick={() => {
                      setPanel(amendment.request?.id ?? null);
                    }}
                  />
                )}
              </span>
              <AmendmentLines amendment={amendment} status={booking.status} />
              {amendment.communicationAttachmentIds.length > 0 && (
                <EvidenceList attachmentIds={amendment.communicationAttachmentIds} />
              )}
            </li>
          );
        })}
      </ul>
      {panel !== null && <ApprovalPanel requestId={panel} />}
    </Card>
  );
}

/**
 * The proposals to link late or excess goods into the booking, each with its state and lines, and its approval panel
 * while it waits (goods-in 3.7, 4.10; POL-05.08; S2-F02-T04). Booking proposes them from the GRN.
 */
export function ReceiptLinkProposalsCard({ booking, timeZone }: { booking: Booking; timeZone: string }) {
  const [panel, setPanel] = useState<string | null>(null);
  if (booking.receiptLinkProposals.length === 0) return null;
  return (
    <Card title="booking.receipt-links">
      <p className="m-0 text-body-sm text-text-2">{t('booking.receipt-links.intro')}</p>
      <ul aria-label={t('booking.receipt-links')} className="m-0 flex list-none flex-col gap-3 p-0">
        {[...booking.receiptLinkProposals].reverse().map((proposal) => (
          <li key={proposal.id} className="flex flex-col gap-1 text-body-sm">
            <span className="flex flex-wrap items-center gap-2">
              <span>{t('booking.receipt-link.proposed', { at: formatDateTime(proposal.proposedAt, timeZone) })}</span>
              <StatusBadge state={stateIdOf(proposal.state)} />
              {proposal.state === 'Awaiting approval' && proposal.request !== undefined && (
                <Button
                  size="small"
                  label="setup.open-approval"
                  onClick={() => {
                    setPanel(proposal.request?.id ?? null);
                  }}
                />
              )}
            </span>
            <ReceiptLinkLines proposal={proposal} status={booking.status} />
          </li>
        ))}
      </ul>
      {panel !== null && <ApprovalPanel requestId={panel} />}
    </Card>
  );
}
