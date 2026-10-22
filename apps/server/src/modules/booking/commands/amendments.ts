import { paise, uuidv7 } from '@apparel-os/domain';
import { BOOKING_TYPE } from '@apparel-os/schemas';
import {
  CommandDefect,
  lockTable,
  type CommandRefusal,
  type LockTarget,
  type TransactionContext,
} from '../../../kernel/index.js';
import type { DocumentEffect, EffectDecider, EffectOutcome } from '../../access/index.js';
import type { AuditChange } from '../../audit/index.js';
import { bookingAmendmentDecision, openToBuyRelease } from '../db/schema.js';
import { bookingAuditRecord, bookingVersionItem, lineItem } from '../domain/bookings.js';
import { bookingAmended } from '../events.js';
import { bookingLock, bookingRow, changesOf, versionWithLines, type BookingRow } from '../queries/bookings.js';
import { budgetOf } from '../queries/budgets.js';
import { amendmentRow, approvalInForce, reservedByBudget, statusOfBooking } from '../queries/lifecycle.js';
import { decided, gateRefusal, recordDecision, type ApprovalDependencies } from './approval.js';
import { budgetLock, refused, today } from './common.js';

// What a decision does to a cancellation of an undelivered balance or an extension of the window (goods-in 3.5, 3.8,
// 3.10, 10.3, 10.5; access-and-approvals 9.8b; PRD-BKG-013; POL-05.02, POL-05.07, POL-05.10, POL-02.07; S2-F01-T04),
// in the decision's transaction. `access` has refused the proposer (9.3). Decide takes, with the request at step 1, the
// booking's identity row and every budget the booking reserves of (code-house-rules 8.2).
//
// - Approved: in one transaction, or nothing: the amendment still waits for its decision and amends the version in
//   force (`booking.version-not-in-force`); the policy gate under policies 5 and 1, as a booking's approval asks it
//   (goods-in 10.5); for a cancellation, each line's outstanding balance still the quantity proposed
//   (`booking.balance-changed`), then the cancelled quantities, and the open-to-buy they held at each line's cost,
//   released; for an extension, each date still later than the one it replaces (`booking.not-an-extension`); the
//   decision, the booking's change row, its audit record and `booking.booking-amended`.
// - Rejected: the decision, the change row and the audit record; nothing else changes.

type ValueChange = Extract<AuditChange, { kind: 'value' }>;
const value = (field: string, before: ValueChange['before'], after: ValueChange['after']): ValueChange => ({
  kind: 'value',
  field,
  before,
  after,
});

const refusalOf = (refusal: CommandRefusal): EffectOutcome => ({ kind: 'refusal', refusal });

/** The amendment and its booking under the lock, still awaiting its decision; or the refusal. */
async function awaiting(context: TransactionContext, amendmentId: string) {
  const found = await amendmentRow(context, amendmentId);
  if (found === undefined) return refused<never>('not-found', 'booking.record-not-found');
  const row = await bookingRow(context, found.amendment.bookingId);
  if (row === undefined) return refused<never>('not-found', 'booking.record-not-found');
  if (found.decision !== undefined) {
    return refused<never>('refused', 'booking.version-not-awaiting', [bookingVersionItem(row.id, amendmentId)]);
  }
  const newest = (await changesOf(context, row.id)).at(-1);
  if (newest === undefined) throw new CommandDefect(`A booking has no change: ${row.id}`);
  return { ...found, row, changeNumber: newest.changeNumber };
}

/** The booking's lock and every budget the booking reserves of, which Decide takes with the request (8.2). */
async function targetsOf(context: TransactionContext, amendmentId: string): Promise<LockTarget[]> {
  const found = await amendmentRow(context, amendmentId);
  if (found === undefined) return [];
  const held = await reservedByBudget(context, found.amendment.bookingId);
  return [bookingLock(found.amendment.bookingId), ...[...held.keys()].map(budgetLock)];
}

/** Writes the decision of an amendment with the booking's change row (goods-in 3.5). */
async function writeDecision(
  context: TransactionContext,
  decider: EffectDecider,
  found: {
    readonly row: BookingRow;
    readonly changeNumber: number;
    readonly amendment: { readonly id: string; readonly bookingVersionId: string };
  },
  decision: 'Approved' | 'Rejected',
  date: string,
): Promise<void> {
  const { decisionId } = decided(decider);
  await context.tx.insert(bookingAmendmentDecision).values({
    id: uuidv7(),
    bookingAmendmentId: found.amendment.id,
    brandId: found.row.brandId,
    siteId: found.row.siteId,
    decision,
    approvalDecisionId: decisionId,
    decidedByUserId: decider.actor.id,
    decidedAt: context.startedAt,
    businessDate: date,
  });
  await recordDecision(
    context,
    found.row,
    'amendment-decision',
    found.amendment.bookingVersionId,
    found.changeNumber,
    decider.actor.id,
  );
}

/** The audit record of an amendment's decision, made in My work (numbering-and-audit 4.1). */
function auditOf(
  decider: EffectDecider,
  row: BookingRow,
  versionId: string,
  operation: string,
  changes: readonly ValueChange[],
) {
  const { decisionId, roleAssignmentId } = decided(decider);
  return {
    actor: decider.actor,
    roleAssignmentId,
    approval: { decisionId },
    ...(decider.reason === undefined ? {} : { reason: decider.reason }),
    scope: { siteId: row.siteId, brandId: row.brandId },
    record: bookingAuditRecord(row.id, versionId),
    operation,
    changes,
    source: { kind: 'screen' as const },
  };
}

