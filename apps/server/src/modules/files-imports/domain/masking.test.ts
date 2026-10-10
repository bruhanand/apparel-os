import type { LayoutStructure, MappingFields, StagedRow } from '@apparel-os/schemas';
import { describe, expect, it } from 'vitest';
import { maskPlan, maskRow } from './masking.js';

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
