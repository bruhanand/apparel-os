import { describe, expect, it } from 'vitest';
import { currentLines, grnBlockers, lineCounting, newestEntry, type CountEntryFacts } from './lines.js';

// The count as it stands (goods-in 4.3, 4.5; DEC-133; S2-F02-T02). Every identifier and person here is SYNTHETIC.

const ANNA = '01900000-0000-7000-8000-00000000a001';
const BALU = '01900000-0000-7000-8000-00000000b001';
const SIZE_S = { attributeId: 'size-list', valueId: 'size-s', markedAttributeVersionId: 'marking', code: 'SYN-S' };

let tick = 0;
function entry(id: string, lineId: string, replaces: string | null, overrides: Partial<CountEntryFacts> = {}) {
  tick += 1;
  const base: CountEntryFacts = {
    id,
    lineId,
    replacesEntryId: replaces,
    removed: false,
    goods: 'on-invoice',
    styleCode: 'SYN-STYLE',
    colour: null,
    size: SIZE_S,
    skuId: null,
    description: null,
    invoiceQuantity: 3,
    countedQuantity: 3,
    extra: null,
    damage: null,
    batch: null,
    enteredByUserId: ANNA,
    recordedAt: new Date(Date.UTC(2026, 9, 21, 10, 0, tick)),
  };
  return { ...base, ...overrides };
}

describe('the count as it stands (goods-in 4.3)', () => {
  it('PRD-MOD-011 a line is its newest entry; who counted it is everyone who saved one, once each, in order (goods-in 4.3)', () => {
    const entries = [
      entry('e1', 'e1', null, { countedQuantity: 1 }),
      entry('e2', 'e1', 'e1', { countedQuantity: 2, enteredByUserId: BALU }),
      entry('e3', 'e1', 'e2', { countedQuantity: 3 }),
    ];
    expect(newestEntry(entries, 'e1')?.id).toBe('e3');
    const lines = currentLines(entries);
    expect(lines.map((line) => [line.lineId, line.entry.id, line.entry.countedQuantity])).toEqual([['e1', 'e3', 3]]);
    expect(lines[0]?.countedBy).toEqual([ANNA, BALU]);
  });

  it('PRD-UXP-003 lines keep the order they were first saved in, and a removed line is left out (goods-in 4.3)', () => {
    const entries = [
      entry('a1', 'a1', null, { styleCode: 'SYN-A' }),
      entry('b1', 'b1', null, { styleCode: 'SYN-B' }),
      entry('c1', 'c1', null, { styleCode: 'SYN-C' }),
      entry('a2', 'a1', 'a1', { styleCode: 'SYN-A', countedQuantity: 9 }),
      entry('b2', 'b1', 'b1', { removed: true }),
    ];
    expect(currentLines(entries).map((line) => [line.lineId, line.entry.id])).toEqual([
      ['a1', 'a2'],
      ['c1', 'c1'],
    ]);
  });
});

