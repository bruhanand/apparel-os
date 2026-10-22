import { bigint, boolean, date, integer, jsonb, numeric, pgSchema, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import type { PtRowDetail } from '../domain/detail.js';

// Drizzle definitions of `merchandise` · PT's tables (code-house-rules 3.4). They mirror the reviewed migration
// (migrations/organisation/0106) and never create or change a table; an integration test compares each with the
// migrated database. Never exported from the unit's index.ts, so no other unit can name these tables
// (code-house-rules 2). The part shares the schema `merchandise` with the catalogue; each table belongs to one part.

const merchandise = pgSchema('merchandise');

const at = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });
const day = (name: string) => date(name, { mode: 'string' });
const paise = (name: string) => bigint(name, { mode: 'number' });

/** The scope facts every row carries: the GRN's place, legal entity and brand (code-house-rules 6.1). */
const facts = () => ({
  siteId: uuid('site_id').notNull(),
  storeId: uuid('store_id'),
  businessUnitId: uuid('business_unit_id').notNull(),
  legalEntityId: uuid('legal_entity_id').notNull(),
  brandId: uuid('brand_id').notNull(),
});

/** The PT of a GRN (goods-in 5.7). */
export const pt = merchandise.table('pt', {
  id: uuid('id').primaryKey(),
  grnId: uuid('grn_id').notNull(),
  ...facts(),
  createdByUserId: uuid('created_by_user_id').notNull(),
  recordedAt: at('recorded_at').notNull().defaultNow(),
});

/** A PT file submitted for the PT's GRN, frozen as submitted (goods-in 5.6, 5.7; PRD-REC-017). */
export const ptRevision = merchandise.table('pt_revision', {
  id: uuid('id').primaryKey(),
  ptId: uuid('pt_id').notNull(),
  revisionNumber: integer('revision_number').notNull(),
  ...facts(),
  importBatchId: uuid('import_batch_id').notNull(),
  importBatchVersionId: uuid('import_batch_version_id').notNull(),
  importDocumentId: uuid('import_document_id').notNull(),
  storedFileId: uuid('stored_file_id').notNull(),
  layoutVersionId: uuid('layout_version_id').notNull(),
  mappingVersionId: uuid('mapping_version_id').notNull(),
  pieces: integer('pieces').notNull(),
  costPaise: paise('cost_paise').notNull(),
  basicPaise: paise('basic_paise').notNull(),
  mrpPaise: paise('mrp_paise').notNull(),
  uploadedByUserId: uuid('uploaded_by_user_id').notNull(),
  roleAssignmentId: uuid('role_assignment_id').notNull(),
  preparerUserIds: uuid('preparer_user_ids').array().notNull(),
  submittedAt: at('submitted_at').notNull(),
  businessDate: day('business_date').notNull(),
  recordedAt: at('recorded_at').notNull().defaultNow(),
});

/** A draft revision withdrawn (goods-in 5.7). */
export const ptRevisionWithdrawal = merchandise.table('pt_revision_withdrawal', {
  id: uuid('id').primaryKey(),
  ptRevisionId: uuid('pt_revision_id').notNull(),
  ...facts(),
  withdrawnByUserId: uuid('withdrawn_by_user_id').notNull(),
  roleAssignmentId: uuid('role_assignment_id').notNull(),
  occurredAt: at('occurred_at').notNull(),
  businessDate: day('business_date').notNull(),
  recordedAt: at('recorded_at').notNull().defaultNow(),
});

/** A style and size of the GRN the revision covers, with its GRN lines (goods-in 5.4, 5.7). */
export const ptCoverage = merchandise.table('pt_coverage', {
  id: uuid('id').primaryKey(),
  ptRevisionId: uuid('pt_revision_id').notNull(),
  lineNumber: integer('line_number').notNull(),
  ...facts(),
  styleCode: text('style_code').notNull(),
  sizeCode: text('size_code'),
  quantity: integer('quantity').notNull(),
  grnLineIds: uuid('grn_line_ids').array().notNull(),
  recordedAt: at('recorded_at').notNull().defaultNow(),
});

/** A new product the revision's rows propose: one SKU of a style code, colour and size (goods-in 5.5). */
export const ptProposedSku = merchandise.table('pt_proposed_sku', {
  id: uuid('id').primaryKey(),
  ptRevisionId: uuid('pt_revision_id').notNull(),
  lineNumber: integer('line_number').notNull(),
  ...facts(),
  styleCode: text('style_code').notNull(),
  existingStyleId: uuid('existing_style_id'),
  colourValueId: uuid('colour_value_id').notNull(),
  sizeValueId: uuid('size_value_id').notNull(),
  recordedAt: at('recorded_at').notNull().defaultNow(),
});

/** A row of the revision, in the file's order (goods-in 5.3, 5.5, 5.7). */
export const ptRow = merchandise.table('pt_row', {
  id: uuid('id').primaryKey(),
  ptRevisionId: uuid('pt_revision_id').notNull(),
  lineNumber: integer('line_number').notNull(),
  ...facts(),
  stagedRowId: uuid('staged_row_id').notNull(),
  sheet: text('sheet').notNull(),
  rowNumber: integer('row_number').notNull(),
  seasonValueId: uuid('season_value_id').notNull(),
  colourValueId: uuid('colour_value_id').notNull(),
  genderValueId: uuid('gender_value_id').notNull(),
  categoryId: uuid('category_id').notNull(),
  typeValueId: uuid('type_value_id').notNull(),
  itemValueId: uuid('item_value_id').notNull(),
  fitValueId: uuid('fit_value_id').notNull(),
  sizeValueId: uuid('size_value_id').notNull(),
  inputTaxValueId: uuid('input_tax_value_id').notNull(),
  outputTaxValueId: uuid('output_tax_value_id').notNull(),
  seasonCode: text('season_code').notNull(),
  colourCode: text('colour_code').notNull(),
  genderCode: text('gender_code').notNull(),
  subCategoryCode: text('sub_category_code').notNull(),
  typeCode: text('type_code').notNull(),
  itemCode: text('item_code').notNull(),
  fitCode: text('fit_code').notNull(),
  sizeCode: text('size_code').notNull(),
  inputTaxCode: text('input_tax_code').notNull(),
  outputTaxCode: text('output_tax_code').notNull(),
  styleCode: text('style_code').notNull(),
  barcode: text('barcode').notNull(),
  hsn: text('hsn').notNull(),
  quantity: integer('quantity').notNull(),
  mrpPaise: paise('mrp_paise').notNull(),
  basicPaise: paise('basic_paise').notNull(),
  pRatePaise: paise('p_rate_paise').notNull(),
  nag: integer('nag').notNull(),
  /** MARGIN, two decimals, read and written as a decimal string (code-house-rules 3.3). */
  margin: numeric('margin', { precision: 9, scale: 2 }).notNull(),
  suggestedSubCategory: text('suggested_sub_category'),
  suggestedType: text('suggested_type'),
  skuId: uuid('sku_id'),
  ptProposedSkuId: uuid('pt_proposed_sku_id'),
  barcodeMapped: boolean('barcode_mapped').notNull(),
  barcodeRepeated: boolean('barcode_repeated').notNull(),
  ptCoverageId: uuid('pt_coverage_id').notNull(),
  detail: jsonb('detail').$type<PtRowDetail>().notNull(),
  recordedAt: at('recorded_at').notNull().defaultNow(),
});
