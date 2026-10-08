import { routes, type RecordState } from '@apparel-os/schemas';
import { useQuery } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { Controller, type UseFormReturn } from 'react-hook-form';
import { api } from '../api';
import { useSubmission, type CommandName } from '../api/command';
import { readQuery } from '../api/query';
import { ApprovalPanel } from '../approvals/ApprovalPanel';
import { Button } from '../components/Button';
import { EmptyState } from '../components/StandardStates';
import { StatusBadge } from '../components/StatusBadge';
import { describedBy, FormField } from '../forms/FormField';
import { useRouteForm } from '../forms/use-route-form';
import { AsOf } from '../history/AsOf';
import { t, type MessageId } from '../messages/catalogue';
import { useBusinessToday } from '../setup/business-date';
import { formatDate } from '../setup/format';
import { Card, GrantedButton, HistoryTab, inputClass, ListRead, SubmissionBanner, Th, Toolbar } from '../setup/parts';
import { FormActions, RecordDrawer } from '../setup/RecordDrawer';
import { stateIdOf } from '../setup/states';
import { useTimeZone } from '../shell/session';
import {
  fields,
  labelField,
  ORGANISATION_READS,
  listRead,
  prepareCommand,
  recordTypeOf,
  versionCommand,
  type FieldSpec,
  type Kind,
} from './kinds';

// One master's tab on Setup › Organisation structure or Geography and groupings (structure-and-masters 2.2, 2.3, 8;
// design-language 10.9, 10.15; S1-F02-T01): the list, each record's version history and the version in force on a
// chosen date, a new record or a new version prepared for a different authorised person to approve, and the approval
// of each version opened from its history. A refusal names what is missing (PRD-UXP-003).

export interface MasterVersion {
  readonly id: string;
  readonly validFrom: string;
  readonly validTo?: string | undefined;
  readonly state: RecordState;
  readonly request?: { readonly id: string; readonly state: string } | undefined;
  readonly [field: string]: unknown;
}

export interface MasterRecord {
  readonly id: string;
  readonly code: string;
  readonly versions: readonly MasterVersion[];
  readonly [field: string]: unknown;
}

interface MasterList {
  readonly asOf: string;
  readonly records: readonly MasterRecord[];
}

const APPROVED: readonly RecordState[] = ['Scheduled', 'In force', 'Ended'];

/** The approved version in force on a date, if any (structure-and-masters 2.2). */
export function versionOn(record: MasterRecord, date: string): MasterVersion | undefined {
  return record.versions.find(
    (each) =>
      APPROVED.includes(each.state) && each.validFrom <= date && (each.validTo === undefined || date < each.validTo),
  );
}

/** A master's records, read where the reader may view them. */
export function useMasterList(kind: Kind, enabled = true) {
  const query = useQuery({ ...readQuery(api, listRead[kind], {}), enabled });
  return query as typeof query & { data: MasterList | undefined };
}

/** Each record of a kind by its code and the name of its latest version, for a reference field. */
export function useNames(kind: Kind, enabled = true): ReadonlyMap<string, string> {
  const query = useMasterList(kind, enabled);
  return new Map(
    (query.data?.records ?? []).map((record) => {
      const name = record.versions[0]?.[labelField(kind)];
      return [record.id, typeof name === 'string' ? `${record.code} · ${name}` : record.code] as const;
    }),
  );
}

/** A value as text: values here are strings, read from the lists. */
const text = (value: unknown): string => (typeof value === 'string' ? value : '');

/** A field's value in words. */
function FieldValue({ spec, value }: { spec: FieldSpec; value: unknown }) {
  const names = useNames(
    spec.kind === 'reference' || spec.kind === 'references' ? spec.target : 'country',
    ['reference', 'references'].includes(spec.kind),
  );
  if (value === undefined || value === null) return <span className="text-text-2">{t('organisation.unknown')}</span>;
  switch (spec.kind) {
    case 'select': {
      const option = spec.options.find((each) => each.value === value);
      return <>{option === undefined ? text(value) : t(option.label)}</>;
    }
    case 'date':
      return <>{formatDate(text(value))}</>;
    case 'reference':
      return <>{names.get(text(value)) ?? text(value)}</>;
    case 'lines':
    case 'references': {
      const list = Array.isArray(value) ? (value as unknown[]).map(text) : [];
      if (list.length === 0) return <span className="text-text-2">{t('organisation.none')}</span>;
      return (
        <ul className="m-0 list-none p-0">
          {list.map((each) => (
            <li key={each}>{spec.kind === 'references' ? (names.get(each) ?? each) : each}</li>
          ))}
        </ul>
      );
    }
    default:
      return <span className={spec.mono === true ? 'font-mono' : undefined}>{text(value)}</span>;
  }
}

