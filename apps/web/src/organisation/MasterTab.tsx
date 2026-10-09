import { routes, type RecordState } from '@apparel-os/schemas';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useEffect, useState, type ReactNode } from 'react';
import { Controller, type FieldValues, type UseFormReturn } from 'react-hook-form';
import type { z } from 'zod';
import { api } from '../api';
import { useSubmission } from '../api/command';
import { ApiFailure } from '../api/query';
import { ApprovalPanel } from '../approvals/ApprovalPanel';
import { Banner } from '../components/Banner';
import { Button } from '../components/Button';
import { EmptyState } from '../components/StandardStates';
import { StatusBadge } from '../components/StatusBadge';
import { describedBy, FormField } from '../forms/FormField';
import { useRouteForm } from '../forms/use-route-form';
import { AsOf } from '../history/AsOf';
import { t } from '../messages/catalogue';
import { useBusinessToday } from '../setup/business-date';
import { formatDate } from '../setup/format';
import { Card, GrantedButton, HistoryTab, inputClass, ListRead, SubmissionBanner, Th, Toolbar } from '../setup/parts';
import { FormActions, RecordDrawer } from '../setup/RecordDrawer';
import { stateIdOf } from '../setup/states';
import { useTimeZone } from '../shell/session';
import type { DeclaredFields } from '../lock/kept-input';
import {
  fields,
  kindRoutes,
  kindText,
  labelField,
  ORGANISATION_READS,
  PLACE_KINDS,
  recordTypeOf,
  type FieldSpec,
  type Kind,
  type OnePer,
  type RecordFilter,
} from './kinds';
import { MappingVerification } from './MappingVerification';

// One master's tab on Setup › Organisation structure or Geography and groupings (structure-and-masters 2.2, 2.3, 8;
// design-language 10.9, 10.15; S1-F02-T01): the list, each record's version history and the version in force on a
// chosen date, a new record or a new version prepared for a different authorised person to approve, a draft whose
// start has passed re-dated (GC2-7), and the approval of each version opened from its history. The list is read a page
// at a time (code-house-rules 12.1). A refusal names what is missing (PRD-UXP-003).

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

/** A page of a master's records and where the next page starts (code-house-rules 12.1). */
export interface MasterPage {
  readonly asOf: string;
  readonly records: readonly MasterRecord[];
  readonly next: string | null;
}

/** One page of a kind's records, after the cursor the server gave, or the refusal thrown as ApiFailure. */
async function readPage(kind: Kind, after: string | undefined): Promise<MasterPage> {
  const result = await api.call(kindRoutes[kind].list, { query: after === undefined ? {} : { after } });
  if (result.ok) return result.data;
  throw new ApiFailure(result.status, result.error);
}

/** A master's records, read a page at a time where the reader may view them; Load more reads the next. */
export function useMasterPages(kind: Kind, enabled = true) {
  return useInfiniteQuery({
    queryKey: [kindRoutes[kind].list, 'pages'],
    queryFn: ({ pageParam }) => readPage(kind, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last: MasterPage) => last.next ?? undefined,
    enabled,
  });
}

/**
 * Every record of a kind, for a reference field's choices and names: read page by page until the last, each page
 * within the cap (code-house-rules 12.1).
 */
