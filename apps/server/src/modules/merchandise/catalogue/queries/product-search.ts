import { sql, type SQL } from 'drizzle-orm';
import {
  containsPattern,
  declareReadModel,
  serveReadModel,
  type TransactionContext,
} from '../../../../kernel/index.js';

// The catalogue's read models of stock search (goods-in 9.2, 9.4; structure-and-masters 4.1, 4.3; module-map section 3
// rule 5; PRD-STK-006, PRD-MER-007; S2-F11-T01), served through the kernel's read-model gateway: the products a text,
// a size, a barcode or a brand names, and the facts of products and brands a result shows. The catalogue keeps no
// product name (structure-and-masters 4.1; RR-640), so a text is found in the codes a product carries: its style code,
// its SKU code and the brand's article number of its style, each as a part, ignoring case, through trigram indexes
// (migration `merchandise.catalogue__product_search`). The masters are unscoped (structure-and-masters 6.1): a reader
// learns of a product only through the stock its own grants show it.

/** Which products a search names, every filter together; the date is today's (code-house-rules 9). */
export interface ProductSearchQuery {
  readonly text?: string;
  readonly size?: string;
  readonly barcode?: string;
  readonly brandId?: string;
  readonly date: string;
  /** The most products the search answers; past it, `capped` says more match. */
  readonly cap: number;
}

export interface ProductSearchAnswer {
  readonly skuIds: readonly string[];
  readonly capped: boolean;
}

/** The kinds of external code that are barcodes: a supplier's, under a brand too, and the Organisation's own (4.3). */
const BARCODE_KINDS = ['supplier-barcode', 'internal'];

/**
 * The SKUs a search names (goods-in 9.2): a text found in the style code, the SKU code or the style's article number
 * in force; a size, the SKU's, ignoring case; a barcode, every SKU a mapping of it in force names, an alias too, so a
 * barcode repeated across products names each (PRD-MER-007); a brand, the style's. In identifier order, at most the cap.
 */
export async function productSearch(
  context: TransactionContext,
  query: ProductSearchQuery,
): Promise<ProductSearchAnswer> {
  const where: SQL[] = [sql`true`];
  if (query.text !== undefined) {
    const pattern = containsPattern(query.text);
    where.push(sql`(s.code ilike ${pattern} or u.code ilike ${pattern} or exists (
      select 1 from merchandise.style_version v
      where v.style_id = s.id and v.decision = 'Approved' and v.valid_during @> ${query.date}::date
        and v.brand_article_number ilike ${pattern}))`);
  }
  if (query.size !== undefined) where.push(sql`upper(btrim(u.size)) = upper(btrim(${query.size}))`);
  if (query.barcode !== undefined) {
    where.push(sql`exists (
      select 1 from merchandise.external_code c join merchandise.external_code_key k on k.id = c.code_key_id
      where c.sku_id = u.id and k.kind = any(${sql.param(BARCODE_KINDS)}::text[])
        and k.code = ${query.barcode.trim()} and c.valid_during @> ${query.date}::date)`);
  }
  if (query.brandId !== undefined) where.push(sql`s.brand_id = ${query.brandId}::uuid`);
  const rows = await context.tx.execute<{ id: string }>(sql`
    select u.id::text as id
    from merchandise.sku u join merchandise.style s on s.id = u.style_id
    where ${sql.join(where, sql` and `)}
    order by u.id
    limit ${query.cap + 1}`);
  return {
    skuIds: rows.rows.slice(0, query.cap).map((row) => row.id),
    capped: rows.rows.length > query.cap,
  };
}

/** A value of a product's identity as a result shows it (4.1): a list's value, a text, or Unknown. */
export type IdentityValueFact =
  | { readonly kind: 'value'; readonly code: string; readonly name: string | null }
  | { readonly kind: 'text'; readonly text: string }
  | { readonly kind: 'unknown' };

/** What a result shows of a product (goods-in 9.2): its codes, size, article number and identity, as of the date. */
export interface ProductFacts {
  readonly skuId: string;
  readonly code: string;
  readonly styleCode: string;
  /** Null while Unknown (4.1). */
  readonly size: string | null;
  /** The brand's article number of the style version in force, null while Unknown or none is in force. */
  readonly articleNumber: string | null;
  /** The SKU's identity, in attribute order, as its rows keep it. */
  readonly identity: readonly IdentityValueFact[];
}

