import { zodResolver } from '@hookform/resolvers/zod';
import {
  OPEN_TO_BUY_BUDGET_TYPE,
  settingOriginSchema,
  type OpenToBuyBudget,
  type OpenToBuyBudgetList,
  type OpenToBuyBudgetVersion,
  type OpenToBuyRemaining,
} from '@apparel-os/schemas';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { api } from '../api';
import { useSubmission } from '../api/command';
import { ApiFailure, readQuery } from '../api/query';
import { ApprovalPanel } from '../approvals/ApprovalPanel';
import { Button } from '../components/Button';
import { EmptyState } from '../components/StandardStates';
import { StatusBadge } from '../components/StatusBadge';
import { describedBy, FormField } from '../forms/FormField';
import { AsOf } from '../history/AsOf';
import { formatDateTime } from '../history/format';
import { t } from '../messages/catalogue';
import { formatPaise, paiseOfRupees } from '../setup/format';
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
} from '../setup/parts';
import { FormActions, RecordDrawer } from '../setup/RecordDrawer';
import { stateIdOf } from '../setup/states';
import { useMarkedAttribute } from '../merchandise/marked';
import { useTimeZone } from '../shell/session';

// Booking › Open-to-buy (goods-in 3.3, section 11; PRD-BKG-004; POL-05.09, POL-02.07; S2-F01-T02): every budget by
// brand and season, with its approved amount, what approved bookings reserve and what remains, and every version
// with its history. Booking prepares a budget, or its next version; Accounts records its check, and the Owner, or
// whoever holds the approval, approves it, each from My work and each a different person from its preparer. Every
// amount is the product owner's, OPEN until set (V-17, RR-080).

const LIST_READS = ['listOpenToBuyBudgets', 'readOpenToBuyBudget', 'listMyWork'] as const;

const amountField = z
  .string()
  .refine((text) => paiseOfRupees(text) !== undefined, { message: 'budget.amount.invalid' });

/**
 * The amount the form's schema accepted, in paise. The schema refuses any text that is not an amount, so one that does
 * not parse here is a defect, never sent as zero (PRD-MOD-014, PRD-MOD-015).
 */
function amountOf(text: string): number {
  const amount = paiseOfRupees(text);
  if (amount === undefined) throw new Error('An amount the form accepted is not an amount');
  return amount;
}

const budgetFormSchema = z.object({
  brandId: z.uuid(),
  seasonValueId: z.uuid(),
  amount: amountField,
  // Where the amount came from, stated each time, with no default (code-house-rules 11.1, 12.14).
  origin: settingOriginSchema,
});
type BudgetForm = z.input<typeof budgetFormSchema>;

const versionFormSchema = z.object({ amount: amountField, origin: settingOriginSchema });
type VersionForm = z.input<typeof versionFormSchema>;

function OriginField({ id, error, register }: { id: string; error: unknown; register: object }) {
  return (
    <FormField id={id} label="rules.origin" required error={error === undefined ? undefined : {}}>
      <select
        id={id}
        className={inputClass}
        {...describedBy(id, { invalid: error !== undefined, help: false })}
        {...register}
      >
        <option value="">{t('setup.choose')}</option>
        <option value="kdps">{t('rules.origin.kdps')}</option>
        <option value="test-setup">{t('rules.origin.test-setup')}</option>
        <option value="synthetic">{t('rules.origin.synthetic')}</option>
      </select>
    </FormField>
  );
}

