import { uuidv7 } from '@apparel-os/domain';
import {
  BOOKING_CANCELLATION,
  BOOKING_EXTENSION,
  type BookingAmendmentProposed,
  type BookingCancellationDraft,
  type BookingConfirmationDraft,
  type BookingExtensionDraft,
  type BookingIssueDraft,
  type BookingRecorded,
  type BookingStatus,
  type EvidenceFile,
} from '@apparel-os/schemas';
import { CommandDefect, type TransactionContext } from '../../../kernel/index.js';
import {
  bookingAmendment,
  bookingAmendmentLine,
  bookingConfirmation,
  bookingIssue,
  type AmendmentKind,
} from '../db/schema.js';
import { amendmentDocument, bookingItem, lineItem } from '../domain/bookings.js';
import { changesOf, lockBooking, type BookingRow } from '../queries/bookings.js';
import { approvalInForce, confirmationOf, issueOf, statusOfBooking } from '../queries/lifecycle.js';
import {
  attachSupplierFiles,
  audited,
  factsOf,
  recordChange,
  type Actor,
  type BookingCommandDependencies,
} from './bookings.js';
import { refused, today, type Outcome } from './common.js';

// The lifecycle of an approved booking that Booking records or proposes (goods-in 3.4, 3.5, 3.8, 3.10; PRD-BKG-013;
// POL-05.01, POL-05.04, POL-05.07, POL-05.10; DEC-099; S2-F01-T04): Issued and Confirmed, each with its date, since
// nothing is sent to the supplier from the app; a cancellation of an undelivered balance and an extension of the
// window, each approved by a different person through `access` (amendments.ts). Every one locks the booking at step 1
// (code-house-rules 8.2), names its version token (12.7), writes the booking's next change row and its audit record
// in the same transaction, and answers the new version token. None is policy-gated: Issued and Confirmed record what
// was done outside the app, and a proposal changes nothing until its decision, which is gated (DEC-116; goods-in 10.5).

/** The booking under its lock with its approval in force, or the refusal: not found, stale or not approved (3.4). */
async function approvedForChange(
  context: TransactionContext,
  bookingId: string,
  versionToken: string,
): Promise<
  | {
      readonly kind: 'approved';
      readonly row: BookingRow;
      readonly approval: NonNullable<Awaited<ReturnType<typeof approvalInForce>>>;
    }
  | Outcome<never>
> {
  const row = await lockBooking(context, bookingId);
  if (row === undefined) return refused('not-found', 'booking.record-not-found', [bookingItem(bookingId)]);
  const newest = (await changesOf(context, row.id)).at(-1);
  if (newest === undefined) throw new CommandDefect(`A booking has no change: ${row.id}`);
  if (newest.id !== versionToken) return refused('conflict', 'kernel.stale-version', [bookingItem(row.id)]);
  const approval = await approvalInForce(context, row.id);
  if (approval === undefined) return refused('refused', 'booking.not-approved', [bookingItem(row.id)]);
  return { kind: 'approved', row, approval };
}

/** A date given for something already done: never later than today (code-house-rules 9). */
function dateRefusal(row: BookingRow, date: string, todayDate: string, earliest: string): Outcome<never> | undefined {
  if (date > todayDate) return refused('refused', 'booking.date-in-future', [bookingItem(row.id)]);
  if (date < earliest) return refused('refused', 'booking.date-too-early', [bookingItem(row.id)]);
  return undefined;
}

/**
 * Records that the approved version in force was sent to the supplier, on the date given (goods-in 3.4; POL-05.01;
 * DEC-099): once per version, no later than today, and not before the approval's date.
 */
