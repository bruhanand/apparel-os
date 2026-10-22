import { uuidv7 } from '@apparel-os/domain';
import { BOOKING_APPROVAL, OPEN_TO_BUY_APPROVAL, OPEN_TO_BUY_CHECK } from '@apparel-os/schemas';
import { and, eq, sql } from 'drizzle-orm';
import { CommandDefect, type LockTarget, type TransactionContext } from '../../../kernel/index.js';
import type {
  AccessInterface,
  DocumentEffect,
  EffectDecider,
  EffectOutcome,
  ModuleApprovals,
} from '../../access/index.js';
import type { AuditChange, AuditInterface } from '../../audit/index.js';
import { openToBuyBudgetCheck, openToBuyBudgetVersion } from '../db/schema.js';
import { bookingApprovalRule } from '../domain/bookings.js';
import { approvalDocument, bookingApprovalRules, budgetAuditRecord, versionItem } from '../domain/budgets.js';
import { checkOf, versionRow } from '../queries/budgets.js';
import { bookingApprovalEffect, type ApprovalDependencies } from './approval.js';
import { budgetLock, refused } from './common.js';

// What a decision does to an open-to-buy budget version (goods-in 3.3; module-map 6.2 flow A; access-and-approvals
// 9.8b; POL-05.09, POL-02.07; S2-F01-T02), in the decision's transaction under the budget's lock, which Decide takes
// with the request at step 1:
//
// - Accounts' check, approved: the check is recorded, one per version, and the version's approval is requested from
//   a different authorised person in the same transaction, so the Owner, or whoever holds the approval, finds it in
//   My work only once the check is recorded. Rejected: the version is Rejected and returns to Booking.
// - The approval, approved: refused while no check is recorded; otherwise the version takes effect at the decision's
//   instant, ending the version in force there. Rejected: the version is Rejected.
//
// Neither may be decided by the version's preparer: `access` refuses every preparer (9.3; PRD-ACS-006), and the check
// table's trigger stands behind it (migration 0086). Nor may the approval be decided by whoever recorded the check:
// three different people for each version (DEC-142; access-and-approvals 9.8b).

/**
 * What the effects need: audit, and Request approval of `access`, bound late since `access` is built with them; for a
 * booking's approval, the policy gate and the booking series (approval.ts; S2-F01-T03).
 */
export interface EffectDependencies extends ApprovalDependencies {
  readonly requests: () => Pick<AccessInterface, 'requestApproval'>;
}

type ValueChange = Extract<AuditChange, { kind: 'value' }>;
const decision = (after: string): ValueChange => ({
  kind: 'value',
  field: 'decision',
  before: 'Awaiting approval',
  after,
});

/** The budget's lock, which Decide takes with the request (code-house-rules 8.2). */
async function targetsOf(context: TransactionContext, versionId: string): Promise<LockTarget[]> {
  const row = await versionRow(context, versionId);
  return row === undefined ? [] : [budgetLock(row.openToBuyBudgetId)];
}

/** The version, rechecked under the lock: it exists and still awaits its decision. */
async function waiting(context: TransactionContext, versionId: string) {
  const row = await versionRow(context, versionId);
  if (row === undefined) return refused<never>('not-found', 'booking.record-not-found');
  if (row.decision !== 'Awaiting approval') {
    return refused<never>('refused', 'booking.version-not-awaiting', [versionItem(row.openToBuyBudgetId, versionId)]);
  }
  return row;
}

function decided(decider: EffectDecider): { readonly decisionId: string; readonly roleAssignmentId: string } {
  if (decider.approvalDecisionId === undefined || decider.roleAssignmentId === undefined) {
    throw new CommandDefect('A budget decision ran without its decision or the assignment relied on');
  }
  return { decisionId: decider.approvalDecisionId, roleAssignmentId: decider.roleAssignmentId };
}

async function reject(
  context: TransactionContext,
  audit: AuditInterface,
  decider: EffectDecider,
  versionId: string,
  operation: string,
): Promise<EffectOutcome> {
  const row = await waiting(context, versionId);
  if ('kind' in row) return row;
  await context.tx
    .update(openToBuyBudgetVersion)
    .set({ decision: 'Rejected' })
    .where(eq(openToBuyBudgetVersion.id, versionId));
  await audit.record(context, {
    actor: decider.actor,
    ...(decider.roleAssignmentId === undefined ? {} : { roleAssignmentId: decider.roleAssignmentId }),
    ...(decider.approvalDecisionId === undefined ? {} : { approval: { decisionId: decider.approvalDecisionId } }),
    ...(decider.reason === undefined ? {} : { reason: decider.reason }),
    scope: { brandId: row.brandId },
    record: budgetAuditRecord(row.openToBuyBudgetId, versionId),
    operation,
    changes: [decision('Rejected')],
    source: { kind: 'screen' },
  });
  return { kind: 'success', answer: { budgetId: row.openToBuyBudgetId, versionId } };
}

