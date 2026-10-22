import { textKey } from '@apparel-os/calculations/booking';
import { paise } from '@apparel-os/domain';
import type { BookingLineStatus, BookingState, BookingStatus } from '@apparel-os/schemas';
import type { BookingChangeKind } from '../db/schema.js';

// The rules of an approved booking's lifecycle (goods-in 3.4 to 3.8, 3.10; PRD-BKG-005 to PRD-BKG-009, PRD-BKG-013;
// POL-05.01, POL-05.02, POL-05.04 to POL-05.07; DEC-130; S2-F01-T04). Pure: no database, no clock (code-house-rules 2).
// Text is compared as a GRN line is matched, by the shared calculations' `textKey`, which `receiving` applies too
// (goods-in 3.7).

/** One line of the approved version in force, by its key (goods-in 3.10). */
export interface StatusLine {
  readonly lineKey: string;
  readonly lineNumber: number;
  readonly styleCode: string;
  readonly colour: string | null;
  readonly size: string | null;
  readonly quantity: number;
  readonly indicativeCost: number;
  readonly deliveryDate: string | null;
}

/** An approved extension of the version in force: the window's new end and the lines' new dates by key (3.5). */
export interface ApprovedExtension {
  readonly windowTo: string;
  readonly lines: ReadonlyMap<string, string>;
}

/** What a booking's status is read from (goods-in 3.6, 3.8). */
export interface StatusInputs {
  readonly version: {
    readonly id: string;
    readonly versionNumber: number;
    readonly windowFrom: string;
    readonly windowTo: string;
  };
  readonly lines: readonly StatusLine[];
  /** Pieces delivered to each line by key, from its receipt links only (PRD-BKG-006). */
  readonly delivered: ReadonlyMap<string, number>;
  /** Pieces cancelled of each line by key, by approved cancellations (PRD-BKG-005). */
  readonly cancelled: ReadonlyMap<string, number>;
  /** The approved extensions of the version in force, in the order decided. */
  readonly extensions: readonly ApprovedExtension[];
}

const later = (a: string, b: string): string => (a > b ? a : b);

/**
 * The booking status of the version in force on a business date (goods-in 3.6, 3.8, 9.3; PRD-BKG-005): for each line,
 * ordered, delivered, cancelled, outstanding (ordered less delivered less cancelled, never below zero) and
 * over-delivered (delivered beyond ordered); its own delivery date, where it has one, as the latest approved extension
 * naming it left it, shown only; its due date, the window's end as the approved extensions left it; and overdue once
 * the window has passed with something outstanding: "When the delivery window expires, mark the remaining balance
 * overdue" (POL-05.06). Whether a line's own date should also make it overdue is the product owner's (RR-576).
 */
export function statusOf(inputs: StatusInputs, today: string): BookingStatus {
  let windowTo = inputs.version.windowTo;
  const dates = new Map<string, string>();
  for (const extension of inputs.extensions) {
    windowTo = later(windowTo, extension.windowTo);
    for (const [key, date] of extension.lines) dates.set(key, date);
  }
  const lines = inputs.lines.map((line): BookingLineStatus => {
    const delivered = inputs.delivered.get(line.lineKey) ?? 0;
    const cancelled = inputs.cancelled.get(line.lineKey) ?? 0;
    const outstanding = Math.max(0, line.quantity - delivered - cancelled);
    const deliveryDate = dates.get(line.lineKey) ?? line.deliveryDate;
    return {
      lineKey: line.lineKey,
      lineNumber: line.lineNumber,
      styleCode: line.styleCode,
      colour: line.colour,
      size: line.size,
      indicativeCost: paise(line.indicativeCost),
      deliveryDate,
      dueDate: windowTo,
      ordered: line.quantity,
      delivered,
      cancelled,
      outstanding,
      overDelivered: Math.max(0, delivered - line.quantity),
      overdue: outstanding > 0 && windowTo < today,
    };
  });
  const sum = (field: 'ordered' | 'delivered' | 'cancelled' | 'outstanding' | 'overDelivered') =>
    lines.reduce((total, line) => total + line[field], 0);
  return {
    versionId: inputs.version.id,
    versionNumber: inputs.version.versionNumber,
    deliveryWindow: { from: inputs.version.windowFrom, to: windowTo },
    lines,
    totals: {
      ordered: sum('ordered'),
      delivered: sum('delivered'),
      cancelled: sum('cancelled'),
      outstanding: sum('outstanding'),
      overDelivered: sum('overDelivered'),
    },
  };
}

/**
 * The date an extension must move a line past (goods-in 3.5, 3.10): its own delivery date now, as extended, where it
 * has one, otherwise the window's end now. An extension names a line only to give it a later date.
 */
export const extendableDateOf = (line: Pick<BookingLineStatus, 'deliveryDate' | 'dueDate'>): string =>
  line.deliveryDate ?? line.dueDate;

/** A line of a change, as it is checked against the version in force. */
export interface ChangedLine {
  readonly lineKey?: string | undefined;
  readonly styleCode: string;
  readonly colour: string | null;
  readonly size: string | null;
  readonly quantity: number;
}

