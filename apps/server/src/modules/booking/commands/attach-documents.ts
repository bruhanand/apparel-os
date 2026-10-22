import { uuidv7 } from '@apparel-os/domain';
import { BOOKING_TYPE, type BookingDocumentsAttached, type BookingDocumentsDraft } from '@apparel-os/schemas';
import type { TransactionContext } from '../../../kernel/index.js';
import { bookingDocument } from '../db/schema.js';
import { BOOKING_DOCUMENT } from '../domain/bookings.js';
import { documentsOf, versionsOf } from '../queries/bookings.js';
import { valueChange, type Outcome } from './common.js';
import {
  audited,
  draftForChange,
  factsOf,
  recordChange,
  type Actor,
  type BookingCommandDependencies,
} from './draft.js';

/**
 * Attaches booking documents, photos or PDFs stored first, to a Draft (goods-in 3.1; PRD-IMP-002; S2-F01-T03); a file
 * once only. Attaching is a change of the booking, so it names the version token it read and is refused stale on
 * another (code-house-rules 12.7). The booking's evidence is attached to the booking, apart from its versions, so it
 * carries to every later version.
 */
export async function attachDocuments(
  context: TransactionContext,
  dependencies: BookingCommandDependencies,
  actor: Actor,
  bookingId: string,
  draft: BookingDocumentsDraft,
): Promise<Outcome<BookingDocumentsAttached>> {
  const found = await draftForChange(context, bookingId, draft.versionToken, 'documents');
  if (found.kind !== 'draft') return found;
  const { row } = found;
  const kept = await documentsOf(context, row.id);
  const attachmentIds: string[] = [];
  for (const file of draft.files) {
    const already = kept.find((each) => each.storedFileId === file.storedFileId);
    if (already !== undefined) {
      attachmentIds.push(already.attachmentId);
      continue;
    }
    const attached = await dependencies.files.attach(context, {
      storedFileId: file.storedFileId,
      fileReceiptId: file.fileReceiptId,
      record: { module: 'booking', type: BOOKING_TYPE, id: row.id },
      evidence: BOOKING_DOCUMENT,
      scope: factsOf(row),
      attachedBy: { kind: 'user', id: actor.userId },
      roleAssignmentId: actor.roleAssignmentId,
    });
    await context.tx.insert(bookingDocument).values({
      id: uuidv7(),
      bookingId: row.id,
      ...factsOf(row),
      storedFileId: file.storedFileId,
      attachmentId: attached.attachmentId,
      attachedByUserId: actor.userId,
    });
    attachmentIds.push(attached.attachmentId);
  }
  const newestVersion = (await versionsOf(context, row.id)).at(-1);
  if (newestVersion === undefined) throw new Error(`A booking has no version: ${row.id}`);
  const versionToken = await recordChange(context, row, 'documents', newestVersion.id, actor.userId);
  await audited(context, dependencies.audit, actor, row, {
    versionId: newestVersion.id,
    operation: 'attach-booking-documents',
    changes: [valueChange('documentAttachmentIds', null, attachmentIds)],
  });
  return { kind: 'success', answer: { attachmentIds, versionToken } };
}
