import { z } from 'zod';
import { bookingLineStatusSchema, bookingStatusSchema } from './booking.js';
import { businessDateSchema, idSchema, pageLimitSchema, paiseSchema } from './common.js';
import { damageReportStateSchema } from './damage.js';
import { grnLineSchema } from './receiving.js';
import {
  heldByKindSchema,
  namedRecordSchema,
  stockConditionSchema,
  stockCostSchema,
  stockProductSchema,
  stockRecordGrnSchema,
  stockSearchCursorSchema,
} from './stock-search.js';

// The stage 2 reports (goods-in 9.1, 9.3, 9.5, section 11; module-map section 5 `reports`; PRD-BKG-005, PRD-BKG-011,
// PRD-PRO-001, PRD-EXC-009 to PRD-EXC-011, PRD-MOD-015, PRD-PRF-004; S2-F11-T02): booking status, receipt problems,
// supplier fill rate and timeliness, and stock by product, size, location, condition and owner. Each answer carries
// the time it was read and names what it shows; an Unknown value is its stated kind, never zero (PRD-MOD-015). No
// value is set here: every cap is a technical cap the builders chose (goods-in 9.5).

/** The most rows one page of a report holds, a technical cap (code-house-rules 12.1 "Reads"); Load more reads on. */
export const REPORT_PAGE_CAP = 100;
/** The most bookings one export of the booking status holds, a technical cap: past it the export is refused. */
export const BOOKING_STATUS_EXPORT_CAP = 1_000;
/** The most GRN lines one export of the receipt problems holds, a technical cap. */
export const RECEIPT_PROBLEMS_EXPORT_CAP = 10_000;
/** The most rows one export of the stock report holds, a technical cap. */
export const STOCK_REPORT_EXPORT_CAP = 10_000;
/**
 * The most bookings and GRN lines one request of a report reads, those its reader may see and those hidden from them
 * alike, technical caps (goods-in 9.5): the supplier report reads every one to work out its figures and is refused as a
 * whole past either (`reports.report-too-large`), so no figure is shown from part of its records (PRD-PRF-004); an export
 * of the booking status or the receipt problems reads its report to the end within them and is refused as too large
 * past them (`reports.export-too-large`), as past its own cap of rows shown. The reader narrows the report.
 */
export const REPORT_BOOKING_READ_CAP = 10_000;
export const REPORT_LINE_READ_CAP = 100_000;

/** A page size a report is read in: a whole number from 1 to the cap. */
const limitSchema = pageLimitSchema(REPORT_PAGE_CAP).optional();

/**
 * The names of what a report shows, each as in force on the read's business date: places, legal entities, brands,
 * suppliers and seasons by their codes and names, people by their names, and GRNs by their numbers with the Arrival
 * they were issued from and its Site (the drill-down to the record; goods-in 9.1). One not answered is Unknown
 * (PRD-MOD-015).
 */
export const reportNamesSchema = z.strictObject({
  sites: z.array(namedRecordSchema),
  businessUnits: z.array(namedRecordSchema),
  locations: z.array(namedRecordSchema),
  legalEntities: z.array(namedRecordSchema),
  brands: z.array(namedRecordSchema),
  suppliers: z.array(namedRecordSchema),
  seasons: z.array(namedRecordSchema),
  people: z.array(z.strictObject({ userId: idSchema, name: z.string() })),
  grns: z.array(stockRecordGrnSchema),
});
export type ReportNames = z.infer<typeof reportNamesSchema>;

/** A report exported as XLSX, as it is shown (goods-in 9.1): the file's name and its bytes. */
export const reportExportSchema = z.strictObject({ fileName: z.string(), contentBase64: z.string() });
export type ReportExport = z.infer<typeof reportExportSchema>;

// ---------------------------------------------------------------------------------------------------------------------
// Booking status (goods-in 3.6, 3.10, 9.3; PRD-BKG-005).

