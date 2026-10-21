import { uuidv7 } from '@apparel-os/domain';
import {
  ARRIVAL_TYPE,
  type ArrivalDraft,
  type ArrivalRecorded,
  type InvoiceDraft,
  type InvoiceRecorded,
  type MissingItem,
  type PhotosAttached,
  type PhotosDraft,
} from '@apparel-os/schemas';
import { and, eq, sql } from 'drizzle-orm';
import type { TransactionContext } from '../../../kernel/index.js';
import type { AuditChange, AuditInterface } from '../../audit/index.js';
import type { FilesImportsInterface } from '../../files-imports/index.js';
import { brandInForce } from '../../merchandise/catalogue/index.js';
import { brandSupplierLinkedOn } from '../../merchandise/parties/index.js';
import { mappingOn, type OrganisationInterface } from '../../organisation/index.js';
import { arrival, arrivalInvoice, arrivalPhoto } from '../db/schema.js';
import { receivingMissing, receivingUnavailable, type AvailabilityDependencies } from '../queries/availability.js';
import {
  arrivalNotFound,
  factsOf,
  grnIssued,
  grnOf,
  lockArrival,
  recordChange,
  refused,
  scopeColumns,
  textKey,
  today,
  trimmed,
  type Actor,
  type ArrivalRow,
  type Outcome,
} from './common.js';

// Record an Arrival, its supplier invoices and its photos (goods-in 4.1, 4.2; PRD-REC-002 to PRD-REC-005,
// PRD-REC-007; DEC-133; S2-F02-T02). The Arrival is recorded at the business unit where the goods physically are, only
// while receiving is available there (goods-in 10.5; PRD-LIF-001, POL-10.08), with a supplier linked to its brand on the
// arrival date (PRD-MER-021). Its invoices come before its count, each with its number, date and uploaded file; a
// number the supplier used on another Arrival is a possible duplicate the receiver confirms or corrects. Every change
// locks the Arrival at step 1, is refused once its GRN is issued, and writes its audit record and the Arrival's next
// version in the same transaction (code-house-rules 8.2, 12.7).

export interface ArrivalDependencies extends AvailabilityDependencies {
  readonly audit: AuditInterface;
  readonly files: Pick<FilesImportsInterface, 'attach'>;
  readonly organisation: Pick<OrganisationInterface, 'structureOn'>;
}

/** The evidence kind of a supplier invoice's file on its Arrival (imports-and-opening-data 11). */
const SUPPLIER_INVOICE = { kind: 'receiving.supplier-invoice', restrictedClasses: [] } as const;
/** The evidence kind of a photo of the cartons, seals or damage (PRD-REC-007). */
const ARRIVAL_PHOTO = { kind: 'receiving.arrival-photo', restrictedClasses: [] } as const;

type ValueChange = Extract<AuditChange, { kind: 'value' }>;
const value = (field: string, after: ValueChange['after']): ValueChange => ({
  kind: 'value',
  field,
  before: null,
  after,
});

/**
 * Records an Arrival (goods-in 4.2). The unit is one in force today at a Site, the location one of its locations in
 * force and not retired today (structure-and-masters 3.5), the brand in force and the supplier linked to it on the
 * arrival date, the arrival not later than now; the Store and legal entity come from the unit's mapping in force today,
 * whose version the Arrival keeps (PRD-MOD-010).
 */
