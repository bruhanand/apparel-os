import { CommandDefect, type TransactionContext } from '../../../kernel/index.js';
import type { AuditInterface } from '../../audit/index.js';
import { bookingItem } from '../domain/bookings.js';
import { receiptsAtIssue as outcomesAtIssue, type InForce } from '../domain/receipts.js';
import type { BookingRow } from '../queries/bookings.js';
import { refusalOf, refused, today, type Outcome } from './common.js';
import {
  heldBooking,
  inForceOf,
  linkedOf,
  writeLink,
  type Linker,
  type PlannedAtIssue,
  type ReceiptAtIssue,
  type ReceiptsAtIssue,
} from './receipt-link.js';

/** The booking under the caller's lock, its version in force and each line's outcome, read and not written. */
async function planned(
  context: TransactionContext,
  issue: ReceiptsAtIssue,
): Promise<
  | Outcome<never>
  | {
      readonly kind: 'planned';
      readonly row: BookingRow;
      readonly date: string;
      readonly inForce: InForce | undefined;
      readonly outcomes: readonly PlannedAtIssue[];
    }
> {
  const date = await today(context);
  if (typeof date !== 'string') return refusalOf(date);
  const row = await heldBooking(context, issue.bookingId);
  if (row === undefined) return refused('not-found', 'booking.record-not-found', [bookingItem(issue.bookingId)]);
  const already = await linkedOf(
    context,
    issue.receipts.map((receipt) => receipt.grnLineId),
  );
  if (already.size > 0) return refused('refused', 'booking.receipt-already-linked', [bookingItem(row.id)]);
  const inForce = await inForceOf(context, row, date);
  const found = outcomesAtIssue(inForce, issue.delivery, issue.receipts);
  const outcomes = issue.receipts.map((receipt, index): PlannedAtIssue => {
    const outcome = found[index];
    if (outcome === undefined) throw new CommandDefect('A GRN line has no outcome at its issue');
    return outcome.kind === 'link'
      ? { kind: 'link', grnLineId: receipt.grnLineId, lineKey: outcome.lineKey }
      : { kind: 'review', grnLineId: receipt.grnLineId, reason: outcome.reason, lineKey: outcome.lineKey };
  });
  return { kind: 'planned', row, date, inForce, outcomes };
}

/**
 * What a GRN's issue does with its counted lines against the booking its Arrival names, in their order, read and not
 * written (goods-in 3.7, 4.10; PRD-BKG-007; POL-05.08; DEC-130; S2-F02-T04): each links to the one line of the version
 * in force it matches, or goes to Booking for review with why (domain/receipts.ts). The caller asks it before its later
 * locks, to know whether a follow-up is raised, since nothing is written until every lock is held (code-house-rules
 * 8.2), and holds the booking's lock at step 1 (receipt-link.ts), so the links linkReceiptsAtIssue then writes are
 * these. A GRN line already linked is refused (`booking.receipt-already-linked`).
 */
export async function receiptsAtIssue(
  context: TransactionContext,
  issue: ReceiptsAtIssue,
): Promise<Outcome<readonly PlannedAtIssue[]>> {
  const plan = await planned(context, issue);
  return plan.kind === 'planned' ? { kind: 'success', answer: plan.outcomes } : plan;
}

/**
 * Links the counted lines of a GRN at its issue to the booking lines they match, as receiptsAtIssue answers, once the
 * caller holds every lock (goods-in 3.7, 10.3): each link dated and signed by whoever issues the GRN, with its audit
 * record; a line for review writes nothing here. The caller holds the booking's lock at step 1 (receipt-link.ts).
 */
export async function linkReceiptsAtIssue(
  context: TransactionContext,
  audit: AuditInterface,
  linker: Linker,
  issue: ReceiptsAtIssue,
): Promise<Outcome<readonly ReceiptAtIssue[]>> {
  const plan = await planned(context, issue);
  if (plan.kind !== 'planned') return plan;
  const answers: ReceiptAtIssue[] = [];
  for (const [index, outcome] of plan.outcomes.entries()) {
    if (outcome.kind === 'review') {
      answers.push(outcome);
      continue;
    }
    const receipt = issue.receipts[index];
    if (receipt === undefined || plan.inForce === undefined) {
      throw new CommandDefect('A GRN line links to a booking with no version in force');
    }
    const linkId = await writeLink(context, audit, linker, plan.row, plan.inForce.status.versionId, {
      lineKey: outcome.lineKey,
      grnId: issue.grn.grnId,
      grnLineId: receipt.grnLineId,
      grnSiteId: issue.grn.siteId,
      quantity: receipt.quantity,
      kind: 'at-issue',
      date: plan.date,
    });
    answers.push({ kind: 'linked', grnLineId: outcome.grnLineId, lineKey: outcome.lineKey, linkId });
  }
  return { kind: 'success', answer: answers };
}
