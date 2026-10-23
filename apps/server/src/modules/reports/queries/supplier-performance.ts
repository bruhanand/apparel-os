import {
  ARRIVAL_TYPE,
  BOOKING_TYPE,
  REPORT_BOOKING_READ_CAP,
  REPORT_LINE_READ_CAP,
  type ReportNames,
  type SupplierPerformanceFilters,
  type SupplierPerformanceReport,
  type SupplierPerformanceRow,
} from '@apparel-os/schemas';
import { BOOKING_STATUSES, type BookingStatusEntry } from '../../booking/index.js';
import { RECEIVING_REPORT_LINES } from '../../receiving/index.js';
import { STOCK_DAMAGE_REPORT_STATES } from '../../stock/documents/index.js';
import { REPORT_TOO_LARGE } from '../domain/refusals.js';
import { supplierPerformance, type GrnLineFacts } from '../domain/supplier-performance.js';
import { factsOf, mayViewSome, viewable } from './authority.js';
import { namesOf } from './names.js';
import { readAll, type Reading } from './reading.js';

// The supplier fill rate and timeliness report (goods-in 9.3, 9.5; PRD-BKG-011, PRD-EXC-009, PRD-PRF-004; S2-F11-T02):
// per supplier, brand and season, the fill rate, on-time delivery and damage rate, each worked out by its one
// definition (`supplierPerformance`) from every booking with a version in force and every GRN line the reader may see,
// with the damage report each count raised as the reader may see it, read through the read-model gateway a page at a
// time. It reads at most REPORT_BOOKING_READ_CAP bookings and
// REPORT_LINE_READ_CAP GRN lines, technical caps; past either it is refused as a whole, so no figure is shown from
// part of its records (PRD-PRF-004). A reader needs view on bookings and on Arrivals; each record is shown by its own
// facts (access-and-approvals 5.3).

/** The page the report reads its records in, a technical choice within the caps. */
const READ_PAGE = 1_000;

/** Every booking with a version in force the reader may see, of the filters, read within REPORT_BOOKING_READ_CAP. */
async function allBookings(
  reading: Reading,
  filters: SupplierPerformanceFilters,
): Promise<{ readonly asOf: string; readonly bookings: BookingStatusEntry[] }> {
  let asOf: string | undefined;
  const bookings = await readAll(
    async (after) => {
      const page = await reading.gateway.read(reading.context, BOOKING_STATUSES, {
        ...filters,
        ...(after === undefined ? {} : { after }),
        limit: READ_PAGE,
        today: reading.today,
      });
      asOf ??= page.asOf;
      const shown = await viewable(
        reading.access,
        reading.context,
        reading.actorId,
        BOOKING_TYPE,
        page.answer.bookings.map((each) => ({ siteId: each.destinationSiteId, brandId: each.brandId })),
      );
      return {
        rows: page.answer.bookings.filter((_, at) => shown[at] === true),
        read: page.answer.bookings.length,
        next: page.answer.next,
      };
    },
    { readCap: REPORT_BOOKING_READ_CAP, tooMany: REPORT_TOO_LARGE },
  );
  // The first page is always read, so its time is known.
  return { asOf: asOf ?? reading.context.startedAt.toISOString(), bookings };
}

/**
 * Every GRN line the reader may see, of the supplier and brand, read within REPORT_LINE_READ_CAP, each with the
 * damage report its count raised as the reader may see it: its pieces and state, or Unknown (DEC-117, PRD-MOD-015).
 */