/** The states of a booking with a version in force: only an approved booking has quantities (goods-in 3.4, 3.10). */
export const bookingInForceStateSchema = z.enum(['Approved', 'Issued', 'Confirmed']);
export type BookingInForceState = z.infer<typeof bookingInForceStateSchema>;

const bookingStatusFilterShape = {
  brandId: idSchema.optional(),
  seasonValueId: idSchema.optional(),
  supplierPartyId: idSchema.optional(),
  destinationSiteId: idSchema.optional(),
  state: bookingInForceStateSchema.optional(),
};
export const bookingStatusFiltersSchema = z.strictObject(bookingStatusFilterShape);
export type BookingStatusFilters = z.infer<typeof bookingStatusFiltersSchema>;
export const bookingStatusQuerySchema = z.strictObject({
  ...bookingStatusFilterShape,
  /** The last booking of the page before. */
  after: idSchema.optional(),
  limit: limitSchema,
});
export type BookingStatusQuery = z.infer<typeof bookingStatusQuerySchema>;

/**
 * One booking with a version in force: its number, state, brand, season, supplier and destination, its status (each
 * line's ordered, delivered, cancelled, outstanding, over-delivered and overdue quantities, as `booking`'s
 * `bookingStatus` answers it), and the GRN lines each line's delivered pieces came from, its receipt links.
 */
export const bookingStatusRowSchema = z.strictObject({
  bookingId: idSchema,
  number: z.string(),
  state: bookingInForceStateSchema,
  brandId: idSchema,
  seasonValueId: idSchema,
  supplierPartyId: idSchema,
  destinationSiteId: idSchema,
  /** The status, each line without its indicative cost, which the report does not show (goods-in 9.1, 9.5). */
  status: bookingStatusSchema.extend({
    lines: z.array(bookingLineStatusSchema.omit({ indicativeCost: true })),
  }),
  deliveries: z.array(
    z.strictObject({ lineKey: idSchema, grnId: idSchema, grnLineId: idSchema, quantity: z.int().min(1) }),
  ),
});
export type BookingStatusRow = z.infer<typeof bookingStatusRowSchema>;

export const bookingStatusReportSchema = z.strictObject({
  asOf: z.iso.datetime({ offset: true }),
  bookings: z.array(bookingStatusRowSchema),
  names: reportNamesSchema,
  next: idSchema.nullable(),
});
export type BookingStatusReport = z.infer<typeof bookingStatusReportSchema>;

// ---------------------------------------------------------------------------------------------------------------------
// Receipt problems (goods-in 4.4, 4.9, 9.3; PRD-REC-006).

const receiptProblemsFilterShape = {
  siteId: idSchema.optional(),
  supplierPartyId: idSchema.optional(),
  brandId: idSchema.optional(),
  /** The first and last business dates of the GRNs, both included. */
  from: businessDateSchema.optional(),
  to: businessDateSchema.optional(),
};
export const receiptProblemsFiltersSchema = z.strictObject(receiptProblemsFilterShape);
export type ReceiptProblemsFilters = z.infer<typeof receiptProblemsFiltersSchema>;
export const receiptProblemsQuerySchema = z.strictObject({
  ...receiptProblemsFilterShape,
  /** The last GRN line of the page before. */
  after: idSchema.optional(),
  limit: limitSchema,
});
export type ReceiptProblemsQuery = z.infer<typeof receiptProblemsQuerySchema>;

/**
 * The damage report the count raised on a line (goods-in 8.5): its number, its state and its latest decision, with who
 * made it and when; Unknown when the reader may not see the report (PRD-MOD-015).
 */
export const countDamageReportSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('shown'),
    damageReportId: idSchema,
    number: z.string(),
    state: damageReportStateSchema,
    decision: z
      .strictObject({
        outcome: z.enum(['Confirmed', 'Rejected']),
        decidedBy: idSchema,
        decidedAt: z.iso.datetime({ offset: true }),
      })
      .nullable(),
  }),
  z.strictObject({ kind: z.literal('unknown') }),
]);
export type CountDamageReport = z.infer<typeof countDamageReportSchema>;

