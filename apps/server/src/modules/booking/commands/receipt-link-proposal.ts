import { uuidv7 } from '@apparel-os/domain';
import { eq } from 'drizzle-orm';
import { CommandDefect, type LockTarget, type TransactionContext } from '../../../kernel/index.js';
import type { DocumentEffect, EffectDecider } from '../../access/index.js';
import {
  bookingReceiptLinkProposal,
  bookingReceiptLinkProposalDecision,
  bookingReceiptLinkProposalLine,
} from '../db/schema.js';
import { bookingAuditRecord, bookingVersionItem, lineItem } from '../domain/bookings.js';
import { goodsOfLine } from '../domain/lifecycle.js';
import { bookingLock, bookingRow, type BookingRow } from '../queries/bookings.js';
import { decided, gateRefusal, type ApprovalDependencies } from './approval.js';
import { refusalOf, refused, today, valueChange as value } from './common.js';
import { factsOf } from './draft.js';
import { inForceOf, linkedOf, writeLink } from './receipt-link.js';

// What a decision does to a proposal to link late or excess goods into a booking (goods-in 3.7, 4.10, 10.3, 10.5;
// access-and-approvals 9.8b; PRD-BKG-008; POL-05.08, POL-02.07; RR-577, the product owner, 22 Oct 2026; S2-F02-T04), in
// the decision's transaction under the booking's lock, which Decide takes with the request at step 1. `access` has
// refused the proposer (9.3).
//
// - Approved: in one transaction, or nothing: the proposal still waits for its decision; the policy gate under policies
//   5 and 1, as a booking's approval asks it (goods-in 10.5); each GRN line not linked since, and its booking line
//   still a line of the version in force whose goods the GRN line's are, since a change may have been approved since
//   (`booking.line-not-found`, `booking.goods-not-of-line`, `booking.receipt-already-linked`); then each line's receipt
//   link, dated the decision's day and signed by the approver, naming the proposal, so the late or excess pieces count
//   as delivered, or over-delivered, on the booking; the decision and the audit record.
// - Rejected: the decision and the audit record; the GRN lines stay unlinked, and Booking may propose them again.

type ProposalRow = typeof bookingReceiptLinkProposal.$inferSelect;

/** A proposal with its lines and its booking, read under the lock, still awaiting its decision; or the refusal. */
async function awaiting(context: TransactionContext, proposalId: string) {
  const [proposal] = await context.tx
    .select()
    .from(bookingReceiptLinkProposal)
    .where(eq(bookingReceiptLinkProposal.id, proposalId));
  if (proposal === undefined) return refused<never>('not-found', 'booking.record-not-found');
  const row = await bookingRow(context, proposal.bookingId);
  if (row === undefined) return refused<never>('not-found', 'booking.record-not-found');
  const [decision] = await context.tx
    .select({ id: bookingReceiptLinkProposalDecision.id })
    .from(bookingReceiptLinkProposalDecision)
    .where(eq(bookingReceiptLinkProposalDecision.proposalId, proposalId));
  if (decision !== undefined) {
    return refused<never>('refused', 'booking.version-not-awaiting', [bookingVersionItem(row.id, proposalId)]);
  }
  const lines = await context.tx
    .select()
    .from(bookingReceiptLinkProposalLine)
    .where(eq(bookingReceiptLinkProposalLine.proposalId, proposalId));
  return { proposal, lines, row };
}

/** The booking's lock, which Decide takes with the request (code-house-rules 8.2). */
async function targetsOf(context: TransactionContext, proposalId: string): Promise<LockTarget[]> {
  const [proposal] = await context.tx
    .select({ bookingId: bookingReceiptLinkProposal.bookingId })
    .from(bookingReceiptLinkProposal)
    .where(eq(bookingReceiptLinkProposal.id, proposalId));
  return proposal === undefined ? [] : [bookingLock(proposal.bookingId)];
}

