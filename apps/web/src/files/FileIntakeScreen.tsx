import {
  IMPORT_BATCH_TYPE,
  type DocumentPreview,
  type ImportBatchRead,
  type ImportFileStored,
  type ImportLayoutList,
  type StagedRow,
} from '@apparel-os/schemas';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../api';
import { useSubmission } from '../api/command';
import { readQuery } from '../api/query';
import { Banner } from '../components/Banner';
import { codeText, EmptyState } from '../components/StandardStates';
import { StatusBadge } from '../components/StatusBadge';
import { missingText } from '../components/UnavailableState';
import { AsOf } from '../history/AsOf';
import { formatDateTime } from '../history/format';
import { isMessageId, t } from '../messages/catalogue';
import { useTimeZone } from '../shell/session';
import { Card, GrantedButton, inputClass, ListRead, SubmissionBanner, Th } from '../setup/parts';
import { recordTypeName } from '../setup/describe';
import { stateIdOf } from '../setup/states';
import { base64Of, sizeText } from './Evidence';

// Setup › File intake and saved layouts (imports-and-opening-data 3.1, 13.1, 16; ui-blueprint Setup; design-language
// 10.10; S1-F06-T01): a preparer uploads an XLSX file, which the server checks from its content and keeps encrypted;
// the stored file shows with its earlier batches; a batch is started with a saved layout and mapping, which reads and
// stages the file; its staged rows show each original cell beside its normalised value and origin; Validate and
// Publish. As built for the tracer: one file at a time, the saved layouts listed but not proposed or confirmed here,
// which S1-F06-T03 adds with the validation report.

const XLSX_ACCEPT = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const BATCH_READS = ['readImportBatch'] as const;

/** A target field's name as the screen writes it, or the field's code where the catalogue has none. */
function fieldName(field: string): string {
  const id = `intake.field.${field}`;
  return isMessageId(id) ? t(id) : field;
}

/** One layout version and mapping version a batch may start with. */
interface LayoutChoice {
  readonly key: string;
  readonly layoutVersionId: string;
  readonly mappingVersionId: string;
  readonly target: string;
  readonly label: string;
}

function choicesOf(list: ImportLayoutList): LayoutChoice[] {
  return list.layouts.flatMap((layout) =>
    layout.mappings.map((mapping) => ({
      key: `${layout.layoutVersionId}|${mapping.mappingVersionId}`,
      layoutVersionId: layout.layoutVersionId,
      mappingVersionId: mapping.mappingVersionId,
      target: mapping.target,
      label: t('intake.layout.option', {
        layout: layout.layoutCode,
        layoutVersion: layout.version,
        mapping: mapping.mappingCode,
        mappingVersion: mapping.version,
        state: layout.state,
      }),
    })),
  );
}

/** Upload: the file is checked from its content and stored before anything else (9.2, 9.3; PRD-IMP-002). */
function Upload({ onStored }: { onStored: (stored: ImportFileStored) => void }) {
  const [file, setFile] = useState<File | null>(null);
  const submission = useSubmission('storeImportFile', []);
  return (
    <Card title="intake.upload.title">
      <div className="flex flex-col gap-3">
        <SubmissionBanner state={submission.state} done="intake.upload.done" />
        <label className="flex flex-col gap-1" htmlFor="intake-file">
          <span className="text-body-sm font-semibold">{t('intake.upload.file')}</span>
          <input
            id="intake-file"
            type="file"
            accept={XLSX_ACCEPT}
            className={inputClass}
            aria-describedby="intake-file-help"
            onChange={(event) => {
              setFile(event.target.files?.[0] ?? null);
            }}
          />
          <span id="intake-file-help" className="text-caption text-text-2">
            {t('intake.upload.help')}
          </span>
        </label>
        <div>
          <GrantedButton
            label="intake.upload.submit"
            recordType="files_imports.stored_file"
            action="create"
            variant="primary"
            onClick={() => {
              if (file === null) return;
              void (async () => {
                const stored = await submission.submit({
                  body: { sourceSystem: 'manual-upload', originalName: file.name, contentBase64: await base64Of(file) },
                });
                if (stored !== undefined) onStored(stored);
              })();
            }}
          />
        </div>
      </div>
    </Card>
  );
}

