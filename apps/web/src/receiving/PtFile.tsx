import {
  PT_IMPORT_TARGET,
  PT_PREVIEW_PAGE_CAP,
  PT_TYPE,
  type GrnPtRead,
  type ImportLayoutList,
  type MissingItem,
  type PtPreview,
} from '@apparel-os/schemas';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../api';
import { useSubmission } from '../api/command';
import { readQuery } from '../api/query';
import { Banner } from '../components/Banner';
import { codeText } from '../components/StandardStates';
import { StatusBadge } from '../components/StatusBadge';
import { missingText } from '../components/UnavailableState';
import { base64Of } from '../files/Evidence';
import { fieldName, issueText } from '../files/import-text';
import { formatDateTime } from '../history/format';
import { t } from '../messages/catalogue';
import { formatList, formatQuantity } from '../setup/format';
import { Card, GrantedButton, inputClass, ListRead, SubmissionBanner, Th, useGranted } from '../setup/parts';
import { stateIdOf } from '../setup/states';
import { useTimeZone } from '../shell/session';
import { unknownText } from './names';
import { amountText, PtContent } from './PtContent';
import { PtDownload, PtFailure } from './PtReview';
import { PtReversals } from './PtReversal';
import { PT_READS } from './pt-reads';

// Receive Goods › a GRN › Upload PT file (goods-in 5, 6.5, section 11; DEC-134, DEC-135, DEC-137, DEC-138, DEC-140;
// S2-F04-T02): whoever is assigned to make PTs downloads the blank template with its lists, uploads the filled file,
// reads every problem by row and column or the preview of what submitting it makes, submits it for a different person
// to approve, withdraws a wrong draft, and proposes the reversal of a wrong Official PT before the scan-in (goods-in
// 6.4, 6.7; S2-F09-T01). The file travels through the import routes, as a transaction batch about the GRN; the GRN's
// PT shows its "PT attached" mark, its revisions and their reversals. An amount of cost or margin the reader may not
// see is masked. Every word comes from the message catalogue (code-house-rules 12.13).

const XLSX_ACCEPT = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

type Layout = ImportLayoutList['layouts'][number];

/** The Confirmed PT template layouts, each with its Confirmed mapping to the PT handler (imports 6.4). */
function ptLayouts(list: ImportLayoutList): { readonly layout: Layout; readonly mappingVersionId: string }[] {
  return list.layouts.flatMap((layout) => {
    if (layout.state !== 'Confirmed' || !layout.kinds.includes('transaction')) return [];
    const mapping = layout.mappings.find((each) => each.target === PT_IMPORT_TARGET && each.state === 'Confirmed');
    return mapping === undefined ? [] : [{ layout, mappingVersionId: mapping.mappingVersionId }];
  });
}

/** The blank template with its lists (goods-in section 11 "Template download"). */
function Template({ grnId, layouts }: { grnId: string; layouts: ReturnType<typeof ptLayouts> }) {
  const [chosen, setChosen] = useState('');
  const [state, setState] = useState<'ready' | 'pending' | 'failed'>('ready');
  const only = layouts.length === 1 ? layouts[0]?.layout.layoutVersionId : undefined;
  const layoutVersionId = chosen === '' ? (only ?? '') : chosen;
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-h3 font-semibold">{t('pt.template.title')}</h3>
      <TemplateChoice layouts={layouts} value={layoutVersionId} onChange={setChosen} id="pt-template-layout" />
      {state === 'failed' && <Banner tone="danger" role="alert" message="pt.template.failed" />}
      <div>
        <GrantedButton
          label="pt.template.download"
          recordType={PT_TYPE}
          action="create"
          waiting={layoutVersionId === '' || state === 'pending' ? 'pt.template.choose' : undefined}
          onClick={() => {
            void (async () => {
              setState('pending');
              const result = await api.call('downloadPtTemplate', {
                params: { grnId },
                query: { layoutVersionId, listsSheet: t('pt.template.lists-sheet') },
              });
              if (!result.ok) {
                setState('failed');
                return;
              }
              const bytes = Uint8Array.from(atob(result.data.contentBase64), (char) => char.charCodeAt(0));
              const url = URL.createObjectURL(new Blob([bytes], { type: XLSX_ACCEPT }));
              const link = document.createElement('a');
              link.href = url;
              link.download = result.data.fileName;
              link.click();
              URL.revokeObjectURL(url);
              setState('ready');
            })();
          }}
        />
      </div>
    </div>
  );
}

