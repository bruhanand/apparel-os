import {
  POSTING_MAP_TYPE,
  postingMapDraftSchema,
  type MapLineDraft,
  type PostingMapRecord,
  type SettingOrigin,
} from '@apparel-os/schemas';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../api';
import { useSubmission } from '../api/command';
import { readQuery } from '../api/query';
import { ApprovalPanel } from '../approvals/ApprovalPanel';
import { Banner } from '../components/Banner';
import { Button } from '../components/Button';
import { EmptyState } from '../components/StandardStates';
import { StatusBadge } from '../components/StatusBadge';
import { EvidenceList, EvidencePicker, useChosenFile, useStoreEvidence } from '../files/Evidence';
import { AsOf } from '../history/AsOf';
import { t } from '../messages/catalogue';
import { useTimeZone } from '../shell/session';
import { useBusinessToday } from '../setup/business-date';
import { formatDate } from '../setup/format';
import { Card, GrantedButton, HistoryTab, inputClass, ListRead, SubmissionBanner, Th, Toolbar } from '../setup/parts';
import { FormActions, RecordDrawer } from '../setup/RecordDrawer';
import { stateIdOf } from '../setup/states';
import { BookPicker } from './BookPicker';

// Setup › Posting maps (books-and-posting 6, 14; ui-blueprint Setup › Posting maps; PRD-LED-003, POL-09.11,
// POL-09.12; S1-F09-T02): for a book, each event kind's map with every component and its lines, the version in force on
// a chosen date, and its approval. An authorised Accounts user prepares a version and attaches the CA's approval
// evidence; a different one decides it from My work (6.3; POL-09.01; DEC-112, GC4-2). The accounts and maps are
// Accounts' and the CA's (V-10): on dev every one is SYNTHETIC.

const READS = ['listPostingMaps', 'listMyWork'] as const;
const ORIGINS: readonly SettingOrigin[] = ['synthetic', 'test-setup', 'kdps'];

interface ComponentChoice {
  readonly debit: string;
  readonly credit: string;
  readonly requiresStore: boolean;
  readonly requiresBrand: boolean;
}

/**
 * A new version of a book's map for one event kind: for each component of the kind, the account it debits and the
 * account it credits, and the dimensions its lines require (6.1). A component left with no account is refused by the
 * server, naming it (6.1).
 */
