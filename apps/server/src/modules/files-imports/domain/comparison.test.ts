import { describe, expect, it } from 'vitest';
import { compareSets, type ComparisonRow } from './comparison.js';

// S1-F13-T01: a comparison run's lines (imports-and-opening-data 2, 6.6, 10.3; PRD-LIF-027, POL-14.07). Every value is
// SYNTHETIC; every expected line is written by hand.

const row = (id: string, fields: Partial<ComparisonRow>): ComparisonRow => ({
  rowId: id,
  barcode: null,
  skuId: null,
  locationId: null,
  quantity: null,
  ...fields,
});

describe('compareSets by barcode, then SKU (10.3: manifest or count against the last SOH)', () => {
  it('PRD-LIF-027 lists every key with both quantities, matching barcodes first and the rest by SKU', () => {
    const lines = compareSets(
      [
        row('L1', { barcode: 'SYN-B1', skuId: 'SKU-1', quantity: 3 }),
        row('L2', { barcode: 'SYN-B2', skuId: 'SKU-2', quantity: 2 }),
        row('L3', { barcode: 'SYN-B2', skuId: 'SKU-2', quantity: 1 }),
        // A barcode the right side does not hold, whose SKU it holds under another barcode.
        row('L4', { barcode: 'SYN-B3', skuId: 'SKU-3', quantity: 5 }),
      ],
      [
        row('R1', { barcode: 'SYN-B1', skuId: 'SKU-1', quantity: 3 }),
        row('R2', { barcode: 'SYN-B2', skuId: 'SKU-2', quantity: 4 }),
        row('R3', { barcode: 'SYN-B4', skuId: 'SKU-3', quantity: 6 }),
      ],
      'barcode-then-sku',
    );
    expect(lines).toEqual([
      {
        keyedBy: 'barcode',
        barcode: 'SYN-B1',
        skuId: 'SKU-1',
        locationId: null,
        left: { state: 'listed', total: 3 },
        right: { state: 'listed', total: 3 },
        result: 'same',
        leftRows: ['L1'],
        rightRows: ['R1'],
      },
      {
        keyedBy: 'barcode',
        barcode: 'SYN-B2',
        skuId: 'SKU-2',
        locationId: null,
        left: { state: 'listed', total: 3 },
        right: { state: 'listed', total: 4 },
        result: 'different',
        leftRows: ['L2', 'L3'],
        rightRows: ['R2'],
      },
      {
        keyedBy: 'sku',
        barcode: null,
        skuId: 'SKU-3',
        locationId: null,
        left: { state: 'listed', total: 5 },
        right: { state: 'listed', total: 6 },
        result: 'different',
        leftRows: ['L4'],
        rightRows: ['R3'],
      },
    ]);
  });

  it('class I-1, GC6-16: a key one side does not list is reported as not listed, never as zero', () => {
    const lines = compareSets(
      [row('L1', { barcode: 'SYN-B1', skuId: 'SKU-1', quantity: 2 })],
      [row('R1', { barcode: 'SYN-B9', quantity: 7 })],
      'barcode-then-sku',
    );
    expect(lines).toEqual([
      {
        keyedBy: 'sku',
        barcode: 'SYN-B1',
        skuId: 'SKU-1',
        locationId: null,
        left: { state: 'listed', total: 2 },
        right: { state: 'not-listed' },
        result: 'not-listed-right',
        leftRows: ['L1'],
        rightRows: [],
      },
      {
        keyedBy: 'barcode',
        barcode: 'SYN-B9',
        skuId: null,
        locationId: null,
        left: { state: 'not-listed' },
        right: { state: 'listed', total: 7 },
        result: 'not-listed-left',
        leftRows: [],
        rightRows: ['R1'],
      },
    ]);
  });

  it('PRD-MOD-015: a quantity Unknown on either side keeps the line Unknown, never a difference worked out from zero', () => {
    const lines = compareSets(
      [row('L1', { barcode: 'SYN-B1', quantity: 2 }), row('L2', { barcode: 'SYN-B1', quantity: null })],
      [row('R1', { barcode: 'SYN-B1', quantity: 2 })],
      'barcode-then-sku',
    );
    expect(lines).toEqual([
      {
        keyedBy: 'barcode',
        barcode: 'SYN-B1',
        skuId: null,
        locationId: null,
        left: { state: 'unknown' },
        right: { state: 'listed', total: 2 },
        result: 'unknown',
        leftRows: ['L1', 'L2'],
        rightRows: ['R1'],
      },
    ]);
  });

  it('PRD-LIF-005: a row with neither barcode nor SKU is listed on its own, unresolved, never dropped', () => {
    const lines = compareSets([row('L1', { quantity: 1 })], [], 'barcode-then-sku');
    expect(lines).toEqual([
      {
        keyedBy: 'unresolved',
        barcode: null,
        skuId: null,
        locationId: null,
        left: { state: 'listed', total: 1 },
        right: { state: 'not-listed' },
        result: 'unresolved',
        leftRows: ['L1'],
        rightRows: [],
      },
    ]);
  });
});

describe('compareSets by SKU and location (10.3: count against manifest)', () => {
  it('PRD-LIF-027 matches each SKU at each location and lists the rest on its side', () => {
    const lines = compareSets(
      [
        row('C1', { skuId: 'SKU-1', locationId: 'LOC-A', quantity: 4 }),
        row('C2', { skuId: 'SKU-1', locationId: 'LOC-B', quantity: 1 }),
      ],
      [
        row('M1', { barcode: 'SYN-B1', skuId: 'SKU-1', locationId: 'LOC-A', quantity: 4 }),
        row('M2', { barcode: 'SYN-B1', skuId: 'SKU-1', locationId: 'LOC-C', quantity: 2 }),
        // Not yet resolved to a SKU: unresolved, listed on its own.
        row('M3', { barcode: 'SYN-B7', locationId: 'LOC-A', quantity: 9 }),
      ],
      'sku-and-location',
    );
    expect(lines).toEqual([
      {
        keyedBy: 'sku-and-location',
        barcode: 'SYN-B1',
        skuId: 'SKU-1',
        locationId: 'LOC-A',
        left: { state: 'listed', total: 4 },
        right: { state: 'listed', total: 4 },
        result: 'same',
        leftRows: ['C1'],
        rightRows: ['M1'],
      },
      {
        keyedBy: 'sku-and-location',
        barcode: null,
        skuId: 'SKU-1',
        locationId: 'LOC-B',
        left: { state: 'listed', total: 1 },
        right: { state: 'not-listed' },
        result: 'not-listed-right',
        leftRows: ['C2'],
        rightRows: [],
      },
      {
        keyedBy: 'sku-and-location',
        barcode: 'SYN-B1',
        skuId: 'SKU-1',
        locationId: 'LOC-C',
        left: { state: 'not-listed' },
        right: { state: 'listed', total: 2 },
        result: 'not-listed-left',
        leftRows: [],
        rightRows: ['M2'],
      },
      {
        keyedBy: 'unresolved',
        barcode: 'SYN-B7',
        skuId: null,
        locationId: 'LOC-A',
        left: { state: 'not-listed' },
        right: { state: 'listed', total: 9 },
        result: 'unresolved',
        leftRows: [],
        rightRows: ['M3'],
      },
    ]);
  });
});
