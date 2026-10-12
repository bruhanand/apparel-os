import { uuidv7 } from '@apparel-os/domain';
import {
  BILL_FORMAT_CHANGE_APPROVAL,
  BILL_FORMAT_CHANGE_TYPE,
  FINANCIAL_YEAR_CHANGE_APPROVAL,
  FINANCIAL_YEAR_CHANGE_TYPE,
  type BillFormatDraftInput,
  type BillFormatRead,
  type FinancialYearDraftInput,
  type FinancialYearList,
  type FormatPartView,
  type SettingOrigin,
} from '@apparel-os/schemas';
import { desc, eq } from 'drizzle-orm';
import {
  CommandDefect,
  LOCK_STEP,
  lockTable,
  type LockTable,
  type LockTarget,
  type TransactionContext,
} from '../../../kernel/index.js';
import type {
  AccessInterface,
  ApprovalRule,
  DocumentEffect,
  EffectDecider,
  EffectOutcome,
  ModuleApprovals,
  Preparer,
} from '../../access/index.js';
import type { AuditChange, AuditInterface } from '../../audit/index.js';
import type { ConfigurationInterface } from '../../configuration/index.js';
import { checkFormat, type NumberingInterface } from '../../numbering/index.js';
import { billFormatChange, financialYearChange } from '../db/schema.js';
import { BILL_KIND } from '../domain/kinds.js';
import { defineMissingSeries, missingSeriesLockTargets, refused, type Outcome } from './devices.js';

// The financial years and the bill-number format (offline-counter 4.1, 4.3b; numbering-and-audit 3.3, 3.5;
// access-and-approvals 9.1a, 9.8b; PRD-ACS-006, PRD-POS-020, PRD-OFF-002, POL-02.03, POL-10.07; DEC-116, DEC-117;
// S1-F12-T03). Two Organisation settings `numbering` keeps, each changed by a change `pos` keeps: prepared by one person
// and decided by a different one through access's Request approval and Decide (product owner, 10 Oct 2026), or
// withdrawn while pending by its preparer, or by anyone holding cancel (RR-489; product owner, 12 Oct 2026). The
// approval takes the setting into force and gives every Active billing device its missing series in the decision's
// own transaction, holding `numbering`'s settings row and every device's rows at step 1 with the change
// (code-house-rules 8.1, 8.2). No value is chosen here: the dates are OPEN (GC5-1, RR-060) and the format is OPEN
// (V-40, RR-101); the preparer states every value and its origin (code-house-rules 12.14).

export interface NumberingChangeDependencies {
  readonly audit: AuditInterface;
  readonly access: Pick<
    AccessInterface,
    'requestApproval' | 'approvalRequestsOf' | 'requestLockTargets' | 'withdrawRequest'
  >;
  readonly origins: Pick<ConfigurationInterface, 'originRefusal'>;
  readonly numbering: NumberingInterface;
}

/** The two changes: the row each keeps, its record and action types, and the noun its audit operations name. */
type ChangeKind = 'financial-year' | 'bill-format';

interface ChangeTable {
  readonly lock: LockTable;
  readonly recordType: string;
  readonly actionType: string;
  /** The audit record's type, as the table is named. */
  readonly auditType: string;
}

const CHANGES: Readonly<Record<ChangeKind, ChangeTable>> = {
  'financial-year': {
    lock: lockTable('pos', 'financial_year_change'),
    recordType: FINANCIAL_YEAR_CHANGE_TYPE,
    actionType: FINANCIAL_YEAR_CHANGE_APPROVAL,
    auditType: 'financial_year_change',
  },
  'bill-format': {
    lock: lockTable('pos', 'bill_format_change'),
    recordType: BILL_FORMAT_CHANGE_TYPE,
    actionType: BILL_FORMAT_CHANGE_APPROVAL,
    auditType: 'bill_format_change',
  },
};

type FinancialYearChangeRow = typeof financialYearChange.$inferSelect;
type BillFormatChangeRow = typeof billFormatChange.$inferSelect;

/** A change row by its identifier, frozen as prepared (code-house-rules 7.1). */
async function financialYearChangeOf(context: TransactionContext, changeId: string) {
  const [row] = await context.tx.select().from(financialYearChange).where(eq(financialYearChange.id, changeId));
  return row;
}

