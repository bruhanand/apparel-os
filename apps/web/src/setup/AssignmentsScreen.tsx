import { zodResolver } from '@hookform/resolvers/zod';
import {
  businessDateSchema,
  routes,
  scopeGrantsNothing,
  type AssignmentRecord,
  type AssignmentScope,
} from '@apparel-os/schemas';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { api } from '../api';
import { useSubmission } from '../api/command';
import { readQuery } from '../api/query';
import { ApprovalPanel } from '../approvals/ApprovalPanel';
import { Banner } from '../components/Banner';
import { Button } from '../components/Button';
import { EmptyState } from '../components/StandardStates';
import { StatusBadge } from '../components/StatusBadge';
import { describedBy, FormField } from '../forms/FormField';
import { withStartDateChecks } from '../forms/start-date';
import { useKeptDraft } from '../forms/use-kept-draft';
import { useRouteForm } from '../forms/use-route-form';
import { AsOf } from '../history/AsOf';
import { KeptDraftBanner } from '../lock/KeptDraftBanner';
import { t, type MessageId } from '../messages/catalogue';
import { scopeText } from './describe';
import { formatDate } from './format';
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
import { useTimeZone } from '../shell/session';
import { useBusinessToday } from './business-date';

// Setup › Role assignments (access-and-approvals 4.3, 5.1, 5.2, 9.11, 14; PRD-ACS-001 to PRD-ACS-005, PRD-ACS-021):
// every assignment, and the assignment editor: the person, the role, the scope per dimension and the dates. Each
// dimension is all members, which includes later members, or empty, which grants nothing; selected members arrive
// with the legal entities, places and brands of S1-F02 and S1-F03. Withdrawing a Scheduled assignment is a prepared
// change (RR-202, CH-11). Ending one early is not built yet (RR-292).

const LIST_READS = ['listRoleAssignments', 'listMyWork'] as const;
type Dimension = 'legalEntity' | 'place' | 'brand';
const DIMENSIONS: readonly Dimension[] = ['legalEntity', 'place', 'brand'];
export type ScopeChoices = Readonly<Record<Dimension, 'all' | 'empty'>>;

/** The scope of the editor's choices, per dimension (PRD-ACS-005, POL-02.02). */
export function scopeOfChoices(choices: ScopeChoices): AssignmentScope {
  return {
    kind: 'dimensions',
    legalEntity: { kind: choices.legalEntity },
    place: { kind: choices.place },
    brand: { kind: choices.brand },
  };
}

/**
 * The scope fields (design-language 10.3; access-and-approvals 14): a choice per dimension, the note that a selected
 * Site covers Stores and business units added later and a selected Store covers business units added later
 * (PRD-ACS-021), and the warning that an empty dimension grants nothing (PRD-ACS-005).
 */
export function AssignmentScopeFields({
  choices,
  register,
}: {
  choices: ScopeChoices;
  register: (dimension: Dimension) => object;
}) {
  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="text-body-sm font-semibold">{t('assignment.scope')}</legend>
      {DIMENSIONS.map((dimension) => (
        <fieldset key={dimension} className="flex flex-col gap-1">
          <legend className="text-body-sm font-semibold">{t(`scope.dimension.${dimension}`)}</legend>
          <span className="flex flex-wrap gap-4">
            {(['all', 'empty'] as const).map((kind) => (
              <label key={kind} className="flex items-center gap-2">
                <input type="radio" value={kind} {...register(dimension)} />
                {t(`scope.${kind}`)}
              </label>
            ))}
            <label className="flex items-center gap-2 text-text-3">
              <input type="radio" disabled />
              {t('scope.selected-members')}
            </label>
          </span>
        </fieldset>
      ))}
      <p className="text-caption text-text-2">{t('scope.selected-later')}</p>
      <p className="text-caption text-text-2">{t('scope.place-tree')}</p>
      {scopeGrantsNothing(scopeOfChoices(choices)) && (
        <Banner tone="warning" role="status" message="scope.empty-warning" />
      )}
    </fieldset>
  );
}

const assignmentFormSchema = z
  .object({
    userId: z.uuid(),
    roleId: z.uuid(),
    legalEntity: z.enum(['all', 'empty']),
    place: z.enum(['all', 'empty']),
    brand: z.enum(['all', 'empty']),
    validFrom: businessDateSchema,
    validTo: z.union([z.literal(''), businessDateSchema]),
  })
  .refine((values) => values.validTo === '' || values.validTo > values.validFrom, { path: ['validTo'] });
type AssignmentForm = z.input<typeof assignmentFormSchema>;

