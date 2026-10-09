import { zodResolver } from '@hookform/resolvers/zod';
import { businessDateSchema, settingOriginSchema } from '@apparel-os/schemas';
import { useQuery } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { api } from '../api';
import { useSubmission } from '../api/command';
import { readQuery } from '../api/query';
import { actionTitle } from '../approvals/subject';
import { describedBy, FormField } from '../forms/FormField';
import { withStartDateChecks } from '../forms/start-date';
import { t } from '../messages/catalogue';
import { AssignmentScopeFields, scopeOfChoices } from '../setup/AssignmentsScreen';
import { useBusinessToday } from '../setup/business-date';
import { paiseOfRupees } from '../setup/format';
import { Card, inputClass, SubmissionBanner, useGranted } from '../setup/parts';
import { FormActions, RecordDrawer } from '../setup/RecordDrawer';

// Delegate during absence (access-and-approvals 10, 14; ui-blueprint Home › My work actions; PRD-ACS-018, POL-02.20;
// GC3-7, DEC-105; S1-F05-T02): a stand-in grant recorded from My work by a holder of create on stand-in grants: the
// stand-in, the person stood in for, one approval action with the limit on its rule's basis, the scope and the dates,
// which always have an end. Every value is the preparer's, none defaulted: the names, scopes, limits and periods are
// KDPS's (KDPS Owner question 5). A different authorised person approves it from My work; the server refuses a grant
// wider than the authority of the person stood in for on its dates.

const READS = ['listStandInGrants', 'listMyWork'] as const;

const grantFormSchema = z
  .object({
    standInUserId: z.uuid(),
    forUserId: z.uuid(),
    actionType: z.string().min(1),
    authority: z.enum(['amount', 'unlimited', 'none']),
    amount: z.string(),
    coversUnknown: z.boolean(),
    legalEntity: z.enum(['all', 'selected', 'empty']),
    place: z.enum(['all', 'selected', 'empty']),
    brand: z.enum(['all', 'empty']),
    legalEntityIds: z.union([z.array(z.uuid()), z.uuid(), z.literal(false)]).optional(),
    places: z.union([z.array(z.string()), z.string(), z.literal(false)]).optional(),
    origin: settingOriginSchema,
    validFrom: businessDateSchema,
    validTo: businessDateSchema,
  })
  .refine((values) => values.standInUserId !== values.forUserId, { path: ['standInUserId'] })
  .refine((values) => values.authority !== 'amount' || paiseOfRupees(values.amount) !== undefined, {
    path: ['amount'],
    message: 'limits.amount.invalid',
  })
  .refine((values) => values.validTo > values.validFrom, { path: ['validTo'] });
type GrantForm = z.input<typeof grantFormSchema>;

function listOf(value: readonly string[] | string | false | undefined): string[] {
  if (value === undefined || value === false) return [];
  return typeof value === 'string' ? [value] : [...value];
}

