import type { SettingOrigin } from '@apparel-os/schemas';
import { bigint, customType, pgSchema, text, timestamp, uuid } from 'drizzle-orm/pg-core';

// Drizzle definitions of `booking`'s tables (code-house-rules 3.4). They mirror the reviewed migration
// (migrations/organisation/0086) and never create or change a table; an integration test compares each with the
// migrated database. Never exported from the unit's index.ts, so no other unit can name these tables
// (code-house-rules 2).

const booking = pgSchema('booking');

const at = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });

/** A half-open range of instants, `[start, end)`, read and written as PostgreSQL's text form (7.3). */
const tstzrange = customType<{ data: string; driverData: string }>({ dataType: () => 'tstzrange' });

/** A version's decision (code-house-rules 7.3). */
export type Decision = 'Awaiting approval' | 'Approved' | 'Rejected';

/** A budget: one brand and one season (goods-in 3.3). */
export const openToBuyBudget = booking.table('open_to_buy_budget', {
  id: uuid('id').primaryKey(),
  brandId: uuid('brand_id').notNull(),
  seasonAttributeId: uuid('season_attribute_id').notNull(),
  seasonValueId: uuid('season_value_id').notNull(),
  /** The version of the season's marking the season was read under (code-house-rules 7.3, 12.14; RR-550). */
  seasonMarkedAttributeVersionId: uuid('season_marked_attribute_version_id').notNull(),
  recordedAt: at('recorded_at').notNull().defaultNow(),
});

/** A budget's version: its amount in paise, its origin, its decision and, once approved, the instants in force. */
export const openToBuyBudgetVersion = booking.table('open_to_buy_budget_version', {
  id: uuid('id').primaryKey(),
  openToBuyBudgetId: uuid('open_to_buy_budget_id').notNull(),
  amountPaise: bigint('amount_paise', { mode: 'number' }).notNull(),
  origin: text('origin').$type<SettingOrigin>().notNull(),
  decision: text('decision').$type<Decision>().notNull(),
  validDuring: tstzrange('valid_during'),
  preparedByUserId: uuid('prepared_by_user_id').notNull(),
  recordedAt: at('recorded_at').notNull().defaultNow(),
});

/** Accounts' check of a version (3.3; POL-05.09): one per version, never by its preparer. */
export const openToBuyBudgetCheck = booking.table('open_to_buy_budget_check', {
  id: uuid('id').primaryKey(),
  openToBuyBudgetVersionId: uuid('open_to_buy_budget_version_id').notNull(),
  checkedByUserId: uuid('checked_by_user_id').notNull(),
  approvalDecisionId: uuid('approval_decision_id').notNull(),
  checkedAt: at('checked_at').notNull(),
  recordedAt: at('recorded_at').notNull().defaultNow(),
});
