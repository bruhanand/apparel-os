import { textKey } from '@apparel-os/calculations/booking';
import type { BookingLineStatus, Grn, GrnLine, GrnLineBooking, ReviewReason } from '@apparel-os/schemas';

// The GRN's lines against bookings, as the GRN shows them and as Booking links them later (goods-in 3.7, 4.10, section
// 11; PRD-BKG-007, PRD-BKG-008; POL-05.08; S2-F02-T04). Pure: the screen's rules, kept apart so they are tested.

/** What a GRN line counted, as a booking line is matched on it: its style code, colour and size (goods-in 3.7). */
export interface CountedGoods {
  readonly styleCode: string;
  readonly colour: string | null;
  readonly size: string | null;
}

/**
 * The lines of a booking whose goods a GRN line's are (goods-in 3.7; DEC-130), as the server checks them: the style
 * code matches, and the colour and size where the booking line gives them, compared ignoring case and spaces at the
 * ends by the shared `textKey`, so the screen offers only lines the server accepts.
 */
export function matchingLines(lines: readonly BookingLineStatus[], goods: CountedGoods): readonly BookingLineStatus[] {
  const given = (booked: string | null, counted: string | null) =>
    booked === null || (counted !== null && textKey(booked) === textKey(counted));
  return lines.filter(
    (line) =>
      textKey(line.styleCode) === textKey(goods.styleCode) &&
      given(line.colour, goods.colour) &&
      given(line.size, goods.size),
  );
}

/** The goods a GRN line counted, or the product Booking named for unidentified goods; none while none is named. */
export function goodsOf(line: GrnLine): CountedGoods | null {
  if (line.styleCode !== null) return { styleCode: line.styleCode, colour: line.colour, size: line.size };
  const named = line.heldLine?.named;
  return named === undefined || named === null
    ? null
    : { styleCode: named.styleCode, colour: named.colour, size: named.size?.code ?? null };
}

/** Where a GRN line stands against bookings, as the GRN's Booking column says it (goods-in 4.10). */
export type Standing =
  | { readonly kind: 'linked'; readonly bookingId: string; readonly lineKey: string; readonly approved: boolean }
  | { readonly kind: 'proposed'; readonly bookingId: string }
  | {
      readonly kind: 'review';
      readonly bookingId: string;
      readonly reason: ReviewReason;
      /** The booking line a late or excess line matches, which a proposal links it to; none otherwise. */
      readonly lineKey: string | null;
    }
  | { readonly kind: 'unbooked' }
  | { readonly kind: 'nothing-received' }
  /** Linked at issue to a booking the reader may not see now: shown as it was linked, its link Unknown. */
  | { readonly kind: 'linked-unseen'; readonly bookingId: string };

/**
 * A GRN line's standing (goods-in 3.7, 4.10): its link now, as far as the reader may see bookings, then a proposal of it
 * waiting, then what its GRN's issue did with it; a line that received nothing, as recounted where it is, delivers
 * nothing.
 */
export function standingOf(line: GrnLine, links: GrnLineBooking | undefined): Standing {
  const link = links?.link ?? null;
  if (link !== null) {
    return { kind: 'linked', bookingId: link.bookingId, lineKey: link.lineKey, approved: link.proposalId !== null };
  }
  const proposal = links?.proposal ?? null;
  if (proposal !== null) return { kind: 'proposed', bookingId: proposal.bookingId };
  const atIssue = links?.atIssue ?? null;
  if (atIssue?.outcome === 'review') {
    return { kind: 'review', bookingId: atIssue.bookingId, reason: atIssue.reason, lineKey: atIssue.lineKey };
  }
  if (atIssue?.outcome === 'linked') return { kind: 'linked-unseen', bookingId: atIssue.bookingId };
  // The pieces as the line's latest approved recount counts them, as the later link takes them (goods-in 4.11).
  const received = line.recounted?.findings.received ?? line.findings.received;
  return received === 0 ? { kind: 'nothing-received' } : { kind: 'unbooked' };
}

/**
 * The GRN's lines Booking may link later (goods-in 3.7, 4.10; PRD-BKG-008): those that received pieces, not linked and
 * with no proposal waiting, as far as the reader sees, sent for review or received without a booking.
 */
export function linkableLines(grn: Grn): readonly GrnLine[] {
  return grn.lines.filter((line) => {
    const standing = standingOf(
      line,
      grn.bookingLinks.find((each) => each.grnLineId === line.id),
    );
    return standing.kind === 'review' || standing.kind === 'unbooked';
  });
}
