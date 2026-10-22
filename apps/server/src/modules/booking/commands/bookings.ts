import { paise, uuidv7 } from '@apparel-os/domain';
import {
  BOOKING_APPROVAL,
  BOOKING_TYPE,
  bookingTotals,
  type BookingDocumentsAttached,
  type BookingDocumentsDraft,
  type BookingDraft,
  type BookingDraftChange,
  type BookingLineDraft,
  type BookingSaved,
  type BookingSubmission,
  type BookingSubmitted,
  type DeliveryWindow,
} from '@apparel-os/schemas';
import type { TransactionContext } from '../../../kernel/index.js';
import type { AccessInterface } from '../../access/index.js';
import type { AuditChange, AuditInterface } from '../../audit/index.js';
import type { FilesImportsInterface } from '../../files-imports/index.js';
import { brandInForce, type CatalogueInterface } from '../../merchandise/catalogue/index.js';
import { brandSupplierLinkedOn } from '../../merchandise/parties/index.js';
import { structureOn } from '../../organisation/index.js';
import {
  booking,
  bookingChange,
  bookingDocument,
  bookingLine,
  bookingSupplierFile,
  bookingVersion,
  type BookingChangeKind,
} from '../db/schema.js';
import {
  BOOKING_DOCUMENT,
  bookingAuditRecord,
  bookingDocument as approvalDocument,
  bookingItem,
  lineItem,
  preparersOf,
  SUPPLIER_COMMUNICATION,
  SUPPLIER_CONFIRMATION,
} from '../domain/bookings.js';
import { changeRefusal, CONTENT_CHANGES, lifecycleOf } from '../domain/lifecycle.js';
import {
  changesOf,
  documentsOf,
  lockBooking,
  pricedLines,
  versionWithLines,
  versionsOf,
  type BookingRow,
} from '../queries/bookings.js';
import {
  approvalInForce,
  communicationOfVersion,
  confirmationOf,
  issueOf,
  lineKeysOf,
  statusOfBooking,
} from '../queries/lifecycle.js';
import { refused, today, type Outcome } from './common.js';

// Record a booking and change its Draft, attach its documents and submit it (goods-in 3.1, 3.4; PRD-BKG-001 to
// PRD-BKG-003, PRD-BKG-014, PRD-MER-021, PRD-IMP-002; POL-05.01, POL-02.07; DEC-130, DEC-136; S2-F01-T03). Every
// change locks the booking at step 1 (code-house-rules 8.2), writes its next change row and its audit record in the
// same transaction, and answers the booking's new version token (12.7). A Draft is edited freely: each save writes
// its next version with its lines, frozen when written (7.2). Submitting binds an approval request to the newest
// version, whose value at cost is the request's value (DM-8). None is policy-gated: they record no business effect
// (DEC-116; goods-in 10.5).
//
// Once approved, a booking takes a change as its next Draft, a new version approved again (goods-in 3.5, 3.10;
// POL-05.03, POL-05.10; S2-F01-T04): a line names, by its key, the line it continues, so its receipt links and
// cancellations follow it; a change keeps what is delivered and cancelled of each line; after issue it is submitted
// with the supplier's communication (POL-05.04). The version in force stays in force until the change is approved.

/** Who acts: the signed-in person and the assignment Authorise used (access-and-approvals 7.1). */
export interface Actor {
  readonly userId: string;
  readonly roleAssignmentId: string;
}

export interface BookingCommandDependencies {
  readonly audit: AuditInterface;
  readonly access: Pick<AccessInterface, 'requestApproval'>;
  readonly catalogue: Pick<CatalogueInterface, 'vocabularyOn' | 'markedAttributeAt'>;
  readonly files: Pick<FilesImportsInterface, 'attach'>;
}

type ValueChange = Extract<AuditChange, { kind: 'value' }>;
const value = (field: string, before: ValueChange['before'], after: ValueChange['after']): ValueChange => ({
  kind: 'value',
  field,
  before,
  after,
});

