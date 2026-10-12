import type { ImportOutcome, LayoutStructure, MappingFields, StagedRow } from '@apparel-os/schemas';
import { describe, expect, it } from 'vitest';
import { maskIssueMissing, maskIssueOriginal, maskOutcome, maskPlan, maskRow } from './masking.js';

// S1-F06-T03: masking a batch for its reader (imports-and-opening-data 11; access-and-approvals 6; PRD-ACS-008,
// PRD-SEC-005). Every value is SYNTHETIC.

const layout: LayoutStructure = {
  shape: 'layout-version/1',
  format: 'xlsx',
  sheet: 'SYNTHETIC Products',
  headerRow: 1,
  dataStartRow: 2,
  columns: [
    { name: 'Style', required: true },
    { name: 'Cost', required: false, type: 'money', restrictedClass: 'cost' },
  ],
  documentReference: 'Style',
};
const mapping: MappingFields = {
  shape: 'mapping-version/1',
  fields: { styleCode: { column: 'Style', transform: 'text' }, cost: { column: 'Cost', transform: 'paise' } },
};
const header = [
  { column: 1, text: 'Style' },
  { column: 2, text: 'Cost' },
];
const origin = { sheet: 'S', row: 2, column: 'A', ref: 'A2', raw: 'SYN-ST', cellType: 'text' as const, text: 'SYN-ST' };
const row: StagedRow = {
  stagedRowId: '01900000-0000-7000-8000-00000000f001',
  sheet: 'SYNTHETIC Products',
  rowNumber: 2,
  role: 'data',
  hidden: false,
  cells: [
    { column: 1, ref: 'A2', type: 'text', raw: 'SYN-ST', text: 'SYN-ST' },
    { column: 2, ref: 'B2', type: 'number', raw: 12.5, text: '12.5' },
  ],
  values: {
    styleCode: { kind: 'supplied', value: 'SYN-ST', origin },
    cost: {
      kind: 'supplied',
      value: '1250',
      origin: { ...origin, column: 'B', ref: 'B2', raw: 12.5, cellType: 'number', text: '12.5' },
    },
  },
};

describe('masking (imports-and-opening-data 11)', () => {
  it('PRD-ACS-008 masks the cells and values of a column whose class the reader lacks, once the layout is Confirmed', () => {
    const plan = maskPlan({ layoutConfirmed: true, masked: ['cost'], layout, mapping, header });
    const masked = maskRow(row, plan);
    expect(masked.cells).toEqual([
      row.cells[0],
      { column: 2, ref: 'B2', type: 'number', raw: null, text: '', masked: 'cost' },
    ]);
    expect(masked.values).toEqual({ styleCode: row.values.styleCode, cost: { kind: 'masked', fieldClass: 'cost' } });
  });

  it('PRD-SEC-005 masks every cell and value while the layout is not Confirmed, as every column holds every class', () => {
    const plan = maskPlan({ layoutConfirmed: false, masked: ['margin', 'cost'], layout, mapping, header });
    const masked = maskRow(row, plan);
    expect(masked.cells.map((cell) => cell.masked)).toEqual(['cost', 'cost']);
    expect(Object.values(masked.values)).toEqual([
      { kind: 'masked', fieldClass: 'cost' },
      { kind: 'masked', fieldClass: 'cost' },
    ]);
  });

  it('PRD-ACS-008 masks nothing for a reader granted every class the file holds', () => {
    expect(maskRow(row, maskPlan({ layoutConfirmed: false, masked: [], layout, mapping, header }))).toBe(row);
  });
});

