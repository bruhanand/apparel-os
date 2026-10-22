import { sql } from 'drizzle-orm';
import { partsOf, type TransactionContext } from '../../../../kernel/index.js';

// What `merchandise` · PT reads of the catalogue for a PT file (goods-in 5.2, 5.3, 5.5; structure-and-masters 4.1 to
// 4.3; S2-F04-T02): the brands and categories in force by their codes, the lists the template's values are on; the
// styles and SKUs of the GRN's brand the file names, with what a row is compared with; and the SKUs each barcode of the
// file names under the brand or the Organisation. Each reads many codes at once, in parts of MAX_ROWS_PER_STATEMENT, so
// a file of 10,000 rows is read in a few bounded statements (imports-and-opening-data 3.3 "As built"; PRD-PRF-001).
// The catalogue's tables are unscoped (structure-and-masters 6.2), so the reader's scope does not narrow them.

/** The codes in parts, each one array parameter of at most MAX_ROWS_PER_STATEMENT codes (kernel `partsOf`). */
const inParts = <T>(values: readonly T[]): T[][] => partsOf(values, 1);

/** The brands and categories in force on a date, by code (2.2, 4.1): a brand not retired then. */
export async function brandsAndCategoriesOn(
  context: TransactionContext,
  date: string,
): Promise<{ readonly brands: Map<string, string>; readonly categories: Map<string, string> }> {
  const brands = await context.tx.execute<{ id: string; code: string }>(sql`
    select b.id::text as id, b.code
    from merchandise.brand b
    join merchandise.brand_version v on v.brand_id = b.id
    where v.decision = 'Approved' and v.valid_during @> ${date}::date and not v.retired`);
  const categories = await context.tx.execute<{ id: string; code: string }>(sql`
    select c.id::text as id, c.code
    from merchandise.category c
    join merchandise.category_version v on v.category_id = c.id
    where v.decision = 'Approved' and v.valid_during @> ${date}::date`);
  return {
    brands: new Map(brands.rows.map((row) => [row.code, row.id])),
    categories: new Map(categories.rows.map((row) => [row.code, row.id])),
  };
}

/** A style of the brand the file names, with its version in force: its category, HSN and attribute values. */
export interface BrandStyle {
  readonly styleId: string;
  readonly code: string;
  readonly categoryId: string;
  /** Null while Unknown (structure-and-masters 2.4). */
  readonly hsn: string | null;
  /** The approved vocabulary value of each list attribute the style holds. */
  readonly attributes: ReadonlyMap<string, string>;
}

/** A SKU of one of those styles: its size and its value of the colour attribute, each null while Unknown. */
export interface BrandSku {
  readonly skuId: string;
  readonly styleCode: string;
  readonly size: string | null;
  readonly colourValueId: string | null;
}

/**
 * The brand's styles of the codes given, compared exactly (2.1), each with its version in force on the date, and their
 * SKUs with their colour, as the attribute given is the colour list (4.1; goods-in 5.5).
 */
export async function brandProductsOn(
  context: TransactionContext,
  request: {
    readonly brandId: string;
    readonly styleCodes: readonly string[];
    readonly colourAttributeId: string;
    readonly date: string;
  },
): Promise<{ readonly styles: BrandStyle[]; readonly skus: BrandSku[] }> {
  const styles: BrandStyle[] = [];
  const skus: BrandSku[] = [];
  for (const codes of inParts([...new Set(request.styleCodes)])) {
    const found = await context.tx.execute<{
      id: string;
      code: string;
      category_id: string;
      hsn: string | null;
      version_id: string;
    }>(sql`
      select s.id::text as id, s.code, s.category_id::text as category_id, v.hsn, v.id::text as version_id
      from merchandise.style s
      join merchandise.style_version v on v.style_id = s.id
      where s.brand_id = ${request.brandId}::uuid and s.code = any(${sql.param(codes)}::text[])
        and v.decision = 'Approved' and v.valid_during @> ${request.date}::date`);
    if (found.rows.length === 0) continue;
    const values = await context.tx.execute<{ version_id: string; attribute_id: string; value_id: string }>(sql`
      select style_version_id::text as version_id, attribute_id::text as attribute_id,
             vocabulary_value_id::text as value_id
      from merchandise.style_attribute_value
      where style_version_id = any(${sql.param(found.rows.map((row) => row.version_id))}::uuid[])
        and vocabulary_value_id is not null`);
    for (const row of found.rows) {
      styles.push({
        styleId: row.id,
        code: row.code,
        categoryId: row.category_id,
        hsn: row.hsn,
        attributes: new Map(
          values.rows
            .filter((each) => each.version_id === row.version_id)
            .map((each) => [each.attribute_id, each.value_id]),
        ),
      });
    }
    const ofStyles = await context.tx.execute<{
      id: string;
      style_code: string;
      size: string | null;
      colour: string | null;
    }>(
      sql`
      select k.id::text as id, s.code as style_code, k.size, iv.vocabulary_value_id::text as colour
      from merchandise.sku k
      join merchandise.style s on s.id = k.style_id
      left join merchandise.sku_identity_value iv
        on iv.sku_id = k.id and iv.attribute_id = ${request.colourAttributeId}::uuid
      where k.style_id = any(${sql.param(found.rows.map((row) => row.id))}::uuid[])`,
    );
    for (const row of ofStyles.rows) {
      skus.push({ skuId: row.id, styleCode: row.style_code, size: row.size, colourValueId: row.colour });
    }
  }
  return { styles, skus };
}

/**
 * The SKUs each barcode given names on the date, as a supplier barcode in force under the brand or the whole
 * Organisation, active mappings only (4.3; goods-in 5.5: a PT's barcode is recorded and resolved under its product's
 * brand). A barcode no mapping names is left out.
 */
export async function barcodeSkusOn(
  context: TransactionContext,
  request: { readonly brandId: string; readonly barcodes: readonly string[]; readonly date: string },
): Promise<Map<string, string[]>> {
  const named = new Map<string, string[]>();
  for (const codes of inParts([...new Set(request.barcodes)])) {
    const rows = await context.tx.execute<{ code: string; sku_id: string }>(sql`
      select distinct k.code, c.sku_id::text as sku_id
      from merchandise.external_code_key k
      join merchandise.external_code c on c.code_key_id = k.id
      where k.kind = 'supplier-barcode' and k.code = any(${sql.param(codes)}::text[]) and not c.alias
        and c.valid_during @> ${request.date}::date
        and (c.scope_kind = 'organisation' or (c.scope_kind = 'brand' and c.scope_brand_id = ${request.brandId}::uuid))
      order by k.code, sku_id`);
    for (const row of rows.rows) named.set(row.code, [...(named.get(row.code) ?? []), row.sku_id]);
  }
  return named;
}
