import type { BookingLineStatus, Grn, GrnLine, GrnLineBooking } from '@apparel-os/schemas';
import { describe, expect, it } from 'vitest';
import { goodsOf, linkableLines, matchingLines, standingOf } from './booking-links';

// The GRN's lines against bookings on the screen (goods-in 3.7, 4.10; S2-F02-T04). Every identifier, code and quantity
// here is SYNTHETIC.

const ID = (n: number) => `01900000-0000-7000-8000-${String(n).padStart(12, '0')}`;
const BOOKING = ID(900);

function bookingLine(lineKey: string, size: string | null, colour: string | null = 'SYN NAVY'): BookingLineStatus {
  return {
    lineKey,
    lineNumber: 1,
    styleCode: 'SYN-ST',
    colour,
    size,
    indicativeCost: 50_000,
    deliveryDate: null,
    dueDate: '2026-10-31',
    ordered: 10,
    delivered: 0,
    cancelled: 0,
    outstanding: 10,
    overDelivered: 0,
    overdue: false,
  } as BookingLineStatus;
}

function grnLine(id: string, received: number, overrides: Partial<GrnLine> = {}): GrnLine {
  return {
    id,
    lineNumber: 1,
    goods: 'on-invoice',
    styleCode: 'syn-st',
    colour: 'syn navy',
    size: 'S',
    skuId: null,
    description: null,
    invoiceQuantity: received,
    countedQuantity: received,
    extra: null,
    findings: { shortage: 0, extra: 0, received, damaged: 0 },
    damage: null,
    heldLine: null,
    batch: null,
    countedBy: [],
    recounted: null,
    ...overrides,
  };
}

const links = (grnLineId: string, overrides: Partial<GrnLineBooking> = {}): GrnLineBooking => ({
  grnLineId,
  atIssue: null,
  link: null,
  proposal: null,
  ...overrides,
});

describe('the booking lines a GRN line may link to (goods-in 3.7)', () => {
  it('PRD-BKG-008 DEC-130 only lines whose goods the GRN line’s are, ignoring case and spaces, as the server checks', () => {
    const lines = [bookingLine(ID(1), 'S'), bookingLine(ID(2), 'M'), bookingLine(ID(3), null, null)];
    expect(
      matchingLines(lines, { styleCode: ' syn-st', colour: 'syn navy ', size: 's' }).map((each) => each.lineKey),
    ).toEqual([ID(1), ID(3)]);
    expect(matchingLines(lines, { styleCode: 'SYN-ST', colour: null, size: 'M' }).map((each) => each.lineKey)).toEqual([
      ID(3),
    ]);
  });

  it('PRD-BKG-008 unidentified goods are matched on the product Booking named, and not before', () => {
    const unidentified = grnLine(ID(10), 2, { goods: 'unidentified', styleCode: null, colour: null, size: null });
    expect(goodsOf(unidentified)).toBeNull();
    const named = {
      ...unidentified,
      heldLine: {
        id: ID(11),
        kind: 'unidentified' as const,
        quantity: 2,
        state: 'Accepted' as const,
        versionToken: ID(12),
        named: { styleCode: 'SYN-ST', colour: null, size: null, skuId: null },
        requestId: null,
        requestState: null,
        decision: null,
      },
    };
    expect(goodsOf(named)).toEqual({ styleCode: 'SYN-ST', colour: null, size: null });
  });
});

describe('a GRN line’s standing against bookings (goods-in 4.10)', () => {
  it('PRD-BKG-007 POL-05.08 a link comes first, then a proposal waiting, then what the issue did; nothing received links nothing', () => {
    const line = grnLine(ID(20), 3);
    const review = { outcome: 'review' as const, bookingId: BOOKING, reason: 'excess' as const, lineKey: ID(1) };
    expect(standingOf(line, links(line.id, { atIssue: review }))).toEqual({
      kind: 'review',
      bookingId: BOOKING,
      reason: 'excess',
      lineKey: ID(1),
    });
    expect(
      standingOf(
        line,
        links(line.id, { atIssue: review, proposal: { bookingId: BOOKING, proposalId: ID(30), lineKey: ID(1) } }),
      ),
    ).toEqual({ kind: 'proposed', bookingId: BOOKING });
    const link = {
      bookingId: BOOKING,
      lineKey: ID(1),
      kind: 'later' as const,
      proposalId: ID(30),
      linkedBy: ID(40),
      linkedAt: '2026-10-22T10:00:00.000Z',
    };
    expect(standingOf(line, links(line.id, { atIssue: review, link }))).toEqual({
      kind: 'linked',
      bookingId: BOOKING,
      lineKey: ID(1),
      approved: true,
    });
    expect(standingOf(line, undefined)).toEqual({ kind: 'unbooked' });
    expect(standingOf(grnLine(ID(21), 0), undefined)).toEqual({ kind: 'nothing-received' });
  });

  it('PRD-BKG-008 Booking links later the lines sent for review and those received without a booking', () => {
    const lines = [grnLine(ID(50), 1), grnLine(ID(51), 1), grnLine(ID(52), 0), grnLine(ID(53), 1)];
    const grn = {
      lines,
      bookingLinks: [
        links(ID(50)),
        links(ID(51), { atIssue: { outcome: 'review', bookingId: BOOKING, reason: 'no-match', lineKey: null } }),
        links(ID(52)),
        links(ID(53), { atIssue: { outcome: 'linked', bookingId: BOOKING, lineKey: ID(1) } }),
      ],
    } as unknown as Grn;
    expect(linkableLines(grn).map((each) => each.id)).toEqual([ID(50), ID(51)]);
  });
});

describe('a recounted line against bookings (goods-in 4.11; S2-F02-T05)', () => {
  it('PRD-REC-019 a line recounted to no piece received delivers nothing; one recounted from none may be linked', () => {
    const recounted = (received: number) => ({
      countedQuantity: received,
      findings: { shortage: 0, extra: 0, received, damaged: 0 },
    });
    expect(standingOf(grnLine(ID(1), 2, { recounted: recounted(0) }), undefined)).toEqual({
      kind: 'nothing-received',
    });
    expect(standingOf(grnLine(ID(2), 0, { recounted: recounted(1) }), undefined)).toEqual({ kind: 'unbooked' });
  });
});
