import type { SettingOrigin } from '@apparel-os/schemas';
import { bigint, boolean, customType, integer, pgSchema, text, timestamp, uuid } from 'drizzle-orm/pg-core';

// Drizzle definitions of the numbering module's tables (code-house-rules 3.4). They mirror the reviewed migration
// (migrations/organisation/0033, 0057, 0067) and never create or change a table; an integration test compares each with the
// migrated database. Never exported from the module's index.ts (code-house-rules 2).

const numbering = pgSchema('numbering');

const at = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });

/** A format, named by its code (numbering-and-audit 3.5). */
export const numberFormat = numbering.table('number_format', {
  id: uuid('id').primaryKey(),
  code: text('code').notNull(),
  recordedAt: at('recorded_at').notNull().defaultNow(),
});

/** A version of a format; a series keeps the one it was defined with (3.5). */
export const numberFormatVersion = numbering.table('number_format_version', {
  id: uuid('id').primaryKey(),
  numberFormatId: uuid('number_format_id').notNull(),
  version: integer('version').notNull(),
  recordedAt: at('recorded_at').notNull().defaultNow(),
});

/** The parts of a format version, in order (3.5). */
export const numberFormatPart = numbering.table('number_format_part', {
  id: uuid('id').primaryKey(),
  numberFormatVersionId: uuid('number_format_version_id').notNull(),
  position: integer('position').notNull(),
  kind: text('kind').notNull(),
  text: text('text'),
  width: integer('width'),
  recordedAt: at('recorded_at').notNull().defaultNow(),
});

/** A series: one kind, scope key and, for a yearly kind, financial year (3.1). */
export const series = numbering.table('series', {
  id: uuid('id').primaryKey(),
  kind: text('kind').notNull(),
  scopeKey: text('scope_key').notNull(),
  financialYear: text('financial_year'),
  displayScopeKey: text('display_scope_key').notNull(),
  displayYear: text('display_year').notNull(),
  scopeText: text('scope_text'),
  numberFormatVersionId: uuid('number_format_version_id').notNull(),
  state: text('state').notNull(),
  nextSequence: bigint('next_sequence', { mode: 'number' }).notNull(),
  recordedAt: at('recorded_at').notNull().defaultNow(),
});

/** One number given (3.2). */
export const allocation = numbering.table('allocation', {
  id: uuid('id').primaryKey(),
  seriesId: uuid('series_id').notNull(),
  kind: text('kind').notNull(),
  displayScopeKey: text('display_scope_key').notNull(),
  displayYear: text('display_year').notNull(),
  sequenceNumber: bigint('sequence_number', { mode: 'number' }).notNull(),
  formattedText: text('formatted_text').notNull(),
  documentType: text('document_type').notNull(),
  documentId: uuid('document_id').notNull(),
  occurredAt: at('occurred_at').notNull(),
  recordedAt: at('recorded_at').notNull().defaultNow(),
});

/** What happened to a series (3.7). */
export const seriesEvent = numbering.table('series_event', {
  id: uuid('id').primaryKey(),
  seriesId: uuid('series_id').notNull(),
  event: text('event').notNull(),
  occurredAt: at('occurred_at').notNull(),
  recordedAt: at('recorded_at').notNull().defaultNow(),
});

/** A half-open range of business dates, `[first, after last)`, in PostgreSQL's text form. */
const daterange = customType<{ data: string; driverData: string }>({ dataType: () => 'daterange' });

/** A financial year, its label and dates (numbering-and-audit 3.3; migration 0057). Never overlapping. */
export const financialYear = numbering.table('financial_year', {
  id: uuid('id').primaryKey(),
  label: text('label').notNull(),
  dates: daterange('dates').notNull(),
  origin: text('origin').$type<SettingOrigin>().notNull(),
  recordedAt: at('recorded_at').notNull().defaultNow(),
});

/** The format a declared kind's new series take; the latest row of a kind is in force (3.5; migration 0057). */
export const kindFormat = numbering.table('kind_format', {
  id: uuid('id').primaryKey(),
  kind: text('kind').notNull(),
  numberFormatId: uuid('number_format_id').notNull(),
  origin: text('origin').$type<SettingOrigin>().notNull(),
  recordedAt: at('recorded_at').notNull().defaultNow(),
});

/**
 * The one row a change of the Organisation's numbering settings locks exclusively at step 1, so two such changes
 * serialise (code-house-rules 8.1, 8.2; migration 0067; S1-F12-T03 review). It holds no value.
 */
export const settingsLock = numbering.table('settings_lock', {
  id: uuid('id').primaryKey(),
  oneRow: boolean('one_row').notNull(),
});
