import {
  IMPORT_BATCH_TYPE,
  type ImportFileStored,
  type LayoutDetection,
  type LayoutStructure,
} from '@apparel-os/schemas';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../api';
import { useSubmission } from '../api/command';
import { readQuery } from '../api/query';
import { Banner } from '../components/Banner';
import { EmptyState } from '../components/StandardStates';
import { StatusBadge } from '../components/StatusBadge';
import { missingText } from '../components/UnavailableState';
import { t } from '../messages/catalogue';
import { Card, GrantedButton, inputClass, ListRead, SubmissionBanner } from '../setup/parts';
import { RecordDrawer } from '../setup/RecordDrawer';
import { stateIdOf } from '../setup/states';
import { BatchRead } from './BatchView';
import { OutcomesReport } from './OutcomesReport';
import { base64Of, sizeText } from './Evidence';
import { MappingRules, ProposeLayoutForm, SavedLayouts } from './SavedLayouts';

// Setup › File intake and saved layouts (imports-and-opening-data 3.1, 6.5, 13.1, 14, 16; ui-blueprint Setup;
// design-language 10.10; S1-F06-T01, S1-F06-T03): a preparer uploads an XLSX file, which the server checks from its
// content and keeps encrypted; the stored file shows with its earlier batches and the saved layout versions its
// structure matches, one proposed, several to choose from, or none, when the preparer proposes a new version from the
// file's header; a batch is started with a matching layout and mapping; the batch, its staged rows and its validation
// report follow (BatchView). The saved layouts and the mapping rules, with their proposals, have tabs of their own, and
// so does the import outcomes report (OutcomesReport; S1-F06-T04).

const XLSX_ACCEPT = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

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

/** A layout version proposed from the first sheet's first row: every named column, the first the reference (6.1). */
function structureFrom(detection: LayoutDetection): LayoutStructure {
  const sheet = detection.sheets.find((each) => each.firstRow.some((text) => text !== '')) ?? detection.sheets[0];
  const names = (sheet?.firstRow ?? []).filter((text) => text !== '');
  return {
    shape: 'layout-version/1',
    format: 'xlsx',
    sheet: sheet?.name ?? '',
    headerRow: 1,
    dataStartRow: 2,
    columns: names.map((name, at) => ({ name, required: at === 0 })),
    documentReference: names[0] ?? '',
  };
}

/** One compatible layout version and one of its mapping versions, which a batch may start with. */
interface Choice {
  readonly key: string;
  readonly layoutVersionId: string;
  readonly mappingVersionId: string;
  readonly target: string;
  readonly label: string;
}

/** The stored file, its earlier batches, the layouts it matches, and Start an import (6.5, 7.2, 13.1). */
function StoredFile({ stored, onOpen }: { stored: ImportFileStored; onOpen: (batchId: string) => void }) {
  const detection = useQuery(
    readQuery(api, 'detectImportLayout', {
      params: { storedFileId: stored.storedFileId },
      query: { fileReceiptId: stored.receiptId },
    }),
  );
  const layouts = useQuery(readQuery(api, 'listImportLayouts', {}));
  const [choice, setChoice] = useState('');
  const [proposing, setProposing] = useState(false);
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
      <ListRead query={detection} what="intake.detection.what">
        {(found) => (
          <ListRead query={layouts} what="intake.layouts.what">
            {(list) => {
              const compatible = new Set(found.compatible.map((each) => each.layoutVersionId));
              const choices: Choice[] = list.layouts
                .filter((layout) => compatible.has(layout.layoutVersionId))
                .flatMap((layout) =>
                  layout.mappings
                    .filter((mapping) => mapping.state !== 'Rejected')
                    .map((mapping) => ({
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
              const proposed = choices.find((each) => each.layoutVersionId === found.proposed);
              const selected = choice === '' && proposed !== undefined ? proposed.key : choice;
              const chosen = choices.find((each) => each.key === selected);
              return (
                <div className="flex flex-col gap-3">
                  {found.compatible.length === 0 ? (
                    <EmptyState title="intake.detection.none.title" body="intake.detection.none.body">
                      <GrantedButton
                        label="intake.propose.layout.from-file"
                        recordType="files_imports.layout"
                        action="create"
                        onClick={() => {
                          setProposing(true);
                        }}
                      />
                    </EmptyState>
                  ) : (
                    <Banner
                      tone="info"
                      role="status"
                      message={found.proposed === undefined ? 'intake.detection.choose' : 'intake.detection.one'}
                    />
                  )}
                  {found.incompatible.length > 0 && (
                    <details className="text-body-sm">
                      <summary>{t('intake.detection.incompatible', { count: found.incompatible.length })}</summary>
                      <ul className="m-0 flex list-none flex-col gap-1 p-0 pt-2">
                        {found.incompatible.map((each) => (
                          <li key={each.layoutVersionId}>
                            {t('intake.layout.version', { code: each.layoutCode, version: each.version })}:{' '}
                            {each.missing.map(missingText).join(' ')}
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                  {choices.length > 0 && (
                    <>
                      <SubmissionBanner state={start.state} done="intake.start.done" />
                      <label className="flex flex-col gap-1" htmlFor="intake-layout">
                        <span className="text-body-sm font-semibold">{t('intake.layout')}</span>
                        <select
                          id="intake-layout"
                          className={inputClass}
                          value={selected}
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
                    </>
                  )}
                  {proposing && (
                    <RecordDrawer
                      title={t('intake.propose.layout')}
                      onClose={() => {
                        setProposing(false);
                      }}
                      details={<ProposeLayoutForm start={structureFrom(found)} />}
                    />
                  )}
                </div>
              );
            }}
          </ListRead>
        )}
      </ListRead>
    </Card>
  );
}

function Intake() {
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

const TABS = ['intake', 'layouts', 'rules', 'outcomes'] as const;
type Tab = (typeof TABS)[number];

/** Setup › File intake and saved layouts. */
export function FileIntakeScreen() {
  const [tab, setTab] = useState<Tab>('intake');
  return (
    <div className="flex flex-col gap-4">
      <div role="tablist" aria-label={t('intake.tabs')} className="flex flex-wrap gap-2 border-b border-border">
        {TABS.map((each) => (
          <button
            key={each}
            type="button"
            role="tab"
            id={`intake-tab-${each}`}
            aria-selected={tab === each}
            aria-controls="intake-tab-panel"
            className={
              tab === each
                ? 'h-9 border-b-2 border-accent px-3 font-semibold text-text'
                : 'h-9 px-3 text-text-2 hover:text-accent'
            }
            onClick={() => {
              setTab(each);
            }}
          >
            {t(`intake.tab.${each}`)}
          </button>
        ))}
      </div>
      <div id="intake-tab-panel" role="tabpanel" aria-labelledby={`intake-tab-${tab}`}>
        {tab === 'intake' && <Intake />}
        {tab === 'layouts' && <SavedLayouts />}
        {tab === 'rules' && <MappingRules />}
        {tab === 'outcomes' && <OutcomesReport />}
      </div>
    </div>
  );
}
