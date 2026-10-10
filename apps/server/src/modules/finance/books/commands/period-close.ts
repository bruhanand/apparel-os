import { uuidv7 } from '@apparel-os/domain';
import {
  FINANCIAL_PERIOD_TYPE,
  PERIOD_REOPENING_APPROVAL,
  PERIOD_REOPENING_TYPE,
  type MissingItem,
  type NamedCorrection,
  type ReopeningDraft,
} from '@apparel-os/schemas';
import { and, eq, lt, notExists, sql } from 'drizzle-orm';
import { LOCK_STEP, lockTable, type LockTarget, type TransactionContext } from '../../../../kernel/index.js';
import type { AccessInterface, DocumentEffect, EffectOutcome, Preparer } from '../../../access/index.js';
import type { AuditChange, AuditInterface } from '../../../audit/index.js';
import { financialPeriod, periodEvent, periodReopening, periodReopeningSource } from '../db/schema.js';
import { periodLocked, periodReopened } from '../events.js';
import { openCorrections, PERIOD_TABLE, periodById, type PeriodRow } from '../queries/periods.js';
import { byText } from '../domain/order.js';
import { refused, type Outcome } from './lines.js';

// Lock a period, request, approve and withdraw a reopening (books-and-posting 4.2, 4.3, 4.5, 9.1; PRD-LED-009,
// PRD-LED-019, PRD-LED-020, PRD-INT-003; DEC-106, DEC-107; S1-F09-T03). Every change is a period event or a frozen
// reopening, append-only; the state is their projection (queries/periods.ts). Locking a period, approving a reopening
// and withdrawing one take the period row in exclusive mode at step 7, so each waits for the postings holding it in
// shared mode, and a posting that comes after sees the new state under its lock (4.5). Who may lock, request, approve
// and withdraw is KDPS's (V-01): the permissions the routes name are the mechanism.

/** The reopening row Decide and a withdrawal lock at step 1 (code-house-rules 8.2). */
export const REOPENING_TABLE = lockTable('finance', 'period_reopening');

type ValueChange = Extract<AuditChange, { kind: 'value' }>;
const value = (field: string, after: ValueChange['after'], before: ValueChange['before'] = null): ValueChange => ({
  kind: 'value',
  field,
  before,
  after,
});

/** The item naming a period in a refusal, by its identifier and code, so a screen can name it (14; PRD-UXP-003). */
export const periodItem = (period: { readonly id: string; readonly code: string }): MissingItem => ({
  kind: 'financial-period',
  periodId: period.id,
  code: period.code,
});

const notFound = (recordType: string, recordId: string) =>
  refused<never>('not-found', 'finance.record-not-found', [{ kind: 'record', recordType, recordId }]);

export interface PeriodCloseDependencies {
  readonly audit: AuditInterface;
  readonly access: Pick<AccessInterface, 'requestApproval' | 'requestLockTargets' | 'withdrawRequest'>;
}

async function auditBy(
  context: TransactionContext,
  audit: AuditInterface,
  preparer: { readonly userId: string; readonly roleAssignmentId?: string },
  record: { readonly type: string; readonly id: string },
  operation: string,
  changes: readonly AuditChange[],
): Promise<void> {
  await audit.record(context, {
    actor: { kind: 'user', id: preparer.userId },
    ...(preparer.roleAssignmentId === undefined ? {} : { roleAssignmentId: preparer.roleAssignmentId }),
    record: { module: 'finance', ...record },
    operation,
    changes,
    source: { kind: 'screen' },
  });
}

/** Takes the period row exclusively at step 7 and reads it again under the lock (4.5; code-house-rules 8.1). */
async function holdExclusively(context: TransactionContext, periodId: string): Promise<PeriodRow | undefined> {
  const locked = await context.lock(LOCK_STEP.financialPeriod, [
    { table: PERIOD_TABLE, id: periodId, mode: 'exclusive' },
  ]);
  if (locked.missing.length > 0) return undefined;
  return periodById(context, periodId);
}

/**
 * Lock a period (4.2; PRD-LED-009): Open, and every earlier period of its book locked already, Locked or Reopened.
 * Writes the `locked` event and emits `finance.period-locked`.
 */
