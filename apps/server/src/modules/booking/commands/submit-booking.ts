import { bookingTotals } from '@apparel-os/calculations/booking';
import { paise } from '@apparel-os/domain';
import { BOOKING_APPROVAL, type BookingSubmission, type BookingSubmitted } from '@apparel-os/schemas';
import type { TransactionContext } from '../../../kernel/index.js';
import { bookingDocument as approvalDocument, bookingItem, preparersOf } from '../domain/bookings.js';
import { changesOf, documentsOf, pricedLines, versionWithLines, versionsOf } from '../queries/bookings.js';
import { refused, valueChange, type Outcome } from './common.js';
import {
  audited,
  draftForChange,
  factsOf,
  recordChange,
  type Actor,
  type BookingCommandDependencies,
} from './draft.js';

/**
 * Submits the Draft as it stands (goods-in 3.1, 3.4; module-map 6.2 flow A; PRD-IMP-002; POL-02.07; DEC-136;
 * S2-F01-T03): with at least one document and one line, its approval requested, bound to the newest version, on the
 * booking's value at cost (DM-8, DEC-105), from a person other than its preparers, everyone who saved a version or
 * attached documents since its last approval and the one submitting (access-and-approvals 9.1).
 */
export async function submitBooking(
  context: TransactionContext,
  dependencies: BookingCommandDependencies,
  actor: Actor,
  bookingId: string,
  draft: BookingSubmission,
): Promise<Outcome<BookingSubmitted>> {
  const found = await draftForChange(context, bookingId, draft.versionToken);
  if (found.kind !== 'draft') return found;
  const { row } = found;
  if ((await documentsOf(context, row.id)).length === 0) {
    return refused('refused', 'booking.no-document', [bookingItem(row.id)]);
  }
  const newestVersion = (await versionsOf(context, row.id)).at(-1);
  if (newestVersion === undefined) throw new Error(`A booking has no version: ${row.id}`);
  const read = await versionWithLines(context, newestVersion.id);
  if (read === undefined || read.lines.length === 0) {
    return refused('refused', 'booking.no-lines', [bookingItem(row.id)]);
  }
  const valueAtCost = bookingTotals(pricedLines(read.lines)).booking.cost;
  const preparers = preparersOf(await changesOf(context, row.id));
  const requestId = await dependencies.access.requestApproval(context, {
    actionType: BOOKING_APPROVAL,
    document: approvalDocument(row.id, newestVersion.id),
    value: { kind: 'known', amountPaise: paise(valueAtCost) },
    preparers: [...preparers, actor.userId],
    requestedBy: actor,
    facts: factsOf(row),
  });
  const versionToken = await recordChange(context, row, 'submission', newestVersion.id, actor.userId);
  await audited(context, dependencies.audit, actor, row, {
    versionId: newestVersion.id,
    operation: 'submit-booking',
    changes: [valueChange('state', 'Draft', 'Awaiting approval'), valueChange('requestId', null, requestId)],
  });
  return { kind: 'success', answer: { bookingId: row.id, versionId: newestVersion.id, requestId, versionToken } };
}
