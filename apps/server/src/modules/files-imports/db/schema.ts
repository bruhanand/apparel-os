import { bigint, pgSchema, text, timestamp, uuid } from 'drizzle-orm/pg-core';

// Drizzle definitions of the files-imports module's tables (code-house-rules 3.4). They mirror the reviewed migration
// (migrations/organisation/0024) and never create or change a table; an integration test compares each with the
// migrated database. Never exported from the module's index.ts (code-house-rules 2).

const filesImports = pgSchema('files_imports');

const at = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });

/** One row for each distinct content; the object it names is encrypted and written once (imports 15.1). */
export const storedFile = filesImports.table('stored_file', {
  id: uuid('id').primaryKey(),
  contentHash: text('content_hash').notNull(),
  sizeBytes: bigint('size_bytes', { mode: 'number' }).notNull(),
  format: text('format').notNull(),
  objectKey: text('object_key').notNull(),
  encryptionScheme: text('encryption_scheme').notNull(),
  /** Null is Unknown: the classes are not known until a layout or an attachment declares them (section 11). */
  restrictedClasses: text('restricted_classes').array(),
  recordedAt: at('recorded_at').notNull().defaultNow(),
});

/** Every receipt of a stored file (imports 3.1 step 2; PRD-IMP-002). */
export const fileReceipt = filesImports.table('file_receipt', {
  id: uuid('id').primaryKey(),
  storedFileId: uuid('stored_file_id').notNull(),
  receivedByKind: text('received_by_kind').notNull(),
  receivedById: uuid('received_by_id').notNull(),
  receivedAt: at('received_at').notNull(),
  sourceSystem: text('source_system').notNull(),
  /** Encrypted with the Organisation key (RR-433): the base64url of nonce, tag and ciphertext. Null: none claimed. */
  claimedReferenceSealed: text('claimed_reference_sealed'),
  /** Encrypted likewise. */
  originalNameSealed: text('original_name_sealed').notNull(),
  encryptionScheme: text('encryption_scheme').notNull(),
  correlationId: uuid('correlation_id').notNull(),
  recordedAt: at('recorded_at').notNull().defaultNow(),
});

/** A stored file linked to a record of any module as evidence (imports 13.1, 15.1). */
export const attachment = filesImports.table('attachment', {
  id: uuid('id').primaryKey(),
  storedFileId: uuid('stored_file_id').notNull(),
  /** The receipt the file was attached from; a receipt of that same stored file (a composite foreign key). */
  fileReceiptId: uuid('file_receipt_id').notNull(),
  recordModule: text('record_module').notNull(),
  recordType: text('record_type').notNull(),
  recordId: uuid('record_id').notNull(),
  recordVersionId: uuid('record_version_id'),
  evidences: text('evidences').notNull(),
  restrictedClasses: text('restricted_classes').array().notNull(),
  attachedByKind: text('attached_by_kind').notNull(),
  attachedById: uuid('attached_by_id').notNull(),
  attachedAt: at('attached_at').notNull(),
  legalEntityId: uuid('legal_entity_id'),
  siteId: uuid('site_id'),
  storeId: uuid('store_id'),
  businessUnitId: uuid('business_unit_id'),
  brandId: uuid('brand_id'),
  recordedAt: at('recorded_at').notNull().defaultNow(),
});
