import { z } from 'zod';
import { idSchema, paiseSchema } from './common.js';
import { STOCK_BALANCE_TYPE } from './imports.js';

// Stock search (goods-in 9.1, 9.2, section 11; module-map section 5 `reports`; PRD-STK-001, PRD-STK-006,
// PRD-ACS-008, PRD-EXC-010, PRD-MOD-003; S2-F11-T01). Each result is a product at a place, a Site, a business unit and
// a location, with its quantities apart: physical, available to sell at a Store or to move at a warehouse, waiting, and
// held by kind; the same product at the other Stores and warehouses the reader may see; goods before PT approval by
// their counted style code, colour and size under the brand they were counted under (RR-555). Cost only with the cost
// field class (access-and-approvals 6). No value is set here: every cap is a technical cap the builders chose.

/** The stock record type of a receipt origin, whose cost is the field class cost (stock-ledger 14.3). */
export const STOCK_RECEIPT_ORIGIN_TYPE = 'stock.receipt_origin';
/**
 * Every stock record type the search reads a result from, each under the reader's own grants (stock-ledger 14.3): its
 * balances, its origins with their coverage, and the holds and reservations claimed on them. A result is shown only to
 * a reader whose grants of view on each cover its place and brand, so no hold or reservation the reader may not see is
 * left out of its quantities (goods-in 9.4). The screen opens with view on the balances.
 */
export const STOCK_SEARCH_READS = [
  STOCK_BALANCE_TYPE,
  STOCK_RECEIPT_ORIGIN_TYPE,
  'stock.hold',
  'stock.reservation',
] as const;

/** The most results one page holds, a technical cap (code-house-rules 12.1 "Reads"); Load more reads the next. */
export const STOCK_SEARCH_PAGE_CAP = 100;
/**
 * The most products a search by text, size or barcode reads, a technical cap: past it the answer says so, and the
 * reader narrows the search (goods-in 9.4).
 */
export const STOCK_SEARCH_PRODUCT_CAP = 1_000;
/** The most results one export holds, a technical cap: past it the export is refused, naming the cap (goods-in 9.4). */
export const STOCK_SEARCH_EXPORT_CAP = 10_000;
/** The longest text a search names: a style code, a size or a barcode, as receiving's codes (goods-in 4.8). */
export const STOCK_SEARCH_TEXT_CAP = 60;

/** A condition of stock (stock-ledger 2.2, 14.1). */
export const stockConditionSchema = z.enum(['good', 'damaged', 'wrong', 'unidentified']);
export type StockCondition = z.infer<typeof stockConditionSchema>;

/** A kind of hold placed on goods (stock-ledger 6.1); a count freeze is shown apart, as `frozen`. */
export const holdKindSchema = z.enum([
  'damage',
  'quarantine',
  'excess',
  'source-conflict',
  'expiry',
  'ordinary',
  'inspection',
  'write-off',
]);
export type HoldKind = z.infer<typeof holdKindSchema>;

/** A text the search names: at least one character that is not a space, at most the cap. */
const searchText = z
  .string()
  .max(STOCK_SEARCH_TEXT_CAP)
  .regex(/\S/, { message: 'Needs a character that is not a space' });

/** Where the next page starts: opaque to the screen, which only hands back the `next` it was given. */
export const stockSearchCursorSchema = z
  .string()
  .max(2048)
  .regex(/^[A-Za-z0-9_-]+$/);

/**
 * What a search looks for (goods-in 9.2; PRD-STK-006), every filter optional and all of them together: a text matching
 * a style code, a product code or a brand's article number, as a part of it, ignoring case; a brand; a size; a barcode,
 * which shows each product it names; a Site, a business unit or a location; a condition.
 */
const filterShape = {
  text: searchText.optional(),
  brandId: idSchema.optional(),
  size: searchText.optional(),
  barcode: searchText.optional(),
  siteId: idSchema.optional(),
  businessUnitId: idSchema.optional(),
  locationId: idSchema.optional(),
  condition: stockConditionSchema.optional(),
};

export const stockSearchFiltersSchema = z.strictObject(filterShape);
export type StockSearchFilters = z.infer<typeof stockSearchFiltersSchema>;

export const stockSearchQuerySchema = z.strictObject({
  ...filterShape,
  after: stockSearchCursorSchema.optional(),
  limit: z
    .string()
    .regex(/^[1-9]\d*$/)
    .refine((limit) => Number(limit) <= STOCK_SEARCH_PAGE_CAP, { message: `At most ${String(STOCK_SEARCH_PAGE_CAP)}` })
    .optional(),
});
export type StockSearchQuery = z.infer<typeof stockSearchQuerySchema>;

/** One value of a product's identity, such as its colour (structure-and-masters 4.1); Unknown while it is. */
export const identityValueSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('value'), code: z.string(), name: z.string().nullable() }),
  z.strictObject({ kind: z.literal('text'), text: z.string() }),
  z.strictObject({ kind: z.literal('unknown') }),
]);
export type IdentityValueView = z.infer<typeof identityValueSchema>;

