import { and, eq, inArray, sql } from 'drizzle-orm';
import type { TransactionContext } from '../../../kernel/index.js';
import { bookingOverdue } from '../db/schema.js';

// What the overdue job reads (goods-in 3.8, 3.10; PRD-BKG-009; POL-05.06; S2-F01-T04): the bookings to take, and the
// marks already made. The booking status (`statusOf`, read through `statusOfBooking`) is the one rule of what is
// overdue; the selection here only finds the bookings to read again under their locks, and a test proves the two agree
// (booking-lifecycle.int.test.ts, "the overdue job's selection").

/**
 * The bookings, in identifier order, at most `limit`, whose version in force has a line overdue on the business date
 * that is not marked for its due date yet (goods-in 3.6, 3.8, 3.10): outstanding, its ordered pieces less those
 * delivered by its receipt links and those cancelled by approved cancellations, above zero, and its due date, the
 * window's end as the approved extensions of that version left it, before the date (POL-05.06). A line's own delivery
 * date decides nothing (RR-576, decided by the product owner on 22 Oct 2026). Only a selection: each booking is read again under its lock through the booking
 * status, which decides.
 */
export async function overdueCandidates(context: TransactionContext, today: string, limit: number): Promise<string[]> {
  const rows = await context.tx.execute<{ booking_id: string }>(sql`
    with in_force as (
      select distinct on (a.booking_id) a.booking_id, a.booking_version_id as version_id
      from booking.booking_approval a
      join booking.booking_version av on av.id = a.booking_version_id
      order by a.booking_id, av.version_number desc
    ),
    extended_window as (
      select m.booking_version_id as version_id, max(m.window_to) as window_to
      from booking.booking_amendment m
      join booking.booking_amendment_decision d on d.booking_amendment_id = m.id and d.decision = 'Approved'
      where m.kind = 'extension'
      group by m.booking_version_id
    ),
    delivered as (
      select k.booking_line_id as line_key, sum(k.quantity) as pieces
      from booking.booking_receipt_link k group by k.booking_line_id
    ),
    cancelled as (
      select ml.booking_line_id as line_key, sum(ml.quantity) as pieces
      from booking.booking_amendment_line ml
      join booking.booking_amendment m on m.id = ml.booking_amendment_id and m.kind = 'cancellation'
      join booking.booking_amendment_decision d on d.booking_amendment_id = m.id and d.decision = 'Approved'
      group by ml.booking_line_id
    ),
    due as (
      select f.booking_id, coalesce(l.first_line_id, l.id) as line_key,
        l.quantity - coalesce(dl.pieces, 0) - coalesce(c.pieces, 0) as outstanding,
        greatest(v.window_to, ew.window_to) as due_date
      from in_force f
      join booking.booking_version v on v.id = f.version_id
      join booking.booking_line l on l.booking_version_id = f.version_id
      left join extended_window ew on ew.version_id = f.version_id
      left join delivered dl on dl.line_key = coalesce(l.first_line_id, l.id)
      left join cancelled c on c.line_key = coalesce(l.first_line_id, l.id)
    )
    select distinct due.booking_id from due
    where due.outstanding > 0 and due.due_date < ${today}::date
      and not exists (select 1 from booking.booking_overdue o
        where o.booking_line_id = due.line_key and o.due_date = due.due_date)
    order by due.booking_id
    limit ${limit}`);
  return rows.rows.map((row) => row.booking_id);
}

/** The marks already made on the lines given of a booking: each line's key and the due date it was marked for. */
export function overdueMarksOf(context: TransactionContext, bookingId: string, lineKeys: readonly string[]) {
  return context.tx
    .select({ lineKey: bookingOverdue.bookingLineId, dueDate: bookingOverdue.dueDate })
    .from(bookingOverdue)
    .where(and(eq(bookingOverdue.bookingId, bookingId), inArray(bookingOverdue.bookingLineId, [...lineKeys])));
}

/** The lines an overdue exception marked, by key (goods-in 3.10; PRD-EXC-002). */
export function linesMarkedBy(context: TransactionContext, exceptionId: string) {
  return context.tx
    .select({ lineKey: bookingOverdue.bookingLineId })
    .from(bookingOverdue)
    .where(eq(bookingOverdue.exceptionId, exceptionId));
}
