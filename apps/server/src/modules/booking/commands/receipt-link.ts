import { uuidv7 } from '@apparel-os/domain';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { CommandDefect, lockTable, type TransactionContext } from '../../../kernel/index.js';
import type { AuditInterface } from '../../audit/index.js';
import {
  bookingReceiptLink,
  bookingReceiptLinkProposal,
  bookingReceiptLinkProposalDecision,
  bookingReceiptLinkProposalLine,
} from '../db/schema.js';
import { bookingAuditRecord } from '../domain/bookings.js';
import type { ReceivedGoods } from '../domain/lifecycle.js';
import type { Delivery, InForce, ReviewReason } from '../domain/receipts.js';
import { bookingRow, versionWithLines, type BookingRow } from '../queries/bookings.js';
import { approvalInForce, statusOfVersion } from '../queries/lifecycle.js';
import { factsOf } from './draft.js';

// What the receipt links share (goods-in 3.6, 3.7, 3.10, 4.10, 10.2, 10.3; PRD-BKG-006 to PRD-BKG-008; POL-05.08;
// DEC-130; S2-F01-T04, S2-F02-T04): a GRN line linked to the booking line it delivers, from which alone a line's
// delivered quantity comes. `receiving` calls them in its own command: at a GRN's issue for the counted lines of an
// Arrival that names the booking (link-receipt-at-issue.ts), and when Booking links GRN lines later, a GRN received
// without a booking or lines sent for review (link-receipt-later.ts), proposing late or excess goods for a different
// person's approval (POL-05.08), whose decision writes their links (receipt-link-proposal.ts). The call joins the
// caller's transaction, which holds the booking's identity row at step 1 with its own records (code-house-rules 8.2), so
// a link and a booking's decisions never interleave; the caller has authorised the person, who needs a grant on
// `booking.booking` at the booking's Site and brand, since the link rows are scoped as the booking's are (6.2). A link
// is dated, names who made it, and never changes the GRN, whose rows are `receiving`'s.

/** The GRN a link names: the GRN, and the Site where its goods were counted (`receiving`'s). */
export interface GrnRef {
  readonly grnId: string;
  readonly siteId: string;
}

/** Who links: the person issuing the GRN, linking later or deciding a proposal, and the assignment relied on. */
export interface Linker {
  readonly userId: string;
  readonly roleAssignmentId: string;
}

/** The counted lines of a GRN at its issue, against the booking its Arrival names (goods-in 3.7). */
export interface ReceiptsAtIssue {
  readonly bookingId: string;
  readonly grn: GrnRef;
  /** The Arrival's supplier and arrival date, with the GRN's Site. */
  readonly delivery: Delivery;
  readonly receipts: readonly {
    readonly grnLineId: string;
    /** What the line counted, or none for unidentified goods, which match no line. */
    readonly goods: ReceivedGoods | null;
    /** The pieces counted on it that are delivered: received in any condition, never those recorded as not received. */
    readonly quantity: number;
  }[];
}

/** A GRN line sent to Booking for review at its GRN's issue, with why (goods-in 3.7). */
export interface ForReview {
  readonly kind: 'review';
  readonly grnLineId: string;
  readonly reason: ReviewReason;
  /** The booking line a late or excess line matches; none otherwise. */
  readonly lineKey: string | null;
}

/** What a GRN line's issue will do, read before the caller's later locks (goods-in 3.7; code-house-rules 8.2). */
export type PlannedAtIssue =
  { readonly kind: 'link'; readonly grnLineId: string; readonly lineKey: string } | ForReview;

/** What a GRN line's issue did (goods-in 3.7): linked to the booking line, or sent to Booking for review. */
export type ReceiptAtIssue =
  | { readonly kind: 'linked'; readonly grnLineId: string; readonly lineKey: string; readonly linkId: string }
  | ForReview;

