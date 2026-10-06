import { integer, jsonb, pgSchema, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';

// Drizzle definitions of kernel's tables (code-house-rules 3.4). They mirror the reviewed migrations and never
// create or change a table; an integration test compares each with the migrated database. Never exported from the
// kernel's index.ts, so no other unit can name these tables (code-house-rules 2).

const kernel = pgSchema('kernel');

/**
 * The directory database's one routing table (migrations/directory/0002): each Organisation's code and the name of
 * its database, nothing else (DEC-093, PRD-MOD-001, PRD-ACS-020).
 */
export const directoryEntry = kernel.table('directory_entry', {
  id: uuid('id').primaryKey(),
  organisationCode: text('organisation_code').notNull().unique(),
  databaseName: text('database_name').notNull().unique(),
});

/**
 * An idempotency key of an Organisation database (migrations/organisation/0003; code-house-rules 12.4; PRD-INT-002).
 * Append-only. Only the idempotency helper reads or writes it.
 */
export const idempotencyKey = kernel.table(
  'idempotency_key',
  {
    id: uuid('id').primaryKey(),
    actorId: uuid('actor_id').notNull(),
    operation: text('operation').notNull(),
    idempotencyKey: uuid('idempotency_key').notNull(),
    requestHash: text('request_hash').notNull(),
    formVersion: integer('form_version').notNull(),
    secretFields: text('secret_fields').array().notNull(),
    correlationId: uuid('correlation_id').notNull(),
    recordedAt: timestamp('recorded_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique('idempotency_key_scope').on(table.actorId, table.operation, table.idempotencyKey)],
);

/** The outcome of a key's request (migrations/organisation/0003; code-house-rules 12.4, 12.6). Append-only. */
export const idempotencyResult = kernel.table('idempotency_result', {
  id: uuid('id').primaryKey(),
  idempotencyKeyId: uuid('idempotency_key_id')
    .notNull()
    .unique()
    .references(() => idempotencyKey.id),
  outcome: text('outcome', {
    enum: ['success', 'unavailable', 'not-authorised', 'not-found', 'refused', 'conflict'],
  }).notNull(),
  shown: text('shown', { enum: ['nothing', 'secret', 'restricted-value'] }).notNull(),
  answer: jsonb('answer').$type<unknown>(),
  credentialIds: uuid('credential_ids').array().notNull(),
  recordedAt: timestamp('recorded_at', { withTimezone: true }).notNull().defaultNow(),
});

/** A request refused under a used key, kept for investigation (migrations/organisation/0003; 12.4). Append-only. */
export const idempotencyConflict = kernel.table('idempotency_conflict', {
  id: uuid('id').primaryKey(),
  idempotencyKeyId: uuid('idempotency_key_id')
    .notNull()
    .references(() => idempotencyKey.id),
  reason: text('reason', { enum: ['content-changed', 'form-version-changed', 'secret-not-comparable'] }).notNull(),
  requestHash: text('request_hash').notNull(),
  formVersion: integer('form_version').notNull(),
  correlationId: uuid('correlation_id').notNull(),
  requestForm: jsonb('request_form').$type<unknown>().notNull(),
  recordedAt: timestamp('recorded_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * An outbox event (migrations/organisation/0007; code-house-rules 12.8; PRD-MOD-006, PRD-INT-004). Append-only.
 * Written through the command context; read only by kernel's outbox processor and live-update stream.
 */
export const outboxEvent = kernel.table('outbox_event', {
  id: uuid('id').primaryKey(),
  eventType: text('event_type').notNull(),
  payloadVersion: integer('payload_version').notNull(),
  eventTime: timestamp('event_time', { withTimezone: true }).notNull(),
  recordedAt: timestamp('recorded_at', { withTimezone: true }).notNull().defaultNow(),
  actorId: uuid('actor_id'),
  onBehalfOfUserId: uuid('on_behalf_of_user_id'),
  correlationId: uuid('correlation_id').notNull(),
  subjectModule: text('subject_module').notNull(),
  subjectRecordType: text('subject_record_type').notNull(),
  subjectRecordId: uuid('subject_record_id').notNull(),
  subjectVersionId: uuid('subject_version_id'),
  siteId: uuid('site_id'),
  storeId: uuid('store_id'),
  businessUnitId: uuid('business_unit_id'),
  legalEntityId: uuid('legal_entity_id'),
  brandId: uuid('brand_id'),
  subjectUserId: uuid('subject_user_id'),
  payload: jsonb('payload').$type<unknown>().notNull(),
});

/** A consumer the worker registered (migrations/organisation/0007; code-house-rules 12.8 "Consumers"). Append-only. */
export const outboxConsumer = kernel.table('outbox_consumer', {
  id: uuid('id').primaryKey(),
  name: text('name').notNull().unique(),
  eventType: text('event_type').notNull(),
  recordedAt: timestamp('recorded_at', { withTimezone: true }).notNull().defaultNow(),
});

/** An event handed to one consumer with its job (migrations/organisation/0007; 12.8 "Dispatch"). Append-only. */
export const outboxDispatch = kernel.table(
  'outbox_dispatch',
  {
    id: uuid('id').primaryKey(),
    outboxEventId: uuid('outbox_event_id')
      .notNull()
      .references(() => outboxEvent.id),
    outboxConsumerId: uuid('outbox_consumer_id')
      .notNull()
      .references(() => outboxConsumer.id),
    jobId: uuid('job_id').notNull().unique(),
    recordedAt: timestamp('recorded_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique('outbox_dispatch_once').on(table.outboxConsumerId, table.outboxEventId)],
);