async function billFormatChangeOf(context: TransactionContext, changeId: string) {
  const [row] = await context.tx.select().from(billFormatChange).where(eq(billFormatChange.id, changeId));
  return row;
}

function changeOf(
  context: TransactionContext,
  kind: ChangeKind,
  changeId: string,
): Promise<FinancialYearChangeRow | BillFormatChangeRow | undefined> {
  return kind === 'financial-year' ? financialYearChangeOf(context, changeId) : billFormatChangeOf(context, changeId);
}

type ValueChange = Extract<AuditChange, { kind: 'value' }>;
const value = (field: string, after: ValueChange['after'], before: ValueChange['before'] = null): ValueChange => ({
  kind: 'value',
  field,
  before,
  after,
});

/** What is done to a change, naming its audit operation, such as `withdraw-financial-year-change`. */
type ChangeAct = 'prepare' | 'withdraw' | 'approve' | 'reject';

/** Who an audit record names: the preparer, the person withdrawing, or the decider with the decision. */
type AuditedBy = Pick<EffectDecider, 'actor' | 'roleAssignmentId' | 'approvalDecisionId' | 'reason'>;

const byUser = (userId: string, roleAssignmentId: string | undefined): AuditedBy => ({
  actor: { kind: 'user', id: userId },
  ...(roleAssignmentId === undefined ? {} : { roleAssignmentId }),
});

/** The audit record of a change's preparation, withdrawal or decision (numbering-and-audit 4.1; PRD-ACS-013). */
async function auditChange(
  context: TransactionContext,
  audit: AuditInterface,
  by: AuditedBy,
  kind: ChangeKind,
  changeId: string,
  act: ChangeAct,
  changes: readonly AuditChange[],
): Promise<void> {
  await audit.record(context, {
    actor: by.actor,
    ...(by.roleAssignmentId === undefined ? {} : { roleAssignmentId: by.roleAssignmentId }),
    ...(by.approvalDecisionId === undefined ? {} : { approval: { decisionId: by.approvalDecisionId } }),
    ...(by.reason === undefined ? {} : { reason: by.reason }),
    record: { module: 'pos', type: CHANGES[kind].auditType, id: changeId, versionId: changeId },
    operation: `${act}-${kind}-change`,
    changes,
    source: { kind: 'screen' },
  });
}

/**
 * Whether a financial year can be defined now (numbering-and-audit 3.3): a label, a last day on or after its first, and
 * no year defined with that label or with dates it meets. `numbering` checks the same again when the change is approved.
 */
async function yearRefusal(
  context: TransactionContext,
  numbering: NumberingInterface,
  draft: { readonly label: string; readonly firstDay: string; readonly lastDay: string },
): Promise<Outcome<never> | undefined> {
  if (draft.label.trim() === '' || draft.lastDay < draft.firstDay) {
    return refused('refused', 'numbering.financial-year-invalid');
  }
  const years = await numbering.financialYears(context);
  if (years.some((year) => year.label === draft.label)) {
    return refused('refused', 'numbering.financial-year-label-taken');
  }
  if (years.some((year) => year.firstDay <= draft.lastDay && draft.firstDay <= year.lastDay)) {
    return refused('refused', 'numbering.financial-year-overlaps');
  }
  return undefined;
}

/**
 * Whether a bill-number format's parts can be set (numbering-and-audit 3.5): they pass `numbering`'s check for a yearly
 * kind, and carry a part taken from the device, so two devices of one registration and year never give the same text
 * ("a bill format must carry a part taken from the device"). Plain rules on parts frozen when prepared, so checked once.
 */
function partsRefusal(parts: readonly FormatPartView[]): Outcome<never> | undefined {
  const checked = checkFormat(parts, { yearly: BILL_KIND.yearly });
  if (checked !== undefined) return refused('refused', checked);
  if (!parts.some((part) => part.kind === 'scope')) return refused('refused', 'pos.bill-format-without-device');
  return undefined;
}

/**
 * Whether a bill-number format's code can be used (3.5): new, or naming the bill format in force, whose next version
 * it then becomes, never another kind's format. Checked when prepared and again under the locks when approved.
 */
async function codeRefusal(
  context: TransactionContext,
  numbering: NumberingInterface,
  formatCode: string,
): Promise<Outcome<never> | undefined> {
  if (!(await numbering.formatExists(context, formatCode))) return undefined;
  const inForce = await numbering.kindFormatOf(context, BILL_KIND.kind);
  return inForce.kind === 'set' && inForce.formatCode === formatCode
    ? undefined
    : refused('refused', 'pos.format-code-taken');
}

