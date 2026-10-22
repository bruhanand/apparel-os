import { paise, type Paise } from '@apparel-os/domain';

// A booking's totals (goods-in 3.1, 3.9; PRD-BKG-003; S2-F01-T03): one rule, shared by `booking` on the server and the
// web app's booking screens, so the screen shows as typed what the server records (shared-calculations 2.1, 2.2).

/** A line's style, quantity and prices, as the totals read them: whole pieces, whole paise a piece. */
export interface BookingTotalsLine {
  readonly styleCode: string;
  readonly quantity: number;
  readonly indicativeCost: number;
  readonly mrp: number;
}

/** Pieces, indicative cost value and MRP value. */
export interface BookingAmounts {
  readonly pieces: number;
  readonly cost: Paise;
  readonly mrp: Paise;
}

/** The totals of one style, named by its style code as first written, without spaces at the ends. */
export interface BookingStyleAmounts extends BookingAmounts {
  readonly styleCode: string;
}

/**
 * The totals of a booking and of each style, in the order each style first appears (goods-in 3.1; PRD-BKG-003). A
 * style is its style code compared ignoring case and spaces at the ends, as a GRN line is matched (3.7). Exact: whole
 * paise times whole pieces, never rounded (PRD-MOD-014); a total beyond a safe integer throws, which the draft's schema
 * refuses first. The booking's value at cost is `booking.cost` (DM-8).
 */
export function bookingTotals(lines: readonly BookingTotalsLine[]): {
  readonly booking: BookingAmounts;
  readonly styles: BookingStyleAmounts[];
} {
  const styles = new Map<string, { styleCode: string; pieces: number; cost: number; mrp: number }>();
  let pieces = 0;
  let cost = 0;
  let mrp = 0;
  for (const line of lines) {
    const key = line.styleCode.trim().toUpperCase();
    const style = styles.get(key) ?? { styleCode: line.styleCode.trim(), pieces: 0, cost: 0, mrp: 0 };
    style.pieces += line.quantity;
    style.cost = paise(style.cost + line.quantity * line.indicativeCost);
    style.mrp = paise(style.mrp + line.quantity * line.mrp);
    styles.set(key, style);
    pieces += line.quantity;
    cost = paise(cost + line.quantity * line.indicativeCost);
    mrp = paise(mrp + line.quantity * line.mrp);
  }
  return {
    booking: { pieces, cost: paise(cost), mrp: paise(mrp) },
    styles: [...styles.values()].map((style) => ({
      styleCode: style.styleCode,
      pieces: style.pieces,
      cost: paise(style.cost),
      mrp: paise(style.mrp),
    })),
  };
}
