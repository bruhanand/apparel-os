import type { Paise } from '@apparel-os/domain';
import { DAMAGE_REPORT_TYPE, type MissingItem } from '@apparel-os/schemas';
import { asc, eq } from 'drizzle-orm';
import {
  LOCK_STEP,
  lockTable,
  type CommandRefusal,
  type LockTarget,
  type TransactionContext,
} from '../../../../kernel/index.js';
import type { RecordFacts } from '../../../access/index.js';
import type { AuditChange, AuditInterface, AuditScope } from '../../../audit/index.js';
import type { ItemValue } from '../../ledger/index.js';
import { damageDecision, damageReport, damageReversal, damageReversalDecision, damageRound } from '../db/schema.js';

// What every command and read of `stock` · documents shares (code-house-rules 8.1, 8.2, 12.3, 12.7).

/** A command's answer: its success, or a refusal naming what is missing (PRD-UXP-003). */
export type Outcome<Answer> =
  | { readonly kind: 'success'; readonly answer: Answer }
  | { readonly kind: 'refusal'; readonly refusal: CommandRefusal };

export const refusalOf = (refusal: CommandRefusal): Outcome<never> => ({ kind: 'refusal', refusal });

export function refused<Answer = never>(
  kind: CommandRefusal['kind'],
  code: string,
  missing: readonly MissingItem[] = [],
): Outcome<Answer> {
  return { kind: 'refusal', refusal: { kind, code, missing } };
}

/** Who acts: the signed-in person and the assignment Authorise used (access-and-approvals 7.1). */
export interface Actor {
  readonly userId: string;
  readonly roleAssignmentId: string;
}

/** The refusal while the Organisation has no timezone, so no business date (code-house-rules 9; PRD-SEC-017). */
export const BUSINESS_DATE_NOT_SET: CommandRefusal = {
  kind: 'unavailable',
  code: 'access.business-date-not-set',
  missing: [{ kind: 'setting', setting: 'configuration.timezone' }],
};

/** Today under the Organisation's timezone; the refusal while it has none. */
export async function today(context: TransactionContext): Promise<string | CommandRefusal> {
  const date = await context.businessDate();
  return date.kind === 'set' ? date.date : BUSINESS_DATE_NOT_SET;
}

/** A record named in a refusal (PRD-UXP-003). */
export const recordItem = (recordType: string, recordId: string): MissingItem => ({
  kind: 'record',
  recordType,
  recordId,
});

/** No report with that identifier, or none the actor may see (code-house-rules 6.2). */
export const reportNotFound = (reportId: string): CommandRefusal => ({
  kind: 'not-found',
  code: 'stock.record-not-found',
  missing: [recordItem(DAMAGE_REPORT_TYPE, reportId)],
});

export type ReportRow = typeof damageReport.$inferSelect;
export type RoundRow = typeof damageRound.$inferSelect;
export type DecisionRow = typeof damageDecision.$inferSelect;
export type ReversalRow = typeof damageReversal.$inferSelect;
export type ReversalDecisionRow = typeof damageReversalDecision.$inferSelect;
type Scoped = Pick<ReportRow, 'siteId' | 'storeId' | 'businessUnitId' | 'legalEntityId' | 'brandId'>;

/** The scope columns every row of a report carries: its place, legal entity and brand (code-house-rules 6.1). */
export function scopeColumns(row: Scoped): Scoped {
  return {
    siteId: row.siteId,
    storeId: row.storeId,
    businessUnitId: row.businessUnitId,
    legalEntityId: row.legalEntityId,
    brandId: row.brandId,
  };
}

/** The same as scope facts, which its routes authorise with (access-and-approvals 5.3), a Store only when it has one. */
export function factsOf(row: Scoped): RecordFacts & AuditScope {
  const { storeId, ...facts } = scopeColumns(row);
  return storeId === null ? facts : { ...facts, storeId };
}

/** The report's identity row as a lock target: every change of a report locks it at step 1 (code-house-rules 8.2). */
export const reportLock = (reportId: string): LockTarget => ({
  table: lockTable('stock', 'damage_report'),
  id: reportId,
  mode: 'exclusive',
});

