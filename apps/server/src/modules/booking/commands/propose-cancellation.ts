import type { BookingAmendmentProposed, BookingCancellationDraft } from '@apparel-os/schemas';
import type { TransactionContext } from '../../../kernel/index.js';
import { bookingItem, lineItem } from '../domain/bookings.js';
import { approvedForChange, statusInForce } from './approved-booking.js';
import { refusalOf, refused, today, type Outcome } from './common.js';
import type { Actor, BookingCommandDependencies } from './draft.js';
import { proposeAmendment } from './propose-amendment.js';

/**
 * Proposes cancelling the undelivered balance of the whole booking, or of the lines named, each line's whole
 * outstanding quantity as of today (goods-in 3.5, 3.6, 3.10; POL-05.07, POL-05.10; PRD-BKG-013; S2-F01-T04), for a
 * different person to approve: what is received is never cancelled. A line, or a booking, with nothing outstanding is
 * refused; so is a cancellation while another waits for its decision (proposeAmendment).
 */
export async function proposeCancellation(
  context: TransactionContext,
  dependencies: BookingCommandDependencies,
  actor: Actor,
  bookingId: string,
  draft: BookingCancellationDraft,
): Promise<Outcome<BookingAmendmentProposed>> {
  const date = await today(context);
  if (typeof date !== 'string') return refusalOf(date);
  const found = await approvedForChange(context, bookingId, draft.versionToken);
  if (found.kind !== 'approved') return found;
  const status = await statusInForce(context, found.row.id, date);
  let lines: { readonly lineKey: string; readonly quantity: number }[];
  if (draft.scope.kind === 'whole') {
    lines = status.lines
      .filter((line) => line.outstanding > 0)
      .map((line) => ({ lineKey: line.lineKey, quantity: line.outstanding }));
    if (lines.length === 0) return refused('refused', 'booking.nothing-outstanding', [bookingItem(found.row.id)]);
  } else {
    lines = [];
    for (const lineKey of draft.scope.lineKeys) {
      const line = status.lines.find((each) => each.lineKey === lineKey);
      if (line === undefined) return refused('refused', 'booking.line-not-found', [lineItem(found.row.id, lineKey)]);
      if (line.outstanding === 0) {
        return refused('refused', 'booking.nothing-outstanding', [lineItem(found.row.id, lineKey)]);
      }
      lines.push({ lineKey, quantity: line.outstanding });
    }
  }
  return proposeAmendment(context, dependencies, actor, found, {
    kind: 'cancellation',
    windowTo: null,
    lines,
    communication: draft.communication,
  });
}
