import { zodResolver } from '@hookform/resolvers/zod';
import {
  businessDateSchema,
  routes,
  settingOriginSchema,
  type ApprovalLimitList,
  type ApprovalLimitRecord,
} from '@apparel-os/schemas';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { api } from '../api';
import { useSubmission } from '../api/command';
import { readQuery } from '../api/query';
import { ApprovalPanel } from '../approvals/ApprovalPanel';
import { actionTitle } from '../approvals/subject';
import { Button } from '../components/Button';
import { EmptyState } from '../components/StandardStates';
import { StatusBadge } from '../components/StatusBadge';
import { describedBy, FormField } from '../forms/FormField';
import { withStartDateChecks } from '../forms/start-date';
import { useKeptDraft } from '../forms/use-kept-draft';
import { AsOf } from '../history/AsOf';
import { KeptDraftBanner } from '../lock/KeptDraftBanner';
import { t } from '../messages/catalogue';
import { useTimeZone } from '../shell/session';
import { AssignmentScopeFields, scopeOfChoices } from './AssignmentsScreen';
import { useBusinessToday } from './business-date';
import { limitHolderText as holderText, limitText } from './describe';
import { formatDate, paiseOfRupees } from './format';
import {
  Card,
  GrantedButton,
  HistoryTab,
  inputClass,
  ListRead,
  SubmissionBanner,
  Th,
  Toolbar,
  useGranted,
} from './parts';
import { FormActions, RecordDrawer } from './RecordDrawer';
import { stateIdOf } from './states';

// Setup › Approval limits (access-and-approvals 9.2, 9.11, 14; POL-02.07, POL-02.09, POL-02.15, PRD-ACS-015,
// PRD-ACS-016; S1-F05-T01): every limit, each with the basis of its action's rule beside it, and a new limit: the
// action type, the holder, an approver role within a scope or a named person through one of their role assignments,
// the authority, a value, explicit unlimited authority or none, with authority over an unknown value apart, and the
// dates. A limit is approved by a different authorised person; a later one for the same action and holder replaces it
// from its start. The real limits and their holders are KDPS's (V-02); on dev every limit is SYNTHETIC. A missing
// limit grants nothing.

const LIST_READS = ['listApprovalLimits', 'listMyWork'] as const;

const limitFormSchema = z
  .object({
    actionType: z.string().min(1),
    holderKind: z.enum(['role', 'individual']),
    roleId: z.string(),
    roleAssignmentId: z.string(),
    legalEntity: z.enum(['all', 'selected', 'empty']),
    place: z.enum(['all', 'selected', 'empty']),
    brand: z.enum(['all', 'empty']),
    legalEntityIds: z.union([z.array(z.uuid()), z.uuid(), z.literal(false)]).optional(),
    places: z.union([z.array(z.string()), z.string(), z.literal(false)]).optional(),
    authority: z.enum(['amount', 'unlimited', 'none']),
    amount: z.string(),
    coversUnknown: z.boolean(),
    // Where the limit came from, stated each time, with no default (code-house-rules 11.1, 12.14).
    origin: settingOriginSchema,
    validFrom: businessDateSchema,
    validTo: z.union([z.literal(''), businessDateSchema]),
  })
  .refine((values) => values.holderKind !== 'role' || z.uuid().safeParse(values.roleId).success, {
    path: ['roleId'],
  })
  .refine((values) => values.holderKind !== 'individual' || z.uuid().safeParse(values.roleAssignmentId).success, {
    path: ['roleAssignmentId'],
  })
  .refine((values) => values.authority !== 'amount' || paiseOfRupees(values.amount) !== undefined, {
    path: ['amount'],
    message: 'limits.amount.invalid',
  })
  .refine((values) => values.authority !== 'none' || values.coversUnknown, {
    path: ['authority'],
    message: 'limits.authority.grants-nothing',
  })
  .refine((values) => values.validTo === '' || values.validTo > values.validFrom, { path: ['validTo'] });
type LimitForm = z.input<typeof limitFormSchema>;

/** A checkbox group's value as a list: none, one or several ticked. */
function listOf(value: readonly string[] | string | false | undefined): string[] {
  if (value === undefined || value === false) return [];
  return typeof value === 'string' ? [value] : [...value];
}

function datesText(limit: ApprovalLimitRecord): string {
  return limit.validTo === undefined
    ? t('dates.from', { from: formatDate(limit.validFrom) })
    : t('dates.between', { from: formatDate(limit.validFrom), to: formatDate(limit.validTo) });
}