const sameText = (a: string | null, b: string | null): boolean =>
  a === null || b === null ? a === b : textKey(a) === textKey(b);

/**
 * Why a change after approval is refused, or undefined (goods-in 3.5, 3.10; PRD-BKG-013, POL-05.04): every line of the
 * version in force with goods delivered or a balance cancelled is kept, at no fewer pieces than those
 * (`booking.line-below-received`), and a line with goods delivered keeps its style code, colour and size, compared as
 * a GRN line is matched (`booking.line-received`), so a receipt link always names a line the goods match. **Design
 * choice.**
 */
export function changeRefusal(
  inForce: BookingStatus,
  lines: readonly ChangedLine[],
): { readonly code: 'booking.line-below-received' | 'booking.line-received'; readonly lineKey: string } | undefined {
  for (const kept of inForce.lines) {
    const held = kept.delivered + kept.cancelled;
    const next = lines.find((each) => each.lineKey === kept.lineKey);
    if (held > 0 && (next === undefined || next.quantity < held)) {
      return { code: 'booking.line-below-received', lineKey: kept.lineKey };
    }
    if (
      next !== undefined &&
      kept.delivered > 0 &&
      !(
        sameText(next.styleCode, kept.styleCode) &&
        sameText(next.colour, kept.colour) &&
        sameText(next.size, kept.size)
      )
    ) {
      return { code: 'booking.line-received', lineKey: kept.lineKey };
    }
  }
  return undefined;
}

/**
 * The value at cost a version commits of open-to-buy (goods-in 3.3, 3.5; POL-05.02; DM-8): each line's pieces less
 * those cancelled of it, at its indicative cost, exact in whole paise (PRD-MOD-014). A change keeps every line's
 * delivered pieces (changeRefusal), so received goods keep their share reserved.
 */
export function committedValue(
  lines: readonly {
    readonly lineKey: string | undefined;
    readonly quantity: number;
    readonly indicativeCost: number;
  }[],
  cancelled: ReadonlyMap<string, number>,
): number {
  let total = 0;
  for (const line of lines) {
    const kept = line.quantity - (line.lineKey === undefined ? 0 : (cancelled.get(line.lineKey) ?? 0));
    total = paise(total + Math.max(0, kept) * line.indicativeCost);
  }
  return paise(total);
}

/**
 * A booking's state (POL-05.01; goods-in 3.4): before its first approval, from its newest change of content, Awaiting
 * approval after a submission and a Draft otherwise; once approved, the state of the version in force: Confirmed once
 * the supplier's acceptance of it is recorded, Issued once its issue is, Approved before.
 */
export function lifecycleOf(facts: {
  readonly approved: boolean;
  readonly issued: boolean;
  readonly confirmed: boolean;
  readonly newestContent: BookingChangeKind;
}): BookingState {
  if (!facts.approved) return facts.newestContent === 'submission' ? 'Awaiting approval' : 'Draft';
  if (facts.confirmed) return 'Confirmed';
  return facts.issued ? 'Issued' : 'Approved';
}

/** The kinds of change that make or decide a version's content, as against the lifecycle's (3.10). */
export const CONTENT_CHANGES: readonly BookingChangeKind[] = [
  'draft',
  'documents',
  'submission',
  'approval',
  'rejection',
];

/** What a GRN line's goods are matched on (goods-in 3.7). */
export interface ReceivedGoods {
  readonly styleCode: string;
  readonly colour: string | null;
  readonly size: string | null;
}

/**
 * Whether a GRN line's goods are the goods of a booking line (goods-in 3.7, 3.10; PRD-BKG-007, PRD-BKG-008; DEC-130):
 * its style code matches, and its colour and size match where the booking line gives them, text compared ignoring case
 * and spaces at the ends; a booking line that gives a colour or a size matches no GRN line without one. **Design
 * choice** for the comparison.
 */
export function goodsOfLine(line: Pick<StatusLine, 'styleCode' | 'colour' | 'size'>, goods: ReceivedGoods): boolean {
  const given = (booked: string | null, received: string | null) =>
    booked === null || (received !== null && textKey(booked) === textKey(received));
  return (
    textKey(line.styleCode) === textKey(goods.styleCode) &&
    given(line.colour, goods.colour) &&
    given(line.size, goods.size)
  );
}

/**
 * The one line of the version in force a GRN line delivers (goods-in 3.7; PRD-BKG-007; DEC-130): the line whose goods
 * it is (goodsOfLine). None, or more than one, goes to Booking for review.
 */
export function matchReceipt(
  lines: readonly Pick<StatusLine, 'lineKey' | 'styleCode' | 'colour' | 'size'>[],
  goods: ReceivedGoods,
):
  | { readonly kind: 'matched'; readonly lineKey: string }
  | { readonly kind: 'review'; readonly reason: 'no-match' | 'ambiguous' } {
  const candidates = lines.filter((line) => goodsOfLine(line, goods));
  const [only] = candidates;
  if (only === undefined) return { kind: 'review', reason: 'no-match' };
  if (candidates.length > 1) return { kind: 'review', reason: 'ambiguous' };
  return { kind: 'matched', lineKey: only.lineKey };
}