function GrantFormFields() {
  const today = useBusinessToday();
  const usersGranted = useGranted('access.user', 'view');
  const users = useQuery({ ...readQuery(api, 'listUsers', {}), enabled: usersGranted });
  const grants = useQuery(readQuery(api, 'listStandInGrants', {}));
  const structure = useQuery(readQuery(api, 'readMasterLists', { query: { date: today } }));
  const submission = useSubmission('prepareStandInGrant', READS);
  const form = useForm<GrantForm>({
    resolver: withStartDateChecks(zodResolver(grantFormSchema), [{ path: 'validFrom', earliest: today }]),
    mode: 'onBlur',
    defaultValues: {
      standInUserId: '',
      forUserId: '',
      actionType: '',
      authority: 'amount',
      amount: '',
      coversUnknown: false,
      legalEntity: 'all',
      place: 'all',
      brand: 'all',
      legalEntityIds: [],
      places: [],
      validFrom: today,
      validTo: '',
    },
  });
  const errors = form.formState.errors;
  const actionTypes = grants.data?.actionTypes ?? [];
  const chosen = actionTypes.find((each) => each.actionType === form.watch('actionType'));
  const authority = form.watch('authority');
  const people = (users.data?.users ?? []).map((user) => ({
    id: user.id,
    text: t('standin.person-option', { name: user.versions[0]?.displayName ?? user.login, login: user.login }),
  }));
  const personField = (name: 'standInUserId' | 'forUserId', label: 'standin.stand-in' | 'standin.for') => (
    <FormField id={`standin-${name}`} label={label} required error={errors[name]}>
      <select
        id={`standin-${name}`}
        className={inputClass}
        {...describedBy(`standin-${name}`, { invalid: errors[name] !== undefined, help: false })}
        {...form.register(name)}
      >
        <option value="">{t('setup.choose')}</option>
        {people.map((person) => (
          <option key={person.id} value={person.id}>
            {person.text}
          </option>
        ))}
      </select>
    </FormField>
  );
  return (
    <form
      id="standin-form"
      noValidate
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        void form.handleSubmit(async (values) => {
          await submission.submit({
            body: {
              standInUserId: values.standInUserId,
              forUserId: values.forUserId,
              actions: [
                {
                  actionType: values.actionType,
                  limit:
                    chosen?.basis === null
                      ? { kind: 'none' }
                      : values.authority === 'amount'
                        ? { kind: 'amount', amount: paiseOfRupees(values.amount) ?? 0 }
                        : { kind: values.authority },
                  coversUnknown: chosen?.basis === null ? false : values.coversUnknown,
                },
              ],
              scope: scopeOfChoices(values, {
                legalEntityIds: listOf(values.legalEntityIds),
                places: listOf(values.places),
              }),
              origin: values.origin,
              validFrom: values.validFrom,
              validTo: values.validTo,
            },
          });
        })(event);
      }}
    >
      <SubmissionBanner state={submission.state} />
      {!usersGranted && (
        <span className="text-caption text-text-2">
          {t('setup.needs', { action: t('action.view'), recordType: t('record-type.access.user') })}
        </span>
      )}
      {personField('standInUserId', 'standin.stand-in')}
      {personField('forUserId', 'standin.for')}
      <FormField id="standin-action" label="limits.action-type" required error={errors.actionType}>
        <select
          id="standin-action"
          className={inputClass}
          {...describedBy('standin-action', { invalid: errors.actionType !== undefined, help: false })}
          {...form.register('actionType')}
        >
          <option value="">{t('setup.choose')}</option>
          {actionTypes.map((each) => (
            <option key={each.actionType} value={each.actionType}>
              {each.basis === null
                ? actionTitle(each.actionType)
                : t('limits.action-option', {
                    action: actionTitle(each.actionType),
                    basis: t(`approval.basis.${each.basis}`),
                  })}
            </option>
          ))}
        </select>
      </FormField>
      {chosen?.basis != null && (
        <>
          <p className="m-0 text-body-sm text-text-2">
            {t('limits.basis-note', { basis: t(`approval.basis.${chosen.basis}`) })}
          </p>
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
          </fieldset>
          {authority === 'amount' && (
            <FormField
              id="standin-amount"
              label="limits.amount"
              required
              error={errors.amount}
              message={errors.amount === undefined ? undefined : 'limits.amount.invalid'}
              help="limits.amount.help"
            >
              <input
                id="standin-amount"
                inputMode="decimal"
                className={inputClass}
                {...describedBy('standin-amount', { invalid: errors.amount !== undefined, help: true })}
                {...form.register('amount')}
              />
            </FormField>
          )}
          <label className="flex items-center gap-2">
            <input type="checkbox" {...form.register('coversUnknown')} />
            {t('limits.covers-unknown')}
          </label>
        </>
      )}
      <AssignmentScopeFields
        choices={{ legalEntity: form.watch('legalEntity'), place: form.watch('place'), brand: form.watch('brand') }}
        register={(name) => form.register(name)}
        structure={structure.data}
      />
      <FormField id="standin-origin" label="rules.origin" required error={errors.origin}>
        <select
          id="standin-origin"
          className={inputClass}
          {...describedBy('standin-origin', { invalid: errors.origin !== undefined, help: false })}
          {...form.register('origin')}
        >
          <option value="">{t('setup.choose')}</option>
          <option value="kdps">{t('rules.origin.kdps')}</option>
          <option value="test-setup">{t('rules.origin.test-setup')}</option>
          <option value="synthetic">{t('rules.origin.synthetic')}</option>
        </select>
      </FormField>
      <FormField
        id="standin-from"
        label="setup.valid-from"
        required
        error={errors.validFrom}
        help="setup.valid-from-help"
      >
        <input
          id="standin-from"
          type="date"
          min={today}
          className={inputClass}
          {...describedBy('standin-from', { invalid: errors.validFrom !== undefined, help: true })}
          {...form.register('validFrom')}
        />
      </FormField>
      <FormField id="standin-to" label="standin.ends" required error={errors.validTo} help="standin.ends.help">
        <input
          id="standin-to"
          type="date"
          min={today}
          className={inputClass}
          {...describedBy('standin-to', { invalid: errors.validTo !== undefined, help: true })}
          {...form.register('validTo')}
        />
      </FormField>
      <FormActions form="standin-form" pending={submission.state.kind === 'pending'} />
    </form>
  );
}

/** The "Delegate during absence" drawer of My work (design-language 10.15). */
export function StandInDrawer({ onClose }: { onClose: () => void }) {
  return (
    <RecordDrawer
      title={t('standin.delegate')}
      onClose={onClose}
      details={
        <Card>
          <GrantFormFields />
        </Card>
      }
    />
  );
}
