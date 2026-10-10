import type { FieldClass, ImportBatchState, ImportKind } from '@apparel-os/schemas';
import { bigint, boolean, integer, jsonb, pgSchema, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import type { GridCell, GridNote } from '../domain/grid.js';
import type { OutcomeCounts, OutcomeDocument } from '../domain/outcome.js';
import type { StagedRowDraft, StagedValue } from '../domain/staging.js';

// Drizzle definitions of the files-imports module's tables (code-house-rules 3.4). They mirror the reviewed migrations
// (migrations/organisation/0024, 0055) and never create or change a table; an integration test compares each with the
// migrated database. Never exported from the module's index.ts (code-house-rules 2).

const filesImports = pgSchema('files_imports');

type VersionState = 'Proposed' | 'Confirmed' | 'Rejected';

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

/** A layout (imports 6.1; migration 0055; S1-F06-T01). */
export const layout = filesImports.table('layout', {
  id: uuid('id').primaryKey(),
  code: text('code').notNull(),
  source: text('source').notNull(),
  documentType: text('document_type').notNull(),
  kinds: text('kinds').array().notNull(),
  recordedAt: at('recorded_at').notNull().defaultNow(),
});

/** A layout's versions: the structure, never data (6.1). */
export const layoutVersion = filesImports.table('layout_version', {
  id: uuid('id').primaryKey(),
  layoutId: uuid('layout_id').notNull(),
  version: integer('version').notNull(),
  structure: jsonb('structure').$type<unknown>().notNull(),
  state: text('state').$type<VersionState>().notNull(),
  proposedByUserId: uuid('proposed_by_user_id').notNull(),
  decidedByUserId: uuid('decided_by_user_id'),
  decidedAt: at('decided_at'),
  recordedAt: at('recorded_at').notNull().defaultNow(),
});

/** A mapping: one layout version and one target, fixed (6.2). */
export const mapping = filesImports.table('mapping', {
  id: uuid('id').primaryKey(),
  code: text('code').notNull(),
  layoutVersionId: uuid('layout_version_id').notNull(),
  target: text('target').notNull(),
  recordedAt: at('recorded_at').notNull().defaultNow(),
});

/** A mapping's versions (6.2). */
export const mappingVersion = filesImports.table('mapping_version', {
  id: uuid('id').primaryKey(),
  mappingId: uuid('mapping_id').notNull(),
  version: integer('version').notNull(),
  fields: jsonb('fields').$type<unknown>().notNull(),
  state: text('state').$type<VersionState>().notNull(),
  proposedByUserId: uuid('proposed_by_user_id').notNull(),
  decidedByUserId: uuid('decided_by_user_id'),
  decidedAt: at('decided_at'),
  recordedAt: at('recorded_at').notNull().defaultNow(),
});

/** An import batch (2, 3.2, 15.1): scoped by its facts under row-level security. */
export const importBatch = filesImports.table('import_batch', {
  id: uuid('id').primaryKey(),
  code: text('code').notNull(),
  kind: text('kind').$type<ImportKind>().notNull(),
  target: text('target').notNull(),
  state: text('state').$type<ImportBatchState>().notNull(),
  storedFileId: uuid('stored_file_id').notNull(),
  fileReceiptId: uuid('file_receipt_id').notNull(),
  layoutVersionId: uuid('layout_version_id').notNull(),
  mappingVersionId: uuid('mapping_version_id').notNull(),
  /** The classes the file is held to carry: every class while its layout version is not Confirmed (section 11). */
  restrictedClasses: text('restricted_classes').array().$type<FieldClass[]>().notNull(),
  /** What the reader noted it could not read (9.1, A-11). */
  readerNotes: jsonb('reader_notes').$type<GridNote[]>().notNull(),
  startedByUserId: uuid('started_by_user_id').notNull(),
  startedAt: at('started_at').notNull(),
  legalEntityId: uuid('legal_entity_id'),
  siteId: uuid('site_id'),
  storeId: uuid('store_id'),
  businessUnitId: uuid('business_unit_id'),
  recordedAt: at('recorded_at').notNull().defaultNow(),
});

/** A document inside a batch: the unit of publishing (2). */
export const importDocument = filesImports.table('import_document', {
  id: uuid('id').primaryKey(),
  batchId: uuid('batch_id').notNull(),
  reference: text('reference').notNull(),
  state: text('state').$type<'Staged' | 'Published'>().notNull(),
  publishedAt: at('published_at'),
  recordedAt: at('recorded_at').notNull().defaultNow(),
});

/** One row of the file with every original cell and its normalised values (section 5). */
export const stagedRow = filesImports.table('staged_row', {
  id: uuid('id').primaryKey(),
  batchId: uuid('batch_id').notNull(),
  documentId: uuid('document_id'),
  sheet: text('sheet').notNull(),
  rowNumber: integer('row_number').notNull(),
  role: text('role').$type<StagedRowDraft['role']>().notNull(),
  hidden: boolean('hidden').notNull(),
  cells: jsonb('cells').$type<GridCell[]>().notNull(),
  values: jsonb('values').$type<Record<string, StagedValue>>().notNull(),
  recordedAt: at('recorded_at').notNull().defaultNow(),
});

/** One publish attempt's outcome (7.4). */
export const importOutcome = filesImports.table('import_outcome', {
  id: uuid('id').primaryKey(),
  batchId: uuid('batch_id').notNull(),
  result: text('result').$type<'published' | 'failed'>().notNull(),
  refusalCode: text('refusal_code'),
  counts: jsonb('counts').$type<OutcomeCounts>().notNull(),
  documents: jsonb('documents').$type<OutcomeDocument[]>().notNull(),
  attemptedByUserId: uuid('attempted_by_user_id').notNull(),
  attemptedAt: at('attempted_at').notNull(),
  recordedAt: at('recorded_at').notNull().defaultNow(),
});
