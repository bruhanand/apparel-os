import {
  ARRIVAL_TYPE,
  BOOKING_TYPE,
  SUPPLIER_REPORT_BOOKING_CAP,
  SUPPLIER_REPORT_LINE_CAP,
  type ReportNames,
  type SupplierPerformanceFilters,
  type SupplierPerformanceReport,
  type SupplierPerformanceRow,
} from '@apparel-os/schemas';
import type { ReadModelGateway, TransactionContext } from '../../../kernel/index.js';
import type { AccessInterface } from '../../access/index.js';
import { BOOKING_STATUSES, type BookingStatusEntry } from '../../booking/index.js';
import { RECEIVING_REPORT_LINES, type ReportGrnLine } from '../../receiving/index.js';
import { REPORT_TOO_LARGE } from '../domain/refusals.js';
import { supplierPerformance } from '../domain/supplier-performance.js';
import { ReadRefused, viewable } from './authority.js';
import { namesOf } from './names.js';

// The supplier fill rate and timeliness report (goods-in 9.3, 9.5; PRD-BKG-011, PRD-EXC-009, PRD-PRF-004; S2-F11-T02):
// per supplier, brand and season, the fill rate, on-time delivery and damage rate, each worked out by its one
// definition (`supplierPerformance`) from every booking with a version in force and every GRN line the reader may see,
// read through the read-model gateway a page at a time. It reads at most SUPPLIER_REPORT_BOOKING_CAP bookings and
// SUPPLIER_REPORT_LINE_CAP GRN lines, technical caps; past either it is refused as a whole, so no figure is shown from
// part of its records (PRD-PRF-004). A reader needs view on bookings and on Arrivals; each record is shown by its own
// facts (access-and-approvals 5.3).

/** The page the report reads its records in, a technical choice within the caps. */
const READ_PAGE = 1_000;

async function allBookings(
  gateway: ReadModelGateway,
  access: AccessInterface,
  context: TransactionContext,
  actorId: string,
  filters: SupplierPerformanceFilters,
  today: string,
): Promise<{ readonly asOf: string; readonly bookings: BookingStatusEntry[] }> {
  const bookings: BookingStatusEntry[] = [];
  let after: string | undefined;
  let asOf: string | undefined;
  let read = 0;
  for (;;) {
    const page = await gateway.read(context, BOOKING_STATUSES, {
      ...filters,
      ...(after === undefined ? {} : { after }),
      limit: READ_PAGE,
      today,
    });
    asOf ??= page.asOf;
    read += page.answer.bookings.length;
    if (read > SUPPLIER_REPORT_BOOKING_CAP) throw new ReadRefused(REPORT_TOO_LARGE);
    const shown = await viewable(
      access,
      context,
      actorId,
      BOOKING_TYPE,
      page.answer.bookings.map((each) => ({ siteId: each.destinationSiteId, brandId: each.brandId })),
    );
    bookings.push(...page.answer.bookings.filter((_, at) => shown[at] === true));
    if (page.answer.next === null) return { asOf, bookings };
    after = page.answer.next;
  }
}

async function allLines(
  gateway: ReadModelGateway,
  access: AccessInterface,
  context: TransactionContext,
  actorId: string,
  filters: SupplierPerformanceFilters,
): Promise<ReportGrnLine[]> {
  const lines: ReportGrnLine[] = [];
  let after: string | undefined;
  let read = 0;
  // A reader with no grant of view on Arrivals at all is refused the report as a whole (7.1 step 3).
  await viewable(access, context, actorId, ARRIVAL_TYPE, []);
  for (;;) {
    const page = await gateway.read(context, RECEIVING_REPORT_LINES, {
      ...(filters.supplierPartyId === undefined ? {} : { supplierPartyId: filters.supplierPartyId }),
      ...(filters.brandId === undefined ? {} : { brandId: filters.brandId }),
      ...(after === undefined ? {} : { after }),
      limit: READ_PAGE,
    });
    read += page.answer.lines.length;
    if (read > SUPPLIER_REPORT_LINE_CAP) throw new ReadRefused(REPORT_TOO_LARGE);
    const shown = await viewable(
      access,
      context,
      actorId,
      ARRIVAL_TYPE,
      page.answer.lines.map((each) => ({
        siteId: each.siteId,
        ...(each.storeId === null ? {} : { storeId: each.storeId }),
        businessUnitId: each.businessUnitId,
        legalEntityId: each.legalEntityId,
        brandId: each.brandId,
      })),
    );
    lines.push(...page.answer.lines.filter((_, at) => shown[at] === true));
    if (page.answer.next === null) return lines;
    after = page.answer.next;
  }
}

/** The rows in the order of their supplier's, brand's and season's names, an Unknown season last. */
function inNameOrder(rows: SupplierPerformanceRow[], names: ReportNames): SupplierPerformanceRow[] {
  const nameIn = (list: readonly { readonly id: string; readonly name: string }[], id: string) =>
    list.find((each) => each.id === id)?.name ?? '';
  const seasonName = (row: SupplierPerformanceRow) =>
    row.season.kind === 'value' ? nameIn(names.seasons, row.season.seasonValueId) : null;
  return [...rows].sort((a, b) => {
    const supplier = nameIn(names.suppliers, a.supplierPartyId).localeCompare(
      nameIn(names.suppliers, b.supplierPartyId),
    );
    if (supplier !== 0) return supplier;
    const brand = nameIn(names.brands, a.brandId).localeCompare(nameIn(names.brands, b.brandId));
    if (brand !== 0) return brand;
    const [first, second] = [seasonName(a), seasonName(b)];
    if (first === null || second === null) return first === second ? 0 : first === null ? 1 : -1;
    return first.localeCompare(second);
  });
}

export async function supplierPerformanceReport(
  gateway: ReadModelGateway,
  access: AccessInterface,
  context: TransactionContext,
  actorId: string,
  filters: SupplierPerformanceFilters,
  today: string,
): Promise<SupplierPerformanceReport> {
  const { asOf, bookings } = await allBookings(gateway, access, context, actorId, filters, today);
  const lines = await allLines(gateway, access, context, actorId, filters);
  const measured = supplierPerformance(bookings, lines, today);
  // With a season named, only its rows: the lines of other seasons' bookings were not read with them.
  const rows =
    filters.seasonValueId === undefined
      ? measured
      : measured.filter((row) => row.season.kind === 'value' && row.season.seasonValueId === filters.seasonValueId);
  const { names } = await namesOf(
    gateway,
    access,
    context,
    {
      brandIds: rows.map((each) => each.brandId),
      supplierIds: rows.map((each) => each.supplierPartyId),
      seasonIds: rows.flatMap((each) => (each.season.kind === 'value' ? [each.season.seasonValueId] : [])),
    },
    today,
  );
  return { asOf, businessDate: today, rows: inNameOrder(rows, names), names };
}