/**
 * The goods of a result (goods-in 9.2): a product, by its SKU, named by its code, style code, size, the brand's article
 * number and its identity, each null while the catalogue does not answer it (Unknown; PRD-MOD-015); goods before PT
 * approval, by their style code, colour and size as counted, a colour or size the count did not state null (Unknown;
 * PRD-MER-005, DEC-138); or unidentified goods, which carry no identity.
 */
export const stockProductSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('product'),
    skuId: idSchema,
    code: z.string().nullable(),
    styleCode: z.string().nullable(),
    size: z.string().nullable(),
    articleNumber: z.string().nullable(),
    identity: z.array(identityValueSchema),
  }),
  z.strictObject({
    kind: z.literal('counted'),
    styleCode: z.string(),
    colour: z.string().nullable(),
    size: z.string().nullable(),
  }),
  z.strictObject({ kind: z.literal('unidentified') }),
]);
export type StockProduct = z.infer<typeof stockProductSchema>;

/** The units a kind of hold holds at the place; kinds may overlap, so they may add to more than `held`. */
export const heldByKindSchema = z.strictObject({ kind: holdKindSchema, quantity: z.int().min(0) });

/**
 * The cost of the physical pieces, at the cost their PT established, `P RATE` a piece (goods-in 9.4): known, Unknown
 * while any piece's cost is not established, or masked for a reader whose assignment does not grant the cost field
 * class (access-and-approvals 6; PRD-ACS-008).
 */
export const stockCostSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('known'), value: paiseSchema }),
  z.strictObject({ kind: z.literal('unknown') }),
  z.strictObject({ kind: z.literal('masked') }),
]);
export type StockCost = z.infer<typeof stockCostSchema>;

/** The four quantities apart (goods-in 9.2; PRD-STK-001). */
const quantityShape = {
  /** Available to sell at a Store's unit, available to move at a unit of no Store (goods-in 9.2). */
  availableAs: z.enum(['sell', 'move']),
  physical: z.int().min(0),
  available: z.int().min(0),
  waiting: z.int().min(0),
  held: z.int().min(0),
};

/** One result: a product at a place, with its quantities apart (goods-in 9.2). */
export const stockPositionSchema = z.strictObject({
  /** The product's key, opaque, which `elsewhere` names it by. */
  productKey: z.string(),
  product: stockProductSchema,
  /** The product's brand; for goods before PT approval, the brand they were counted under (RR-555). */
  brandId: idSchema,
  siteId: idSchema,
  storeId: idSchema.nullable(),
  businessUnitId: idSchema,
  locationId: idSchema,
  ...quantityShape,
  heldByKind: z.array(heldByKindSchema),
  /** A count freeze covers some of it, so nothing of it is available until the count closes (stock-ledger 8.1). */
  frozen: z.boolean(),
  cost: stockCostSchema,
});
export type StockPosition = z.infer<typeof stockPositionSchema>;

/** The same product at another Store or warehouse the reader may see (goods-in 9.2; PRD-STK-006). */
export const stockElsewhereSchema = z.strictObject({
  productKey: z.string(),
  siteId: idSchema,
  storeId: idSchema.nullable(),
  businessUnitId: idSchema,
  ...quantityShape,
});
export type StockElsewhere = z.infer<typeof stockElsewhereSchema>;

const namedSchema = z.strictObject({ id: idSchema, code: z.string(), name: z.string() });

/** The names of the places and brands a page shows, as in force today; one not answered is Unknown. */
export const stockSearchNamesSchema = z.strictObject({
  sites: z.array(namedSchema),
  businessUnits: z.array(namedSchema),
  locations: z.array(namedSchema.extend({ kind: z.string() })),
  brands: z.array(namedSchema),
});
export type StockSearchNames = z.infer<typeof stockSearchNamesSchema>;

/**
 * A page of stock search (goods-in 9.1, 9.2): the results, ordered by place and product; the same products at the other
 * Stores and warehouses the reader may see when the search names a place; the names; whether more products match than
 * the search reads; and where the next page starts. Read through the read-model gateway, with its as-of time.
 */
export const stockSearchSchema = z.strictObject({
  asOf: z.iso.datetime({ offset: true }),
  positions: z.array(stockPositionSchema),
  elsewhere: z.array(stockElsewhereSchema),
  productsCapped: z.boolean(),
  names: stockSearchNamesSchema,
  next: stockSearchCursorSchema.nullable(),
});
export type StockSearch = z.infer<typeof stockSearchSchema>;

/** A search exported as XLSX, as it is shown (goods-in 9.1): the file's name and its bytes. */
export const stockSearchExportSchema = z.strictObject({
  fileName: z.string(),
  contentBase64: z.string(),
});
export type StockSearchExport = z.infer<typeof stockSearchExportSchema>;
