import { ARRIVAL_TYPE, PT_REVISION_ROWS_PAGE_CAP, PT_TYPE, type PtRevisionRead } from '@apparel-os/schemas';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../api';
import { useSubmission } from '../api/command';
import { readQuery } from '../api/query';
import { Banner } from '../components/Banner';
import { codeText } from '../components/StandardStates';
import { StatusBadge } from '../components/StatusBadge';
import { missingText } from '../components/UnavailableState';
import { EvidenceList } from '../files/Evidence';
import { formatDateTime } from '../history/format';
import { t, type MessageId } from '../messages/catalogue';
import { formatDate, formatList, formatQuantity } from '../setup/format';
import { GrantedButton, ListRead, SubmissionBanner, useGranted } from '../setup/parts';
import { stateIdOf } from '../setup/states';
import { useTimeZone } from '../shell/session';
import { bookingField, lineNumberOf, useBookings } from './BookingLinks';
import { unknownText } from './names';
import { PtContent } from './PtContent';

// The PT review (goods-in 6.2, 6.5, 6.6, section 11; DEC-140; S2-F06-T01, code review 7): what the PT approver sees in My
// work before approving or rejecting a PT revision: its GRN with the Arrival's invoices and photos and the bookings its
// lines are linked to, who uploaded it and when, its state and its number once Official, the totals with BASIC beside
// P RATE, the margins, the new products, the repeated barcodes and the differences, and its rows a page at a time; the
// download of an Official PT in its template's columns; and why a queued posting failed, with Post again once its
// cause is fixed. An amount of cost or margin the reader may not see is masked (access-and-approvals 6). Every word
// comes from the message catalogue (code-house-rules 12.13).

const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** The reads a posting asked again makes stale. */
const POSTING_READS = ['readGrnPt', 'readPtRevision'] as const;

/** The GRN's Arrival: its invoices and photos, as the approver may read them (goods-in 6.2). */
function ArrivalDocuments({ arrivalId }: { arrivalId: string }) {
  const query = useQuery({
    ...readQuery(api, 'readArrival', { params: { arrivalId } }),
    enabled: useGranted(ARRIVAL_TYPE, 'view'),
  });
  const arrival = query.data?.arrival;
  if (arrival === undefined) return null;
  return (
    <div className="flex flex-col gap-2">
      <h4 className="text-body font-semibold">{t('receive.invoices')}</h4>
      <ul aria-label={t('receive.invoices')} className="m-0 flex list-none flex-col gap-2 p-0">
        {arrival.invoices.map((invoice) => (
          <li key={invoice.id} className="flex flex-col gap-1">
            <span>{t('receive.invoice.line', { number: invoice.number, date: formatDate(invoice.date) })}</span>
            <EvidenceList attachmentIds={[invoice.attachmentId]} />
          </li>
        ))}
      </ul>
      <h4 className="text-body font-semibold">{t('receive.photos')}</h4>
      <EvidenceList attachmentIds={arrival.photoAttachmentIds} />
    </div>
  );
}

/**
 * The bookings the GRN's lines are linked to (goods-in 6.2): each booking by its reference, blank while it is read and
 * Unknown when the reader may not read it, and each GRN line linked to it with its style, size and booking line.
 */