/** A brand as a result names it: its code and its name in force on the date, null while none is. */
export interface BrandFacts {
  readonly brandId: string;
  readonly code: string;
  readonly name: string | null;
}

export interface ProductFactsQuery {
  readonly skuIds: readonly string[];
  readonly brandIds: readonly string[];
  readonly date: string;
}

export interface ProductFactsAnswer {
  readonly products: readonly ProductFacts[];
  readonly brands: readonly BrandFacts[];
}

/** The facts of the products and brands given, as of the date; one that does not exist is not answered. */
export async function productFacts(context: TransactionContext, query: ProductFactsQuery): Promise<ProductFactsAnswer> {
  const skuIds = [...new Set(query.skuIds)];
  const products =
    skuIds.length === 0
      ? []
      : (
          await context.tx.execute<{
            id: string;
            code: string;
            style_code: string;
            size: string | null;
            article_number: string | null;
          }>(sql`
      select u.id::text as id, u.code, s.code as style_code, u.size,
             (select v.brand_article_number from merchandise.style_version v
               where v.style_id = s.id and v.decision = 'Approved' and v.valid_during @> ${query.date}::date
               limit 1) as article_number
      from merchandise.sku u join merchandise.style s on s.id = u.style_id
      where u.id = any(${sql.param(skuIds)}::uuid[])
      order by u.id`)
        ).rows;
  const identities =
    skuIds.length === 0
      ? []
      : (
          await context.tx.execute<{
            sku_id: string;
            text_value: string | null;
            value_code: string | null;
            value_name: string | null;
          }>(sql`
      select i.sku_id::text as sku_id, i.text_value, v.code as value_code,
             (select n.name from merchandise.vocabulary_value_version n
               where n.vocabulary_value_id = v.id and n.decision = 'Approved'
                 and n.valid_during @> ${query.date}::date limit 1) as value_name
      from merchandise.sku_identity_value i
      left join merchandise.vocabulary_value v on v.id = i.vocabulary_value_id
      where i.sku_id = any(${sql.param(skuIds)}::uuid[])
      order by i.sku_id, i.attribute_id`)
        ).rows;
  const brandIds = [...new Set(query.brandIds)];
  const brands =
    brandIds.length === 0
      ? []
      : (
          await context.tx.execute<{ id: string; code: string; name: string | null }>(sql`
      select b.id::text as id, b.code,
             (select v.name from merchandise.brand_version v
               where v.brand_id = b.id and v.decision = 'Approved' and v.valid_during @> ${query.date}::date
               limit 1) as name
      from merchandise.brand b
      where b.id = any(${sql.param(brandIds)}::uuid[])
      order by b.id`)
        ).rows;
  return {
    products: products.map((row) => ({
      skuId: row.id,
      code: row.code,
      styleCode: row.style_code,
      size: row.size,
      articleNumber: row.article_number,
      identity: identities
        .filter((value) => value.sku_id === row.id)
        .map((value): IdentityValueFact => {
          if (value.value_code !== null) return { kind: 'value', code: value.value_code, name: value.value_name };
          if (value.text_value !== null) return { kind: 'text', text: value.text_value };
          return { kind: 'unknown' };
        }),
    })),
    brands: brands.map((row) => ({ brandId: row.id, code: row.code, name: row.name })),
  };
}

/** The catalogue's read models of stock search, declared for the read-model gateway (module-map section 3, rule 5). */
export const CATALOGUE_PRODUCT_SEARCH = declareReadModel<ProductSearchQuery, ProductSearchAnswer>(
  'merchandise.product-search',
);
export const CATALOGUE_PRODUCT_FACTS = declareReadModel<ProductFactsQuery, ProductFactsAnswer>(
  'merchandise.product-facts',
);

/** The catalogue's read models as it serves them, handed to the gateway by the composition root. */
export const catalogueReadModels = [
  serveReadModel(CATALOGUE_PRODUCT_SEARCH, productSearch),
  serveReadModel(CATALOGUE_PRODUCT_FACTS, productFacts),
];
