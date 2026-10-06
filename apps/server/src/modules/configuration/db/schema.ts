import { customType, pgSchema, text, timestamp, uuid } from 'drizzle-orm/pg-core';

// Drizzle definitions of the configuration module's tables (code-house-rules 3.4). They mirror the reviewed
// migrations (migrations/organisation/0013) and never create or change a table; an integration test compares each
// with the migrated database. Never exported from the module's index.ts (code-house-rules 2).

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
