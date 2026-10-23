import { paise } from '@apparel-os/domain';
import type { BookingLineStatus, BookingStatus } from '@apparel-os/schemas';
import { describe, expect, it } from 'vitest';
import { supplierPerformance, type BookingFacts, type GrnLineFacts } from './supplier-performance.js';

// The metrics of the supplier report (goods-in 9.3, 9.5; PRD-BKG-011, PRD-EXC-009; S2-F11-T02), on a SYNTHETIC set of
// identifiers and quantities whose figures are worked out by hand in each test.

const S = '01920000-0000-7000-8000-000000000001';
const B = '01920000-0000-7000-8000-000000000002';
const SPRING = '01920000-0000-7000-8000-000000000003';
const TODAY = '2026-11-10';

let counter = 100;
const id = () => {
  counter += 1;
  return `01920000-0000-7000-8000-${String(counter).padStart(12, '0')}`;
};

function line(ordered: number, delivered: number, cancelled: number, dueDate: string, deliveryDate: string | null) {
  const outstanding = Math.max(0, ordered - delivered - cancelled);
  return {
    lineKey: id(),
    lineNumber: 1,
    styleCode: 'SYN-STYLE',
    colour: null,
    size: null,
    indicativeCost: paise(0),
    deliveryDate,
    dueDate,
    ordered,
    delivered,
    cancelled,
    outstanding,
    overDelivered: Math.max(0, delivered - ordered),
    overdue: outstanding > 0 && dueDate < TODAY,
  } satisfies BookingLineStatus;
}

function booking(windowTo: string, lines: readonly BookingLineStatus[]): BookingFacts {
  const sum = (field: 'ordered' | 'delivered' | 'cancelled' | 'outstanding' | 'overDelivered') =>
    lines.reduce((total, each) => total + each[field], 0);
  const status: BookingStatus = {
    versionId: id(),
    versionNumber: 1,
    deliveryWindow: { from: '2026-11-01', to: windowTo },
    lines: [...lines],
    totals: {
      ordered: sum('ordered'),
      delivered: sum('delivered'),
      cancelled: sum('cancelled'),
      outstanding: sum('outstanding'),
      overDelivered: sum('overDelivered'),
    },
  };
  return { supplierPartyId: S, brandId: B, seasonValueId: SPRING, status, deliveries: [] };
}

function delivered(of: BookingFacts, lineAt: number, quantity: number): string {
  const grnLineId = id();
  const key = of.status.lines[lineAt]?.lineKey ?? '';
  (of.deliveries as { lineKey: string; grnLineId: string; quantity: number }[]).push({
    lineKey: key,
    grnLineId,
    quantity,
  });
  return grnLineId;
}

const grnLine = (grnLineId: string, arrivalDate: string, counted: number, damaged?: number): GrnLineFacts => ({
  grnLineId,
  supplierPartyId: S,
  brandId: B,
  arrivalDate,
  counted,
  countDamage: damaged === undefined ? null : { quantity: damaged, state: 'Confirmed' },
});

