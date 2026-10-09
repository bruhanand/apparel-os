import type { CatalogueKind } from '@apparel-os/schemas';
import type { AnyPgColumn, PgTable } from 'drizzle-orm/pg-core';
import {
  attribute,
  attributeVersion,
  brand,
  brandVersion,
  businessUnitBrand,
  businessUnitCoverage,
  category,
  categoryTrackingProfile,
  categoryVersion,
  pack,
  packVersion,
  sizeSet,
  sizeSetVersion,
  sku,
  skuVersion,
  style,
  styleVersion,
  trackingProfile,
  trackingProfileVersion,
  vocabularyValue,
  vocabularyValueVersion,
} from './schema.js';

/**
 * Each catalogue master's identity table, its version table and the version's column naming its master (6.2). A
 * unit's brand coverage has the unit's identity, kept in `business_unit_coverage`, the row a change locks.
 */
export interface CatalogueTables {
  readonly identity: PgTable;
  readonly identityTable: string;
  readonly identityId: AnyPgColumn;
  readonly version: PgTable;
  readonly versionTable: string;
  readonly versionId: AnyPgColumn;
  readonly owner: AnyPgColumn;
  readonly validDuring: AnyPgColumn;
  readonly decision: AnyPgColumn;
}

function tables(
  identityTable: string,
  identity: PgTable & { id: AnyPgColumn },
  versionTable: string,
  version: PgTable & { id: AnyPgColumn; validDuring: AnyPgColumn; decision: AnyPgColumn },
  owner: AnyPgColumn,
): CatalogueTables {
  return {
    identity,
    identityTable,
    identityId: identity.id,
    version,
    versionTable,
    versionId: version.id,
    owner,
    validDuring: version.validDuring,
    decision: version.decision,
  };
}

export const catalogueTables: Readonly<Record<CatalogueKind, CatalogueTables>> = {
  brand: tables('brand', brand, 'brand_version', brandVersion, brandVersion.brandId),
  business_unit_brand: tables(
    'business_unit_coverage',
    businessUnitCoverage,
    'business_unit_brand',
    businessUnitBrand,
    businessUnitBrand.businessUnitId,
  ),
  category: tables('category', category, 'category_version', categoryVersion, categoryVersion.categoryId),
  size_set: tables('size_set', sizeSet, 'size_set_version', sizeSetVersion, sizeSetVersion.sizeSetId),
  attribute: tables('attribute', attribute, 'attribute_version', attributeVersion, attributeVersion.attributeId),
  vocabulary_value: tables(
    'vocabulary_value',
    vocabularyValue,
    'vocabulary_value_version',
    vocabularyValueVersion,
    vocabularyValueVersion.vocabularyValueId,
  ),
  tracking_profile: tables(
    'tracking_profile',
    trackingProfile,
    'tracking_profile_version',
    trackingProfileVersion,
    trackingProfileVersion.trackingProfileId,
  ),
  // A category's link to a tracking profile has the category's identity: a change locks the category's row (4.6).
  category_tracking_profile: tables(
    'category',
    category,
    'category_tracking_profile',
    categoryTrackingProfile,
    categoryTrackingProfile.categoryId,
  ),
  style: tables('style', style, 'style_version', styleVersion, styleVersion.styleId),
  sku: tables('sku', sku, 'sku_version', skuVersion, skuVersion.skuId),
  pack: tables('pack', pack, 'pack_version', packVersion, packVersion.packId),
};