/** The stored file, its earlier batches, and Start an import with a saved layout and mapping (7.2, 13.1). */
function StoredFile({ stored, onOpen }: { stored: ImportFileStored; onOpen: (batchId: string) => void }) {
  const layouts = useQuery(readQuery(api, 'listImportLayouts', {}));
  const [choice, setChoice] = useState('');
  const start = useSubmission('startImport', []);
  return (
    <Card title="intake.stored.title">
      <dl className="m-0 grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-body-sm">
        <dt className="text-text-2">{t('intake.stored.format')}</dt>
        <dd className="m-0">{t(`evidence.type.${stored.format}`)}</dd>
        <dt className="text-text-2">{t('intake.stored.size')}</dt>
        <dd className="m-0">{sizeText(stored.sizeBytes)}</dd>
        <dt className="text-text-2">{t('intake.stored.hash')}</dt>
        <dd className="m-0 break-all font-mono">{stored.contentHash}</dd>
      </dl>
      {stored.alreadyStored && <Banner tone="info" role="status" message="intake.stored.again" />}
      {stored.earlierBatches.length > 0 && (
        <ul aria-label={t('intake.stored.earlier')} className="m-0 flex list-none flex-col gap-1 p-0">
          {stored.earlierBatches.map((batch) => (
            <li key={batch.batchId} className="flex flex-wrap items-center gap-2 text-body-sm">
              <button
                type="button"
                className="font-mono text-accent underline"
                onClick={() => {
                  onOpen(batch.batchId);
                }}
              >
                {batch.code}
              </button>
              <StatusBadge state={stateIdOf(batch.state)} />
            </li>
          ))}
        </ul>
      )}
      <ListRead query={layouts} what="intake.layouts.what">
        {(list) => {
          const choices = choicesOf(list);
          if (choices.length === 0)
            return <EmptyState title="intake.layouts.none.title" body="intake.layouts.none.body" />;
          const chosen = choices.find((each) => each.key === choice);
          return (
            <div className="flex flex-col gap-3">
              <SubmissionBanner state={start.state} done="intake.start.done" />
              <label className="flex flex-col gap-1" htmlFor="intake-layout">
                <span className="text-body-sm font-semibold">{t('intake.layout')}</span>
                <select
                  id="intake-layout"
                  className={inputClass}
                  value={choice}
                  onChange={(event) => {
                    setChoice(event.target.value);
                  }}
                >
                  <option value="">{t('intake.layout.choose')}</option>
                  {choices.map((each) => (
                    <option key={each.key} value={each.key}>
                      {each.label}
                    </option>
                  ))}
                </select>
              </label>
              <div>
                <GrantedButton
                  label="intake.start"
                  recordType={IMPORT_BATCH_TYPE}
                  action="create"
                  onClick={() => {
                    if (chosen === undefined) return;
                    void (async () => {
                      const started = await start.submit({
                        body: {
                          storedFileId: stored.storedFileId,
                          fileReceiptId: stored.receiptId,
                          kind: 'create',
                          target: chosen.target,
                          layoutVersionId: chosen.layoutVersionId,
                          mappingVersionId: chosen.mappingVersionId,
                        },
                      });
                      if (started !== undefined) onOpen(started.batchId);
                    })();
                  }}
                />
              </div>
            </div>
          );
        }}
      </ListRead>
    </Card>
  );
}

/** What the handler works out a document would create, or the issues that stop it (13.2). */
function Preview({ preview }: { preview: DocumentPreview }) {
  if (preview.kind === 'would-create') {
    return (
      <ul aria-label={t('intake.preview')} className="m-0 flex list-none flex-col gap-1 p-0 text-body-sm">
        {preview.records.map((record) => (
          <li key={record.recordType}>
            {t('intake.preview.would-create', { what: recordTypeName(record.recordType) })}{' '}
            <span className="font-mono">{record.codes.join(', ')}</span>
          </li>
        ))}
      </ul>
    );
  }
  return (
    <ul aria-label={t('intake.issues')} className="m-0 flex list-none flex-col gap-1 p-0 text-body-sm text-danger">
      {preview.issues.map((issue, index) => (
        <li key={index}>
          {codeText(issue.code)}
          {issue.field !== undefined && issue.rowNumber !== undefined && (
            <> {t('intake.issue.at', { field: fieldName(issue.field), row: issue.rowNumber })}</>
          )}
          {(issue.missing ?? []).map((item, at) => (
            <span key={at}> {missingText(item)}</span>
          ))}
        </li>
      ))}
    </ul>
  );
}

/** A staged row: each field's normalised value with the cell it came from, or Unknown (section 5; design-language 10.10). */
function RowValues({ row, fields }: { row: StagedRow; fields: readonly string[] }) {
  return (
    <tr className="h-10 border-t border-border align-top">
      <td className="px-3 font-mono">
        {row.rowNumber}
        {row.hidden && <span className="ml-1 text-caption text-text-2">{t('intake.row.hidden')}</span>}
      </td>
      {fields.map((field) => {
        const value = row.values[field];
        return (
          <td key={field} className="px-3">
            {value === undefined || value.kind === 'unknown' ? (
              <span className="text-text-2">{t('intake.value.unknown')}</span>
            ) : (
              <span className="flex flex-col">
                <span>{value.value}</span>
                <span className="text-caption text-text-2">
                  {t('intake.value.supplied', { ref: value.origin.ref, raw: value.origin.text })}
                </span>
              </span>
            )}
          </td>
        );
      })}
    </tr>
  );
}

