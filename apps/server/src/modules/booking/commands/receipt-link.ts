import { uuidv7 } from '@apparel-os/domain';
import { eq } from 'drizzle-orm';
import { CommandDefect, lockTable, type TransactionContext } from '../../../kernel/index.js';
import type { AuditInterface } from '../../audit/index.js';
import { bookingReceiptLink } from '../db/schema.js';
import { bookingAuditRecord } from '../domain/bookings.js';
import type { ReceivedGoods } from '../domain/lifecycle.js';
import { bookingRow, type BookingRow } from '../queries/bookings.js';
import { factsOf } from './draft.js';

// What the two receipt links share (goods-in 3.6, 3.7, 3.10, 10.2, 10.3; PRD-BKG-006 to PRD-BKG-008; DEC-130;
// S2-F01-T04): a GRN line linked to the booking line it delivers, from which alone a line's delivered quantity comes.
// `receiving` calls them in its own command, at a GRN's issue for each counted line of an Arrival that names the
// booking (link-receipt-at-issue.ts), and when Booking links a GRN line received without a booking, or one sent for
// review, later (link-receipt-later.ts; S2-F02-T04). The call joins the caller's transaction, which holds the booking's
// identity row at step 1 with its own records (code-house-rules 8.2), so a link and a booking's decisions never
// interleave; the caller has authorised the person, who needs a grant on `booking.booking` at the booking's Site and
// brand, since the link rows are scoped as the booking's are (6.2). The link is dated, names who made it, and never
// changes the GRN, whose rows are `receiving`'s.

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
 * A GRN line Booking links later to the booking line it names (goods-in 3.7, 3.10; PRD-BKG-008), with the goods the
 * GRN line counted, which must be that line's.
 */
export interface ReceiptLater {
  readonly bookingId: string;
  readonly lineKey: string;
  readonly grnLine: GrnLineRef;
  readonly goods: ReceivedGoods;
  /** The pieces counted on it that are delivered, as at issue. */
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
export async function heldBooking(context: TransactionContext, bookingId: string): Promise<BookingRow | undefined> {
  if (context.heldLock(lockTable('booking', 'booking'), bookingId) === undefined) {
    throw new CommandDefect('A receipt link was made without the booking locked at step 1');
  }
  return bookingRow(context, bookingId);
}

/** Whether the GRN line is linked to a booking line already (`booking.receipt-already-linked`). */
export async function linked(context: TransactionContext, grnLineId: string): Promise<boolean> {
  const [row] = await context.tx
    .select({ id: bookingReceiptLink.id })
    .from(bookingReceiptLink)
    .where(eq(bookingReceiptLink.grnLineId, grnLineId));
  return row !== undefined;
}

/** Writes a receipt link, dated and signed, with its audit record; it is no change of the booking (3.10). */
export async function writeLink(
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