/** Freezes a change prepared, writes its audit record and puts it to a different authorised person (PRD-ACS-006). */
async function requestDecision(
  context: TransactionContext,
  dependencies: NumberingChangeDependencies,
  preparer: Preparer,
  kind: ChangeKind,
  changeId: string,
  changes: readonly AuditChange[],
): Promise<Outcome<{ readonly changeId: string; readonly requestId: string }>> {
  const { recordType, actionType } = CHANGES[kind];
  await auditChange(
    context,
    dependencies.audit,
    byUser(preparer.userId, preparer.roleAssignmentId),
    kind,
    changeId,
    'prepare',
    changes,
  );
  const requestId = await dependencies.access.requestApproval(context, {
    actionType,
    document: { module: 'pos', recordType, recordId: changeId, versionId: changeId },
    value: { kind: 'none' },
    preparers: [preparer.userId],
    requestedBy: preparer,
  });
  return { kind: 'success', answer: { changeId, requestId } };
}

/**
 * Prepare the change that defines a financial year (numbering-and-audit 3.3; offline-counter 4.3b): its label, first
 * and last day and their origin, checked now against the years defined; frozen, and put to a different authorised
 * person through Request approval, the preparer being its only preparer (PRD-ACS-006).
 */
export async function prepareFinancialYearChange(
  context: TransactionContext,
  dependencies: NumberingChangeDependencies,
  preparer: Preparer,
  draft: FinancialYearDraftInput,
): Promise<Outcome<{ readonly changeId: string; readonly requestId: string }>> {
  const origin = dependencies.origins.originRefusal(context, draft.origin);
  if (origin !== undefined) return { kind: 'refusal', refusal: origin };
  const blocked = await yearRefusal(context, dependencies.numbering, draft);
  if (blocked !== undefined) return blocked;
  const changeId = uuidv7();
  await context.tx.insert(financialYearChange).values({
    id: changeId,
    label: draft.label,
    firstDay: draft.firstDay,
    lastDay: draft.lastDay,
    origin: draft.origin,
    preparedByUserId: preparer.userId,
    roleAssignmentId: preparer.roleAssignmentId,
    preparedAt: context.startedAt,
  });
  return requestDecision(context, dependencies, preparer, 'financial-year', changeId, [
    value('label', draft.label),
    value('firstDay', draft.firstDay),
    value('lastDay', draft.lastDay),
    value('origin', draft.origin),
  ]);
}

/**
 * Prepare the change that sets the bill-number format (numbering-and-audit 3.5; POL-10.07; offline-counter 4.3b): its
 * code, parts and origin, checked now; frozen, and put to a different authorised person (PRD-ACS-006). The limit the
 * longest number must fit is the CA's (V-40), so none is checked here.
 */
export async function prepareBillFormatChange(
  context: TransactionContext,
  dependencies: NumberingChangeDependencies,
  preparer: Preparer,
  draft: BillFormatDraftInput,
): Promise<Outcome<{ readonly changeId: string; readonly requestId: string }>> {
  const origin = dependencies.origins.originRefusal(context, draft.origin);
  if (origin !== undefined) return { kind: 'refusal', refusal: origin };
  const blocked = partsRefusal(draft.parts) ?? (await codeRefusal(context, dependencies.numbering, draft.formatCode));
  if (blocked !== undefined) return blocked;
  const changeId = uuidv7();
  await context.tx.insert(billFormatChange).values({
    id: changeId,
    formatCode: draft.formatCode,
    parts: draft.parts,
    origin: draft.origin,
    preparedByUserId: preparer.userId,
    roleAssignmentId: preparer.roleAssignmentId,
    preparedAt: context.startedAt,
  });
  return requestDecision(context, dependencies, preparer, 'bill-format', changeId, [
    value('formatCode', draft.formatCode),
    value('parts', draft.parts),
    value('origin', draft.origin),
  ]);
}

/** Who withdraws a change: its preparer, or the person and the assignment through which they hold cancel (RR-489). */
export interface Withdrawer {
  readonly userId: string;
  readonly cancelHeldThrough?: string;
}

