import type { AttributeValueKind, ProposalState } from '@apparel-os/schemas';
import { boolean, customType, integer, pgSchema, text, timestamp, uuid } from 'drizzle-orm/pg-core';

// Drizzle definitions of the merchandise catalogue's tables (code-house-rules 3.4). They mirror the reviewed migration
// (migrations/organisation/0045) and never create or change a table; an integration test compares each with the
// migrated database. Never exported from the unit's index.ts, so no other unit can name these tables
// (code-house-rules 2).

const merchandise = pgSchema('merchandise');

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

const identityColumns = () => ({
  id: uuid('id').primaryKey(),
  code: text('code').notNull(),
  recordedAt: at('recorded_at').notNull().defaultNow(),
});

export const brand = merchandise.table('brand', identityColumns());
export const brandVersion = merchandise.table('brand_version', {
  ...versionColumns(),
  brandId: uuid('brand_id').notNull(),
  name: text('name').notNull(),
  parentBrandId: uuid('parent_brand_id'),
  retired: boolean('retired').notNull(),
});
export const brandAlias = merchandise.table('brand_alias', {
  id: uuid('id').primaryKey(),
  brandVersionId: uuid('brand_version_id').notNull(),
  alias: text('alias').notNull(),
  recordedAt: at('recorded_at').notNull().defaultNow(),
});

export const businessUnitCoverage = merchandise.table('business_unit_coverage', {
  id: uuid('id').primaryKey(),
  recordedAt: at('recorded_at').notNull().defaultNow(),
});
export const businessUnitBrand = merchandise.table('business_unit_brand', {
  ...versionColumns(),
  businessUnitId: uuid('business_unit_id').notNull(),
});
export const businessUnitBrandMember = merchandise.table('business_unit_brand_member', {
  id: uuid('id').primaryKey(),
  businessUnitBrandId: uuid('business_unit_brand_id').notNull(),
  brandId: uuid('brand_id').notNull(),
  recordedAt: at('recorded_at').notNull().defaultNow(),
});

export const attribute = merchandise.table('attribute', {
  ...identityColumns(),
  valueKind: text('value_kind').$type<AttributeValueKind>().notNull(),
});
export const attributeVersion = merchandise.table('attribute_version', {
  ...versionColumns(),
  attributeId: uuid('attribute_id').notNull(),
  name: text('name').notNull(),
});

export const vocabularyProposal = merchandise.table('vocabulary_proposal', {
  id: uuid('id').primaryKey(),
  attributeId: uuid('attribute_id').notNull(),
  code: text('code').notNull(),
  name: text('name').notNull(),
  proposedByUserId: uuid('proposed_by_user_id').notNull(),
  state: text('state').$type<ProposalState>().notNull(),
  decidedByUserId: uuid('decided_by_user_id'),
  decidedAt: at('decided_at'),
  recordedAt: at('recorded_at').notNull().defaultNow(),
});
export const vocabularyValue = merchandise.table('vocabulary_value', {
  ...identityColumns(),
  attributeId: uuid('attribute_id').notNull(),
  proposalId: uuid('proposal_id').notNull(),
});
export const vocabularyValueVersion = merchandise.table('vocabulary_value_version', {
  ...versionColumns(),
  vocabularyValueId: uuid('vocabulary_value_id').notNull(),
  name: text('name').notNull(),
});

export const category = merchandise.table('category', identityColumns());
export const sizeSet = merchandise.table('size_set', {
  ...identityColumns(),
  categoryId: uuid('category_id').notNull(),
});
export const sizeSetVersion = merchandise.table('size_set_version', {
  ...versionColumns(),
  sizeSetId: uuid('size_set_id').notNull(),
  name: text('name').notNull(),
});
export const sizeSetMember = merchandise.table('size_set_member', {
  id: uuid('id').primaryKey(),
  sizeSetVersionId: uuid('size_set_version_id').notNull(),
  position: integer('position').notNull(),
  size: text('size').notNull(),
  recordedAt: at('recorded_at').notNull().defaultNow(),
});
export const categoryVersion = merchandise.table('category_version', {
  ...versionColumns(),
  categoryId: uuid('category_id').notNull(),
  name: text('name').notNull(),
  parentCategoryId: uuid('parent_category_id'),
  sizeSetId: uuid('size_set_id'),
});
export const categoryIdentityAttribute = merchandise.table('category_identity_attribute', {
  id: uuid('id').primaryKey(),
  categoryVersionId: uuid('category_version_id').notNull(),
  attributeId: uuid('attribute_id').notNull(),
  recordedAt: at('recorded_at').notNull().defaultNow(),
});