export async function lockPeriod(
  context: TransactionContext,
  dependencies: PeriodCloseDependencies,
  preparer: Preparer,
  periodId: string,
): Promise<Outcome<{ periodId: string }>> {
  const period = await holdExclusively(context, periodId);
  if (period === undefined) return notFound(FINANCIAL_PERIOD_TYPE, periodId);
  if (period.state !== 'Open') return refused('refused', 'finance.period-not-open', [periodItem(period)]);
  // 4.2: periods lock in date order. An earlier period's lock never goes away, so it needs no lock of its own here.
  const [earlier] = await context.tx
    .select({ id: financialPeriod.id, code: financialPeriod.code })
    .from(financialPeriod)
    .where(
      and(
        eq(financialPeriod.bookId, period.bookId),
        lt(sql`lower(${financialPeriod.dates})`, sql`${period.firstDay}::date`),
        notExists(
          context.tx
            .select({ id: periodEvent.id })
            .from(periodEvent)
            .where(and(eq(periodEvent.financialPeriodId, financialPeriod.id), eq(periodEvent.kind, 'locked'))),
        ),
      ),
    )
    .orderBy(sql`lower(${financialPeriod.dates})`)
    .limit(1);
  if (earlier !== undefined) return refused('refused', 'finance.earlier-period-open', [periodItem(earlier)]);
  await context.tx.insert(periodEvent).values({
    id: uuidv7(),
    financialPeriodId: period.id,
    kind: 'locked',
    byUserId: preparer.userId,
    roleAssignmentId: preparer.roleAssignmentId,
    occurredAt: context.startedAt,
  });
  await auditBy(context, dependencies.audit, preparer, { type: 'financial_period', id: period.id }, 'lock-period', [
    value('state', 'Locked', 'Open'),
  ]);
  await context.publish(periodLocked, {
    subject: { module: 'finance', recordType: FINANCIAL_PERIOD_TYPE, recordId: period.id },
    payload: { periodId: period.id, bookId: period.bookId },
  });
  return { kind: 'success', answer: { periodId: period.id } };
}

/** The corrections named, each once, in a stable order. */
function distinct(corrections: readonly NamedCorrection[]): NamedCorrection[] {
  const seen = new Map<string, NamedCorrection>();
  for (const each of corrections) seen.set(`${each.module}|${each.recordType}|${each.recordId}`, each);
  return [...seen.entries()].sort(([a], [b]) => byText(a, b)).map(([, each]) => each);
}

/**
 * Request a reopening (4.3 step 1; PRD-LED-019, PRD-LED-020): of a Locked or Reopened period, with its reason and at
 * least one named correction, frozen as made; a different authorised person decides it through `access`, the
 * requester being its preparer (PRD-ACS-006, PRD-ACS-007; DEC-106). Several may be in force at once (4.3 step 5).
 */
export async function requestReopening(
  context: TransactionContext,
  dependencies: PeriodCloseDependencies,
  preparer: Preparer,
  periodId: string,
  draft: ReopeningDraft,
): Promise<Outcome<{ reopeningId: string; requestId: string }>> {
  const corrections = distinct(draft.corrections);
  // PRD-LED-020: a reopening names the corrections it is for.
  if (corrections.length === 0) {
    return refused('refused', 'finance.no-correction-named', [
      { kind: 'record', recordType: FINANCIAL_PERIOD_TYPE, recordId: periodId },
    ]);
  }
  // Shared at step 7, so the state read is the one under the lock (code-house-rules 8.1).
  const held = await context.lock(LOCK_STEP.financialPeriod, [{ table: PERIOD_TABLE, id: periodId, mode: 'shared' }]);
  const period = held.missing.length > 0 ? undefined : await periodById(context, periodId);
  if (period === undefined) return notFound(FINANCIAL_PERIOD_TYPE, periodId);
  if (period.state === 'Open') return refused('refused', 'finance.period-not-locked', [periodItem(period)]);
  const reopeningId = uuidv7();
  await context.tx.insert(periodReopening).values({
    id: reopeningId,
    financialPeriodId: period.id,
    reason: draft.reason,
    requestedByUserId: preparer.userId,
    roleAssignmentId: preparer.roleAssignmentId,
    occurredAt: context.startedAt,
  });
  await context.tx.insert(periodReopeningSource).values(
    corrections.map((each) => ({
      id: uuidv7(),
      periodReopeningId: reopeningId,
      sourceModule: each.module,
      sourceRecordType: each.recordType,
      sourceRecordId: each.recordId,
    })),
  );
  await auditBy(
    context,
    dependencies.audit,
    preparer,
    { type: 'period_reopening', id: reopeningId },
    'request-reopening',
    [
      value('periodId', period.id),
      value('reason', draft.reason),
      value(
        'corrections',
        corrections.map((each) => ({ module: each.module, recordType: each.recordType, recordId: each.recordId })),
      ),
    ],
  );
  // The reopening is its own version: adding a correction is a new request (4.3 step 2). Request approval takes no
  // lock step after step 7 (code-house-rules 8.2): it inserts the request, and the only rows it changes, an open
  // request on an earlier version of the same document, cannot exist for a reopening written just now.
  const requestId = await dependencies.access.requestApproval(context, {
    actionType: PERIOD_REOPENING_APPROVAL,
    document: { module: 'finance', recordType: PERIOD_REOPENING_TYPE, recordId: reopeningId, versionId: reopeningId },
    value: { kind: 'none' },
    preparers: [preparer.userId],
    requestedBy: preparer,
  });
  return { kind: 'success', answer: { reopeningId, requestId } };
}

