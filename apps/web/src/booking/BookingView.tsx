import { BOOKING_TYPE, type Booking } from '@apparel-os/schemas';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../api';
import { useSubmission } from '../api/command';
import { readQuery } from '../api/query';
import { ApprovalPanel } from '../approvals/ApprovalPanel';
import { Button } from '../components/Button';
import { StatusBadge } from '../components/StatusBadge';
import { EvidenceList, EvidencePicker, useChosenFile, useStoreEvidence } from '../files/Evidence';
import { AsOf } from '../history/AsOf';
import { formatDateTime } from '../history/format';
import { t, type MessageId } from '../messages/catalogue';
import { formatDate, formatPaise, formatQuantity } from '../setup/format';
import { Card, GrantedButton, ListRead, SubmissionBanner, Th, Toolbar, useGranted } from '../setup/parts';
import { stateIdOf } from '../setup/states';
import { useTimeZone } from '../shell/session';
import { BOOKING_READS, BookingForm } from './BookingForm';
import { OpenToBuyFacts, referenceOf, TermsFacts, TotalsView, valueAtCostOf } from './facts';
import { useBookingNames } from './names';

// Booking › a booking (goods-in 3.1 to 3.4, section 11; PRD-BKG-001 to PRD-BKG-004, PRD-UXP-003; S2-F01-T03): its
// state and what blocks it, its documents, the brand's Agreement terms read-only, the remaining open-to-buy of its brand
// and season, its lines with their totals, the Draft's next version and its submission, and, once submitted, its
// approval panel. A version-checked action waits while the booking is read again after a change (code-house-rules
// 12.7), as Receive Goods does.

/** The reason a version-checked action waits while the booking is read again. */
const READING: MessageId = 'booking.reading-again';

