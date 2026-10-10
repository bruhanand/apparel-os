import {
  IMPORT_BATCH_TYPE,
  type DocumentPreview,
  type ImportBatchRead,
  type ImportOutcome,
  type RowIssue,
  type StagedRow,
  type ValueSuggestion,
} from '@apparel-os/schemas';
import { cn } from '@apparel-os/ui';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../api';
import { useSubmission } from '../api/command';
import { readQuery } from '../api/query';
import { Banner } from '../components/Banner';
import { Button } from '../components/Button';
import { codeText } from '../components/StandardStates';
import { StatusBadge } from '../components/StatusBadge';
import { familyClasses } from '../components/StatusBadge';
import { missingText } from '../components/UnavailableState';
import { AsOf } from '../history/AsOf';
import { formatDateTime } from '../history/format';
import { t } from '../messages/catalogue';
import { useTimeZone } from '../shell/session';
import { recordTypeName } from '../setup/describe';
import { Card, GrantedButton, inputClass, ListRead, SubmissionBanner, Th } from '../setup/parts';
import { FormActions, RecordDrawer } from '../setup/RecordDrawer';
import { stateIdOf } from '../setup/states';
import { EvidenceList } from './Evidence';
import { className, correctionText, countsText, fieldName, issueText, placeText, valueLines } from './import-text';

// One import batch on Setup › File intake and saved layouts (imports-and-opening-data 3.2, 5, 8, 11, 13.1, 16;
// design-language 10.10; S1-F06-T01, S1-F06-T03): its staged rows with each original cell's value beside its
// normalised value and origin, hidden rows marked, a value entered by a person with the suggestions to accept, a
// document excluded or put back; the validation report with its Warnings marked seen one class at a time; Validate,
// Submit for review and Publish. A value of a class the reader is not granted is masked. With S1-F06-T04: a document
// that duplicates, conflicts with or revises a published one says so; Publish carries the batch version read and says
// when some documents were not published; Withdraw; and each attempt's counts and documents (7.2, 7.4).

const BATCH_READS = ['readImportBatch'] as const;

const SEVERITY: Readonly<Record<RowIssue['severity'], { glyph: string; classes: string }>> = {
  Blocking: { glyph: '✕', classes: familyClasses.stopped },
  Warning: { glyph: '!', classes: familyClasses.attention },
  Note: { glyph: 'i', classes: familyClasses.pending },
};