/** A reopening with its period, and its decision and withdrawal so far. */
async function reopeningOf(context: TransactionContext, reopeningId: string) {
  const [row] = await context.tx.select().from(periodReopening).where(eq(periodReopening.id, reopeningId));
  if (row === undefined) return undefined;
  const events = await context.tx
    .select({ kind: periodEvent.kind })
    .from(periodEvent)
    .where(eq(periodEvent.periodReopeningId, reopeningId));
  const kinds = new Set(events.map((each) => each.kind));
  return {
    ...row,
    decided: kinds.has('reopening-approved') || kinds.has('reopening-rejected'),
    approved: kinds.has('reopening-approved'),
    withdrawn: kinds.has('reopening-withdrawn'),
  };
}

/**
 * Who withdraws a reopening (4.3 step 4; RR-489, product owner, 10 Oct 2026): its requester, who needs no permission
 * for their own; anyone else holds cancel on `finance.period_reopening`, through the assignment named, which the
 * caller has authorised and holds at step 0.
 */
export interface Withdrawer {
  readonly userId: string;
  readonly cancelHeldThrough?: string;
}

/** The requester of a reopening, read before any lock: it is frozen when the reopening is requested. */
export async function reopeningRequester(context: TransactionContext, reopeningId: string) {
  const [row] = await context.tx
    .select({ userId: periodReopening.requestedByUserId })
    .from(periodReopening)
    .where(eq(periodReopening.id, reopeningId));
  return row?.userId;
}

const reopeningDocument = (reopeningId: string) =>
  ({
    module: 'finance',
    recordType: PERIOD_REOPENING_TYPE,
    recordId: reopeningId,
    versionId: reopeningId,
    actionType: PERIOD_REOPENING_APPROVAL,
  }) as const;

/**
 * Withdraw a reopening (4.3 step 4; PRD-LED-020; RR-489, product owner, 10 Oct 2026): one still awaiting its decision,
 * whose request `access` then closes as Withdrawn, or one in force (approved, not withdrawn, a correction still to
 * post). Its requester may withdraw it at any time without cancel; anyone else needs cancel. The reopening and its
 * open request are locked at step 1, as Decide locks them, so a decision and a withdrawal never pass each other; one
 * in force takes the period row exclusively at step 7, as its approval does, so a posting in flight on the correction
 * ends first and one after sees the period Locked again (4.5). **Design choice.**
 */
export async function withdrawReopening(
  context: TransactionContext,
  dependencies: PeriodCloseDependencies,
  by: Withdrawer,
  reopeningId: string,
): Promise<Outcome<{ reopeningId: string }>> {
  const document = reopeningDocument(reopeningId);
  const requests = await dependencies.access.requestLockTargets(context, document);
  const locked = await context.lock(LOCK_STEP.document, [
    { table: REOPENING_TABLE, id: reopeningId, mode: 'exclusive' },
    ...requests,
  ]);
  if (locked.missing.some((each) => each.id === reopeningId)) return notFound(PERIOD_REOPENING_TYPE, reopeningId);
  const reopening = await reopeningOf(context, reopeningId);
  if (reopening === undefined) return notFound(PERIOD_REOPENING_TYPE, reopeningId);
  // RR-489: the requester withdraws their own; anyone else holds cancel.
  if (reopening.requestedByUserId !== by.userId && by.cancelHeldThrough === undefined) {
    return refused('not-authorised', 'access.not-authorised', [
      { kind: 'permission', action: 'cancel', recordType: PERIOD_REOPENING_TYPE },
    ]);
  }
  const notInForce = refused<{ reopeningId: string }>('refused', 'finance.reopening-not-in-force', [
    { kind: 'record', recordType: PERIOD_REOPENING_TYPE, recordId: reopeningId },
  ]);
  if (reopening.withdrawn || (reopening.decided && !reopening.approved)) return notInForce;
  const actor = {
    userId: by.userId,
    ...(by.cancelHeldThrough === undefined ? {} : { roleAssignmentId: by.cancelHeldThrough }),
  };
  let period: PeriodRow | undefined;
  let before: string;
  if (reopening.approved) {
    period = await holdExclusively(context, reopening.financialPeriodId);
    if (period === undefined) return notFound(FINANCIAL_PERIOD_TYPE, reopening.financialPeriodId);
    if ((await openCorrections(context, eq(periodReopening.id, reopeningId))).length === 0) return notInForce;
    before = 'In force';
  } else {
    // Still awaiting its decision: its request is withdrawn with it, under the lock taken above.
    if ((await dependencies.access.withdrawRequest(context, document, actor)) === 'not-open') return notInForce;
    before = 'Awaiting approval';
  }
  await context.tx.insert(periodEvent).values({
    id: uuidv7(),
    financialPeriodId: reopening.financialPeriodId,
    kind: 'reopening-withdrawn',
    periodReopeningId: reopeningId,
    byUserId: by.userId,
    roleAssignmentId: by.cancelHeldThrough ?? null,
    occurredAt: context.startedAt,
  });
  await auditBy(
    context,
    dependencies.audit,
    actor,
    { type: 'period_reopening', id: reopeningId },
    'withdraw-reopening',
    [value('state', 'Withdrawn', before)],
  );
  return { kind: 'success', answer: { reopeningId } };
}