function useAllRecords(kind: Kind, enabled = true): readonly MasterRecord[] {
  const query = useInfiniteQuery({
    queryKey: [kindRoutes[kind].list, 'all'],
    queryFn: ({ pageParam }) => readPage(kind, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last: MasterPage) => last.next ?? undefined,
    enabled,
  });
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = query;
  useEffect(() => {
    if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);
  return query.data?.pages.flatMap((page) => page.records) ?? [];
}

const APPROVED: readonly RecordState[] = ['Scheduled', 'In force', 'Ended'];

/** The approved version in force on a date, if any (structure-and-masters 2.2). */
export function versionOn(record: MasterRecord, date: string): MasterVersion | undefined {
  return record.versions.find(
    (each) =>
      APPROVED.includes(each.state) && each.validFrom <= date && (each.validTo === undefined || date < each.validTo),
  );
}

/**
 * Each record of a kind by its code and the name of its latest version, for a reference field; only those `where`
 * names, where it names some, such as the classification values of a Site kind (S1-F02-T04).
 */
export function useNames(kind: Kind, enabled = true, where?: RecordFilter): ReadonlyMap<string, string> {
  return new Map(
    useAllRecords(kind, enabled)
      .filter((record) => where === undefined || record[where.field] === where.equals)
      .map((record) => {
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
    case 'yes-no':
      return <>{t(value === true ? 'organisation.yes' : 'organisation.no')}</>;
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

/**
 * The chosen targets with `valueId` as the one of its kind, replacing any other of that kind, or with none of that kind
 * when `valueId` is undefined: one classification value of each kind (structure-and-masters 3.1; product owner,
 * 9 Oct 2026).
 */
export function withKindValue(
  chosen: readonly string[],
  kindOf: ReadonlyMap<string, string>,
  kindId: string,
  valueId: string | undefined,
): string[] {
  const others = chosen.filter((each) => kindOf.get(each) !== kindId);
  return valueId === undefined ? others : [...others, valueId];
}

/** One list for each record of the `onePer` kind, offering its targets, of which at most one is chosen (3.1). */
function OnePerInput({
  id,
  target,
  where,
  onePer,
  value,
  onChange,
}: {
  id: string;
  target: Kind;
  where?: RecordFilter | undefined;
  onePer: OnePer;
  value: readonly string[];
  onChange: (ids: string[]) => void;
}) {
  const kinds = useNames(onePer.kind, true, where);
  const targets = useAllRecords(target).filter((record) => where === undefined || record[where.field] === where.equals);
  const names = useNames(target, true, where);
  const kindOf = new Map(targets.map((record) => [record.id, text(record[onePer.field])]));
  return (
    <div id={id} role="group" className="flex flex-col gap-2">
      {[...kinds].map(([kindId, kindName]) => {
        const chosen = value.find((each) => kindOf.get(each) === kindId) ?? '';
        return (
          <label key={kindId} className="flex flex-col gap-1">
            <span className="text-body-sm">{kindName}</span>
            <select
              className={inputClass}
              value={chosen}
              onChange={(event) => {
                const picked = event.target.value;
                onChange(withKindValue(value, kindOf, kindId, picked === '' ? undefined : picked));
              }}
            >
              <option value="">{t('organisation.none')}</option>
              {targets
                .filter((record) => kindOf.get(record.id) === kindId)
                .map((record) => (
                  <option key={record.id} value={record.id}>
                    {names.get(record.id) ?? record.code}
                  </option>
                ))}
            </select>
          </label>
        );
      })}
    </div>
  );
}

function ReferencesInput({
  id,
  target,
  where,
  value,
  onChange,
}: {
  id: string;
  target: Kind;
  where?: RecordFilter | undefined;
  value: readonly string[];
  onChange: (ids: string[]) => void;
}) {
  const names = useNames(target, true, where);
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
    !((spec.kind === 'date' || spec.kind === 'reference') && spec.optional === true) &&
    spec.kind !== 'lines' &&
    spec.kind !== 'references' &&
    spec.kind !== 'yes-no';
  let control: ReactNode;
  switch (spec.kind) {
    case 'yes-no':
      control = (
        <input
          id={id}
          type="checkbox"
          className="h-5 w-5"
          {...describedBy(id, { invalid, help: false })}
          {...form.register(spec.name)}
        />
      );
      break;
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
          {...form.register(spec.name, {
            setValueAs: (value: unknown) => (spec.optional === true && value === '' ? undefined : value),
          })}
        >
          <option value="">{t(spec.optional === true ? 'organisation.none' : 'organisation.choose')}</option>
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
          render={({ field }) =>
            spec.onePer === undefined ? (
              <ReferencesInput
                id={id}
                target={spec.target}
                where={spec.where}
                value={(field.value as string[] | undefined) ?? []}
                onChange={field.onChange}
              />
            ) : (
              <OnePerInput
                id={id}
                target={spec.target}
                where={spec.where}
                onePer={spec.onePer}
                value={(field.value as string[] | undefined) ?? []}
                onChange={field.onChange}
              />
            )
          }
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

/**
 * The opening values of a form: a new record's empty lists; for a new version, the fields of the version it starts
 * from, the latest unless another is named, as when a draft is re-dated (GC2-7).
 */
function openingValues(kind: Kind, today: string, record?: MasterRecord, from?: MasterVersion): FieldValues {
  const values: FieldValues = { validFrom: today };
  const base = from ?? record?.versions[0];
  for (const spec of formSpecs(kind, record)) {
    if (spec.kind === 'lines' || spec.kind === 'references') values[spec.name] = [];
    if (spec.kind === 'yes-no') values[spec.name] = false;
    if (base?.[spec.name] !== undefined) values[spec.name] = base[spec.name];
  }
  return values;
}

/** Whether a record has an approved version: Scheduled, In force or Ended. */
const hasApproved = (record: MasterRecord) => record.versions.some((version) => APPROVED.includes(version.state));

/**
 * The fields of a form: a new record's, without a later version's own fields; a new version's, without the fixed ones
 * and without those given with the first version, unless the record has no approved version yet, as when a new unit's
 * draft is re-dated with its first mapping (structure-and-masters 3.4; GC2-7).
 */
function formSpecs(kind: Kind, record?: MasterRecord): FieldSpec[] {
  return fields[kind].filter((spec) =>
    record === undefined
      ? spec.laterOnly !== true
      : spec.fixed !== true && (spec.withFirst !== true || !hasApproved(record)),
  );
}

/** A form's route: its body checked by the route's own schema, its values as the screen holds them (12.2). */
type FormRoute = DeclaredFields & { readonly body: z.ZodType<unknown, FieldValues> };

/**
 * The approved Scheduled version a change starting on `start` would stop short of: it ends where that one starts, and
 * that one keeps its own values (structure-and-masters 2.2; product owner, 8 Oct 2026).
 */
export function laterScheduled(record: MasterRecord, start: string): MasterVersion | undefined {
  return record.versions
    .filter((version) => version.state === 'Scheduled' && version.validFrom > start)
    .reduce<MasterVersion | undefined>(
      (earliest, version) => (earliest === undefined || version.validFrom < earliest.validFrom ? version : earliest),
      undefined,
    );
}

/**
 * A new record with its first version, or a new version of a record from its latest version or from a draft being
 * re-dated (structure-and-masters 2.2, 2.3; GC2-7).
 */
function MasterForm({ kind, record, from }: { kind: Kind; record?: MasterRecord; from?: MasterVersion }) {
  // A kind with no record of its own to add is only ever given a record (kindText).
  const command =
    (record === undefined ? kindRoutes[kind].prepare : kindRoutes[kind].version) ?? kindRoutes[kind].version;
  const route: FormRoute = routes[command];
  const submission = useSubmission(command, ORGANISATION_READS);
  const today = useBusinessToday();
  const formId = `${kind}-${record === undefined ? 'new' : 'version'}-form`;
  const form = useRouteForm(route, openingValues(kind, today, record, from), [{ path: 'validFrom', earliest: today }]);
  const specs = formSpecs(kind, record);
  const error = form.formState.errors.validFrom as { type?: string } | undefined;
  const start: unknown = form.watch('validFrom');
  const later = record === undefined || typeof start !== 'string' ? undefined : laterScheduled(record, start);
  return (
    <form
      id={formId}
      noValidate
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        void form.handleSubmit(async (values) => {
          // The route's own schema checked the values (routeResolver); the kind, chosen at run time, names the route.
          const input = record === undefined ? { body: values } : { params: { recordId: record.id }, body: values };
          await submission.submit(input as Parameters<typeof submission.submit>[0]);
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
      {later !== undefined && (
        <Banner tone="warning" role="status" message="organisation.later-version-kept">
          <span>{t('organisation.later-version-kept-body', { date: formatDate(later.validFrom) })}</span>
        </Banner>
      )}
      <FormActions form={formId} pending={submission.state.kind === 'pending'} />
    </form>
  );
}

/** A record's title: its latest version's name, or its code where the version names another record. */
function recordTitle(kind: Kind, record: MasterRecord): string {
  const spec = fields[kind].find((each) => each.name === labelField(kind));
  const name = record.versions[0]?.[labelField(kind)];
  return typeof name === 'string' && spec?.kind !== 'reference' ? name : record.code;
}

/** A record's name in its list: the latest version's name, or the record it names, in words. */
function RecordName({ kind, record }: { kind: Kind; record: MasterRecord }) {
  const spec = fields[kind].find((each) => each.name === labelField(kind));
  if (spec?.kind === 'reference') return <FieldValue spec={spec} value={record.versions[0]?.[spec.name]} />;
  return <>{recordTitle(kind, record)}</>;
}

/** A record's drawer: its fixed fields, the version in force on a chosen date, its version history and a change. */
function MasterDrawer({ kind, record, onClose }: { kind: Kind; record: MasterRecord; onClose: () => void }) {
  const today = useBusinessToday();
  const [date, setDate] = useState(today);
  /** The change being prepared: a new version from the latest, or a re-dated draft (GC2-7). */
  const [changing, setChanging] = useState<{ readonly from?: MasterVersion } | null>(null);
  const [panel, setPanel] = useState<string | null>(null);
  const fixed = fields[kind].filter((spec) => spec.fixed === true);
  const versionFields = fields[kind].filter((spec) => spec.fixed !== true && spec.withFirst !== true);
  const status = PLACE_KINDS.includes(kind) ? [statusSpec] : [];
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
            {record.versions.length === 0 && (
              <p className="m-0 text-body-sm text-text-2">{t('organisation.no-version-yet-body')}</p>
            )}
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
                  <Facts
                    specs={[
                      ...versionFields,
                      // The mapping a unit's version was prepared with, decided with it (3.4).
                      ...fields[kind].filter((spec) => spec.withFirst === true && version[spec.name] !== undefined),
                      ...status,
                    ]}
                    values={version}
                  />
                  {kind === 'business_unit_mapping' && <MappingVerification unitId={record.id} version={version} />}
                  {version.request?.state === 'Awaiting approval' && (
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="small"
                        variant="ghost"
                        label="setup.open-approval"
                        onClick={() => {
                          setPanel(version.request?.id ?? null);
                        }}
                      />
                      {version.validFrom < today && (
                        <GrantedButton
                          label="organisation.redate"
                          recordType={recordTypeOf(kind)}
                          action="edit"
                          onClick={() => {
                            setChanging({ from: version });
                          }}
                        />
                      )}
                    </div>
                  )}
                  {version.request?.state === 'Awaiting approval' && version.validFrom < today && (
                    <p className="m-0 text-body-sm text-text-2">{t('organisation.redate-help')}</p>
                  )}
                </li>
              ))}
            </ol>
          </Card>
          {panel !== null && <ApprovalPanel requestId={panel} />}
          <Card title="organisation.change">
            {changing !== null ? (
              <MasterForm
                key={changing.from?.id ?? 'latest'}
                kind={kind}
                record={record}
                {...(changing.from === undefined ? {} : { from: changing.from })}
              />
            ) : (
              <GrantedButton
                label="organisation.change"
                recordType={recordTypeOf(kind)}
                action="edit"
                onClick={() => {
                  setChanging({});
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
  const query = useMasterPages(kind);
  const [open, setOpen] = useState<string | null>(null);
  const place = PLACE_KINDS.includes(kind);
  const add = kindText[kind].add;
  return (
    <div className="flex flex-col gap-4">
      <Toolbar>
        {add !== null && (
          <GrantedButton
            label={add}
            recordType={recordTypeOf(kind)}
            action="create"
            variant="primary"
            onClick={() => {
              setOpen('new');
            }}
          />
        )}
        <span className="flex-1" />
        <Button
          label="setup.refresh"
          onClick={() => {
            void query.refetch();
          }}
        />
      </Toolbar>
      <ListRead query={query} what={kindText[kind].what}>
        {({ pages }) => {
          const records = pages.flatMap((page) => page.records);
          const asOf = pages.at(-1)?.asOf;
          const shown = records.find((record) => record.id === open);
          return (
            <div className="flex flex-col gap-3">
              <div className="flex justify-end">{asOf !== undefined && <AsOf asOf={asOf} timeZone={timeZone} />}</div>
              {records.length === 0 ? (
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
                      {records.map((record) => {
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
                            <td className="px-3">
                              <RecordName kind={kind} record={record} />
                            </td>
                            {place && (
                              <td className="px-3">
                                {typeof status === 'string' && <StatusBadge state={stateIdOf(status)} />}
                              </td>
                            )}
                            <td className="px-3">
                              {latest === undefined ? (
                                // A record with no version, such as a grouping kind migration 0044 recorded for
                                // earlier groupings: Change gives it its first version (3.6; RR-440).
                                <span className="text-body-sm text-text-2">{t('organisation.no-version-yet')}</span>
                              ) : (
                                <StatusBadge state={stateIdOf(latest.state)} />
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              {query.hasNextPage && (
                <div>
                  <Button
                    label="organisation.load-more"
                    disabled={query.isFetchingNextPage}
                    onClick={() => {
                      void query.fetchNextPage();
                    }}
                  />
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
      {open === 'new' && add !== null && (
        <RecordDrawer
          title={t(add)}
          onClose={() => {
            setOpen(null);
          }}
          details={<MasterForm kind={kind} />}
        />
      )}
    </div>
  );
}
