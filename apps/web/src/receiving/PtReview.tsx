import { ARRIVAL_TYPE, PT_REVISION_ROWS_PAGE_CAP, PT_TYPE } from '@apparel-os/schemas';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../api';
import { readQuery } from '../api/query';
import { Banner } from '../components/Banner';
import { codeText } from '../components/StandardStates';
import { StatusBadge } from '../components/StatusBadge';
import { missingText } from '../components/UnavailableState';
import { EvidenceList } from '../files/Evidence';
import { formatDateTime } from '../history/format';
import { t } from '../messages/catalogue';
import { formatDate, formatList } from '../setup/format';
import { GrantedButton, ListRead, useGranted } from '../setup/parts';
import { stateIdOf } from '../setup/states';
import { useTimeZone } from '../shell/session';
import { unknownText } from './names';
import { PtContent } from './PtContent';

// The PT review (goods-in 6.2, 6.5, 6.6, section 11; DEC-140; S2-F06-T01): what the PT approver sees in My work before
// approving or rejecting a PT revision: its GRN with the Arrival's invoices and photos, who uploaded it and when, its
// state and its number once Official, the totals with BASIC beside P RATE, the margins, the new products, the repeated
// barcodes and the differences, and its rows a page at a time; the download of an Official PT in its template's columns;
// and why a queued posting failed. An amount of cost or margin the reader may not see is masked (access-and-approvals
// 6). Every word comes from the message catalogue (code-house-rules 12.13).

const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

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

/** A PT revision as its approver reviews it (goods-in 6.2). Read with view on PTs, within the reader's scope. */
export function PtReview({ revisionId }: { revisionId: string }) {
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
            {read.failure !== undefined && (
              <Banner tone="danger" role="alert" message="pt.posting.failed">
                <span>{codeText(read.failure.code)}</span>
                {read.failure.missing.length > 0 && (
                  <span className="text-caption">
                    {formatList(read.failure.missing.map((item) => missingText(item)))}
                  </span>
                )}
              </Banner>
            )}
            <ArrivalDocuments arrivalId={read.grn.arrivalId} />
            <PtContent content={read} title="pt.review.title" onPage={setAfter} />
          </div>
        );
      }}
    </ListRead>
  );
}

/** Why a queued posting of the revision's approval failed (goods-in 6.6; access-and-approvals 9.8 step 4). */
export function PtFailure({ revisionId }: { revisionId: string }) {
  const query = useQuery(readQuery(api, 'readPtRevision', { params: { revisionId }, query: { limit: '1' } }));
  const failure = query.data?.failure;
  if (failure === undefined) return null;
  return (
    <Banner tone="danger" role="alert" message="pt.posting.failed">
      <span>{codeText(failure.code)}</span>
      {failure.missing.length > 0 && (
        <span className="text-caption">{formatList(failure.missing.map((item) => missingText(item)))}</span>
      )}
    </Banner>
  );
}

/** The download of an Official PT as an XLSX file in its template's columns (goods-in 6.5). */
export function PtDownload({ revisionId }: { revisionId: string }) {
  const [state, setState] = useState<
    { readonly kind: 'ready' | 'pending' } | { readonly kind: 'failed'; code: string }
  >({
    kind: 'ready',
  });
  return (
    <div className="flex flex-col gap-2">
      {state.kind === 'failed' && (
        <Banner tone="danger" role="alert" message="pt.download.failed">
          <span>{codeText(state.code)}</span>
        </Banner>
      )}
      <div>
        <GrantedButton
          label="pt.download"
          recordType={PT_TYPE}
          action="view"
          waiting={state.kind === 'pending' ? 'pt.download.pending' : undefined}
          onClick={() => {
            void (async () => {
              setState({ kind: 'pending' });
              const result = await api.call('downloadPt', { params: { revisionId } });
              if (!result.ok) {
                setState({ kind: 'failed', code: result.error.code });
                return;
              }
              const bytes = Uint8Array.from(atob(result.data.contentBase64), (char) => char.charCodeAt(0));
              const url = URL.createObjectURL(new Blob([bytes], { type: XLSX_TYPE }));
              const link = document.createElement('a');
              link.href = url;
              link.download = result.data.fileName;
              link.click();
              URL.revokeObjectURL(url);
              setState({ kind: 'ready' });
            })();
          }}
        />
      </div>
    </div>
  );
}