/** The scope facts of a booking: its destination Site and its brand (access-and-approvals 5.3). */
export const factsOf = (row: Pick<BookingRow, 'siteId' | 'brandId'>) => ({ siteId: row.siteId, brandId: row.brandId });

/** The content of a version every save checks: its supplier, season and window (goods-in 3.1). */
interface Content {
  readonly supplierPartyId: string;
  readonly seasonValueId: string;
  readonly deliveryWindow: DeliveryWindow;
  readonly lines: readonly BookingLineDraft[];
}

/** The season a version names: the value, the attribute marked as the season and that marking's version (RR-550). */
interface Season {
  readonly attributeId: string;
  readonly valueId: string;
  readonly markedAttributeVersionId: string;
}

/**
 * The checks of a Draft's content on the booking's date, today (goods-in 3.1): the brand in force, the season an
 * approved value in force today of the attribute marked as the season now (structure-and-masters 4.2 "As built";
 * RR-550), the supplier linked to the brand today (PRD-MER-021). While no attribute is marked as the season, it is
 * refused, naming the setting; nothing falls back to another attribute (code-house-rules 12.14).
 */
async function checkedSeason(
  context: TransactionContext,
  dependencies: BookingCommandDependencies,
  brandId: string,
  content: Content,
  date: string,
): Promise<Season | Outcome<never>> {
  if (!(await brandInForce(context, brandId, date))) {
    return refused('refused', 'booking.brand-not-in-force', [
      { kind: 'record', recordType: 'merchandise.brand', recordId: brandId },
    ]);
  }
  const seasons = await dependencies.catalogue.markedAttributeAt(context, 'season');
  if (seasons.kind === 'not-set') return { kind: 'refusal', refusal: seasons.refusal };
  const values = await dependencies.catalogue.vocabularyOn(context, seasons.attributeId, date);
  if (!values.some((each) => each.id === content.seasonValueId)) {
    return refused('refused', 'booking.season-not-in-vocabulary', [
      { kind: 'record', recordType: 'merchandise.attribute', recordId: seasons.attributeId },
      { kind: 'record', recordType: 'merchandise.vocabulary_value', recordId: content.seasonValueId },
    ]);
  }
  if (!(await brandSupplierLinkedOn(context, brandId, content.supplierPartyId, date))) {
    return refused('refused', 'booking.supplier-not-linked', [
      { kind: 'record', recordType: 'merchandise.party', recordId: content.supplierPartyId },
      { kind: 'record', recordType: 'merchandise.brand', recordId: brandId },
    ]);
  }
  return {
    attributeId: seasons.attributeId,
    valueId: content.seasonValueId,
    markedAttributeVersionId: seasons.versionId,
  };
}

/** Records the next change of a booking, under its lock; answers the new version token (code-house-rules 12.7). */
async function recordChange(
  context: TransactionContext,
  row: BookingRow,
  change: BookingChangeKind,
  versionId: string,
  userId: string,
): Promise<string> {
  const changes = await changesOf(context, row.id);
  const id = uuidv7();
  await context.tx.insert(bookingChange).values({
    id,
    bookingId: row.id,
    changeNumber: (changes.at(-1)?.changeNumber ?? 0) + 1,
    change,
    bookingVersionId: versionId,
    ...factsOf(row),
    changedByUserId: userId,
  });
  return id;
}

/** The audit record of a change of a booking, made on the screen by the actor (numbering-and-audit 4.1). */
async function audited(
  context: TransactionContext,
  audit: AuditInterface,
  actor: Actor,
  row: BookingRow,
  change: { readonly versionId: string; readonly operation: string; readonly changes: readonly ValueChange[] },
): Promise<void> {
  await audit.record(context, {
    actor: { kind: 'user', id: actor.userId },
    roleAssignmentId: actor.roleAssignmentId,
    scope: factsOf(row),
    record: bookingAuditRecord(row.id, change.versionId),
    operation: change.operation,
    changes: change.changes,
    source: { kind: 'screen' },
  });
}

