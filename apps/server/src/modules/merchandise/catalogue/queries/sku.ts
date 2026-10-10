import type { SkuAsOf } from '@apparel-os/schemas';
import { and, asc, eq, inArray, sql, type AnyColumn } from 'drizzle-orm';
import type { CommandRefusal, TransactionContext } from '../../../../kernel/index.js';
import {
  pack,
  packContent,
  packVersion,
  sku,
  skuIdentityValue,
  skuVersion,
  style,
  styleAttributeValue,
  styleVersion,
} from '../db/schema.js';
import type { IdentityValue } from '../domain/products.js';
import { approvedProfileVersions, changeInForceAt, inForceWithChange, linkOn } from './tracking.js';

// Read a SKU as of a date (structure-and-masters 4.7; module-map 4.12; PRD-MER-002, PRD-MER-004, PRD-MER-014,
// PRD-MER-019, PRD-MOD-010; S1-F03-T02): identity, purpose, stock unit, packs, the tracking profile in force at a Site,
// HSN and attributes, each with the version identifier a transaction stores. Only a confirmed SKU exists, so an
// unconfirmed proposal is never read as one (PRD-MER-013). Unknown stays absent, never a default (PRD-MOD-015).

const notFound = (skuId: string): CommandRefusal => ({
  kind: 'not-found',
  code: 'merchandise.record-not-found',
  missing: [{ kind: 'record', recordType: 'merchandise.sku', recordId: skuId }],
});

const inForce = (column: AnyColumn, date: string) => sql`${column} @> ${date}::date`;

/** Each SKU's identity, in attribute order, as its rows keep it: an Unknown value names its attribute alone (4.1). */
export async function identitiesOf(
  context: TransactionContext,
  skuIds: readonly string[],
): Promise<Map<string, IdentityValue[]>> {
  const identities = new Map<string, IdentityValue[]>();
  if (skuIds.length === 0) return identities;
  const rows = await context.tx
    .select()
    .from(skuIdentityValue)
    .where(inArray(skuIdentityValue.skuId, [...skuIds]))
    .orderBy(asc(skuIdentityValue.attributeId));
  for (const row of rows) {
    identities.set(row.skuId, [
      ...(identities.get(row.skuId) ?? []),
      {
        attributeId: row.attributeId,
        ...(row.vocabularyValueId === null ? {} : { valueId: row.vocabularyValueId }),
        ...(row.textValue === null ? {} : { text: row.textValue }),
      },
    ]);
  }
  return identities;
}

