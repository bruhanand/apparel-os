import type { BookingStatus } from '@apparel-os/schemas';
import { describe, expect, it } from 'vitest';
import { laterLinks, receiptsAtIssue, type InForce } from './receipts.js';

// The pure rules of receiving against a booking (goods-in 3.7, 4.10; PRD-BKG-007, PRD-BKG-008; POL-05.08; DEC-130;
// S2-F02-T04). Every identifier, date and quantity here is SYNTHETIC.

const KEY_S = '01900000-0000-7000-8000-0000000000a1';
const KEY_M = '01900000-0000-7000-8000-0000000000a2';
const KEY_STYLE = '01900000-0000-7000-8000-0000000000a3';
const SITE = '01900000-0000-7000-8000-0000000000c1';
const OTHER_SITE = '01900000-0000-7000-8000-0000000000c2';
const SUPPLIER = '01900000-0000-7000-8000-0000000000d1';
const OTHER_SUPPLIER = '01900000-0000-7000-8000-0000000000d2';

function statusLine(lineKey: string, size: string | null, ordered: number, delivered = 0, styleCode = 'SYN-ST') {
  return {
    lineKey,
    lineNumber: 1,
    styleCode,
    colour: null,
    size,
    indicativeCost: 50_000,
    deliveryDate: null,
    dueDate: '2026-10-31',
    ordered,
    delivered,
    cancelled: 0,
    outstanding: Math.max(0, ordered - delivered),
    overDelivered: Math.max(0, delivered - ordered),
    overdue: false,
  } as BookingStatus['lines'][number];
}

function inForce(lines: BookingStatus['lines'], windowTo = '2026-10-31'): InForce {
  return {
    destinationSiteId: SITE,
    supplierPartyId: SUPPLIER,
    status: {
      versionId: '01900000-0000-7000-8000-0000000000b1',
      versionNumber: 1,
      deliveryWindow: { from: '2026-10-01', to: windowTo },
      lines,
      totals: { ordered: 0, delivered: 0, cancelled: 0, outstanding: 0, overDelivered: 0 },
    },
  };
}

const delivery = { siteId: SITE, supplierPartyId: SUPPLIER, arrivalDate: '2026-10-20' };
const goods = (size: string | null) => ({ styleCode: 'syn-st ', colour: 'SYN NAVY', size });