/** A new assignment: a person, a role, the scope per dimension and the dates (access-and-approvals 4.3). */
function NewAssignmentForm() {
  const users = useQuery({ ...readQuery(api, 'listUsers', {}), enabled: useGranted('access.user', 'view') });
  const roles = useQuery({ ...readQuery(api, 'listRoles', {}), enabled: useGranted('access.role', 'view') });
  const today = useBusinessToday();
  const form = useForm<AssignmentForm>({
    resolver: withStartDateChecks(zodResolver(assignmentFormSchema), [{ path: 'validFrom', earliest: today }]),
    mode: 'onBlur',
    defaultValues: {
      userId: '',
      roleId: '',
      legalEntity: 'all',
      place: 'all',
      brand: 'all',
      validFrom: today,
      validTo: '',
    },
  });
  const kept = useKeptDraft(routes.prepareRoleAssignment, form, 'setup.new-assignment');
  const submission = useSubmission('prepareRoleAssignment', LIST_READS);
  const errors = form.formState.errors;
  const choices: ScopeChoices = {
    legalEntity: form.watch('legalEntity'),
    place: form.watch('place'),
    brand: form.watch('brand'),
  };
  const select = (id: string, label: MessageId, name: 'userId' | 'roleId', options: { id: string; text: string }[]) => (
    <FormField id={id} label={label} required error={errors[name]}>
      <select
        id={id}
        className={inputClass}
        {...describedBy(id, { invalid: errors[name] !== undefined, help: false })}
        {...form.register(name)}
      >
        <option value="">{t('setup.choose')}</option>
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.text}
          </option>
        ))}
      </select>
    </FormField>
  );
  return (
    <form
      id="assignment-new-form"
      noValidate
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        void form.handleSubmit(async (values) => {
          const done = await submission.submit({
            body: {
              actor: { kind: 'user', userId: values.userId },
              roleId: values.roleId,
              scope: scopeOfChoices(values),
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
      {select(
        'assignment-user',
        'assignment.user',
        'userId',
        (users.data?.users ?? []).map((user) => ({
          id: user.id,
          text: t('setup.assignments.user-option', {
            name: user.versions[0]?.displayName ?? user.login,
            login: user.login,
          }),
        })),
      )}
      {select(
        'assignment-role',
        'assignment.role',
        'roleId',
        (roles.data?.roles ?? []).map((role) => ({
          id: role.id,
          text: t('setup.roles.option', { code: role.code, name: role.versions[0]?.name ?? '' }),
        })),
      )}
      <AssignmentScopeFields choices={choices} register={(dimension) => form.register(dimension)} />
      <FormField
        id="assignment-from"
        label="setup.valid-from"
        required
        error={errors.validFrom}
        help="setup.valid-from-help"
      >
        <input
          id="assignment-from"
          type="date"
          min={today}
          className={inputClass}
          {...describedBy('assignment-from', { invalid: errors.validFrom !== undefined, help: true })}
          {...form.register('validFrom')}
        />
      </FormField>
      <FormField id="assignment-to" label="setup.valid-to" error={errors.validTo} help="setup.valid-to-help">
        <input
          id="assignment-to"
          type="date"
          min={today}
          className={inputClass}
          {...describedBy('assignment-to', { invalid: errors.validTo !== undefined, help: true })}
          {...form.register('validTo')}
        />
      </FormField>
      <FormActions form="assignment-new-form" pending={submission.state.kind === 'pending'} />
    </form>
  );
}

/** Withdrawing a Scheduled assignment before its start, with its reason (RR-202, CH-11; code-house-rules 7.3). */
function WithdrawalForm({ assignment }: { assignment: AssignmentRecord }) {
  const form = useRouteForm(routes.prepareAssignmentWithdrawal);
  const submission = useSubmission('prepareAssignmentWithdrawal', LIST_READS);
  const errors = form.formState.errors;
  return (
    <form
      id="assignment-withdrawal-form"
      noValidate
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        void form.handleSubmit(async (values) => {
          await submission.submit({ params: { assignmentId: assignment.id }, body: values });
        })(event);
      }}
    >
      <SubmissionBanner state={submission.state} />
      <FormField id="withdrawal-reason" label="assignment.withdrawal-reason" required error={errors.reason}>
        <textarea
          id="withdrawal-reason"
          rows={3}
          className="rounded-control border border-control bg-surface p-2"
          {...describedBy('withdrawal-reason', { invalid: errors.reason !== undefined, help: false })}
          {...form.register('reason')}
        />
      </FormField>
      <FormActions
        form="assignment-withdrawal-form"
        variant="destructive"
        label="setup.assignments.withdraw"
        pending={submission.state.kind === 'pending'}
      />
    </form>
  );
}

function actorName(assignment: AssignmentRecord): string {
  return assignment.actor.kind === 'user' ? (assignment.actor.name ?? assignment.actor.userId) : assignment.actor.code;
}

function datesText(assignment: AssignmentRecord): string {
  return assignment.validTo === undefined
    ? t('dates.from', { from: formatDate(assignment.validFrom) })
    : t('dates.between', { from: formatDate(assignment.validFrom), to: formatDate(assignment.validTo) });
}

function AssignmentDrawer({ assignment, onClose }: { assignment: AssignmentRecord; onClose: () => void }) {
  const [withdrawing, setWithdrawing] = useState(false);
  const [panel, setPanel] = useState<string | null>(null);
  const openRequest = [assignment.request, assignment.withdrawal?.request].find(
    (request) => request?.state === 'Awaiting approval',
  );
  return (
    <RecordDrawer
      reference={assignment.role.code}
      title={actorName(assignment)}
      state={assignment.state}
      onClose={onClose}
      history={<HistoryTab recordType="access.role_assignment" recordId={assignment.id} />}
      details={
        <>
          <Card title="setup.details">
            <dl className="m-0 grid gap-3">
              <div>
                <dt className="text-label font-semibold text-text-2">{t('assignment.role')}</dt>
                <dd className="m-0 font-mono">{assignment.role.code}</dd>
              </div>
              <div>
                <dt className="text-label font-semibold text-text-2">{t('assignment.scope')}</dt>
                <dd className="m-0">{scopeText(assignment.scope)}</dd>
              </div>
              <div>
                <dt className="text-label font-semibold text-text-2">{t('dates.label')}</dt>
                <dd className="m-0">{datesText(assignment)}</dd>
              </div>
              {assignment.withdrawal !== undefined && (
                <div>
                  <dt className="text-label font-semibold text-text-2">{t('assignment.withdrawal-reason')}</dt>
                  <dd className="m-0">
                    {t('setup.assignments.withdrawal-line', {
                      reason: assignment.withdrawal.reason,
                      decision: t(`setup.decision.${assignment.withdrawal.decision}`),
                    })}
                  </dd>
                </div>
              )}
            </dl>
            {scopeGrantsNothing(assignment.scope) && (
              <Banner tone="warning" role="status" message="scope.empty-warning" />
            )}
            {openRequest !== undefined && (
              <div>
                <Button
                  size="small"
                  variant="ghost"
                  label="setup.open-approval"
                  onClick={() => {
                    setPanel(openRequest.id);
                  }}
                />
              </div>
            )}
          </Card>
          {panel !== null && <ApprovalPanel requestId={panel} />}
          {assignment.state === 'Scheduled' && assignment.withdrawal === undefined && (
            <Card title="setup.assignments.withdraw">
              {withdrawing ? (
                <WithdrawalForm assignment={assignment} />
              ) : (
                <GrantedButton
                  label="setup.assignments.withdraw"
                  recordType="access.role_assignment"
                  action="edit"
                  onClick={() => {
                    setWithdrawing(true);
                  }}
                />
              )}
            </Card>
          )}
          {assignment.state === 'In force' && (
            <Banner tone="info" role="status" message="setup.assignments.end-early-not-built" />
          )}
        </>
      }
    />
  );
}

/** Setup › Role assignments. */
export function AssignmentsScreen() {
  const timeZone = useTimeZone();
  const query = useQuery(readQuery(api, 'listRoleAssignments', {}));
  const [open, setOpen] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-4">
      <Toolbar>
        <GrantedButton
          label="setup.assignments.new"
          recordType="access.role_assignment"
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
      <ListRead query={query} what="setup.assignments.what">
        {(list) => {
          const shown = list.assignments.find((assignment) => assignment.id === open);
          return (
            <div className="flex flex-col gap-3">
              <div className="flex justify-end">
                <AsOf asOf={list.asOf} timeZone={timeZone} />
              </div>
              {list.assignments.length === 0 ? (
                <EmptyState title="setup.assignments.empty.title" body="setup.assignments.empty.body" />
              ) : (
                <div className="overflow-x-auto rounded-card border border-border bg-surface">
                  <table className="w-full border-collapse text-body">
                    <thead>
                      <tr>
                        <Th label="assignment.actor" />
                        <Th label="assignment.role" />
                        <Th label="assignment.scope" />
                        <Th label="dates.label" />
                        <Th label="setup.state" />
                      </tr>
                    </thead>
                    <tbody>
                      {list.assignments.map((assignment) => (
                        <tr key={assignment.id} className="h-10 border-t border-border hover:bg-hover">
                          <td className="px-3">
                            <button
                              type="button"
                              className="text-accent underline"
                              onClick={() => {
                                setOpen(assignment.id);
                              }}
                            >
                              {actorName(assignment)}
                            </button>
                          </td>
                          <td className="px-3 font-mono">{assignment.role.code}</td>
                          <td className="px-3">{scopeText(assignment.scope)}</td>
                          <td className="px-3">{datesText(assignment)}</td>
                          <td className="px-3">
                            <StatusBadge state={stateIdOf(assignment.state)} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {shown !== undefined && (
                <AssignmentDrawer
                  assignment={shown}
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
          title={t('setup.assignments.new')}
          onClose={() => {
            setOpen(null);
          }}
          details={<NewAssignmentForm />}
        />
      )}
    </div>
  );
}
