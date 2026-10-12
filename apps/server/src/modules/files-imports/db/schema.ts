import type {
  ComparisonCounts,
  ComparisonKeyName,
  ComparisonResultName,
  ComparisonRunKind,
  FieldClass,
  ImportBatchState,
  ImportKind,
  IssueSeverity,
  MappingRuleScope,
  ValueSuggestion,
} from '@apparel-os/schemas';
import { bigint, boolean, customType, integer, jsonb, pgSchema, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import type { BalanceLineDraft, SideAmount } from '../domain/balances.js';
import type { ComparisonLineDraft, SideQuantity } from '../domain/comparison.js';
import type { GridCell, GridNote } from '../domain/grid.js';
import type { OutcomeControlTotal, OutcomeCounts, OutcomeDocument, OutcomeMeasure } from '../domain/outcome.js';
import type { SheetSummary, StagedRowDraft, StagedValue } from '../domain/staging.js';

// Drizzle definitions of the files-imports module's tables (code-house-rules 3.4). They mirror the reviewed migrations
// (migrations/organisation/0024, 0061, 0063, 0065, 0072, 0074) and never create or change a table; an integration test compares each with the
// migrated database. Never exported from the module's index.ts (code-house-rules 2).

const filesImports = pgSchema('files_imports');

type VersionState = 'Proposed' | 'Confirmed' | 'Rejected';

const at = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });
const daterange = customType<{ data: string; driverData: string }>({ dataType: () => 'daterange' });

/** The scope facts a batch's documents, rows, entries, issues and totals copy from their batch (15.1; 0063). */
const scopeColumns = () => ({
  legalEntityId: uuid('legal_entity_id'),
  siteId: uuid('site_id'),
  storeId: uuid('store_id'),
  businessUnitId: uuid('business_unit_id'),
});

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

/** A layout (imports 6.1; migration 0061; S1-F06-T01). */
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
  /** The batch version: a new one when a value is entered or a document excluded or put back (3.2; 0063). */
  versionId: uuid('version_id').notNull(),
  /** The version submitted for review, which Publish needs (13.1). */
  submittedVersionId: uuid('submitted_version_id'),
  /** The sheets the reader found, with their state and row counts (8.1). */
  sheets: jsonb('sheets').$type<SheetSummary[]>().notNull(),
  /** The supplier or brand the file comes from, whose mapping rules apply (6.3). */
  sourceSupplierId: uuid('source_supplier_id'),
  sourceBrandId: uuid('source_brand_id'),
});

/** A document inside a batch: the unit of publishing (2). */
export const importDocument = filesImports.table('import_document', {
  id: uuid('id').primaryKey(),
  batchId: uuid('batch_id').notNull(),
  reference: text('reference').notNull(),
  state: text('state').$type<'Staged' | 'Published'>().notNull(),
  publishedAt: at('published_at'),
  recordedAt: at('recorded_at').notNull().defaultNow(),
  /** Excluded from publishing, while Staged (3.2; 0063). */
  excluded: boolean('excluded').notNull(),
  ...scopeColumns(),
  /** The source identity (7.1; 0065): the target and the scope key its handler names, with the reference. */
  target: text('target'),
  scopeKey: text('scope_key'),
  /** The hash of the document's values as published (7.2); null while Staged, and for one published before 0065. */
  contentHash: text('content_hash'),
  /** The published document this one revises (7.3). */
  revisesDocumentId: uuid('revises_document_id'),
  /** The revision that replaced this published document (7.3). */
  replacedByDocumentId: uuid('replaced_by_document_id'),
});

/** One row of the file with every original cell and its normalised values (section 5). */
export const stagedRow = filesImports.table('staged_row', {
  id: uuid('id').primaryKey(),
  batchId: uuid('batch_id').notNull(),
  documentId: uuid('document_id'),
  sheet: text('sheet').notNull(),
  rowNumber: integer('row_number').notNull(),
  /** A row's role; `ignored` is a row of a batch staged before S1-F06-T03 gave rows their roles (6.6). */
  role: text('role').$type<StagedRowDraft['role'] | 'ignored'>().notNull(),
  hidden: boolean('hidden').notNull(),
  cells: jsonb('cells').$type<GridCell[]>().notNull(),
  values: jsonb('values').$type<Record<string, StagedValue>>().notNull(),
  recordedAt: at('recorded_at').notNull().defaultNow(),
  ...scopeColumns(),
});

