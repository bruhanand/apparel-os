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
} from '@apparel-os/schemas';
import { desc, eq } from 'drizzle-orm';
import { lockTable, type CommandRefusal, type LockTarget, type TransactionContext } from '../../../kernel/index.js';
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
import { checkFormat, type FormatPart, type NumberingInterface } from '../../numbering/index.js';
import { billFormatChange, financialYearChange } from '../db/schema.js';
import { BILL_KIND } from '../domain/kinds.js';
import { defineMissingSeries, missingSeriesLockTargets, refused, type Outcome } from './devices.js';

// The financial years and the bill-number format (offline-counter 4.1, 4.3b; numbering-and-audit 3.3, 3.5;
// access-and-approvals 9.8b; PRD-ACS-006, PRD-POS-020, PRD-OFF-002, POL-02.03, POL-10.07; DEC-116, DEC-117;
// S1-F12-T03). Two Organisation settings `numbering` keeps, each changed by a change `pos` keeps: prepared by one person
// and decided by a different one through access's Request approval and Decide (product owner, 10 Oct 2026). The
// approval takes the setting into force and gives every Active billing device its missing series in the decision's
// own transaction, holding every device's rows at step 1 with the change (code-house-rules 8.2). No value is chosen
// here: the dates are OPEN (GC5-1, RR-060) and the format is OPEN (V-40, RR-101); the preparer states every value and
// its origin (code-house-rules 12.14).

/** The change rows Decide locks at step 1 (code-house-rules 8.2). */
const FINANCIAL_YEAR_CHANGE_TABLE = lockTable('pos', 'financial_year_change');
const BILL_FORMAT_CHANGE_TABLE = lockTable('pos', 'bill_format_change');

export interface NumberingChangeDependencies {
  readonly audit: AuditInterface;
  readonly access: Pick<AccessInterface, 'requestApproval' | 'approvalRequestsOf'>;
  readonly origins: Pick<ConfigurationInterface, 'originRefusal'>;
  readonly numbering: NumberingInterface;
}

type ValueChange = Extract<AuditChange, { kind: 'value' }>;
const value = (field: string, after: ValueChange['after'], before: ValueChange['before'] = null): ValueChange => ({
  kind: 'value',
  field,
  before,
  after,
});

