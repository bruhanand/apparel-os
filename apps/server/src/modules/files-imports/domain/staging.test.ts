import { describe, expect, it } from 'vitest';
import type { Grid, GridCell } from './grid.js';
import { stage, type LayoutStructure, type MappingFields } from './staging.js';

// S1-F06-T01: a fixed layout and mapping turn the grid into documents and staged rows, every original cell kept and
// each normalised value marked Supplied with its sheet, row, column, raw value, cell type and text; a field the file
// leaves empty stays Unknown (imports-and-opening-data 3.1 step 5, section 5, 6.1, 6.2; PRD-IMP-003, PRD-IMP-006,
// PRD-MOD-015). The layout and grid here are SYNTHETIC.

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

function text(column: number, ref: string, raw: string): GridCell {
  return { column, ref, type: 'text', raw, text: raw };
}

const grid: Grid = {
  notes: [],
  sheets: [
    { name: 'SYNTHETIC Other', position: 1, state: 'visible', rows: [] },
    {
      name: ' SYNTHETIC   Products ',
      position: 2,
      state: 'visible',
      rows: [
        { number: 1, hidden: false, cells: [text(1, 'A1', 'Style'), text(2, 'B1', ' SKU '), text(3, 'C1', 'Units')] },
        {
          number: 2,
          hidden: false,
          cells: [
            text(1, 'A2', ' SYN-ST-1 '),
            text(2, 'B2', 'SYN-SKU-1'),
            { column: 3, ref: 'C2', type: 'number', raw: 0, text: '0' },
          ],
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

describe('stage', () => {
  it('PRD-IMP-006 marks each normalised value Supplied with where it came from, and keeps the original cells', () => {
    const staged = stage(grid, layout, mapping);
    if (staged.kind !== 'staged') throw new Error(`Not staged: ${staged.kind}`);
    const first = staged.documents[0]?.rows[0];
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

  it('PRD-IMP-003 groups data rows into documents by the reference column, hidden rows included', () => {
    const staged = stage(grid, layout, mapping);
    if (staged.kind !== 'staged') throw new Error(`Not staged: ${staged.kind}`);
    expect(
      staged.documents.map((document) => [document.reference, document.rows.map((row) => [row.rowNumber, row.hidden])]),
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
    expect(staged.ignored.map((row) => row.rowNumber)).toEqual([4]);
  });

  it('PRD-MOD-015 leaves a field Unknown where the cell is empty or an error, never zero or text', () => {
    const staged = stage(grid, layout, mapping);
    if (staged.kind !== 'staged') throw new Error(`Not staged: ${staged.kind}`);
    expect(staged.documents[0]?.rows[1]?.values.units).toEqual({ kind: 'unknown' });
    expect(staged.documents[1]?.rows[0]?.values.skuCode).toEqual({ kind: 'unknown' });
  });

  it('PRD-IMP-003 refuses a file without the layout sheet, or without a required column at the header row', () => {
    expect(stage({ notes: [], sheets: [] }, layout, mapping)).toEqual({
      kind: 'refused',
      code: 'files-imports.layout-not-matched',
      missing: [{ kind: 'layout-sheet', sheet: 'SYNTHETIC Products' }],
    });
    const noSku: Grid = {
      notes: [],
      sheets: [
        {
          name: 'SYNTHETIC Products',
          position: 1,
          state: 'visible',
          rows: [{ number: 1, hidden: false, cells: [text(1, 'A1', 'Style')] }],
        },
      ],
    };
    expect(stage(noSku, layout, mapping)).toEqual({
      kind: 'refused',
      code: 'files-imports.layout-not-matched',
      missing: [{ kind: 'layout-column', column: 'SKU' }],
    });
  });
});
