import { describe, expect, it } from 'vitest';
import { countsClose, outcomeControlTotals, outcomeCounts, outcomeMeasures } from './outcome.js';

// S1-F06-T04: what a publish attempt did, for the batch and each document (imports-and-opening-data 7.4; PRD-IMP-012,
// PRD-IMP-013). Every value is SYNTHETIC.

describe('outcomeCounts and countsClose', () => {
  it('GC-6 17 test 17 PRD-IMP-013: rows read equal rows ignored plus accepted, rejected, pending and duplicate', () => {
    const counts = outcomeCounts({
      rowsRead: 12,
      ignoredRows: 3,
      documents: [
        { result: 'published', rows: 2 },
        { result: 'duplicate', rows: 2 },
        { result: 'refused', rows: 1 },
        { result: 'conflict', rows: 1 },
        { result: 'excluded', rows: 1 },
        { result: 'not-attempted', rows: 2 },
      ],
    });
    expect(counts).toEqual({
      rowsRead: 12,
      rowsIgnored: 3,
      rowsAccepted: 2,
      rowsRejected: 3,
      rowsPending: 2,
      rowsDuplicate: 2,
    });
    expect(countsClose(counts)).toBe(true);
  });

  it('PRD-IMP-013: counts that miss a row the reader read do not close', () => {
    const counts = outcomeCounts({ rowsRead: 5, ignoredRows: 1, documents: [{ result: 'published', rows: 3 }] });
    expect(counts.rowsRead).toBe(5);
    expect(countsClose(counts)).toBe(false);
  });
});

describe('outcomeMeasures', () => {
  it('PRD-IMP-013 sums each measure by result exactly, and keeps a sum with an Unknown line Unknown, never zero', () => {
    const measures = outcomeMeasures(
      [
        { field: 'quantity', kind: 'quantity' },
        { field: 'value', kind: 'value' },
      ],
      [
        {
          result: 'published',
          rows: [
            { quantity: '2', value: '10.50' },
            { quantity: '3', value: '0.25' },
          ],
        },
        { result: 'duplicate', rows: [{ quantity: '4', value: undefined }] },
        { result: 'refused', rows: [{ quantity: '1', value: '1' }] },
      ],
    );
    expect(measures).toEqual([
      { field: 'quantity', kind: 'quantity', accepted: '5', rejected: '1', pending: '0', duplicate: '4' },
      { field: 'value', kind: 'value', accepted: '10.75', rejected: '1', pending: '0', duplicate: null },
    ]);
  });

  it('GC-6 10.2 POL-14.03 PRD-MOD-015: a value that stands on evidence is Unknown on a row without it, never summed as known', () => {
    const cost = [{ field: 'unitCost', kind: 'value' as const, evidence: 'valuationEvidence' }];
    const row = (unitCost: string, valuationEvidence?: string) => ({ unitCost, valuationEvidence });
    expect(outcomeMeasures(cost, [{ result: 'published', rows: [row('12000', 'SYN invoice 77')] }])).toEqual([
      { field: 'unitCost', kind: 'value', accepted: '12000', rejected: '0', pending: '0', duplicate: '0' },
    ]);
    // A unit cost with no valuation evidence keeps the total Unknown (no value in a KDPS file is evidence yet, GC6-9).
    expect(
      outcomeMeasures(cost, [{ result: 'published', rows: [row('12000', 'SYN invoice 77'), row('5000')] }]),
    ).toEqual([{ field: 'unitCost', kind: 'value', accepted: null, rejected: '0', pending: '0', duplicate: '0' }]);
  });
});

describe('outcomeControlTotals', () => {
  it('PRD-IMP-013 PRD-EBO-004 keeps the total as reported and summed apart from the sum of the accepted lines', () => {
    expect(
      outcomeControlTotals(
        [{ sheet: 'SYNTHETIC', rowNumber: 9, column: 'Qty', reported: '7', summed: '6' }],
        (column) => (column === 'Qty' ? ['2', '1'] : undefined),
      ),
    ).toEqual([{ sheet: 'SYNTHETIC', rowNumber: 9, column: 'Qty', reported: '7', summed: '6', accepted: '3' }]);
    expect(
      outcomeControlTotals([{ sheet: 'S', rowNumber: 3, column: 'Qty', reported: null, summed: null }], () => [
        '2',
        undefined,
      ]),
    ).toEqual([{ sheet: 'S', rowNumber: 3, column: 'Qty', reported: null, summed: null, accepted: null }]);
  });
});