export async function recordArrival(
  context: TransactionContext,
  dependencies: ArrivalDependencies,
  actor: Actor,
  draft: ArrivalDraft,
): Promise<Outcome<ArrivalRecorded>> {
  const date = await today(context);
  if (typeof date !== 'string') return { kind: 'refusal', refusal: date };
  const arrivedAt = new Date(draft.arrivedAt);
  if (arrivedAt.getTime() > context.startedAt.getTime()) {
    return refused('refused', 'receiving.arrival-in-future', [{ kind: 'field', field: 'arrivedAt' }]);
  }
  const arrivalDate = await today(context, arrivedAt);
  if (typeof arrivalDate !== 'string') return { kind: 'refusal', refusal: arrivalDate };
  const structure = await dependencies.organisation.structureOn(context, date);
  const unit = structure.businessUnits.find((each) => each.id === draft.businessUnitId);
  if (unit === undefined) {
    return refused('refused', 'receiving.unit-not-at-site', [
      { kind: 'record', recordType: 'organisation.business_unit', recordId: draft.businessUnitId },
    ]);
  }
  const unavailable = receivingUnavailable(
    await receivingMissing(context, dependencies, { siteId: unit.siteId, businessUnitId: unit.id }, date),
  );
  if (unavailable !== undefined) return { kind: 'refusal', refusal: unavailable };
  const location = structure.locations.find(
    (each) => each.id === draft.receivingLocationId && each.businessUnitId === unit.id && !each.retired,
  );
  if (location === undefined) {
    return refused('refused', 'receiving.location-not-of-unit', [
      { kind: 'record', recordType: 'organisation.location', recordId: draft.receivingLocationId },
    ]);
  }
  if (!(await brandInForce(context, draft.brandId, arrivalDate))) {
    return refused('refused', 'receiving.brand-not-in-force', [
      { kind: 'record', recordType: 'merchandise.brand', recordId: draft.brandId },
    ]);
  }
  if (!(await brandSupplierLinkedOn(context, draft.brandId, draft.supplierPartyId, arrivalDate))) {
    return refused('refused', 'receiving.supplier-not-linked', [
      { kind: 'record', recordType: 'merchandise.party', recordId: draft.supplierPartyId },
      { kind: 'record', recordType: 'merchandise.brand', recordId: draft.brandId },
    ]);
  }
  const mapping = await mappingOn(context, unit.id, date);
  // Available has just asked for it: a mapping in force and verified.
  if (mapping === undefined) throw new Error('A unit receiving is available at has a mapping in force');
  const values = {
    id: uuidv7(),
    siteId: unit.siteId,
    storeId: mapping.storeId,
    businessUnitId: unit.id,
    legalEntityId: mapping.legalEntityId,
    mappingVersionId: mapping.mappingVersionId,
    receivingLocationId: location.id,
    brandId: draft.brandId,
    supplierPartyId: draft.supplierPartyId,
    transporter: trimmed(draft.transporter),
    lorryReceiptNumber: trimmed(draft.lorryReceipt.number),
    lorryReceiptDate: draft.lorryReceipt.date,
    vehicleNumber: draft.vehicleNumber === undefined ? null : trimmed(draft.vehicleNumber),
    ewayBillNumber: draft.ewayBillNumber === undefined ? null : trimmed(draft.ewayBillNumber),
    cartons: draft.cartons,
    arrivedAt,
    arrivalDate,
    recordedByUserId: actor.userId,
  };
  await context.tx.insert(arrival).values(values);
  const row: ArrivalRow = { ...values, recordedAt: context.startedAt };
  const versionToken = await recordChange(context, row, 'arrival', actor.userId);
  await dependencies.audit.record(context, {
    actor: { kind: 'user', id: actor.userId },
    roleAssignmentId: actor.roleAssignmentId,
    scope: factsOf(row),
    record: { module: 'receiving', type: ARRIVAL_TYPE, id: row.id },
    operation: 'record-arrival',
    changes: [
      value('businessUnitId', row.businessUnitId),
      value('receivingLocationId', row.receivingLocationId),
      value('supplierPartyId', row.supplierPartyId),
      value('brandId', row.brandId),
      value('transporter', row.transporter),
      value('lorryReceipt', { number: row.lorryReceiptNumber, date: row.lorryReceiptDate }),
      value('vehicleNumber', row.vehicleNumber),
      value('ewayBillNumber', row.ewayBillNumber),
      value('cartons', row.cartons),
      value('arrivedAt', draft.arrivedAt),
    ],
    source: { kind: 'screen' },
  });
  return { kind: 'success', answer: { arrivalId: row.id, versionToken } };
}

/**
 * The Arrival under its lock for a change before its GRN, or the refusal: not found, or its GRN issued (goods-in 4.5).
 */
export async function arrivalForChange(
  context: TransactionContext,
  arrivalId: string,
): Promise<{ readonly kind: 'open'; readonly row: ArrivalRow } | Outcome<never>> {
  const row = await lockArrival(context, arrivalId);
  if (row === undefined) return arrivalNotFound(arrivalId);
  const issued = await grnOf(context, arrivalId);
  if (issued !== undefined) return grnIssued(issued.id);
  return { kind: 'open', row };
}

/**
 * Records a supplier invoice of the Arrival with its file (goods-in 4.2; DEC-133). A number the Arrival holds already
 * is refused; one the same supplier used on another Arrival is a possible duplicate: refused naming the other Arrivals
 * the receiver may see, and saying when others exist, until the receiver confirms it, which the invoice then keeps.
 */