/** Accounts' check of a version (3.3; POL-05.09). */
function checkEffect(dependencies: EffectDependencies): DocumentEffect {
  return {
    targets: targetsOf,
    async approve(context, decider, versionId) {
      const row = await waiting(context, versionId);
      if ('kind' in row) return row;
      if ((await checkOf(context, versionId)) !== undefined) {
        return refused('refused', 'booking.version-not-awaiting', [versionItem(row.openToBuyBudgetId, versionId)]);
      }
      const { decisionId, roleAssignmentId } = decided(decider);
      const checkId = uuidv7();
      await context.tx.insert(openToBuyBudgetCheck).values({
        id: checkId,
        openToBuyBudgetVersionId: versionId,
        checkedByUserId: decider.actor.id,
        approvalDecisionId: decisionId,
        checkedAt: context.startedAt,
      });
      await dependencies.audit.record(context, {
        actor: decider.actor,
        roleAssignmentId,
        approval: { decisionId },
        ...(decider.reason === undefined ? {} : { reason: decider.reason }),
        scope: { brandId: row.brandId },
        record: budgetAuditRecord(row.openToBuyBudgetId, versionId),
        operation: 'check-open-to-buy-budget-version',
        changes: [{ kind: 'value', field: 'check', before: null, after: checkId }],
        source: { kind: 'screen' },
      });
      // The approval, from a different authorised person from the preparer (POL-05.09, POL-02.07), requested by the
      // checker in the same transaction; its preparer is the version's, the one who recorded it (9.1; GC3-1).
      await dependencies.requests().requestApproval(context, {
        actionType: OPEN_TO_BUY_APPROVAL,
        document: approvalDocument(row.openToBuyBudgetId, versionId),
        value: { kind: 'none' },
        preparers: [row.preparedByUserId],
        requestedBy: { userId: decider.actor.id, roleAssignmentId },
        facts: { brandId: row.brandId },
      });
      return { kind: 'success', answer: { budgetId: row.openToBuyBudgetId, versionId, checkId } };
    },
    reject: (context, decider, versionId) =>
      reject(context, dependencies.audit, decider, versionId, 'reject-open-to-buy-budget-check'),
  };
}

/**
 * The approval of a checked version (3.3; POL-05.09): it takes effect at the decision's instant. Whoever recorded
 * Accounts' check of the version may not decide it, so Booking, Accounts and the Owner are three different people for
 * each version (DEC-142); `access` refuses them as it refuses a preparer (access-and-approvals 9.3, 9.8b).
 */
function approvalEffect(dependencies: EffectDependencies): DocumentEffect {
  return {
    targets: targetsOf,
    async earlierStepDeciders(context, versionId) {
      const check = await checkOf(context, versionId);
      return check === undefined ? [] : [check.checkedByUserId];
    },
    async approve(context, decider, versionId) {
      const row = await waiting(context, versionId);
      if ('kind' in row) return row;
      const budgetId = row.openToBuyBudgetId;
      // POL-05.09: Accounts checks the budget before the Owner approves it.
      if ((await checkOf(context, versionId)) === undefined) {
        return refused('refused', 'booking.budget-not-checked', [versionItem(budgetId, versionId)]);
      }
      const { decisionId, roleAssignmentId } = decided(decider);
      const at = context.startedAt.toISOString();
      // The version in force ends where this one starts; one that started after this decision began is newer than
      // it, so the decision is stale and tried again (access-and-approvals 9.5 "dated by instants").
      const [inForce] = await context.tx
        .select({
          id: openToBuyBudgetVersion.id,
          later: sql<boolean>`pg_catalog.lower(${openToBuyBudgetVersion.validDuring}) >= ${at}::timestamptz`,
        })
        .from(openToBuyBudgetVersion)
        .where(
          and(
            eq(openToBuyBudgetVersion.openToBuyBudgetId, budgetId),
            eq(openToBuyBudgetVersion.decision, 'Approved'),
            sql`pg_catalog.upper_inf(${openToBuyBudgetVersion.validDuring})`,
          ),
        );
      if (inForce?.later === true)
        return refused('conflict', 'kernel.stale-version', [versionItem(budgetId, versionId)]);
      if (inForce !== undefined) {
        await context.tx
          .update(openToBuyBudgetVersion)
          .set({
            validDuring: sql`pg_catalog.tstzrange(pg_catalog.lower(${openToBuyBudgetVersion.validDuring}), ${at}::timestamptz, '[)')`,
          })
          .where(eq(openToBuyBudgetVersion.id, inForce.id));
      }
      await context.tx
        .update(openToBuyBudgetVersion)
        .set({
          decision: 'Approved',
          validDuring: sql`pg_catalog.tstzrange(${at}::timestamptz, null, '[)')`,
        })
        .where(eq(openToBuyBudgetVersion.id, versionId));
      await dependencies.audit.record(context, {
        actor: decider.actor,
        roleAssignmentId,
        approval: { decisionId },
        ...(decider.reason === undefined ? {} : { reason: decider.reason }),
        scope: { brandId: row.brandId },
        record: budgetAuditRecord(budgetId, versionId),
        operation: 'approve-open-to-buy-budget-version',
        changes: [
          decision('Approved'),
          ...(inForce === undefined
            ? []
            : [{ kind: 'value' as const, field: 'ends', before: null, after: inForce.id }]),
        ],
        source: { kind: 'screen' },
      });
      return { kind: 'success', answer: { budgetId, versionId } };
    },
    reject: (context, decider, versionId) =>
      reject(context, dependencies.audit, decider, versionId, 'reject-open-to-buy-budget-version'),
  };
}

/**
 * The approval rules and decision effects `booking` declares to `access` (access-and-approvals 8, 9.8b; module-map
 * section 3, rule 6), which the composition root hands to `access` at start.
 */
export function bookingApprovals(dependencies: EffectDependencies): ModuleApprovals {
  return {
    rules: [...bookingApprovalRules, bookingApprovalRule],
    effects: new Map<string, DocumentEffect>([
      [OPEN_TO_BUY_CHECK, checkEffect(dependencies)],
      [OPEN_TO_BUY_APPROVAL, approvalEffect(dependencies)],
      // A booking version's approval (goods-in 3.4; S2-F01-T03).
      [BOOKING_APPROVAL, bookingApprovalEffect(dependencies)],
    ]),
  };
}