describe('a GRN line at its GRN’s issue (goods-in 3.7)', () => {
  it('PRD-BKG-007 DEC-130 each line links to the one booking line it matches, within the window and the outstanding', () => {
    expect(
      receiptsAtIssue(inForce([statusLine(KEY_S, 'S', 10), statusLine(KEY_M, 'M', 10)]), delivery, [
        { goods: goods('s'), quantity: 5 },
        { goods: goods('M '), quantity: 10 },
      ]),
    ).toEqual([
      { kind: 'link', lineKey: KEY_S },
      { kind: 'link', lineKey: KEY_M },
    ]);
  });

  it('PRD-BKG-007 a line matching none or more than one, or with no identity, goes to Booking for review', () => {
    const styleLevel = statusLine(KEY_STYLE, null, 10);
    expect(
      receiptsAtIssue(inForce([statusLine(KEY_S, 'S', 10), styleLevel]), delivery, [
        { goods: goods('XL'), quantity: 1 },
        { goods: goods('S'), quantity: 1 },
        { goods: null, quantity: 1 },
      ]),
    ).toEqual([
      // A line at style level gives no size, so XL matches it alone; S matches both lines.
      { kind: 'link', lineKey: KEY_STYLE },
      { kind: 'review', reason: 'ambiguous', lineKey: null },
      { kind: 'review', reason: 'no-match', lineKey: null },
    ]);
  });

  it('PRD-BKG-007 every line goes to review at another Site, of another supplier, or against a booking not approved', () => {
    const lines = [statusLine(KEY_S, 'S', 10)];
    const one = [{ goods: goods('S'), quantity: 1 }];
    expect(receiptsAtIssue(inForce(lines), { ...delivery, siteId: OTHER_SITE }, one)).toEqual([
      { kind: 'review', reason: 'other-site', lineKey: null },
    ]);
    expect(receiptsAtIssue(inForce(lines), { ...delivery, supplierPartyId: OTHER_SUPPLIER }, one)).toEqual([
      { kind: 'review', reason: 'other-supplier', lineKey: null },
    ]);
    expect(receiptsAtIssue(undefined, delivery, one)).toEqual([
      { kind: 'review', reason: 'not-approved', lineKey: null },
    ]);
  });

  it('POL-05.08 a line arriving after the window, as extended, goes to review naming the line it matches', () => {
    const lines = [statusLine(KEY_S, 'S', 10)];
    // The window's last day is still within it; an early arrival is not late (goods-in 4.10).
    for (const arrivalDate of ['2026-10-31', '2026-09-01']) {
      expect(
        receiptsAtIssue(inForce(lines), { ...delivery, arrivalDate }, [{ goods: goods('S'), quantity: 1 }]),
      ).toEqual([{ kind: 'link', lineKey: KEY_S }]);
    }
    expect(
      receiptsAtIssue(inForce(lines), { ...delivery, arrivalDate: '2026-11-01' }, [{ goods: goods('S'), quantity: 1 }]),
    ).toEqual([{ kind: 'review', reason: 'late', lineKey: KEY_S }]);
  });

  it('POL-05.08 a line beyond the booking line’s outstanding goes to review whole; earlier lines of the GRN count first', () => {
    const styleLevel = statusLine(KEY_STYLE, null, 10, 4);
    expect(
      receiptsAtIssue(inForce([styleLevel]), delivery, [
        { goods: goods('S'), quantity: 4 },
        { goods: goods('M'), quantity: 3 },
        { goods: goods('L'), quantity: 2 },
      ]),
    ).toEqual([
      // 6 outstanding: 4 link, leaving 2; 3 is beyond them, so the whole line goes to review; 2 links.
      { kind: 'link', lineKey: KEY_STYLE },
      { kind: 'review', reason: 'excess', lineKey: KEY_STYLE },
      { kind: 'link', lineKey: KEY_STYLE },
    ]);
  });
});

describe('Booking’s later link (goods-in 3.7; PRD-BKG-008)', () => {
  it('PRD-BKG-008 POL-05.08 a line within the window and the outstanding links; a late or excess one needs approval', () => {
    const answer = laterLinks(inForce([statusLine(KEY_S, 'S', 10, 6), statusLine(KEY_M, 'M', 10)]), [
      { lineKey: KEY_S, goods: goods('S'), quantity: 3, arrivalDate: '2026-10-20' },
      { lineKey: KEY_S, goods: goods('S'), quantity: 3, arrivalDate: '2026-10-20' },
      { lineKey: KEY_M, goods: goods('M'), quantity: 1, arrivalDate: '2026-11-02' },
    ]);
    expect(answer).toEqual({
      kind: 'classified',
      receipts: [
        { kind: 'link' },
        // 4 outstanding, 3 linked just before: 3 more is beyond the 1 left.
        { kind: 'approval', late: false, excess: true },
        { kind: 'approval', late: true, excess: false },
      ],
    });
  });

  it('PRD-BKG-008 DEC-130 a line not of the version in force, or whose goods are not the line’s, is refused', () => {
    const lines = [statusLine(KEY_S, 'S', 10)];
    expect(
      laterLinks(inForce(lines), [{ lineKey: KEY_M, goods: goods('M'), quantity: 1, arrivalDate: '2026-10-20' }]),
    ).toEqual({ kind: 'refused', code: 'booking.line-not-found', lineKey: KEY_M });
    expect(
      laterLinks(inForce(lines), [{ lineKey: KEY_S, goods: goods('M'), quantity: 1, arrivalDate: '2026-10-20' }]),
    ).toEqual({ kind: 'refused', code: 'booking.goods-not-of-line', lineKey: KEY_S });
  });
});