function NewVersionForm({
  bookId,
  eventKinds,
  maps,
}: {
  bookId: string;
  eventKinds: readonly { kind: string; components: readonly string[] }[];
  maps: readonly PostingMapRecord[];
}) {
  const today = useBusinessToday();
  const accounts = useQuery(readQuery(api, 'listAccounts', { params: { bookId } }));
  const [eventKind, setEventKind] = useState(eventKinds[0]?.kind ?? '');
  const [validFrom, setValidFrom] = useState(today);
  const [origin, setOrigin] = useState<SettingOrigin>('synthetic');
  const [choices, setChoices] = useState<Record<string, ComponentChoice>>({});
  const [invalid, setInvalid] = useState(false);
  const submission = useSubmission('preparePostingMap', READS);
  const components = eventKinds.find((each) => each.kind === eventKind)?.components ?? [];
  const choice = (component: string): ComponentChoice =>
    choices[component] ?? { debit: '', credit: '', requiresStore: false, requiresBrand: false };
  const set = (component: string, change: Partial<ComponentChoice>) => {
    setChoices({ ...choices, [component]: { ...choice(component), ...change } });
  };
  const inForce = accounts.data?.records.filter((record) =>
    record.versions.some((version) => version.state === 'In force' && !version.retired),
  );
  return (
    <form
      id="posting-map-new-form"
      aria-label={t('posting-maps.new')}
      noValidate
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        const lines: MapLineDraft[] = components.flatMap((component) => {
          const each = choice(component);
          const dimensions = { requiresStore: each.requiresStore, requiresBrand: each.requiresBrand };
          return [
            ...(each.debit === '' ? [] : [{ component, side: 'debit' as const, accountId: each.debit, ...dimensions }]),
            ...(each.credit === ''
              ? []
              : [{ component, side: 'credit' as const, accountId: each.credit, ...dimensions }]),
          ];
        });
        const token = maps.find((map) => map.eventKind === eventKind)?.versionToken;
        const body = {
          bookId,
          eventKind,
          origin,
          validFrom,
          lines,
          ...(token === undefined ? {} : { versionToken: token }),
        };
        const parsed = postingMapDraftSchema.safeParse(body);
        setInvalid(!parsed.success || validFrom < today);
        if (!parsed.success || validFrom < today) return;
        void submission.submit({ body: parsed.data });
      }}
    >
      <SubmissionBanner state={submission.state} />
      {invalid && <Banner tone="danger" role="alert" message="posting-maps.form-invalid" />}
      <label className="flex flex-col gap-1" htmlFor="posting-map-kind">
        <span className="text-body-sm font-semibold">{t('posting-maps.event-kind')}</span>
        <select
          id="posting-map-kind"
          className={inputClass}
          value={eventKind}
          onChange={(event) => {
            setEventKind(event.target.value);
            setChoices({});
          }}
        >
          {eventKinds.map((each) => (
            <option key={each.kind} value={each.kind}>
              {each.kind}
            </option>
          ))}
        </select>
      </label>
      {components.map((component) => (
        <fieldset key={component} className="flex flex-col gap-2 rounded-card border border-border p-3">
          <legend className="px-1 font-mono text-body-sm font-semibold">{component}</legend>
          {(['debit', 'credit'] as const).map((side) => (
            <label key={side} className="flex flex-col gap-1" htmlFor={`posting-map-${component}-${side}`}>
              <span className="text-body-sm">{t(`posting-maps.side.${side}`)}</span>
              <select
                id={`posting-map-${component}-${side}`}
                className={inputClass}
                value={choice(component)[side]}
                onChange={(event) => {
                  set(component, { [side]: event.target.value });
                }}
              >
                <option value="">{t('posting-maps.no-account')}</option>
                {(inForce ?? []).map((record) => (
                  <option key={record.id} value={record.id}>
                    {record.code} · {record.versions.find((version) => version.state === 'In force')?.name}
                  </option>
                ))}
              </select>
            </label>
          ))}
          {(['requiresStore', 'requiresBrand'] as const).map((dimension) => (
            <label key={dimension} className="flex items-center gap-2 text-body-sm">
              <input
                type="checkbox"
                checked={choice(component)[dimension]}
                onChange={(event) => {
                  set(component, { [dimension]: event.target.checked });
                }}
              />
              {t(`posting-maps.${dimension}`)}
            </label>
          ))}
        </fieldset>
      ))}
      <label className="flex flex-col gap-1" htmlFor="posting-map-origin">
        <span className="text-body-sm font-semibold">{t('posting-maps.origin')}</span>
        <select
          id="posting-map-origin"
          className={inputClass}
          value={origin}
          onChange={(event) => {
            setOrigin(event.target.value as SettingOrigin);
          }}
        >
          {ORIGINS.map((each) => (
            <option key={each} value={each}>
              {t(`origin.${each}`)}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1" htmlFor="posting-map-from">
        <span className="text-body-sm font-semibold">{t('setup.valid-from')}</span>
        <input
          id="posting-map-from"
          type="date"
          min={today}
          className={inputClass}
          value={validFrom}
          onChange={(event) => {
            setValidFrom(event.target.value);
          }}
        />
      </label>
      <FormActions form="posting-map-new-form" pending={submission.state.kind === 'pending'} />
    </form>
  );
}

/** Attaches the CA's approval evidence, a stored file, to a version awaiting its decision (6.3; S1-F06-T05). */
function AttachCaEvidence({ versionId }: { versionId: string }) {
  const chosen = useChosenFile();
  const storing = useStoreEvidence();
  const recording = useSubmission('recordCaEvidence', READS);
  return (
    <form
      aria-label={t('posting-maps.ca-evidence.attach')}
      className="flex flex-col gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        const picked = chosen.file;
        if (picked === null) return;
        void (async () => {
          const file = await storing.store(picked);
          if (file === undefined) return;
          const done = await recording.submit({
            body: { versions: [{ recordType: POSTING_MAP_TYPE, versionId }], evidence: { kind: 'file', file } },
          });
          if (done !== undefined) chosen.clear();
        })();
      }}
    >
      {storing.banner}
      <SubmissionBanner state={recording.state} done="posting-maps.ca-evidence.attached" />
      <EvidencePicker
        id={`ca-evidence-${versionId}`}
        label="posting-maps.ca-evidence.file"
        onChange={chosen.choose}
        resetKey={chosen.resetKey}
      />
      <div>
        <Button
          type="submit"
          size="small"
          label="posting-maps.ca-evidence.attach"
          disabled={chosen.file === null || recording.state.kind === 'pending'}
        />
      </div>
    </form>
  );
}