function Facts({ rows }: { rows: readonly (readonly [MessageId, string])[] }) {
  return (
    <dl className="m-0 grid grid-cols-[max-content_1fr] gap-x-4 gap-y-2 text-body-sm">
      {rows.map(([label, value]) => (
        <div key={label} className="contents">
          <dt className="text-text-2">{t(label)}</dt>
          <dd className="m-0">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** The lines of a version, read-only. */
function LinesView({ booking }: { booking: Booking }) {
  return (
    <div className="overflow-x-auto rounded-card border border-border">
      <table className="w-full border-collapse text-body-sm" aria-label={t('booking.lines')}>
        <thead>
          <tr>
            <Th label="booking.line.number" />
            <Th label="booking.line.style" />
            <Th label="booking.line.colour" />
            <Th label="booking.line.size" />
            <Th label="booking.line.quantity" />
            <Th label="booking.line.cost" />
            <Th label="booking.line.mrp" />
            <Th label="booking.line.delivery-date" />
          </tr>
        </thead>
        <tbody>
          {booking.version.lines.map((line) => (
            <tr key={line.id} className="border-t border-border">
              <td className="px-3 tabular-nums">{formatQuantity(line.lineNumber)}</td>
              <td className="px-3">{line.styleCode}</td>
              <td className="px-3">{line.colour ?? t('booking.line.not-given')}</td>
              <td className="px-3">{line.size ?? t('booking.line.not-given')}</td>
              <td className="px-3 tabular-nums">{formatQuantity(line.quantity)}</td>
              <td className="px-3 tabular-nums">{formatPaise(line.indicativeCost)}</td>
              <td className="px-3 tabular-nums">{formatPaise(line.mrp)}</td>
              <td className="px-3">
                {line.deliveryDate === null ? t('booking.line.not-given') : formatDate(line.deliveryDate)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Attaches a booking document, a photo or PDF stored first (goods-in 3.1; PRD-IMP-002). Attaching changes the booking,
 * so it names the version token shown and waits while the booking is read again (code-house-rules 12.7).
 */
function DocumentForm({ booking, waiting }: { booking: Booking; waiting: boolean }) {
  const chosen = useChosenFile();
  const storing = useStoreEvidence();
  const submission = useSubmission('attachBookingDocuments', BOOKING_READS);
  return (
    <div className="flex flex-col gap-2">
      {storing.banner}
      <SubmissionBanner state={submission.state} done="booking.document-added" />
      <EvidencePicker
        id="booking-document-file"
        label="booking.document.file"
        resetKey={chosen.resetKey}
        onChange={chosen.choose}
      />
      <div>
        <Button
          label="booking.document.add"
          disabled={chosen.file === null || submission.state.kind === 'pending' || waiting}
          {...(waiting ? { reason: READING } : {})}
          onClick={() => {
            void (async () => {
              if (chosen.file === null || waiting) return;
              const file = await storing.store(chosen.file);
              if (file === undefined) return;
              const added = await submission.submit({
                params: { bookingId: booking.id },
                body: { files: [file], versionToken: booking.versionToken },
              });
              if (added !== undefined) chosen.clear();
            })();
          }}
        />
      </div>
    </div>
  );
}

/** Submits the Draft as it stands for approval by a different person (goods-in 3.4); what blocks it is named. */
function SubmitCard({ booking, waiting }: { booking: Booking; waiting: boolean }) {
  const submission = useSubmission('submitBooking', BOOKING_READS);
  const blocking: MessageId[] = [
    ...(booking.documents.length === 0 ? (['error.booking.no-document'] as const) : []),
    ...(booking.version.lines.length === 0 ? (['error.booking.no-lines'] as const) : []),
  ];
  return (
    <Card title="booking.submit.title">
      <SubmissionBanner state={submission.state} done="booking.submitted" />
      {blocking.length > 0 && (
        <ul aria-label={t('booking.blocked')} className="m-0 list-disc pl-5 text-body-sm">
          {blocking.map((message) => (
            <li key={message}>{t(message)}</li>
          ))}
        </ul>
      )}
      <p className="m-0 text-body-sm text-text-2">{t('booking.submit.intro')}</p>
      <div>
        <GrantedButton
          label="booking.submit"
          recordType={BOOKING_TYPE}
          action="edit"
          variant="primary"
          waiting={waiting ? READING : undefined}
          onClick={() => {
            void submission.submit({ params: { bookingId: booking.id }, body: { versionToken: booking.versionToken } });
          }}
        />
      </div>
    </Card>
  );
}

/** Booking › a booking, opened from the list. */
export function BookingView({ bookingId, onBack }: { bookingId: string; onBack: () => void }) {
  const timeZone = useTimeZone();
  const names = useBookingNames();
  const mayEdit = useGranted(BOOKING_TYPE, 'edit');
  const queryClient = useQueryClient();
  const read = readQuery(api, 'readBooking', { params: { bookingId } });
  const query = useQuery(read);
  const [panel, setPanel] = useState<string | null>(null);
  const reading = query.isFetching || queryClient.isFetching({ queryKey: read.queryKey }) > 0;
  return (
    <div className="flex flex-col gap-4">
      <Toolbar>
        <Button label="booking.back" onClick={onBack} />
        <span className="flex-1" />
        <Button
          label="setup.refresh"
          onClick={() => {
            void query.refetch();
          }}
        />
      </Toolbar>
      <ListRead query={query} what="booking.what">
        {({ asOf, booking }) => {
          const draft = booking.state === 'Draft';
          const request = booking.version.request;
          return (
            <div className="flex flex-col gap-4">
              <div className="flex flex-wrap items-center gap-3">
                <h2 className="text-h2 font-semibold">{t('booking.title', { reference: referenceOf(booking) })}</h2>
                <StatusBadge state={stateIdOf(booking.state)} />
                <span className="flex-1" />
                <AsOf asOf={asOf} timeZone={timeZone} />
              </div>
              {draft && request?.state === 'Rejected' && (
                <p role="status" className="m-0 text-body-sm">
                  {t('booking.rejected')}
                </p>
              )}
              <Card title="booking.header">
                <Facts
                  rows={[
                    ['booking.brand', names.brand.field(booking.brandId)],
                    ['booking.destination', names.site.field(booking.destinationSiteId)],
                    ['booking.supplier', names.party.field(booking.version.supplierPartyId)],
                    ['booking.season', names.season.field(booking.version.season.valueId)],
                    [
                      'booking.window',
                      t('booking.window.range', {
                        from: formatDate(booking.version.deliveryWindow.from),
                        to: formatDate(booking.version.deliveryWindow.to),
                      }),
                    ],
                    [
                      'booking.version',
                      t('booking.version.saved', {
                        number: booking.version.versionNumber,
                        at: formatDateTime(booking.version.savedAt, timeZone),
                      }),
                    ],
                  ]}
                />
              </Card>
              <Card title="booking.documents">
                <EvidenceList attachmentIds={booking.documents.map((document) => document.attachmentId)} />
                {draft && mayEdit && <DocumentForm booking={booking} waiting={reading} />}
              </Card>
              <Card title="booking.terms">
                <TermsFacts terms={booking.terms} />
              </Card>
              <Card title="booking.open-to-buy">
                <OpenToBuyFacts remaining={booking.openToBuy} {...valueAtCostOf(booking)} />
              </Card>
              {booking.approval !== undefined && (
                <Card title="booking.approval">
                  <Facts
                    rows={[
                      // The first approval gives the number, so an approved booking always has one (goods-in 3.1).
                      ...(booking.number === undefined ? [] : [['booking.number', booking.number] as const]),
                      ['booking.approval.reserved', formatPaise(booking.approval.reserved)],
                      ['booking.approval.at', formatDateTime(booking.approval.approvedAt, timeZone)],
                    ]}
                  />
                </Card>
              )}
              {draft && mayEdit ? (
                <BookingForm
                  // Kept while documents are attached, which change the token but not the version: the form sends the
                  // booking's newest token when it saves (code-house-rules 12.7).
                  key={booking.version.id}
                  booking={booking}
                  waiting={reading ? READING : undefined}
                  onSaved={() => undefined}
                />
              ) : (
                <Card title="booking.lines">
                  <LinesView booking={booking} />
                  <TotalsView lines={booking.version.lines} />
                </Card>
              )}
              {draft && mayEdit && <SubmitCard booking={booking} waiting={reading} />}
              {request?.state === 'Awaiting approval' && (
                <Card title="booking.approval">
                  <p className="m-0 text-body-sm text-text-2">{t('booking.awaiting')}</p>
                  <div>
                    <Button
                      label="setup.open-approval"
                      onClick={() => {
                        setPanel(request.id);
                      }}
                    />
                  </div>
                  {panel !== null && <ApprovalPanel requestId={panel} />}
                </Card>
              )}
              <Card title="booking.versions">
                <ul aria-label={t('booking.versions')} className="m-0 flex list-none flex-col gap-2 p-0">
                  {[...booking.versions].reverse().map((version) => (
                    <li key={version.id} className="flex flex-wrap items-center gap-2 text-body-sm">
                      <span>
                        {t('booking.version.saved', {
                          number: version.versionNumber,
                          at: formatDateTime(version.savedAt, timeZone),
                        })}
                      </span>
                      {version.request !== undefined && <StatusBadge state={stateIdOf(version.request.state)} />}
                    </li>
                  ))}
                </ul>
              </Card>
            </div>
          );
        }}
      </ListRead>
    </div>
  );
}