/** A new budget for a brand and a season (3.3), with its first version, sent for Accounts' check. */
function NewBudgetForm() {
  const brands = useQuery({
    ...readQuery(api, 'listBrands', { query: {} }),
    enabled: useGranted('merchandise.brand', 'view'),
  });
  // The seasons are the values of the attribute the Organisation marks as its season (RR-550).
  const seasons = useMarkedAttribute('season');
  const values = useQuery({
    ...readQuery(api, 'listVocabularyValues', { query: {} }),
    enabled: useGranted('merchandise.vocabulary_value', 'view'),
  });
  const form = useForm<BudgetForm>({
    resolver: zodResolver(budgetFormSchema),
    mode: 'onBlur',
    defaultValues: { brandId: '', seasonValueId: '', amount: '' },
  });
  const submission = useSubmission('prepareOpenToBuyBudget', LIST_READS);
  const errors = form.formState.errors;
  const attributeId = seasons.kind === 'set' ? seasons.attributeId : undefined;
  const inForce = <T extends { versions: readonly { state: string }[] }>(list: readonly T[] | undefined) =>
    (list ?? []).filter((each) => each.versions.some((version) => version.state === 'In force'));
  const nameOf = (record: { code: string; versions: readonly { state: string; name?: string }[] }) =>
    record.versions.find((version) => version.state === 'In force')?.name ?? record.code;
  return (
    <form
      id="budget-new-form"
      aria-label={t('budget.new')}
      noValidate
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        void form.handleSubmit(async (entered) => {
          await submission.submit({
            body: {
              brandId: entered.brandId,
              seasonValueId: entered.seasonValueId,
              amount: amountOf(entered.amount),
              origin: entered.origin,
            },
          });
        })(event);
      }}
    >
      <p className="m-0 text-body-sm text-text-2">{t('budget.new.intro')}</p>
      <SubmissionBanner state={submission.state} done="budget.sent-for-check" />
      <FormField id="budget-brand" label="budget.brand" required error={errors.brandId}>
        <select
          id="budget-brand"
          className={inputClass}
          {...describedBy('budget-brand', { invalid: errors.brandId !== undefined, help: false })}
          {...form.register('brandId')}
        >
          <option value="">{t('setup.choose')}</option>
          {inForce(brands.data?.records).map((brand) => (
            <option key={brand.id} value={brand.id}>
              {t('budget.option', { code: brand.code, name: nameOf(brand) })}
            </option>
          ))}
        </select>
      </FormField>
      <FormField
        id="budget-season"
        label="budget.season"
        required
        error={errors.seasonValueId}
        help="budget.season.help"
      >
        <select
          id="budget-season"
          className={inputClass}
          {...describedBy('budget-season', { invalid: errors.seasonValueId !== undefined, help: true })}
          {...form.register('seasonValueId')}
        >
          <option value="">{t('setup.choose')}</option>
          {inForce(values.data?.records)
            .filter((value) => value.attributeId === attributeId)
            .map((value) => (
              <option key={value.id} value={value.id}>
                {t('budget.option', { code: value.code, name: nameOf(value) })}
              </option>
            ))}
        </select>
        {seasons.kind === 'not-set' && (
          <p role="status" className="m-0 text-body-sm text-text-2">
            {t('budget.season.not-marked')}
          </p>
        )}
      </FormField>
      <FormField
        id="budget-amount"
        label="budget.amount"
        required
        error={errors.amount}
        message={errors.amount === undefined ? undefined : 'budget.amount.invalid'}
        help="budget.amount.help"
      >
        <input
          id="budget-amount"
          inputMode="decimal"
          className={inputClass}
          {...describedBy('budget-amount', { invalid: errors.amount !== undefined, help: true })}
          {...form.register('amount')}
        />
      </FormField>
      <OriginField id="budget-origin" error={errors.origin} register={form.register('origin')} />
      <FormActions form="budget-new-form" label="budget.send-for-check" pending={submission.state.kind === 'pending'} />
    </form>
  );
}

/** A budget's next version (3.3): the same three steps; the version in force stays until it is approved. */
function NewVersionForm({ budget }: { budget: OpenToBuyBudget }) {
  const form = useForm<VersionForm>({
    resolver: zodResolver(versionFormSchema),
    mode: 'onBlur',
    defaultValues: { amount: '' },
  });
  const submission = useSubmission('prepareOpenToBuyBudgetVersion', LIST_READS);
  const errors = form.formState.errors;
  return (
    <form
      id="budget-version-form"
      aria-label={t('budget.new-version')}
      noValidate
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        void form.handleSubmit(async (entered) => {
          await submission.submit({
            params: { budgetId: budget.id },
            body: {
              amount: amountOf(entered.amount),
              origin: entered.origin,
              versionToken: budget.versionToken,
            },
          });
        })(event);
      }}
    >
      <p className="m-0 text-body-sm text-text-2">{t('budget.new-version.intro')}</p>
      <SubmissionBanner state={submission.state} done="budget.sent-for-check" />
      <FormField
        id="budget-version-amount"
        label="budget.amount"
        required
        error={errors.amount}
        message={errors.amount === undefined ? undefined : 'budget.amount.invalid'}
        help="budget.amount.help"
      >
        <input
          id="budget-version-amount"
          inputMode="decimal"
          className={inputClass}
          {...describedBy('budget-version-amount', { invalid: errors.amount !== undefined, help: true })}
          {...form.register('amount')}
        />
      </FormField>
      <OriginField id="budget-version-origin" error={errors.origin} register={form.register('origin')} />
      <FormActions
        form="budget-version-form"
        label="budget.send-for-check"
        pending={submission.state.kind === 'pending'}
      />
    </form>
  );
}

