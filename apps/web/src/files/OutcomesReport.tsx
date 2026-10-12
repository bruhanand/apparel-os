import {
  importBatchStateSchema,
  importKindSchema,
  type ImportOutcomes,
  type ImportOutcomesQuery,
} from '@apparel-os/schemas';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../api';
import { readQuery } from '../api/query';
import { EmptyState } from '../components/StandardStates';
import { StatusBadge } from '../components/StatusBadge';
import { AsOf } from '../history/AsOf';
import { formatDateTime } from '../history/format';
import { t } from '../messages/catalogue';
import { useBusinessToday } from '../setup/business-date';
import { Card, inputClass, ListRead, Th } from '../setup/parts';
import { useTimeZone } from '../shell/session';
import { stateIdOf } from '../setup/states';
import { BatchRead } from './BatchView';
import { countsText } from './import-text';

// The import outcomes report on Setup › File intake and saved layouts (imports-and-opening-data 7.4, 14, 16;
// phases.md stage 1; PRD-IMP-013, PRD-MOD-003, PRD-EXC-010, PRD-EXC-011, PRD-SEC-005; S1-F06-T04): each batch the
// reader may see, with its kind, target, layout and mapping versions, who started it and when, its state, its last
// attempt's counts and each document; filtered by Store, kind, state and the date started; read at its as-of time.
// Open drills into the batch, which holds its rows, issues and stored file. A Store is offered by its code where the
// reader may view Stores; the server shows only the batches inside the reader's scope.

type Filters = Partial<Record<keyof ImportOutcomesQuery, string>>;

/** The filters set, each as the route's query takes it; an empty one left out. */
function queryOf(filters: Filters): ImportOutcomesQuery {
  const kind = importKindSchema.safeParse(filters.kind);
  const state = importBatchStateSchema.safeParse(filters.state);
  return {
    ...(filters.storeId === undefined || filters.storeId === '' ? {} : { storeId: filters.storeId }),
    ...(kind.success ? { kind: kind.data } : {}),
    ...(state.success ? { state: state.data } : {}),
    ...(filters.from === undefined || filters.from === '' ? {} : { from: filters.from }),
    ...(filters.to === undefined || filters.to === '' ? {} : { to: filters.to }),
  };
}

