import { uuidv7 } from '@apparel-os/domain';
import { BOOKING_TYPE, type EvidenceFile } from '@apparel-os/schemas';
import type { TransactionContext } from '../../../kernel/index.js';
import { bookingSupplierFile } from '../db/schema.js';
import { SUPPLIER_COMMUNICATION, SUPPLIER_CONFIRMATION } from '../domain/bookings.js';
import type { BookingRow } from '../queries/bookings.js';
import { factsOf, type Actor, type BookingCommandDependencies } from './draft.js';

// The supplier's files on a booking (goods-in 3.4, 3.5, 3.10; POL-05.01, POL-05.04; S2-F01-T04): the confirmation of
// the version issued, and the communication with a change, a cancellation or an extension after issue.

/** What a supplier's file belongs to: a confirmation, a change's version or an amendment (goods-in 3.4, 3.5). */
export type SupplierFileOwner =
  | { readonly bookingConfirmationId: string }
  | { readonly bookingVersionId: string }
  | { readonly bookingAmendmentId: string };

/**
 * Attaches the supplier's files, stored first, to the booking at what they belong to, through `files-imports`
 * (imports-and-opening-data 11): as the evidence kind of a confirmation or of a communication, the attachment's version
 * being its owner. Each file is attached once to its owner; answers the attachments, in the order given.
 */
export async function attachSupplierFiles(
  context: TransactionContext,
  dependencies: Pick<BookingCommandDependencies, 'files'>,
  actor: Actor,
  row: BookingRow,
  files: readonly EvidenceFile[],
  owner: SupplierFileOwner,
): Promise<string[]> {
  const ownerId =
    'bookingConfirmationId' in owner
      ? owner.bookingConfirmationId
      : 'bookingVersionId' in owner
        ? owner.bookingVersionId
        : owner.bookingAmendmentId;
  const attachmentIds: string[] = [];
  for (const file of files) {
    const attached = await dependencies.files.attach(context, {
      storedFileId: file.storedFileId,
      fileReceiptId: file.fileReceiptId,
      record: { module: 'booking', type: BOOKING_TYPE, id: row.id, versionId: ownerId },
      evidence: 'bookingConfirmationId' in owner ? SUPPLIER_CONFIRMATION : SUPPLIER_COMMUNICATION,
      scope: factsOf(row),
      attachedBy: { kind: 'user', id: actor.userId },
      roleAssignmentId: actor.roleAssignmentId,
    });
    attachmentIds.push(attached.attachmentId);
    if (attached.alreadyAttached) continue;
    await context.tx.insert(bookingSupplierFile).values({
      id: uuidv7(),
      bookingId: row.id,
      ...factsOf(row),
      bookingConfirmationId: 'bookingConfirmationId' in owner ? owner.bookingConfirmationId : null,
      bookingVersionId: 'bookingVersionId' in owner ? owner.bookingVersionId : null,
      bookingAmendmentId: 'bookingAmendmentId' in owner ? owner.bookingAmendmentId : null,
      storedFileId: file.storedFileId,
      attachmentId: attached.attachmentId,
      attachedByUserId: actor.userId,
    });
  }
  return attachmentIds;
}
