import type { PtField, PtIssue } from './rows.js';

// Each PT row's product (goods-in 5.5; PRD-MER-007, PRD-MER-013, DEC-135, DEC-138; S2-F04-T02; code review 6 of
// stage 2). "A row's product is found by its barcode's external code mapping, or by brand, style, colour and size"
// (5.5), in that order. **Design choice** (goods-in 5.8) of how a repeated barcode is narrowed: the barcode's mapping
// under the GRN's brand, the product's brand, comes first: one SKU it names is the row's product; several, a barcode the
// brand repeats, are narrowed by the row's style and size, and, while more than one is left, by its colour, since a PT
// may carry a grade tag for its colour (DEC-138); one left is the row's product. With no mapping, or none left, the
// row's product is the brand's SKU of its style code, colour and size. Otherwise the row proposes a new product, of the
// style when the brand has one of that code, else of a new style; rows of one style, colour and size propose one SKU. A
// barcode is flagged as repeated, never refused, when it names another product than the row's, or when the file gives
// it to rows of different products; the same barcode on several rows of one product is ordinary. Two problems refuse
// the file, each naming its rows (goods-in 5.6; code review 7 of stage 2): a barcode naming one product of another
// style or size than the row's, since style and size are a product's identity (RR-608); and rows of one new style that
// disagree on a value the style holds (Sub category, HSN, season, gender, type, item, fit), since the style would take
// a value no one chose. A colour the product holds otherwise shows as a difference, since a PT may carry a grade tag
// for its colour (DEC-138), as does a value an existing style holds otherwise (Sub category, HSN, season, gender, type,
// item, fit); the PT keeps the file's value and the product changes only through its own master change. Codes compare
// exactly (structure-and-masters 2.1). Pure.

/** A value of a list the row names: its code as given and the approved value it is. */
export interface ListValue {
  readonly code: string;
  readonly valueId: string;
}

/** The style-level lists a product holds as its style's attribute values (structure-and-masters 4.1). */
export type StyleList = 'season' | 'gender' | 'type' | 'item' | 'fit';
const STYLE_LISTS: readonly StyleList[] = ['season', 'gender', 'type', 'item', 'fit'];

/** What the product of a row is found by, and compared with. */
export interface ProductRow {
  readonly rowNumber: number;
  readonly styleCode: string;
  readonly sizeCode: string;
  readonly colour: ListValue;
  readonly barcode: string;
  readonly categoryId: string;
  /** The row's SUB CATEGORY as the file gives it, the code of `categoryId`. */
  readonly subCategoryCode: string;
  readonly hsn: string;
  readonly styleValues: Readonly<Partial<Record<StyleList, ListValue>>>;
}

/** What the catalogue holds of the GRN brand's styles the file names, and of its barcodes (structure-and-masters 4). */
export interface ProductFacts {
  /** The attribute marked as the colour list, a SKU's colour being its identity value of it. */
  readonly colourAttributeId: string;
  /** The attributes marked as the style-level lists. */
  readonly styleAttributes: Readonly<Record<StyleList, string>>;
  /** The brand's styles by code: the category, the HSN in force (null while Unknown) and the attribute values. */
  readonly styles: ReadonlyMap<
    string,
    {
      readonly styleId: string;
      readonly categoryId: string;
      readonly hsn: string | null;
      readonly attributes: ReadonlyMap<string, string>;
    }
  >;
  /** Their SKUs: the style code, size (null while Unknown) and colour value (null while Unknown). */
  readonly skus: readonly {
    readonly skuId: string;
    readonly styleCode: string;
    readonly size: string | null;
    readonly colourValueId: string | null;
  }[];
  /** The SKUs each barcode of the file names in force, under the brand or the Organisation. */
  readonly barcodes: ReadonlyMap<string, readonly string[]>;
  /** The codes of the values and categories a difference names. */
  readonly codes: ReadonlyMap<string, string>;
}

export type RowProduct =
  | { readonly kind: 'existing'; readonly skuId: string; readonly barcodeMapped: boolean }
  | { readonly kind: 'proposed'; readonly key: string };

export interface Difference {
  readonly field: PtField;
  readonly file: string;
  /** The product's value; null where its code cannot be named. */
  readonly product: string | null;
}

