import type { SettingOrigin } from '@apparel-os/schemas';
import { bigint, customType, date, integer, pgSchema, text, timestamp, uuid } from 'drizzle-orm/pg-core';

// Drizzle definitions of `booking`'s tables (code-house-rules 3.4). They mirror the reviewed migrations
// (migrations/organisation/0086, 0094) and never create or change a table; an integration test compares each with the
// migrated database. Never exported from the unit's index.ts, so no other unit can name these tables
// (code-house-rules 2).

const bookingSchema = pgSchema('booking');

const at = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });

/** A half-open range of instants, `[start, end)`, read and written as PostgreSQL's text form (7.3). */
const tstzrange = customType<{ data: string; driverData: string }>({ dataType: () => 'tstzrange' });

/** A version's decision (code-house-rules 7.3). */
export type Decision = 'Awaiting approval' | 'Approved' | 'Rejected';

/** A budget: one brand and one season (goods-in 3.3). */
export const openToBuyBudget = bookingSchema.table('open_to_buy_budget', {
  id: uuid('id').primaryKey(),
  brandId: uuid('brand_id').notNull(),
  seasonAttributeId: uuid('season_attribute_id').notNull(),
  seasonValueId: uuid('season_value_id').notNull(),
  /** The version of the season's marking the season was read under (code-house-rules 7.3, 12.14; RR-550). */
  seasonMarkedAttributeVersionId: uuid('season_marked_attribute_version_id').notNull(),
  recordedAt: at('recorded_at').notNull().defaultNow(),
});

/** A budget's version: its amount in paise, its origin, its decision and, once approved, the instants in force. */
export const openToBuyBudgetVersion = bookingSchema.table('open_to_buy_budget_version', {
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
export const openToBuyBudgetCheck = bookingSchema.table('open_to_buy_budget_check', {
  id: uuid('id').primaryKey(),
  openToBuyBudgetVersionId: uuid('open_to_buy_budget_version_id').notNull(),
  checkedByUserId: uuid('checked_by_user_id').notNull(),
  approvalDecisionId: uuid('approval_decision_id').notNull(),
  checkedAt: at('checked_at').notNull(),
  recordedAt: at('recorded_at').notNull().defaultNow(),
});

const day = (name: string) => date(name, { mode: 'string' });

/** The scope columns every row of a booking carries: its destination Site and its brand (code-house-rules 6.1). */
const scope = {
  brandId: uuid('brand_id').notNull(),
  siteId: uuid('site_id').notNull(),
};

/** A booking (goods-in 3.1): its brand and destination Site, fixed when it is created; locked by every change. */
export const booking = bookingSchema.table('booking', {
  id: uuid('id').primaryKey(),
  ...scope,
  recordedByUserId: uuid('recorded_by_user_id').notNull(),
  recordedAt: at('recorded_at').notNull().defaultNow(),
});

/** A version of a booking, frozen when written (code-house-rules 7.2). */
export const bookingVersion = bookingSchema.table('booking_version', {
  id: uuid('id').primaryKey(),
  bookingId: uuid('booking_id').notNull(),
  versionNumber: integer('version_number').notNull(),
  ...scope,
  supplierPartyId: uuid('supplier_party_id').notNull(),
  seasonAttributeId: uuid('season_attribute_id').notNull(),
  seasonValueId: uuid('season_value_id').notNull(),
  seasonMarkedAttributeVersionId: uuid('season_marked_attribute_version_id').notNull(),
  windowFrom: day('window_from').notNull(),
  windowTo: day('window_to').notNull(),
  savedByUserId: uuid('saved_by_user_id').notNull(),
  recordedAt: at('recorded_at').notNull().defaultNow(),
});

/** A line of a version, its style code, colour and size as written (goods-in 3.1, 3.7; DEC-130). */
export const bookingLine = bookingSchema.table('booking_line', {
  id: uuid('id').primaryKey(),
  bookingVersionId: uuid('booking_version_id').notNull(),
  lineNumber: integer('line_number').notNull(),
  ...scope,
  styleCode: text('style_code').notNull(),
  colour: text('colour'),
  size: text('size'),
  quantity: integer('quantity').notNull(),
  indicativeCostPaise: bigint('indicative_cost_paise', { mode: 'number' }).notNull(),
  mrpPaise: bigint('mrp_paise', { mode: 'number' }).notNull(),
  deliveryDate: day('delivery_date'),
  recordedAt: at('recorded_at').notNull().defaultNow(),
});

/** A booking document, a stored file attached to the booking (goods-in 3.1). */
export const bookingDocument = bookingSchema.table('booking_document', {
  id: uuid('id').primaryKey(),
  bookingId: uuid('booking_id').notNull(),
  ...scope,
  storedFileId: uuid('stored_file_id').notNull(),
  attachmentId: uuid('attachment_id').notNull(),
  attachedByUserId: uuid('attached_by_user_id').notNull(),
  recordedAt: at('recorded_at').notNull().defaultNow(),
});

/** The kinds of change of a booking, each a change row under its lock (code-house-rules 12.7). */
export type BookingChangeKind = 'draft' | 'documents' | 'submission' | 'approval' | 'rejection';

/** Each change of a booking, numbered in the order made; the newest one's identifier is its version token. */
export const bookingChange = bookingSchema.table('booking_change', {
  id: uuid('id').primaryKey(),
  bookingId: uuid('booking_id').notNull(),
  changeNumber: integer('change_number').notNull(),
  change: text('change').$type<BookingChangeKind>().notNull(),
  bookingVersionId: uuid('booking_version_id').notNull(),
  ...scope,
  changedByUserId: uuid('changed_by_user_id').notNull(),
  recordedAt: at('recorded_at').notNull().defaultNow(),
});

/** The approval of a version: the Agreement version it fixed and the value it reserved (goods-in 3.2 to 3.4). */
export const bookingApproval = bookingSchema.table('booking_approval', {
  id: uuid('id').primaryKey(),
  bookingId: uuid('booking_id').notNull(),
  bookingVersionId: uuid('booking_version_id').notNull(),
  ...scope,
  agreementId: uuid('agreement_id').notNull(),
  agreementVersionId: uuid('agreement_version_id').notNull(),
  valuePaise: bigint('value_paise', { mode: 'number' }).notNull(),
  approvalDecisionId: uuid('approval_decision_id').notNull(),
  approvedByUserId: uuid('approved_by_user_id').notNull(),
  approvedAt: at('approved_at').notNull(),
  businessDate: day('business_date').notNull(),
  recordedAt: at('recorded_at').notNull().defaultNow(),
});

/** The booking's number, given once by its first approval (goods-in 3.1). */
export const bookingNumber = bookingSchema.table('booking_number', {
  id: uuid('id').primaryKey(),
  bookingId: uuid('booking_id').notNull(),
  ...scope,
  number: text('number').notNull(),
  numberAllocationId: uuid('number_allocation_id').notNull(),
  bookingApprovalId: uuid('booking_approval_id').notNull(),
  recordedAt: at('recorded_at').notNull().defaultNow(),
});

/** What an approved booking reserves of its brand and season's budget (goods-in 3.3; POL-05.02). */
export const openToBuyReservation = bookingSchema.table('open_to_buy_reservation', {
  id: uuid('id').primaryKey(),
  openToBuyBudgetId: uuid('open_to_buy_budget_id').notNull(),
  bookingId: uuid('booking_id').notNull(),
  bookingApprovalId: uuid('booking_approval_id').notNull(),
  amountPaise: bigint('amount_paise', { mode: 'number' }).notNull(),
  recordedAt: at('recorded_at').notNull().defaultNow(),
});