/**
 * One GRN line with a shortage, extra pieces or damage at the count (goods-in 9.3): its GRN, the Arrival it was issued
 * from, its date, Site, supplier and brand; the line with its findings and its held line's decision, who made it and
 * when (goods-in 4.9); and the count's damage report, none when the count found no damage.
 */
export const receiptProblemRowSchema = z.strictObject({
  grnId: idSchema,
  grnNumber: z.string(),
  arrivalId: idSchema,
  businessDate: businessDateSchema,
  siteId: idSchema,
  supplierPartyId: idSchema,
  brandId: idSchema,
  line: grnLineSchema,
  damageReport: countDamageReportSchema.nullable(),
});
export type ReceiptProblemRow = z.infer<typeof receiptProblemRowSchema>;

export const receiptProblemsReportSchema = z.strictObject({
  asOf: z.iso.datetime({ offset: true }),
  rows: z.array(receiptProblemRowSchema),
  names: reportNamesSchema,
  next: idSchema.nullable(),
});
export type ReceiptProblemsReport = z.infer<typeof receiptProblemsReportSchema>;

// ---------------------------------------------------------------------------------------------------------------------
// Supplier fill rate and timeliness (goods-in 9.3, 9.5; PRD-BKG-011, PRD-EXC-009).

export const supplierPerformanceFiltersSchema = z.strictObject({
  supplierPartyId: idSchema.optional(),
  brandId: idSchema.optional(),
  seasonValueId: idSchema.optional(),
});
export type SupplierPerformanceFilters = z.infer<typeof supplierPerformanceFiltersSchema>;

/**
 * A rate, as its two whole numbers, measured only when it has a base and nothing in it is Unknown; otherwise Unknown,
 * never zero (PRD-MOD-015). The screen shows it as a percentage.
 */
export const reportRateSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('measured'), numerator: z.int().min(0), denominator: z.int().min(1) }),
  z.strictObject({ kind: z.literal('unknown') }),
]);
export type ReportRate = z.infer<typeof reportRateSchema>;

/** The season a row is of: a value of the season list, or Unknown for goods delivered to no booking the reader sees. */
export const reportSeasonSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('value'), seasonValueId: idSchema }),
  z.strictObject({ kind: z.literal('unknown') }),
]);
export type ReportSeason = z.infer<typeof reportSeasonSchema>;

/** One supplier, brand and season, with its three metrics, each with the whole numbers it is worked from. */
export const supplierPerformanceRowSchema = z.strictObject({
  supplierPartyId: idSchema,
  brandId: idSchema,
  season: reportSeasonSchema,
  fill: z.strictObject({
    /** The bookings the fill rate is over: their window has ended or their balance is closed. */
    bookings: z.int().min(0),
    ordered: z.int().min(0),
    delivered: z.int().min(0),
    rate: reportRateSchema,
  }),
  timeliness: z.strictObject({
    delivered: z.int().min(0),
    onTime: z.int().min(0),
    late: z.int().min(0),
    /** Pieces whose arrival the reader may not see, so neither on time nor late. */
    unknown: z.int().min(0),
    rate: reportRateSchema,
  }),
  damage: z.strictObject({
    counted: z.int().min(0),
    damaged: z.int().min(0),
    /** Pieces counted on lines whose count's damage report the reader may not see, so neither damaged nor not. */
    unknown: z.int().min(0),
    rate: reportRateSchema,
  }),
  /**
   * The records each figure is worked from, which it drills down to (goods-in 9.1): the bookings of the fill rate, the
   * GRNs whose pieces the on-time rate is over, and the GRNs whose lines the damage rate is over, as the reader may see
   * them.
   */
  records: z.strictObject({
    bookings: z.array(z.strictObject({ bookingId: idSchema, number: z.string() })),
    timedGrnIds: z.array(idSchema),
    countedGrnIds: z.array(idSchema),
  }),
});
export type SupplierPerformanceRow = z.infer<typeof supplierPerformanceRowSchema>;