export interface RowFinding {
  readonly rowNumber: number;
  readonly product: RowProduct;
  readonly repeated: boolean;
  readonly differences: readonly Difference[];
}

/** A new product the rows propose: one SKU of one style, colour and size (PRD-MER-013). */
export interface Proposal {
  readonly key: string;
  readonly styleCode: string;
  /** The brand's style of that code, or null for a new style. */
  readonly existingStyleId: string | null;
  readonly colour: ListValue;
  readonly sizeCode: string;
  readonly rowNumbers: number[];
}

const proposalKey = (row: ProductRow) => `${row.styleCode}|${row.colour.code}|${row.sizeCode}`;
const productKey = (product: RowProduct) => (product.kind === 'existing' ? `sku:${product.skuId}` : product.key);

/** The values a style holds, each a field of the row (structure-and-masters 4.1; goods-in 5.3). */
const STYLE_FIELDS: readonly { readonly field: PtField; readonly of: (row: ProductRow) => string | undefined }[] = [
  { field: 'subCategory', of: (row) => row.categoryId },
  { field: 'hsn', of: (row) => row.hsn },
  ...STYLE_LISTS.map((list) => ({ field: list, of: (row: ProductRow) => row.styleValues[list]?.valueId })),
];

/**
 * The rows of each new style that disagree on a value the style holds, each row named on each such field, in the file's
 * order (goods-in 5.3, 5.6; code review 7 of stage 2).
 */
function newStyleDisagreements(
  rows: readonly ProductRow[],
  products: ReadonlyMap<number, RowProduct>,
  facts: ProductFacts,
): PtIssue[] {
  const ofNewStyle = rows.filter(
    (row) => products.get(row.rowNumber)?.kind === 'proposed' && !facts.styles.has(row.styleCode),
  );
  const disagreeing = new Set<string>();
  for (const { field, of } of STYLE_FIELDS) {
    const values = new Map<string, Set<string | undefined>>();
    for (const row of ofNewStyle) values.set(row.styleCode, (values.get(row.styleCode) ?? new Set()).add(of(row)));
    for (const [styleCode, given] of values) if (given.size > 1) disagreeing.add(`${styleCode}|${field}`);
  }
  return ofNewStyle.flatMap((row) =>
    STYLE_FIELDS.filter(({ field }) => disagreeing.has(`${row.styleCode}|${field}`)).map(({ field }) => ({
      code: 'merchandise.pt-new-style-disagrees',
      field,
      rowNumber: row.rowNumber,
    })),
  );
}

/** Whether the product a row is found as is of another style or size than the row names: its identity (RR-608). */
function ofOtherIdentity(row: ProductRow, product: RowProduct, skuById: ReadonlyMap<string, SkuFacts>): boolean {
  if (product.kind !== 'existing') return false;
  const sku = skuById.get(product.skuId);
  return sku !== undefined && (sku.styleCode !== row.styleCode || (sku.size !== null && sku.size !== row.sizeCode));
}

export function productsOf(
  rows: readonly ProductRow[],
  facts: ProductFacts,
): { readonly rows: RowFinding[]; readonly proposals: Proposal[]; readonly issues: PtIssue[] } {
  const skuById = new Map(facts.skus.map((sku) => [sku.skuId, sku]));
  const found = rows.map((row) => {
    const named = facts.barcodes.get(row.barcode) ?? [];
    const skuId = productOfBarcode(row, named, skuById) ?? productOfIdentity(row, facts.skus);
    const product: RowProduct =
      skuId === undefined
        ? { kind: 'proposed', key: proposalKey(row) }
        : { kind: 'existing', skuId, barcodeMapped: named.includes(skuId) };
    return { row, product, namesAnother: named.some((each) => each !== skuId) };
  });
  // The products each barcode is given to in the file.
  const productsOfBarcode = new Map<string, Set<string>>();
  for (const { row, product } of found) {
    const set = productsOfBarcode.get(row.barcode) ?? new Set<string>();
    set.add(productKey(product));
    productsOfBarcode.set(row.barcode, set);
  }
  const proposals = new Map<string, Proposal>();
  const findings = found.map(({ row, product, namesAnother }) => {
    if (product.kind === 'proposed') {
      const proposal = proposals.get(product.key) ?? {
        key: product.key,
        styleCode: row.styleCode,
        existingStyleId: facts.styles.get(row.styleCode)?.styleId ?? null,
        colour: row.colour,
        sizeCode: row.sizeCode,
        rowNumbers: [],
      };
      proposal.rowNumbers.push(row.rowNumber);
      proposals.set(product.key, proposal);
    }
    const repeated = namesAnother || (productsOfBarcode.get(row.barcode)?.size ?? 0) > 1;
    return { rowNumber: row.rowNumber, product, repeated, differences: differencesOf(row, product, facts) };
  });
  const issues: PtIssue[] = [
    ...found
      .filter(({ row, product }) => ofOtherIdentity(row, product, skuById))
      .map(({ row }) => ({
        code: 'merchandise.pt-barcode-of-other-product',
        field: 'barcode' as const,
        rowNumber: row.rowNumber,
      })),
    ...newStyleDisagreements(rows, new Map(found.map(({ row, product }) => [row.rowNumber, product])), facts),
  ].sort((a, b) => (a.rowNumber ?? 0) - (b.rowNumber ?? 0));
  return { rows: findings, proposals: [...proposals.values()], issues };
}

