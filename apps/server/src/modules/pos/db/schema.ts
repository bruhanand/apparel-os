import type { FormatPartView, SettingOrigin } from '@apparel-os/schemas';
import { customType, date, jsonb, pgSchema, text, timestamp, uuid } from 'drizzle-orm/pg-core';

// Drizzle definitions of the pos module's tables (code-house-rules 3.4). They mirror the reviewed migration
// (migrations/organisation/0058, 0060, 0066) and never create or change a table; an integration test compares each with the
// migrated database. Never exported from the module's index.ts (code-house-rules 2).

const pos = pgSchema('pos');

const at = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });

/** A half-open range of business dates, `[start, end)`, in PostgreSQL's text form (code-house-rules 7.3). */
const daterange = customType<{ data: string; driverData: string }>({ dataType: () => 'daterange' });

/** A billing device's billing facts: its Store, fixed for life (offline-counter 3.1). Append-only; locked. */
export const billingDevice = pos.table('billing_device', {
  id: uuid('id').primaryKey(),
  storeId: uuid('store_id').notNull(),
  registeredByUserId: uuid('registered_by_user_id').notNull(),
  roleAssignmentId: uuid('role_assignment_id').notNull(),
  registeredAt: at('registered_at').notNull(),
  recordedAt: at('recorded_at').notNull().defaultNow(),
  /** The device this one replaces, set at its registration (offline-counter 3.5; migration 0060). */
  replacesDeviceId: uuid('replaces_device_id'),
});

/**
 * A business unit a billing device bills for, from a business date (offline-counter 3.1): a dated row, ended earlier
 * by a change of the device's units, never deleted (12.1; migration 0060).
 */
export const billingDeviceUnit = pos.table('billing_device_unit', {
  id: uuid('id').primaryKey(),
  billingDeviceId: uuid('billing_device_id').notNull(),
  businessUnitId: uuid('business_unit_id').notNull(),
  validDuring: daterange('valid_during').notNull(),
  recordedAt: at('recorded_at').notNull().defaultNow(),
});

/** A change that defines a financial year, frozen as prepared (offline-counter 4.3b; migration 0066). Locked. */
export const financialYearChange = pos.table('financial_year_change', {
  id: uuid('id').primaryKey(),
  label: text('label').notNull(),
  firstDay: date('first_day', { mode: 'string' }).notNull(),
  lastDay: date('last_day', { mode: 'string' }).notNull(),
  origin: text('origin').$type<SettingOrigin>().notNull(),
  preparedByUserId: uuid('prepared_by_user_id').notNull(),
  roleAssignmentId: uuid('role_assignment_id').notNull(),
  preparedAt: at('prepared_at').notNull(),
  recordedAt: at('recorded_at').notNull().defaultNow(),
});

/** A change that sets the bill-number format, frozen as prepared (offline-counter 4.3b; migration 0066). Locked. */
export const billFormatChange = pos.table('bill_format_change', {
  id: uuid('id').primaryKey(),
  formatCode: text('format_code').notNull(),
  parts: jsonb('parts').$type<FormatPartView[]>().notNull(),
  origin: text('origin').$type<SettingOrigin>().notNull(),
  preparedByUserId: uuid('prepared_by_user_id').notNull(),
  roleAssignmentId: uuid('role_assignment_id').notNull(),
  preparedAt: at('prepared_at').notNull(),
  recordedAt: at('recorded_at').notNull().defaultNow(),
});
