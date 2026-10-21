import { boolean, date, integer, pgSchema, text, timestamp, uuid } from 'drizzle-orm/pg-core';

// Drizzle definitions of `receiving`'s tables (code-house-rules 3.4). They mirror the reviewed migration
// (migrations/organisation/0088) and never create or change a table; an integration test compares each with the
// migrated database. Never exported from the unit's index.ts, so no other unit can name these tables
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

/** One saved version of a count line (goods-in 4.3). */
export const countEntry = receiving.table('count_entry', {
  id: uuid('id').primaryKey(),
  arrivalId: uuid('arrival_id').notNull(),
  lineId: uuid('line_id').notNull(),
  replacesEntryId: uuid('replaces_entry_id'),
  ...facts(),
  removed: boolean('removed').notNull(),
  styleCode: text('style_code').notNull(),
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

/** A GRN line (goods-in 4.3, 4.5). */
export const grnLine = receiving.table('grn_line', {
  id: uuid('id').primaryKey(),
  grnId: uuid('grn_id').notNull(),
  lineNumber: integer('line_number').notNull(),
  countEntryId: uuid('count_entry_id').notNull(),
  ...facts(),
  styleCode: text('style_code').notNull(),
  colour: text('colour'),
  sizeCode: text('size_code'),
  skuId: uuid('sku_id'),
  invoiceQuantity: integer('invoice_quantity').notNull(),
  countedQuantity: integer('counted_quantity').notNull(),
  batchCode: text('batch_code'),
  expiryDate: day('expiry_date'),
  countedByUserIds: uuid('counted_by_user_ids').array().notNull(),
  recordedAt: at('recorded_at').notNull().defaultNow(),
});
