import { uuidv7 } from '@apparel-os/domain';
import {
  BOOKING_CANCELLATION,
  BOOKING_EXTENSION,
  type BookingAmendmentProposed,
  type EvidenceFile,
} from '@apparel-os/schemas';
import type { TransactionContext } from '../../../kernel/index.js';
import { bookingAmendment, bookingAmendmentLine, type AmendmentKind } from '../db/schema.js';
import { amendmentDocument, bookingItem, bookingVersionItem } from '../domain/bookings.js';
import { issueOf, pendingAmendmentOf } from '../queries/lifecycle.js';
import type { ApprovedBooking } from './approved-booking.js';
import { refused, type Outcome } from './common.js';
import { audited, factsOf, recordChange, type Actor, type BookingCommandDependencies } from './draft.js';
import { attachSupplierFiles } from './supplier-files.js';

// The step proposing a cancellation and an extension share (goods-in 3.5, 3.10; POL-05.04, POL-05.07, POL-05.10;
// S2-F01-T04): the amendment of the version in force written with its lines and the supplier's communication, its
// approval requested from a different person, and the booking's next change row with its audit record, under the
// booking's lock (code-house-rules 8.2). A proposal changes nothing until its decision, which is gated (goods-in
// 10.5), so it asks no gate itself (DEC-116).

/** A line of an amendment: the quantity a cancellation cancels, or the new date an extension gives. */
export type AmendedLine =
  { readonly lineKey: string; readonly quantity: number } | { readonly lineKey: string; readonly deliveryDate: string };

/**
 * Writes an amendment of the version in force with its lines and the supplier's communication, requests its approval
 * from a different person, under approve on the booking with no value (amendmentApprovalRules; POL-02.07), and records
 * the change and its audit record (goods-in 3.5). After issue, the communication is required (POL-05.04). Refused while
 * one of its kind waits for its decision, naming it, since requesting another would supersede its request and drop it
 * unseen (access-and-approvals 9.6; goods-in 3.10): that one is decided first.
 */
export async function proposeAmendment(
  context: TransactionContext,
  dependencies: BookingCommandDependencies,
  actor: Actor,
  found: ApprovedBooking,
  amendment: {
    readonly kind: AmendmentKind;
    readonly windowTo: string | null;
    readonly lines: readonly AmendedLine[];
    readonly communication: readonly EvidenceFile[] | undefined;
  },
): Promise<Outcome<BookingAmendmentProposed>> {
  const { row, approval } = found;
  const pending = await pendingAmendmentOf(context, row.id, amendment.kind);
  if (pending !== undefined) {
    return refused('refused', 'booking.amendment-pending', [bookingVersionItem(row.id, pending.id)]);
  }
  if ((await issueOf(context, approval.bookingVersionId)) !== undefined && amendment.communication === undefined) {
    return refused('refused', 'booking.communication-required', [bookingItem(row.id)]);
  }
  const amendmentId = uuidv7();
  await context.tx.insert(bookingAmendment).values({
    id: amendmentId,
    bookingId: row.id,
    bookingVersionId: approval.bookingVersionId,
    ...factsOf(row),
    kind: amendment.kind,
    windowTo: amendment.windowTo,
    proposedByUserId: actor.userId,
  });
  if (amendment.lines.length > 0) {
    await context.tx.insert(bookingAmendmentLine).values(
      amendment.lines.map((line) => ({
        id: uuidv7(),
        bookingAmendmentId: amendmentId,
        bookingLineId: line.lineKey,
        ...factsOf(row),
        quantity: 'quantity' in line ? line.quantity : null,
        deliveryDate: 'deliveryDate' in line ? line.deliveryDate : null,
      })),
    );
  }
  const communication = await attachSupplierFiles(context, dependencies, actor, row, amendment.communication ?? [], {
    bookingAmendmentId: amendmentId,
  });
  const requestId = await dependencies.access.requestApproval(context, {
    actionType: amendment.kind === 'cancellation' ? BOOKING_CANCELLATION : BOOKING_EXTENSION,
    document: amendmentDocument(row.id, amendmentId),
    value: { kind: 'none' },
    preparers: [actor.userId],
    requestedBy: actor,
    facts: factsOf(row),
  });
  const versionToken = await recordChange(context, row, 'amendment', approval.bookingVersionId, actor.userId);
  await audited(context, dependencies.audit, actor, row, {
    versionId: approval.bookingVersionId,
    operation: amendment.kind === 'cancellation' ? 'propose-booking-cancellation' : 'propose-booking-extension',
    changes: [
      { kind: 'value', field: 'amendmentId', before: null, after: amendmentId },
      ...(amendment.windowTo === null
        ? []
        : [{ kind: 'value' as const, field: 'windowTo', before: null, after: amendment.windowTo }]),
      { kind: 'value', field: 'lines', before: null, after: amendment.lines.map((line) => ({ ...line })) },
      { kind: 'value', field: 'requestId', before: null, after: requestId },
      ...(communication.length === 0
        ? []
        : [{ kind: 'value' as const, field: 'communicationAttachmentIds', before: null, after: communication }]),
    ],
  });
  return { kind: 'success', answer: { bookingId: row.id, amendmentId, requestId, versionToken } };
}
