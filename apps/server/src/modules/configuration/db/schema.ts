import type { Activity, PolicyNumber, PolicyRecordOrigin } from '@apparel-os/schemas';
import { boolean, customType, date, pgSchema, smallint, text, timestamp, uuid } from 'drizzle-orm/pg-core';

// Drizzle definitions of the configuration module's tables (code-house-rules 3.4). They mirror the reviewed
// migrations (migrations/organisation/0013, 0049) and never create or change a table; an integration test compares
// each with the migrated database. Never exported from the module's index.ts (code-house-rules 2).

const configuration = pgSchema('configuration');

const at = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });

/** A half-open range of instants, `[start, end)`, read and written as PostgreSQL's text form. */
const tstzrange = customType<{ data: string; driverData: string }>({
  dataType: () => 'tstzrange',
});

/** The Organisation's timezone, effective-dated by instants (code-house-rules 9, 7.3). */
export const organisationTimezoneVersion = configuration.table('organisation_timezone_version', {
  id: uuid('id').primaryKey(),
  timezone: text('timezone').notNull(),
  origin: text('origin').notNull(),
  validDuring: tstzrange('valid_during').notNull(),
  decision: text('decision').notNull(),
  recordedAt: at('recorded_at').notNull().defaultNow(),
});

/** A policy recorded as Signed, with its evidence (migration 0049; DEC-092). Append-only. */
export const policySignature = configuration.table('policy_signature', {
  id: uuid('id').primaryKey(),
  policyNumber: smallint('policy_number').$type<PolicyNumber>().notNull(),
  signatory: text('signatory').notNull(),
  signedOn: date('signed_on', { mode: 'string' }).notNull(),
  origin: text('origin').$type<PolicyRecordOrigin>().notNull(),
  evidenceAttachmentIds: uuid('evidence_attachment_ids').array().notNull(),
  recordedByUserId: uuid('recorded_by_user_id').notNull(),
  roleAssignmentId: uuid('role_assignment_id').notNull(),
  recordedAt: at('recorded_at').notNull(),
});

/** A policy's real values recorded as validated, with what it covers and its evidence (migration 0049; DM-6). */
export const policyValidation = configuration.table('policy_validation', {
  id: uuid('id').primaryKey(),
  policyNumber: smallint('policy_number').$type<PolicyNumber>().notNull(),
  origin: text('origin').$type<PolicyRecordOrigin>().notNull(),
  validatedValues: text('validated_values').array().notNull(),
  evidenceAttachmentIds: uuid('evidence_attachment_ids').array().notNull(),
  validatedByUserId: uuid('validated_by_user_id').notNull(),
  roleAssignmentId: uuid('role_assignment_id').notNull(),
  validatedAt: at('validated_at').notNull(),
});

/** A capability switched on or off (migration 0049; PRD-SEC-017). Append-only; the latest row is its state. */
export const capabilityChange = configuration.table('capability_change', {
  id: uuid('id').primaryKey(),
  capability: text('capability').notNull(),
  switchedOn: boolean('switched_on').notNull(),
  changedByUserId: uuid('changed_by_user_id').notNull(),
  roleAssignmentId: uuid('role_assignment_id').notNull(),
  changedAt: at('changed_at').notNull(),
});

/** An activity granted to or withdrawn from a place (migration 0049; PRD-LIF-001). Written by site-lifecycle only. */
export const activityGrant = configuration.table('activity_grant', {
  id: uuid('id').primaryKey(),
  activity: text('activity').$type<Activity>().notNull(),
  siteId: uuid('site_id').notNull(),
  businessUnitId: uuid('business_unit_id'),
  granted: boolean('granted').notNull(),
  readinessRecordId: uuid('readiness_record_id').notNull(),
  approvalDecisionId: uuid('approval_decision_id').notNull(),
  recordedByUserId: uuid('recorded_by_user_id').notNull(),
  recordedAt: at('recorded_at').notNull(),
});
