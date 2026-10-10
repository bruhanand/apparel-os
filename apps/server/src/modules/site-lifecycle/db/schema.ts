import type { Activity, ReadinessCheck } from '@apparel-os/schemas';
import { boolean, jsonb, pgSchema, text, timestamp, uuid } from 'drizzle-orm/pg-core';

// Drizzle definitions of the site-lifecycle module's tables (code-house-rules 3.4). They mirror the reviewed migration
// (migrations/organisation/0050) and never create or change a table; an integration test compares each with the
// migrated database. Never exported from the module's index.ts (code-house-rules 2).

const siteLifecycle = pgSchema('site_lifecycle');

const at = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });

/**
 * An activity of a Site's shared readiness (no business unit) or of a business unit: what its runs and approvals bind
 * to (PRD-LIF-001). Append-only; locked.
 */
export const activation = siteLifecycle.table('activation', {
  id: uuid('id').primaryKey(),
  businessUnitId: uuid('business_unit_id'),
  siteId: uuid('site_id').notNull(),
  activity: text('activity').$type<Activity>().notNull(),
  recordedAt: at('recorded_at').notNull(),
});

/** One run of the readiness checks, for a Site's shared readiness or a business unit (PRD-LIF-002). Append-only. */
export const readinessRecord = siteLifecycle.table('readiness_record', {
  id: uuid('id').primaryKey(),
  activationId: uuid('activation_id').notNull(),
  businessUnitId: uuid('business_unit_id'),
  siteId: uuid('site_id').notNull(),
  activity: text('activity').$type<Activity>().notNull(),
  passed: boolean('passed').notNull(),
  checks: jsonb('checks').$type<ReadinessCheck[]>().notNull(),
  zeroStockDeclarationId: uuid('zero_stock_declaration_id'),
  ranByUserId: uuid('ran_by_user_id').notNull(),
  roleAssignmentId: uuid('role_assignment_id').notNull(),
  ranAt: at('ran_at').notNull(),
});

/** A unit's explicit zero opening-stock declaration (PRD-LIF-003; DEC-117). Append-only. */
export const zeroStockDeclaration = siteLifecycle.table('zero_stock_declaration', {
  id: uuid('id').primaryKey(),
  businessUnitId: uuid('business_unit_id').notNull(),
  siteId: uuid('site_id').notNull(),
  declaredByUserId: uuid('declared_by_user_id').notNull(),
  roleAssignmentId: uuid('role_assignment_id').notNull(),
  declaredAt: at('declared_at').notNull(),
});

/** A Site made ready for an activity: the approval of one run of its shared checks (PRD-LIF-001). Append-only. */
export const siteReadinessApproval = siteLifecycle.table('site_readiness_approval', {
  id: uuid('id').primaryKey(),
  readinessRecordId: uuid('readiness_record_id').notNull(),
  siteId: uuid('site_id').notNull(),
  activity: text('activity').$type<Activity>().notNull(),
  approvalDecisionId: uuid('approval_decision_id').notNull(),
  approvedByUserId: uuid('approved_by_user_id').notNull(),
  roleAssignmentId: uuid('role_assignment_id'),
  approvedAt: at('approved_at').notNull(),
});
