import type { BookingInForceState, BookingStatus } from '@apparel-os/schemas';
import { and, asc, desc, eq, inArray, sql, type SQL } from 'drizzle-orm';
import { CommandDefect, declareReadModel, serveReadModel, type TransactionContext } from '../../../kernel/index.js';
import { booking, bookingLine, bookingNumber, bookingReceiptLink, bookingVersion } from '../db/schema.js';
import { statusOf } from '../domain/lifecycle.js';
import { approvedVersionId, stateOfRow } from './bookings.js';
import { cancelledOfBookings, deliveredOfBookings, extensionsOfVersions, statusLines } from './lifecycle.js';

// The booking status read model of the stage 2 reports (goods-in 3.6, 3.10, 9.3, 9.5; module-map section 3 rule 5;
// PRD-BKG-005, PRD-BKG-006; S2-F11-T02), served through the kernel's read-model gateway: a page of the bookings with a
// version in force the reader may see, each with its status as `bookingStatus` answers it (one rule, `statusOf`, read
// for the whole page at once) and its receipt links, the GRN lines its delivered pieces came from. Read in the reader's
// transaction under the reader's actor, so row-level security keeps out what the reader may not see (code-house-rules
// 6.2); the gateway answers the time it was read.

/** Which bookings a read takes, every filter together (goods-in 9.3 "by brand, season, supplier, destination, state"). */
export interface BookingStatusesQuery {
  readonly brandId?: string | undefined;
  readonly seasonValueId?: string | undefined;
  readonly supplierPartyId?: string | undefined;
  readonly destinationSiteId?: string | undefined;
  readonly state?: BookingInForceState | undefined;
  /** The last booking of the page before. */
  readonly after?: string;
  /** The most bookings the page holds; the caller caps it. */
  readonly limit: number;
  /** The business date the windows are compared with (code-house-rules 9). */
  readonly today: string;
}

/** Pieces delivered to a line by one GRN line, its receipt link (goods-in 3.10). */
export interface BookingDelivery {
  readonly lineKey: string;
  readonly grnId: string;
  readonly grnLineId: string;
  readonly quantity: number;
}

/** One booking with a version in force (goods-in 3.6, 3.10). Its supplier and season are its version in force's. */
export interface BookingStatusEntry {
  readonly bookingId: string;
  readonly number: string;
  readonly state: BookingInForceState;
  readonly brandId: string;
  readonly seasonValueId: string;
  readonly supplierPartyId: string;
  readonly destinationSiteId: string;
  readonly status: BookingStatus;
  readonly deliveries: readonly BookingDelivery[];
}

const IN_FORCE: readonly string[] = ['Approved', 'Issued', 'Confirmed'];

/**
 * A page of the bookings with a version in force the reader may see, newest first by identifier, filtered by brand,
 * season, supplier and destination of the version in force and its state; the cursor, the last booking read, while
 * more follow (code-house-rules 12.1). A booking with no approved version has no quantities, so is not read.
 */
export async function bookingStatuses(
  context: TransactionContext,
  query: BookingStatusesQuery,
): Promise<{ readonly bookings: readonly BookingStatusEntry[]; readonly next: string | null }> {
  const conditions: (SQL | undefined)[] = [
    query.after === undefined ? undefined : sql`${booking.id} < ${query.after}::uuid`,
    query.brandId === undefined ? undefined : eq(booking.brandId, query.brandId),
    query.destinationSiteId === undefined ? undefined : eq(booking.siteId, query.destinationSiteId),
    query.state === undefined ? undefined : sql`${stateOfRow} = ${query.state}`,
    query.supplierPartyId === undefined ? undefined : eq(bookingVersion.supplierPartyId, query.supplierPartyId),
    query.seasonValueId === undefined ? undefined : eq(bookingVersion.seasonValueId, query.seasonValueId),
  ];
  const rows = await context.tx
    .select({ booking, version: bookingVersion, state: stateOfRow, number: bookingNumber.number })
    .from(booking)
    // The approved version of the highest number, the version in force (goods-in 3.10).
    .innerJoin(bookingVersion, sql`${bookingVersion.id} = ${approvedVersionId}`)
    .innerJoin(bookingNumber, eq(bookingNumber.bookingId, booking.id))
    .where(and(...conditions))
    .orderBy(desc(booking.id))
    .limit(query.limit + 1);
  const read = rows.slice(0, query.limit);
  if (read.length === 0) return { bookings: [], next: null };
  const bookingIds = read.map((row) => row.booking.id);
  const versionIds = read.map((row) => row.version.id);
  const lines = await context.tx
    .select()
    .from(bookingLine)
    .where(inArray(bookingLine.bookingVersionId, versionIds))
    .orderBy(asc(bookingLine.lineNumber));
  const delivered = await deliveredOfBookings(context, bookingIds);
  const cancelled = await cancelledOfBookings(context, bookingIds);
  const extensions = await extensionsOfVersions(context, versionIds);
  const links = await context.tx
    .select({
      bookingId: bookingReceiptLink.bookingId,
      lineKey: bookingReceiptLink.bookingLineId,
      grnId: bookingReceiptLink.grnId,
      grnLineId: bookingReceiptLink.grnLineId,
      quantity: bookingReceiptLink.quantity,
    })
    .from(bookingReceiptLink)
    .where(inArray(bookingReceiptLink.bookingId, bookingIds))
    .orderBy(asc(bookingReceiptLink.id));
  const bookings = read.map(({ booking: row, version, state, number }): BookingStatusEntry => {
    // The version in force is approved, so its state is one of the three: anything else is a defect.
    if (!IN_FORCE.includes(state)) throw new CommandDefect(`A booking in force in state ${state}: ${row.id}`);
    return {
      bookingId: row.id,
      number,
      state: state as BookingInForceState,
      brandId: row.brandId,
      seasonValueId: version.seasonValueId,
      supplierPartyId: version.supplierPartyId,
      destinationSiteId: row.siteId,
      status: statusOf(
        {
          version: {
            id: version.id,
            versionNumber: version.versionNumber,
            windowFrom: version.windowFrom,
            windowTo: version.windowTo,
          },
          lines: statusLines(lines.filter((line) => line.bookingVersionId === version.id)),
          delivered: delivered.get(row.id) ?? new Map(),
          cancelled: cancelled.get(row.id) ?? new Map(),
          extensions: extensions.get(version.id) ?? [],
        },
        query.today,
      ),
      deliveries: links
        .filter((link) => link.bookingId === row.id)
        .map((link) => ({
          lineKey: link.lineKey,
          grnId: link.grnId,
          grnLineId: link.grnLineId,
          quantity: link.quantity,
        })),
    };
  });
  return { bookings, next: rows.length > query.limit ? (read.at(-1)?.booking.id ?? null) : null };
}

/** The booking status read model, declared for the read-model gateway (module-map section 3, rule 5). */
export const BOOKING_STATUSES = declareReadModel<BookingStatusesQuery, Awaited<ReturnType<typeof bookingStatuses>>>(
  'booking.statuses',
);

/** `booking`'s read models as it serves them, handed to the gateway by the composition root. */
export const bookingReadModels = [serveReadModel(BOOKING_STATUSES, bookingStatuses)];
