import { boolean, date, integer, pgSchema, text, timestamp, uuid } from 'drizzle-orm/pg-core';

// Drizzle definitions of `receiving`'s tables (code-house-rules 3.4). They mirror the reviewed migration
// (migrations/organisation/0088, 0096, 0102) and never create or change a table; an integration test compares each
// with the migrated database. Never exported from the unit's index.ts, so no other unit can name these tables
// (code-house-rules 2).

const receiving = pgSchema('receiving');

const at = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });
const day = (name: string) => date(name, { mode: 'string' });

/** The scope facts every row carries (code-house-rules 6.1): the place, the legal entity and the brand. */
const facts = () => ({
  siteId: uuid('site_id').notNull(),
  storeId: uuid('store_id'),
  businessUnitId: uuid('business_unit_id').notNull(),
  legalEntityId: uuid('legal_entity_id').notNull(),
  brandId: uuid('brand_id').notNull(),
});

/** An Arrival (goods-in 4.2). */
export const arrival = receiving.table('arrival', {
  id: uuid('id').primaryKey(),
  ...facts(),
  mappingVersionId: uuid('mapping_version_id').notNull(),
  receivingLocationId: uuid('receiving_location_id').notNull(),
  supplierPartyId: uuid('supplier_party_id').notNull(),
  transporter: text('transporter').notNull(),
  lorryReceiptNumber: text('lorry_receipt_number').notNull(),
  lorryReceiptDate: day('lorry_receipt_date').notNull(),
  vehicleNumber: text('vehicle_number'),
  ewayBillNumber: text('eway_bill_number'),
  cartons: integer('cartons').notNull(),
  arrivedAt: at('arrived_at').notNull(),
  arrivalDate: day('arrival_date').notNull(),
  recordedByUserId: uuid('recorded_by_user_id').notNull(),
  recordedAt: at('recorded_at').notNull().defaultNow(),
  /** The booking the goods come against, `booking`'s record, or none (goods-in 3.7, 4.2; migration 0102). */
  bookingId: uuid('booking_id'),
});

/** What a change of an Arrival before its GRN was. */
export type ArrivalChangeKind = 'arrival' | 'invoice' | 'photos' | 'count-line' | 'count-line-removal';

/** Each change of an Arrival before its GRN, numbered in order; the newest is its version token (12.7). */
export const arrivalChange = receiving.table('arrival_change', {
  id: uuid('id').primaryKey(),
  arrivalId: uuid('arrival_id').notNull(),
  changeNumber: integer('change_number').notNull(),
  change: text('change').$type<ArrivalChangeKind>().notNull(),
  ...facts(),
  changedByUserId: uuid('changed_by_user_id').notNull(),
  recordedAt: at('recorded_at').notNull().defaultNow(),
});

/** A supplier invoice of an Arrival (DEC-133; goods-in 4.2). */
export const arrivalInvoice = receiving.table('arrival_invoice', {
  id: uuid('id').primaryKey(),
  arrivalId: uuid('arrival_id').notNull(),
  ...facts(),
  supplierPartyId: uuid('supplier_party_id').notNull(),
  invoiceNumber: text('invoice_number').notNull(),
  numberKey: text('number_key').notNull(),
  invoiceDate: day('invoice_date').notNull(),
  storedFileId: uuid('stored_file_id').notNull(),
  attachmentId: uuid('attachment_id').notNull(),
  possibleDuplicateArrivalIds: uuid('possible_duplicate_arrival_ids').array().notNull(),
  possibleDuplicateElsewhere: boolean('possible_duplicate_elsewhere').notNull(),
  recordedByUserId: uuid('recorded_by_user_id').notNull(),
  recordedAt: at('recorded_at').notNull().defaultNow(),
});

