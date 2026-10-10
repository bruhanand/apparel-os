import type {
  AttributeValueKind,
  CodeScope,
  ExternalCodeKind,
  ProposalState,
  SkuPurpose,
  StockUnit,
} from '@apparel-os/schemas';
import { sql } from 'drizzle-orm';
import { boolean, customType, date, integer, jsonb, pgSchema, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import type { StoredProposal } from '../domain/products.js';

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

// Tracking profiles, styles, SKUs, packs, external codes and product proposals (migrations/organisation/0047;
// S1-F03-T02).

export const trackingProfile = merchandise.table('tracking_profile', identityColumns());
export const trackingProfileVersion = merchandise.table('tracking_profile_version', {
  ...versionColumns(),
  trackingProfileId: uuid('tracking_profile_id').notNull(),
  name: text('name').notNull(),
  pieceTracked: boolean('piece_tracked').notNull(),
  batchExpiryRequired: boolean('batch_expiry_required').notNull(),
  requiredIdentifiers: text('required_identifiers').array().notNull(),
  receivingShelfLifeDays: integer('receiving_shelf_life_days'),
  sellingShelfLifeDays: integer('selling_shelf_life_days'),
});
export const trackingProfileSiteChange = merchandise.table('tracking_profile_site_change', {
  id: uuid('id').primaryKey(),
  trackingProfileVersionId: uuid('tracking_profile_version_id').notNull(),
  siteId: uuid('site_id').notNull(),
  labellingCountId: uuid('labelling_count_id').notNull(),
  effectiveDate: date('effective_date', { mode: 'string' }).notNull(),
  actorUserId: uuid('actor_user_id'),
  actorServiceIdentityId: uuid('actor_service_identity_id'),
  recordedAt: at('recorded_at').notNull().defaultNow(),
});
export const categoryTrackingProfile = merchandise.table('category_tracking_profile', {
  ...versionColumns(),
  categoryId: uuid('category_id').notNull(),
  trackingProfileId: uuid('tracking_profile_id').notNull(),
});

export const productProposal = merchandise.table('product_proposal', {
  id: uuid('id').primaryKey(),
  styleId: uuid('style_id'),
  proposal: jsonb('proposal').$type<StoredProposal>().notNull(),
  sourceWords: text('source_words'),
  proposedByUserId: uuid('proposed_by_user_id').notNull(),
  state: text('state').$type<ProposalState>().notNull(),
  decidedByUserId: uuid('decided_by_user_id'),
  decidedAt: at('decided_at'),
  recordedAt: at('recorded_at').notNull().defaultNow(),
});

export const style = merchandise.table('style', {
  ...identityColumns(),
  brandId: uuid('brand_id').notNull(),
  categoryId: uuid('category_id').notNull(),
  proposalId: uuid('proposal_id').notNull(),
});
export const styleVersion = merchandise.table('style_version', {
  ...versionColumns(),
  styleId: uuid('style_id').notNull(),
  brandArticleNumber: text('brand_article_number'),
  launchDate: date('launch_date', { mode: 'string' }),
  hsn: text('hsn'),
});
export const styleAttributeValue = merchandise.table('style_attribute_value', {
  id: uuid('id').primaryKey(),
  styleVersionId: uuid('style_version_id').notNull(),
  attributeId: uuid('attribute_id').notNull(),
  vocabularyValueId: uuid('vocabulary_value_id'),
  textValue: text('text_value'),
  recordedAt: at('recorded_at').notNull().defaultNow(),
});

export const sku = merchandise.table('sku', {
  ...identityColumns(),
  styleId: uuid('style_id').notNull(),
  size: text('size'),
  /** The canonical key of the SKU's identity rows, which the unique constraint holds (4.1 as built). */
  identityKey: text('identity_key').notNull(),
  proposalId: uuid('proposal_id').notNull(),
});
/** An identity attribute's value on a SKU: a vocabulary value, text, or neither while Unknown (4.1; 2.4). */
export const skuIdentityValue = merchandise.table('sku_identity_value', {
  id: uuid('id').primaryKey(),
  skuId: uuid('sku_id').notNull(),
  attributeId: uuid('attribute_id').notNull(),
  vocabularyValueId: uuid('vocabulary_value_id'),
  textValue: text('text_value'),
  recordedAt: at('recorded_at').notNull().defaultNow(),
});
export const skuVersion = merchandise.table('sku_version', {
  ...versionColumns(),
  skuId: uuid('sku_id').notNull(),
  stockUnit: text('stock_unit').$type<StockUnit>().notNull(),
  purpose: text('purpose').$type<SkuPurpose>().notNull(),
});

export const pack = merchandise.table('pack', {
  ...identityColumns(),
  skuId: uuid('sku_id').notNull(),
});
export const packVersion = merchandise.table('pack_version', {
  ...versionColumns(),
  packId: uuid('pack_id').notNull(),
  units: integer('units'),
  mixed: boolean('mixed').notNull(),
  forPurchasing: boolean('for_purchasing').notNull(),
  forSelling: boolean('for_selling').notNull(),
});
export const packContent = merchandise.table('pack_content', {
  id: uuid('id').primaryKey(),
  packVersionId: uuid('pack_version_id').notNull(),
  skuId: uuid('sku_id').notNull(),
  quantity: integer('quantity').notNull(),
  recordedAt: at('recorded_at').notNull().defaultNow(),
});

export const externalCodeKey = merchandise.table('external_code_key', {
  id: uuid('id').primaryKey(),
  code: text('code').notNull(),
  kind: text('kind').$type<ExternalCodeKind>().notNull(),
  recordedAt: at('recorded_at').notNull().defaultNow(),
});
export const externalCode = merchandise.table('external_code', {
  id: uuid('id').primaryKey(),
  codeKeyId: uuid('code_key_id').notNull(),
  scopeKind: text('scope_kind').$type<CodeScope['kind']>().notNull(),
  scopePartyId: uuid('scope_party_id'),
  scopeBrandId: uuid('scope_brand_id'),
  scopeKey: uuid('scope_key')
    .notNull()
    .generatedAlwaysAs(sql`coalesce(scope_party_id, scope_brand_id, '00000000-0000-0000-0000-000000000000'::uuid)`),
  skuId: uuid('sku_id').notNull(),
  packId: uuid('pack_id'),
  target: text('target')
    .notNull()
    .generatedAlwaysAs(sql`sku_id::text || '/' || coalesce(pack_id::text, '')`),
  alias: boolean('alias').notNull(),
  validDuring: daterange('valid_during').notNull(),
  preparedByUserId: uuid('prepared_by_user_id').notNull(),
  recordedAt: at('recorded_at').notNull().defaultNow(),
});
