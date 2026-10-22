import type { BookingStatus, ReviewReason } from '@apparel-os/schemas';
import { goodsOfLine, matchReceipt, type ReceivedGoods } from './lifecycle.js';

// The rules of receiving against a booking (goods-in 3.7, 4.10; PRD-BKG-007, PRD-BKG-008; POL-05.08; DEC-130;
// S2-F02-T04). Pure: no database, no clock (code-house-rules 2). A GRN line delivers pieces to a booking line only when
// its goods are the line's (lifecycle.ts, `goodsOfLine`); "Late or excess goods may be recorded into physical custody,
// but require approval before acceptance into the booking" (POL-05.08): goods that arrived after the delivery window,
// as extended, or beyond the line's outstanding balance, are linked only once a different person approves it, as the
// product owner decided on 22 Oct 2026 (RR-577).

/** The approved version in force a GRN line is received against, with its destination and supplier (3.7). */
export interface InForce {
  readonly destinationSiteId: string;
  readonly supplierPartyId: string;
  readonly status: BookingStatus;
}

/** Where and when goods arrived, and from whom: the GRN's Site, its Arrival's supplier and its arrival date (4.2). */
export interface Delivery {
  readonly siteId: string;
  readonly supplierPartyId: string;
  readonly arrivalDate: string;
}

// Why a GRN line goes to Booking for review at its GRN's issue rather than linking (goods-in 3.7) is one of
// `reviewReasonSchema`'s reasons, the one list of them (packages/schemas).

/** What one GRN line's issue answers: linked to the booking line, or sent for review, naming the line it matches. */
export type AtIssue =
  | { readonly kind: 'link'; readonly lineKey: string }
  | { readonly kind: 'review'; readonly reason: ReviewReason; readonly lineKey: string | null };

/** The GRN a link names: the GRN, and the Site where its goods were counted (`receiving`'s). */
export interface GrnRef {
  readonly grnId: string;
  readonly siteId: string;
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
  readonly receipts: readonly (LaterReceipt & { readonly grnLineId: string })[];
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

/** Whether goods arriving on a date are late, and pieces beyond what is left outstanding are excess (POL-05.08). */
function acceptance(windowTo: string, arrivalDate: string, quantity: number, left: number) {
  return { late: arrivalDate > windowTo, excess: quantity > left };
}

/**
 * The GRN lines of one GRN at its issue, in their order (goods-in 3.7, 4.10; PRD-BKG-007; POL-05.08): each links to
 * the one line of the version in force its goods match, unless it goes to Booking for review: the whole GRN when the
 * booking has no approved version, when it was counted at a Site that is not the destination, or when the version in
 * force names another supplier; a line with no identity, or matching none or more than one line; a line that arrived
 * after the window's end as extended (late: an early arrival is not); and a line whose pieces are beyond the matched
 * line's outstanding balance, less what the GRN's earlier lines link to it (excess). A late or excess line goes to
 * review whole, so it is accepted into the booking only with approval: **Design choice** (goods-in 3.7). A line both
 * late and excess is named late.
 */
export function receiptsAtIssue(
  inForce: InForce | undefined,
  delivery: Delivery,
  receipts: readonly { readonly goods: ReceivedGoods | null; readonly quantity: number }[],
): AtIssue[] {
  const all = (reason: ReviewReason): AtIssue[] =>
    receipts.map(() => ({ kind: 'review', reason, lineKey: null }) as const);
  if (inForce === undefined) return all('not-approved');
  if (delivery.siteId !== inForce.destinationSiteId) return all('other-site');
  if (delivery.supplierPartyId !== inForce.supplierPartyId) return all('other-supplier');
  const { lines, deliveryWindow } = inForce.status;
  const left = new Map(lines.map((line) => [line.lineKey, line.outstanding]));
  return receipts.map((receipt): AtIssue => {
    if (receipt.goods === null) return { kind: 'review', reason: 'no-match', lineKey: null };
    const match = matchReceipt(lines, receipt.goods);
    if (match.kind === 'review') return { kind: 'review', reason: match.reason, lineKey: null };
    const remaining = left.get(match.lineKey) ?? 0;
    const { late, excess } = acceptance(deliveryWindow.to, delivery.arrivalDate, receipt.quantity, remaining);
    if (late) return { kind: 'review', reason: 'late', lineKey: match.lineKey };
    if (excess) return { kind: 'review', reason: 'excess', lineKey: match.lineKey };
    left.set(match.lineKey, remaining - receipt.quantity);
    return { kind: 'link', lineKey: match.lineKey };
  });
}

/** A GRN line Booking links later to the booking line it names (goods-in 3.7; PRD-BKG-008). */
export interface LaterReceipt {
  readonly lineKey: string;
  /** The goods the GRN line counted, or the product Booking named for unidentified goods. */
  readonly goods: ReceivedGoods;
  /** The pieces delivered, as at issue. */
  readonly quantity: number;
  /** The business date the goods arrived on (goods-in 4.2). */
  readonly arrivalDate: string;
}

/** What Booking's later link of each line takes: a link now, or a different person's approval first (POL-05.08). */
export type Later =
  { readonly kind: 'link' } | { readonly kind: 'approval'; readonly late: boolean; readonly excess: boolean };

/**
 * Booking's later link of GRN lines to the lines of the version in force it names, in their order (goods-in 3.7, 4.10;
 * PRD-BKG-008; POL-05.08): refused, naming the line, when a line is not of the version in force (`booking.line-not-found`)
 * or the GRN line's goods are not its goods (`booking.goods-not-of-line`), so a receipt link always names a line its
 * goods match; otherwise each links now, unless its goods arrived after the window's end as extended now, or its pieces
 * are beyond the line's outstanding less what the earlier lines link now, when it waits for a different person's
 * approval (POL-05.08; RR-577).
 */
export function laterLinks(
  inForce: InForce,
  receipts: readonly LaterReceipt[],
):
  | { readonly kind: 'classified'; readonly receipts: readonly Later[] }
  | {
      readonly kind: 'refused';
      readonly code: 'booking.line-not-found' | 'booking.goods-not-of-line';
      readonly lineKey: string;
    } {
  const { lines, deliveryWindow } = inForce.status;
  const left = new Map(lines.map((line) => [line.lineKey, line.outstanding]));
  const classified: Later[] = [];
  for (const receipt of receipts) {
    const line = lines.find((each) => each.lineKey === receipt.lineKey);
    if (line === undefined) return { kind: 'refused', code: 'booking.line-not-found', lineKey: receipt.lineKey };
    if (!goodsOfLine(line, receipt.goods)) {
      return { kind: 'refused', code: 'booking.goods-not-of-line', lineKey: receipt.lineKey };
    }
    const remaining = left.get(line.lineKey) ?? 0;
    const { late, excess } = acceptance(deliveryWindow.to, receipt.arrivalDate, receipt.quantity, remaining);
    if (late || excess) {
      classified.push({ kind: 'approval', late, excess });
      continue;
    }
    left.set(line.lineKey, remaining - receipt.quantity);
    classified.push({ kind: 'link' });
  }
  return { kind: 'classified', receipts: classified };
}
