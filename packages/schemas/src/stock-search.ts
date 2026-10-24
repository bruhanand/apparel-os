import { z } from 'zod';
import { idSchema, maybeKnownTextSchema, pageLimitSchema, paiseSchema } from './common.js';
import { STOCK_BALANCE_TYPE } from './imports.js';
import { RECEIVING_CAPS } from './receiving.js';

// Stock search (goods-in 9.1, 9.2, section 11; module-map section 5 `reports`; PRD-STK-001, PRD-STK-006,
// PRD-ACS-008, PRD-EXC-010, PRD-MOD-003; S2-F11-T01). Each result is a product at a place, a Site, a business unit and
// a location, with its quantities apart: physical, available to sell at a Store or to move at a warehouse, waiting, and
// held by kind; the same product at the other Stores and warehouses the reader may see; goods before PT approval by
// their counted style code, colour and size under the brand they were counted under (RR-555). Cost only with the cost
// field class (access-and-approvals 6). No value is set here: every cap is a technical cap the builders chose.

/** The stock record type of a receipt origin, whose cost is the field class cost (stock-ledger 14.3). */
export const STOCK_RECEIPT_ORIGIN_TYPE = 'stock.receipt_origin';
/** The stock record types of holds and reservations, with their claims (stock-ledger 14.3). */
export const STOCK_HOLD_TYPE = 'stock.hold';
export const STOCK_RESERVATION_TYPE = 'stock.reservation';
/** The stock record types of movements, with their legs, and of coverage records (stock-ledger 14.3). */
export const STOCK_MOVEMENT_TYPE = 'stock.movement';
export const STOCK_COVERAGE_TYPE = 'stock.coverage';
/**
 * Every stock record type the search reads a result from, each under the reader's own grants (stock-ledger 14.3): its
 * balances, its origins with their coverage, and the holds and reservations claimed on them. A result is shown only to
 * a reader whose grants of view on each cover its place and brand, so no hold or reservation the reader may not see is
 * left out of its quantities (goods-in 9.4). The screen opens with view on the balances.
 */
export const STOCK_SEARCH_READS = [
  STOCK_BALANCE_TYPE,
  STOCK_RECEIPT_ORIGIN_TYPE,
  STOCK_HOLD_TYPE,
  STOCK_RESERVATION_TYPE,
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
/**
 * The longest text a search names: a style code, a size or a barcode, receiving's cap of a code (`RECEIVING_CAPS`
 * `codeText`; goods-in 4.8), one constant.
 */
export const STOCK_SEARCH_TEXT_CAP = RECEIVING_CAPS.codeText;

/** A condition of stock (stock-ledger 2.2, 14.1), the one list the ledger's `Condition` is. */
export const stockConditionSchema = z.enum(['good', 'damaged', 'wrong', 'unidentified']);
export type StockCondition = z.infer<typeof stockConditionSchema>;

/**
 * A kind of hold placed on goods (stock-ledger 6.1), the one list the ledger's `PlacedHoldKind` is; a count freeze is
 * shown apart, as `frozen`.
 */
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
  limit: pageLimitSchema(STOCK_SEARCH_PAGE_CAP).optional(),
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
 * A product's facts as the catalogue answers them today (goods-in 9.2): its code, style code and size, Unknown while it
 * is; the brand's article number of the style version in force, none while none is; and its identity. Unknown as a
 * whole while the catalogue does not answer the product (PRD-MOD-015).
 */
export const stockProductFactsSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('known'),
    code: z.string(),
    styleCode: z.string(),
    size: maybeKnownTextSchema,
    articleNumber: z.string().nullable(),
    identity: z.array(identityValueSchema),
  }),
  z.strictObject({ kind: z.literal('unknown') }),
]);
export type StockProductFacts = z.infer<typeof stockProductFactsSchema>;

/**
 * The goods of a result (goods-in 9.2): a product, by its SKU, with its facts; goods before PT approval, by their style
 * code, colour and size as counted, a colour or size the count did not state Unknown (PRD-MER-005, DEC-138,
 * PRD-MOD-015); or unidentified goods, which carry no identity.
 */
export const stockProductSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('product'), skuId: idSchema, facts: stockProductFactsSchema }),
  z.strictObject({
    kind: z.literal('counted'),
    styleCode: z.string(),
    colour: maybeKnownTextSchema,
    size: maybeKnownTextSchema,
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
  /** The result's key, opaque, which names it apart from every other and asks for its records (goods-in 9.1). */
  resultKey: stockSearchCursorSchema,
  /** The product's key, opaque, which `elsewhere` names it by. */
  productKey: z.string(),
  product: stockProductSchema,
  /** The product's brand; for goods before PT approval, the brand they were counted under (RR-555). */
  brandId: idSchema,
  siteId: idSchema,
  storeId: idSchema.nullable(),
  businessUnitId: idSchema,
  locationId: idSchema,
  /** The legal entity of its balances: a result's place and product with another legal entity is another result. */
  legalEntityId: idSchema,
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
  legalEntityId: idSchema,
  ...quantityShape,
});
export type StockElsewhere = z.infer<typeof stockElsewhereSchema>;