/** One map: every version with its lines, its approval and the CA's evidence; the version in force on the date. */
function MapDrawer({ map, on, onClose }: { map: PostingMapRecord; on: string; onClose: () => void }) {
  const [panel, setPanel] = useState<string | null>(null);
  const inForce = map.versions.find((version) => version.id === map.inForceOn);
  return (
    <RecordDrawer
      reference={map.eventKind}
      title={t('posting-maps.map-title', { kind: map.eventKind })}
      {...(inForce === undefined ? {} : { state: inForce.state })}
      onClose={onClose}
      history={<HistoryTab recordType={POSTING_MAP_TYPE} recordId={map.id} />}
      details={
        <>
          <Card title="posting-maps.components">
            <p className="m-0 font-mono text-body-sm">{map.components.join(' · ')}</p>
            <p className="m-0 text-body-sm text-text-2">
              {inForce === undefined
                ? t('posting-maps.none-in-force', { date: formatDate(on) })
                : t('posting-maps.in-force-on', { date: formatDate(on), from: formatDate(inForce.validFrom) })}
            </p>
          </Card>
          <Card title="setup.versions">
            <ol className="m-0 flex list-none flex-col gap-4 p-0">
              {map.versions.map((version) => (
                <li
                  key={version.id}
                  aria-label={t('posting-maps.version-from', { from: formatDate(version.validFrom) })}
                  className="flex flex-col gap-2 border-b border-border pb-3 last:border-b-0"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{t('dates.from', { from: formatDate(version.validFrom) })}</span>
                    <StatusBadge state={stateIdOf(version.state)} />
                    {version.id === map.inForceOn && (
                      <span className="text-caption text-text-2">{t('posting-maps.shown-date')}</span>
                    )}
                  </div>
                  <table className="w-full border-collapse text-body-sm">
                    <thead>
                      <tr>
                        <Th label="posting-maps.component" />
                        <Th label="posting-maps.side" />
                        <Th label="posting-maps.account" />
                        <Th label="posting-maps.requires" />
                      </tr>
                    </thead>
                    <tbody>
                      {version.lines.map((line, index) => (
                        <tr key={index} className="border-t border-border">
                          <td className="px-2 font-mono">{line.component}</td>
                          <td className="px-2">{t(`posting-maps.side.${line.side}`)}</td>
                          <td className="px-2 font-mono">{line.accountCode}</td>
                          <td className="px-2">
                            {[
                              t('posting-maps.dimension.business-unit'),
                              ...(line.requiresStore ? [t('posting-maps.dimension.store')] : []),
                              ...(line.requiresBrand ? [t('posting-maps.dimension.brand')] : []),
                            ].join(' · ')}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <span className="text-body-sm font-semibold">{t('posting-maps.ca-evidence')}</span>
                  <EvidenceList
                    attachmentIds={version.caEvidence.flatMap((each) =>
                      each.kind === 'file' ? [each.attachmentId] : [],
                    )}
                  />
                  {version.caEvidence
                    .flatMap((each) => (each.kind === 'reference' ? [each] : []))
                    .map((each) => (
                      <p key={each.id} className="m-0 text-body-sm">
                        {t('posting-maps.ca-evidence.reference', {
                          what: each.what,
                          by: each.givenBy,
                          on: formatDate(each.givenOn),
                          kept: each.keptAt,
                        })}
                      </p>
                    ))}
                  {version.state === 'Awaiting approval' && <AttachCaEvidence versionId={version.id} />}
                  {version.request?.state === 'Awaiting approval' && (
                    <div>
                      <Button
                        size="small"
                        variant="ghost"
                        label="setup.open-approval"
                        onClick={() => {
                          setPanel(version.request?.id ?? null);
                        }}
                      />
                    </div>
                  )}
                </li>
              ))}
            </ol>
          </Card>
          {panel !== null && <ApprovalPanel requestId={panel} />}
        </>
      }
    />
  );
}

/** Setup › Posting maps. */
export function PostingMapsScreen() {
  const timeZone = useTimeZone();
  const today = useBusinessToday();
  const [bookId, setBookId] = useState<string | null>(null);
  const [on, setOn] = useState(today);
  const [open, setOpen] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-4">
      <Toolbar>
        <BookPicker value={bookId} onChange={setBookId} />
        <label className="flex flex-col gap-1" htmlFor="posting-maps-on">
          <span className="text-body-sm font-semibold">{t('posting-maps.on')}</span>
          <input
            id="posting-maps-on"
            type="date"
            className={inputClass}
            value={on}
            onChange={(event) => {
              if (event.target.value !== '') setOn(event.target.value);
            }}
          />
        </label>
        <span className="flex-1" />
        {bookId !== null && (
          <GrantedButton
            label="posting-maps.new"
            recordType={POSTING_MAP_TYPE}
            action="edit"
            variant="primary"
            onClick={() => {
              setOpen('new');
            }}
          />
        )}
      </Toolbar>
      {bookId === null ? (
        <EmptyState title="posting-maps.choose-book.title" body="posting-maps.choose-book.body" />
      ) : (
        <BookMaps bookId={bookId} on={on} open={open} setOpen={setOpen} timeZone={timeZone} />
      )}
    </div>
  );
}

function BookMaps({
  bookId,
  on,
  open,
  setOpen,
  timeZone,
}: {
  bookId: string;
  on: string;
  open: string | null;
  setOpen: (open: string | null) => void;
  timeZone: string;
}) {
  const query = useQuery(readQuery(api, 'listPostingMaps', { params: { bookId }, query: { on } }));
  return (
    <ListRead query={query} what="posting-maps.what">
      {(list) => {
        const shown = list.records.find((map) => map.id === open);
        return (
          <div className="flex flex-col gap-3">
            <div className="flex justify-end">
              <AsOf asOf={list.asOf} timeZone={timeZone} />
            </div>
            {list.records.length === 0 ? (
              <EmptyState title="posting-maps.empty.title" body="posting-maps.empty.body" />
            ) : (
              <div className="overflow-x-auto rounded-card border border-border bg-surface">
                <table className="w-full border-collapse text-body" aria-label={t('screen.setup.posting-maps')}>
                  <thead>
                    <tr>
                      <Th label="posting-maps.event-kind" />
                      <Th label="posting-maps.in-force" />
                      <Th label="setup.latest-version" />
                    </tr>
                  </thead>
                  <tbody>
                    {list.records.map((map) => {
                      const inForce = map.versions.find((version) => version.id === map.inForceOn);
                      const latest = map.versions[0];
                      return (
                        <tr key={map.id} className="h-10 border-t border-border hover:bg-hover">
                          <td className="px-3">
                            <button
                              type="button"
                              className="font-mono text-accent underline"
                              onClick={() => {
                                setOpen(map.id);
                              }}
                            >
                              {map.eventKind}
                            </button>
                          </td>
                          <td className="px-3">
                            {inForce === undefined
                              ? t('posting-maps.none')
                              : t('dates.from', { from: formatDate(inForce.validFrom) })}
                          </td>
                          <td className="px-3">
                            {latest !== undefined && <StatusBadge state={stateIdOf(latest.state)} />}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            {shown !== undefined && (
              <MapDrawer
                map={shown}
                on={on}
                onClose={() => {
                  setOpen(null);
                }}
              />
            )}
            {open === 'new' && (
              <RecordDrawer
                title={t('posting-maps.new')}
                onClose={() => {
                  setOpen(null);
                }}
                details={
                  list.eventKinds.length === 0 ? (
                    <EmptyState title="posting-maps.no-kinds.title" body="posting-maps.no-kinds.body" />
                  ) : (
                    <NewVersionForm bookId={bookId} eventKinds={list.eventKinds} maps={list.records} />
                  )
                }
              />
            )}
          </div>
        );
      }}
    </ListRead>
  );
}
