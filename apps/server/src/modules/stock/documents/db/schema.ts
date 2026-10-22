import { date, integer, pgSchema, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import type { ReportedCondition } from '../domain/goods.js';

// Drizzle definitions of `stock` · documents' tables (goods-in 8.5; code-house-rules 3.4), in the schema `stock` the
// ledger's part shares (stock-ledger 14.1). They mirror the reviewed migration (migrations/organisation/0095) and never
// create or change a table; an integration test compares each with the migrated database. Never exported from the
// unit's index.ts, so no other unit can name these tables (code-house-rules 2).

const stock = pgSchema('stock');

const at = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });
const day = (name: string) => date(name, { mode: 'string' });

/** The scope facts every row carries (code-house-rules 6.1): the place, the legal entity and the goods' brand. */
const facts = () => ({
  siteId: uuid('site_id').notNull(),
  storeId: uuid('store_id'),
  businessUnitId: uuid('business_unit_id').notNull(),
  legalEntityId: uuid('legal_entity_id').notNull(),
  brandId: uuid('brand_id').notNull(),
});

/** A damage report (goods-in 8.2). */
export const damageReport = stock.table('damage_report', {
  id: uuid('id').primaryKey(),
  number: text('number').notNull(),
  numberAllocationId: uuid('number_allocation_id').notNull(),
  ...facts(),
  mappingVersionId: uuid('mapping_version_id').notNull(),
  locationId: uuid('location_id').notNull(),
  goodsKind: text('goods_kind').$type<'grn-line' | 'product'>().notNull(),
  grnLineId: uuid('grn_line_id'),
  skuId: uuid('sku_id'),
  receiptOriginId: uuid('receipt_origin_id'),
  // The condition the goods were in when reported (0095; goods-in 4.9; RR-571).
  goodsCondition: text('goods_condition').$type<ReportedCondition>().notNull(),
  quantity: integer('quantity').notNull(),
  description: text('description').notNull(),
  reportedByUserId: uuid('reported_by_user_id').notNull(),
  roleAssignmentId: uuid('role_assignment_id').notNull(),
  reportedAt: at('reported_at').notNull(),
  businessDate: day('business_date').notNull(),
  recordedAt: at('recorded_at').notNull().defaultNow(),
});

/** A photo of the damage, attached to the report (goods-in 8.2). */
export const damageReportPhoto = stock.table('damage_report_photo', {
  id: uuid('id').primaryKey(),
  damageReportId: uuid('damage_report_id').notNull(),
  ...facts(),
  storedFileId: uuid('stored_file_id').notNull(),
  attachmentId: uuid('attachment_id').notNull(),
  recordedByUserId: uuid('recorded_by_user_id').notNull(),
  recordedAt: at('recorded_at').notNull().defaultNow(),
});

/** What started a round of a report's decision (goods-in 8.5). */
export type RoundKind = 'reported' | 'renewed' | 'restored';

/** One round of a report's decision: the version its request binds to, with the damage hold it ends (8.5). */
export const damageRound = stock.table('damage_round', {
  id: uuid('id').primaryKey(),
  damageReportId: uuid('damage_report_id').notNull(),
  roundNumber: integer('round_number').notNull(),
  kind: text('kind').$type<RoundKind>().notNull(),
  holdId: uuid('hold_id').notNull(),
  damageReversalId: uuid('damage_reversal_id'),
  ...facts(),
  requestedByUserId: uuid('requested_by_user_id').notNull(),
  recordedAt: at('recorded_at').notNull().defaultNow(),
});

/** The decision of a round (goods-in 8.3). */
export const damageDecision = stock.table('damage_decision', {
  id: uuid('id').primaryKey(),
  damageReportId: uuid('damage_report_id').notNull(),
  damageRoundId: uuid('damage_round_id').notNull(),
  outcome: text('outcome').$type<'Confirmed' | 'Rejected'>().notNull(),
  approvalDecisionId: uuid('approval_decision_id').notNull(),
  decidedByUserId: uuid('decided_by_user_id').notNull(),
  roleAssignmentId: uuid('role_assignment_id').notNull(),
  decidedAt: at('decided_at').notNull(),
  movementId: uuid('movement_id'),
  quarantineHoldId: uuid('quarantine_hold_id'),
  ...facts(),
  recordedAt: at('recorded_at').notNull().defaultNow(),
});

/** A reversal of a confirmation, proposed with a reason (goods-in 8.3; PRD-STK-017). */
export const damageReversal = stock.table('damage_reversal', {
  id: uuid('id').primaryKey(),
  damageReportId: uuid('damage_report_id').notNull(),
  damageDecisionId: uuid('damage_decision_id').notNull(),
  reason: text('reason').notNull(),
  proposedByUserId: uuid('proposed_by_user_id').notNull(),
  roleAssignmentId: uuid('role_assignment_id').notNull(),
  proposedAt: at('proposed_at').notNull(),
  ...facts(),
  recordedAt: at('recorded_at').notNull().defaultNow(),
});

/** The decision on a reversal (goods-in 8.3). */
export const damageReversalDecision = stock.table('damage_reversal_decision', {
  id: uuid('id').primaryKey(),
  damageReversalId: uuid('damage_reversal_id').notNull(),
  outcome: text('outcome').$type<'Approved' | 'Rejected'>().notNull(),
  approvalDecisionId: uuid('approval_decision_id').notNull(),
  decidedByUserId: uuid('decided_by_user_id').notNull(),
  roleAssignmentId: uuid('role_assignment_id').notNull(),
  decidedAt: at('decided_at').notNull(),
  movementId: uuid('movement_id'),
  restoredHoldId: uuid('restored_hold_id'),
  ...facts(),
  recordedAt: at('recorded_at').notNull().defaultNow(),
});
