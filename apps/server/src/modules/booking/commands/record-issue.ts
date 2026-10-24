import { uuidv7 } from '@apparel-os/domain';
import type { BookingIssueDraft, BookingRecorded } from '@apparel-os/schemas';
import type { TransactionContext } from '../../../kernel/index.js';
import { bookingIssue } from '../db/schema.js';
import { bookingItem } from '../domain/bookings.js';
import { issueOf } from '../queries/lifecycle.js';
import { approvedForChange, dateRefusal } from './approved-booking.js';
import { refusalOf, refused, today, type Outcome } from './common.js';
import { audited, factsOf, recordChange, type Actor, type BookingCommandDependencies } from './draft.js';

/**
 * Records that the approved version in force was sent to the supplier, on the date given (goods-in 3.4, 3.10;
 * POL-05.01; DEC-099; S2-F01-T04): once per version, no later than today, and not before the approval's date. Nothing
 * is sent from the app, so this records what was done outside it and is not policy-gated (DEC-116). Locks the booking
 * at step 1 (code-house-rules 8.2), names its version token (12.7), and writes the booking's next change row and its
 * audit record in the same transaction.
 */
export async function recordIssue(
  context: TransactionContext,
  dependencies: Pick<BookingCommandDependencies, 'audit'>,
  actor: Actor,
  bookingId: string,
  draft: BookingIssueDraft,
): Promise<Outcome<BookingRecorded>> {
  const date = await today(context);
  if (typeof date !== 'string') return refusalOf(date);
  const found = await approvedForChange(context, bookingId, draft.versionToken);
  if (found.kind !== 'approved') return found;
  const { row, approval } = found;
  if ((await issueOf(context, approval.bookingVersionId)) !== undefined) {
    return refused('refused', 'booking.already-issued', [bookingItem(row.id)]);
  }
  const wrongDate = dateRefusal(row, draft.issuedOn, date, approval.businessDate);
  if (wrongDate !== undefined) return wrongDate;
  await context.tx.insert(bookingIssue).values({
    id: uuidv7(),
    bookingId: row.id,
    bookingVersionId: approval.bookingVersionId,
    ...factsOf(row),
    issuedOn: draft.issuedOn,
    recordedByUserId: actor.userId,
  });
  const versionToken = await recordChange(context, row, 'issue', approval.bookingVersionId, actor.userId);
  await audited(context, dependencies.audit, actor, row, {
    versionId: approval.bookingVersionId,
    operation: 'record-booking-issue',
    changes: [
      { kind: 'value', field: 'state', before: 'Approved', after: 'Issued' },
      { kind: 'value', field: 'issuedOn', before: null, after: draft.issuedOn },
    ],
  });
  return { kind: 'success', answer: { bookingId: row.id, versionToken } };
}