/** A new approval limit (access-and-approvals 9.2; POL-02.09, POL-02.15). */
function NewLimitForm({ actionTypes }: { actionTypes: ApprovalLimitList['actionTypes'] }) {
  const today = useBusinessToday();
  const roles = useQuery({ ...readQuery(api, 'listRoles', {}), enabled: useGranted('access.role', 'view') });
  const assignments = useQuery({
    ...readQuery(api, 'listRoleAssignments', {}),
    enabled: useGranted('access.role_assignment', 'view'),
  });
  const structure = useQuery(readQuery(api, 'readMasterLists', { query: { date: today } }));
  const form = useForm<LimitForm>({
    resolver: withStartDateChecks(zodResolver(limitFormSchema), [{ path: 'validFrom', earliest: today }]),
    mode: 'onBlur',
    defaultValues: {
      actionType: '',
      holderKind: 'role',
      roleId: '',
      roleAssignmentId: '',
      legalEntity: 'all',
      place: 'all',
      brand: 'all',
      legalEntityIds: [],
      places: [],
      authority: 'amount',
      amount: '',
      coversUnknown: false,
      validFrom: today,
      validTo: '',
    },
  });
  const kept = useKeptDraft(routes.prepareApprovalLimit, form, 'setup.new-approval-limit');
  const submission = useSubmission('prepareApprovalLimit', LIST_READS);
  const errors = form.formState.errors;
  const holderKind = form.watch('holderKind');
  const authority = form.watch('authority');
  const chosenType = actionTypes.find((each) => each.actionType === form.watch('actionType'));
  const assignmentList = (assignments.data?.assignments ?? []).filter(
    (each) => each.actor.kind === 'user' && (each.state === 'In force' || each.state === 'Scheduled'),
  );
  return (
    <form
      id="limit-new-form"
      noValidate
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        void form.handleSubmit(async (values) => {
          const assignment = assignmentList.find((each) => each.id === values.roleAssignmentId);
          const userId = assignment?.actor.kind === 'user' ? assignment.actor.userId : '';
          const done = await submission.submit({
            body: {
              actionType: values.actionType,
              holder:
                values.holderKind === 'role'
                  ? {
                      kind: 'role',
                      roleId: values.roleId,
                      scope: scopeOfChoices(values, {
                        legalEntityIds: listOf(values.legalEntityIds),
                        places: listOf(values.places),
                      }),
                    }
                  : { kind: 'individual', userId, roleAssignmentId: values.roleAssignmentId },
              limit:
                values.authority === 'amount'
                  ? { kind: 'amount', amount: paiseOfRupees(values.amount) ?? 0 }
                  : { kind: values.authority },
              coversUnknown: values.coversUnknown,
              origin: values.origin,
              validFrom: values.validFrom,
              ...(values.validTo === '' ? {} : { validTo: values.validTo }),
            },
          });
          if (done !== undefined) kept.forget();
        })(event);
      }}
    >
      {kept.offered !== null && <KeptDraftBanner onRestore={kept.restore} onDiscard={kept.discard} />}
      <SubmissionBanner state={submission.state} />
      <FormField id="limit-action" label="limits.action-type" required error={errors.actionType}>
        <select
          id="limit-action"
          className={inputClass}
          {...describedBy('limit-action', { invalid: errors.actionType !== undefined, help: false })}
          {...form.register('actionType')}
        >
          <option value="">{t('setup.choose')}</option>
          {actionTypes.map((each) => (
            <option key={each.actionType} value={each.actionType}>
              {t('limits.action-option', {
                action: actionTitle(each.actionType),
                basis: t(`approval.basis.${each.basis}`),
              })}
            </option>
          ))}
        </select>
      </FormField>
      {chosenType !== undefined && (
        <p className="m-0 text-body-sm text-text-2">
          {t('limits.basis-note', { basis: t(`approval.basis.${chosenType.basis}`) })}
        </p>
      )}
      <fieldset className="flex flex-col gap-1">
        <legend className="text-body-sm font-semibold">{t('limits.holder')}</legend>
        <span className="flex flex-wrap gap-4">
          <label className="flex items-center gap-2">
            <input type="radio" value="role" {...form.register('holderKind')} />
            {t('limits.holder-kind.role')}
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" value="individual" {...form.register('holderKind')} />
            {t('limits.holder-kind.individual')}
          </label>
        </span>
      </fieldset>
      {holderKind === 'role' ? (
        <>
          <FormField id="limit-role" label="assignment.role" required error={errors.roleId}>
            <select
              id="limit-role"
              className={inputClass}
              {...describedBy('limit-role', { invalid: errors.roleId !== undefined, help: false })}
              {...form.register('roleId')}
            >
              <option value="">{t('setup.choose')}</option>
              {(roles.data?.roles ?? []).map((role) => (
                <option key={role.id} value={role.id}>
                  {t('setup.roles.option', { code: role.code, name: role.versions[0]?.name ?? '' })}
                </option>
              ))}
            </select>
          </FormField>
          <AssignmentScopeFields
            choices={{ legalEntity: form.watch('legalEntity'), place: form.watch('place'), brand: form.watch('brand') }}
            register={(name) => form.register(name)}
            structure={structure.data}
          />
        </>
      ) : (
        <FormField
          id="limit-assignment"
          label="limits.assignment"
          required
          error={errors.roleAssignmentId}
          help="limits.assignment.help"
        >
          <select
            id="limit-assignment"
            className={inputClass}
            {...describedBy('limit-assignment', { invalid: errors.roleAssignmentId !== undefined, help: true })}
            {...form.register('roleAssignmentId')}
          >
            <option value="">{t('setup.choose')}</option>
            {assignmentList.map((each) => (
              <option key={each.id} value={each.id}>
                {t('limits.assignment-option', {
                  person: each.actor.kind === 'user' ? (each.actor.name ?? each.actor.userId) : each.actor.code,
                  role: each.role.code,
                })}
              </option>
            ))}
          </select>
        </FormField>
      )}
      <fieldset className="flex flex-col gap-1">
        <legend className="text-body-sm font-semibold">{t('limits.authority')}</legend>
        <span className="flex flex-wrap gap-4">
          {(['amount', 'unlimited', 'none'] as const).map((kind) => (
            <label key={kind} className="flex items-center gap-2">
              <input type="radio" value={kind} {...form.register('authority')} />
              {t(`limits.authority.${kind}`)}
            </label>
          ))}
        </span>
        {errors.authority !== undefined && (
          <p role="alert" className="m-0 text-body-sm text-danger">
            {t('limits.authority.grants-nothing')}
          </p>
        )}
      </fieldset>
      {authority === 'amount' && (
        <FormField
          id="limit-amount"
          label="limits.amount"
          required
          error={errors.amount}
          message={errors.amount === undefined ? undefined : 'limits.amount.invalid'}
          help="limits.amount.help"
        >
          <input
            id="limit-amount"
            inputMode="decimal"
            className={inputClass}
            {...describedBy('limit-amount', { invalid: errors.amount !== undefined, help: true })}
            {...form.register('amount')}
          />
        </FormField>
      )}
      <label className="flex items-center gap-2">
        <input type="checkbox" {...form.register('coversUnknown')} />
        {t('limits.covers-unknown')}
      </label>
      <FormField id="limit-origin" label="rules.origin" required error={errors.origin}>
        <select
          id="limit-origin"
          className={inputClass}
          {...describedBy('limit-origin', { invalid: errors.origin !== undefined, help: false })}
          {...form.register('origin')}
        >
          <option value="">{t('setup.choose')}</option>
          <option value="kdps">{t('rules.origin.kdps')}</option>
          <option value="test-setup">{t('rules.origin.test-setup')}</option>
          <option value="synthetic">{t('rules.origin.synthetic')}</option>
        </select>
      </FormField>
      <FormField
        id="limit-from"
        label="setup.valid-from"
        required
        error={errors.validFrom}
        help="setup.valid-from-help"
      >
        <input
          id="limit-from"
          type="date"
          min={today}
          className={inputClass}
          {...describedBy('limit-from', { invalid: errors.validFrom !== undefined, help: true })}
          {...form.register('validFrom')}
        />
      </FormField>
      <FormField id="limit-to" label="setup.valid-to" error={errors.validTo} help="setup.valid-to-help">
        <input
          id="limit-to"
          type="date"
          min={today}
          className={inputClass}
          {...describedBy('limit-to', { invalid: errors.validTo !== undefined, help: true })}
          {...form.register('validTo')}
        />
      </FormField>
      <FormActions form="limit-new-form" pending={submission.state.kind === 'pending'} />
    </form>
  );
}