/** A photo attached to an Arrival (PRD-REC-007). */
export const arrivalPhoto = receiving.table('arrival_photo', {
  id: uuid('id').primaryKey(),
  arrivalId: uuid('arrival_id').notNull(),
  ...facts(),
  storedFileId: uuid('stored_file_id').notNull(),
  attachmentId: uuid('attachment_id').notNull(),
  recordedByUserId: uuid('recorded_by_user_id').notNull(),
  recordedAt: at('recorded_at').notNull().defaultNow(),
});

/** What a count line counts (goods-in 4.4). */
export type LineGoodsColumn = 'on-invoice' | 'wrong' | 'unidentified';
/** What the receiver records of a line's extra pieces (goods-in 4.4). */
export type ExtraColumn = 'received' | 'not-received';

/** One saved version of a count line (goods-in 4.3, 4.4). */
export const countEntry = receiving.table('count_entry', {
  id: uuid('id').primaryKey(),
  arrivalId: uuid('arrival_id').notNull(),
  lineId: uuid('line_id').notNull(),
  replacesEntryId: uuid('replaces_entry_id'),
  ...facts(),
  removed: boolean('removed').notNull(),
  goods: text('goods').$type<LineGoodsColumn>().notNull(),
  styleCode: text('style_code'),
  colour: text('colour'),
  sizeAttributeId: uuid('size_attribute_id'),
  sizeValueId: uuid('size_value_id'),
  sizeCode: text('size_code'),
  sizeMarkedAttributeVersionId: uuid('size_marked_attribute_version_id'),
  skuId: uuid('sku_id'),
  invoiceQuantity: integer('invoice_quantity').notNull(),
  countedQuantity: integer('counted_quantity').notNull(),
  batchCode: text('batch_code'),
  expiryDate: day('expiry_date'),
  description: text('description'),
  extra: text('extra').$type<ExtraColumn>(),
  damagedQuantity: integer('damaged_quantity'),
  damageDescription: text('damage_description'),
  damagePhotoStoredFileId: uuid('damage_photo_stored_file_id'),
  damagePhotoFileReceiptId: uuid('damage_photo_file_receipt_id'),
  enteredByUserId: uuid('entered_by_user_id').notNull(),
  recordedAt: at('recorded_at').notNull().defaultNow(),
});

/** The owner a GRN gave its receipt counts (PRD-ORG-014; goods-in 4.5). */
export type OwnerKind = 'organisation' | 'supplier' | 'brand' | 'unknown';

/** A GRN (goods-in 4.5). */
export const grn = receiving.table('grn', {
  id: uuid('id').primaryKey(),
  arrivalId: uuid('arrival_id').notNull(),
  ...facts(),
  number: text('number').notNull(),
  numberAllocationId: uuid('number_allocation_id').notNull(),
  arrivalVersionId: uuid('arrival_version_id').notNull(),
  agreementVersionId: uuid('agreement_version_id'),
  ownerKind: text('owner_kind').$type<OwnerKind>().notNull(),
  ownerId: uuid('owner_id'),
  countedByUserIds: uuid('counted_by_user_ids').array().notNull(),
  issuedByUserId: uuid('issued_by_user_id').notNull(),
  issuedAt: at('issued_at').notNull(),
  businessDate: day('business_date').notNull(),
  recordedAt: at('recorded_at').notNull().defaultNow(),
});

/** A GRN line (goods-in 4.3 to 4.5). */
export const grnLine = receiving.table('grn_line', {
  id: uuid('id').primaryKey(),
  grnId: uuid('grn_id').notNull(),
  lineNumber: integer('line_number').notNull(),
  countEntryId: uuid('count_entry_id').notNull(),
  ...facts(),
  goods: text('goods').$type<LineGoodsColumn>().notNull(),
  styleCode: text('style_code'),
  colour: text('colour'),
  sizeCode: text('size_code'),
  skuId: uuid('sku_id'),
  invoiceQuantity: integer('invoice_quantity').notNull(),
  countedQuantity: integer('counted_quantity').notNull(),
  batchCode: text('batch_code'),
  expiryDate: day('expiry_date'),
  description: text('description'),
  extra: text('extra').$type<ExtraColumn>(),
  damagedQuantity: integer('damaged_quantity'),
  damageDescription: text('damage_description'),
  damageReportId: uuid('damage_report_id'),
  countedByUserIds: uuid('counted_by_user_ids').array().notNull(),
  recordedAt: at('recorded_at').notNull().defaultNow(),
});

