import type { NamedGoods, Place } from '../../ledger/index.js';

// The goods and place a report names, as its decision and a reversal send them to the ledger (goods-in 8.2;
// stock-ledger 13.15). Plain functions over the report's fields (code-house-rules 2).

interface ReportGoods {
  readonly siteId: string;
  readonly businessUnitId: string;
  readonly locationId: string;
  readonly skuId: string | null;
  readonly receiptOriginId: string | null;
  readonly quantity: number;
}

/** Where the report's goods are (structure-and-masters 3.5). */
export function placeOfReport(report: ReportGoods): Place {
  return { siteId: report.siteId, businessUnitId: report.businessUnitId, locationId: report.locationId };
}

/**
 * The report's goods: of a SKU, from the GRN line's receipt origin where it names one, else oldest first
 * (PRD-STK-013); or of a product not yet set up, by their origin (13.15). A report names one or the other.
 */
export function goodsOf(report: ReportGoods): NamedGoods {
  if (report.skuId !== null) {
    return report.receiptOriginId === null
      ? { skuId: report.skuId, quantity: report.quantity }
      : { skuId: report.skuId, quantity: report.quantity, receiptOriginId: report.receiptOriginId };
  }
  if (report.receiptOriginId === null) throw new Error('A report of goods of Unknown SKU names no receipt origin');
  return { skuId: null, receiptOriginId: report.receiptOriginId, quantity: report.quantity };
}
