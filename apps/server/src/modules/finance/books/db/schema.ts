import type {
  AccountNature,
  BookSettingKind,
  CostFormula,
  CostPoolMode,
  SettingOrigin,
  VoucherModel,
} from '@apparel-os/schemas';
import { bigint, boolean, customType, date, pgSchema, text, timestamp, uuid } from 'drizzle-orm/pg-core';

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
  /** A posting map version the evidence covers (0053; S1-F09-T02). */
  postingMapVersionId: uuid('posting_map_version_id'),
});

// The posting half (migrations/organisation/0053; books-and-posting 4.1, 5, 6, 8, 13.1; S1-F09-T02).

/** The side of a map line or a journal line (5.1, 6.1). */
export type Side = 'debit' | 'credit';

export const financialPeriod = finance.table('financial_period', {
  id: uuid('id').primaryKey(),
  bookId: uuid('book_id').notNull(),
  code: text('code').notNull(),
  financialYear: text('financial_year').notNull(),
  dates: daterange('dates').notNull(),
  definedByUserId: uuid('defined_by_user_id').notNull(),
  recordedAt: at('recorded_at').notNull().defaultNow(),
});
export const postingMap = finance.table('posting_map', {
  id: uuid('id').primaryKey(),
  bookId: uuid('book_id').notNull(),
  eventKind: text('event_kind').notNull(),
  recordedAt: at('recorded_at').notNull().defaultNow(),
});
export const postingMapVersion = finance.table('posting_map_version', {
  ...versionColumns(),
  postingMapId: uuid('posting_map_id').notNull(),
  origin: text('origin').$type<SettingOrigin>().notNull(),
});
export const postingMapLine = finance.table('posting_map_line', {
  id: uuid('id').primaryKey(),
  postingMapVersionId: uuid('posting_map_version_id').notNull(),
  component: text('component').notNull(),
  side: text('side').$type<Side>().notNull(),
  accountId: uuid('account_id').notNull(),
  requiresStore: boolean('requires_store').notNull(),
  requiresBrand: boolean('requires_brand').notNull(),
  recordedAt: at('recorded_at').notNull().defaultNow(),
});
export const journal = finance.table('journal', {
  id: uuid('id').primaryKey(),
  bookId: uuid('book_id').notNull(),
  legalEntityId: uuid('legal_entity_id').notNull(),
  financialPeriodId: uuid('financial_period_id').notNull(),
  accountingDate: date('accounting_date', { mode: 'string' }).notNull(),
  businessDate: date('business_date', { mode: 'string' }).notNull(),
  eventKind: text('event_kind').notNull(),
  sourceModule: text('source_module').notNull(),
  sourceRecordType: text('source_record_type').notNull(),
  sourceRecordId: uuid('source_record_id').notNull(),
  sourceVersionId: uuid('source_version_id'),
  postingMapVersionId: uuid('posting_map_version_id').notNull(),
  numberAllocationId: uuid('number_allocation_id').notNull(),
  number: text('number').notNull(),
  reversesJournalId: uuid('reverses_journal_id'),
  actorUserId: uuid('actor_user_id'),
  actorServiceIdentityId: uuid('actor_service_identity_id'),
  onBehalfOfUserId: uuid('on_behalf_of_user_id'),
  occurredAt: at('occurred_at').notNull(),
  recordedAt: at('recorded_at').notNull().defaultNow(),
});
export const journalLine = finance.table('journal_line', {
  id: uuid('id').primaryKey(),
  journalId: uuid('journal_id').notNull(),
  accountId: uuid('account_id').notNull(),
  side: text('side').$type<Side>().notNull(),
  amountPaise: bigint('amount_paise', { mode: 'number' }).notNull(),
  legalEntityId: uuid('legal_entity_id').notNull(),
  siteId: uuid('site_id').notNull(),
  storeId: uuid('store_id'),
  businessUnitId: uuid('business_unit_id').notNull(),
  brandId: uuid('brand_id'),
  mappingVersionId: uuid('mapping_version_id').notNull(),
  recordedAt: at('recorded_at').notNull().defaultNow(),
});
export const postingSource = finance.table('posting_source', {
  id: uuid('id').primaryKey(),
  sourceModule: text('source_module').notNull(),
  itemKey: text('item_key').notNull(),
  component: text('component').notNull(),
  amountPaise: bigint('amount_paise', { mode: 'number' }).notNull(),
  journalId: uuid('journal_id').notNull(),
  journalLineId: uuid('journal_line_id').notNull(),
  itemHash: text('item_hash').notNull(),
  replacesPostingSourceId: uuid('replaces_posting_source_id'),
  recordedAt: at('recorded_at').notNull().defaultNow(),
});
