import type { BookingStatus } from '@apparel-os/schemas';
import { CommandDefect, type TransactionContext } from '../../../kernel/index.js';
import { bookingItem } from '../domain/bookings.js';
import { changesOf, lockBooking, type BookingRow } from '../queries/bookings.js';
import { approvalInForce, statusOfBooking } from '../queries/lifecycle.js';
import { refused, type Outcome } from './common.js';

// The steps every command on an approved booking's lifecycle shares (goods-in 3.4, 3.5, 3.8, 3.10; S2-F01-T04):
// Issued, Confirmed, and proposing a cancellation or an extension. Each locks the booking at step 1 (code-house-rules
// 8.2) and names its version token (12.7).

/** An approved booking under its lock, with its approval in force. */
export interface ApprovedBooking {
  readonly kind: 'approved';
  readonly row: BookingRow;
  readonly approval: NonNullable<Awaited<ReturnType<typeof approvalInForce>>>;
}

/** The booking under its lock with its approval in force, or the refusal: not found, stale or not approved (3.4). */
export async function approvedForChange(
  context: TransactionContext,
  bookingId: string,
  versionToken: string,
): Promise<ApprovedBooking | Outcome<never>> {
  const row = await lockBooking(context, bookingId);
  if (row === undefined) return refused('not-found', 'booking.record-not-found', [bookingItem(bookingId)]);
  const newest = (await changesOf(context, row.id)).at(-1);
  if (newest === undefined) throw new CommandDefect(`A booking has no change: ${row.id}`);
  if (newest.id !== versionToken) return refused('conflict', 'kernel.stale-version', [bookingItem(row.id)]);
  const approval = await approvalInForce(context, row.id);
  if (approval === undefined) return refused('refused', 'booking.not-approved', [bookingItem(row.id)]);
  return { kind: 'approved', row, approval };
}

/** A date given for something already done: never later than today (code-house-rules 9), nor before `earliest`. */
export function dateRefusal(
  row: BookingRow,
  date: string,
  todayDate: string,
  earliest: string,
): Outcome<never> | undefined {
  if (date > todayDate) return refused('refused', 'booking.date-in-future', [bookingItem(row.id)]);
  if (date < earliest) return refused('refused', 'booking.date-too-early', [bookingItem(row.id)]);
  return undefined;
}

/** The status of the version in force, which an approved booking always has. */
export async function statusInForce(
  context: TransactionContext,
  bookingId: string,
  date: string,
): Promise<BookingStatus> {
  const status = await statusOfBooking(context, bookingId, date);
  if (status === undefined) throw new CommandDefect(`An approved booking has no status: ${bookingId}`);
  return status;
}