function LimitDrawer({ limit, onClose }: { limit: ApprovalLimitRecord; onClose: () => void }) {
  const [panel, setPanel] = useState<string | null>(null);
  return (
    <RecordDrawer
      reference={actionTitle(limit.actionType)}
      title={holderText(limit)}
      state={limit.state}
      onClose={onClose}
      history={<HistoryTab recordType="access.approval_limit" recordId={limit.id} />}
      details={
        <>
          <Card title="limits.details">
            <dl className="m-0 grid grid-cols-[max-content_1fr] gap-x-4 gap-y-2 text-body-sm">
              <dt className="text-text-2">{t('limits.action-type')}</dt>
              <dd className="m-0">{actionTitle(limit.actionType)}</dd>
              <dt className="text-text-2">{t('limits.limit')}</dt>
              <dd className="m-0">{limitText(limit)}</dd>
              <dt className="text-text-2">{t('limits.unknown-value')}</dt>
              <dd className="m-0">
                {t(limit.coversUnknown ? 'limits.unknown.covered' : 'limits.unknown.not-covered')}
              </dd>
              <dt className="text-text-2">{t('limits.holder')}</dt>
              <dd className="m-0">{holderText(limit)}</dd>
              <dt className="text-text-2">{t('dates.label')}</dt>
              <dd className="m-0">{datesText(limit)}</dd>
              <dt className="text-text-2">{t('rules.origin')}</dt>
              <dd className="m-0">{t(`rules.origin.${limit.origin}`)}</dd>
            </dl>
            {limit.request?.state === 'Awaiting approval' && (
              <div>
                <Button
                  size="small"
                  variant="ghost"
                  label="setup.open-approval"
                  onClick={() => {
                    setPanel(limit.request?.id ?? null);
                  }}
                />
              </div>
            )}
          </Card>
          {panel !== null && <ApprovalPanel requestId={panel} />}
        </>
      }
    />
  );
}