export async function recordIssue(
  context: TransactionContext,
  dependencies: Pick<BookingCommandDependencies, 'audit'>,
  actor: Actor,
  bookingId: string,
  draft: BookingIssueDraft,
): Promise<Outcome<BookingRecorded>> {
  const date = await today(context);
  if (typeof date !== 'string') return { kind: 'refusal', refusal: date };
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

/**
 * Records the supplier's acceptance of the version issued, on the date given, with its confirmation as stored files
 * (goods-in 3.4; POL-05.01): once the version in force is Issued, once per version, no later than today and not
 * before the issue's date. A difference the supplier states is entered as a change (3.5).
 */
export async function recordConfirmation(
  context: TransactionContext,
  dependencies: Pick<BookingCommandDependencies, 'audit' | 'files'>,
  actor: Actor,
  bookingId: string,
  draft: BookingConfirmationDraft,
): Promise<Outcome<BookingRecorded>> {
  const date = await today(context);
  if (typeof date !== 'string') return { kind: 'refusal', refusal: date };
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

/** A line of an amendment: the quantity a cancellation cancels, or the new date an extension gives. */
type AmendedLine =
  { readonly lineKey: string; readonly quantity: number } | { readonly lineKey: string; readonly deliveryDate: string };

/**
 * Writes an amendment of the version in force with its lines and the supplier's communication, requests its approval
 * from a different person, under approve on the booking with no value (amendmentApprovalRules; POL-02.07), and records
 * the change and its audit record (goods-in 3.5). After issue, the communication is required (POL-05.04).
 */
async function propose(
  context: TransactionContext,
  dependencies: BookingCommandDependencies,
  actor: Actor,
  found: { readonly row: BookingRow; readonly approval: { readonly bookingVersionId: string } },
  amendment: {
    readonly kind: AmendmentKind;
    readonly windowTo: string | null;
    readonly lines: readonly AmendedLine[];
    readonly communication: readonly EvidenceFile[] | undefined;
  },
): Promise<Outcome<BookingAmendmentProposed>> {
  const { row, approval } = found;
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

/** The status of the version in force, which an approved booking always has. */
async function statusInForce(context: TransactionContext, bookingId: string, date: string): Promise<BookingStatus> {
  const status = await statusOfBooking(context, bookingId, date);
  if (status === undefined) throw new CommandDefect(`An approved booking has no status: ${bookingId}`);
  return status;
}

/**
 * Proposes cancelling the undelivered balance of the whole booking, or of the lines named, each line's whole
 * outstanding quantity as of today (goods-in 3.5, 3.6; POL-05.07, POL-05.10; PRD-BKG-013): what is received is never
 * cancelled. A line, or a booking, with nothing outstanding is refused.
 */
export async function proposeCancellation(
  context: TransactionContext,
  dependencies: BookingCommandDependencies,
  actor: Actor,
  bookingId: string,
  draft: BookingCancellationDraft,
): Promise<Outcome<BookingAmendmentProposed>> {
  const date = await today(context);
  if (typeof date !== 'string') return { kind: 'refusal', refusal: date };
  const found = await approvedForChange(context, bookingId, draft.versionToken);
  if (found.kind !== 'approved') return found;
  const status = await statusInForce(context, found.row.id, date);
  let lines: { readonly lineKey: string; readonly quantity: number }[];
  if (draft.scope.kind === 'whole') {
    lines = status.lines
      .filter((line) => line.outstanding > 0)
      .map((line) => ({ lineKey: line.lineKey, quantity: line.outstanding }));
    if (lines.length === 0) return refused('refused', 'booking.nothing-outstanding', [bookingItem(found.row.id)]);
  } else {
    lines = [];
    for (const lineKey of draft.scope.lineKeys) {
      const line = status.lines.find((each) => each.lineKey === lineKey);
      if (line === undefined) return refused('refused', 'booking.line-not-found', [lineItem(found.row.id, lineKey)]);
      if (line.outstanding === 0) {
        return refused('refused', 'booking.nothing-outstanding', [lineItem(found.row.id, lineKey)]);
      }
      lines.push({ lineKey, quantity: line.outstanding });
    }
  }
  return propose(context, dependencies, actor, found, {
    kind: 'cancellation',
    windowTo: null,
    lines,
    communication: draft.communication,
  });
}

/**
 * Proposes extending the delivery window (goods-in 3.5, 3.8; POL-05.07): the window's new end, no earlier than its end
 * now, and new delivery dates for the lines named, each later than the date it is due now; something must be later
 * (`booking.not-an-extension`).
 */
export async function proposeExtension(
  context: TransactionContext,
  dependencies: BookingCommandDependencies,
  actor: Actor,
  bookingId: string,
  draft: BookingExtensionDraft,
): Promise<Outcome<BookingAmendmentProposed>> {
  const date = await today(context);
  if (typeof date !== 'string') return { kind: 'refusal', refusal: date };
  const found = await approvedForChange(context, bookingId, draft.versionToken);
  if (found.kind !== 'approved') return found;
  const status = await statusInForce(context, found.row.id, date);
  for (const named of draft.lines) {
    const line = status.lines.find((each) => each.lineKey === named.lineKey);
    if (line === undefined) {
      return refused('refused', 'booking.line-not-found', [lineItem(found.row.id, named.lineKey)]);
    }
    if (named.deliveryDate <= line.dueDate) {
      return refused('refused', 'booking.not-an-extension', [lineItem(found.row.id, named.lineKey)]);
    }
  }
  const windowTo = status.deliveryWindow.to;
  if (draft.windowTo < windowTo || (draft.windowTo === windowTo && draft.lines.length === 0)) {
    return refused('refused', 'booking.not-an-extension', [bookingItem(found.row.id)]);
  }
  return propose(context, dependencies, actor, found, {
    kind: 'extension',
    windowTo: draft.windowTo,
    lines: draft.lines.map((line) => ({ lineKey: line.lineKey, deliveryDate: line.deliveryDate })),
    communication: draft.communication,
  });
}
