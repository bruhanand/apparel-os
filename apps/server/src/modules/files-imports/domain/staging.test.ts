import { describe, expect, it } from 'vitest';
import type { Grid, GridCell, GridRow } from './grid.js';
import { normalisedWord, type RuleInForce } from './rules.js';
import { stage, type LayoutStructure, type MappingFields, type Staged, type StagingContext } from './staging.js';

// S1-F06-T01, S1-F06-T03: a layout and mapping turn the grid into documents and staged rows, every original cell kept
// but those of an encrypted class, and each normalised value marked with its origin: Supplied, Calculated, Mapped, or
// Unknown with the reason (imports-and-opening-data 3.1 step 5, section 5, 6.1 to 6.6, 11; PRD-IMP-003,
// PRD-IMP-006, PRD-MOD-014, PRD-MOD-015). The layouts, grids and rules here are SYNTHETIC.

const LAYOUT_ID = '01900000-0000-7000-8000-00000000a001';

const layout: LayoutStructure = {
  shape: 'layout-version/1',
  format: 'xlsx',
  sheet: 'SYNTHETIC Products',
  headerRow: 1,
  dataStartRow: 2,
  columns: [
    { name: 'Style', required: true },
    { name: 'SKU', required: true },
    { name: 'Units', required: false },
  ],
  documentReference: 'Style',
};
const mapping: MappingFields = {
  shape: 'mapping-version/1',
  fields: {
    styleCode: { column: 'Style', transform: 'text' },
    skuCode: { column: 'SKU', transform: 'text' },
    units: { column: 'Units', transform: 'text' },
  },
};
const context: StagingContext = { target: 'merchandise', rules: [], scopes: { layoutId: LAYOUT_ID } };

function text(column: number, ref: string, raw: string): GridCell {
  return { column, ref, type: 'text', raw, text: raw };
}
function number(column: number, ref: string, raw: number): GridCell {
  return { column, ref, type: 'number', raw, text: String(raw) };
}

function sheetGrid(rows: GridRow[], name = 'SYNTHETIC Products'): Grid {
  return { notes: [], sheets: [{ name, position: 1, state: 'visible', rows }] };
}

const grid: Grid = {
  notes: [],
  sheets: [
    { name: 'SYNTHETIC Other', position: 1, state: 'hidden', rows: [] },
    {
      name: ' SYNTHETIC   Products ',
      position: 2,
      state: 'visible',
      rows: [
        { number: 1, hidden: false, cells: [text(1, 'A1', 'Style'), text(2, 'B1', ' SKU '), text(3, 'C1', 'Units')] },
        {
          number: 2,
          hidden: false,
          cells: [text(1, 'A2', ' SYN-ST-1 '), text(2, 'B2', 'SYN-SKU-1'), number(3, 'C2', 0)],
        },
        { number: 3, hidden: true, cells: [text(1, 'A3', 'SYN-ST-1'), text(2, 'B3', 'SYN-SKU-2')] },
        { number: 4, hidden: false, cells: [text(2, 'B4', 'SYNTHETIC note')] },
        {
          number: 5,
          hidden: false,
          cells: [text(1, 'A5', 'SYN-ST-2'), { column: 2, ref: 'B5', type: 'error', raw: '#N/A', text: '#N/A' }],
        },
      ],
    },
  ],
};

function staged(result: ReturnType<typeof stage>): Staged {
  if (result.kind !== 'staged') throw new Error(`Not staged: ${JSON.stringify(result)}`);
  return result;
}

