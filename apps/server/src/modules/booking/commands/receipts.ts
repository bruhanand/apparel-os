import { uuidv7 } from '@apparel-os/domain';
import { eq } from 'drizzle-orm';
import { CommandDefect, lockTable, type TransactionContext } from '../../../kernel/index.js';
import type { AuditInterface } from '../../audit/index.js';
import { bookingReceiptLink } from '../db/schema.js';
import { bookingAuditRecord, bookingItem, lineItem } from '../domain/bookings.js';
import { matchReceipt, type ReceivedGoods } from '../domain/lifecycle.js';
import { bookingRow, type BookingRow } from '../queries/bookings.js';
import { approvalInForce, statusOfBooking } from '../queries/lifecycle.js';
import { factsOf } from './bookings.js';
import { refused, today, type Outcome } from './common.js';

// The receipt link (goods-in 3.6, 3.7, 3.10, 10.2, 10.3; PRD-BKG-006 to PRD-BKG-008; DEC-130; S2-F01-T04): a GRN line
// linked to the booking line it delivers, from which alone a line's delivered quantity comes. `receiving` calls it in
// its own command, at a GRN's issue for each counted line of an Arrival that names the booking, and when Booking links
// a GRN line received without a booking, or one sent for review, later (S2-F02-T04). The call joins the caller's
// transaction, which holds the booking's identity row at step 1 with its own records (code-house-rules 8.2), so a link
// and a booking's decisions never interleave; the caller has authorised the person, who needs a grant on
// `booking.booking` at the booking's Site and brand, since the link rows are scoped as the booking's are (6.2). The
// link is dated, names who made it, and never changes the GRN, whose rows are `receiving`'s.

/** The GRN line a link names: the GRN, its line, and the Site where the goods were counted (`receiving`'s). */
export interface GrnLineRef {
  readonly grnId: string;
  readonly grnLineId: string;
  readonly siteId: string;
}

/** Who links: the person issuing the GRN or making the later link, and the assignment Authorise used. */
export interface Linker {
  readonly userId: string;
  readonly roleAssignmentId: string;
}

/** A GRN line counted at its GRN's issue, against the booking its Arrival names (goods-in 3.7). */
export interface ReceiptAtIssue {
  readonly bookingId: string;
  readonly grnLine: GrnLineRef;
  readonly goods: ReceivedGoods;
  /** The pieces counted on it that are delivered: received in any condition, never those recorded as not received. */
  readonly quantity: number;
}

/**
 * What a GRN line's link at issue answers (goods-in 3.7): linked to the one booking line it matches, or sent to
 * Booking for review, with why: it matches none or more than one line, it was counted at a Site that is not the
 * booking's destination, or the booking has no approved version to receive against (3.4).
 */
export type ReceiptLinked =
  | { readonly kind: 'linked'; readonly linkId: string; readonly lineKey: string }
  | {
      readonly kind: 'review';
      readonly reason: 'no-match' | 'ambiguous' | 'other-site' | 'not-approved';
    };

/** The booking held by the caller at step 1, read under its lock; a call without the lock is a defect (8.2). */
async function heldBooking(context: TransactionContext, bookingId: string): Promise<BookingRow | undefined> {
  if (context.heldLock(lockTable('booking', 'booking'), bookingId) === undefined) {
    throw new CommandDefect('A receipt link was made without the booking locked at step 1');
  }
  return bookingRow(context, bookingId);
}

async function linked(context: TransactionContext, grnLineId: string): Promise<boolean> {
  const [row] = await context.tx
    .select({ id: bookingReceiptLink.id })
    .from(bookingReceiptLink)
    .where(eq(bookingReceiptLink.grnLineId, grnLineId));
  return row !== undefined;
}