describe('the supplier report (goods-in 9.3, 9.5)', () => {
  it('PRD-BKG-011 fill rate is delivered over ordered, over bookings whose window has ended or whose balance is closed', () => {
    // Ended: window to 9 Nov, before today; 8 of 10 delivered. Closed: 4 of 4. Open: 1 of 5, window to 30 Nov.
    const ended = booking('2026-11-09', [line(10, 8, 0, '2026-11-09', null)]);
    const closed = booking('2026-11-30', [line(4, 4, 0, '2026-11-30', null)]);
    const open = booking('2026-11-30', [line(5, 1, 0, '2026-11-30', null)]);
    const [row] = supplierPerformance([ended, closed, open], [], TODAY);
    // (8 + 4) / (10 + 4) = 12/14, by hand.
    expect(row?.fill).toEqual({
      bookings: 2,
      ordered: 14,
      delivered: 12,
      rate: { kind: 'measured', numerator: 12, denominator: 14 },
    });
  });

  it('PRD-BKG-011 a balance closed by cancellation counts its ordered pieces, the window not ended', () => {
    const cancelled = booking('2026-11-30', [line(6, 2, 4, '2026-11-30', null)]);
    const [row] = supplierPerformance([cancelled], [], TODAY);
    expect(row?.fill).toEqual({
      bookings: 1,
      ordered: 6,
      delivered: 2,
      rate: { kind: 'measured', numerator: 2, denominator: 6 },
    });
  });

  it('PRD-MOD-015 a fill rate with no booking ended or closed is Unknown, never zero', () => {
    const [row] = supplierPerformance([booking('2026-11-30', [line(5, 1, 0, '2026-11-30', null)])], [], TODAY);
    expect(row?.fill).toEqual({ bookings: 0, ordered: 0, delivered: 0, rate: { kind: 'unknown' } });
  });

  it('PRD-BKG-011 on time is the delivered pieces that arrived by the line’s date or the window’s end, whichever is later', () => {
    // Window to 9 Nov; the second line's own date is 12 Nov.
    const of = booking('2026-11-09', [line(10, 9, 0, '2026-11-09', null), line(3, 3, 0, '2026-11-09', '2026-11-12')]);
    const early = delivered(of, 0, 4); // arrived 2 Nov: on time
    const lastDay = delivered(of, 0, 2); // arrived 9 Nov, the window's last day: on time
    const late = delivered(of, 0, 3); // arrived 10 Nov: late
    const byLineDate = delivered(of, 1, 3); // arrived 11 Nov, by the line's own 12 Nov: on time
    const [row] = supplierPerformance(
      [of],
      [
        grnLine(early, '2026-11-02', 4),
        grnLine(lastDay, '2026-11-09', 2),
        grnLine(late, '2026-11-10', 3),
        grnLine(byLineDate, '2026-11-11', 3),
      ],
      TODAY,
    );
    // On time 4 + 2 + 3 = 9 of 12 delivered; late 3, by hand.
    expect(row?.timeliness).toEqual({
      delivered: 12,
      onTime: 9,
      late: 3,
      unknown: 0,
      rate: { kind: 'measured', numerator: 9, denominator: 12 },
    });
  });

  it('PRD-MOD-015 a delivery whose arrival the reader may not see makes the on-time rate Unknown, its pieces counted apart', () => {
    const of = booking('2026-11-09', [line(10, 5, 0, '2026-11-09', null)]);
    const seen = delivered(of, 0, 2);
    delivered(of, 0, 3);
    const [row] = supplierPerformance([of], [grnLine(seen, '2026-11-02', 2)], TODAY);
    expect(row?.timeliness).toEqual({ delivered: 5, onTime: 2, late: 0, unknown: 3, rate: { kind: 'unknown' } });
  });

  it('PRD-BKG-011 damage rate is the pieces under a confirmed damage report at the count over the pieces counted, by the season the line delivered to', () => {
    const of = booking('2026-11-30', [line(10, 6, 0, '2026-11-30', null)]);
    const linked = delivered(of, 0, 6);
    const unbooked = id();
    const submitted: GrnLineFacts = {
      ...grnLine(id(), '2026-11-05', 4),
      countDamage: { quantity: 2, state: 'Submitted' },
    };
    const rows = supplierPerformance(
      [of],
      [grnLine(linked, '2026-11-05', 6, 1), grnLine(unbooked, '2026-11-05', 3), submitted],
      TODAY,
    );
    // The booked season: 1 confirmed of 6 counted. The lines delivered to no booking go under an Unknown season:
    // 3 + 4 counted, none confirmed (the report of 2 waits for its decision).
    expect(rows.find((each) => each.season.kind === 'value')?.damage).toEqual({
      counted: 6,
      damaged: 1,
      rate: { kind: 'measured', numerator: 1, denominator: 6 },
    });
    expect(rows.find((each) => each.season.kind === 'unknown')).toMatchObject({
      supplierPartyId: S,
      brandId: B,
      fill: { bookings: 0, rate: { kind: 'unknown' } },
      timeliness: { delivered: 0, rate: { kind: 'unknown' } },
      damage: { counted: 7, damaged: 0, rate: { kind: 'measured', numerator: 0, denominator: 7 } },
    });
  });
});
