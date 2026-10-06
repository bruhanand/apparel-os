import { bigint, date, inet, integer, jsonb, pgSchema, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core';

// Drizzle definitions of the audit module's tables (code-house-rules 3.4). They mirror the reviewed migration
// (migrations/organisation/0003) and never create or change a table; an integration test compares each with the
// migrated database. Never exported from the module's index.ts, so no other unit can name these tables
// (code-house-rules 2).

const audit = pgSchema('audit');

const at = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });

/** The audit record (numbering-and-audit 4.1; PRD-ACS-013), partitioned by recording month (4.4). */
export const auditRecord = audit.table(
  'audit_record',
  {
    id: uuid('id').notNull(),
    recordedAt: at('recorded_at').notNull().defaultNow(),
    occurredAt: at('occurred_at').notNull(),
    businessDate: date('business_date', { mode: 'string' }),
    actorKind: text('actor_kind').notNull(),
    actorId: uuid('actor_id').notNull(),
    onBehalfOfUserId: uuid('on_behalf_of_user_id'),
    roleAssignmentId: uuid('role_assignment_id'),
    legalEntityId: uuid('legal_entity_id'),
    siteId: uuid('site_id'),
    storeId: uuid('store_id'),
    businessUnitId: uuid('business_unit_id'),
    brandId: uuid('brand_id'),
    recordModule: text('record_module').notNull(),
    recordType: text('record_type').notNull(),
    recordId: uuid('record_id').notNull(),
    recordVersionId: uuid('record_version_id'),
    operation: text('operation').notNull(),
    changesFormat: text('changes_format').notNull(),
    changes: jsonb('changes').notNull(),
    reason: text('reason'),
    sourceKind: text('source_kind').notNull(),
    sourceReference: text('source_reference'),
    sourceRow: integer('source_row'),
    approvalDecisionId: uuid('approval_decision_id'),
    approvalUseId: uuid('approval_use_id'),
    idempotencyKey: text('idempotency_key'),
    correlationId: uuid('correlation_id').notNull(),
  },
  (table) => [primaryKey({ columns: [table.id, table.recordedAt] })],
);

/** The access record (numbering-and-audit 5; PRD-SEC-007), partitioned by recording month (4.4). */
export const accessRecord = audit.table(
  'access_record',
  {
    id: uuid('id').notNull(),
    recordedAt: at('recorded_at').notNull().defaultNow(),
    occurredAt: at('occurred_at').notNull(),
    kind: text('kind').notNull(),
    outcome: text('outcome').notNull(),
    userId: uuid('user_id'),
    deviceId: uuid('device_id'),
    networkAddress: inet('network_address'),
    identityVerification: text('identity_verification'),
    auditRecordId: uuid('audit_record_id'),
    recordModule: text('record_module'),
    recordType: text('record_type'),
    recordId: uuid('record_id'),
    fieldClass: text('field_class'),
    exposure: text('exposure'),
    legalEntityId: uuid('legal_entity_id'),
    siteId: uuid('site_id'),
    storeId: uuid('store_id'),
    businessUnitId: uuid('business_unit_id'),
    brandId: uuid('brand_id'),
    correlationId: uuid('correlation_id').notNull(),
  },
  (table) => [primaryKey({ columns: [table.id, table.recordedAt] })],
);

/** The seal of a closed block, chained to the previous one (numbering-and-audit 4.4). Written only by audit.seal_block. */
export const auditSeal = audit.table('audit_seal', {
  id: uuid('id').primaryKey(),
  blockNumber: bigint('block_number', { mode: 'number' }).notNull().unique(),
  format: text('format').notNull(),
  coversFrom: at('covers_from').notNull(),
  coversTo: at('covers_to').notNull(),
  auditRows: bigint('audit_rows', { mode: 'number' }).notNull(),
  accessRows: bigint('access_rows', { mode: 'number' }).notNull(),
  previousSealId: uuid('previous_seal_id').unique(),
  previousHash: text('previous_hash'),
  hash: text('hash').notNull(),
  recordedAt: at('recorded_at').notNull().defaultNow(),
});

/** Which sealed block the retention function deleted (numbering-and-audit 4.6). Empty while no period is set. */
export const retentionDeletion = audit.table('retention_deletion', {
  id: uuid('id').primaryKey(),
  auditSealId: uuid('audit_seal_id').notNull().unique(),
  retentionSchedule: text('retention_schedule').notNull(),
  auditRows: bigint('audit_rows', { mode: 'number' }).notNull(),
  accessRows: bigint('access_rows', { mode: 'number' }).notNull(),
  recordedAt: at('recorded_at').notNull().defaultNow(),
});