describe('masking what is worked out from a masked column (imports-and-opening-data 7.4, 8.1, 11)', () => {
  const withMargin: LayoutStructure = {
    ...layout,
    columns: [...layout.columns, { name: 'Price', required: false, type: 'money' }],
  };
  // The price is supplied, and calculated beside it from the cost: the calculation reads a masked column.
  const calculated: MappingFields = {
    shape: 'mapping-version/1',
    fields: {
      styleCode: { column: 'Style', transform: 'text' },
      price: {
        column: 'Price',
        transform: 'paise',
        alsoCalculated: { name: 'sum', columns: ['Cost', 'Price'], as: 'paise' },
      },
    },
  };

  it('PRD-ACS-008 masks a value calculated beside a supplied one when the calculation reads a masked column', () => {
    const plan = maskPlan({ layoutConfirmed: true, masked: ['cost'], layout: withMargin, mapping: calculated, header });
    expect(plan.kind === 'columns' ? plan.fields.get('price') : undefined).toBe('cost');
    expect(plan.kind === 'columns' ? plan.fields.get('styleCode') : undefined).toBeUndefined();
  });

  it("PRD-ACS-008 masks an issue's original value by its column's class, and every one while nothing is Confirmed", () => {
    const plan = maskPlan({ layoutConfirmed: true, masked: ['cost'], layout, mapping, header });
    expect(maskIssueOriginal('12.5', 'cost', plan)).toEqual({ kind: 'masked', fieldClass: 'cost' });
    expect(maskIssueOriginal('SYN-ST', null, plan)).toEqual({ kind: 'value', text: 'SYN-ST' });
    expect(maskIssueOriginal('12.5', 'margin', plan)).toEqual({ kind: 'value', text: '12.5' });
    expect(maskIssueOriginal(null, 'cost', plan)).toBeUndefined();
    const all = maskPlan({ layoutConfirmed: false, masked: ['cost'], layout, mapping, header });
    expect(maskIssueOriginal('SYN-ST', null, all)).toEqual({ kind: 'masked', fieldClass: 'cost' });
    const none = maskPlan({ layoutConfirmed: true, masked: [], layout, mapping, header });
    expect(maskIssueOriginal('12.5', 'cost', none)).toEqual({ kind: 'value', text: '12.5' });
  });

  it('PRD-ACS-008 masks the calculated value and the control total sums an issue of a masked column names', () => {
    const plan = maskPlan({ layoutConfirmed: true, masked: ['cost'], layout, mapping, header });
    const missing = [
      { kind: 'control-total', column: 'Cost', reported: '99.5', summed: '12.5' },
      { kind: 'calculated', value: '1250' },
      { kind: 'import-document', documentId: 'SYN-DOC' },
    ];
    expect(maskIssueMissing(missing, 'cost', plan)).toEqual([
      { kind: 'control-total', column: 'Cost', masked: 'cost' },
      { kind: 'calculated', masked: 'cost' },
      { kind: 'import-document', documentId: 'SYN-DOC' },
    ]);
    expect(maskIssueMissing(missing, null, plan)).toEqual(missing);
  });

  const outcome: ImportOutcome = {
    outcomeId: '01900000-0000-7000-8000-00000000f101',
    result: 'published',
    attemptedAt: '2026-10-11T10:00:00.000Z',
    attemptedByUserId: '01900000-0000-7000-8000-00000000f102',
    counts: { rowsRead: 2, rowsIgnored: 1, rowsAccepted: 1, rowsRejected: 0, rowsPending: 0, rowsDuplicate: 0 },
    measures: [
      { field: 'cost', kind: 'value', accepted: '1250', rejected: null, pending: null, duplicate: null },
      { field: 'styleCode', kind: 'quantity', accepted: '1', rejected: null, pending: null, duplicate: null },
    ],
    controlTotals: [
      { sheet: 'SYNTHETIC Products', rowNumber: 3, column: 'Cost', reported: '12.5', summed: '12.5', accepted: '12.5' },
      { sheet: 'SYNTHETIC Products', rowNumber: 3, column: 'Style', reported: '1', summed: '1', accepted: '1' },
    ],
    documents: [],
  };

  it('PRD-ACS-008 masks the control totals of a masked column and the measures of a masked field in an outcome', () => {
    const plan = maskPlan({ layoutConfirmed: true, masked: ['cost'], layout, mapping, header: [] });
    const masked = maskOutcome(outcome, plan);
    expect(masked.controlTotals).toEqual([
      {
        sheet: 'SYNTHETIC Products',
        rowNumber: 3,
        column: 'Cost',
        reported: null,
        summed: null,
        accepted: null,
        masked: 'cost',
      },
      outcome.controlTotals[1],
    ]);
    expect(masked.measures).toEqual([
      {
        field: 'cost',
        kind: 'value',
        accepted: null,
        rejected: null,
        pending: null,
        duplicate: null,
        masked: 'cost',
      },
      outcome.measures[1],
    ]);
    expect(JSON.stringify(masked)).not.toContain('1250');
    expect(maskOutcome(outcome, maskPlan({ layoutConfirmed: true, masked: [], layout, mapping, header }))).toBe(
      outcome,
    );
  });

  it('PRD-SEC-005 masks every control total and measure while the layout is not Confirmed', () => {
    const plan = maskPlan({ layoutConfirmed: false, masked: ['cost'], layout, mapping, header: [] });
    const masked = maskOutcome(outcome, plan);
    expect(masked.controlTotals.every((total) => total.reported === null && total.accepted === null)).toBe(true);
    expect(masked.measures.every((measure) => measure.accepted === null)).toBe(true);
    expect(masked.counts).toEqual(outcome.counts);
  });
});