/** A record named by its code and name, as in force on the date read (goods-in 9.1). */
export const namedRecordSchema = z.strictObject({ id: idSchema, code: z.string(), name: z.string() });

/** The names of the places and brands a page shows, as in force today; one not answered is Unknown. */
export const stockSearchNamesSchema = z.strictObject({
  sites: z.array(namedRecordSchema),
  businessUnits: z.array(namedRecordSchema),
  locations: z.array(namedRecordSchema.extend({ kind: z.string() })),
  brands: z.array(namedRecordSchema),
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

// The records behind a figure (goods-in 9.1 "Every figure drills down to its records: the booking, the GRN, the PT,
// the movements", 9.2, 9.5; PRD-EXC-011; code reviews 8 and 9 of stage 2): for one result of stock search, or one row
// of the stock report, the GRNs its pieces were counted on, the PTs that cover them, and their movements at the
// location, newest first, a page at a time, as the reader may see them.

/** The most movements one page of a figure's records holds, a technical cap (code-house-rules 12.1); Load more reads on. */
export const STOCK_RECORDS_PAGE_CAP = 100;

/** A kind of stock movement (stock-ledger 2.3, 14.2), the list the ledger's `movement_kind` check holds. */
export const stockMovementKindSchema = z.enum([
  'receipt-count',
  'opening-count',
  'location-move',
  'condition-change',
  'identity-resolved',
  'dispatch',
  'arrival-count',
  'failed-delivery-return',
  'sale-issue',
  'customer-return',
  'supplier-return-departure',
  'supplier-handover',
  'supplier-rejection-return',
  'count-difference',
  'disposal',
  'ownership-change',
  'cost-established',
  'cost-adjustment',
  'write-off',
  'nrv-write-down',
  'reversal',
]);
export type StockMovementKind = z.infer<typeof stockMovementKindSchema>;

/** The record a movement came from, by kind: what the screen names it as (goods-in 9.1). */
export const stockRecordSourceSchema = z.enum([
  'grn',
  'recount',
  'scan',
  'pt',
  'pt-reversal',
  'damage-report',
  'damage-reversal',
  'other',
]);
export type StockRecordSource = z.infer<typeof stockRecordSourceSchema>;

/**
 * Which figure's records: a result of stock search, or a row of the stock report, by the key the answer gave it,
 * opaque to the screen.
 */
export const stockRecordsQuerySchema = z.strictObject({
  of: z.enum(['search', 'report']),
  key: stockSearchCursorSchema,
  /** The last movement of the page before. */
  after: idSchema.optional(),
  limit: pageLimitSchema(STOCK_RECORDS_PAGE_CAP).optional(),
});
export type StockRecordsQuery = z.infer<typeof stockRecordsQuerySchema>;

/**
 * A GRN a figure came from, by its number, with the Arrival it was issued from and where it was received: its Site,
 * business unit and receiving location (goods-in 4.5), which its Arrival is named by when it opens (goods-in 9.1).
 */
export const stockRecordGrnSchema = z.strictObject({
  grnId: idSchema,
  number: z.string(),
  arrivalId: idSchema,
  siteId: idSchema,
  businessUnitId: idSchema,
  receivingLocationId: idSchema,
});
export type StockRecordGrn = z.infer<typeof stockRecordGrnSchema>;

/** One movement of the goods at the location: one leg of it, in or out (stock-ledger 2.3). */
export const stockRecordMovementSchema = z.strictObject({
  id: idSchema,
  movementId: idSchema,
  kind: stockMovementKindSchema,
  direction: z.enum(['in', 'out']),
  quantity: z.int().min(1),
  condition: stockConditionSchema,
  businessDate: z.iso.date(),
  occurredAt: z.iso.datetime({ offset: true }),
  source: stockRecordSourceSchema,
  /** The GRN the movement's pieces were counted on, which opens its Arrival, or none the reader may see. */
  grnId: idSchema.nullable(),
});
export type StockRecordMovement = z.infer<typeof stockRecordMovementSchema>;

/** A figure's records, as the reader may see them, read through the read-model gateway with its as-of time. */
export const stockRecordsSchema = z.strictObject({
  asOf: z.iso.datetime({ offset: true }),
  grns: z.array(stockRecordGrnSchema),
  /** The names of the units and receiving locations of the GRNs, as in force today; one not answered is Unknown. */
  places: z.strictObject({ businessUnits: z.array(namedRecordSchema), locations: z.array(namedRecordSchema) }),
  /** The PT revisions covering the pieces, each with the GRN whose PT it is, or none the reader may see. */
  pts: z.array(z.strictObject({ ptRevisionId: idSchema, grnId: idSchema.nullable() })),
  movements: z.array(stockRecordMovementSchema),
  next: idSchema.nullable(),
});
export type StockRecords = z.infer<typeof stockRecordsSchema>;