/** Who prepared a change, read before any lock: it is frozen when prepared (code-house-rules 7.1). */
export async function changePreparer(
  context: TransactionContext,
  kind: ChangeKind,
  changeId: string,
): Promise<string | undefined> {
  return (await changeOf(context, kind, changeId))?.preparedByUserId;
}

/**
 * Withdraw a change still awaiting its decision (offline-counter 4.3b; access-and-approvals 9.1a; RR-489; product
 * owner, 12 Oct 2026): its preparer may at any time without cancel, anyone else only holding cancel. The change and its
 * open request are locked at step 1, as Decide locks them, so a decision and a withdrawal never pass each other; the
 * request becomes Withdrawn and the change can no longer be decided. A change decided or withdrawn already is refused.
 */
export async function withdrawNumberingChange(
  context: TransactionContext,
  dependencies: NumberingChangeDependencies,
  by: Withdrawer,
  kind: ChangeKind,
  changeId: string,
): Promise<Outcome<{ readonly changeId: string }>> {
  const { lock, recordType, actionType } = CHANGES[kind];
  const document = { module: 'pos', actionType, recordType, recordId: changeId, versionId: changeId };
  const requests = await dependencies.access.requestLockTargets(context, document);
  const locked = await context.lock(LOCK_STEP.document, [
    { table: lock, id: changeId, mode: 'exclusive' },
    ...requests,
  ]);
  const change = locked.missing.some((each) => each.id === changeId)
    ? undefined
    : await changeOf(context, kind, changeId);
  if (change === undefined) return changeNotFound(recordType, changeId);
  // RR-489: the preparer withdraws their own; anyone else holds cancel.
  if (change.preparedByUserId !== by.userId && by.cancelHeldThrough === undefined) {
    return refused('not-authorised', 'access.not-authorised', [{ kind: 'permission', action: 'cancel', recordType }]);
  }
  const actor = {
    userId: by.userId,
    ...(by.cancelHeldThrough === undefined ? {} : { roleAssignmentId: by.cancelHeldThrough }),
  };
  if ((await dependencies.access.withdrawRequest(context, document, actor)) === 'not-open') {
    return refused('refused', 'pos.change-not-awaiting', [{ kind: 'record', recordType, recordId: changeId }]);
  }
  await auditChange(context, dependencies.audit, byUser(by.userId, by.cancelHeldThrough), kind, changeId, 'withdraw', [
    value('state', 'Withdrawn', 'Awaiting approval'),
  ]);
  return { kind: 'success', answer: { changeId } };
}

/**
 * Every change of a kind prepared, newest first, each with who prepared it and when, and the state of its latest
 * approval request and its identifier for the approval panel (access-and-approvals 9.1, 9.6; offline-counter 4.3b).
 */
async function changesOf<
  Row extends { id: string; origin: SettingOrigin; preparedByUserId: string; preparedAt: Date },
  View,
>(
  context: TransactionContext,
  access: NumberingChangeDependencies['access'],
  rows: readonly Row[],
  view: (row: Row) => View,
) {
  const requests = await access.approvalRequestsOf(
    context,
    rows.map((row) => row.id),
  );
  return rows.map((row) => {
    const request = requests.get(row.id);
    return {
      changeId: row.id,
      origin: row.origin,
      preparedByUserId: row.preparedByUserId,
      preparedAt: row.preparedAt.toISOString(),
      requestId: request?.id ?? null,
      state: request?.state ?? ('Awaiting approval' as const),
      ...view(row),
    };
  });
}

/** The financial years defined and every change prepared, newest first (offline-counter 4.3b). */
export async function financialYearList(
  context: TransactionContext,
  dependencies: NumberingChangeDependencies,
): Promise<FinancialYearList> {
  const rows = await context.tx.select().from(financialYearChange).orderBy(desc(financialYearChange.id));
  return {
    asOf: context.startedAt.toISOString(),
    years: await dependencies.numbering.financialYears(context),
    changes: await changesOf(context, dependencies.access, rows, (row) => ({
      label: row.label,
      firstDay: row.firstDay,
      lastDay: row.lastDay,
    })),
  };
}