/** The kind of a held line (goods-in 4.6). */
export type HeldKindColumn = 'excess' | 'wrong' | 'unidentified';

/** A held line: the extra pieces of a GRN line received and held, which Booking decides (goods-in 4.6). */
export const heldLine = receiving.table('held_line', {
  id: uuid('id').primaryKey(),
  grnId: uuid('grn_id').notNull(),
  grnLineId: uuid('grn_line_id').notNull(),
  ...facts(),
  kind: text('kind').$type<HeldKindColumn>().notNull(),
  quantity: integer('quantity').notNull(),
  receiptOriginId: uuid('receipt_origin_id').notNull(),
  holdId: uuid('hold_id').notNull(),
  recordedAt: at('recorded_at').notNull().defaultNow(),
});

/** A version of a held line, which its decision's approval binds to (goods-in 4.6). */
export const heldLineVersion = receiving.table('held_line_version', {
  id: uuid('id').primaryKey(),
  heldLineId: uuid('held_line_id').notNull(),
  versionNumber: integer('version_number').notNull(),
  ...facts(),
  kind: text('kind').$type<'issued' | 'named'>().notNull(),
  namedStyleCode: text('named_style_code'),
  namedColour: text('named_colour'),
  namedSizeAttributeId: uuid('named_size_attribute_id'),
  namedSizeValueId: uuid('named_size_value_id'),
  namedSizeCode: text('named_size_code'),
  namedSizeMarkedAttributeVersionId: uuid('named_size_marked_attribute_version_id'),
  namedSkuId: uuid('named_sku_id'),
  preparedByUserId: uuid('prepared_by_user_id').notNull(),
  recordedAt: at('recorded_at').notNull().defaultNow(),
});

/** A held line's decision: taken in or left held, once (goods-in 4.6). */
export const heldLineDecision = receiving.table('held_line_decision', {
  id: uuid('id').primaryKey(),
  heldLineId: uuid('held_line_id').notNull(),
  heldLineVersionId: uuid('held_line_version_id').notNull(),
  ...facts(),
  outcome: text('outcome').$type<'taken-in' | 'left-held'>().notNull(),
  approvalDecisionId: uuid('approval_decision_id').notNull(),
  decidedByUserId: uuid('decided_by_user_id').notNull(),
  roleAssignmentId: uuid('role_assignment_id').notNull(),
  decidedAt: at('decided_at').notNull(),
  recordedAt: at('recorded_at').notNull().defaultNow(),
});

/** Why a GRN line went to Booking for review at its GRN's issue (goods-in 3.7, 4.10). */
export type ReviewReasonColumn =
  'no-match' | 'ambiguous' | 'other-site' | 'other-supplier' | 'not-approved' | 'late' | 'excess';

/**
 * The outcome at its GRN's issue of a GRN line of an Arrival against a booking that delivers pieces: linked to the
 * booking line it matches, or sent to Booking for review with why (goods-in 3.7, 4.10).
 */
export const grnLineBooking = receiving.table('grn_line_booking', {
  id: uuid('id').primaryKey(),
  grnId: uuid('grn_id').notNull(),
  grnLineId: uuid('grn_line_id').notNull(),
  ...facts(),
  bookingId: uuid('booking_id').notNull(),
  outcome: text('outcome').$type<'linked' | 'review'>().notNull(),
  reason: text('reason').$type<ReviewReasonColumn>(),
  bookingLineKey: uuid('booking_line_key'),
  receiptLinkId: uuid('receipt_link_id'),
  recordedAt: at('recorded_at').notNull().defaultNow(),
});