/**
 * What a decision does to a reopening (4.3 step 2; access-and-approvals 9.8b): Decide locks the reopening at step 1;
 * an approval takes the period row exclusively at step 7, writes the `reopening-approved` event, from which the period
 * shows Reopened, and emits `finance.period-reopened`; a rejection writes `reopening-rejected`. `access` has already
 * refused a decision by the requester (PRD-LED-019, PRD-ACS-006); the period event's trigger refuses it again.
 */
export function reopeningEffect(audit: AuditInterface): DocumentEffect {
  const decide = async (
    context: TransactionContext,
    decider: Parameters<DocumentEffect['approve']>[1],
    reopeningId: string,
    outcome: 'Approved' | 'Rejected',
  ): Promise<EffectOutcome> => {
    const reopening = await reopeningOf(context, reopeningId);
    if (reopening === undefined) return notFound(PERIOD_REOPENING_TYPE, reopeningId);
    if (reopening.decided) return refused('conflict', 'kernel.stale-version');
    const period =
      outcome === 'Approved'
        ? await holdExclusively(context, reopening.financialPeriodId)
        : await periodById(context, reopening.financialPeriodId);
    if (period === undefined) return notFound(FINANCIAL_PERIOD_TYPE, reopening.financialPeriodId);
    if (decider.approvalDecisionId === undefined) throw new Error('A reopening is decided through access (9.5)');
    await context.tx.insert(periodEvent).values({
      id: uuidv7(),
      financialPeriodId: period.id,
      kind: outcome === 'Approved' ? 'reopening-approved' : 'reopening-rejected',
      periodReopeningId: reopeningId,
      byUserId: decider.actor.id,
      roleAssignmentId: decider.roleAssignmentId ?? null,
      approvalDecisionId: decider.approvalDecisionId,
      occurredAt: context.startedAt,
    });
    await audit.record(context, {
      actor: decider.actor,
      ...(decider.roleAssignmentId === undefined ? {} : { roleAssignmentId: decider.roleAssignmentId }),
      approval: { decisionId: decider.approvalDecisionId },
      ...(decider.reason === undefined ? {} : { reason: decider.reason }),
      record: { module: 'finance', type: 'period_reopening', id: reopeningId, versionId: reopeningId },
      operation: outcome === 'Approved' ? 'approve-reopening' : 'reject-reopening',
      changes: [{ kind: 'value', field: 'decision', before: 'Awaiting approval', after: outcome }],
      source: { kind: 'screen' },
    });
    if (outcome === 'Approved') {
      await context.publish(periodReopened, {
        subject: { module: 'finance', recordType: PERIOD_REOPENING_TYPE, recordId: reopeningId },
        payload: { periodId: period.id, bookId: period.bookId, reopeningId },
      });
    }
    return { kind: 'success', answer: { recordId: reopeningId } };
  };
  return {
    targets(_context, reopeningId): Promise<LockTarget[]> {
      return Promise.resolve([{ table: REOPENING_TABLE, id: reopeningId, mode: 'exclusive' }]);
    },
    approve: (context, decider, reopeningId) => decide(context, decider, reopeningId, 'Approved'),
    reject: (context, decider, reopeningId) => decide(context, decider, reopeningId, 'Rejected'),
  };
}