/** The bill-number format in force, or not set, and every change prepared, newest first (offline-counter 4.3b). */
export async function billFormatRead(
  context: TransactionContext,
  dependencies: NumberingChangeDependencies,
): Promise<BillFormatRead> {
  const rows = await context.tx.select().from(billFormatChange).orderBy(desc(billFormatChange.id));
  return {
    asOf: context.startedAt.toISOString(),
    format: await dependencies.numbering.kindFormatDetail(context, BILL_KIND.kind),
    changes: await changesOf(context, dependencies.access, rows, (row) => ({
      formatCode: row.formatCode,
      parts: row.parts,
    })),
  };
}

/** The approval rules of the two changes (access-and-approvals 8): independent, with no value basis. */
export const numberingChangeRules: readonly ApprovalRule[] = Object.values(CHANGES).map((change) => ({
  actionType: change.actionType,
  module: 'pos',
  recordType: change.recordType,
  independent: true,
  value: 'none' as const,
  freeTextReason: false,
  decisionEvidenceClasses: [],
  synthetic: false,
}));

const changeNotFound = (recordType: string, recordId: string) =>
  refused('not-found', 'pos.change-not-found', [{ kind: 'record', recordType, recordId }]);

const BUSINESS_DATE_NOT_SET: Outcome<never> = {
  kind: 'refusal',
  refusal: {
    kind: 'unavailable',
    code: 'access.business-date-not-set',
    missing: [{ kind: 'setting', setting: 'configuration.timezone' }],
  },
};

/**
 * The series refusals an approval can meet while it defines the missing series (12.3): a format whose texts could
 * repeat another series' of the same display scope, and a live series defined meanwhile. Every other refusal of
 * `numbering` is impossible here, the format, the year, the kind and the device's code having been checked, so it is
 * a defect, never an answer the route does not declare.
 */
const SERIES_REFUSALS: readonly string[] = ['numbering.format-could-repeat', 'numbering.live-series-exists'];

/** Defines the missing series of every Active device for each date's financial year, in order (DEC-117). */
async function defineMissingSeriesOn(
  context: TransactionContext,
  numbering: NumberingInterface,
  dates: readonly string[],
): Promise<Outcome<{ readonly definedSeriesIds: string[] }>> {
  const definedSeriesIds: string[] = [];
  for (const date of dates) {
    const defined = await defineMissingSeries(context, numbering, date);
    if (defined.kind === 'refusal') {
      if (!SERIES_REFUSALS.includes(defined.refusal.code)) {
        throw new CommandDefect(`Defining the missing series was refused with ${defined.refusal.code}`);
      }
      return defined;
    }
    definedSeriesIds.push(...defined.answer.definedSeriesIds);
  }
  return { kind: 'success', answer: { definedSeriesIds } };
}

/** What an approval does to the setting, given the change and today: the audit changes it adds (offline-counter 4.3b). */
type Apply<Row> = (context: TransactionContext, change: Row, today: string) => Promise<Outcome<readonly AuditChange[]>>;

/**
 * What a decision does to a change (access-and-approvals 9.8b; offline-counter 4.3b): Decide locks the change,
 * `numbering`'s settings row and every billing device's rows at step 1 (code-house-rules 8.1, 8.2; DEC-117), so two
 * approvals of these settings serialise and each rechecks what the other wrote. Approved, the origin is rechecked
 * (code-house-rules 12.14), then `apply` takes the setting into force and defines the missing series. Rejected, nothing
 * but the audit record. `access` has already refused a decision by the preparer (PRD-ACS-006) and one on a withdrawn
 * request (9.1a).
 */
function changeEffect<Row extends FinancialYearChangeRow | BillFormatChangeRow>(
  dependencies: Omit<NumberingChangeDependencies, 'access'>,
  kind: ChangeKind,
  read: (context: TransactionContext, changeId: string) => Promise<Row | undefined>,
  apply: Apply<Row>,
): DocumentEffect {
  const { lock, recordType } = CHANGES[kind];
  return {
    async targets(context, changeId): Promise<LockTarget[]> {
      return [
        { table: lock, id: changeId, mode: 'exclusive' },
        ...(await dependencies.numbering.settingsLockTargets(context)),
        ...(await missingSeriesLockTargets(context)),
      ];
    },
    async approve(context, decider, changeId): Promise<EffectOutcome> {
      const change = await read(context, changeId);
      if (change === undefined) return changeNotFound(recordType, changeId);
      const date = await context.businessDate();
      if (date.kind === 'not-set') return BUSINESS_DATE_NOT_SET;
      const origin = dependencies.origins.originRefusal(context, change.origin);
      if (origin !== undefined) return { kind: 'refusal', refusal: origin };
      const applied = await apply(context, change, date.date);
      if (applied.kind === 'refusal') return applied;
      await auditChange(context, dependencies.audit, decider, kind, changeId, 'approve', [
        value('decision', 'Approved', 'Awaiting approval'),
        ...applied.answer,
      ]);
      return { kind: 'success', answer: { recordId: changeId } };
    },
    async reject(context, decider, changeId): Promise<EffectOutcome> {
      if ((await read(context, changeId)) === undefined) return changeNotFound(recordType, changeId);
      await auditChange(context, dependencies.audit, decider, kind, changeId, 'reject', [
        value('decision', 'Rejected', 'Awaiting approval'),
      ]);
      return { kind: 'success', answer: { recordId: changeId } };
    },
  };
}