/** Writes the booking's next version with its lines, frozen (code-house-rules 7.2), and its change and audit record. */
async function writeVersion(
  context: TransactionContext,
  dependencies: BookingCommandDependencies,
  actor: Actor,
  row: BookingRow,
  content: Content,
  season: Season,
  operation: string,
): Promise<BookingSaved> {
  const versions = await versionsOf(context, row.id);
  const versionId = uuidv7();
  await context.tx.insert(bookingVersion).values({
    id: versionId,
    bookingId: row.id,
    versionNumber: (versions.at(-1)?.versionNumber ?? 0) + 1,
    ...factsOf(row),
    supplierPartyId: content.supplierPartyId,
    seasonAttributeId: season.attributeId,
    seasonValueId: season.valueId,
    seasonMarkedAttributeVersionId: season.markedAttributeVersionId,
    windowFrom: content.deliveryWindow.from,
    windowTo: content.deliveryWindow.to,
    savedByUserId: actor.userId,
  });
  if (content.lines.length > 0) {
    await context.tx.insert(bookingLine).values(
      content.lines.map((line, index) => ({
        id: uuidv7(),
        bookingVersionId: versionId,
        lineNumber: index + 1,
        ...factsOf(row),
        // The line it continues, by its key, the identifier of that line as first written (goods-in 3.10).
        firstLineId: line.lineKey ?? null,
        // Each as written: a GRN line is matched against them, ignoring case and spaces at the ends (goods-in 3.7).
        styleCode: line.styleCode,
        colour: line.colour,
        size: line.size,
        quantity: line.quantity,
        indicativeCostPaise: line.indicativeCost,
        mrpPaise: line.mrp,
        deliveryDate: line.deliveryDate,
      })),
    );
  }
  const versionToken = await recordChange(context, row, 'draft', versionId, actor.userId);
  const totals = bookingTotals(content.lines).booking;
  await audited(context, dependencies.audit, actor, row, {
    versionId,
    operation,
    changes: [
      value('supplierPartyId', null, content.supplierPartyId),
      value('season', null, { ...season }),
      value('deliveryWindow', null, { ...content.deliveryWindow }),
      value('lines', null, content.lines.length),
      value('totals', null, { ...totals }),
    ],
  });
  return { bookingId: row.id, versionId, versionToken };
}

/**
 * Records a new booking as a Draft (goods-in 3.1): its brand and destination, a Site in force today, fixed for the
 * booking's life, and its first version. A new booking has no row to lock at step 1: writing its identity row creates
 * it locked, and no other transaction sees it before this one commits (code-house-rules 8.2), as a new Arrival's.
 */
export async function recordBooking(
  context: TransactionContext,
  dependencies: BookingCommandDependencies,
  actor: Actor,
  draft: BookingDraft,
): Promise<Outcome<BookingSaved>> {
  const date = await today(context);
  if (typeof date !== 'string') return { kind: 'refusal', refusal: date };
  const structure = await structureOn(context, date);
  if (!structure.sites.some((site) => site.id === draft.destinationSiteId)) {
    return refused('refused', 'booking.site-not-in-force', [
      { kind: 'record', recordType: 'organisation.site', recordId: draft.destinationSiteId },
    ]);
  }
  // A new booking has no line yet for a line of it to continue (goods-in 3.10).
  const continuing = draft.lines.find((line) => line.lineKey !== undefined);
  if (continuing?.lineKey !== undefined) {
    return refused('refused', 'booking.line-not-found', [{ kind: 'booking-line', lineKey: continuing.lineKey }]);
  }
  const season = await checkedSeason(context, dependencies, draft.brandId, draft, date);
  if ('kind' in season) return season;
  const values = {
    id: uuidv7(),
    brandId: draft.brandId,
    siteId: draft.destinationSiteId,
    recordedByUserId: actor.userId,
  };
  await context.tx.insert(booking).values(values);
  const row: BookingRow = { ...values, recordedAt: context.startedAt };
  const answer = await writeVersion(context, dependencies, actor, row, draft, season, 'record-booking');
  return { kind: 'success', answer };
}