/** The fields of a record or version as a definition list. */
export function Facts({ specs, values }: { specs: readonly FieldSpec[]; values: Readonly<Record<string, unknown>> }) {
  return (
    <dl className="grid gap-3 sm:grid-cols-2">
      {specs.map((spec) => (
        <div key={spec.name} className="flex flex-col gap-1">
          <dt className="text-label font-semibold text-text-2">{t(spec.label)}</dt>
          <dd className="m-0">
            <FieldValue spec={spec} value={values[spec.name]} />
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** Lines of text, one per line, kept as a list (addresses, aliases). */
function LinesInput({
  id,
  value,
  onChange,
  invalid,
}: {
  id: string;
  value: readonly string[];
  onChange: (lines: string[]) => void;
  invalid: boolean;
}) {
  const [text, setText] = useState(value.join('\n'));
  return (
    <textarea
      id={id}
      rows={3}
      className="rounded-control border border-control bg-surface p-2"
      {...describedBy(id, { invalid, help: true })}
      value={text}
      onChange={(event) => {
        setText(event.target.value);
        onChange(
          event.target.value
            .split('\n')
            .map((line) => line.trim())
            .filter((line) => line !== ''),
        );
      }}
    />
  );
}

function ReferenceOptions({ target }: { target: Kind }) {
  const names = useNames(target);
  return (
    <>
      {[...names].map(([id, name]) => (
        <option key={id} value={id}>
          {name}
        </option>
      ))}
    </>
  );
}

function ReferencesInput({
  id,
  target,
  value,
  onChange,
}: {
  id: string;
  target: Kind;
  value: readonly string[];
  onChange: (ids: string[]) => void;
}) {
  const names = useNames(target);
  return (
    <div id={id} role="group" className="flex flex-col gap-1">
      {[...names].map(([recordId, name]) => (
        <label key={recordId} className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={value.includes(recordId)}
            onChange={(event) => {
              onChange(event.target.checked ? [...value, recordId] : value.filter((each) => each !== recordId));
            }}
          />
          {name}
        </label>
      ))}
    </div>
  );
}

/** One field of a form (design-language 10.7). */
function FormInput({ form, spec, formId }: { form: UseFormReturn; spec: FieldSpec; formId: string }) {
  const id = `${formId}-${spec.name}`;
  const error = form.formState.errors[spec.name] as { type?: string } | undefined;
  const invalid = error !== undefined;
  const required =
    !(spec.kind === 'date' && spec.optional === true) && spec.kind !== 'lines' && spec.kind !== 'references';
  let control: ReactNode;
  switch (spec.kind) {
    case 'select':
      control = (
        <select
          id={id}
          className={inputClass}
          {...describedBy(id, { invalid, help: false })}
          {...form.register(spec.name)}
        >
          <option value="">{t('organisation.choose')}</option>
          {spec.options.map((option) => (
            <option key={option.value} value={option.value}>
              {t(option.label)}
            </option>
          ))}
        </select>
      );
      break;
    case 'reference':
      control = (
        <select
          id={id}
          className={inputClass}
          {...describedBy(id, { invalid, help: false })}
          {...form.register(spec.name)}
        >
          <option value="">{t('organisation.choose')}</option>
          <ReferenceOptions target={spec.target} />
        </select>
      );
      break;
    case 'date':
      control = (
        <input
          id={id}
          type="date"
          className={inputClass}
          {...describedBy(id, { invalid, help: false })}
          {...form.register(spec.name, {
            setValueAs: (value: unknown) => (spec.optional === true && value === '' ? undefined : value),
          })}
        />
      );
      break;
    case 'lines':
      control = (
        <Controller
          control={form.control}
          name={spec.name}
          render={({ field }) => (
            <LinesInput
              id={id}
              value={(field.value as string[] | undefined) ?? []}
              onChange={field.onChange}
              invalid={invalid}
            />
          )}
        />
      );
      break;
    case 'references':
      control = (
        <Controller
          control={form.control}
          name={spec.name}
          render={({ field }) => (
            <ReferencesInput
              id={id}
              target={spec.target}
              value={(field.value as string[] | undefined) ?? []}
              onChange={field.onChange}
            />
          )}
        />
      );
      break;
    default:
      control = (
        <input
          id={id}
          className={`${inputClass}${spec.mono === true ? ' font-mono' : ''}`}
          {...describedBy(id, { invalid, help: false })}
          {...form.register(spec.name)}
        />
      );
  }
  return (
    <FormField
      id={id}
      label={spec.label}
      required={required}
      error={error}
      {...(spec.kind === 'lines' ? { help: 'organisation.lines-help' as const } : {})}
    >
      {control}
    </FormField>
  );
}

/** The opening values of a form: a new record's empty lists, or the latest version's fields for a new version. */
function openingValues(kind: Kind, today: string, record?: MasterRecord): Record<string, unknown> {
  const values: Record<string, unknown> = { validFrom: today };
  for (const spec of fields[kind]) {
    if (record !== undefined && spec.fixed === true) continue;
    if (spec.kind === 'lines' || spec.kind === 'references') values[spec.name] = [];
    const latest = record?.versions[0];
    if (latest?.[spec.name] !== undefined) values[spec.name] = latest[spec.name];
  }
  return values;
}

/** A new record with its first version, or a new version of a record (structure-and-masters 2.2, 2.3). */
function MasterForm({ kind, record }: { kind: Kind; record?: MasterRecord }) {
  const today = useBusinessToday();
  const command: CommandName = record === undefined ? prepareCommand[kind] : versionCommand[kind];
  const formId = `${kind}-${record === undefined ? 'new' : 'version'}-form`;
  const form = useRouteForm(routes[command] as never, openingValues(kind, today, record) as never, [
    { path: 'validFrom', earliest: today },
  ]);
  const submission = useSubmission(command, ORGANISATION_READS);
  const specs = fields[kind].filter((spec) => record === undefined || spec.fixed !== true);
  const error = form.formState.errors.validFrom as { type?: string } | undefined;
  return (
    <form
      id={formId}
      noValidate
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        void form.handleSubmit(async (values) => {
          const input = record === undefined ? { body: values } : { params: { recordId: record.id }, body: values };
          await submission.submit(input as never);
        })(event);
      }}
    >
      <SubmissionBanner state={submission.state} />
      {specs.map((spec) => (
        <FormInput key={spec.name} form={form} spec={spec} formId={formId} />
      ))}
      <FormField
        id={`${formId}-validFrom`}
        label="setup.valid-from"
        required
        error={error}
        help="setup.valid-from-help"
      >
        <input
          id={`${formId}-validFrom`}
          type="date"
          min={today}
          className={inputClass}
          {...describedBy(`${formId}-validFrom`, { invalid: error !== undefined, help: true })}
          {...form.register('validFrom')}
        />
      </FormField>
      <FormActions form={formId} pending={submission.state.kind === 'pending'} />
    </form>
  );
}

function recordTitle(kind: Kind, record: MasterRecord): string {
  const name = record.versions[0]?.[labelField(kind)];
  return typeof name === 'string' ? name : record.code;
}

/** A record's drawer: its fixed fields, the version in force on a chosen date, its version history and a change. */
function MasterDrawer({ kind, record, onClose }: { kind: Kind; record: MasterRecord; onClose: () => void }) {
  const today = useBusinessToday();
  const [date, setDate] = useState(today);
  const [changing, setChanging] = useState(false);
  const [panel, setPanel] = useState<string | null>(null);
  const fixed = fields[kind].filter((spec) => spec.fixed === true);
  const versionFields = fields[kind].filter((spec) => spec.fixed !== true);
  const status = kind === 'site' || kind === 'store' ? [statusSpec] : [];
  const inForce = versionOn(record, date);
  return (
    <RecordDrawer
      reference={record.code}
      title={recordTitle(kind, record)}
      {...(record.versions[0] === undefined ? {} : { state: record.versions[0].state })}
      onClose={onClose}
      history={<HistoryTab recordType={recordTypeOf(kind)} recordId={record.id} />}
      details={
        <>
          <Card>
            <Facts specs={fixed} values={record} />
          </Card>
          <Card title="organisation.in-force-on">
            <input
              aria-label={t('organisation.in-force-on')}
              type="date"
              className={inputClass}
              value={date}
              onChange={(event) => {
                setDate(event.target.value);
              }}
            />
            {inForce === undefined ? (
              <p className="m-0 text-body-sm text-text-2">{t('organisation.none-in-force')}</p>
            ) : (
              <Facts specs={[...versionFields, ...status]} values={inForce} />
            )}
          </Card>
          <Card title="setup.versions">
            <ol className="m-0 flex list-none flex-col gap-3 p-0" aria-label={t('setup.versions')}>
              {record.versions.map((version) => (
                <li key={version.id} className="flex flex-col gap-2 border-b border-border pb-3 last:border-b-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge state={stateIdOf(version.state)} />
                    <span className="text-body-sm text-text-2">
                      {version.validTo === undefined
                        ? t('dates.from', { from: formatDate(version.validFrom) })
                        : t('dates.between', { from: formatDate(version.validFrom), to: formatDate(version.validTo) })}
                    </span>
                  </div>
                  <Facts specs={[...versionFields, ...status]} values={version} />
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
          <Card title="organisation.change">
            {changing ? (
              <MasterForm kind={kind} record={record} />
            ) : (
              <GrantedButton
                label="organisation.change"
                recordType={recordTypeOf(kind)}
                action="edit"
                onClick={() => {
                  setChanging(true);
                }}
              />
            )}
          </Card>
        </>
      }
    />
  );
}

/** A Site's or Store's status, shown with its versions (structure-and-masters 3.7). */
const statusSpec: FieldSpec = {
  name: 'status',
  label: 'organisation.field.status',
  kind: 'select',
  options: [
    { value: 'Setting up', label: 'state.setting-up' },
    { value: 'Active', label: 'state.active' },
    { value: 'Closing', label: 'state.closing' },
    { value: 'Closed', label: 'state.closed' },
  ],
};

/** One master's tab: its list and drawers. */
export function MasterTab({ kind }: { kind: Kind }) {
  const timeZone = useTimeZone();
  const query = useMasterList(kind);
  const [open, setOpen] = useState<string | null>(null);
  const place = kind === 'site' || kind === 'store';
  return (
    <div className="flex flex-col gap-4">
      <Toolbar>
        <GrantedButton
          label={`organisation.new.${kind}` as MessageId}
          recordType={recordTypeOf(kind)}
          action="create"
          variant="primary"
          onClick={() => {
            setOpen('new');
          }}
        />
        <span className="flex-1" />
        <Button
          label="setup.refresh"
          onClick={() => {
            void query.refetch();
          }}
        />
      </Toolbar>
      <ListRead query={query} what={`organisation.what.${kind}` as MessageId}>
        {(list: MasterList) => {
          const shown = list.records.find((record) => record.id === open);
          return (
            <div className="flex flex-col gap-3">
              <div className="flex justify-end">
                <AsOf asOf={list.asOf} timeZone={timeZone} />
              </div>
              {list.records.length === 0 ? (
                <EmptyState title="organisation.empty.title" body="organisation.empty.body" />
              ) : (
                <div className="overflow-x-auto rounded-card border border-border bg-surface">
                  <table className="w-full border-collapse text-body">
                    <thead>
                      <tr>
                        <Th label="organisation.field.code" />
                        <Th
                          label={
                            fields[kind].find((spec) => spec.name === labelField(kind))?.label ??
                            'organisation.field.name'
                          }
                        />
                        {place && <Th label="organisation.field.status" />}
                        <Th label="setup.latest-version" />
                      </tr>
                    </thead>
                    <tbody>
                      {list.records.map((record) => {
                        const latest = record.versions[0];
                        const status = latest?.status;
                        return (
                          <tr key={record.id} className="h-10 border-t border-border hover:bg-hover">
                            <td className="px-3">
                              <button
                                type="button"
                                className="font-mono text-accent underline"
                                onClick={() => {
                                  setOpen(record.id);
                                }}
                              >
                                {record.code}
                              </button>
                            </td>
                            <td className="px-3">{recordTitle(kind, record)}</td>
                            {place && (
                              <td className="px-3">
                                {typeof status === 'string' && <StatusBadge state={stateIdOf(status)} />}
                              </td>
                            )}
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
                <MasterDrawer
                  kind={kind}
                  record={shown}
                  onClose={() => {
                    setOpen(null);
                  }}
                />
              )}
            </div>
          );
        }}
      </ListRead>
      {open === 'new' && (
        <RecordDrawer
          title={t(`organisation.new.${kind}`)}
          onClose={() => {
            setOpen(null);
          }}
          details={<MasterForm kind={kind} />}
        />
      )}
    </div>
  );
}
