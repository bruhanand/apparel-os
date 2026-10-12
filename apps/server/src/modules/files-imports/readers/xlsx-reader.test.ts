import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { readXlsx } from './xlsx-reader.js';

// S1-F06-T01: the XLSX reader turns a workbook into the neutral grid (imports-and-opening-data 9.1, 9.2; PRD-IMP-001,
// PRD-SEC-011): every sheet with its hidden state, hidden rows, cached formula values only, errors as errors (J-1),
// links as inert text, a note for what it could not read. Every workbook here is made by the test (SYNTHETIC).

async function bytesOf(workbook: ExcelJS.Workbook): Promise<Buffer> {
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

async function syntheticWorkbook(): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.title = 'SYNTHETIC reader workbook';
  const products = workbook.addWorksheet('SYNTHETIC Products');
  products.addRow(['Code', 'Count', 'Total', 'Flag', 'Day', 'Link', 'Note']);
  products.addRow([
    'SYN-001',
    3,
    { formula: 'B2*2', result: 6 },
    true,
    new Date(Date.UTC(2026, 9, 1)),
    { text: 'SYNTHETIC drive', hyperlink: 'https://example.invalid/synthetic' },
    { richText: [{ text: 'SYNTHETIC ' }, { text: 'rich' }] },
  ]);
  const hiddenRow = products.addRow(['SYN-002', { error: '#N/A' }, { formula: 'B3*2' }]);
  hiddenRow.hidden = true;
  products.addRow(['SYN-003', 0.1]);
  const hidden = workbook.addWorksheet('SYNTHETIC Hidden');
  hidden.state = 'hidden';
  hidden.addRow(['SYNTHETIC hidden value']);
  return bytesOf(workbook);
}

describe('readXlsx', () => {
  it('PRD-IMP-001 reads every sheet in order with its hidden state, and every row with its hidden mark', async () => {
    const read = await readXlsx(await syntheticWorkbook());
    if (read.kind !== 'read') throw new Error('The synthetic workbook was not read');
    expect(read.grid.sheets.map((sheet) => [sheet.name, sheet.position, sheet.state])).toEqual([
      ['SYNTHETIC Products', 1, 'visible'],
      ['SYNTHETIC Hidden', 2, 'hidden'],
    ]);
    const rows = read.grid.sheets[0]?.rows ?? [];
    expect(rows.map((row) => [row.number, row.hidden])).toEqual([
      [1, false],
      [2, false],
      [3, true],
      [4, false],
    ]);
    expect(read.grid.sheets[1]?.rows[0]?.cells[0]).toMatchObject({ type: 'text', raw: 'SYNTHETIC hidden value' });
  });

  it('PRD-SEC-011 keeps each cell raw with its type, a formula by its cached value only, and a link as inert text', async () => {
    const read = await readXlsx(await syntheticWorkbook());
    if (read.kind !== 'read') throw new Error('The synthetic workbook was not read');
    const row = read.grid.sheets[0]?.rows[1]?.cells ?? [];
    expect(row.map((cell) => [cell.ref, cell.type, cell.raw])).toEqual([
      ['A2', 'text', 'SYN-001'],
      ['B2', 'number', 3],
      ['C2', 'number', 6],
      ['D2', 'boolean', true],
      ['E2', 'date', '2026-10-01T00:00:00.000Z'],
      ['F2', 'text', 'SYNTHETIC drive'],
      ['G2', 'text', 'SYNTHETIC rich'],
    ]);
    expect(JSON.stringify(read.grid)).not.toContain('example.invalid');
    expect(read.grid.sheets[0]?.rows[3]?.cells[1]).toMatchObject({ type: 'number', raw: 0.1, text: '0.1' });
  });

  it('J-1 reads an error as an error, never text or zero, and notes a formula with no cached value', async () => {
    const read = await readXlsx(await syntheticWorkbook());
    if (read.kind !== 'read') throw new Error('The synthetic workbook was not read');
    const cells = read.grid.sheets[0]?.rows[2]?.cells ?? [];
    expect(cells[1]).toMatchObject({ ref: 'B3', type: 'error', raw: '#N/A' });
    expect(cells[2]).toMatchObject({ ref: 'C3', type: 'empty', raw: null });
    expect(read.grid.notes).toEqual([{ sheet: 'SYNTHETIC Products', ref: 'C3', note: 'formula-without-cached-value' }]);
  });

  it('PRD-IMP-001 answers unreadable for bytes that are no workbook it can open', async () => {
    expect(await readXlsx(Buffer.from('SYNTHETIC not a workbook'))).toEqual({ kind: 'unreadable' });
  });
});