function LinkedBookings({ bookings }: { bookings: PtRevisionRead['bookings'] }) {
  const read = useBookings(bookings.map((each) => each.bookingId));
  return (
    <div className="flex flex-col gap-2">
      <h4 className="text-body font-semibold">{t('pt.review.bookings')}</h4>
      {bookings.length === 0 ? (
        <p className="m-0 text-body-sm">{t('pt.review.bookings.none')}</p>
      ) : (
        <ul aria-label={t('pt.review.bookings')} className="m-0 flex list-none flex-col gap-2 p-0">
          {bookings.map((booking) => {
            const lineNumber = (lineKey: string) => lineNumberOf(read.get(booking.bookingId), lineKey);
            return (
              <li key={booking.bookingId} className="flex flex-col gap-1 text-body-sm">
                <span>{t('pt.review.booking', { booking: bookingField(read, booking.bookingId) })}</span>
                <ul className="m-0 flex list-none flex-col gap-1 p-0 pl-4">
                  {booking.lines.map((line) => {
                    const number = lineNumber(line.lineKey);
                    return (
                      <li key={line.grnLineId}>
                        {t('pt.review.booking.line', {
                          style: line.styleCode ?? unknownText(),
                          size: line.size ?? unknownText(),
                          line:
                            number !== undefined
                              ? formatQuantity(number)
                              : read.reading(booking.bookingId)
                                ? ''
                                : unknownText(),
                        })}
                      </li>
                    );
                  })}
                </ul>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** Why a queued posting of the revision's approval failed (goods-in 6.6; access-and-approvals 9.8 step 4). */
function PostingFailure({ failure }: { failure: NonNullable<PtRevisionRead['failure']> }) {
  return (
    <Banner tone="danger" role="alert" message="pt.posting.failed">
      <span>{codeText(failure.code)}</span>
      {failure.missing.length > 0 && (
        <span className="text-caption">{formatList(failure.missing.map((item) => missingText(item)))}</span>
      )}
    </Banner>
  );
}

/**
 * Post a failed PT again once its cause is fixed (goods-in 6.6; access-and-approvals 9.8 step 5; books-and-posting 10
 * step 5): for whoever may approve PTs there. It names no version: the server posts it only while it is Failed.
 */
function PostAgain({ revisionId }: { revisionId: string }) {
  const posting = useSubmission('postPtAgain', POSTING_READS);
  return (
    <div className="flex flex-col gap-2">
      <SubmissionBanner state={posting.state} done="pt.posted-again" />
      <div>
        <GrantedButton
          label="pt.post-again"
          recordType={PT_TYPE}
          action="approve"
          waiting={posting.state.kind === 'pending' ? 'pt.post-again.pending' : undefined}
          onClick={() => {
            void posting.submit({ params: { revisionId }, body: {} });
          }}
        />
      </div>
    </div>
  );
}

/**
 * A PT revision as its approver reviews it (goods-in 6.2). Read with view on PTs, within the reader's scope. Its content
 * is titled as what approving it makes, or, for a reversal's panel, as the PT reversed (goods-in 6.7).
 */
export function PtReview({ revisionId, title = 'pt.review.title' }: { revisionId: string; title?: MessageId }) {
  const timeZone = useTimeZone();
  const [after, setAfter] = useState<number | undefined>(undefined);
  const query = useQuery({
    ...readQuery(api, 'readPtRevision', {
      params: { revisionId },
      query: { limit: String(PT_REVISION_ROWS_PAGE_CAP), ...(after === undefined ? {} : { after: String(after) }) },
    }),
    enabled: useGranted(PT_TYPE, 'view'),
  });
  return (
    <ListRead query={query} what="pt.review.what">
      {(read) => {
        const nameOf = (userId: string) => read.people.find((each) => each.userId === userId)?.name ?? unknownText();
        return (
          <div className="flex flex-col gap-3">
            <dl className="m-0 grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-body-sm">
              <dt className="text-text-2">{t('pt.review.grn')}</dt>
              <dd className="m-0">{read.grn.number}</dd>
              <dt className="text-text-2">{t('pt.review.uploaded')}</dt>
              <dd className="m-0">
                {t('pt.revision.uploaded-by', {
                  name: nameOf(read.uploadedBy),
                  at: formatDateTime(read.submittedAt, timeZone),
                })}
              </dd>
              <dt className="text-text-2">{t('pt.revision.state')}</dt>
              <dd className="m-0">
                <StatusBadge state={stateIdOf(read.state)} />
              </dd>
              {read.number !== null && (
                <>
                  <dt className="text-text-2">{t('pt.revision.pt-number')}</dt>
                  <dd className="m-0">{read.number}</dd>
                </>
              )}
            </dl>
            {read.failure !== undefined && <PostingFailure failure={read.failure} />}
            <ArrivalDocuments arrivalId={read.grn.arrivalId} />
            <LinkedBookings bookings={read.bookings} />
            <PtContent content={read} title={title} onPage={setAfter} />
          </div>
        );
      }}
    </ListRead>
  );
}

/**
 * Why a queued posting failed, on the GRN's PT file, and Post again (goods-in 6.6; access-and-approvals 9.8 steps 4
 * and 5).
 */
export function PtFailure({ revisionId }: { revisionId: string }) {
  const query = useQuery(readQuery(api, 'readPtRevision', { params: { revisionId }, query: { limit: '1' } }));
  const failure = query.data?.failure;
  if (failure === undefined) return null;
  return (
    <div className="flex flex-col gap-2">
      <PostingFailure failure={failure} />
      <PostAgain revisionId={revisionId} />
    </div>
  );
}

/**
 * The download of an Official PT as an XLSX file in its template's columns (goods-in 6.5, 6.6): a command, since the
 * file's cost and margin are an export the server records (numbering-and-audit 5.1); each press its own.
 */
export function PtDownload({ revisionId }: { revisionId: string }) {
  const download = useSubmission('downloadPt', []);
  return (
    <div className="flex flex-col gap-2">
      {download.state.kind === 'refused' && <SubmissionBanner state={download.state} />}
      <div>
        <GrantedButton
          label="pt.download"
          recordType={PT_TYPE}
          action="view"
          waiting={download.state.kind === 'pending' ? 'pt.download.pending' : undefined}
          onClick={() => {
            void (async () => {
              const file = await download.submit({ params: { revisionId }, body: {} });
              if (file === undefined) return;
              const bytes = Uint8Array.from(atob(file.contentBase64), (char) => char.charCodeAt(0));
              const url = URL.createObjectURL(new Blob([bytes], { type: XLSX_TYPE }));
              const link = document.createElement('a');
              link.href = url;
              link.download = file.fileName;
              link.click();
              URL.revokeObjectURL(url);
              download.reset();
            })();
          }}
        />
      </div>
    </div>
  );
}
