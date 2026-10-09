import { bigint, customType, jsonb, pgSchema, text, timestamp, uuid } from 'drizzle-orm/pg-core';

// Drizzle definitions of the exceptions module's tables (code-house-rules 3.4). They mirror the reviewed migration
// (migrations/organisation/0034) and never create or change a table; an integration test compares each with the
// migrated database. Never exported from the module's index.ts (code-house-rules 2).

const exceptions = pgSchema('exceptions');

const at = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });

const daterange = customType<{ data: string; driverData: string }>({
  dataType: () => 'daterange',
});

/** A type a module registers in code, recorded the first time it is routed or raised (12.1). */
export const exceptionType = exceptions.table('exception_type', {
  id: uuid('id').primaryKey(),
  code: text('code').notNull(),
  category: text('category').notNull(),
  module: text('module').notNull(),
  recordedAt: at('recorded_at').notNull().defaultNow(),
});

/** A routing rule per type and Site, or with no Site (12.2). */
export const exceptionRouting = exceptions.table('exception_routing', {
  id: uuid('id').primaryKey(),
  exceptionTypeId: uuid('exception_type_id').notNull(),
  siteId: uuid('site_id'),
  recordedAt: at('recorded_at').notNull().defaultNow(),
});

/** The routing's effective-dated versions (code-house-rules 7.3). */
export const exceptionRoutingVersion = exceptions.table('exception_routing_version', {
  id: uuid('id').primaryKey(),
  exceptionRoutingId: uuid('exception_routing_id').notNull(),
  ownerUserId: uuid('owner_user_id'),
  ownerRoleId: uuid('owner_role_id'),
  dueRuleFormat: text('due_rule_format').notNull(),
  dueRule: jsonb('due_rule').notNull(),
  escalationUserId: uuid('escalation_user_id'),
  escalationRoleId: uuid('escalation_role_id'),
  validDuring: daterange('valid_during').notNull(),
  origin: text('origin').notNull(),
  preparedByUserId: uuid('prepared_by_user_id').notNull(),
  decision: text('decision').notNull(),
  recordedAt: at('recorded_at').notNull().defaultNow(),
});

/** An exception (12.1). Its state and owner are projections of its events. */
export const exception = exceptions.table('exception', {
  id: uuid('id').primaryKey(),
  code: text('code').notNull(),
  raisingEvent: text('raising_event').notNull(),
  exceptionTypeId: uuid('exception_type_id').notNull(),
  siteId: uuid('site_id'),
  storeId: uuid('store_id'),
  businessUnitId: uuid('business_unit_id'),
  brandId: uuid('brand_id'),
  exposureKind: text('exposure_kind').notNull(),
  exposureAmount: bigint('exposure_amount', { mode: 'number' }),
  routingVersionId: uuid('routing_version_id').notNull(),
  ownerUserId: uuid('owner_user_id'),
  ownerRoleId: uuid('owner_role_id'),
  dueAt: at('due_at').notNull(),
  state: text('state').notNull(),
  earlierExceptionId: uuid('earlier_exception_id'),
  raisedAt: at('raised_at').notNull(),
  recordedAt: at('recorded_at').notNull().defaultNow(),
});

/** A record an exception is about (12.1). */
export const exceptionLink = exceptions.table('exception_link', {
  id: uuid('id').primaryKey(),
  exceptionId: uuid('exception_id').notNull(),
  module: text('module').notNull(),
  recordType: text('record_type').notNull(),
  recordId: uuid('record_id').notNull(),
  versionId: uuid('version_id'),
  recordedAt: at('recorded_at').notNull().defaultNow(),
});

/** What happened to an exception (13.3). Append-only. */
export const exceptionEvent = exceptions.table('exception_event', {
  id: uuid('id').primaryKey(),
  exceptionId: uuid('exception_id').notNull(),
  kind: text('kind').notNull(),
  actorId: uuid('actor_id'),
  toUserId: uuid('to_user_id'),
  toRoleId: uuid('to_role_id'),
  comment: text('comment'),
  /** The attachment of an evidence event's stored file, in files-imports (0037); null for any other event. */
  attachmentId: uuid('attachment_id'),
  occurredAt: at('occurred_at').notNull(),
  recordedAt: at('recorded_at').notNull().defaultNow(),
});