/** The budget's names: its brand and its season, by code and name where the catalogue has them. */
function brandText(budget: OpenToBuyBudget): string {
  return budget.brand.name === undefined
    ? budget.brand.code
    : t('budget.option', { code: budget.brand.code, name: budget.brand.name });
}

function seasonText(budget: OpenToBuyBudget): string {
  const { code, name } = budget.season;
  if (code === undefined) return t('organisation.unknown');
  return name === undefined ? code : t('budget.option', { code, name });
}

function amounts(remaining: OpenToBuyRemaining): { approved: string; reserved: string; remaining: string } {
  if (remaining.kind === 'not-approved') {
    const none = t('budget.not-approved');
    return { approved: none, reserved: none, remaining: none };
  }
  return {
    approved: formatPaise(remaining.approved),
    reserved: formatPaise(remaining.reserved),
    remaining: formatPaise(remaining.remaining),
  };
}

/** What a version waits for, in words: Accounts' check, or the approval once the check is recorded. */
function VersionStep({ version, timeZone }: { version: OpenToBuyBudgetVersion; timeZone: string }) {
  return (
    <span className="flex flex-col gap-1 text-body-sm text-text-2">
      {version.awaiting === 'check' && <span>{t('budget.awaiting.check')}</span>}
      {version.awaiting === 'approval' && <span>{t('budget.awaiting.approval')}</span>}
      {version.check !== undefined && (
        <span>{t('budget.checked-at', { at: formatDateTime(version.check.checkedAt, timeZone) })}</span>
      )}
      {version.inForceFrom !== undefined && (
        <span>
          {version.inForceUntil === undefined
            ? t('budget.in-force-from', { from: formatDateTime(version.inForceFrom, timeZone) })
            : t('budget.in-force-between', {
                from: formatDateTime(version.inForceFrom, timeZone),
                until: formatDateTime(version.inForceUntil, timeZone),
              })}
        </span>
      )}
    </span>
  );
}