function Severity({ severity }: { severity: RowIssue['severity'] }) {
  const { glyph, classes } = SEVERITY[severity];
  return (
    <span
      className={cn('inline-flex h-[22px] items-center gap-1 rounded-full px-[9px] text-[12px] font-semibold', classes)}
    >
      <span aria-hidden="true">{glyph}</span>
      {t(`intake.severity.${severity}`)}
    </span>
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
    <ul aria-label={t('intake.issues')} className="m-0 flex list-none flex-col gap-1 p-0 text-body-sm text-d-fg">
      {preview.issues.map((issue, index) => (
        <li key={index}>
          {issueText(issue.code)}
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

/** Enter a value for one field of a staged row, with the suggestions to accept (section 5; PRD-IMP-009). */
function EntryForm({
  batchId,
  row,
  field,
  onDone,
}: {
  batchId: string;
  row: StagedRow;
  field: string;
  onDone: () => void;
}) {
  const suggestions = useQuery(
    readQuery(api, 'stagedValueSuggestions', { params: { batchId, stagedRowId: row.stagedRowId }, query: { field } }),
  );
  const enter = useSubmission('enterStagedValue', BATCH_READS);
  const [value, setValue] = useState('');
  const [reason, setReason] = useState('');
  const [accepted, setAccepted] = useState<ValueSuggestion | undefined>();
  const formId = `entry-${row.stagedRowId}-${field}`;
  return (
    <form
      id={formId}
      noValidate
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        void (async () => {
          const done = await enter.submit({
            params: { batchId, stagedRowId: row.stagedRowId },
            body: { field, value, reason, ...(accepted?.value === value ? { suggestion: accepted } : {}) },
          });
          if (done !== undefined) onDone();
        })();
      }}
    >
      <SubmissionBanner state={enter.state} done="intake.entry.done" />
      <p className="m-0 text-body-sm text-text-2">
        {t('intake.entry.help', { field: fieldName(field), row: row.rowNumber })}
      </p>
      <ListRead query={suggestions} what="intake.suggestions.what">
        {(answer) =>
          answer.suggestions.length === 0 ? (
            <p className="m-0 text-body-sm text-text-2">{t('intake.suggestions.none')}</p>
          ) : (
            <ul aria-label={t('intake.suggestions')} className="m-0 flex list-none flex-col gap-1 p-0">
              {answer.suggestions.map((suggestion) => (
                <li key={suggestion.value} className="flex items-center gap-2 text-body-sm">
                  <Button
                    label="intake.suggestion.accept"
                    onClick={() => {
                      setValue(suggestion.value);
                      setAccepted(suggestion);
                    }}
                  />
                  <span className="font-mono">{suggestion.value}</span>
                  {suggestion.label !== undefined && <span className="text-text-2">{suggestion.label}</span>}
                  <span className="text-caption text-text-2">{t(`intake.suggestion.${suggestion.kind}`)}</span>
                </li>
              ))}
            </ul>
          )
        }
      </ListRead>
      <label className="flex flex-col gap-1" htmlFor={`${formId}-value`}>
        <span className="text-body-sm font-semibold">{t('intake.entry.value')}</span>
        <input
          id={`${formId}-value`}
          className={inputClass}
          value={value}
          onChange={(event) => {
            setValue(event.target.value);
          }}
        />
      </label>
      <label className="flex flex-col gap-1" htmlFor={`${formId}-reason`}>
        <span className="text-body-sm font-semibold">{t('intake.entry.reason')}</span>
        <input
          id={`${formId}-reason`}
          className={inputClass}
          value={reason}
          onChange={(event) => {
            setReason(event.target.value);
          }}
        />
      </label>
      <FormActions form={formId} label="intake.entry.submit" pending={enter.state.kind === 'pending'} />
    </form>
  );
}

/** A staged row: each field's normalised value with where it came from (section 5; design-language 10.10). */
function RowValues({
  row,
  fields,
  editable,
  onEnter,
}: {
  row: StagedRow;
  fields: readonly string[];
  editable: boolean;
  onEnter: (field: string) => void;
}) {
  return (
    <tr className="h-10 border-t border-border align-top">
      <td className="px-3 font-mono">
        {row.rowNumber}
        {row.hidden && <span className="ml-1 text-caption text-text-2">{t('intake.row.hidden')}</span>}
      </td>
      {fields.map((field) => {
        const lines = valueLines(row.values[field]);
        const masked = row.values[field]?.kind === 'masked';
        return (
          <td key={field} className="px-3">
            <span className="flex flex-col">
              <span className={lines.value === t('intake.value.unknown') || masked ? 'text-text-2' : ''}>
                {lines.value}
              </span>
              {lines.origin !== '' && <span className="text-caption text-text-2">{lines.origin}</span>}
              {editable && !masked && (
                <button
                  type="button"
                  className="self-start text-caption text-accent underline"
                  aria-label={t('intake.entry.open', { field: fieldName(field), row: row.rowNumber })}
                  onClick={() => {
                    onEnter(field);
                  }}
                >
                  {t('intake.entry.enter')}
                </button>
              )}
            </span>
          </td>
        );
      })}
    </tr>
  );
}

/** The validation report (8.1, 8.2): counts, issues with their place and correction, control totals and sheets. */
function Report({ read }: { read: ImportBatchRead }) {
  const report = read.report;
  const seen = useSubmission('markImportIssuesSeen', BATCH_READS);
  const timeZone = useTimeZone();
  if (report === undefined) {
    return (
      <Card title="intake.report">
        <p className="m-0 text-body-sm text-text-2">{t('intake.report.none')}</p>
      </Card>
    );
  }
  const unseenClasses = [
    ...new Set(
      report.issues
        .filter((issue) => issue.severity === 'Warning' && issue.seen === undefined)
        .map((issue) => issue.class),
    ),
  ];
  return (
    <Card title="intake.report">
      <p className="m-0 text-body-sm text-text-2">
        {t('intake.report.counts', {
          at: formatDateTime(report.runAt, timeZone),
          blocking: report.counts.blocking,
          warnings: report.counts.warnings,
          unseen: report.counts.warningsNotSeen,
          notes: report.counts.notes,
        })}
      </p>
      <SubmissionBanner state={seen.state} done="intake.report.seen.done" />
      {read.batch.state === 'Validated' && unseenClasses.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {unseenClasses.map((issueClass) => (
            <GrantedButton
              key={issueClass}
              label="intake.report.seen"
              labelParams={{ class: issueClass }}
              recordType={IMPORT_BATCH_TYPE}
              action="edit"
              onClick={() => {
                void seen.submit({ params: { batchId: read.batch.batchId }, body: { class: issueClass } });
              }}
            />
          ))}
        </div>
      )}
      {report.issues.length > 0 && (
        <div className="overflow-x-auto rounded-card border border-border">
          <table className="w-full border-collapse text-body" aria-label={t('intake.report.issues')}>
            <thead>
              <tr>
                <Th label="intake.report.severity" />
                <Th label="intake.report.class" />
                <Th label="intake.report.place" />
                <Th label="intake.report.original" />
                <Th label="intake.report.wrong" />
                <Th label="intake.report.correction" />
                <Th label="intake.report.rule" />
              </tr>
            </thead>
            <tbody>
              {report.issues.map((issue) => (
                <tr key={issue.issueId} className="h-10 border-t border-border align-top">
                  <td className="px-3">
                    <Severity severity={issue.severity} />
                    {issue.seen !== undefined && (
                      <span className="ml-1 text-caption text-text-2">{t('intake.report.marked-seen')}</span>
                    )}
                  </td>
                  <td className="px-3 font-mono">{issue.class}</td>
                  <td className="px-3">{placeText(issue)}</td>
                  <td className="px-3">
                    {issue.original === undefined
                      ? ''
                      : issue.original.kind === 'value'
                        ? issue.original.text
                        : t('intake.value.masked-class', { class: className(issue.original.fieldClass) })}
                  </td>
                  <td className="px-3">
                    {issueText(issue.code)}
                    {issue.missing.map((item, at) => (
                      <span key={at}> {missingText(item)}</span>
                    ))}
                  </td>
                  <td className="px-3">{correctionText(issue.correction)}</td>
                  <td className="px-3 font-mono text-caption">{issue.rule}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {report.controlTotals.length > 0 && (
        <ul aria-label={t('intake.report.totals')} className="m-0 flex list-none flex-col gap-1 p-0 text-body-sm">
          {report.controlTotals.map((total) => (
            <li key={`${total.sheet}-${String(total.rowNumber)}-${total.column}`}>
              {t('intake.report.total', {
                column: total.column,
                row: total.rowNumber,
                reported: total.reported ?? t('intake.value.unknown'),
                summed: total.summed ?? t('intake.value.unknown'),
              })}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/** What became of each document at one attempt (7.2, 7.4): published, refused, a conflict, a duplicate, excluded. */
function OutcomeDocuments({ outcome, read }: { outcome: ImportOutcome; read: ImportBatchRead }) {
  return (
    <ul aria-label={t('intake.outcome.documents')} className="m-0 flex list-none flex-col gap-1 p-0 pl-4">
      {outcome.documents.map((document) => {
        const found = read.documents.find((each) => each.documentId === document.documentId);
        const reference =
          found === undefined || found.referenceMasked !== undefined ? t('intake.value.masked') : found.reference;
        return (
          <li key={document.documentId}>
            {t(`intake.outcome.document.${document.result}`, { reference })}
            {document.refusalCode !== undefined && <> {issueText(document.refusalCode)}</>}
          </li>
        );
      })}
    </ul>
  );
}

export function Batch({ read }: { read: ImportBatchRead }) {
  const timeZone = useTimeZone();
  const validate = useSubmission('validateImport', BATCH_READS);
  const submit = useSubmission('submitImport', BATCH_READS);
  const publish = useSubmission('publishImport', BATCH_READS);
  const withdraw = useSubmission('withdrawImport', BATCH_READS);
  const exclude = useSubmission('excludeImportDocument', BATCH_READS);
  const [published, setPublished] = useState<'published' | 'failed' | undefined>();
  const [entering, setEntering] = useState<{ row: StagedRow; field: string } | null>(null);
  const { batch } = read;
  const open = batch.state === 'Staged' || batch.state === 'Validated';
  const fields = [
    ...new Set(read.documents.flatMap((document) => document.rows.flatMap((row) => Object.keys(row.values)))),
  ];
  const submitted = batch.submittedVersionId === batch.versionId;
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
      <p className="m-0 flex flex-wrap items-center gap-2 text-body-sm">
        {t('intake.batch.layout')} <StatusBadge state={stateIdOf(batch.layoutState)} />
        {t('intake.batch.mapping')} <StatusBadge state={stateIdOf(batch.mappingState)} />
        {submitted && <span className="text-text-2">{t('intake.batch.submitted')}</span>}
      </p>
      {batch.maskedClasses.length > 0 && (
        <Banner tone="info" role="status" message="intake.batch.masked">
          {batch.maskedClasses.map(className).join(', ')}
        </Banner>
      )}
      {batch.readerNotes.length > 0 && <Banner tone="warning" role="status" message="intake.batch.notes" />}
      {(batch.layoutState !== 'Confirmed' || batch.mappingState !== 'Confirmed') && open && (
        <Banner tone="info" role="status" message="intake.batch.unconfirmed" />
      )}
      <SubmissionBanner state={validate.state} done="intake.validate.done" />
      <SubmissionBanner state={submit.state} done="intake.submit.done" />
      <SubmissionBanner
        state={publish.state}
        done={published === 'failed' ? 'intake.publish.partly' : 'intake.publish.done'}
      />
      <SubmissionBanner state={withdraw.state} done="intake.withdraw.done" />
      <SubmissionBanner state={exclude.state} done="intake.exclude.done" />
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
        {batch.state === 'Validated' && !submitted && (
          <GrantedButton
            label="intake.submit"
            recordType={IMPORT_BATCH_TYPE}
            action="edit"
            variant="primary"
            onClick={() => {
              void submit.submit({ params: { batchId: batch.batchId }, body: {} });
            }}
          />
        )}
        {batch.state === 'Validated' && submitted && (
          <GrantedButton
            label="intake.publish"
            recordType={IMPORT_BATCH_TYPE}
            action="edit"
            variant="primary"
            onClick={() => {
              void (async () => {
                // The batch version read travels with it (code-house-rules 12.7).
                const answer = await publish.submit({
                  params: { batchId: batch.batchId },
                  body: { versionId: batch.versionId },
                });
                setPublished(answer?.result);
              })();
            }}
          />
        )}
        {open && (
          <GrantedButton
            label="intake.withdraw"
            recordType={IMPORT_BATCH_TYPE}
            action="edit"
            onClick={() => {
              void withdraw.submit({ params: { batchId: batch.batchId }, body: { versionId: batch.versionId } });
            }}
          />
        )}
      </div>
      <ul aria-label={t('intake.sheets')} className="m-0 flex list-none flex-wrap gap-3 p-0 text-body-sm text-text-2">
        {batch.sheets.map((sheet) => (
          <li key={sheet.name}>
            {t(sheet.imported ? 'intake.sheet.imported' : 'intake.sheet.listed', {
              name: sheet.name,
              count: sheet.rows,
            })}
            {sheet.state !== 'visible' && <> {t('intake.sheet.hidden')}</>}
          </li>
        ))}
      </ul>
      <Report read={read} />
      {read.documents.map((document) => {
        const reference = document.referenceMasked === undefined ? document.reference : t('intake.value.masked');
        return (
          <Card key={document.documentId}>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="m-0 text-h3 font-semibold">{t('intake.document', { reference })}</h3>
              <StatusBadge state={stateIdOf(document.state)} />
              {document.excluded && <span className="text-body-sm text-text-2">{t('intake.document.excluded')}</span>}
              {open && document.state === 'Staged' && (
                <GrantedButton
                  label={document.excluded ? 'intake.document.put-back' : 'intake.document.exclude'}
                  recordType={IMPORT_BATCH_TYPE}
                  action="edit"
                  onClick={() => {
                    void exclude.submit({
                      params: { batchId: batch.batchId, documentId: document.documentId },
                      body: { excluded: !document.excluded },
                    });
                  }}
                />
              )}
            </div>
            {document.identity !== undefined && (
              <Banner
                tone={document.identity.kind === 'conflict' ? 'warning' : 'info'}
                role="status"
                message={`intake.document.identity.${document.identity.kind}`}
              />
            )}
            {document.revisesDocumentId !== undefined && (
              <p className="m-0 text-body-sm text-text-2">{t('intake.document.revises')}</p>
            )}
            {document.preview !== undefined && <Preview preview={document.preview} />}
            <div className="overflow-x-auto rounded-card border border-border">
              <table className="w-full border-collapse text-body" aria-label={t('intake.rows', { reference })}>
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
                    <RowValues
                      key={row.stagedRowId}
                      row={row}
                      fields={fields}
                      editable={open && document.state === 'Staged'}
                      onEnter={(field) => {
                        setEntering({ row, field });
                      }}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        );
      })}
      <Card title="intake.stored.title">
        <EvidenceList attachmentIds={[batch.attachmentId]} />
      </Card>
      {read.ignoredRows.length > 0 && (
        <p className="m-0 text-body-sm text-text-2">{t('intake.ignored', { count: read.ignoredRows.length })}</p>
      )}
      {read.outcomes.length > 0 && (
        <Card title="intake.outcomes">
          <ul className="m-0 flex list-none flex-col gap-1 p-0 text-body-sm">
            {read.outcomes.map((outcome) => (
              <li key={outcome.outcomeId} className="flex flex-col gap-1">
                <span>
                  {t(outcome.result === 'published' ? 'intake.outcome.published' : 'intake.outcome.failed', {
                    at: formatDateTime(outcome.attemptedAt, timeZone),
                  })}{' '}
                  {countsText(outcome)}
                  {outcome.refusalCode !== undefined && <> {codeText(outcome.refusalCode)}</>}
                </span>
                <OutcomeDocuments outcome={outcome} read={read} />
              </li>
            ))}
          </ul>
        </Card>
      )}
      {entering !== null && (
        <RecordDrawer
          title={t('intake.entry.title', { field: fieldName(entering.field) })}
          onClose={() => {
            setEntering(null);
          }}
          details={
            <EntryForm
              batchId={batch.batchId}
              row={entering.row}
              field={entering.field}
              onDone={() => {
                setEntering(null);
              }}
            />
          }
        />
      )}
    </section>
  );
}

export function BatchRead({ batchId }: { batchId: string }) {
  const query = useQuery(readQuery(api, 'readImportBatch', { params: { batchId } }));
  return (
    <ListRead query={query} what="intake.batch.what">
      {(read) => <Batch read={read} />}
    </ListRead>
  );
}
