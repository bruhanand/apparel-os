import { describe, expect, it } from 'vitest';
import {
  changeRefusal,
  committedValue,
  extendableDateOf,
  goodsOfLine,
  lifecycleOf,
  matchReceipt,
  statusOf,
  type StatusInputs,
  type StatusLine,
} from './lifecycle.js';

// The pure rules of an approved booking's lifecycle (goods-in 3.4 to 3.8, 3.10; S2-F01-T04). Every identifier, date,
// price and quantity here is SYNTHETIC.

const KEY_S = '01900000-0000-7000-8000-0000000000a1';
const KEY_M = '01900000-0000-7000-8000-0000000000a2';
const KEY_L = '01900000-0000-7000-8000-0000000000a3';
const KEY_XL = '01900000-0000-7000-8000-0000000000a4';
const VERSION = '01900000-0000-7000-8000-0000000000b1';

function line(lineKey: string, size: string | null, overrides: Partial<StatusLine> = {}): StatusLine {
  return {
    lineKey,
    lineNumber: 1,
    styleCode: 'SYN-ST',
    colour: 'SYN NAVY',
    size,
    quantity: 10,
    indicativeCost: 50_000,
    deliveryDate: null,
    ...overrides,
  };
}

function inputs(overrides: Partial<StatusInputs> = {}): StatusInputs {
  return {
    version: { id: VERSION, versionNumber: 1, windowFrom: '2026-10-01', windowTo: '2026-10-31' },
    lines: [line(KEY_S, 'S'), line(KEY_M, 'M'), line(KEY_L, 'L')],
    delivered: new Map(),
    cancelled: new Map(),
    extensions: [],
    ...overrides,
  };
}

describe('the quantities of a line (goods-in 3.6)', () => {
  it('PRD-BKG-005 PRD-BKG-006 booked 10 each of S, M and L; deliveries of 5, 3 and 2 a size leave 15, 6 and 0', () => {
    const after = (each: number) =>
      statusOf(inputs({ delivered: new Map([KEY_S, KEY_M, KEY_L].map((key) => [key, each])) }), '2026-10-10').totals
        .outstanding;
    expect([after(5), after(8), after(10)]).toEqual([15, 6, 0]);
  });

  it('PRD-BKG-005 PRD-BKG-013 cancelled is kept apart; outstanding never falls below zero; beyond ordered is over-delivered', () => {
    const status = statusOf(
      inputs({
        delivered: new Map([
          [KEY_S, 12],
          [KEY_M, 4],
        ]),
        cancelled: new Map([[KEY_M, 6]]),
      }),
      '2026-10-10',
    );
    expect(status.lines.map((each) => [each.delivered, each.cancelled, each.outstanding, each.overDelivered])).toEqual([
      [12, 0, 0, 2],
      [4, 6, 0, 0],
      [0, 0, 10, 0],
    ]);
    expect(status.totals).toEqual({ ordered: 30, delivered: 16, cancelled: 6, outstanding: 10, overDelivered: 2 });
  });
});

describe('the overdue balance (goods-in 3.8)', () => {
  it('POL-05.06 PRD-BKG-009 a balance is overdue once the window has passed; a line’s own date is shown, not deciding it', () => {
    const lines = [line(KEY_S, 'S', { deliveryDate: '2026-10-05' }), line(KEY_M, 'M', { deliveryDate: '2026-11-05' })];
    // The line's own date passed, the window not: nothing is overdue yet (RR-576).
    expect(
      statusOf(inputs({ lines }), '2026-10-06').lines.map((each) => [each.deliveryDate, each.dueDate, each.overdue]),
    ).toEqual([
      ['2026-10-05', '2026-10-31', false],
      ['2026-11-05', '2026-10-31', false],
    ]);
    // The window passed: every balance is overdue, a line whose own date is later too.
    expect(statusOf(inputs({ lines }), '2026-11-01').lines.map((each) => each.overdue)).toEqual([true, true]);
    // On the due date itself it is not overdue yet; with nothing outstanding it never is.
    expect(statusOf(inputs(), '2026-10-31').lines.some((each) => each.overdue)).toBe(false);
    expect(
      statusOf(
        inputs({
          delivered: new Map([
            [KEY_S, 10],
            [KEY_M, 10],
            [KEY_L, 10],
          ]),
        }),
        '2026-11-01',
      ).lines.some((each) => each.overdue),
    ).toBe(false);
  });

  it('POL-05.07 POL-05.06 an approved extension moves the window’s end, which decides overdue, and the dates of the lines it names', () => {
    const status = statusOf(
      inputs({
        lines: [line(KEY_S, 'S', { deliveryDate: '2026-10-05' }), line(KEY_M, 'M')],
        extensions: [
          { windowTo: '2026-11-15', lines: new Map([[KEY_S, '2026-11-01']]) },
          { windowTo: '2026-11-20', lines: new Map() },
        ],
      }),
      '2026-11-02',
    );
    expect(status.deliveryWindow).toEqual({ from: '2026-10-01', to: '2026-11-20' });
    expect(status.lines.map((each) => [each.deliveryDate, each.dueDate, each.overdue])).toEqual([
      ['2026-11-01', '2026-11-20', false],
      [null, '2026-11-20', false],
    ]);
    // An extension moves a line past its own date where it has one, otherwise past the window's end.
    expect(status.lines.map(extendableDateOf)).toEqual(['2026-11-01', '2026-11-20']);
  });
});