/** A mapping rule: one source word of one attribute in one scope (6.3; 0063). */
export const mappingRule = filesImports.table('mapping_rule', {
  id: uuid('id').primaryKey(),
  attribute: text('attribute').notNull(),
  scopeKind: text('scope_kind').$type<MappingRuleScope['kind']>().notNull(),
  scopeId: uuid('scope_id'),
  word: text('word').notNull(),
  normalisedWord: text('normalised_word').notNull(),
  caseSensitive: boolean('case_sensitive').notNull(),
  recordedAt: at('recorded_at').notNull().defaultNow(),
});

/** A mapping rule's versions: a target for its dates, Proposed, Confirmed or Rejected (6.3, 6.4). */
export const mappingRuleVersion = filesImports.table('mapping_rule_version', {
  id: uuid('id').primaryKey(),
  mappingRuleId: uuid('mapping_rule_id').notNull(),
  target: text('target').notNull(),
  validDuring: daterange('valid_during').notNull(),
  state: text('state').$type<VersionState>().notNull(),
  proposedByUserId: uuid('proposed_by_user_id').notNull(),
  decidedByUserId: uuid('decided_by_user_id'),
  decidedAt: at('decided_at'),
  recordedAt: at('recorded_at').notNull().defaultNow(),
});

/** A value entered by a person in a staged row (section 5; 0063). */
export const stagedValueEntry = filesImports.table('staged_value_entry', {
  id: uuid('id').primaryKey(),
  batchId: uuid('batch_id').notNull(),
  stagedRowId: uuid('staged_row_id').notNull(),
  field: text('field').notNull(),
  value: text('value').notNull(),
  reason: text('reason').notNull(),
  suggestion: jsonb('suggestion').$type<ValueSuggestion>(),
  batchVersionId: uuid('batch_version_id').notNull(),
  enteredByUserId: uuid('entered_by_user_id').notNull(),
  enteredAt: at('entered_at').notNull(),
  ...scopeColumns(),
  recordedAt: at('recorded_at').notNull().defaultNow(),
});

/** A row issue of the validation report (8.2; 0063). */
export const rowIssue = filesImports.table('row_issue', {
  id: uuid('id').primaryKey(),
  batchId: uuid('batch_id').notNull(),
  batchVersionId: uuid('batch_version_id').notNull(),
  runAt: at('run_at').notNull(),
  documentId: uuid('document_id'),
  stagedRowId: uuid('staged_row_id'),
  sheet: text('sheet'),
  rowNumber: integer('row_number'),
  columnLetters: text('column_letters'),
  field: text('field'),
  class: text('class').notNull(),
  severity: text('severity').$type<IssueSeverity>().notNull(),
  code: text('code').notNull(),
  correction: text('correction').notNull(),
  rule: text('rule').notNull(),
  original: text('original'),
  restrictedClass: text('restricted_class').$type<FieldClass>(),
  missing: jsonb('missing').$type<{ kind: string; [field: string]: string }[]>().notNull(),
  seenByUserId: uuid('seen_by_user_id'),
  seenAt: at('seen_at'),
  ...scopeColumns(),
  recordedAt: at('recorded_at').notNull().defaultNow(),
});

/** A control total reported against the sum of the lines (8.1; 0063). */
export const controlTotal = filesImports.table('control_total', {
  id: uuid('id').primaryKey(),
  batchId: uuid('batch_id').notNull(),
  batchVersionId: uuid('batch_version_id').notNull(),
  runAt: at('run_at').notNull(),
  sheet: text('sheet').notNull(),
  rowNumber: integer('row_number').notNull(),
  columnName: text('column_name').notNull(),
  reported: text('reported'),
  summed: text('summed'),
  ...scopeColumns(),
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
  /** The batch version attempted (0065); null for an attempt before it. */
  batchVersionId: uuid('batch_version_id'),
  /** The quantities and values of the handler's measures, by result (7.4; 0065). */
  measures: jsonb('measures').$type<OutcomeMeasure[]>().notNull(),
  /** The control totals as reported, summed and accepted (7.4; 0065). */
  controlTotals: jsonb('control_totals').$type<OutcomeControlTotal[]>().notNull(),
  ...scopeColumns(),
});