type SkuFacts = ProductFacts['skus'][number];

/**
 * The SKU the row's barcode names under the brand (5.5): the one SKU of the brand it names; or, of several, the one left
 * by the row's style and size, then, while more than one is left, by its colour. Undefined when it names none of the
 * brand's, or none is left. A SKU of another brand, which a mapping for the whole Organisation may name, is never the
 * row's: the row is the GRN's brand (5.3).
 */
function productOfBarcode(
  row: ProductRow,
  named: readonly string[],
  skuById: ReadonlyMap<string, SkuFacts>,
): string | undefined {
  const ofBrand = named.filter((skuId) => skuById.has(skuId));
  if (ofBrand.length <= 1) return ofBrand[0];
  const ofStyleAndSize = ofBrand.filter((skuId) => {
    const sku = skuById.get(skuId);
    return sku?.styleCode === row.styleCode && sku.size === row.sizeCode;
  });
  if (ofStyleAndSize.length <= 1) return ofStyleAndSize[0];
  const ofColour = ofStyleAndSize.filter((skuId) => skuById.get(skuId)?.colourValueId === row.colour.valueId);
  return ofColour.length === 1 ? ofColour[0] : undefined;
}

/** The brand's one SKU of the row's style code, colour and size (5.5), or undefined. */
function productOfIdentity(row: ProductRow, skus: readonly SkuFacts[]): string | undefined {
  const same = skus.filter(
    (sku) => sku.styleCode === row.styleCode && sku.size === row.sizeCode && sku.colourValueId === row.colour.valueId,
  );
  return same.length === 1 ? same[0]?.skuId : undefined;
}

/** Where an existing product holds another value than the row (goods-in 5.5). */
function differencesOf(row: ProductRow, product: RowProduct, facts: ProductFacts): Difference[] {
  if (product.kind !== 'existing') return [];
  const sku = facts.skus.find((each) => each.skuId === product.skuId);
  const style = sku === undefined ? undefined : facts.styles.get(sku.styleCode);
  const code = (valueId: string) => facts.codes.get(valueId) ?? null;
  const differences: Difference[] = [];
  // A product of another style or size is a problem of the row, not a difference (ofOtherIdentity; RR-608). A colour
  // the product holds otherwise shows as one: the PT may carry a grade tag for its colour (DEC-138).
  if (sku?.colourValueId !== null && sku?.colourValueId !== undefined && sku.colourValueId !== row.colour.valueId) {
    differences.push({ field: 'colour', file: row.colour.code, product: code(sku.colourValueId) });
  }
  if (style !== undefined && style.categoryId !== row.categoryId) {
    differences.push({ field: 'subCategory', file: row.subCategoryCode, product: code(style.categoryId) });
  }
  if (style?.hsn !== null && style?.hsn !== undefined && style.hsn !== row.hsn) {
    differences.push({ field: 'hsn', file: row.hsn, product: style.hsn });
  }
  for (const list of STYLE_LISTS) {
    const held = style?.attributes.get(facts.styleAttributes[list]);
    const given = row.styleValues[list];
    if (held !== undefined && given !== undefined && held !== given.valueId) {
      differences.push({ field: list, file: given.code, product: code(held) });
    }
  }
  return differences;
}
