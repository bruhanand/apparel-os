import type { BookingAmendmentProposed, BookingExtensionDraft } from '@apparel-os/schemas';
import type { TransactionContext } from '../../../kernel/index.js';
import { bookingItem, lineItem } from '../domain/bookings.js';
import { extendableDateOf } from '../domain/lifecycle.js';
import { approvedForChange, statusInForce } from './approved-booking.js';
import { refusalOf, refused, today, type Outcome } from './common.js';
import type { Actor, BookingCommandDependencies } from './draft.js';
import { proposeAmendment } from './propose-amendment.js';

/**
 * Proposes extending the delivery window (goods-in 3.5, 3.8, 3.10; POL-05.07; S2-F01-T04), for a different person to
 * approve: the window's new end, no earlier than its end now, and new delivery dates for the lines named, each later
 * than the line's own date now or, where it has none, the window's end; something must be later
 * (`booking.not-an-extension`). Refused while another extension waits for its decision (proposeAmendment).
 */
export async function proposeExtension(
  context: TransactionContext,
  dependencies: BookingCommandDependencies,
  actor: Actor,
  bookingId: string,
  draft: BookingExtensionDraft,
): Promise<Outcome<BookingAmendmentProposed>> {
  const date = await today(context);
  if (typeof date !== 'string') return refusalOf(date);
  const found = await approvedForChange(context, bookingId, draft.versionToken);
  if (found.kind !== 'approved') return found;
  const status = await statusInForce(context, found.row.id, date);
  for (const named of draft.lines) {
    const line = status.lines.find((each) => each.lineKey === named.lineKey);
    if (line === undefined) {
      return refused('refused', 'booking.line-not-found', [lineItem(found.row.id, named.lineKey)]);
    }
    if (named.deliveryDate <= extendableDateOf(line)) {
      return refused('refused', 'booking.not-an-extension', [lineItem(found.row.id, named.lineKey)]);
    }
  }
  const windowTo = status.deliveryWindow.to;
  if (draft.windowTo < windowTo || (draft.windowTo === windowTo && draft.lines.length === 0)) {
    return refused('refused', 'booking.not-an-extension', [bookingItem(found.row.id)]);
  }
  return proposeAmendment(context, dependencies, actor, found, {
    kind: 'extension',
    windowTo: draft.windowTo,
    lines: draft.lines.map((line) => ({ lineKey: line.lineKey, deliveryDate: line.deliveryDate })),
    communication: draft.communication,
  });
}