function BudgetDrawer({ budget, onClose }: { budget: OpenToBuyBudget; onClose: () => void }) {
  const timeZone = useTimeZone();
  const [panel, setPanel] = useState<string | null>(null);
  const [changing, setChanging] = useState(false);
  const shown = amounts(budget.remaining);
  const newest = budget.versions.at(-1);
  return (
    <RecordDrawer
      reference={brandText(budget)}
      title={seasonText(budget)}
      {...(newest === undefined ? {} : { state: newest.state })}
      onClose={onClose}
      history={<HistoryTab recordType={OPEN_TO_BUY_BUDGET_TYPE} recordId={budget.id} />}
      details={
        <>
          <Card title="budget.details">
            <dl className="m-0 grid grid-cols-[max-content_1fr] gap-x-4 gap-y-2 text-body-sm">
              <dt className="text-text-2">{t('budget.brand')}</dt>
              <dd className="m-0">{brandText(budget)}</dd>
              <dt className="text-text-2">{t('budget.season')}</dt>
              <dd className="m-0">{seasonText(budget)}</dd>
              <dt className="text-text-2">{t('budget.approved')}</dt>
              <dd className="m-0 tabular-nums">{shown.approved}</dd>
              <dt className="text-text-2">{t('budget.reserved')}</dt>
              <dd className="m-0 tabular-nums">{shown.reserved}</dd>
              <dt className="text-text-2">{t('budget.remaining')}</dt>
              <dd className="m-0 tabular-nums">{shown.remaining}</dd>
            </dl>
            <p className="m-0 text-caption text-text-2">{t('budget.reserved.note')}</p>
          </Card>
          <Card title="budget.versions">
            <ul className="m-0 flex list-none flex-col gap-3 p-0">
              {[...budget.versions].reverse().map((version) => (
                <li key={version.id} className="flex flex-col gap-1 border-t border-border pt-2">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="tabular-nums font-semibold">{formatPaise(version.amount)}</span>
                    <StatusBadge state={stateIdOf(version.state)} />
                    <span className="text-caption text-text-2">{t(`rules.origin.${version.origin}`)}</span>
                  </span>
                  <span className="text-body-sm text-text-2">
                    {t('budget.prepared-at', { at: formatDateTime(version.preparedAt, timeZone) })}
                  </span>
                  <VersionStep version={version} timeZone={timeZone} />
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
            </ul>
          </Card>
          {panel !== null && <ApprovalPanel requestId={panel} />}
          {changing ? (
            <Card title="budget.new-version">
              <NewVersionForm budget={budget} />
            </Card>
          ) : (
            <div>
              <GrantedButton
                label="budget.new-version"
                recordType={OPEN_TO_BUY_BUDGET_TYPE}
                action="edit"
                onClick={() => {
                  setChanging(true);
                }}
              />
            </div>
          )}
        </>
      }
    />
  );
}

/** One page of the budgets, after the cursor the server gave, or the refusal thrown as ApiFailure. */
async function readPage(after: string | undefined): Promise<OpenToBuyBudgetList> {
  const result = await api.call('listOpenToBuyBudgets', { query: after === undefined ? {} : { after } });
  if (result.ok) return result.data;
  throw new ApiFailure(result.status, result.error);
}

/** Booking › Open-to-buy. The budgets are read a page at a time; Load more reads the next (code-house-rules 12.1). */
export function OpenToBuyScreen() {
  const timeZone = useTimeZone();
  const query = useInfiniteQuery({
    queryKey: ['listOpenToBuyBudgets', 'pages'],
    queryFn: ({ pageParam }) => readPage(pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last: OpenToBuyBudgetList) => last.next ?? undefined,
  });
  const [open, setOpen] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-4">
      <Toolbar>
        <GrantedButton
          label="budget.new"
          recordType={OPEN_TO_BUY_BUDGET_TYPE}
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
      <p className="m-0 text-body-sm text-text-2">{t('budget.intro')}</p>
      <ListRead query={query} what="budget.what">
        {({ pages }) => {
          const budgets = pages.flatMap((page) => page.budgets);
          const asOf = pages[0]?.asOf;
          const shown = budgets.find((budget) => budget.id === open);
          return (
            <div className="flex flex-col gap-3">
              <div className="flex justify-end">{asOf !== undefined && <AsOf asOf={asOf} timeZone={timeZone} />}</div>
              {budgets.length === 0 ? (
                <EmptyState title="budget.empty.title" body="budget.empty.body" />
              ) : (
                <div className="overflow-x-auto rounded-card border border-border bg-surface">
                  <table className="w-full border-collapse text-body" aria-label={t('budget.list')}>
                    <thead>
                      <tr>
                        <Th label="budget.brand" />
                        <Th label="budget.season" />
                        <Th label="budget.approved" />
                        <Th label="budget.reserved" />
                        <Th label="budget.remaining" />
                        <Th label="setup.latest-version" />
                      </tr>
                    </thead>
                    <tbody>
                      {budgets.map((budget) => {
                        const figures = amounts(budget.remaining);
                        const newest = budget.versions.at(-1);
                        return (
                          <tr key={budget.id} className="h-10 border-t border-border hover:bg-hover">
                            <td className="px-3">
                              <button
                                type="button"
                                className="text-accent underline"
                                onClick={() => {
                                  setOpen(budget.id);
                                }}
                              >
                                {brandText(budget)}
                              </button>
                            </td>
                            <td className="px-3">{seasonText(budget)}</td>
                            <td className="px-3 tabular-nums">{figures.approved}</td>
                            <td className="px-3 tabular-nums">{figures.reserved}</td>
                            <td className="px-3 tabular-nums">{figures.remaining}</td>
                            <td className="px-3">
                              {newest !== undefined && (
                                <span className="flex flex-wrap items-center gap-2">
                                  <StatusBadge state={stateIdOf(newest.state)} />
                                  {newest.awaiting !== undefined && (
                                    <span className="text-caption text-text-2">
                                      {t(`budget.awaiting.${newest.awaiting}`)}
                                    </span>
                                  )}
                                </span>
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
                <BudgetDrawer
                  budget={shown}
                  onClose={() => {
                    setOpen(null);
                  }}
                />
              )}
              {open === 'new' && (
                <RecordDrawer
                  title={t('budget.new')}
                  onClose={() => {
                    setOpen(null);
                  }}
                  details={<NewBudgetForm />}
                />
              )}
            </div>
          );
        }}
      </ListRead>
    </div>
  );
}