/** A refusal of `numbering` as the command's refusal, with the code it names. */
function numberingRefusal(refusal: CommandRefusal): Outcome<never> {
  return { kind: 'refusal', refusal };
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
 * Whether a bill-number format can be set (numbering-and-audit 3.5): its parts pass `numbering`'s check for a yearly
 * kind; it carries a part taken from the device, so two devices of one registration and year never give the same text
 * ("a bill format must carry a part taken from the device"); and its code is new, or names the bill format in force,
 * whose next version it then becomes, never another kind's format.
 */
async function formatRefusal(
  context: TransactionContext,
  numbering: NumberingInterface,
  draft: { readonly formatCode: string; readonly parts: readonly FormatPart[] },
): Promise<Outcome<never> | undefined> {
  const checked = checkFormat(draft.parts, { yearly: BILL_KIND.yearly });
  if (checked !== undefined) return refused('refused', checked);
  if (!draft.parts.some((part) => part.kind === 'scope')) return refused('refused', 'pos.bill-format-without-device');
  if (await numbering.formatExists(context, draft.formatCode)) {
    const inForce = await numbering.kindFormatOf(context, BILL_KIND.kind);
    if (inForce.kind !== 'set' || inForce.formatCode !== draft.formatCode) {
      return refused('refused', 'pos.format-code-taken');
    }
  }
  return undefined;
}

async function auditPrepared(
  context: TransactionContext,
  audit: AuditInterface,
  preparer: Preparer,
  record: { readonly type: string; readonly id: string },
  operation: string,
  changes: readonly AuditChange[],
): Promise<void> {
  await audit.record(context, {
    actor: { kind: 'user', id: preparer.userId },
    roleAssignmentId: preparer.roleAssignmentId,
    record: { module: 'pos', type: record.type, id: record.id, versionId: record.id },
    operation,
    changes,
    source: { kind: 'screen' },
  });
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
  await auditPrepared(
    context,
    dependencies.audit,
    preparer,
    { type: 'financial_year_change', id: changeId },
    'prepare-financial-year-change',
    [
      value('label', draft.label),
      value('firstDay', draft.firstDay),
      value('lastDay', draft.lastDay),
      value('origin', draft.origin),
    ],
  );
  const requestId = await dependencies.access.requestApproval(context, {
    actionType: FINANCIAL_YEAR_CHANGE_APPROVAL,
    document: { module: 'pos', recordType: FINANCIAL_YEAR_CHANGE_TYPE, recordId: changeId, versionId: changeId },
    value: { kind: 'none' },
    preparers: [preparer.userId],
    requestedBy: preparer,
  });
  return { kind: 'success', answer: { changeId, requestId } };
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
  const blocked = await formatRefusal(context, dependencies.numbering, draft);
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
  await auditPrepared(
    context,
    dependencies.audit,
    preparer,
    { type: 'bill_format_change', id: changeId },
    'prepare-bill-format-change',
    [value('formatCode', draft.formatCode), value('parts', draft.parts), value('origin', draft.origin)],
  );
  const requestId = await dependencies.access.requestApproval(context, {
    actionType: BILL_FORMAT_CHANGE_APPROVAL,
    document: { module: 'pos', recordType: BILL_FORMAT_CHANGE_TYPE, recordId: changeId, versionId: changeId },
    value: { kind: 'none' },
    preparers: [preparer.userId],
    requestedBy: preparer,
  });
  return { kind: 'success', answer: { changeId, requestId } };
}

/** The state of each change's latest approval request, and its identifier for the approval panel (9.1, 9.6). */
async function requestsOf(
  context: TransactionContext,
  access: NumberingChangeDependencies['access'],
  changeIds: readonly string[],
) {
  const requests = await access.approvalRequestsOf(context, changeIds);
  return (changeId: string) => {
    const request = requests.get(changeId);
    return { requestId: request?.id ?? null, state: request?.state ?? ('Awaiting approval' as const) };
  };
}

/** The financial years defined and every change prepared, newest first (offline-counter 4.3b). */
export async function financialYearList(
  context: TransactionContext,
  dependencies: NumberingChangeDependencies,
): Promise<FinancialYearList> {
  const changes = await context.tx.select().from(financialYearChange).orderBy(desc(financialYearChange.id));
  const request = await requestsOf(
    context,
    dependencies.access,
    changes.map((each) => each.id),
  );
  return {
    asOf: context.startedAt.toISOString(),
    years: await dependencies.numbering.financialYears(context),
    changes: changes.map((each) => ({
      changeId: each.id,
      label: each.label,
      firstDay: each.firstDay,
      lastDay: each.lastDay,
      origin: each.origin,
      preparedByUserId: each.preparedByUserId,
      preparedAt: each.preparedAt.toISOString(),
      ...request(each.id),
    })),
  };
}

/** The bill-number format in force, or not set, and every change prepared, newest first (offline-counter 4.3b). */
export async function billFormatRead(
  context: TransactionContext,
  dependencies: NumberingChangeDependencies,
): Promise<BillFormatRead> {
  const changes = await context.tx.select().from(billFormatChange).orderBy(desc(billFormatChange.id));
  const request = await requestsOf(
    context,
    dependencies.access,
    changes.map((each) => each.id),
  );
  return {
    asOf: context.startedAt.toISOString(),
    format: await dependencies.numbering.kindFormatDetail(context, BILL_KIND.kind),
    changes: changes.map((each) => ({
      changeId: each.id,
      formatCode: each.formatCode,
      parts: each.parts,
      origin: each.origin,
      preparedByUserId: each.preparedByUserId,
      preparedAt: each.preparedAt.toISOString(),
      ...request(each.id),
    })),
  };
}

/** The approval rules of the two changes (access-and-approvals 8): independent, with no value basis. */
export const numberingChangeRules: readonly ApprovalRule[] = [
  {
    actionType: FINANCIAL_YEAR_CHANGE_APPROVAL,
    module: 'pos',
    recordType: FINANCIAL_YEAR_CHANGE_TYPE,
    independent: true,
    value: 'none',
    freeTextReason: false,
    decisionEvidenceClasses: [],
    synthetic: false,
  },
  {
    actionType: BILL_FORMAT_CHANGE_APPROVAL,
    module: 'pos',
    recordType: BILL_FORMAT_CHANGE_TYPE,
    independent: true,
    value: 'none',
    freeTextReason: false,
    decisionEvidenceClasses: [],
    synthetic: false,
  },
];

async function auditDecided(
  context: TransactionContext,
  audit: AuditInterface,
  decider: EffectDecider,
  record: { readonly type: string; readonly id: string },
  operation: string,
  changes: readonly AuditChange[],
): Promise<void> {
  await audit.record(context, {
    actor: decider.actor,
    ...(decider.roleAssignmentId === undefined ? {} : { roleAssignmentId: decider.roleAssignmentId }),
    ...(decider.approvalDecisionId === undefined ? {} : { approval: { decisionId: decider.approvalDecisionId } }),
    ...(decider.reason === undefined ? {} : { reason: decider.reason }),
    record: { module: 'pos', type: record.type, id: record.id, versionId: record.id },
    operation,
    changes,
    source: { kind: 'screen' },
  });
}

const changeNotFound = (recordType: string, recordId: string) =>
  refused('not-found', 'pos.change-not-found', [{ kind: 'record', recordType, recordId }]);

/** Today's business date, under the Organisation's timezone (code-house-rules 9). */
async function today(context: TransactionContext): Promise<string | undefined> {
  const date = await context.businessDate();
  return date.kind === 'set' ? date.date : undefined;
}

const BUSINESS_DATE_NOT_SET: Outcome<never> = {
  kind: 'refusal',
  refusal: {
    kind: 'unavailable',
    code: 'access.business-date-not-set',
    missing: [{ kind: 'setting', setting: 'configuration.timezone' }],
  },
};

/** Defines the missing series of every Active device for each date's financial year, in order (DEC-117). */
async function defineMissingSeriesOn(
  context: TransactionContext,
  numbering: NumberingInterface,
  dates: readonly string[],
): Promise<Outcome<{ readonly definedSeriesIds: string[] }>> {
  const definedSeriesIds: string[] = [];
  for (const date of dates) {
    const defined = await defineMissingSeries(context, numbering, date);
    if (defined.kind === 'refusal') return defined;
    definedSeriesIds.push(...defined.answer.definedSeriesIds);
  }
  return { kind: 'success', answer: { definedSeriesIds } };
}

/**
 * What a decision does to a financial-year change (access-and-approvals 9.8b; offline-counter 4.3b): Decide locks the
 * change and every billing device's rows at step 1 (DEC-117; code-house-rules 8.2). Approved, `numbering` defines the
 * year, refusing it again if it meets one defined meanwhile; then every Active device gets its missing series for that
 * year, from today or from the year's first day, whichever is later, unless the year has ended. Rejected, nothing but
 * the audit record. `access` has already refused a decision by its preparer (PRD-ACS-006).
 */
function financialYearEffect(audit: AuditInterface, numbering: NumberingInterface): DocumentEffect {
  return {
    async targets(context, changeId): Promise<LockTarget[]> {
      return [
        { table: FINANCIAL_YEAR_CHANGE_TABLE, id: changeId, mode: 'exclusive' },
        ...(await missingSeriesLockTargets(context)),
      ];
    },
    async approve(context, decider, changeId): Promise<EffectOutcome> {
      const [change] = await context.tx.select().from(financialYearChange).where(eq(financialYearChange.id, changeId));
      if (change === undefined) return changeNotFound(FINANCIAL_YEAR_CHANGE_TYPE, changeId);
      const date = await today(context);
      if (date === undefined) return BUSINESS_DATE_NOT_SET;
      const defined = await numbering.defineFinancialYear(context, {
        label: change.label,
        firstDay: change.firstDay,
        lastDay: change.lastDay,
        origin: change.origin,
      });
      if (defined.kind === 'refused') return numberingRefusal(defined.refusal);
      const series =
        change.lastDay < date
          ? { kind: 'success' as const, answer: { definedSeriesIds: [] as string[] } }
          : await defineMissingSeriesOn(context, numbering, [change.firstDay > date ? change.firstDay : date]);
      if (series.kind === 'refusal') return series;
      await auditDecided(
        context,
        audit,
        decider,
        { type: 'financial_year_change', id: changeId },
        'approve-financial-year-change',
        [
          value('decision', 'Approved', 'Awaiting approval'),
          value('financialYearId', defined.value.financialYearId),
          value('seriesIds', series.answer.definedSeriesIds),
        ],
      );
      return { kind: 'success', answer: { recordId: changeId } };
    },
    async reject(context, decider, changeId): Promise<EffectOutcome> {
      const [change] = await context.tx
        .select({ id: financialYearChange.id })
        .from(financialYearChange)
        .where(eq(financialYearChange.id, changeId));
      if (change === undefined) return changeNotFound(FINANCIAL_YEAR_CHANGE_TYPE, changeId);
      await auditDecided(
        context,
        audit,
        decider,
        { type: 'financial_year_change', id: changeId },
        'reject-financial-year-change',
        [value('decision', 'Rejected', 'Awaiting approval')],
      );
      return { kind: 'success', answer: { recordId: changeId } };
    },
  };
}

/**
 * What a decision does to a bill-format change (access-and-approvals 9.8b; offline-counter 4.3b): Decide locks the
 * change and every billing device's rows at step 1. Approved, the format is checked again, `numbering` adds it, or its
 * next version, and sets it for the bill; a series already defined keeps its format for life (numbering-and-audit 3.5).
 * Then every Active device gets its missing series for today's financial year and for each year defined that starts
 * later (offline-counter 4.3: each year's series is defined before the year starts). Rejected, nothing but the audit
 * record.
 */
function billFormatEffect(audit: AuditInterface, numbering: NumberingInterface): DocumentEffect {
  return {
    async targets(context, changeId): Promise<LockTarget[]> {
      return [
        { table: BILL_FORMAT_CHANGE_TABLE, id: changeId, mode: 'exclusive' },
        ...(await missingSeriesLockTargets(context)),
      ];
    },
    async approve(context, decider, changeId): Promise<EffectOutcome> {
      const [change] = await context.tx.select().from(billFormatChange).where(eq(billFormatChange.id, changeId));
      if (change === undefined) return changeNotFound(BILL_FORMAT_CHANGE_TYPE, changeId);
      const date = await today(context);
      if (date === undefined) return BUSINESS_DATE_NOT_SET;
      const blocked = await formatRefusal(context, numbering, change);
      if (blocked !== undefined) return blocked;
      const version = await numbering.defineFormatVersion(context, change.formatCode, change.parts);
      if (version.kind === 'refused') return numberingRefusal(version.refusal);
      const set = await numbering.setKindFormat(context, BILL_KIND.kind, change.formatCode, change.origin);
      if (set.kind === 'refused') return numberingRefusal(set.refusal);
      const later = (await numbering.financialYears(context))
        .filter((year) => year.firstDay > date)
        .map((year) => year.firstDay);
      const series = await defineMissingSeriesOn(context, numbering, [date, ...later]);
      if (series.kind === 'refusal') return series;
      await auditDecided(
        context,
        audit,
        decider,
        { type: 'bill_format_change', id: changeId },
        'approve-bill-format-change',
        [
          value('decision', 'Approved', 'Awaiting approval'),
          value('formatVersionId', version.value.versionId),
          value('seriesIds', series.answer.definedSeriesIds),
        ],
      );
      return { kind: 'success', answer: { recordId: changeId } };
    },
    async reject(context, decider, changeId): Promise<EffectOutcome> {
      const [change] = await context.tx
        .select({ id: billFormatChange.id })
        .from(billFormatChange)
        .where(eq(billFormatChange.id, changeId));
      if (change === undefined) return changeNotFound(BILL_FORMAT_CHANGE_TYPE, changeId);
      await auditDecided(
        context,
        audit,
        decider,
        { type: 'bill_format_change', id: changeId },
        'reject-bill-format-change',
        [value('decision', 'Rejected', 'Awaiting approval')],
      );
      return { kind: 'success', answer: { recordId: changeId } };
    },
  };
}

/**
 * The approval rules and decision effects `pos` declares to `access` (access-and-approvals 8, 9.8b; module-map section
 * 3, rule 6), which the composition root hands to `access` at start, with `numbering` built with every declared kind.
 */
export function posApprovals(dependencies: {
  readonly audit: AuditInterface;
  readonly numbering: NumberingInterface;
}): ModuleApprovals {
  return {
    rules: numberingChangeRules,
    effects: new Map<string, DocumentEffect>([
      [FINANCIAL_YEAR_CHANGE_APPROVAL, financialYearEffect(dependencies.audit, dependencies.numbering)],
      [BILL_FORMAT_CHANGE_APPROVAL, billFormatEffect(dependencies.audit, dependencies.numbering)],
    ]),
  };
}
