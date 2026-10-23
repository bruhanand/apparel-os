import { GRN_TYPE, lineFindings, type GrnBookingLinksDraft } from '@apparel-os/schemas';
import { and, eq, inArray } from 'drizzle-orm';
import type { TransactionContext } from '../../../kernel/index.js';
import type { BookingInterface, ReceiptsLater, ReceiptsLinked } from '../../booking/index.js';
import { grnLine } from '../db/schema.js';
import { GRN_LINE_TYPE } from '../domain/kinds.js';
import { grnRow } from '../queries/grns.js';
import { bookingOfArrival } from './booking-of-arrival.js';
import { namedProductsOf } from '../queries/held-lines.js';
import { recountedCounts } from '../queries/recounts.js';
import { lockArrival, recordItem, recordNotFound, refusalOf, refused, type Actor, type Outcome } from './common.js';

// Booking's later link of GRN lines to the lines of one booking (goods-in 3.7, 3.10, 4.10, 10.2, 10.3; PRD-BKG-008;
// POL-05.08; DEC-130; S2-F02-T04): a GRN received without a booking, or lines sent to Booking for review at its issue.
// `receiving` reads its GRN's lines and hands `booking` what they counted, which links each within the delivery window
// and the booking line's outstanding now, and proposes the late or excess ones for a different person's approval
// (POL-05.08). The link is `booking`'s record: the GRN is never changed (PRD-REC-019).

/** What the later link needs: `booking`, whose receipt link it is (goods-in 10.2). */
export interface LinkToBookingDependencies {
  readonly booking: Pick<BookingInterface, 'bookingLockTarget' | 'receivableBooking' | 'linkReceiptsLater'>;
}

/**
 * Links GRN lines of one GRN to the lines of the booking named (goods-in 3.7, 4.10). Takes, at step 1 in one call, the
 * GRN's Arrival, so two links of one GRN never interleave, and the booking, as every receipt link does
 * (code-house-rules 8.2); then, under the locks: the booking one the person may see, approved, of the Arrival's brand
 * and of the supplier of its version in force (`receiving.booking-not-of-arrival`), at any Site (3.7); each line named
 * a line of the GRN that received pieces (`receiving.nothing-received`), its goods those it counted, or, for
 * unidentified goods, the product Booking named for them (`receiving.product-not-named`; 4.6), and its pieces those
 * received in any condition, never those recorded as not received (3.6), as the line's latest approved recount counts
 * them (4.11). `booking` does the rest.
 */
export async function linkToBooking(
  context: TransactionContext,
  dependencies: LinkToBookingDependencies,
  actor: Actor,
  grnId: string,
  draft: GrnBookingLinksDraft,
): Promise<Outcome<ReceiptsLinked>> {
  const issued = await grnRow(context, grnId);
  if (issued === undefined) return refusalOf(recordNotFound(GRN_TYPE, grnId));
  const row = await lockArrival(context, issued.arrivalId, [dependencies.booking.bookingLockTarget(draft.bookingId)]);
  if (row === undefined) return refusalOf(recordNotFound(GRN_TYPE, grnId));
  const against = await bookingOfArrival(context, dependencies.booking, draft.bookingId, row);
  if (against.kind !== 'receivable') return against;
  const { booking } = against;
  const named = draft.lines.map((line) => line.grnLineId);
  const rows = await context.tx
    .select()
    .from(grnLine)
    .where(and(eq(grnLine.grnId, grnId), inArray(grnLine.id, named)));
  const products = await namedProductsOf(context, named);
  // The pieces as the line's latest approved recount counts them: delivered quantities follow the count (goods-in
  // 4.11; S2-F02-T05).
  const recounted = await recountedCounts(context, named);
  const receipts: ReceiptsLater['receipts'][number][] = [];
  for (const line of draft.lines) {
    const found = rows.find((each) => each.id === line.grnLineId);
    if (found === undefined) return refusalOf(recordNotFound(GRN_LINE_TYPE, line.grnLineId));
    const received = lineFindings({
      ...found,
      countedQuantity: recounted.get(found.id) ?? found.countedQuantity,
    }).received;
    if (received === 0) return refused('refused', 'receiving.nothing-received', [recordItem(GRN_LINE_TYPE, found.id)]);
    let goods: ReceiptsLater['receipts'][number]['goods'];
    if (found.goods === 'unidentified' || found.styleCode === null) {
      const product = products.get(found.id);
      if (product === undefined) {
        return refused('refused', 'receiving.product-not-named', [recordItem(GRN_LINE_TYPE, found.id)]);
      }
      goods = { styleCode: product.styleCode, colour: product.colour, size: product.size?.code ?? null };
    } else {
      goods = { styleCode: found.styleCode, colour: found.colour, size: found.sizeCode };
    }
    receipts.push({
      grnLineId: found.id,
      lineKey: line.lineKey,
      goods,
      quantity: received,
      arrivalDate: row.arrivalDate,
    });
  }
  return dependencies.booking.linkReceiptsLater(context, actor, {
    bookingId: booking.bookingId,
    grn: { grnId, grnNumber: issued.number, siteId: row.siteId },
    receipts,
  });
}