/**
 * The booking under its lock for a change of its content, or the refusal: not found, a stale version token, or a
 * version waiting for its decision (goods-in 3.4, 3.5). A Draft before approval takes any change; an approved booking
 * takes a change as its next Draft (3.5), but its booking documents are fixed with its first approval (3.1).
 */
async function draftForChange(
  context: TransactionContext,
  bookingId: string,
  versionToken: string | undefined,
  purpose: 'content' | 'documents',
): Promise<{ readonly kind: 'draft'; readonly row: BookingRow } | Outcome<never>> {
  const row = await lockBooking(context, bookingId);
  if (row === undefined) return refused('not-found', 'booking.record-not-found', [bookingItem(bookingId)]);
  const changes = await changesOf(context, row.id);
  const newest = changes.at(-1);
  const content = changes.filter((each) => CONTENT_CHANGES.includes(each.change)).at(-1);
  if (newest === undefined || content === undefined) throw new Error(`A booking has no change: ${row.id}`);
  if (versionToken !== undefined && newest.id !== versionToken) {
    return refused('conflict', 'kernel.stale-version', [bookingItem(row.id)]);
  }
  const approved = (await approvalInForce(context, row.id)) !== undefined;
  const state = lifecycleOf({ approved: false, issued: false, confirmed: false, newestContent: content.change });
  if (state === 'Awaiting approval' || (purpose === 'documents' && approved)) {
    return refused('refused', 'booking.not-draft', [bookingItem(row.id)]);
  }
  return { kind: 'draft', row };
}

/**
 * The lines of a next Draft checked (goods-in 3.5, 3.10): each line it continues is a line of the booking, named once
 * (`booking.line-not-found`, `booking.line-repeated`); once approved, it keeps what is delivered and cancelled of each
 * line of the version in force, as of the booking's date (PRD-BKG-013; changeRefusal). Undefined when they pass.
 */
async function linesRefusal(
  context: TransactionContext,
  bookingId: string,
  lines: readonly BookingLineDraft[],
  date: string,
): Promise<Outcome<never> | undefined> {
  const known = await lineKeysOf(context, bookingId);
  const seen = new Set<string>();
  for (const line of lines) {
    if (line.lineKey === undefined) continue;
    if (!known.has(line.lineKey))
      return refused('refused', 'booking.line-not-found', [lineItem(bookingId, line.lineKey)]);
    if (seen.has(line.lineKey)) return refused('refused', 'booking.line-repeated', [lineItem(bookingId, line.lineKey)]);
    seen.add(line.lineKey);
  }
  const inForce = await statusOfBooking(context, bookingId, date);
  if (inForce === undefined) return undefined;
  const refusal = changeRefusal(inForce, lines);
  return refusal === undefined ? undefined : refused('refused', refusal.code, [lineItem(bookingId, refusal.lineKey)]);
}

/** Saves a booking's next Draft (goods-in 3.1, 3.5): its brand and destination stay; the rest is checked again. */
export async function saveDraft(
  context: TransactionContext,
  dependencies: BookingCommandDependencies,
  actor: Actor,
  bookingId: string,
  draft: BookingDraftChange,
): Promise<Outcome<BookingSaved>> {
  const date = await today(context);
  if (typeof date !== 'string') return { kind: 'refusal', refusal: date };
  const found = await draftForChange(context, bookingId, draft.versionToken, 'content');
  if (found.kind !== 'draft') return found;
  const season = await checkedSeason(context, dependencies, found.row.brandId, draft, date);
  if ('kind' in season) return season;
  const lines = await linesRefusal(context, found.row.id, draft.lines, date);
  if (lines !== undefined) return lines;
  const answer = await writeVersion(context, dependencies, actor, found.row, draft, season, 'save-booking-draft');
  return { kind: 'success', answer };
}

/**
 * Attaches booking documents, photos or PDFs stored first, to a Draft (goods-in 3.1; PRD-IMP-002); a file once only.
 * The booking's evidence is attached to the booking, apart from its versions, so it carries to every later version.
 */