/** A comparison run (imports-and-opening-data 2, 10.3, 15.1; 0072; S1-F13-T01): append-only, never changing a side. */
export const comparisonRun = filesImports.table('comparison_run', {
  id: uuid('id').primaryKey(),
  runKind: text('run_kind').$type<ComparisonRunKind>().notNull(),
  comparisonKey: text('comparison_key').$type<ComparisonKeyName>().notNull(),
  leftSet: text('left_set').$type<'manifest' | 'count' | 'opening-balances'>().notNull(),
  leftBatchId: uuid('left_batch_id'),
  leftBatchVersionId: uuid('left_batch_version_id'),
  leftSiteId: uuid('left_site_id'),
  leftBusinessUnitId: uuid('left_business_unit_id'),
  leftAsOf: at('left_as_of'),
  rightSet: text('right_set').$type<'manifest' | 'stock-on-hand' | 'closed-books'>().notNull(),
  rightBatchId: uuid('right_batch_id').notNull(),
  rightBatchVersionId: uuid('right_batch_version_id').notNull(),
  counts: jsonb('counts').$type<ComparisonCounts>().notNull(),
  runByUserId: uuid('run_by_user_id').notNull(),
  roleAssignmentId: uuid('role_assignment_id').notNull(),
  runAt: at('run_at').notNull(),
  ...scopeColumns(),
  recordedAt: at('recorded_at').notNull().defaultNow(),
});

/** One line of a comparison run (10.3; 0072). */
export const comparisonLine = filesImports.table('comparison_line', {
  id: uuid('id').primaryKey(),
  runId: uuid('run_id').notNull(),
  lineNumber: integer('line_number').notNull(),
  keyedBy: text('keyed_by').$type<ComparisonLineDraft['keyedBy']>().notNull(),
  barcode: text('barcode'),
  skuId: uuid('sku_id'),
  locationId: uuid('location_id'),
  leftState: text('left_state').$type<SideQuantity['state']>().notNull(),
  leftQuantity: bigint('left_quantity', { mode: 'number' }),
  rightState: text('right_state').$type<SideQuantity['state']>().notNull(),
  rightQuantity: bigint('right_quantity', { mode: 'number' }),
  result: text('result').$type<ComparisonResultName>().notNull(),
  leftRows: jsonb('left_rows').$type<string[]>().notNull(),
  rightRows: jsonb('right_rows').$type<string[]>().notNull(),
  ...scopeColumns(),
  recordedAt: at('recorded_at').notNull().defaultNow(),
});

/** One line of a run of opening balances against the closed books (10.4; 0074; S1-F13-T02): totals in paise. */
export const comparisonBalanceLine = filesImports.table('comparison_balance_line', {
  id: uuid('id').primaryKey(),
  runId: uuid('run_id').notNull(),
  lineNumber: integer('line_number').notNull(),
  keyedBy: text('keyed_by').$type<BalanceLineDraft['keyedBy']>().notNull(),
  accountingBookId: uuid('accounting_book_id'),
  account: text('account'),
  party: text('party'),
  leftState: text('left_state').$type<SideAmount['state']>().notNull(),
  leftPaise: bigint('left_paise', { mode: 'number' }),
  rightState: text('right_state').$type<SideAmount['state']>().notNull(),
  rightPaise: bigint('right_paise', { mode: 'number' }),
  result: text('result').$type<ComparisonResultName>().notNull(),
  leftRows: jsonb('left_rows').$type<string[]>().notNull(),
  rightRows: jsonb('right_rows').$type<string[]>().notNull(),
  ...scopeColumns(),
  recordedAt: at('recorded_at').notNull().defaultNow(),
});
