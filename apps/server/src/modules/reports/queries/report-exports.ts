import {
  BOOKING_STATUS_EXPORT_CAP,
  RECEIPT_PROBLEMS_EXPORT_CAP,
  REPORT_BOOKING_READ_CAP,
  REPORT_LINE_READ_CAP,
  type BookingStatusFilters,
  type BookingStatusReport,
  type ReceiptProblemsFilters,
  type ReceiptProblemsReport,
  type ReportExport,
  type ReportNames,
  type SupplierPerformanceFilters,
} from '@apparel-os/schemas';
import { CommandDefect } from '../../../kernel/index.js';
import { EXPORT_TOO_LARGE } from '../domain/refusals.js';
import { bookingStatusSheets, receiptProblemsSheets, supplierPerformanceSheets } from '../domain/report-sheets.js';
import { workbookOf } from '../writers/xlsx.js';
import { bookingStatusReport } from './booking-status.js';
import { readAll, type Reading } from './reading.js';
import { receiptProblemsReport } from './receipt-problems.js';
import { supplierPerformanceReport } from './supplier-performance.js';

// The exports of the booking status, the receipt problems and the supplier report as XLSX, as each is shown (goods-in
// 9.1, 9.5; S2-F11-T02). None carries a restricted field, so each is a read, never a command, and writes no access
// record (code-house-rules 12.1 "Reads"; numbering-and-audit 5.1). Each reads the whole report as its screen reads it,
// a page at a time, by one rule (`readAll`; code review 9 of stage 2): at most its cap of rows shown, and at most the
// reports' cap of records read, shown or hidden, refused past either (`reports.export-too-large`), so no file holds
// part of a report as if it were all of it (PRD-PRF-004) and hidden records are never read without a limit.

/** The page an export reads its report in, a technical choice within the caps, as the supplier report reads. */
const READ_PAGE = 1_000;

const fileOf = async (stem: string, today: string, bytes: Promise<Buffer>): Promise<ReportExport> => ({
  fileName: `${stem}-${today}.xlsx`,
  contentBase64: (await bytes).toString('base64'),
});

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

/** A report read to its end by `readAll`, its pages' rows and names as one, read at the first page's time. */
async function wholeReport<Report extends { readonly asOf: string; readonly names: ReportNames }, Row>(
  readPage: (after: string | undefined) => Promise<{ readonly report: Report; readonly read: number }>,
  rowsOf: (report: Report) => readonly Row[],
  nextOf: (report: Report) => string | null,
  caps: { readonly readCap: number; readonly shownCap: number },
): Promise<{ readonly first: Report; readonly rows: Row[]; readonly names: ReportNames }> {
  let first: Report | undefined;
  let names: ReportNames | undefined;
  const rows = await readAll(
    async (after) => {
      const { report, read } = await readPage(after);
      first ??= report;
      names = names === undefined ? report.names : namesTogether(names, report.names);
      return { rows: rowsOf(report), read, next: nextOf(report) };
    },
    { ...caps, tooMany: EXPORT_TOO_LARGE },
  );
  if (first === undefined || names === undefined) throw new CommandDefect('A report read no page');
  return { first, rows, names };
}

export async function exportBookingStatus(reading: Reading, filters: BookingStatusFilters): Promise<ReportExport> {
  const whole = await wholeReport(
    (after) => bookingStatusReport(reading, { filters, ...(after === undefined ? {} : { after }), limit: READ_PAGE }),
    (report: BookingStatusReport) => report.bookings,
    (report) => report.next,
    { readCap: REPORT_BOOKING_READ_CAP, shownCap: BOOKING_STATUS_EXPORT_CAP },
  );
  const report: BookingStatusReport = { ...whole.first, bookings: whole.rows, names: whole.names, next: null };
  return fileOf('booking-status', reading.today, workbookOf(bookingStatusSheets(report, reading.timeZone)));
}

export async function exportReceiptProblems(reading: Reading, filters: ReceiptProblemsFilters): Promise<ReportExport> {
  const whole = await wholeReport(
    (after) => receiptProblemsReport(reading, { filters, ...(after === undefined ? {} : { after }), limit: READ_PAGE }),
    (report: ReceiptProblemsReport) => report.rows,
    (report) => report.next,
    { readCap: REPORT_LINE_READ_CAP, shownCap: RECEIPT_PROBLEMS_EXPORT_CAP },
  );
  const report: ReceiptProblemsReport = { ...whole.first, rows: whole.rows, names: whole.names, next: null };
  return fileOf('receipt-problems', reading.today, workbookOf(receiptProblemsSheets(report, reading.timeZone)));
}

export async function exportSupplierPerformance(
  reading: Reading,
  filters: SupplierPerformanceFilters,
): Promise<ReportExport> {
  const report = await supplierPerformanceReport(reading, filters);
  return fileOf('supplier-performance', reading.today, workbookOf(supplierPerformanceSheets(report, reading.timeZone)));
}