/**
 * What a cancellation releases of open-to-buy (goods-in 3.3, 3.5; POL-05.02): the cancelled pieces at each line's
 * cost, from the budget of the version in force's brand and season, which the booking reserves at least that much of,
 * since its approval reserved its lines less what was cancelled before. Received goods keep their share, being no
 * part of the balance. Undefined when nothing is released; a release beyond what is reserved is a defect.
 */
async function releaseOf(
  context: TransactionContext,
  row: BookingRow,
  versionId: string,
  amount: number,
): Promise<{ readonly budgetId: string; readonly amount: number } | 'stale' | undefined> {
  if (amount === 0) return undefined;
  const read = await versionWithLines(context, versionId);
  if (read === undefined) throw new CommandDefect(`The version in force is not found: ${versionId}`);
  const budget = await budgetOf(context, row.brandId, read.version.seasonValueId);
  if (budget === undefined) throw new CommandDefect(`An approved booking has no budget: ${row.id}`);
  if (context.heldLock(lockTable('booking', 'open_to_buy_budget'), budget.id) === undefined) return 'stale';
  const reserved = (await reservedByBudget(context, row.id)).get(budget.id) ?? 0;
  if (reserved < amount) throw new CommandDefect(`A cancellation releases more than its booking reserves: ${row.id}`);
  return { budgetId: budget.id, amount };
}

/** The decision effect of a cancellation or an extension (access-and-approvals 9.8b; goods-in 3.5). */
export function amendmentEffect(dependencies: ApprovalDependencies): DocumentEffect {
  return {
    targets: targetsOf,
    async approve(context, decider, amendmentId) {
      const found = await awaiting(context, amendmentId);
      if ('kind' in found) return found;
      const { amendment, lines, row } = found;
      const date = await today(context);
      if (typeof date !== 'string') return refusalOf(date);
      const inForce = await approvalInForce(context, row.id);
      if (inForce?.bookingVersionId !== amendment.bookingVersionId) {
        return refused('refused', 'booking.version-not-in-force', [bookingVersionItem(row.id, amendmentId)]);
      }
      const gate = await gateRefusal(context, dependencies.configuration, row.siteId);
      if (gate !== undefined) return refusalOf(gate);
      const status = await statusOfBooking(context, row.id, date);
      if (status === undefined) throw new CommandDefect(`An approved booking has no status: ${row.id}`);
      let released: { readonly budgetId: string; readonly amount: number } | undefined;
      if (amendment.kind === 'cancellation') {
        // Each balance still what was proposed: goods linked since, or another cancellation, change it (3.6).
        let amount = 0;
        for (const cancelled of lines) {
          const line = status.lines.find((each) => each.lineKey === cancelled.bookingLineId);
          if (line?.outstanding !== cancelled.quantity) {
            return refused('refused', 'booking.balance-changed', [lineItem(row.id, cancelled.bookingLineId)]);
          }
          amount = paise(amount + line.outstanding * line.indicativeCost);
        }
        const release = await releaseOf(context, row, amendment.bookingVersionId, amount);
        if (release === 'stale') {
          return refused('conflict', 'kernel.stale-version', [bookingVersionItem(row.id, amendmentId)]);
        }
        released = release;
      } else {
        for (const extended of lines) {
          const line = status.lines.find((each) => each.lineKey === extended.bookingLineId);
          if (line === undefined || extended.deliveryDate === null || extended.deliveryDate <= line.dueDate) {
            return refused('refused', 'booking.not-an-extension', [lineItem(row.id, extended.bookingLineId)]);
          }
        }
        if (amendment.windowTo === null || amendment.windowTo < status.deliveryWindow.to) {
          return refused('refused', 'booking.not-an-extension', [bookingVersionItem(row.id, amendmentId)]);
        }
      }
      await writeDecision(context, decider, found, 'Approved', date);
      if (released !== undefined) {
        await context.tx.insert(openToBuyRelease).values({
          id: uuidv7(),
          openToBuyBudgetId: released.budgetId,
          bookingId: row.id,
          bookingApprovalId: null,
          bookingAmendmentId: amendmentId,
          amountPaise: paise(released.amount),
        });
      }
      await dependencies.audit.record(
        context,
        auditOf(
          decider,
          row,
          amendment.bookingVersionId,
          amendment.kind === 'cancellation' ? 'approve-booking-cancellation' : 'approve-booking-extension',
          [
            value('amendmentId', null, amendmentId),
            value('decision', 'Awaiting approval', 'Approved'),
            ...(released === undefined ? [] : [value('released', null, { ...released })]),
          ],
        ),
      );
      await context.publish(bookingAmended, {
        subject: { module: 'booking', recordType: BOOKING_TYPE, recordId: row.id, versionId: amendmentId },
        scope: { siteId: row.siteId, brandId: row.brandId },
        payload: { bookingId: row.id, amendmentId },
      });
      return { kind: 'success', answer: { bookingId: row.id, amendmentId } };
    },
    async reject(context, decider, amendmentId) {
      const found = await awaiting(context, amendmentId);
      if ('kind' in found) return found;
      const date = await today(context);
      if (typeof date !== 'string') return refusalOf(date);
      await writeDecision(context, decider, found, 'Rejected', date);
      await dependencies.audit.record(
        context,
        auditOf(
          decider,
          found.row,
          found.amendment.bookingVersionId,
          found.amendment.kind === 'cancellation' ? 'reject-booking-cancellation' : 'reject-booking-extension',
          [value('amendmentId', null, amendmentId), value('decision', 'Awaiting approval', 'Rejected')],
        ),
      );
      return { kind: 'success', answer: { bookingId: found.row.id, amendmentId } };
    },
  };
}