export const supplierPerformanceReportSchema = z.strictObject({
  asOf: z.iso.datetime({ offset: true }),
  /** The business date the windows are compared with (code-house-rules 9). */
  businessDate: businessDateSchema,
  rows: z.array(supplierPerformanceRowSchema),
  names: reportNamesSchema,
});
export type SupplierPerformanceReport = z.infer<typeof supplierPerformanceReportSchema>;

// ---------------------------------------------------------------------------------------------------------------------
// Stock by product, size, location, condition and owner (goods-in 9.2, 9.3, 9.5; PRD-PRO-001, PRD-ORG-015).

const stockReportFilterShape = {
  brandId: idSchema.optional(),
  siteId: idSchema.optional(),
  businessUnitId: idSchema.optional(),
  locationId: idSchema.optional(),
  condition: stockConditionSchema.optional(),
};
export const stockReportFiltersSchema = z.strictObject(stockReportFilterShape);
export type StockReportFilters = z.infer<typeof stockReportFiltersSchema>;
export const stockReportQuerySchema = z.strictObject({
  ...stockReportFilterShape,
  after: stockSearchCursorSchema.optional(),
  limit: limitSchema,
});
export type StockReportQuery = z.infer<typeof stockReportQuerySchema>;

/**
 * Who owns the goods, from their receipt origin (PRD-ORG-014, PRD-ORG-015; DEC-141): the Organisation, as a legal
 * entity; a supplier; the brand; or Unknown until recorded (PRD-MOD-015).
 */
export const stockOwnerSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.enum(['organisation', 'supplier', 'brand']), partyId: idSchema }),
  z.strictObject({ kind: z.literal('unknown') }),
]);
export type StockOwner = z.infer<typeof stockOwnerSchema>;

/**
 * Who owns goods, by kind, and the list of a report's names its party is named from: the Organisation by its legal
 * entity, a supplier, or a brand (goods-in 9.3; PRD-ORG-015). One map, which the screen and the export both name an
 * owner by (code review 9 of stage 2).
 */
export const STOCK_OWNER_NAMES = { organisation: 'legalEntities', supplier: 'suppliers', brand: 'brands' } as const;

/** The MRP value of the physical pieces: known, or Unknown while any piece has no MRP from its PT (goods-in 9.5). */
export const mrpValueSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('known'), value: paiseSchema }),
  z.strictObject({ kind: z.literal('unknown') }),
]);
export type MrpValue = z.infer<typeof mrpValueSchema>;

/**
 * One row: a product, with its size, at a place, in a condition, of an owner, with the quantities of stock search
 * apart (goods-in 9.2), the MRP value of its physical pieces, their cost only with the cost field class, and the GRNs
 * its pieces were counted on (the drill-down).
 */
export const stockReportRowSchema = z.strictObject({
  /** The row's key, opaque. */
  rowKey: z.string(),
  product: stockProductSchema,
  brandId: idSchema,
  siteId: idSchema,
  storeId: idSchema.nullable(),
  businessUnitId: idSchema,
  locationId: idSchema,
  condition: stockConditionSchema,
  owner: stockOwnerSchema,
  availableAs: z.enum(['sell', 'move']),
  physical: z.int().min(0),
  available: z.int().min(0),
  waiting: z.int().min(0),
  held: z.int().min(0),
  heldByKind: z.array(heldByKindSchema),
  frozen: z.boolean(),
  mrpValue: mrpValueSchema,
  cost: stockCostSchema,
  grnIds: z.array(idSchema),
});
export type StockReportRow = z.infer<typeof stockReportRowSchema>;

export const stockReportSchema = z.strictObject({
  asOf: z.iso.datetime({ offset: true }),
  rows: z.array(stockReportRowSchema),
  names: reportNamesSchema,
  next: stockSearchCursorSchema.nullable(),
});
export type StockReport = z.infer<typeof stockReportSchema>;
