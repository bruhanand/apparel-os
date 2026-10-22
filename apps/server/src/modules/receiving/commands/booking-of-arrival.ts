import { BOOKING_TYPE } from '@apparel-os/schemas';
import type { TransactionContext } from '../../../kernel/index.js';
import type { BookingInterface } from '../../booking/index.js';
import { recordItem, refused, type Outcome } from './common.js';

// The one check of a booking an Arrival's goods are received against (goods-in 3.4, 3.7, 4.2, 4.10; S2-F02-T04): when
// the Arrival names it, and when Booking links its GRN's lines to it later. A booking the person may not see is not
// found (code-house-rules 12.3); one with no approved version is not approved; one of another brand, or whose version in
// force names another supplier, is not the Arrival's. At the GRN's issue it is checked again under the booking's lock by
// `booking`, where a later change of its supplier sends the lines to review instead (goods-in 4.10).

/** A booking goods may be received against, as `booking` answers it. */
export type Receivable = NonNullable<Awaited<ReturnType<BookingInterface['receivableBooking']>>>;

/** The booking, approved, of the Arrival's brand and supplier; or the refusal naming it. */
export async function bookingOfArrival(
  context: TransactionContext,
  booking: Pick<BookingInterface, 'receivableBooking'>,
  bookingId: string,
  arrival: { readonly brandId: string; readonly supplierPartyId: string },
): Promise<{ readonly kind: 'receivable'; readonly booking: Receivable } | Outcome<never>> {
  const found = await booking.receivableBooking(context, bookingId);
  const item = recordItem(BOOKING_TYPE, bookingId);
  if (found === undefined) return refused('not-found', 'booking.record-not-found', [item]);
  if (found.supplierPartyId === null) return refused('refused', 'booking.not-approved', [item]);
  if (found.brandId !== arrival.brandId || found.supplierPartyId !== arrival.supplierPartyId) {
    return refused('refused', 'receiving.booking-not-of-arrival', [item]);
  }
  return { kind: 'receivable', booking: found };
}