function TemplateChoice({
  layouts,
  value,
  onChange,
  id,
}: {
  layouts: ReturnType<typeof ptLayouts>;
  value: string;
  onChange: (value: string) => void;
  id: string;
}) {
  return (
    <label className="flex flex-col gap-1" htmlFor={id}>
      <span className="text-body-sm font-semibold">{t('pt.template.layout')}</span>
      <select
        id={id}
        className={inputClass}
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
        }}
      >
        <option value="">{t('pt.template.choose')}</option>
        {layouts.map(({ layout }) => (
          <option key={layout.layoutVersionId} value={layout.layoutVersionId}>
            {t('pt.template.option', { code: layout.layoutCode, version: layout.version })}
          </option>
        ))}
      </select>
    </label>
  );
}

/** Uploads a filled file and checks it against the GRN (goods-in 5.6 steps 1 and 2). */
function Upload({
  grnId,
  layouts,
  onChecked,
}: {
  grnId: string;
  layouts: ReturnType<typeof ptLayouts>;
  onChecked: (batchId: string) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [chosen, setChosen] = useState('');
  const store = useSubmission('storeImportFile', []);
  const start = useSubmission('startImport', []);
  const validate = useSubmission('validateImport', []);
  const only = layouts.length === 1 ? layouts[0]?.layout.layoutVersionId : undefined;
  const layoutVersionId = chosen === '' ? (only ?? '') : chosen;
  const choice = layouts.find((each) => each.layout.layoutVersionId === layoutVersionId);
  const pending = [store, start, validate].some((each) => each.state.kind === 'pending');
  // Hands the file in, starts its batch for the GRN and validates it, in turn (imports-and-opening-data 3.1).
  const check = () => {
    if (file === null || choice === undefined) return;
    void (async () => {
      const stored = await store.submit({
        body: { sourceSystem: 'manual-upload', originalName: file.name, contentBase64: await base64Of(file) },
      });
      if (stored === undefined) return;
      const started = await start.submit({
        body: {
          storedFileId: stored.storedFileId,
          fileReceiptId: stored.receiptId,
          kind: 'transaction',
          target: PT_IMPORT_TARGET,
          layoutVersionId: choice.layout.layoutVersionId,
          mappingVersionId: choice.mappingVersionId,
          subject: { recordId: grnId },
        },
      });
      if (started === undefined) return;
      const checked = await validate.submit({ params: { batchId: started.batchId }, body: {} });
      if (checked !== undefined) onChecked(started.batchId);
    })();
  };
  return (
    <form
      aria-label={t('pt.upload.title')}
      className="flex flex-col gap-3"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        check();
      }}
    >
      <h3 className="text-h3 font-semibold">{t('pt.upload.title')}</h3>
      <SubmissionBanner state={store.state} done="pt.upload.stored" />
      <SubmissionBanner state={start.state} done="pt.upload.started" />
      <SubmissionBanner state={validate.state} done="pt.upload.checked" />
      <TemplateChoice layouts={layouts} value={layoutVersionId} onChange={setChosen} id="pt-upload-layout" />
      <div className="flex flex-col gap-1">
        <label className="flex flex-col gap-1" htmlFor="pt-file">
          <span className="text-body-sm font-semibold">{t('pt.upload.file')}</span>
          <input
            id="pt-file"
            type="file"
            accept={XLSX_ACCEPT}
            className={inputClass}
            aria-describedby="pt-file-help"
            onChange={(event) => {
              setFile(event.target.files?.[0] ?? null);
            }}
          />
        </label>
        {/* The help describes the field, outside its label, so the field's name is the label's alone. */}
        <span id="pt-file-help" className="text-caption text-text-2">
          {t('pt.upload.help')}
        </span>
      </div>
      <div>
        <GrantedButton
          label="pt.upload.submit"
          recordType={PT_TYPE}
          action="create"
          variant="primary"
          waiting={
            file === null || choice === undefined ? 'pt.upload.choose' : pending ? 'pt.upload.pending' : undefined
          }
          onClick={check}
        />
      </div>
    </form>
  );
}