async function allLines(reading: Reading, filters: SupplierPerformanceFilters): Promise<GrnLineFacts[]> {
  await mayViewSome(reading.access, reading.context, reading.actorId, ARRIVAL_TYPE);
  const lines = await readAll(
    async (after) => {
      const page = await reading.gateway.read(reading.context, RECEIVING_REPORT_LINES, {
        ...(filters.supplierPartyId === undefined ? {} : { supplierPartyId: filters.supplierPartyId }),
        ...(filters.brandId === undefined ? {} : { brandId: filters.brandId }),
        ...(after === undefined ? {} : { after }),
        limit: READ_PAGE,
      });
      const shown = await viewable(
        reading.access,
        reading.context,
        reading.actorId,
        ARRIVAL_TYPE,
        page.answer.lines.map(factsOf),
      );
      return {
        rows: page.answer.lines.filter((_, at) => shown[at] === true),
        read: page.answer.lines.length,
        next: page.answer.next,
      };
    },
    { readCap: REPORT_LINE_READ_CAP, tooMany: REPORT_TOO_LARGE },
  );
  const reportIds = lines.flatMap((line) => (line.countDamageReportId === null ? [] : [line.countDamageReportId]));
  const states = new Map(
    (await reading.gateway.read(reading.context, STOCK_DAMAGE_REPORT_STATES, reportIds)).answer.map((each) => [
      each.damageReportId,
      each,
    ]),
  );
  return lines.map((line): GrnLineFacts => {
    const report = line.countDamageReportId === null ? undefined : states.get(line.countDamageReportId);
    return {
      grnLineId: line.grnLineId,
      grnId: line.grnId,
      supplierPartyId: line.supplierPartyId,
      brandId: line.brandId,
      arrivalDate: line.arrivalDate,
      counted: line.counted,
      countDamage:
        line.countDamageReportId === null
          ? { kind: 'none' }
          : report === undefined
            ? { kind: 'unknown' }
            : { kind: 'shown', quantity: report.quantity, state: report.state },
    };
  });
}

/**
 * The rows in the order of their supplier's, brand's and season's names; a name the reader's read does not answer is
 * Unknown and goes after every known name, an Unknown season last (PRD-MOD-015).
 */
function inNameOrder(rows: SupplierPerformanceRow[], names: ReportNames): SupplierPerformanceRow[] {
  const nameIn = (list: readonly { readonly id: string; readonly name: string }[], id: string) =>
    list.find((each) => each.id === id)?.name;
  const known = (a: string | undefined, b: string | undefined): number => {
    if (a === undefined || b === undefined) return a === b ? 0 : a === undefined ? 1 : -1;
    return a.localeCompare(b);
  };
  const seasonName = (row: SupplierPerformanceRow) =>
    row.season.kind === 'value' ? nameIn(names.seasons, row.season.seasonValueId) : undefined;
  return [...rows].sort(
    (a, b) =>
      known(nameIn(names.suppliers, a.supplierPartyId), nameIn(names.suppliers, b.supplierPartyId)) ||
      known(nameIn(names.brands, a.brandId), nameIn(names.brands, b.brandId)) ||
      known(seasonName(a), seasonName(b)),
  );
}

export async function supplierPerformanceReport(
  reading: Reading,
  filters: SupplierPerformanceFilters,
): Promise<SupplierPerformanceReport> {
  const { asOf, bookings } = await allBookings(reading, filters);
  const lines = await allLines(reading, filters);
  const measured = supplierPerformance(bookings, lines, reading.today);
  // With a season named, only its rows: the lines of other seasons' bookings were not read with them.
  const rows =
    filters.seasonValueId === undefined
      ? measured
      : measured.filter((row) => row.season.kind === 'value' && row.season.seasonValueId === filters.seasonValueId);
  const { names } = await namesOf(reading, {
    // The GRNs the figures drill down to, by their numbers and where they were received (goods-in 9.1).
    grnIds: rows.flatMap((each) => [...each.records.timedGrnIds, ...each.records.countedGrnIds]),
    brandIds: rows.map((each) => each.brandId),
    supplierIds: rows.map((each) => each.supplierPartyId),
    seasonIds: rows.flatMap((each) => (each.season.kind === 'value' ? [each.season.seasonValueId] : [])),
  });
  return { asOf, businessDate: reading.today, rows: inNameOrder(rows, names), names };
}
