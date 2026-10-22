import { uuidv7 } from '@apparel-os/domain';
import { bookingTotals } from '@apparel-os/calculations/booking';
import type { BookingLineDraft, BookingSaved, DeliveryWindow } from '@apparel-os/schemas';
import type { TransactionContext } from '../../../kernel/index.js';
import type { AccessInterface } from '../../access/index.js';
import type { AuditInterface } from '../../audit/index.js';
import type { FilesImportsInterface } from '../../files-imports/index.js';
import { brandInForce, type CatalogueInterface } from '../../merchandise/catalogue/index.js';
import { brandSupplierLinkedOn } from '../../merchandise/parties/index.js';
import { bookingChange, bookingLine, bookingVersion, type BookingChangeKind } from '../db/schema.js';
import { bookingAuditRecord, bookingItem, lineItem } from '../domain/bookings.js';
import { changeRefusal, CONTENT_CHANGES, lifecycleOf } from '../domain/lifecycle.js';
import { changesOf, lockBooking, versionsOf, type BookingRow } from '../queries/bookings.js';
import { approvalInForce, lineKeysOf, statusOfBooking } from '../queries/lifecycle.js';
import { refused, valueChange, type Outcome, type ValueChange } from './common.js';

// What the commands of a booking's Draft share (goods-in 3.1, 3.4, 3.9; PRD-BKG-001 to PRD-BKG-003, PRD-MER-021;
// POL-05.01; DEC-130; S2-F01-T03): every change locks the booking at step 1 (code-house-rules 8.2), writes its next
// change row and its audit record in the same transaction, and answers the booking's new version token (12.7). A Draft
// is edited freely: each save writes its next version with its lines, frozen when written (7.2). None is
// policy-gated: they record no business effect (DEC-116; goods-in 10.5). Each command is a file of its own: record,
// save, attach documents and submit.
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

/**
 * Lines written by one statement: a technical choice, well within the 65,535 parameters PostgreSQL binds to one
 * statement at a line's twelve columns (goods-in 3.9 "Input caps").
 */
const LINES_PER_INSERT = 1_000;

/** The scope facts of a booking: its destination Site and its brand (access-and-approvals 5.3). */
export const factsOf = (row: Pick<BookingRow, 'siteId' | 'brandId'>) => ({ siteId: row.siteId, brandId: row.brandId });

/** The content of a version every save checks: its supplier, season and window (goods-in 3.1). */
export interface Content {
  readonly supplierPartyId: string;
  readonly seasonValueId: string;
  readonly deliveryWindow: DeliveryWindow;
  readonly lines: readonly BookingLineDraft[];
}

/** The season a version names: the value, the attribute marked as the season and that marking's version (RR-550). */
export interface Season {
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
export async function checkedSeason(
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
export async function recordChange(
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
export async function audited(
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
export async function writeVersion(
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
  const rows = content.lines.map((line, index) => ({
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
  }));
  // In batches, so a version at the line cap stays within the parameters one statement may bind (goods-in 3.9).
  for (let start = 0; start < rows.length; start += LINES_PER_INSERT) {
    await context.tx.insert(bookingLine).values(rows.slice(start, start + LINES_PER_INSERT));
  }
  const versionToken = await recordChange(context, row, 'draft', versionId, actor.userId);
  const totals = bookingTotals(content.lines).booking;
  await audited(context, dependencies.audit, actor, row, {
    versionId,
    operation,
    changes: [
      valueChange('supplierPartyId', null, content.supplierPartyId),
      valueChange('season', null, { ...season }),
      valueChange('deliveryWindow', null, { ...content.deliveryWindow }),
      valueChange('lines', null, content.lines.length),
      valueChange('totals', null, { ...totals }),
    ],
  });
  return { bookingId: row.id, versionId, versionToken };
}

/**
 * The booking under its lock for a change of its content, or the refusal: not found, a stale version token, or a
 * version waiting for its decision (goods-in 3.4, 3.5). A Draft before approval takes any change; an approved booking
 * takes a change as its next Draft (3.5, 3.10), but its booking documents are fixed with its first approval (3.1).
 */
export async function draftForChange(
  context: TransactionContext,
  bookingId: string,
  versionToken: string,
  purpose: 'content' | 'documents',
): Promise<{ readonly kind: 'draft'; readonly row: BookingRow } | Outcome<never>> {
  const row = await lockBooking(context, bookingId);
  if (row === undefined) return refused('not-found', 'booking.record-not-found', [bookingItem(bookingId)]);
  const changes = await changesOf(context, row.id);
  const newest = changes.at(-1);
  const content = changes.filter((each) => CONTENT_CHANGES.includes(each.change)).at(-1);
  if (newest === undefined || content === undefined) throw new Error(`A booking has no change: ${row.id}`);
  if (newest.id !== versionToken) return refused('conflict', 'kernel.stale-version', [bookingItem(row.id)]);
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
export async function linesRefusal(
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
