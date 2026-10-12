import { bigint, integer, jsonb, pgSchema, text, timestamp, uuid } from 'drizzle-orm/pg-core';

// Drizzle definitions of the ebo-imports module's tables (code-house-rules 3.4). They mirror the reviewed migration
// (migrations/organisation/0071) and never create or change a table; an integration test compares each with the
// migrated database. Never exported from the module's index.ts (code-house-rules 2).

const eboImports = pgSchema('ebo_imports');

const at = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });

const scopeColumns = () => ({
  legalEntityId: uuid('legal_entity_id'),
  siteId: uuid('site_id'),
  storeId: uuid('store_id'),
  businessUnitId: uuid('business_unit_id'),
});

/** One published report of the earlier POS, kept for checking and reports only (imports-and-opening-data 4.1). */
export const referenceDocument = eboImports.table('reference_document', {
  id: uuid('id').primaryKey(),
  reportKind: text('report_kind').$type<'stock-on-hand' | 'daily-sales'>().notNull(),
  reference: text('reference').notNull(),
  importBatchId: uuid('import_batch_id').notNull(),
  importBatchCode: text('import_batch_code').notNull(),
  importDocumentId: uuid('import_document_id').notNull(),
  publishedByUserId: uuid('published_by_user_id').notNull(),
  roleAssignmentId: uuid('role_assignment_id').notNull(),
  publishedAt: at('published_at').notNull(),
  ...scopeColumns(),
  recordedAt: at('recorded_at').notNull().defaultNow(),
});

/**
 * One line of a reference document, its values by field, null where Unknown (PRD-MOD-015), and a daily-sales line's
 * amount in integer paise (PRD-MOD-014), null where Unknown.
 */
export const referenceLine = eboImports.table('reference_line', {
  id: uuid('id').primaryKey(),
  referenceDocumentId: uuid('reference_document_id').notNull(),
  stagedRowId: uuid('staged_row_id').notNull(),
  rowNumber: integer('row_number').notNull(),
  values: jsonb('values').$type<Record<string, string | null>>().notNull(),
  skuId: uuid('sku_id'),
  amountPaise: bigint('amount_paise', { mode: 'number' }),
  ...scopeColumns(),
  recordedAt: at('recorded_at').notNull().defaultNow(),
});
