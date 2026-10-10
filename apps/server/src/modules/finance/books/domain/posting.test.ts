import { describe, expect, it } from 'vitest';
import {
  applyMap,
  checkEventKinds,
  mapLinesRefusal,
  sumLines,
  type MapLine,
  type PostingEventKind,
} from './posting.js';

// The posting rules as plain functions (books-and-posting 6.1, 6.2, 7.1, 8.2). Every value is SYNTHETIC: the accounts
// are identifiers only and the kinds are labelled synthetic kinds, never KDPS's (V-10).

const IN: PostingEventKind = {
  kind: 'synthetic.value-in',
  components: ['to-pool', 'to-dispatch'],
  reversalKind: 'synthetic.value-in-reversal',
  liveStage: 1,
};
const IN_REVERSAL: PostingEventKind = {
  kind: 'synthetic.value-in-reversal',
  components: ['to-pool', 'to-dispatch', 'variance'],
  reversalKind: null,
  liveStage: 1,
};
const INV = '01900000-0000-7000-8000-000000000001';
const PUR = '01900000-0000-7000-8000-000000000002';
const TRN = '01900000-0000-7000-8000-000000000003';
const MAP: readonly MapLine[] = [
  { component: 'to-pool', side: 'debit', accountId: INV, requiresStore: false, requiresBrand: true },
  { component: 'to-pool', side: 'credit', accountId: PUR, requiresStore: false, requiresBrand: false },
  { component: 'to-dispatch', side: 'debit', accountId: TRN, requiresStore: true, requiresBrand: false },
  { component: 'to-dispatch', side: 'credit', accountId: PUR, requiresStore: false, requiresBrand: false },
];
const DIMENSIONS = {
  businessUnitId: '01900000-0000-7000-8000-0000000000b1',
  siteId: '01900000-0000-7000-8000-0000000000c1',
  storeId: null,
  brandId: '01900000-0000-7000-8000-0000000000d1',
  legalEntityId: '01900000-0000-7000-8000-0000000000e1',
  mappingVersionId: '01900000-0000-7000-8000-0000000000f1',
};
const ALL = new Set([INV, PUR, TRN]);

describe('posting event kinds (books-and-posting 7.1)', () => {
  it('accepts a kind with its declared reversal kind', () => {
    expect([...checkEventKinds([IN, IN_REVERSAL]).keys()]).toEqual([IN.kind, IN_REVERSAL.kind]);
  });

  it('refuses a kind whose reversal kind is not declared, or lacks one of its components', () => {
    expect(() => checkEventKinds([IN])).toThrow(/not declared/);
    expect(() => checkEventKinds([IN, { ...IN_REVERSAL, components: ['to-pool'] }])).toThrow(/lacks/);
  });

  it('code-house-rules 11.1 refuses a synthetic test- kind outside a test composition', () => {
    const synthetic = { ...IN, kind: 'test-synthetic.in', reversalKind: null };
    expect(() => checkEventKinds([synthetic])).toThrow(/outside a test composition/);
  });
});

describe('a map version for its kind (6.1)', () => {
  it('POL-09.12 every component has a line, and no line names a component the kind does not carry', () => {
    expect(mapLinesRefusal(IN, MAP)).toBeUndefined();
    expect(mapLinesRefusal(IN, MAP.slice(0, 2))).toEqual({
      code: 'finance.component-without-line',
      component: 'to-dispatch',
    });
    expect(
      mapLinesRefusal(IN, [
        ...MAP,
        { component: 'variance', side: 'debit', accountId: INV, requiresStore: false, requiresBrand: false },
      ]),
    ).toEqual({
      code: 'finance.component-not-of-kind',
      component: 'variance',
    });
  });
});

describe('a map applied to an item (6.1, 6.2)', () => {
  it('a positive amount posts on the line’s side and a negative one on the other; zero posts nothing', () => {
    const applied = applyMap(
      MAP,
      [
        { component: 'to-pool', amount: -40_000 },
        { component: 'to-dispatch', amount: 0 },
      ],
      DIMENSIONS,
      ALL,
    );
    expect(applied).toMatchObject({
      kind: 'lines',
      lines: [
        { accountId: INV, side: 'credit', amount: 40_000, signedAmount: -40_000 },
        { accountId: PUR, side: 'debit', amount: 40_000, signedAmount: -40_000 },
      ],
    });
  });

  it('POL-09.12 refuses with the failed condition: an account not in force, a missing dimension', () => {
    expect(applyMap(MAP, [{ component: 'to-pool', amount: 100 }], DIMENSIONS, new Set([PUR]))).toEqual({
      kind: 'refused',
      refusal: { code: 'finance.map-account-not-in-force', accountId: INV },
    });
    expect(applyMap(MAP, [{ component: 'to-dispatch', amount: 100 }], DIMENSIONS, ALL)).toEqual({
      kind: 'refused',
      refusal: { code: 'finance.missing-dimension', dimension: 'store', component: 'to-dispatch' },
    });
    expect(applyMap(MAP, [{ component: 'to-pool', amount: 100 }], { ...DIMENSIONS, brandId: null }, ALL)).toEqual({
      kind: 'refused',
      refusal: { code: 'finance.missing-dimension', dimension: 'brand', component: 'to-pool' },
    });
  });

  it('POL-09.13 refuses lines that would not balance', () => {
    expect(applyMap(MAP.slice(0, 1), [{ component: 'to-pool', amount: 100 }], DIMENSIONS, ALL)).toEqual({
      kind: 'refused',
      refusal: { code: 'finance.journal-unbalanced' },
    });
  });
});

describe('a journal’s lines (8.2)', () => {
  it('PRD-LED-004 sums lines by account, side, business unit, Store and brand, keeping their parts', () => {
    const one = applyMap(MAP, [{ component: 'to-pool', amount: 100_000 }], DIMENSIONS, ALL);
    const two = applyMap(MAP, [{ component: 'to-pool', amount: 78_000 }], DIMENSIONS, ALL);
    if (one.kind !== 'lines' || two.kind !== 'lines') throw new Error('refused');
    const summed = sumLines([...one.lines, ...two.lines]);
    expect(summed.map((line) => [line.accountId, line.side, line.amount, line.parts.length])).toEqual([
      [INV, 'debit', 178_000, 2],
      [PUR, 'credit', 178_000, 2],
    ]);
  });
});