function Batch({ read }: { read: ImportBatchRead }) {
  const timeZone = useTimeZone();
  const validate = useSubmission('validateImport', BATCH_READS);
  const publish = useSubmission('publishImport', BATCH_READS);
  const { batch } = read;
  const fields = [
    ...new Set(read.documents.flatMap((document) => document.rows.flatMap((row) => Object.keys(row.values)))),
  ];
  return (
    <section aria-label={t('intake.batch', { code: batch.code })} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="m-0 text-h2 font-semibold">{t('intake.batch', { code: batch.code })}</h2>
        <StatusBadge state={stateIdOf(batch.state)} />
        <AsOf asOf={read.asOf} timeZone={timeZone} />
      </div>
      <p className="m-0 text-body-sm text-text-2">
        {t('intake.batch.started', { at: formatDateTime(batch.startedAt, timeZone), target: batch.target })}
      </p>
      {batch.readerNotes.length > 0 && <Banner tone="warning" role="status" message="intake.batch.notes" />}
      <SubmissionBanner state={validate.state} done="intake.validate.done" />
      <SubmissionBanner state={publish.state} done="intake.publish.done" />
      <div className="flex flex-wrap gap-2">
        {batch.state === 'Staged' && (
          <GrantedButton
            label="intake.validate"
            recordType={IMPORT_BATCH_TYPE}
            action="edit"
            onClick={() => {
              void validate.submit({ params: { batchId: batch.batchId }, body: {} });
            }}
          />
        )}
        {batch.state === 'Validated' && (
          <GrantedButton
            label="intake.publish"
            recordType={IMPORT_BATCH_TYPE}
            action="edit"
            variant="primary"
            onClick={() => {
              void publish.submit({ params: { batchId: batch.batchId }, body: {} });
            }}
          />
        )}
      </div>
      {read.documents.map((document) => (
        <Card key={document.documentId}>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="m-0 text-h3 font-semibold">{t('intake.document', { reference: document.reference })}</h3>
            <StatusBadge state={stateIdOf(document.state)} />
          </div>
          {document.preview !== undefined && <Preview preview={document.preview} />}
          <div className="overflow-x-auto rounded-card border border-border">
            <table
              className="w-full border-collapse text-body"
              aria-label={t('intake.rows', { reference: document.reference })}
            >
              <thead>
                <tr>
                  <Th label="intake.row" />
                  {fields.map((field) => (
                    <th
                      key={field}
                      scope="col"
                      className="h-10 bg-sunken px-3 text-left text-body-sm font-semibold text-text-2"
                    >
                      {fieldName(field)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {document.rows.map((row) => (
                  <RowValues key={row.stagedRowId} row={row} fields={fields} />
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ))}
      {read.ignoredRows.length > 0 && (
        <p className="m-0 text-body-sm text-text-2">{t('intake.ignored', { count: read.ignoredRows.length })}</p>
      )}
      {read.outcomes.length > 0 && (
        <Card title="intake.outcomes">
          <ul className="m-0 flex list-none flex-col gap-1 p-0 text-body-sm">
            {read.outcomes.map((outcome) => (
              <li key={outcome.outcomeId}>
                {t(outcome.result === 'published' ? 'intake.outcome.published' : 'intake.outcome.failed', {
                  at: formatDateTime(outcome.attemptedAt, timeZone),
                  read: outcome.counts.rowsRead,
                  accepted: outcome.counts.rowsAccepted,
                })}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </section>
  );
}

function BatchRead({ batchId }: { batchId: string }) {
  const query = useQuery(readQuery(api, 'readImportBatch', { params: { batchId } }));
  return (
    <ListRead query={query} what="intake.batch.what">
      {(read) => <Batch read={read} />}
    </ListRead>
  );
}

/** Setup › File intake and saved layouts. */
export function FileIntakeScreen() {
  const [stored, setStored] = useState<ImportFileStored | null>(null);
  const [batchId, setBatchId] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-4">
      <Upload
        onStored={(next) => {
          setStored(next);
          setBatchId(null);
        }}
      />
      {stored !== null && <StoredFile stored={stored} onOpen={setBatchId} />}
      {batchId !== null && <BatchRead batchId={batchId} />}
      {stored === null && batchId === null && <EmptyState title="intake.empty.title" body="intake.empty.body" />}
    </div>
  );
}