/** The report as the actor may see it, or undefined (code-house-rules 6.2). */
export async function reportRow(context: TransactionContext, reportId: string): Promise<ReportRow | undefined> {
  const [row] = await context.tx.select().from(damageReport).where(eq(damageReport.id, reportId));
  return row;
}

/**
 * Locks a report's identity row exclusively at step 1 with any further targets of that step (code-house-rules 8.2), and
 * reads it under the lock; undefined when it does not exist or the actor may not see it.
 */
export async function lockReport(
  context: TransactionContext,
  reportId: string,
  further: readonly LockTarget[] = [],
): Promise<ReportRow | undefined> {
  const locked = await context.lock(LOCK_STEP.document, [reportLock(reportId), ...further]);
  if (locked.missing.some((each) => each.id === reportId)) return undefined;
  return reportRow(context, reportId);
}

/** A report's rounds, oldest first (goods-in 8.5). */
export async function roundsOf(context: TransactionContext, reportId: string): Promise<RoundRow[]> {
  return context.tx
    .select()
    .from(damageRound)
    .where(eq(damageRound.damageReportId, reportId))
    .orderBy(asc(damageRound.roundNumber));
}

/** A report's decisions, by round. */
export async function decisionsOf(context: TransactionContext, reportId: string): Promise<DecisionRow[]> {
  return context.tx.select().from(damageDecision).where(eq(damageDecision.damageReportId, reportId));
}

/** A report's reversals, oldest first, each with its decision when made. */
export async function reversalsOf(
  context: TransactionContext,
  reportId: string,
): Promise<{ readonly reversal: ReversalRow; readonly decision: ReversalDecisionRow | null }[]> {
  const rows = await context.tx
    .select({ reversal: damageReversal, decision: damageReversalDecision })
    .from(damageReversal)
    .leftJoin(damageReversalDecision, eq(damageReversalDecision.damageReversalId, damageReversal.id))
    .where(eq(damageReversal.damageReportId, reportId))
    .orderBy(asc(damageReversal.id));
  return rows;
}

/** The value a request carries on its basis: the ledger's value of the goods, never zero for Unknown (PRD-ACS-016). */
export function requestValueOf(
  value: ItemValue,
): { readonly kind: 'unknown' } | { readonly kind: 'known'; readonly amountPaise: Paise } {
  return value.kind === 'known' ? { kind: 'known', amountPaise: value.amountPaise } : { kind: 'unknown' };
}

type ValueChange = Extract<AuditChange, { kind: 'value' }>;

/** A field's value before and after a change, as its audit record keeps it (numbering-and-audit 4.1). */
export const valueChange = (
  field: string,
  before: ValueChange['before'],
  after: ValueChange['after'],
): ValueChange => ({ kind: 'value', field, before, after });

/**
 * The audit record of a change to a report, scoped as the report is (numbering-and-audit 4.1; PRD-MOD-006): the record
 * changed, the operation, the fields changed, and where a decision made it, the decision and its reason.
 */
export async function audited(
  context: TransactionContext,
  audit: AuditInterface,
  actor: Actor,
  row: Scoped,
  change: {
    readonly record: { readonly type: string; readonly id: string; readonly versionId?: string };
    readonly operation: string;
    readonly changes: readonly ValueChange[];
    readonly idempotencyKey?: string;
    readonly approval?: { readonly decisionId: string };
    readonly reason?: string;
  },
): Promise<void> {
  await audit.record(context, {
    actor: { kind: 'user', id: actor.userId },
    roleAssignmentId: actor.roleAssignmentId,
    scope: factsOf(row),
    record: { module: 'stock', ...change.record },
    operation: change.operation,
    changes: change.changes,
    source: { kind: 'screen' },
    ...(change.idempotencyKey === undefined ? {} : { idempotencyKey: change.idempotencyKey }),
    ...(change.approval === undefined ? {} : { approval: change.approval }),
    ...(change.reason === undefined ? {} : { reason: change.reason }),
  });
}