/** GRN lines Booking links later to the lines of the booking named (goods-in 3.7, 4.10; PRD-BKG-008). */
export interface ReceiptsLater {
  readonly bookingId: string;
  readonly grn: GrnRef & { readonly grnNumber: string };
  readonly receipts: readonly {
    readonly grnLineId: string;
    readonly lineKey: string;
    /** The goods the GRN line counted, or the product Booking named for unidentified goods. */
    readonly goods: ReceivedGoods;
    /** The pieces delivered, as at issue. */
    readonly quantity: number;
    /** The business date the goods arrived on (goods-in 4.2). */
    readonly arrivalDate: string;
  }[];
}

/** What the later link answers: the lines linked now, and the proposal of the late or excess ones, or none. */
export interface ReceiptsLinked {
  readonly linked: readonly { readonly grnLineId: string; readonly linkId: string; readonly lineKey: string }[];
  readonly proposal: {
    readonly proposalId: string;
    readonly requestId: string;
    readonly grnLineIds: readonly string[];
  } | null;
}

/** A booking goods may be received against, as `receiving` checks it when an Arrival names it (goods-in 3.7, 4.2). */
export interface ReceivableBooking {
  readonly bookingId: string;
  readonly number: string | null;
  readonly siteId: string;
  readonly brandId: string;
  /** The supplier of the approved version in force; none while the booking has no approved version. */
  readonly supplierPartyId: string | null;
}

/** The booking held by the caller at step 1, read under its lock; a call without the lock is a defect (8.2). */
export async function heldBooking(context: TransactionContext, bookingId: string): Promise<BookingRow | undefined> {
  if (context.heldLock(lockTable('booking', 'booking'), bookingId) === undefined) {
    throw new CommandDefect('A receipt link was made without the booking locked at step 1');
  }
  return bookingRow(context, bookingId);
}

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
      and(inArray(bookingReceiptLinkProposalLine.grnLineId, [...grnLineIds]), isNull(bookingReceiptLinkProposalDecision.id)),
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

/** Writes a receipt link, dated and signed, with its audit record; it is no change of the booking (3.10). */
export async function writeLink(
  context: TransactionContext,
  audit: AuditInterface,
  linker: Linker,
  row: BookingRow,
  versionId: string,
  link: {
    readonly lineKey: string;
    readonly grnId: string;
    readonly grnLineId: string;
    readonly grnSiteId: string;
    readonly quantity: number;
    readonly kind: 'at-issue' | 'later';
    readonly date: string;
    readonly proposalId?: string;
    readonly approval?: { readonly decisionId: string };
  },
): Promise<string> {
  const linkId = uuidv7();
  await context.tx.insert(bookingReceiptLink).values({
    id: linkId,
    bookingId: row.id,
    bookingLineId: link.lineKey,
    ...factsOf(row),
    grnId: link.grnId,
    grnLineId: link.grnLineId,
    grnSiteId: link.grnSiteId,
    quantity: link.quantity,
    kind: link.kind,
    linkedByUserId: linker.userId,
    linkedAt: context.startedAt,
    businessDate: link.date,
    proposalId: link.proposalId ?? null,
  });
  await audit.record(context, {
    actor: { kind: 'user', id: linker.userId },
    roleAssignmentId: linker.roleAssignmentId,
    ...(link.approval === undefined ? {} : { approval: link.approval }),
    scope: factsOf(row),
    record: bookingAuditRecord(row.id, versionId),
    operation: 'link-booking-receipt',
    changes: [
      { kind: 'value', field: 'linkId', before: null, after: linkId },
      { kind: 'value', field: 'lineKey', before: null, after: link.lineKey },
      { kind: 'value', field: 'grnLineId', before: null, after: link.grnLineId },
      { kind: 'value', field: 'quantity', before: null, after: link.quantity },
      { kind: 'value', field: 'kind', before: null, after: link.kind },
      ...(link.proposalId === undefined
        ? []
        : [{ kind: 'value' as const, field: 'proposalId', before: null, after: link.proposalId }]),
    ],
    source: { kind: 'screen' },
  });
  return linkId;
}
