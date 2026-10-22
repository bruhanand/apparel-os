import type { PtField } from './rows.js';

// Each PT row's product (goods-in 5.5; PRD-MER-007, PRD-MER-013, DEC-135, DEC-138; S2-F04-T02). **Design choice**
// (goods-in 5.8): a row's product is the GRN brand's SKU of the row's style code, colour and size; failing that, the one
// SKU its barcode names under the brand (or the Organisation) of the row's style code and size, whose colour may differ,
// since a PT may carry a grade tag for its colour (DEC-138). A barcode naming a product of another style or size is
// never taken for the row's: the row proposes its own product and the barcode is flagged as repeated, kept for both.
// Otherwise the row proposes a new product, of the style when the brand has one of that code, else of a new style;
// rows of one style, colour and size propose one SKU. A barcode is flagged as repeated, never refused, when it names
// another product than the row's under the brand, or when the file gives it to rows of different products; the same
// barcode on several rows of one product is ordinary. A row whose product holds another value than the row (colour, Sub
// category, HSN, season, gender, type, item, fit) shows it as a difference; the PT keeps the file's value and the
// product changes only through its own master change. Codes compare exactly (structure-and-masters 2.1). Pure.

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

export function productsOf(
  rows: readonly ProductRow[],
  facts: ProductFacts,
): { readonly rows: RowFinding[]; readonly proposals: Proposal[] } {
  const skuById = new Map(facts.skus.map((sku) => [sku.skuId, sku]));
  const found = rows.map((row) => {
    const sameStyleAndSize = (skuId: string) => {
      const sku = skuById.get(skuId);
      return sku?.styleCode === row.styleCode && sku.size === row.sizeCode;
    };
    const named = facts.barcodes.get(row.barcode) ?? [];
    const byIdentity = facts.skus.filter(
      (sku) => sameStyleAndSize(sku.skuId) && sku.colourValueId === row.colour.valueId,
    );
    const byBarcode = named.filter(sameStyleAndSize);
    const skuId = byIdentity.length === 1 ? byIdentity[0]?.skuId : byBarcode.length === 1 ? byBarcode[0] : undefined;
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
  return { rows: findings, proposals: [...proposals.values()] };
}

/** Where an existing product holds another value than the row (goods-in 5.5). */
function differencesOf(row: ProductRow, product: RowProduct, facts: ProductFacts): Difference[] {
  if (product.kind !== 'existing') return [];
  const sku = facts.skus.find((each) => each.skuId === product.skuId);
  const style = sku === undefined ? undefined : facts.styles.get(sku.styleCode);
  const code = (valueId: string) => facts.codes.get(valueId) ?? null;
  const differences: Difference[] = [];
  if (sku?.colourValueId !== null && sku?.colourValueId !== undefined && sku.colourValueId !== row.colour.valueId) {
    differences.push({ field: 'colour', file: row.colour.code, product: code(sku.colourValueId) });
  }
  if (style !== undefined && style.categoryId !== row.categoryId) {
    differences.push({
      field: 'subCategory',
      file: facts.codes.get(row.categoryId) ?? '',
      product: code(style.categoryId),
    });
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