/** Setup › Approval limits. */
export function ApprovalLimitsScreen() {
  const timeZone = useTimeZone();
  const query = useQuery(readQuery(api, 'listApprovalLimits', {}));
  const [open, setOpen] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-4">
      <Toolbar>
        <GrantedButton
          label="limits.new"
          recordType="access.approval_limit"
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
      <ListRead query={query} what="limits.what">
        {(list) => {
          const shown = list.limits.find((limit) => limit.id === open);
          return (
            <div className="flex flex-col gap-3">
              <div className="flex justify-end">
                <AsOf asOf={list.asOf} timeZone={timeZone} />
              </div>
              {list.limits.length === 0 ? (
                <EmptyState title="limits.empty.title" body="limits.empty.body" />
              ) : (
                <div className="overflow-x-auto rounded-card border border-border bg-surface">
                  <table className="w-full border-collapse text-body">
                    <thead>
                      <tr>
                        <Th label="limits.action-type" />
                        <Th label="limits.holder" />
                        <Th label="limits.limit" />
                        <Th label="limits.unknown-value" />
                        <Th label="dates.label" />
                        <Th label="setup.latest-version" />
                      </tr>
                    </thead>
                    <tbody>
                      {list.limits.map((limit) => (
                        <tr key={limit.id} className="h-10 border-t border-border hover:bg-hover">
                          <td className="px-3">
                            <button
                              type="button"
                              className="text-accent underline"
                              onClick={() => {
                                setOpen(limit.id);
                              }}
                            >
                              {actionTitle(limit.actionType)}
                            </button>
                          </td>
                          <td className="px-3">{holderText(limit)}</td>
                          <td className="px-3 tabular-nums">{limitText(limit)}</td>
                          <td className="px-3">
                            {t(limit.coversUnknown ? 'limits.unknown.covered' : 'limits.unknown.not-covered')}
                          </td>
                          <td className="px-3">{datesText(limit)}</td>
                          <td className="px-3">
                            <StatusBadge state={stateIdOf(limit.state)} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {shown !== undefined && (
                <LimitDrawer
                  limit={shown}
                  onClose={() => {
                    setOpen(null);
                  }}
                />
              )}
              {open === 'new' && (
                <RecordDrawer
                  title={t('limits.new')}
                  onClose={() => {
                    setOpen(null);
                  }}
                  details={<NewLimitForm actionTypes={list.actionTypes} />}
                />
              )}
            </div>
          );
        }}
      </ListRead>
    </div>
  );
}
