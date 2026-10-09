import { bigint, boolean, customType, jsonb, pgSchema, text, timestamp, uuid } from 'drizzle-orm/pg-core';

// Drizzle definitions of the inbox module's tables (code-house-rules 3.4). They mirror the reviewed migration
// (migrations/organisation/0014) and never create or change a table; an integration test compares each with the
// migrated database. Never exported from the module's index.ts (code-house-rules 2).

const inbox = pgSchema('inbox');

const at = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });

const daterange = customType<{ data: string; driverData: string }>({
  dataType: () => 'daterange',
});

/** A work item: a projection of its owner's record (access-and-approvals 11.1; domain-model 3.3). */
export const workItem = inbox.table('work_item', {
  id: uuid('id').primaryKey(),
  kind: text('kind').notNull(),
  ownerModule: text('owner_module').notNull(),
  ownerRecordType: text('owner_record_type').notNull(),
  ownerRecordId: uuid('owner_record_id').notNull(),
  ownerVersionId: uuid('owner_version_id').notNull(),
  state: text('state').notNull(),
  open: boolean('open').notNull(),
  dueAt: at('due_at'),
  exposureKind: text('exposure_kind').notNull(),
  exposureAmount: bigint('exposure_amount', { mode: 'number' }),
  siteId: uuid('site_id'),
  storeId: uuid('store_id'),
  businessUnitId: uuid('business_unit_id'),
  legalEntityId: uuid('legal_entity_id'),
  brandId: uuid('brand_id'),
  recordedAt: at('recorded_at').notNull().defaultNow(),
  /** The routing version that gave a task or an approval its due time and escalation (11.1; migration 0042). */
  routingVersionId: uuid('routing_version_id'),
});

/** Who may act on an item: a named user, or the owner's eligibility reference (11.1). */
export const workItemActor = inbox.table('work_item_actor', {
  id: uuid('id').primaryKey(),
  workItemId: uuid('work_item_id').notNull(),
  userId: uuid('user_id'),
  eligibility: text('eligibility'),
  /** A role whose holders, with an assignment covering the item's facts, may act (12.2; migration 0035). */
  roleId: uuid('role_id'),
  recordedAt: at('recorded_at').notNull().defaultNow(),
});

/** An escalation of a work item: the recipient added, the owner kept (11.3; migration 0035). Append-only. */
export const workItemEscalation = inbox.table('work_item_escalation', {
  id: uuid('id').primaryKey(),
  workItemId: uuid('work_item_id').notNull(),
  recipientUserId: uuid('recipient_user_id'),
  recipientRoleId: uuid('recipient_role_id'),
  escalatedAt: at('escalated_at').notNull(),
  recordedAt: at('recorded_at').notNull().defaultNow(),
});

/** Task and approval routing per action type and Site (9.4, 11.3). No rows until KDPS sets them (RR-058). */
export const workItemRouting = inbox.table('work_item_routing', {
  id: uuid('id').primaryKey(),
  actionType: text('action_type').notNull(),
  siteId: uuid('site_id'),
  recordedAt: at('recorded_at').notNull().defaultNow(),
});

/** The routing's effective-dated versions (code-house-rules 7.3). */
export const workItemRoutingVersion = inbox.table('work_item_routing_version', {
  id: uuid('id').primaryKey(),
  workItemRoutingId: uuid('work_item_routing_id').notNull(),
  dueRuleFormat: text('due_rule_format').notNull(),
  dueRule: jsonb('due_rule').notNull(),
  escalationUserId: uuid('escalation_user_id'),
  validDuring: daterange('valid_during').notNull(),
  decision: text('decision').notNull(),
  recordedAt: at('recorded_at').notNull().defaultNow(),
  /** A role escalated to, besides a named user (11.3; migration 0042): exactly one of the two. */
  escalationRoleId: uuid('escalation_role_id'),
  origin: text('origin').notNull(),
  preparedByUserId: uuid('prepared_by_user_id').notNull(),
});