function Select({
  id,
  label,
  any,
  value,
  options,
  onChange,
}: {
  id: string;
  label: Parameters<typeof t>[0];
  any: Parameters<typeof t>[0];
  value: string;
  options: readonly { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex flex-col gap-1" htmlFor={id}>
      <span className="text-body-sm font-semibold">{t(label)}</span>
      <select
        id={id}
        className={inputClass}
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
        }}
      >
        <option value="">{t(any)}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function BatchRow({
  batch,
  storeCode,
  onOpen,
}: {
  batch: ImportOutcomes['batches'][number];
  storeCode: string | undefined;
  onOpen: () => void;
}) {
  const timeZone = useTimeZone();
  return (
    <tr className="h-10 border-t border-border align-top">
      <td className="px-3">
        <span className="flex flex-col">
          <span className="font-mono">{batch.code}</span>
          {storeCode !== undefined && <span className="text-caption text-text-2">{storeCode}</span>}
          <button type="button" className="self-start text-caption text-accent underline" onClick={onOpen}>
            {t('outcomes.open', { code: batch.code })}
          </button>
        </span>
      </td>
      <td className="px-3">
        <StatusBadge state={stateIdOf(batch.state)} />
      </td>
      <td className="px-3">
        {batch.kind} · {batch.target}
      </td>
      <td className="px-3 text-body-sm">
        <span className="flex flex-col">
          <span>{t('outcomes.version', { code: batch.layout.code, version: batch.layout.version })}</span>
          <span>{t('outcomes.version', { code: batch.mapping.code, version: batch.mapping.version })}</span>
        </span>
      </td>
      <td className="px-3 text-body-sm">{formatDateTime(batch.startedAt, timeZone)}</td>
      <td className="px-3 text-body-sm">
        {batch.lastOutcome === undefined
          ? t('outcomes.no-attempt', { read: batch.rowsRead })
          : countsText(batch.lastOutcome)}
      </td>
      <td className="px-3 text-body-sm">
        <ul className="m-0 flex list-none flex-col gap-1 p-0">
          {batch.documents.map((document) => (
            <li key={document.documentId}>
              {t('outcomes.document', {
                reference: document.referenceMasked === undefined ? document.reference : t('intake.value.masked'),
                rows: document.rows,
                state: document.excluded ? t('intake.document.excluded') : document.state,
              })}
            </li>
          ))}
        </ul>
      </td>
    </tr>
  );
}

export function OutcomesReport() {
  const [filters, setFilters] = useState<Filters>({});
  const [opened, setOpened] = useState<string | null>(null);
  const timeZone = useTimeZone();
  const today = useBusinessToday();
  const query = useQuery(readQuery(api, 'importOutcomes', { query: queryOf(filters) }));
  // The Stores the reader may view, to filter by and to name; none when the reader may view none (module-map 4.11).
  const structure = useQuery(readQuery(api, 'readMasterLists', { query: { date: today } }));
  const stores = structure.data?.stores ?? [];
  const set = (key: keyof Filters) => (value: string) => {
    setFilters((current) => ({ ...current, [key]: value }));
    setOpened(null);
  };
  return (
    <div className="flex flex-col gap-4">
      <Card title="outcomes.title">
        <div role="group" aria-label={t('outcomes.filters')} className="flex flex-wrap gap-3">
          {stores.length > 0 && (
            <Select
              id="outcomes-store"
              label="outcomes.store"
              any="outcomes.store.any"
              value={filters.storeId ?? ''}
              options={stores.map((store) => ({ value: store.id, label: `${store.code} · ${store.name}` }))}
              onChange={set('storeId')}
            />
          )}
          <Select
            id="outcomes-kind"
            label="outcomes.kind"
            any="outcomes.kind.any"
            value={filters.kind ?? ''}
            options={importKindSchema.options.map((kind) => ({ value: kind, label: kind }))}
            onChange={set('kind')}
          />
          <Select
            id="outcomes-state"
            label="outcomes.state"
            any="outcomes.state.any"
            value={filters.state ?? ''}
            options={importBatchStateSchema.options.map((state) => ({ value: state, label: state }))}
            onChange={set('state')}
          />
          {(['from', 'to'] as const).map((key) => (
            <label key={key} className="flex flex-col gap-1" htmlFor={`outcomes-${key}`}>
              <span className="text-body-sm font-semibold">{t(`outcomes.${key}`)}</span>
              <input
                id={`outcomes-${key}`}
                type="date"
                className={inputClass}
                value={filters[key] ?? ''}
                onChange={(event) => {
                  set(key)(event.target.value);
                }}
              />
            </label>
          ))}
        </div>
        <ListRead query={query} what="outcomes.what">
          {(report) => (
            <div className="flex flex-col gap-3">
              <AsOf asOf={report.asOf} timeZone={timeZone} />
              {report.batches.length === 0 ? (
                <EmptyState title="outcomes.empty.title" body="outcomes.empty.body" />
              ) : (
                <div className="overflow-x-auto rounded-card border border-border">
                  <table className="w-full border-collapse text-body" aria-label={t('outcomes.table')}>
                    <thead>
                      <tr>
                        <Th label="outcomes.batch" />
                        <Th label="outcomes.state" />
                        <Th label="outcomes.target" />
                        <Th label="outcomes.versions" />
                        <Th label="outcomes.started" />
                        <Th label="outcomes.counts" />
                        <Th label="outcomes.documents" />
                      </tr>
                    </thead>
                    <tbody>
                      {report.batches.map((batch) => (
                        <BatchRow
                          key={batch.batchId}
                          batch={batch}
                          storeCode={stores.find((store) => store.id === batch.storeId)?.code}
                          onOpen={() => {
                            setOpened(batch.batchId);
                          }}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </ListRead>
      </Card>
      {opened !== null && <BatchRead batchId={opened} />}
    </div>
  );
}
