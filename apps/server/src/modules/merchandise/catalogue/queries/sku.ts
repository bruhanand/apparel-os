import type { SkuAsOf, SkuPurpose, StockUnit } from '@apparel-os/schemas';
import { sql } from 'drizzle-orm';
import type { CommandRefusal, TransactionContext } from '../../../../kernel/index.js';
import { identityView } from '../domain/products.js';
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

/** The list-type attributes among those named, so an identity value reads as a vocabulary value or as text. */
async function listAttributes(context: TransactionContext, ids: readonly string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const result = await context.tx.execute<{ id: string }>(sql`
    select id::text as id from merchandise.attribute
    where id = any (${`{${ids.join(',')}}`}::uuid[]) and value_kind = 'list'`);
  return new Set(result.rows.map((row) => row.id));
}

export async function skuOn(
  context: TransactionContext,
  skuId: string,
  siteId: string,
  date: string,
): Promise<{ readonly sku: SkuAsOf } | { readonly refusal: CommandRefusal }> {
  const heads = await context.tx.execute<{
    code: string;
    style_id: string;
    style_code: string;
    brand_id: string;
    category_id: string;
    size: string | null;
    identity: Record<string, string | null>;
  }>(sql`
    select k.code, k.style_id::text as style_id, s.code as style_code, s.brand_id::text as brand_id,
           s.category_id::text as category_id, k.size, k.identity
    from merchandise.sku k join merchandise.style s on s.id = k.style_id
    where k.id = ${skuId}::uuid`);
  const head = heads.rows[0];
  if (head === undefined) return { refusal: notFound(skuId) };
  const versions = await context.tx.execute<{ id: string; stock_unit: StockUnit; purpose: SkuPurpose }>(sql`
    select id::text as id, stock_unit, purpose from merchandise.sku_version
    where sku_id = ${skuId}::uuid and decision = 'Approved' and valid_during @> ${date}::date`);
  const styles = await context.tx.execute<{
    id: string;
    brand_article_number: string | null;
    launch_date: string | null;
    hsn: string | null;
  }>(sql`
    select id::text as id, brand_article_number, launch_date::text as launch_date, hsn from merchandise.style_version
    where style_id = ${head.style_id}::uuid and decision = 'Approved' and valid_during @> ${date}::date`);
  const version = versions.rows[0];
  const styleVersion = styles.rows[0];
  if (version === undefined || styleVersion === undefined) {
    return {
      refusal: { kind: 'not-found', code: 'merchandise.no-version-in-force', missing: notFound(skuId).missing },
    };
  }
  const attributes = await context.tx.execute<{
    attribute_id: string;
    value_id: string | null;
    text: string | null;
  }>(sql`
    select attribute_id::text as attribute_id, vocabulary_value_id::text as value_id, text_value as text
    from merchandise.style_attribute_value where style_version_id = ${styleVersion.id}::uuid order by attribute_id`);
  const packs = await context.tx.execute<{
    pack_id: string;
    code: string;
    version_id: string;
    units: number | null;
    mixed: boolean;
    for_purchasing: boolean;
    for_selling: boolean;
  }>(sql`
    select p.id::text as pack_id, p.code, v.id::text as version_id, v.units, v.mixed, v.for_purchasing, v.for_selling
    from merchandise.pack p join merchandise.pack_version v on v.pack_id = p.id
    where p.sku_id = ${skuId}::uuid and v.decision = 'Approved' and v.valid_during @> ${date}::date
    order by p.code, p.id`);
  const contents = await context.tx.execute<{ version_id: string; sku_id: string; quantity: number }>(sql`
    select c.pack_version_id::text as version_id, c.sku_id::text as sku_id, c.quantity
    from merchandise.pack_content c
    where c.pack_version_id = any (${`{${packs.rows.map((row) => row.version_id).join(',')}}`}::uuid[])
    order by c.sku_id`);
  const identityIds = Object.keys(head.identity);
  const lists = await listAttributes(context, identityIds);
  const tracking = await trackingOn(context, head.category_id, siteId, date);
  return {
    sku: {
      skuId,
      code: head.code,
      versionId: version.id,
      styleId: head.style_id,
      styleVersionId: styleVersion.id,
      styleCode: head.style_code,
      brandId: head.brand_id,
      categoryId: head.category_id,
      size: head.size,
      identity: identityView(head.identity, lists),
      purpose: version.purpose,
      stockUnit: version.stock_unit,
      packs: packs.rows.map((row) => ({
        packId: row.pack_id,
        code: row.code,
        versionId: row.version_id,
        ...(row.units === null ? {} : { units: row.units }),
        mixed: row.mixed,
        forPurchasing: row.for_purchasing,
        forSelling: row.for_selling,
        contents: contents.rows
          .filter((content) => content.version_id === row.version_id)
          .map((content) => ({ skuId: content.sku_id, quantity: content.quantity })),
      })),
      ...(tracking === undefined ? {} : { tracking }),
      ...(styleVersion.hsn === null ? {} : { hsn: styleVersion.hsn }),
      ...(styleVersion.brand_article_number === null ? {} : { brandArticleNumber: styleVersion.brand_article_number }),
      ...(styleVersion.launch_date === null ? {} : { launchDate: styleVersion.launch_date }),
      attributes: attributes.rows.map((row) => ({
        attributeId: row.attribute_id,
        ...(row.value_id === null ? {} : { valueId: row.value_id }),
        ...(row.text === null ? {} : { text: row.text }),
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