describe('stage', () => {
  it('PRD-IMP-006 marks each normalised value Supplied with where it came from, and keeps the original cells', () => {
    const result = staged(stage(grid, layout, mapping, context));
    const first = result.documents[0]?.rows[0];
    expect(first?.cells).toEqual(grid.sheets[1]?.rows[1]?.cells);
    expect(first?.values.styleCode).toEqual({
      kind: 'supplied',
      value: 'SYN-ST-1',
      origin: {
        sheet: ' SYNTHETIC   Products ',
        row: 2,
        column: 'A',
        ref: 'A2',
        raw: ' SYN-ST-1 ',
        cellType: 'text',
        text: ' SYN-ST-1 ',
      },
    });
    // A zero is a value read from the file, never a default (PRD-MOD-015).
    expect(first?.values.units).toMatchObject({ kind: 'supplied', value: '0' });
  });

  it('PRD-IMP-003 groups data rows into documents by the reference column, hidden rows included, and gives other rows their role', () => {
    const result = staged(stage(grid, layout, mapping, context));
    expect(
      result.documents.map((document) => [document.reference, document.rows.map((row) => [row.rowNumber, row.hidden])]),
    ).toEqual([
      [
        'SYN-ST-1',
        [
          [2, false],
          [3, true],
        ],
      ],
      ['SYN-ST-2', [[5, false]]],
    ]);
    expect(result.others.map((row) => [row.rowNumber, row.role])).toEqual([
      [1, 'header'],
      [4, 'note'],
    ]);
    expect(result.sheets).toEqual([
      { name: 'SYNTHETIC Other', position: 1, state: 'hidden', rows: 0, imported: false },
      { name: ' SYNTHETIC   Products ', position: 2, state: 'visible', rows: 5, imported: true },
    ]);
  });

  it('PRD-MOD-015 leaves a field Unknown where the cell is empty or an error, never zero or text, saying why', () => {
    const result = staged(stage(grid, layout, mapping, context));
    expect(result.documents[0]?.rows[1]?.values.units).toEqual({ kind: 'unknown' });
    expect(result.documents[1]?.rows[0]?.values.skuCode).toMatchObject({
      kind: 'unknown',
      because: 'error-cell',
      origin: { ref: 'B5', raw: '#N/A' },
    });
  });

  it('PRD-IMP-003 PRD-IMP-004 refuses a file without the layout sheet, without a required column, or with a column the layout does not know (A-4)', () => {
    expect(stage({ notes: [], sheets: [] }, layout, mapping, context)).toEqual({
      kind: 'refused',
      code: 'files-imports.layout-not-matched',
      missing: [{ kind: 'layout-sheet', sheet: 'SYNTHETIC Products' }],
    });
    const noSku = sheetGrid([{ number: 1, hidden: false, cells: [text(1, 'A1', 'Style'), text(2, 'B1', 'Colour')] }]);
    expect(stage(noSku, layout, mapping, context)).toEqual({
      kind: 'refused',
      code: 'files-imports.layout-not-matched',
      missing: [
        { kind: 'layout-column', column: 'SKU' },
        { kind: 'layout-unknown-column', column: 'Colour' },
      ],
    });
  });

  it('PRD-MOD-014 C-1 C-2 reads money to paise exactly; text in a number column and sub-paise digits stay Unknown', () => {
    const money: LayoutStructure = {
      ...layout,
      columns: [...layout.columns, { name: 'MRP', required: false, type: 'money' }],
    };
    const moneyMapping: MappingFields = {
      shape: 'mapping-version/1',
      fields: { ...mapping.fields, mrp: { column: 'MRP', transform: 'paise' } },
    };
    const header = {
      number: 1,
      hidden: false,
      cells: [text(1, 'A1', 'Style'), text(2, 'B1', 'SKU'), text(4, 'D1', 'MRP')],
    };
    const rows = [
      header,
      { number: 2, hidden: false, cells: [text(1, 'A2', 'S1'), text(2, 'B2', 'K1'), number(4, 'D2', 499.99)] },
      { number: 3, hidden: false, cells: [text(1, 'A3', 'S2'), text(2, 'B3', 'K2'), text(4, 'D3', 'four hundred')] },
      { number: 4, hidden: false, cells: [text(1, 'A4', 'S3'), text(2, 'B4', 'K3'), number(4, 'D4', 1.005)] },
    ];
    const result = staged(stage(sheetGrid(rows), money, moneyMapping, context));
    const values = result.documents.map((document) => document.rows[0]?.values.mrp);
    expect(values[0]).toMatchObject({ kind: 'supplied', value: '49999' });
    expect(values[1]).toMatchObject({ kind: 'unknown', because: 'not-a-number', origin: { raw: 'four hundred' } });
    expect(values[2]).toMatchObject({ kind: 'unknown', because: 'finer-than-paise', origin: { raw: 1.005 } });
  });

  it('PRD-IMP-006 a calculated value names its function, version and inputs, and never replaces a supplied one', () => {
    const calc: LayoutStructure = {
      ...layout,
      columns: [
        ...layout.columns,
        { name: 'CGST', required: false, type: 'number' },
        { name: 'SGST', required: false, type: 'number' },
        { name: 'GST', required: false, type: 'number' },
      ],
    };
    const calcMapping: MappingFields = {
      shape: 'mapping-version/1',
      fields: {
        styleCode: { column: 'Style', transform: 'text' },
        code: { calculation: { name: 'join', columns: ['Style', 'SKU'], separator: '/' } },
        rate: {
          column: 'GST',
          transform: 'decimal',
          alsoCalculated: { name: 'sum', columns: ['CGST', 'SGST'] },
        },
      },
    };
    const rows = [
      {
        number: 1,
        hidden: false,
        cells: [
          text(1, 'A1', 'Style'),
          text(2, 'B1', 'SKU'),
          text(4, 'D1', 'CGST'),
          text(5, 'E1', 'SGST'),
          text(6, 'F1', 'GST'),
        ],
      },
      {
        number: 2,
        hidden: false,
        cells: [
          text(1, 'A2', 'S1'),
          text(2, 'B2', 'K1'),
          number(4, 'D2', 2.5),
          number(5, 'E2', 2.5),
          number(6, 'F2', 6),
        ],
      },
    ];
    const values = staged(stage(sheetGrid(rows), calc, calcMapping, context)).documents[0]?.rows[0]?.values;
    expect(values?.code).toMatchObject({
      kind: 'calculated',
      value: 'S1/K1',
      calculation: { name: 'join', version: 1, inputs: [{ ref: 'A2' }, { ref: 'B2' }] },
    });
    expect(values?.rate).toMatchObject({
      kind: 'supplied',
      value: '6',
      calculated: { value: '5', calculation: { name: 'sum', version: 1, inputs: [{ ref: 'D2' }, { ref: 'E2' }] } },
    });
  });

  it('PRD-IMP-008 maps a word through a confirmed rule keeping the original word, and leaves an ambiguous word Unknown', () => {
    const colour: LayoutStructure = { ...layout, columns: [...layout.columns, { name: 'Colour', required: false }] };
    const colourMapping: MappingFields = {
      shape: 'mapping-version/1',
      fields: {
        styleCode: { column: 'Style', transform: 'text' },
        colour: { column: 'Colour', transform: 'text', rules: true },
      },
    };
    const rule = (id: string, word: string, target: string): RuleInForce => ({
      ruleId: `01900000-0000-7000-8000-00000000b00${id}`,
      ruleVersionId: `01900000-0000-7000-8000-00000000c00${id}`,
      attribute: 'merchandise.colour',
      scope: { kind: 'organisation' },
      normalisedWord: normalisedWord(word, false),
      caseSensitive: false,
      target,
    });
    const rules = [rule('1', 'SYN Nvy', 'SYN-NAVY'), rule('2', 'SYN Mix', 'SYN-RED'), rule('3', 'SYN Mix', 'SYN-BLUE')];
    const rows = [
      { number: 1, hidden: false, cells: [text(1, 'A1', 'Style'), text(2, 'B1', 'SKU'), text(4, 'D1', 'Colour')] },
      { number: 2, hidden: false, cells: [text(1, 'A2', 'S1'), text(2, 'B2', 'K1'), text(4, 'D2', ' syn  nvy ')] },
      { number: 3, hidden: false, cells: [text(1, 'A3', 'S2'), text(2, 'B3', 'K2'), text(4, 'D3', 'SYN Mix')] },
      { number: 4, hidden: false, cells: [text(1, 'A4', 'S3'), text(2, 'B4', 'K3'), text(4, 'D4', 'SYN Plain')] },
    ];
    const result = staged(stage(sheetGrid(rows), colour, colourMapping, { ...context, rules }));
    const [navy, mix, plain] = result.documents.map((document) => document.rows[0]?.values.colour);
    expect(navy).toMatchObject({
      kind: 'mapped',
      value: 'SYN-NAVY',
      word: 'syn  nvy',
      rule: { ruleId: rules[0]?.ruleId, ruleVersionId: rules[0]?.ruleVersionId },
    });
    expect(mix).toMatchObject({
      kind: 'unknown',
      because: 'ambiguous-rules',
      rules: [rules[1]?.ruleId, rules[2]?.ruleId],
    });
    // A word no rule maps stays as its source word, for the handler to check (6.3).
    expect(plain).toMatchObject({ kind: 'supplied', value: 'SYN Plain' });
  });

  it('section 11: leaves the cells of an encrypted class out of staging', () => {
    const bank: LayoutStructure = {
      ...layout,
      columns: [...layout.columns, { name: 'Account', required: false, restrictedClass: 'bank-details' }],
    };
    const rows = [
      { number: 1, hidden: false, cells: [text(1, 'A1', 'Style'), text(2, 'B1', 'SKU'), text(4, 'D1', 'Account')] },
      { number: 2, hidden: false, cells: [text(1, 'A2', 'S1'), text(2, 'B2', 'K1'), text(4, 'D2', 'SYN-ACCOUNT-1')] },
    ];
    const row = staged(stage(sheetGrid(rows), bank, mapping, context)).documents[0]?.rows[0];
    expect(row?.cells.map((cell) => cell.ref)).toEqual(['A2', 'B2']);
  });

  it('G-1 gives a row whose label column holds a control total label the role total, never a line', () => {
    const totals: LayoutStructure = {
      ...layout,
      controlTotals: [{ column: 'Units', labelColumn: 'SKU', label: 'SYN TOTAL' }],
    };
    const rows = [
      { number: 1, hidden: false, cells: [text(1, 'A1', 'Style'), text(2, 'B1', 'SKU'), text(3, 'C1', 'Units')] },
      { number: 2, hidden: false, cells: [text(1, 'A2', 'S1'), text(2, 'B2', 'K1'), number(3, 'C2', 2)] },
      { number: 3, hidden: false, cells: [text(2, 'B3', 'syn total'), number(3, 'C3', 2)] },
      { number: 4, hidden: false, cells: [number(3, 'C4', 7), number(2, 'B4', 8)] },
    ];
    const result = staged(stage(sheetGrid(rows), totals, mapping, context));
    expect(result.others.map((row) => [row.rowNumber, row.role])).toEqual([
      [1, 'header'],
      [3, 'total'],
      [4, 'filler'],
    ]);
  });
});