async function writeLink(
  context: TransactionContext,
  audit: AuditInterface,
  linker: Linker,
  row: BookingRow,
  versionId: string,
  link: {
    readonly lineKey: string;
    readonly grnLine: GrnLineRef;
    readonly quantity: number;
    readonly kind: 'at-issue' | 'later';
    readonly date: string;
  },
): Promise<string> {
  const linkId = uuidv7();
  await context.tx.insert(bookingReceiptLink).values({
    id: linkId,
    bookingId: row.id,
    bookingLineId: link.lineKey,
    ...factsOf(row),
    grnId: link.grnLine.grnId,
    grnLineId: link.grnLine.grnLineId,
    grnSiteId: link.grnLine.siteId,
    quantity: link.quantity,
    kind: link.kind,
    linkedByUserId: linker.userId,
    linkedAt: context.startedAt,
    businessDate: link.date,
  });
  await audit.record(context, {
    actor: { kind: 'user', id: linker.userId },
    roleAssignmentId: linker.roleAssignmentId,
    scope: factsOf(row),
    record: bookingAuditRecord(row.id, versionId),
    operation: 'link-booking-receipt',
    changes: [
      { kind: 'value', field: 'linkId', before: null, after: linkId },
      { kind: 'value', field: 'lineKey', before: null, after: link.lineKey },
      { kind: 'value', field: 'grnLineId', before: null, after: link.grnLine.grnLineId },
      { kind: 'value', field: 'quantity', before: null, after: link.quantity },
      { kind: 'value', field: 'kind', before: null, after: link.kind },
    ],
    source: { kind: 'screen' },
  });
  return linkId;
}

/**
 * Links a GRN line at its GRN's issue to the one line of the booking's version in force it matches (goods-in 3.7;
 * PRD-BKG-007; DEC-130), or answers why it goes to Booking for review; nothing is written then. A GRN line already
 * linked is refused (`booking.receipt-already-linked`).
 */
export async function linkReceiptAtIssue(
  context: TransactionContext,
  audit: AuditInterface,
  linker: Linker,
  receipt: ReceiptAtIssue,
): Promise<Outcome<ReceiptLinked>> {
  const date = await today(context);
  if (typeof date !== 'string') return { kind: 'refusal', refusal: date };
  const row = await heldBooking(context, receipt.bookingId);
  if (row === undefined) return refused('not-found', 'booking.record-not-found', [bookingItem(receipt.bookingId)]);
  if (await linked(context, receipt.grnLine.grnLineId)) {
    return refused('refused', 'booking.receipt-already-linked', [bookingItem(row.id)]);
  }
  const status = await statusOfBooking(context, row.id, date);
  if (status === undefined) return { kind: 'success', answer: { kind: 'review', reason: 'not-approved' } };
  // A GRN at a Site that is not the booking's destination goes to Booking for review (3.7). **Design choice.**
  if (receipt.grnLine.siteId !== row.siteId)
    return { kind: 'success', answer: { kind: 'review', reason: 'other-site' } };
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

/**
 * Links a GRN line to the booking line Booking names, later (goods-in 3.7; PRD-BKG-008): one received without a
 * booking, or one sent for review. The line is one of the version in force; the link is dated and names who made it.
 */
export async function linkReceiptLater(
  context: TransactionContext,
  audit: AuditInterface,
  linker: Linker,
  link: {
    readonly bookingId: string;
    readonly lineKey: string;
    readonly grnLine: GrnLineRef;
    readonly quantity: number;
  },
): Promise<Outcome<{ readonly linkId: string }>> {
  const date = await today(context);
  if (typeof date !== 'string') return { kind: 'refusal', refusal: date };
  const row = await heldBooking(context, link.bookingId);
  if (row === undefined) return refused('not-found', 'booking.record-not-found', [bookingItem(link.bookingId)]);
  const approval = await approvalInForce(context, row.id);
  const status = approval === undefined ? undefined : await statusOfBooking(context, row.id, date);
  if (status === undefined) return refused('refused', 'booking.not-approved', [bookingItem(row.id)]);
  if (!status.lines.some((line) => line.lineKey === link.lineKey)) {
    return refused('refused', 'booking.line-not-found', [lineItem(row.id, link.lineKey)]);
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