export async function recordInvoice(
  context: TransactionContext,
  dependencies: ArrivalDependencies,
  actor: Actor,
  arrivalId: string,
  draft: InvoiceDraft,
): Promise<Outcome<InvoiceRecorded>> {
  const found = await arrivalForChange(context, arrivalId);
  if (found.kind !== 'open') return found;
  const { row } = found;
  const number = trimmed(draft.number);
  const numberKey = textKey(draft.number);
  const [repeated] = await context.tx
    .select({ id: arrivalInvoice.id })
    .from(arrivalInvoice)
    .where(and(eq(arrivalInvoice.arrivalId, row.id), eq(arrivalInvoice.numberKey, numberKey)));
  if (repeated !== undefined) {
    return refused('refused', 'receiving.invoice-number-repeated', [
      { kind: 'record', recordType: 'receiving.arrival_invoice', recordId: repeated.id },
    ]);
  }
  const used = await context.tx.execute<{ arrival_id: string; visible: boolean }>(
    sql`select arrival_id::text as arrival_id, visible
        from receiving.invoice_number_used(${row.supplierPartyId}::uuid, ${numberKey}, ${row.id}::uuid)
        order by arrival_id`,
  );
  const visible = used.rows.filter((each) => each.visible).map((each) => each.arrival_id);
  const elsewhere = used.rows.some((each) => !each.visible);
  if (used.rows.length > 0 && draft.confirmPossibleDuplicate !== true) {
    const missing: MissingItem[] = visible.map((id) => ({ kind: 'record', recordType: ARRIVAL_TYPE, recordId: id }));
    if (elsewhere) missing.push({ kind: 'possible-duplicate-elsewhere' });
    return refused('refused', 'receiving.possible-duplicate-invoice', missing);
  }
  const invoiceId = uuidv7();
  const attached = await dependencies.files.attach(context, {
    storedFileId: draft.file.storedFileId,
    fileReceiptId: draft.file.fileReceiptId,
    record: { module: 'receiving', type: ARRIVAL_TYPE, id: row.id, versionId: invoiceId },
    evidence: SUPPLIER_INVOICE,
    scope: factsOf(row),
    attachedBy: { kind: 'user', id: actor.userId },
    roleAssignmentId: actor.roleAssignmentId,
  });
  await context.tx.insert(arrivalInvoice).values({
    id: invoiceId,
    arrivalId: row.id,
    ...scopeColumns(row),
    supplierPartyId: row.supplierPartyId,
    invoiceNumber: number,
    numberKey,
    invoiceDate: draft.date,
    storedFileId: draft.file.storedFileId,
    attachmentId: attached.attachmentId,
    possibleDuplicateArrivalIds: visible,
    possibleDuplicateElsewhere: elsewhere,
    recordedByUserId: actor.userId,
  });
  const versionToken = await recordChange(context, row, 'invoice', actor.userId);
  await dependencies.audit.record(context, {
    actor: { kind: 'user', id: actor.userId },
    roleAssignmentId: actor.roleAssignmentId,
    scope: factsOf(row),
    record: { module: 'receiving', type: ARRIVAL_TYPE, id: row.id, versionId: invoiceId },
    operation: 'record-arrival-invoice',
    changes: [
      value('invoiceNumber', number),
      value('invoiceDate', draft.date),
      value('attachmentId', attached.attachmentId),
      value('possibleDuplicateOf', visible),
      value('possibleDuplicateElsewhere', elsewhere),
    ],
    source: { kind: 'screen' },
  });
  return { kind: 'success', answer: { invoiceId, attachmentId: attached.attachmentId, versionToken } };
}

/** Attaches photos of the cartons, seals or damage to the Arrival (goods-in 4.2; PRD-REC-007); a file once only. */
export async function attachPhotos(
  context: TransactionContext,
  dependencies: ArrivalDependencies,
  actor: Actor,
  arrivalId: string,
  draft: PhotosDraft,
): Promise<Outcome<PhotosAttached>> {
  const found = await arrivalForChange(context, arrivalId);
  if (found.kind !== 'open') return found;
  const { row } = found;
  const kept = await context.tx
    .select({ storedFileId: arrivalPhoto.storedFileId, attachmentId: arrivalPhoto.attachmentId })
    .from(arrivalPhoto)
    .where(eq(arrivalPhoto.arrivalId, row.id));
  const attachmentIds: string[] = [];
  for (const file of draft.files) {
    const already = kept.find((each) => each.storedFileId === file.storedFileId);
    if (already !== undefined) {
      attachmentIds.push(already.attachmentId);
      continue;
    }
    const photoId = uuidv7();
    const attached = await dependencies.files.attach(context, {
      storedFileId: file.storedFileId,
      fileReceiptId: file.fileReceiptId,
      record: { module: 'receiving', type: ARRIVAL_TYPE, id: row.id, versionId: photoId },
      evidence: ARRIVAL_PHOTO,
      scope: factsOf(row),
      attachedBy: { kind: 'user', id: actor.userId },
      roleAssignmentId: actor.roleAssignmentId,
    });
    await context.tx.insert(arrivalPhoto).values({
      id: photoId,
      arrivalId: row.id,
      ...scopeColumns(row),
      storedFileId: file.storedFileId,
      attachmentId: attached.attachmentId,
      recordedByUserId: actor.userId,
    });
    attachmentIds.push(attached.attachmentId);
  }
  const versionToken = await recordChange(context, row, 'photos', actor.userId);
  await dependencies.audit.record(context, {
    actor: { kind: 'user', id: actor.userId },
    roleAssignmentId: actor.roleAssignmentId,
    scope: factsOf(row),
    record: { module: 'receiving', type: ARRIVAL_TYPE, id: row.id },
    operation: 'attach-arrival-photos',
    changes: [value('photoAttachmentIds', attachmentIds)],
    source: { kind: 'screen' },
  });
  return { kind: 'success', answer: { attachmentIds, versionToken } };
}
