import { uuidv7 } from '@apparel-os/domain';
import type { AttributeValue } from '@apparel-os/schemas';
import { and, eq, inArray } from 'drizzle-orm';
import { CommandDefect, partsOf, type CommandRefusal, type TransactionContext } from '../../../../kernel/index.js';
import { inForceOn, recordItem } from '../commands/common.js';
import { attributeValuesRefusal, categoryOn } from '../commands/product-rules.js';
import { sku, style, vocabularyValue } from '../db/schema.js';
import { identityKey, identityOf } from '../domain/products.js';
import {
  PT_STOCK_UNIT,
  ptProductRefusal as refusal,
  ptRowItem as rowItem,
  type CheckedPtProduct,
  type CheckedPtProducts,
  type CheckedPtStyle,
  type PtProductRequest,
} from '../domain/pt-products.js';
import { trackingOn } from './sku.js';

// The check of a PT's new products under its approval's locks (goods-in 6.3 step 2, 6.6; structure-and-masters 4.1,
// 4.2; RR-585; S2-F06-T01): reads only; the confirmation writes what it answers (commands/confirm-pt-products.ts).

/** The attribute of each approved value given, which the row's list values are (structure-and-masters 4.2). */
async function attributesOf(context: TransactionContext, valueIds: readonly string[]): Promise<Map<string, string>> {
  const found = new Map<string, string>();
  for (const part of partsOf([...new Set(valueIds)], 1)) {
    const rows = await context.tx
      .select({ id: vocabularyValue.id, attributeId: vocabularyValue.attributeId })
      .from(vocabularyValue)
      .where(inArray(vocabularyValue.id, part));
    for (const row of rows) found.set(row.id, row.attributeId);
  }
  return found;
}

/**
 * Checks the new products of a PT under the PT approval's locks (structure-and-masters 4.1, 4.2): a new style's code
 * free, its category in force and its values from their lists; each SKU's size in its category's size set, its colour
 * an identity value the category names, its category's tracking profile in force at the Site, and no SKU of the style
 * with the same size and identity. Writes nothing; answers the identifiers it will write and the SKUs' facts.
 */
export async function checkPtProducts(
  context: TransactionContext,
  request: { readonly products: readonly PtProductRequest[]; readonly siteId: string; readonly date: string },
): Promise<
  | { readonly kind: 'checked'; readonly checked: CheckedPtProducts }
  | { readonly kind: 'refused'; readonly refusal: CommandRefusal }