describe('what stops a GRN (goods-in 4.5; DEC-133)', () => {
  it('DEC-133 no invoice, then no line, then a line whose extra pieces are not recorded, each named', () => {
    const clean = currentLines([entry('l1', 'l1', null)]);
    expect(grnBlockers(0, clean)).toEqual({ code: 'receiving.invoice-required', missing: [{ kind: 'invoice' }] });
    expect(grnBlockers(1, [])).toEqual({ code: 'receiving.no-lines', missing: [{ kind: 'count-line' }] });
    // A shortage, and excess recorded as received or not, stop nothing: they are findings (goods-in 4.4; S2-F02-T03).
    const short = currentLines([entry('l2', 'l2', null, { invoiceQuantity: 10, countedQuantity: 8 })]);
    const excess = currentLines([
      entry('l3', 'l3', null, { styleCode: 'SYN-X', invoiceQuantity: 2, countedQuantity: 3, extra: 'received' }),
    ]);
    expect(grnBlockers(1, [...clean, ...short, ...excess])).toBeUndefined();
    // A line saved before the findings were built may have extra pieces with nothing recorded of them.
    const unrecorded = currentLines([entry('l4', 'l4', null, { invoiceQuantity: 2, countedQuantity: 5 })]);
    expect(grnBlockers(1, [...clean, ...unrecorded])).toEqual({
      code: 'receiving.extra-not-recorded',
      missing: [{ kind: 'count-line', lineId: 'l4' }],
    });
  });

  it('PRD-MER-005 a line of goods on the invoice or of wrong goods with no size stops the GRN, naming it (RR-586)', () => {
    const sized = currentLines([entry('s1', 's1', null)]);
    const unsized = currentLines([
      entry('s2', 's2', null, { styleCode: 'SYN-A', size: null }),
      entry('s3', 's3', null, {
        styleCode: 'SYN-B',
        goods: 'wrong',
        skuId: 'sku-b',
        size: null,
        invoiceQuantity: 0,
        extra: 'received',
      }),
    ]);
    expect(grnBlockers(1, [...sized, ...unsized])).toEqual({
      code: 'receiving.size-required',
      missing: [
        { kind: 'count-line', lineId: 's2' },
        { kind: 'count-line', lineId: 's3' },
      ],
    });
    // Unidentified goods are described, not sized (goods-in 4.4, 4.9).
    const unidentified = currentLines([
      entry('u1', 'u1', null, {
        goods: 'unidentified',
        styleCode: null,
        size: null,
        description: 'SYNTHETIC blue jackets',
        invoiceQuantity: 0,
        extra: 'received',
      }),
    ]);
    expect(grnBlockers(1, [...sized, ...unidentified])).toBeUndefined();
  });
});

describe('one line per style, colour and size (goods-in 4.3)', () => {
  const SIZE_M = { attributeId: 'size-list', valueId: 'size-m', markedAttributeVersionId: 'marking', code: 'SYN-M' };
  const SIZE_L = { attributeId: 'size-list', valueId: 'size-l', markedAttributeVersionId: 'marking', code: 'SYN-L' };
  const lines = currentLines([
    entry('n1', 'n1', null, { styleCode: 'SYN-STYLE', colour: 'SYNTHETIC NAVY', size: SIZE_M }),
    entry('b1', 'b1', null, { styleCode: 'SYN-STYLE', colour: null, size: null }),
    entry('r1', 'r1', null, { styleCode: 'SYN-GONE', colour: null, size: null }),
    entry('r2', 'r1', 'r1', { styleCode: 'SYN-GONE', colour: null, size: null, removed: true }),
  ]);

  it('PRD-REC-005 finds the line already counting the style, colour and size, ignoring case and spaces at the ends', () => {
    expect(lineCounting(lines, { styleCode: ' syn-style ', colour: 'synthetic navy', size: SIZE_M })?.lineId).toBe(
      'n1',
    );
    expect(lineCounting(lines, { styleCode: 'SYN-STYLE', colour: null, size: null })?.lineId).toBe('b1');
  });

  it('PRD-MER-005 another size or colour, or a missing one against a given one, is another line', () => {
    expect(lineCounting(lines, { styleCode: 'SYN-STYLE', colour: 'SYNTHETIC NAVY', size: SIZE_L })).toBeUndefined();
    expect(lineCounting(lines, { styleCode: 'SYN-STYLE', colour: 'SYNTHETIC NAVY', size: null })).toBeUndefined();
    expect(lineCounting(lines, { styleCode: 'SYN-STYLE', colour: null, size: SIZE_M })).toBeUndefined();
  });

  it('PRD-REC-006 unidentified goods carry no style code, so no line counts them already (goods-in 4.9)', () => {
    expect(lineCounting(lines, { styleCode: null, colour: null, size: null })).toBeUndefined();
  });

  it('PRD-REC-005 a line saved again is not its own repeat, and a removed line counts nothing', () => {
    expect(lineCounting(lines, { styleCode: 'SYN-STYLE', colour: null, size: null }, 'b1')).toBeUndefined();
    expect(lineCounting(lines, { styleCode: 'SYN-GONE', colour: null, size: null })).toBeUndefined();
  });
});
