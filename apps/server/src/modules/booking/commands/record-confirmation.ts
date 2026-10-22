import { uuidv7 } from '@apparel-os/domain';
import type { BookingConfirmationDraft, BookingRecorded } from '@apparel-os/schemas';
import type { TransactionContext } from '../../../kernel/index.js';
import { bookingConfirmation } from '../db/schema.js';
import { bookingItem } from '../domain/bookings.js';
import { confirmationOf, issueOf } from '../queries/lifecycle.js';
import { approvedForChange, dateRefusal } from './approved-booking.js';
import { refusalOf, refused, today, type Outcome } from './common.js';
import { audited, factsOf, recordChange, type Actor, type BookingCommandDependencies } from './draft.js';
import { attachSupplierFiles } from './supplier-files.js';

/**
 * Records the supplier's acceptance of the version issued, on the date given, with its confirmation as stored files
 * (goods-in 3.4, 3.10; POL-05.01; DEC-099; S2-F01-T04): once the version in force is Issued, once per version, no later
 * than today and not before the issue's date. A difference the supplier states is entered as a change (3.5). Not
 * policy-gated: it records what was done outside the app (DEC-116). Locks the booking at step 1 (code-house-rules 8.2),
 * names its version token (12.7), and writes the booking's next change row and its audit record in the same
 * transaction.
 */
export async function recordConfirmation(
  context: TransactionContext,
  dependencies: Pick<BookingCommandDependencies, 'audit' | 'files'>,
  actor: Actor,
  bookingId: string,
  draft: BookingConfirmationDraft,
): Promise<Outcome<BookingRecorded>> {
  const date = await today(context);
  if (typeof date !== 'string') return refusalOf(date);
  const found = await approvedForChange(context, bookingId, draft.versionToken);
  if (found.kind !== 'approved') return found;
  const { row, approval } = found;
  const issue = await issueOf(context, approval.bookingVersionId);
  if (issue === undefined) return refused('refused', 'booking.not-issued', [bookingItem(row.id)]);
  if ((await confirmationOf(context, approval.bookingVersionId)) !== undefined) {
    return refused('refused', 'booking.already-confirmed', [bookingItem(row.id)]);
  }
  const wrongDate = dateRefusal(row, draft.confirmedOn, date, issue.issuedOn);
  if (wrongDate !== undefined) return wrongDate;
  const confirmationId = uuidv7();
  await context.tx.insert(bookingConfirmation).values({
    id: confirmationId,
    bookingId: row.id,
    bookingVersionId: approval.bookingVersionId,
    ...factsOf(row),
    confirmedOn: draft.confirmedOn,
    recordedByUserId: actor.userId,
  });
  const attachmentIds = await attachSupplierFiles(context, dependencies, actor, row, draft.files, {
    bookingConfirmationId: confirmationId,
  });
  const versionToken = await recordChange(context, row, 'confirmation', approval.bookingVersionId, actor.userId);
  await audited(context, dependencies.audit, actor, row, {
    versionId: approval.bookingVersionId,
    operation: 'record-booking-confirmation',
    changes: [
      { kind: 'value', field: 'state', before: 'Issued', after: 'Confirmed' },
      { kind: 'value', field: 'confirmedOn', before: null, after: draft.confirmedOn },
      { kind: 'value', field: 'confirmationAttachmentIds', before: null, after: attachmentIds },
    ],
  });
  return { kind: 'success', answer: { bookingId: row.id, versionToken } };
}
