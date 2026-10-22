import type { TransactionContext } from '../../../kernel/index.js';
import type { AuditInterface } from '../../audit/index.js';
import { bookingItem } from '../domain/bookings.js';
import { matchReceipt } from '../domain/lifecycle.js';
import { statusOfBooking } from '../queries/lifecycle.js';
import { refusalOf, refused, today, type Outcome } from './common.js';
import {
  heldBooking,
  linked,
  writeLink,
  type Linker,
  type ReceiptAtIssue,
  type ReceiptLinked,
} from './receipt-link.js';

/**
 * Links a GRN line at its GRN's issue to the one line of the booking's version in force it matches (goods-in 3.7,
 * 3.10; PRD-BKG-007; DEC-130; S2-F01-T04), or answers why it goes to Booking for review; nothing is written then. A GRN
 * line already linked is refused (`booking.receipt-already-linked`). The caller holds the booking's lock at step 1
 * (receipt-link.ts).
 */
export async function linkReceiptAtIssue(
  context: TransactionContext,
  audit: AuditInterface,
  linker: Linker,
  receipt: ReceiptAtIssue,
): Promise<Outcome<ReceiptLinked>> {
  const date = await today(context);
  if (typeof date !== 'string') return refusalOf(date);
  const row = await heldBooking(context, receipt.bookingId);
  if (row === undefined) return refused('not-found', 'booking.record-not-found', [bookingItem(receipt.bookingId)]);
  if (await linked(context, receipt.grnLine.grnLineId)) {
    return refused('refused', 'booking.receipt-already-linked', [bookingItem(row.id)]);
  }
  const status = await statusOfBooking(context, row.id, date);
  if (status === undefined) return { kind: 'success', answer: { kind: 'review', reason: 'not-approved' } };
  // A GRN at a Site that is not the booking's destination goes to Booking for review (3.7). **Design choice.**
  if (receipt.grnLine.siteId !== row.siteId) {
    return { kind: 'success', answer: { kind: 'review', reason: 'other-site' } };
  }
  const match = matchReceipt(status.lines, receipt.goods);
  if (match.kind === 'review') return { kind: 'success', answer: match };
  const linkId = await writeLink(context, audit, linker, row, status.versionId, {
    lineKey: match.lineKey,
    grnLine: receipt.grnLine,
    quantity: receipt.quantity,
    kind: 'at-issue',
    date,
  });
  return { kind: 'success', answer: { kind: 'linked', linkId, lineKey: match.lineKey } };
}