export async function skuOn(
  context: TransactionContext,
  skuId: string,
  siteId: string,
  date: string,
): Promise<{ readonly sku: SkuAsOf } | { readonly refusal: CommandRefusal }> {
  const [head] = await context.tx
    .select({
      code: sku.code,
      styleId: sku.styleId,
      styleCode: style.code,
      brandId: style.brandId,
      categoryId: style.categoryId,
      size: sku.size,
    })
    .from(sku)
    .innerJoin(style, eq(style.id, sku.styleId))
    .where(eq(sku.id, skuId));
  if (head === undefined) return { refusal: notFound(skuId) };
  const [version] = await context.tx
    .select({ id: skuVersion.id, stockUnit: skuVersion.stockUnit, purpose: skuVersion.purpose })
    .from(skuVersion)
    .where(
      and(eq(skuVersion.skuId, skuId), eq(skuVersion.decision, 'Approved'), inForce(skuVersion.validDuring, date)),
    );
  const [styleOn] = await context.tx
    .select({
      id: styleVersion.id,
      brandArticleNumber: styleVersion.brandArticleNumber,
      launchDate: styleVersion.launchDate,
      hsn: styleVersion.hsn,
    })
    .from(styleVersion)
    .where(
      and(
        eq(styleVersion.styleId, head.styleId),
        eq(styleVersion.decision, 'Approved'),
        inForce(styleVersion.validDuring, date),
      ),
    );
  if (version === undefined || styleOn === undefined) {
    return {
      refusal: { kind: 'not-found', code: 'merchandise.no-version-in-force', missing: notFound(skuId).missing },
    };
  }
  const attributes = await context.tx
    .select()
    .from(styleAttributeValue)
    .where(eq(styleAttributeValue.styleVersionId, styleOn.id))
    .orderBy(asc(styleAttributeValue.attributeId));
  const packs = await context.tx
    .select({
      packId: pack.id,
      code: pack.code,
      versionId: packVersion.id,
      units: packVersion.units,
      mixed: packVersion.mixed,
      forPurchasing: packVersion.forPurchasing,
      forSelling: packVersion.forSelling,
    })
    .from(pack)
    .innerJoin(packVersion, eq(packVersion.packId, pack.id))
    .where(and(eq(pack.skuId, skuId), eq(packVersion.decision, 'Approved'), inForce(packVersion.validDuring, date)))
    .orderBy(asc(pack.code), asc(pack.id));
  const contents =
    packs.length === 0
      ? []
      : await context.tx
          .select()
          .from(packContent)
          .where(
            inArray(
              packContent.packVersionId,
              packs.map((row) => row.versionId),
            ),
          )
          .orderBy(asc(packContent.skuId));
  const identity = (await identitiesOf(context, [skuId])).get(skuId) ?? [];
  const tracking = await trackingOn(context, head.categoryId, siteId, date);
  return {
    sku: {
      skuId,
      code: head.code,
      versionId: version.id,
      styleId: head.styleId,
      styleVersionId: styleOn.id,
      styleCode: head.styleCode,
      brandId: head.brandId,
      categoryId: head.categoryId,
      size: head.size,
      identity,
      purpose: version.purpose,
      stockUnit: version.stockUnit,
      packs: packs.map((row) => ({
        packId: row.packId,
        code: row.code,
        versionId: row.versionId,
        ...(row.units === null ? {} : { units: row.units }),
        mixed: row.mixed,
        forPurchasing: row.forPurchasing,
        forSelling: row.forSelling,
        contents: contents
          .filter((content) => content.packVersionId === row.versionId)
          .map((content) => ({ skuId: content.skuId, quantity: content.quantity })),
      })),
      ...(tracking === undefined ? {} : { tracking }),
      ...(styleOn.hsn === null ? {} : { hsn: styleOn.hsn }),
      ...(styleOn.brandArticleNumber === null ? {} : { brandArticleNumber: styleOn.brandArticleNumber }),
      ...(styleOn.launchDate === null ? {} : { launchDate: styleOn.launchDate }),
      attributes: attributes.map((row) => ({
        attributeId: row.attributeId,
        ...(row.vocabularyValueId === null ? {} : { valueId: row.vocabularyValueId }),
        ...(row.textValue === null ? {} : { text: row.textValue }),
      })),
    },
  };
}

/**
 * The tracking profile in force for a category's goods at a Site on a date (4.5, 4.6), or undefined while the category
 * has no link or its profile no version in force: the SKU's profile is then Unknown, never defaulted.
 */
async function trackingOn(
  context: TransactionContext,
  categoryId: string,
  siteId: string,
  date: string,
): Promise<SkuAsOf['tracking']> {
  const link = await linkOn(context, categoryId, date);
  if (link === undefined) return undefined;
  const found = inForceWithChange(await approvedProfileVersions(context, link.trackingProfileId), date);
  if (found === undefined) return undefined;
  const { version, change } = found;
  // PRD-MER-018: piece rules of a change to piece-tracked start at a Site only from its labelling count there.
  const pieceTracked =
    version.pieceTracked && (change === undefined || (await changeInForceAt(context, change.id, siteId, date)));
  return {
    trackingProfileId: link.trackingProfileId,
    versionId: version.id,
    linkVersionId: link.id,
    pieceTracked,
    pieceTrackingRequested: version.pieceTracked,
    batchExpiryRequired: version.batchExpiryRequired,
    requiredIdentifiers: [...version.requiredIdentifiers],
    ...(version.receivingShelfLifeDays === null ? {} : { receivingShelfLifeDays: version.receivingShelfLifeDays }),
    ...(version.sellingShelfLifeDays === null ? {} : { sellingShelfLifeDays: version.sellingShelfLifeDays }),
  };
}
