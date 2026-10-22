import type { TransactionContext } from '../../../kernel/index.js';
import type { AuditInterface } from '../../audit/index.js';
import { bookingItem, lineItem } from '../domain/bookings.js';
import { goodsOfLine } from '../domain/lifecycle.js';
import { statusOfBooking } from '../queries/lifecycle.js';
import { refusalOf, refused, today, type Outcome } from './common.js';
import { heldBooking, linked, writeLink, type Linker, type ReceiptLater } from './receipt-link.js';

/**
 * Links a GRN line to the booking line Booking names, later (goods-in 3.7, 3.10; PRD-BKG-008; DEC-130; S2-F01-T04): one
 * received without a booking, or one sent for review. The line is one of the version in force, and the GRN line's goods
 * are its goods, checked under the booking's lock as at issue (`booking.goods-not-of-line`), so a receipt link always
 * names a line its goods match; at any Site. The link is dated and names who made it. The caller holds the booking's
 * lock at step 1 (receipt-link.ts).
 */
export async function linkReceiptLater(
  context: TransactionContext,
  audit: AuditInterface,
  linker: Linker,
  link: ReceiptLater,
): Promise<Outcome<{ readonly linkId: string }>> {
  const date = await today(context);
  if (typeof date !== 'string') return refusalOf(date);
  const row = await heldBooking(context, link.bookingId);
  if (row === undefined) return refused('not-found', 'booking.record-not-found', [bookingItem(link.bookingId)]);
  const status = await statusOfBooking(context, row.id, date);
  if (status === undefined) return refused('refused', 'booking.not-approved', [bookingItem(row.id)]);
  const line = status.lines.find((each) => each.lineKey === link.lineKey);
  if (line === undefined) return refused('refused', 'booking.line-not-found', [lineItem(row.id, link.lineKey)]);
  if (!goodsOfLine(line, link.goods)) {
    return refused('refused', 'booking.goods-not-of-line', [lineItem(row.id, link.lineKey)]);
  }
  if (await linked(context, link.grnLine.grnLineId)) {
    return refused('refused', 'booking.receipt-already-linked', [bookingItem(row.id)]);
  }
  const linkId = await writeLink(context, audit, linker, row, status.versionId, {
    lineKey: link.lineKey,
    grnLine: link.grnLine,
    quantity: link.quantity,
    kind: 'later',
    date,
  });
  return { kind: 'success', answer: { linkId } };
}
