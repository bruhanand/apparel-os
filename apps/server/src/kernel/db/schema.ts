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