> {
  const { date } = request;
  const attributeOf = await attributesOf(
    context,
    request.products.flatMap((each) => [each.colourValueId, ...each.styleValueIds]),
  );
  const valuesOf = (ids: readonly string[]): AttributeValue[] =>
    ids.map((valueId) => {
      const attributeId = attributeOf.get(valueId);
      if (attributeId === undefined) throw new CommandDefect(`A PT row names value ${valueId}, which has no attribute`);
      return { attributeId, valueId };
    });
  const styles = new Map<string, CheckedPtStyle & { keys: string[] }>();
  const existing = new Map<string, { brandId: string; categoryId: string }>();
  for (const product of request.products) {
    if (product.existingStyleId !== null) {
      if (!existing.has(product.existingStyleId)) {
        const [row] = await context.tx
          .select({ brandId: style.brandId, categoryId: style.categoryId })
          .from(style)
          .where(eq(style.id, product.existingStyleId));
        if (row === undefined) {
          return {
            kind: 'refused',
            refusal: {
              kind: 'not-found',
              code: 'merchandise.record-not-found',
              missing: [rowItem(product.rowNumber), recordItem('style', product.existingStyleId)],
            },
          };
        }
        existing.set(product.existingStyleId, row);
      }
      continue;
    }
    const made = styles.get(product.styleCode);
    if (made !== undefined) {
      made.keys.push(product.key);
      continue;
    }
    // The style code is unique in the Organisation (4.1): another brand's style may hold it.
    const [taken] = await context.tx.select({ id: style.id }).from(style).where(eq(style.code, product.styleCode));
    if (taken !== undefined) {
      return {
        kind: 'refused',
        refusal: refusal('merchandise.code-taken', [rowItem(product.rowNumber), recordItem('style', taken.id)]),
      };
    }
    for (const reference of [
      { kind: 'brand' as const, id: product.brandId },
      { kind: 'category' as const, id: product.categoryId },
    ]) {
      if (!(await inForceOn(context, reference.kind, reference.id, date))) {
        return {
          kind: 'refused',
          refusal: refusal('merchandise.reference-not-in-force', [
            rowItem(product.rowNumber),
            recordItem(reference.kind, reference.id),
          ]),
        };
      }
    }
    const attributes = valuesOf(product.styleValueIds);
    const values = await attributeValuesRefusal(context, attributes, date);
    if (values !== undefined) {
      return { kind: 'refused', refusal: { ...values, missing: [rowItem(product.rowNumber), ...values.missing] } };
    }
    styles.set(product.styleCode, {
      styleId: uuidv7(),
      versionId: uuidv7(),
      code: product.styleCode,
      brandId: product.brandId,
      categoryId: product.categoryId,
      hsn: product.hsn,
      attributes,
      keys: [product.key],
    });
  }
  const categories = new Map<string, Awaited<ReturnType<typeof categoryOn>>>();
  const tracking = new Map<string, Awaited<ReturnType<typeof trackingOn>>>();
  const seen = new Set<string>();
  const products: CheckedPtProduct[] = [];
  for (const product of request.products) {
    const newStyle = product.existingStyleId === null ? styles.get(product.styleCode) : undefined;
    const styleId = newStyle?.styleId ?? product.existingStyleId;
    const ofStyle = newStyle ?? (styleId === null ? undefined : existing.get(styleId));
    if (styleId === null || ofStyle === undefined) throw new CommandDefect('A PT product lost its style');
    const { categoryId, brandId } = ofStyle;
    if (!categories.has(categoryId)) categories.set(categoryId, await categoryOn(context, categoryId, date));
    const category = categories.get(categoryId);
    const named = [rowItem(product.rowNumber), recordItem('category', categoryId)];
    if (category === undefined) {
      return { kind: 'refused', refusal: refusal('merchandise.reference-not-in-force', named) };
    }
    if (!(category.sizes ?? []).includes(product.size)) {
      return {
        kind: 'refused',
        refusal: refusal('merchandise.pt-size-not-in-size-set', [...named, { kind: 'size', size: product.size }]),
      };
    }
    const [colour] = valuesOf([product.colourValueId]);
    if (colour === undefined || !category.identityAttributeIds.includes(colour.attributeId)) {
      return { kind: 'refused', refusal: refusal('merchandise.pt-colour-not-identity', named) };
    }
    const values = await attributeValuesRefusal(context, [colour], date, category.identityAttributeIds);
    if (values !== undefined) {
      return { kind: 'refused', refusal: { ...values, missing: [rowItem(product.rowNumber), ...values.missing] } };
    }
    if (!tracking.has(categoryId))
      tracking.set(categoryId, await trackingOn(context, categoryId, request.siteId, date));
    const profile = tracking.get(categoryId);
    if (profile === undefined) {
      return { kind: 'refused', refusal: refusal('merchandise.pt-tracking-unknown', named) };
    }
    const identity = identityOf(category.identityAttributeIds, [colour]);
    const key = identityKey(identity);
    const seenKey = JSON.stringify([styleId, product.size, key]);
    if (seen.has(seenKey))
      return { kind: 'refused', refusal: refusal('merchandise.sku-exists', [rowItem(product.rowNumber)]) };
    seen.add(seenKey);
    if (newStyle === undefined) {
      const [same] = await context.tx
        .select({ id: sku.id })
        .from(sku)
        .where(and(eq(sku.styleId, styleId), eq(sku.size, product.size), eq(sku.identityKey, key)));
      if (same !== undefined) {
        return {
          kind: 'refused',
          refusal: refusal('merchandise.sku-exists', [rowItem(product.rowNumber), recordItem('sku', same.id)]),
        };
      }
    }
    const skuId = uuidv7();
    const skuVersionId = uuidv7();
    products.push({
      key: product.key,
      rowNumber: product.rowNumber,
      stagedRowIds: product.stagedRowIds,
      styleId,
      newStyle: newStyle !== undefined,
      skuId,
      skuVersionId,
      size: product.size,
      identity,
      identityKey: key,
      facts: {
        skuId,
        versionId: skuVersionId,
        brandId,
        stockUnit: PT_STOCK_UNIT,
        pieceTracked: profile.pieceTracked,
        batchTracked: profile.batchExpiryRequired,
      },
    });
  }
  return { kind: 'checked', checked: { styles: [...styles.values()], products } };
}