describe('a change after approval (goods-in 3.5, 3.10)', () => {
  const inForce = statusOf(
    inputs({ delivered: new Map([[KEY_S, 4]]), cancelled: new Map([[KEY_M, 3]]) }),
    '2026-10-10',
  );
  const keepS = { lineKey: KEY_S, styleCode: 'syn-st ', colour: 'SYN NAVY', size: 's', quantity: 4 };
  const keepM = { lineKey: KEY_M, styleCode: 'SYN-ST', colour: 'SYN NAVY', size: 'M', quantity: 3 };
  const keep = [keepS, keepM];

  it('PRD-BKG-013 POL-05.04 a change keeps what is delivered and cancelled of each line, whatever case and spaces', () => {
    expect(changeRefusal(inForce, keep)).toBeUndefined();
  });

  it('PRD-BKG-013 a change may not lower a line below what is delivered and cancelled of it, nor leave it out', () => {
    expect(changeRefusal(inForce, [keepS, { ...keepM, quantity: 2 }])).toEqual({
      code: 'booking.line-below-received',
      lineKey: KEY_M,
    });
    expect(changeRefusal(inForce, [keepS])).toEqual({ code: 'booking.line-below-received', lineKey: KEY_M });
  });

  it('PRD-BKG-006 a change may not alter the style code, colour or size of a line with goods linked to it', () => {
    expect(changeRefusal(inForce, [{ ...keepS, size: 'XL' }, keepM])).toEqual({
      code: 'booking.line-received',
      lineKey: KEY_S,
    });
  });

  it('POL-05.02 the value a version commits is its lines’ quantities less what is cancelled, at their cost', () => {
    expect(
      committedValue(
        [
          { lineKey: KEY_S, quantity: 10, indicativeCost: 50_000 },
          { lineKey: KEY_M, quantity: 12, indicativeCost: 40_000 },
          { lineKey: undefined, quantity: 1, indicativeCost: 1_000 },
        ],
        new Map([[KEY_M, 3]]),
      ),
    ).toBe(10 * 50_000 + 9 * 40_000 + 1_000);
  });
});

describe('the state of a booking (POL-05.01; goods-in 3.4)', () => {
  it('POL-05.01 before its first approval a booking is a Draft or awaits approval; then the version in force decides', () => {
    expect(lifecycleOf({ approved: false, issued: false, confirmed: false, newestContent: 'rejection' })).toBe('Draft');
    expect(lifecycleOf({ approved: false, issued: false, confirmed: false, newestContent: 'submission' })).toBe(
      'Awaiting approval',
    );
    expect(lifecycleOf({ approved: true, issued: false, confirmed: false, newestContent: 'draft' })).toBe('Approved');
    expect(lifecycleOf({ approved: true, issued: true, confirmed: false, newestContent: 'submission' })).toBe('Issued');
    expect(lifecycleOf({ approved: true, issued: true, confirmed: true, newestContent: 'approval' })).toBe('Confirmed');
  });
});

describe('a GRN line matched to the booking line it delivers (goods-in 3.7)', () => {
  const lines = [line(KEY_S, 'S'), line(KEY_M, 'M'), { ...line(KEY_L, null), styleCode: 'SYN-OTHER', colour: null }];

  it('PRD-BKG-007 DEC-130 the style code matches, and the colour and size where the booking line gives them', () => {
    expect(matchReceipt(lines, { styleCode: ' syn-st', colour: 'syn navy ', size: 'm' })).toEqual({
      kind: 'matched',
      lineKey: KEY_M,
    });
    // A booking line with no colour or size matches any the GRN line gives.
    expect(matchReceipt(lines, { styleCode: 'SYN-OTHER', colour: 'SYN RED', size: 'XL' })).toEqual({
      kind: 'matched',
      lineKey: KEY_L,
    });
  });

  it('PRD-BKG-008 DEC-130 a GRN line’s goods are a booking line’s by the same comparison, for a later link too', () => {
    expect(goodsOfLine(line(KEY_S, 'S'), { styleCode: 'syn-st ', colour: ' SYN navy', size: 's' })).toBe(true);
    expect(goodsOfLine(line(KEY_S, 'S'), { styleCode: 'SYN-ST', colour: 'SYN NAVY', size: 'M' })).toBe(false);
    expect(goodsOfLine(line(KEY_S, null), { styleCode: 'SYN-ST', colour: 'SYN NAVY', size: 'M' })).toBe(true);
  });

  it('PRD-BKG-007 a line that matches none, or more than one, goes to Booking for review', () => {
    expect(matchReceipt(lines, { styleCode: 'SYN-ST', colour: 'SYN RED', size: 'S' })).toEqual({
      kind: 'review',
      reason: 'no-match',
    });
    // A GRN line with no size matches no booking line that gives one.
    expect(matchReceipt(lines, { styleCode: 'SYN-ST', colour: 'SYN NAVY', size: null })).toEqual({
      kind: 'review',
      reason: 'no-match',
    });
    expect(
      matchReceipt([...lines, line(KEY_XL, null)], { styleCode: 'SYN-ST', colour: 'SYN NAVY', size: 'S' }),
    ).toEqual({ kind: 'review', reason: 'ambiguous' });
  });
});