export async function attachDocuments(
  context: TransactionContext,
  dependencies: BookingCommandDependencies,
  actor: Actor,
  bookingId: string,
  draft: BookingDocumentsDraft,
): Promise<Outcome<BookingDocumentsAttached>> {
  const found = await draftForChange(context, bookingId, undefined, 'documents');
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
    changes: [value('documentAttachmentIds', null, attachmentIds)],
  });
  return { kind: 'success', answer: { attachmentIds, versionToken } };
}

/**
 * Submits the Draft as it stands (goods-in 3.1, 3.4; module-map 6.2 flow A): with at least one document and one line,
 * its approval requested, bound to the newest version, on the booking's value at cost (DM-8, DEC-105), from a person
 * other than its preparers, everyone who saved a version or attached documents since its last approval and the one
 * submitting (access-and-approvals 9.1; POL-02.07).
 */
export async function submitBooking(
  context: TransactionContext,
  dependencies: BookingCommandDependencies,
  actor: Actor,
  bookingId: string,
  draft: BookingSubmission,
): Promise<Outcome<BookingSubmitted>> {
  const found = await draftForChange(context, bookingId, draft.versionToken, 'content');
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
  // A change after approval (goods-in 3.5): a newer version than the one in force, and, after issue, the supplier's
  // communication with it, unless the version carries it already from an earlier submission (POL-05.04).
  const inForce = await approvalInForce(context, row.id);
  if (inForce?.bookingVersionId === newestVersion.id) {
    return refused('refused', 'booking.no-change', [bookingItem(row.id)]);
  }
  if (inForce !== undefined && (await issueOf(context, inForce.bookingVersionId)) !== undefined) {
    const kept = await communicationOfVersion(context, newestVersion.id);
    if (kept.length === 0 && draft.communication === undefined) {
      return refused('refused', 'booking.communication-required', [bookingItem(row.id)]);
    }
  }
  const communication = await attachCommunication(context, dependencies, actor, row, draft.communication ?? [], {
    bookingVersionId: newestVersion.id,
  });
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
    changes: [
      value('state', 'Draft', 'Awaiting approval'),
      value('requestId', null, requestId),
      ...(communication.length === 0 ? [] : [value('communicationAttachmentIds', null, communication)]),
    ],
  });
  return { kind: 'success', answer: { bookingId: row.id, versionId: newestVersion.id, requestId, versionToken } };
}

/** What a supplier's file belongs to: a confirmation, a change's version or an amendment (goods-in 3.4, 3.5). */
export type SupplierFileOwner =
  | { readonly bookingConfirmationId: string }
  | { readonly bookingVersionId: string }
  | { readonly bookingAmendmentId: string };

/**
 * Attaches the supplier's files, stored first, to the booking at what they belong to, through `files-imports`
 * (goods-in 3.4, 3.5; POL-05.04; imports-and-opening-data 11): the confirmation of the version issued, or the
 * communication with a change, a cancellation or an extension. Each file is attached once to its owner; answers the
 * attachments, in the order given.
 */
export async function attachSupplierFiles(
  context: TransactionContext,
  dependencies: Pick<BookingCommandDependencies, 'files'>,
  actor: Actor,
  row: BookingRow,
  files: readonly { readonly storedFileId: string; readonly fileReceiptId: string }[],
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

/** The communication with a change after issue (goods-in 3.5; POL-05.04). */
function attachCommunication(
  context: TransactionContext,
  dependencies: Pick<BookingCommandDependencies, 'files'>,
  actor: Actor,
  row: BookingRow,
  files: readonly { readonly storedFileId: string; readonly fileReceiptId: string }[],
  owner: { readonly bookingVersionId: string },
): Promise<string[]> {
  return attachSupplierFiles(context, dependencies, actor, row, files, owner);
}

/** Whether the version in force of a booking is issued, and so whether a change of it carries the communication. */
export async function issuedInForce(context: TransactionContext, bookingId: string): Promise<boolean> {
  const inForce = await approvalInForce(context, bookingId);
  if (inForce === undefined) return false;
  return (
    (await issueOf(context, inForce.bookingVersionId)) !== undefined ||
    (await confirmationOf(context, inForce.bookingVersionId)) !== undefined
  );
}

export { recordChange, audited };
