import {
  BOOKING_STATUS_EXPORT_CAP,
  RECEIPT_PROBLEMS_EXPORT_CAP,
  REPORT_PAGE_CAP,
  type BookingStatusFilters,
  type ReceiptProblemsFilters,
  type ReceiptProblemsReport,
  type ReportExport,
  type ReportNames,
  type SupplierPerformanceFilters,
} from '@apparel-os/schemas';
import type { ReadModelGateway, TransactionContext } from '../../../kernel/index.js';
import type { AccessInterface } from '../../access/index.js';
import { EXPORT_TOO_LARGE } from '../domain/refusals.js';
import { bookingStatusSheets, receiptProblemsSheets, supplierPerformanceSheets } from '../domain/report-sheets.js';
import { workbookOf } from '../writers/xlsx.js';
import { ReadRefused } from './authority.js';
import { bookingStatusReport } from './booking-status.js';
import { receiptProblemsReport } from './receipt-problems.js';
import { supplierPerformanceReport } from './supplier-performance.js';

// The exports of the booking status, the receipt problems and the supplier report as XLSX, as each is shown (goods-in
// 9.1, 9.5; S2-F11-T02). None carries a restricted field, so each is a read, never a command, and writes no access
// record (code-house-rules 12.1 "Reads"; numbering-and-audit 5.1). Each reads the whole report as its screen reads it,
// up to its technical cap, refused past it (`reports.export-too-large`), so no file holds part of a report as if it
// were all of it (PRD-PRF-004).

export interface Reading {
  readonly gateway: ReadModelGateway;
  readonly access: AccessInterface;
  readonly context: TransactionContext;
  readonly actorId: string;
  /** The business date and the Organisation's timezone (code-house-rules 9). */
  readonly today: string;
  readonly timeZone: string;
}

const fileOf = async (stem: string, today: string, bytes: Promise<Buffer>): Promise<ReportExport> => ({
  fileName: `${stem}-${today}.xlsx`,
  contentBase64: (await bytes).toString('base64'),
});

export async function exportBookingStatus(reading: Reading, filters: BookingStatusFilters): Promise<ReportExport> {
  const report = await bookingStatusReport(reading.gateway, reading.access, reading.context, reading.actorId, {
    filters,
    limit: BOOKING_STATUS_EXPORT_CAP,
    today: reading.today,
  });
  if (report.next !== null) throw new ReadRefused(EXPORT_TOO_LARGE);
  return fileOf('booking-status', reading.today, workbookOf(bookingStatusSheets(report, reading.timeZone)));
}

/** Two pages' names as one, each record once. */
function namesTogether(a: ReportNames, b: ReportNames): ReportNames {
  const merged = <T>(first: readonly T[], second: readonly T[], key: (each: T) => string) => [
    ...first,
    ...second.filter((each) => !first.some((seen) => key(seen) === key(each))),
  ];
  const byId = (each: { readonly id: string }) => each.id;
  return {
    sites: merged(a.sites, b.sites, byId),
    businessUnits: merged(a.businessUnits, b.businessUnits, byId),
    locations: merged(a.locations, b.locations, byId),
    legalEntities: merged(a.legalEntities, b.legalEntities, byId),
    brands: merged(a.brands, b.brands, byId),
    suppliers: merged(a.suppliers, b.suppliers, byId),
    seasons: merged(a.seasons, b.seasons, byId),
    people: merged(a.people, b.people, (each) => each.userId),
    grns: merged(a.grns, b.grns, (each) => each.grnId),
  };
}

export async function exportReceiptProblems(reading: Reading, filters: ReceiptProblemsFilters): Promise<ReportExport> {
  let report: ReceiptProblemsReport | undefined;
  let after: string | undefined;
  for (;;) {
    const page = await receiptProblemsReport(reading.gateway, reading.access, reading.context, reading.actorId, {
      filters,
      ...(after === undefined ? {} : { after }),
      limit: REPORT_PAGE_CAP,
      today: reading.today,
    });
    report =
      report === undefined
        ? page
        : {
            ...page,
            asOf: report.asOf,
            rows: [...report.rows, ...page.rows],
            names: namesTogether(report.names, page.names),
          };
    if (report.rows.length > RECEIPT_PROBLEMS_EXPORT_CAP) throw new ReadRefused(EXPORT_TOO_LARGE);
    if (page.next === null) break;
    after = page.next;
  }
  return fileOf('receipt-problems', reading.today, workbookOf(receiptProblemsSheets(report, reading.timeZone)));
}

export async function exportSupplierPerformance(
  reading: Reading,
  filters: SupplierPerformanceFilters,
): Promise<ReportExport> {
  const report = await supplierPerformanceReport(
    reading.gateway,
    reading.access,
    reading.context,
    reading.actorId,
    filters,
    reading.today,
  );
  return fileOf('supplier-performance', reading.today, workbookOf(supplierPerformanceSheets(report, reading.timeZone)));
}