/** Writes a proposal's decision, once, with its audit record (numbering-and-audit 4.1). */
async function writeDecision(
  context: TransactionContext,
  dependencies: ApprovalDependencies,
  decider: EffectDecider,
  found: { readonly proposal: ProposalRow; readonly row: BookingRow },
  decision: 'Approved' | 'Rejected',
  date: string,
  links: readonly string[],
): Promise<void> {
  const { decisionId, roleAssignmentId } = decided(decider);
  await context.tx.insert(bookingReceiptLinkProposalDecision).values({
    id: uuidv7(),
    proposalId: found.proposal.id,
    ...factsOf(found.row),
    decision,
    approvalDecisionId: decisionId,
    decidedByUserId: decider.actor.id,
    decidedAt: context.startedAt,
    businessDate: date,
  });
  await dependencies.audit.record(context, {
    actor: decider.actor,
    roleAssignmentId,
    approval: { decisionId },
    ...(decider.reason === undefined ? {} : { reason: decider.reason }),
    scope: factsOf(found.row),
    record: bookingAuditRecord(found.row.id, found.proposal.bookingVersionId),
    operation: decision === 'Approved' ? 'approve-booking-receipt-link' : 'reject-booking-receipt-link',
    changes: [
      value('proposalId', null, found.proposal.id),
      value('decision', 'Awaiting approval', decision),
      ...(links.length === 0 ? [] : [value('links', null, [...links])]),
    ],
    source: { kind: 'screen' },
  });
}

/** The decision effect of a proposal to link late or excess goods (access-and-approvals 9.8b; goods-in 4.10). */
export function receiptLinkEffect(dependencies: ApprovalDependencies): DocumentEffect {
  return {
    targets: targetsOf,
    async approve(context, decider, proposalId) {
      const found = await awaiting(context, proposalId);
      if ('kind' in found) return found;
      const { lines, row } = found;
      const date = await today(context);
      if (typeof date !== 'string') return refusalOf(date);
      const gate = await gateRefusal(context, dependencies.configuration, row.siteId);
      if (gate !== undefined) return refusalOf(gate);
      const inForce = await inForceOf(context, row, date);
      // A proposal is made of an approved booking, and no approval is ever undone (goods-in 3.10).
      if (inForce === undefined) throw new CommandDefect(`A proposal's booking has no version in force: ${row.id}`);
      for (const line of lines) {
        const bookingLine = inForce.status.lines.find((each) => each.lineKey === line.bookingLineId);
        if (bookingLine === undefined) {
          return refused('refused', 'booking.line-not-found', [lineItem(row.id, line.bookingLineId)]);
        }
        if (!goodsOfLine(bookingLine, { styleCode: line.styleCode, colour: line.colour, size: line.size })) {
          return refused('refused', 'booking.goods-not-of-line', [lineItem(row.id, line.bookingLineId)]);
        }
      }
      const linked = await linkedOf(
        context,
        lines.map((line) => line.grnLineId),
      );
      if (linked.size > 0) {
        return refused('refused', 'booking.receipt-already-linked', [bookingVersionItem(row.id, proposalId)]);
      }
      const { decisionId, roleAssignmentId } = decided(decider);
      const linkIds: string[] = [];
      for (const line of lines) {
        linkIds.push(
          await writeLink(
            context,
            dependencies.audit,
            { userId: decider.actor.id, roleAssignmentId },
            row,
            inForce.status.versionId,
            {
              lineKey: line.bookingLineId,
              grnId: line.grnId,
              grnLineId: line.grnLineId,
              grnSiteId: line.grnSiteId,
              quantity: line.quantity,
              kind: 'later',
              date,
              proposalId,
              approval: { decisionId },
            },
          ),
        );
      }
      await writeDecision(context, dependencies, decider, found, 'Approved', date, linkIds);
      return { kind: 'success', answer: { bookingId: row.id, proposalId } };
    },
    async reject(context, decider, proposalId) {
      const found = await awaiting(context, proposalId);
      if ('kind' in found) return found;
      const date = await today(context);
      if (typeof date !== 'string') return refusalOf(date);
      await writeDecision(context, dependencies, decider, found, 'Rejected', date, []);
      return { kind: 'success', answer: { bookingId: found.row.id, proposalId } };
    },
  };
}