/**
 * An approved financial year (numbering-and-audit 3.3): `numbering` defines it, refusing it again if it meets one
 * defined meanwhile; then every Active device gets its missing series for that year, from today or from the year's
 * first day, whichever is later, unless the year has ended (product owner, 12 Oct 2026).
 */
function applyFinancialYear(numbering: NumberingInterface): Apply<FinancialYearChangeRow> {
  return async (context, change, today) => {
    const defined = await numbering.defineFinancialYear(context, {
      label: change.label,
      firstDay: change.firstDay,
      lastDay: change.lastDay,
      origin: change.origin,
    });
    if (defined.kind === 'refused') return { kind: 'refusal', refusal: defined.refusal };
    const dates = change.lastDay < today ? [] : [change.firstDay > today ? change.firstDay : today];
    const series = await defineMissingSeriesOn(context, numbering, dates);
    if (series.kind === 'refusal') return series;
    return {
      kind: 'success',
      answer: [
        value('financialYearId', defined.value.financialYearId),
        value('seriesIds', series.answer.definedSeriesIds),
      ],
    };
  };
}

/**
 * An approved bill-number format (numbering-and-audit 3.5): its code is rechecked, `numbering` adds it, or its next
 * version, and sets it for the bill; a series already defined keeps its format for life. Then every Active device gets
 * its missing series for today's financial year and for each year defined that starts later (offline-counter 4.3:
 * each year's series is defined before the year starts; product owner, 12 Oct 2026).
 */
function applyBillFormat(numbering: NumberingInterface): Apply<BillFormatChangeRow> {
  return async (context, change, today) => {
    const taken = await codeRefusal(context, numbering, change.formatCode);
    if (taken !== undefined) return taken;
    const version = await numbering.defineFormatVersion(context, change.formatCode, change.parts);
    if (version.kind === 'refused') return { kind: 'refusal', refusal: version.refusal };
    const set = await numbering.setKindFormat(context, BILL_KIND.kind, change.formatCode, change.origin);
    // The bill is declared and the format was just defined, so a refusal here is a defect.
    if (set.kind === 'refused') throw new CommandDefect(`Setting the bill format was refused with ${set.refusal.code}`);
    const later = (await numbering.financialYears(context))
      .filter((year) => year.firstDay > today)
      .map((year) => year.firstDay);
    const series = await defineMissingSeriesOn(context, numbering, [today, ...later]);
    if (series.kind === 'refusal') return series;
    return {
      kind: 'success',
      answer: [value('formatVersionId', version.value.versionId), value('seriesIds', series.answer.definedSeriesIds)],
    };
  };
}

/**
 * The approval rules and decision effects `pos` declares to `access` (access-and-approvals 8, 9.8b; module-map section
 * 3, rule 6), which the composition root hands to `access` at start, with `numbering` built with every declared kind
 * and `configuration`'s origin check (code-house-rules 12.14).
 */
export function posApprovals(dependencies: Omit<NumberingChangeDependencies, 'access'>): ModuleApprovals {
  return {
    rules: numberingChangeRules,
    effects: new Map<string, DocumentEffect>([
      [
        FINANCIAL_YEAR_CHANGE_APPROVAL,
        changeEffect(dependencies, 'financial-year', financialYearChangeOf, applyFinancialYear(dependencies.numbering)),
      ],
      [
        BILL_FORMAT_CHANGE_APPROVAL,
        changeEffect(dependencies, 'bill-format', billFormatChangeOf, applyBillFormat(dependencies.numbering)),
      ],
    ]),
  };
}