/** The batch's problems by row and column, or the preview of what submitting it makes (goods-in 5.6). */
function Checked({ batchId, onDone }: { batchId: string; onDone: () => void }) {
  const [after, setAfter] = useState<number | undefined>(undefined);
  // A submit the re-check refused: the reason and every problem it names (goods-in 5.6, 5.8).
  const [refused, setRefused] = useState<{ readonly code: string; readonly missing: readonly MissingItem[] }>();
  const read = readQuery(api, 'previewPtUpload', {
    params: { batchId },
    query: { limit: String(PT_PREVIEW_PAGE_CAP), ...(after === undefined ? {} : { after: String(after) }) },
  });
  const query = useQuery(read);
  const seen = useSubmission('markImportIssuesSeen', []);
  const submit = useSubmission('submitImport', []);
  const publish = useSubmission('publishImport', PT_READS);
  const queryClient = useQueryClient();
  return (
    <ListRead query={query} what="pt.preview.what">
      {(preview) => {
        const blocking = preview.issues.filter((issue) => issue.severity === 'Blocking');
        const warnings = preview.issues.filter((issue) => issue.severity === 'Warning');
        return (
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <h3 className="text-h3 font-semibold">{t('pt.preview.batch', { code: preview.batchCode })}</h3>
              <StatusBadge state={stateIdOf(preview.batchState)} />
            </div>
            {preview.issues.length > 0 && <Issues preview={preview} />}
            {blocking.length > 0 && <Banner tone="danger" role="alert" message="pt.report.refused" />}
            {preview.draft !== null && (
              <Draft
                preview={preview}
                onPage={(next) => {
                  setAfter(next);
                }}
              />
            )}
            <SubmissionBanner state={seen.state} done="pt.submit.seen" />
            <SubmissionBanner state={submit.state} done="pt.submit.done" />
            {refused === undefined ? (
              <SubmissionBanner state={publish.state} done="pt.submit.done" />
            ) : (
              <Banner tone="danger" role="alert" message="pt.submit.refused">
                <span>{codeText(refused.code)}</span>
                {refused.missing.length > 0 && (
                  <ul aria-label={t('pt.report.title')} className="m-0 list-disc pl-5 text-caption">
                    {refused.missing.map((item, index) => (
                      <li key={index}>{missingText(item)}</li>
                    ))}
                  </ul>
                )}
              </Banner>
            )}
            {preview.draft !== null && preview.batchState === 'Validated' && (
              <div>
                <GrantedButton
                  label="pt.submit"
                  recordType={PT_TYPE}
                  action="create"
                  variant="primary"
                  // The version the screen shows is sent: it waits while the preview is read again (12.7).
                  waiting={query.isFetching ? 'pt.reading-again' : undefined}
                  onClick={() => {
                    void (async () => {
                      const versionId = preview.batchVersionId;
                      for (const issueClass of new Set(warnings.map((issue) => issue.class))) {
                        const marked = await seen.submit({
                          params: { batchId },
                          body: { versionId, class: issueClass },
                        });
                        if (marked === undefined) return;
                      }
                      if (!preview.submitted) {
                        const submitted = await submit.submit({ params: { batchId }, body: { versionId } });
                        if (submitted === undefined) return;
                      }
                      const published = await publish.submit({ params: { batchId }, body: { versionId } });
                      if (published === undefined) return;
                      await queryClient.invalidateQueries({ queryKey: [read.queryKey[0]] });
                      // The GRN as it stands may refuse the file at its submit: nothing is created, and every problem
                      // is shown, to correct in the file and upload again (5.6).
                      const [document] = published.documents;
                      if (published.result === 'failed' && document?.refusalCode !== undefined) {
                        setRefused({ code: document.refusalCode, missing: document.missing ?? [] });
                        return;
                      }
                      onDone();
                    })();
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

function Issues({ preview }: { preview: PtPreview }) {
  return (
    <table className="w-full border-collapse text-body-sm" aria-label={t('pt.report.title')}>
      <thead>
        <tr>
          <Th label="pt.report.row" />
          <Th label="pt.report.column" />
          <Th label="pt.report.severity" />
          <Th label="pt.report.problem" />
        </tr>
      </thead>
      <tbody>
        {preview.issues.map((issue) => (
          <tr key={issue.issueId} className="border-t border-border align-top">
            <td className="px-3 py-1">{issue.rowNumber === undefined ? '' : formatQuantity(issue.rowNumber)}</td>
            <td className="px-3 py-1">
              {formatList(
                [issue.sheet, issue.column, issue.field === undefined ? undefined : fieldName(issue.field)].filter(
                  (each) => each !== undefined,
                ),
              )}
            </td>
            <td className="px-3 py-1">{t(`intake.severity.${issue.severity}`)}</td>
            <td className="px-3 py-1">
              <span>{issueText(issue.code)}</span>
              {issue.missing.length > 0 && (
                <span className="block text-caption text-text-2">
                  {formatList(issue.missing.map((item) => missingText(item)))}
                </span>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Draft({ preview, onPage }: { preview: PtPreview; onPage: (after: number | undefined) => void }) {
  if (preview.draft === null) return null;
  return <PtContent content={preview.draft} title="pt.preview.title" onPage={onPage} />;
}

/** The GRN's PT revisions, newest first, and the withdrawal of the newest while it waits (goods-in 5.7). */
function Revisions({ read, reading }: { read: GrnPtRead; reading: boolean }) {
  const timeZone = useTimeZone();
  const withdraw = useSubmission('withdrawPtRevision', PT_READS);
  const pt = read.pt;
  if (pt === null) return null;
  const nameOf = (userId: string) => read.people.find((person) => person.userId === userId)?.name ?? unknownText();
  const [newest] = pt.revisions;
  return (
    <div className="flex flex-col gap-2">
      <SubmissionBanner state={withdraw.state} done="pt.withdrawn" />
      <table className="w-full border-collapse text-body-sm" aria-label={t('pt.revisions')}>
        <thead>
          <tr>
            <Th label="pt.revision.number" />
            <Th label="pt.revision.state" />
            <Th label="pt.revision.pt-number" />
            <Th label="pt.revision.uploaded" />
            <Th label="pt.totals.pieces" />
            <Th label="pt.totals.cost" />
            <Th label="pt.revision.new-products" />
            <Th label="pt.revision.repeated" />
            <Th label="pt.revision.differences" />
          </tr>
        </thead>
        <tbody>
          {pt.revisions.map((revision) => (
            <tr key={revision.revisionId} className="border-t border-border">
              <td className="px-3 py-1">{formatQuantity(revision.revisionNumber)}</td>
              <td className="px-3 py-1">
                <StatusBadge state={stateIdOf(revision.state)} />
              </td>
              <td className="px-3 py-1">{revision.number ?? ''}</td>
              <td className="px-3 py-1">
                {t('pt.revision.uploaded-by', {
                  name: nameOf(revision.uploadedBy),
                  at: formatDateTime(revision.submittedAt, timeZone),
                })}
              </td>
              <td className="px-3 py-1 text-right">{formatQuantity(revision.totals.pieces)}</td>
              <td className="px-3 py-1 text-right">{amountText(revision.totals.costPaise)}</td>
              <td className="px-3 py-1 text-right">{formatQuantity(revision.newProducts)}</td>
              <td className="px-3 py-1 text-right">{formatQuantity(revision.repeatedBarcodes)}</td>
              <td className="px-3 py-1 text-right">{formatQuantity(revision.differences)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {newest?.state === 'Official' && <PtDownload revisionId={newest.revisionId} />}
      {newest?.state === 'Failed' && <PtFailure revisionId={newest.revisionId} />}
      {newest?.state === 'Awaiting approval' && (
        <div>
          <GrantedButton
            label="pt.withdraw"
            recordType={PT_TYPE}
            action="edit"
            // The PT's version the screen shows is sent: it waits while the PT is read again (12.7).
            waiting={reading || withdraw.state.kind === 'pending' ? 'pt.reading-again' : undefined}
            onClick={() => {
              void withdraw.submit({
                params: { revisionId: newest.revisionId },
                body: { versionToken: pt.versionToken },
              });
            }}
          />
        </div>
      )}
    </div>
  );
}

/** The PT file of a GRN (goods-in 5, section 11). Shown to whoever may read PTs. */
export function PtFile({ grnId }: { grnId: string }) {
  const mayView = useGranted(PT_TYPE, 'view');
  const mayCreate = useGranted(PT_TYPE, 'create');
  const query = useQuery({ ...readQuery(api, 'readGrnPt', { params: { grnId } }), enabled: mayView });
  const layouts = useQuery({ ...readQuery(api, 'listImportLayouts', {}), enabled: mayView && mayCreate });
  const [batchId, setBatchId] = useState<string | undefined>(undefined);
  if (!mayView) return null;
  return (
    <Card title="pt.title">
      <ListRead query={query} what="pt.what">
        {(read) => {
          const choices = layouts.data === undefined ? [] : ptLayouts(layouts.data);
          return (
            <div className="flex flex-col gap-4">
              <p className="m-0 text-body-sm text-text-2">{t('pt.intro')}</p>
              <p className="m-0 text-body-sm">{read.mark.kind === 'set' ? t('pt.mark.set') : t('pt.mark.not-set')}</p>
              <Revisions read={read} reading={query.isFetching} />
              <PtReversals read={read} reading={query.isFetching} />
              {read.upload.kind === 'blocked' ? (
                <Banner tone="warning" role="status" message="pt.upload.blocked">
                  <span>{codeText(read.upload.code)}</span>
                  {read.upload.missing.length > 0 && (
                    <span className="text-caption">
                      {formatList(read.upload.missing.map((item) => missingText(item)))}
                    </span>
                  )}
                </Banner>
              ) : (
                mayCreate && (
                  <>
                    <Template grnId={grnId} layouts={choices} />
                    <Upload grnId={grnId} layouts={choices} onChecked={setBatchId} />
                  </>
                )
              )}
              {batchId !== undefined && (
                <Checked
                  key={batchId}
                  batchId={batchId}
                  onDone={() => {
                    setBatchId(undefined);
                  }}
                />
              )}
            </div>
          );
        }}
      </ListRead>
    </Card>
  );
}
