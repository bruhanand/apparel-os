import { and, eq, inArray, isNull } from 'drizzle-orm';
import { CommandDefect, lockTable, type CommandRefusal, type TransactionContext } from '../../../kernel/index.js';
import {
  bookingReceiptLink,
  bookingReceiptLinkProposal,
  bookingReceiptLinkProposalDecision,
  bookingReceiptLinkProposalLine,
} from '../db/schema.js';
import { bookingItem } from '../domain/bookings.js';
import {
  receiptsAtIssue as outcomesAtIssue,
  type InForce,
  type PlannedAtIssue,
  type ReceiptsAtIssue,
} from '../domain/receipts.js';
import { bookingRow, versionWithLines, type BookingRow } from './bookings.js';
import { approvalInForce, statusOfVersion } from './lifecycle.js';

// The reads receiving against a booking takes under the booking's lock (goods-in 3.7, 4.10; PRD-BKG-007, PRD-BKG-008;
// POL-05.08; S2-F02-T04): the version in force a GRN line is received against, the GRN lines linked already or waiting
// in a proposal, the proposal of a booking still waiting, and what a GRN's issue will do with its counted lines. Every
// row is scoped (code-house-rules 6.2).

/**
 * The approved version in force of a booking with its destination and supplier, and its status on the date given, or
 * undefined while it has none (goods-in 3.4, 3.6).
 */
export async function inForceOf(
  context: TransactionContext,
  row: BookingRow,
  date: string,
): Promise<InForce | undefined> {
  const approval = await approvalInForce(context, row.id);
  if (approval === undefined) return undefined;
  const read = await versionWithLines(context, approval.bookingVersionId);
  if (read === undefined) throw new CommandDefect(`The approved version is not found: ${approval.bookingVersionId}`);
  return {
    destinationSiteId: row.siteId,
    supplierPartyId: read.version.supplierPartyId,
    status: await statusOfVersion(context, read.version, date),
  };
}

/** The GRN lines given that are linked to a booking line already (`booking.receipt-already-linked`). */
export async function linkedOf(context: TransactionContext, grnLineIds: readonly string[]): Promise<Set<string>> {
  if (grnLineIds.length === 0) return new Set();
  const rows = await context.tx
    .select({ grnLineId: bookingReceiptLink.grnLineId })
    .from(bookingReceiptLink)
    .where(inArray(bookingReceiptLink.grnLineId, [...grnLineIds]));
  return new Set(rows.map((row) => row.grnLineId));
}

/**
 * The GRN lines given that wait in a proposal still undecided, of any booking the actor may see
 * (`booking.receipt-link-proposed`).
 */
export async function proposedOf(context: TransactionContext, grnLineIds: readonly string[]): Promise<Set<string>> {
  if (grnLineIds.length === 0) return new Set();
  const rows = await context.tx
    .select({ grnLineId: bookingReceiptLinkProposalLine.grnLineId })
    .from(bookingReceiptLinkProposalLine)
    .leftJoin(
      bookingReceiptLinkProposalDecision,
      eq(bookingReceiptLinkProposalDecision.proposalId, bookingReceiptLinkProposalLine.proposalId),
    )
    .where(
      and(
        inArray(bookingReceiptLinkProposalLine.grnLineId, [...grnLineIds]),
        isNull(bookingReceiptLinkProposalDecision.id),
      ),
    );
  return new Set(rows.map((row) => row.grnLineId));
}

/** The proposal of the booking still waiting for its decision, or undefined; stable under the booking's lock. */
export async function pendingProposalOf(context: TransactionContext, bookingId: string) {
  const [row] = await context.tx
    .select({ id: bookingReceiptLinkProposal.id })
    .from(bookingReceiptLinkProposal)
    .leftJoin(
      bookingReceiptLinkProposalDecision,
      eq(bookingReceiptLinkProposalDecision.proposalId, bookingReceiptLinkProposal.id),
    )
    .where(and(eq(bookingReceiptLinkProposal.bookingId, bookingId), isNull(bookingReceiptLinkProposalDecision.id)))
    .limit(1);
  return row;
}

/** What a GRN's issue will do, with the booking and its version in force it was read from; or the refusal. */
export type IssuePlan =
  | {
      readonly kind: 'planned';
      readonly row: BookingRow;
      readonly inForce: InForce | undefined;
      readonly outcomes: readonly PlannedAtIssue[];
    }
  | { readonly kind: 'refusal'; readonly refusal: CommandRefusal };

/**
 * What a GRN's issue does with its counted lines against the booking its Arrival names, in their order, read and not
 * written (goods-in 3.7, 4.10; PRD-BKG-007; POL-05.08; DEC-130): each links to the one line of the version in force it
 * matches, or goes to Booking for review with why (domain/receipts.ts). Read under the caller's lock on the booking at
 * step 1, which is a defect to lack (code-house-rules 8.2), so the links written once every lock is held are these; on
 * the business date given.
 */
export async function planAtIssue(
  context: TransactionContext,
  issue: ReceiptsAtIssue,
  date: string,
): Promise<IssuePlan> {
  if (context.heldLock(lockTable('booking', 'booking'), issue.bookingId) === undefined) {
    throw new CommandDefect('A GRN was received against a booking not locked at step 1');
  }
  const row = await bookingRow(context, issue.bookingId);
  if (row === undefined) {
    return {
      kind: 'refusal',
      refusal: { kind: 'not-found', code: 'booking.record-not-found', missing: [bookingItem(issue.bookingId)] },
    };
  }
  // A GRN's lines are written in the issue's own transaction, so none can be linked before it: one that is, is a defect
  // (code review 6 of stage 2; code-house-rules 12.2: the issue's route answers no such refusal).
  const already = await linkedOf(
    context,
    issue.receipts.map((receipt) => receipt.grnLineId),
  );
  if (already.size > 0) throw new CommandDefect('A GRN line was linked to a booking before its GRN was issued');
  const inForce = await inForceOf(context, row, date);
  const found = outcomesAtIssue(inForce, issue.delivery, issue.receipts);
  const outcomes = issue.receipts.map((receipt, index): PlannedAtIssue => {
    const outcome = found[index];
    if (outcome === undefined) throw new CommandDefect('A GRN line has no outcome at its issue');
    return outcome.kind === 'link'
      ? { kind: 'link', grnLineId: receipt.grnLineId, lineKey: outcome.lineKey }
      : { kind: 'review', grnLineId: receipt.grnLineId, reason: outcome.reason, lineKey: outcome.lineKey };
  });
  return { kind: 'planned', row, inForce, outcomes };
}
