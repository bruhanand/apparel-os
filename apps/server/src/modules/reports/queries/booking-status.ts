import { BOOKING_TYPE, type BookingStatusFilters, type BookingStatusReport } from '@apparel-os/schemas';
import type { ReadModelGateway, TransactionContext } from '../../../kernel/index.js';
import type { AccessInterface } from '../../access/index.js';
import { BOOKING_STATUSES } from '../../booking/index.js';
import { viewable } from './authority.js';
import { namesOf } from './names.js';

// The booking status report (goods-in 3.6, 3.10, 9.3, 9.5; PRD-BKG-005, PRD-BKG-006; S2-F11-T02): per booking and line,
// ordered, delivered, outstanding, cancelled and overdue, by brand, season, supplier, destination and state, read
// through the read-model gateway as `booking`'s `bookingStatus` answers it, with the GRN lines each line's delivered
// pieces came from (the drill-down). Each booking is shown to a reader whose grant of view on bookings covers its
// destination and brand (access-and-approvals 5.3); the page may then hold fewer, its cursor still moving past them.

export interface BookingStatusRequest {
  readonly filters: BookingStatusFilters;
  readonly after?: string;
  readonly limit: number;
  /** The business date the windows are compared with (code-house-rules 9). */
  readonly today: string;
}

export async function bookingStatusReport(
  gateway: ReadModelGateway,
  access: AccessInterface,
  context: TransactionContext,
  actorId: string,
  request: BookingStatusRequest,
): Promise<BookingStatusReport> {
  const read = await gateway.read(context, BOOKING_STATUSES, {
    ...request.filters,
    ...(request.after === undefined ? {} : { after: request.after }),
    limit: request.limit,
    today: request.today,
  });
  const page = read.answer.bookings;
  const shown = await viewable(
    access,
    context,
    actorId,
    BOOKING_TYPE,
    page.map((each) => ({ siteId: each.destinationSiteId, brandId: each.brandId })),
  );
  const bookings = page.filter((_, at) => shown[at] === true);
  const { names } = await namesOf(
    gateway,
    access,
    context,
    {
      siteIds: bookings.map((each) => each.destinationSiteId),
      brandIds: bookings.map((each) => each.brandId),
      supplierIds: bookings.map((each) => each.supplierPartyId),
      seasonIds: bookings.map((each) => each.seasonValueId),
      grnIds: bookings.flatMap((each) => each.deliveries.map((delivery) => delivery.grnId)),
    },
    request.today,
  );
  return {
    asOf: read.asOf,
    bookings: bookings.map((each) => ({
      bookingId: each.bookingId,
      number: each.number,
      state: each.state,
      brandId: each.brandId,
      seasonValueId: each.seasonValueId,
      supplierPartyId: each.supplierPartyId,
      destinationSiteId: each.destinationSiteId,
      status: each.status,
      deliveries: each.deliveries.map((delivery) => ({ ...delivery })),
    })),
    names,
    next: read.answer.next,
  };
}
