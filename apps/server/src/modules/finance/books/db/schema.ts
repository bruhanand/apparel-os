import type {
  AccountNature,
  BookSettingKind,
  CostFormula,
  CostPoolMode,
  SettingOrigin,
  VoucherModel,
} from '@apparel-os/schemas';
import { boolean, customType, date, pgSchema, text, timestamp, uuid } from 'drizzle-orm/pg-core';

// Drizzle definitions of the books part's tables (code-house-rules 3.4). They mirror the reviewed migration
// (migrations/organisation/0051) and never create or change a table; an integration test compares each with the
// migrated database. Never exported from the unit's index.ts (code-house-rules 2).

const finance = pgSchema('finance');

const at = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });

/** A half-open range of business dates, `[start, end)`, read and written as PostgreSQL's text form (7.3). */
const daterange = customType<{ data: string; driverData: string }>({ dataType: () => 'daterange' });

/** A version's decision (code-house-rules 7.3; structure-and-masters 2.3). */
export type Decision = 'Awaiting approval' | 'Approved' | 'Rejected';

const versionColumns = () => ({
  id: uuid('id').primaryKey(),
  validDuring: daterange('valid_during').notNull(),
  decision: text('decision').$type<Decision>().notNull(),
  preparedByUserId: uuid('prepared_by_user_id').notNull(),
  recordedAt: at('recorded_at').notNull().defaultNow(),
});

export const bookSetting = finance.table('book_setting', {
  id: uuid('id').primaryKey(),
  bookId: uuid('book_id').notNull(),
  kind: text('kind').$type<BookSettingKind>().notNull(),
  recordedAt: at('recorded_at').notNull().defaultNow(),
});
export const bookSettingVersion = finance.table('book_setting_version', {
  ...versionColumns(),
  bookSettingId: uuid('book_setting_id').notNull(),
  kind: text('kind').$type<BookSettingKind>().notNull(),
  formula: text('formula').$type<CostFormula>(),
  poolMode: text('pool_mode').$type<CostPoolMode>(),
  voucherModel: text('voucher_model').$type<VoucherModel>(),
  origin: text('origin').$type<SettingOrigin>().notNull(),
});
export const account = finance.table('account', {
  id: uuid('id').primaryKey(),
  bookId: uuid('book_id').notNull(),
  code: text('code').notNull(),
  nature: text('nature').$type<AccountNature>().notNull(),
  recordedAt: at('recorded_at').notNull().defaultNow(),
});
export const accountVersion = finance.table('account_version', {
  ...versionColumns(),
  accountId: uuid('account_id').notNull(),
  name: text('name').notNull(),
  retired: boolean('retired').notNull(),
});
export const caApprovalEvidence = finance.table('ca_approval_evidence', {
  id: uuid('id').primaryKey(),
  kind: text('kind').$type<'file' | 'reference'>().notNull(),
  storedFileId: uuid('stored_file_id'),
  fileReceiptId: uuid('file_receipt_id'),
  referenceWhat: text('reference_what'),
  referenceGivenBy: text('reference_given_by'),
  referenceGivenOn: date('reference_given_on', { mode: 'string' }),
  referenceKeptAt: text('reference_kept_at'),
  recordedByUserId: uuid('recorded_by_user_id').notNull(),
  recordedAt: at('recorded_at').notNull().defaultNow(),
});
export const caApprovalEvidenceCover = finance.table('ca_approval_evidence_cover', {
  id: uuid('id').primaryKey(),
  caApprovalEvidenceId: uuid('ca_approval_evidence_id').notNull(),
  accountVersionId: uuid('account_version_id'),
  bookSettingVersionId: uuid('book_setting_version_id'),
  attachmentId: uuid('attachment_id'),
  recordedAt: at('recorded_at').notNull().defaultNow(),
});
