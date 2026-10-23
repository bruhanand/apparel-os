import type {
  BookingStatus,
  DamageReportState,
  ReportRate,
  ReportSeason,
  SupplierPerformanceRow,
} from '@apparel-os/schemas';

// The metrics of the supplier report, one definition each (goods-in 9.3, 9.5; PRD-BKG-011, PRD-EXC-009, PRD-MOD-015;
// S2-F11-T02), per supplier, brand and season, worked out from the bookings and GRN lines the reader may see. Pure: no
// database, no clock (code-house-rules 2). Each is a **Design choice** within goods-in 9.3's definition, listed for
// the product owner's confirmation (goods-in 9.5).
//
// - **Fill rate**: delivered pieces ÷ ordered pieces of the version in force, over the bookings whose window, as
//   extended, ended before the business date, or whose balance is closed, nothing outstanding on any line. Cancelled
//   pieces stay ordered; pieces delivered beyond ordered stay delivered (goods-in 3.6).
// - **On time**: delivered pieces, by each receipt link, that arrived (the business date of the Arrival's arrival
//   time) on or before the later of the line's own delivery date, as extended, and the booking's window end, as
//   extended ÷ delivered pieces. An arrival before the window's start is on time, never late (goods-in 3.7).
// - **Damage rate**: pieces under a confirmed damage report at the count ÷ pieces counted now, a recount's count where
//   one is approved (goods-in 4.11), over the GRN lines of the supplier and brand; a line is of the season of the
//   booking it delivered to, and of an Unknown season when it delivered to none the reader sees.
//
// A rate is measured only with a base and nothing Unknown in it; otherwise it is Unknown, never zero.

/** A booking with a version in force, as the report reads it (goods-in 3.10). */
export interface BookingFacts {
  readonly supplierPartyId: string;
  readonly brandId: string;
  readonly seasonValueId: string;
  readonly status: BookingStatus;
  /** Each receipt link: the line it delivered to, by key, the GRN line and its pieces. */
  readonly deliveries: readonly { readonly lineKey: string; readonly grnLineId: string; readonly quantity: number }[];
}

/** A GRN line, as the report reads it. */
export interface GrnLineFacts {
  readonly grnLineId: string;
  readonly supplierPartyId: string;
  readonly brandId: string;
  /** The business date the goods arrived. */
  readonly arrivalDate: string;
  /** The pieces counted on the line now. */
  readonly counted: number;
  /** The damage report the count raised on the line, with its pieces and state; none when the count found none. */
  readonly countDamage: { readonly quantity: number; readonly state: DamageReportState } | null;
}

const later = (a: string, b: string): string => (a > b ? a : b);

/** A rate of two whole numbers: measured with a base and nothing Unknown, Unknown otherwise (PRD-MOD-015). */
export function rateOf(numerator: number, denominator: number, unknown = 0): ReportRate {
  return denominator > 0 && unknown === 0 ? { kind: 'measured', numerator, denominator } : { kind: 'unknown' };
}

/** Whether a booking is in the fill rate's base: its window as extended ended before the date, or nothing outstanding. */
export const inFillBase = (status: BookingStatus, today: string): boolean =>
  status.deliveryWindow.to < today || status.totals.outstanding === 0;

interface Sums {
  readonly supplierPartyId: string;
  readonly brandId: string;
  readonly season: ReportSeason;
  bookings: number;
  ordered: number;
  delivered: number;
  onTime: number;
  late: number;
  unknown: number;
  timed: number;
  counted: number;
  damaged: number;
}

/** The rows of the supplier report: one per supplier, brand and season with something to measure. */
export function supplierPerformance(
  bookings: readonly BookingFacts[],
  lines: readonly GrnLineFacts[],
  today: string,
): SupplierPerformanceRow[] {
  const groups = new Map<string, Sums>();
  const group = (supplierPartyId: string, brandId: string, season: ReportSeason): Sums => {
    const key = JSON.stringify([supplierPartyId, brandId, season.kind === 'value' ? season.seasonValueId : null]);
    const found = groups.get(key);
    if (found !== undefined) return found;
    const made: Sums = {
      supplierPartyId,
      brandId,
      season,
      bookings: 0,
      ordered: 0,
      delivered: 0,
      onTime: 0,
      late: 0,
      unknown: 0,
      timed: 0,
      counted: 0,
      damaged: 0,
    };
    groups.set(key, made);
    return made;
  };
  const arrivals = new Map(lines.map((line) => [line.grnLineId, line.arrivalDate]));
  /** The season each GRN line delivered to, by the booking its receipt link is of. */
  const seasonOfLine = new Map<string, string>();
  for (const booking of bookings) {
    const season: ReportSeason = { kind: 'value', seasonValueId: booking.seasonValueId };
    const sums = group(booking.supplierPartyId, booking.brandId, season);
    if (inFillBase(booking.status, today)) {
      sums.bookings += 1;
      sums.ordered += booking.status.totals.ordered;
      sums.delivered += booking.status.totals.delivered;
    }
    for (const delivery of booking.deliveries) {
      seasonOfLine.set(delivery.grnLineId, booking.seasonValueId);
      sums.timed += delivery.quantity;
      const line = booking.status.lines.find((each) => each.lineKey === delivery.lineKey);
      const arrived = arrivals.get(delivery.grnLineId);
      if (line === undefined || arrived === undefined) {
        sums.unknown += delivery.quantity;
        continue;
      }
      const due = line.deliveryDate === null ? line.dueDate : later(line.deliveryDate, line.dueDate);
      if (arrived <= due) sums.onTime += delivery.quantity;
      else sums.late += delivery.quantity;
    }
  }
  for (const line of lines) {
    const seasonValueId = seasonOfLine.get(line.grnLineId);
    const sums = group(
      line.supplierPartyId,
      line.brandId,
      seasonValueId === undefined ? { kind: 'unknown' } : { kind: 'value', seasonValueId },
    );
    sums.counted += line.counted;
    if (line.countDamage?.state === 'Confirmed') sums.damaged += line.countDamage.quantity;
  }
  return [...groups.values()].map((sums) => ({
    supplierPartyId: sums.supplierPartyId,
    brandId: sums.brandId,
    season: sums.season,
    fill: {
      bookings: sums.bookings,
      ordered: sums.ordered,
      delivered: sums.delivered,
      rate: rateOf(sums.delivered, sums.ordered),
    },
    timeliness: {
      delivered: sums.timed,
      onTime: sums.onTime,
      late: sums.late,
      unknown: sums.unknown,
      rate: rateOf(sums.onTime, sums.timed, sums.unknown),
    },
    damage: { counted: sums.counted, damaged: sums.damaged, rate: rateOf(sums.damaged, sums.counted) },
  }));
}
