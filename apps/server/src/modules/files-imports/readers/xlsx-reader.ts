import ExcelJS from 'exceljs';
import type { CellType, Grid, GridCell, GridNote, GridRow, GridSheet, SheetState } from '../domain/grid.js';

// The XLSX reader (imports-and-opening-data 9.1, 9.2; PRD Stack row Documents: ExcelJS, pinned in code-house-rules
// 10.6; S1-F06-T01). It turns the bytes, already in memory, into the neutral grid. It evaluates no formula (a formula
// is read by its cached value only), runs no macro and follows no link: a hyperlink is kept as its text, inert
// (PRD-SEC-011; GC6-17). Errors stay errors (J-1). A cell it cannot read is noted and the file goes on (A-11).

export type XlsxRead =
  | { readonly kind: 'read'; readonly grid: Grid }
  | { readonly kind: 'unreadable' }
  | { readonly kind: 'too-many-rows' };

/** Thrown inside a sheet's walk when the rows read pass the row cap, so the walk stops there. */
class TooManyRows extends Error {}

const SHEET_STATES: Readonly<Record<string, SheetState>> = {
  visible: 'visible',
  hidden: 'hidden',
  veryHidden: 'very-hidden',
};

interface Read {
  readonly type: CellType;
  readonly raw: GridCell['raw'];
  readonly text: string;
}

const EMPTY: Read = { type: 'empty', raw: null, text: '' };

/** A scalar value, as a cell or a formula's cached result holds it. */
function scalar(value: unknown): Read | undefined {
  if (value === null || value === undefined) return EMPTY;
  if (typeof value === 'string') return { type: 'text', raw: value, text: value };
  // The shortest decimal that reproduces the binary number (imports-and-opening-data 6.2).
  if (typeof value === 'number') return { type: 'number', raw: value, text: String(value) };
  if (typeof value === 'boolean') return { type: 'boolean', raw: value, text: value ? 'TRUE' : 'FALSE' };
  if (value instanceof Date) {
    const instant = value.toISOString();
    return { type: 'date', raw: instant, text: instant };
  }
  if (typeof value === 'object' && 'error' in value && typeof value.error === 'string') {
    return { type: 'error', raw: value.error, text: value.error };
  }
  return undefined;
}

/** A cell's value as the grid keeps it, or undefined when it cannot be read; `noCache` for a formula with none. */
function cellRead(value: ExcelJS.CellValue): Read | 'no-cache' | undefined {
  const plain = scalar(value);
  if (plain !== undefined) return plain;
  if (typeof value !== 'object' || value === null) return undefined;
  if ('formula' in value || 'sharedFormula' in value) {
    const result = (value as { result?: unknown }).result;
    if (result === undefined) return 'no-cache';
    return scalar(result);
  }
  if ('richText' in value && Array.isArray(value.richText)) {
    const text = value.richText.map((run) => run.text).join('');
    return { type: 'text', raw: text, text };
  }
  if ('hyperlink' in value && 'text' in value) {
    // The link's target is never kept: the cell is its text, inert (GC6-17).
    const shown = (value as { text: unknown }).text;
    if (typeof shown === 'string') return { type: 'text', raw: shown, text: shown };
    if (typeof shown === 'object' && shown !== null && 'richText' in shown && Array.isArray(shown.richText)) {
      const text = (shown.richText as { text: string }[]).map((run) => run.text).join('');
      return { type: 'text', raw: text, text };
    }
    return undefined;
  }
  return undefined;
}

function sheetOf(
  worksheet: ExcelJS.Worksheet,
  position: number,
  notes: GridNote[],
  budget: { rowsLeft: number },
): GridSheet {
  const rows: GridRow[] = [];
  worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    budget.rowsLeft -= 1;
    if (budget.rowsLeft < 0) throw new TooManyRows();
    const cells: GridCell[] = [];
    row.eachCell({ includeEmpty: false }, (cell, columnNumber) => {
      // A merged cell's followers repeat the master's value; the master alone holds it (9.1).
      if (cell.isMerged && cell.master.address !== cell.address) return;
      const ref = cell.address;
      const read = cellRead(cell.value);
      if (read === undefined || read === 'no-cache') {
        notes.push({
          sheet: worksheet.name,
          ref,
          note: read === 'no-cache' ? 'formula-without-cached-value' : 'cell-not-read',
        });
        cells.push({ column: columnNumber, ref, ...EMPTY });
        return;
      }
      cells.push({ column: columnNumber, ref, ...read });
    });
    rows.push({ number: rowNumber, hidden: row.hidden, cells });
  });
  return { name: worksheet.name, position, state: SHEET_STATES[worksheet.state] ?? 'visible', rows };
}

/**
 * Reads an XLSX workbook into the neutral grid, or answers unreadable when it cannot be opened. With `maxRows`, the
 * rows holding a cell, of every sheet together, are counted, and a workbook with more is answered `too-many-rows`,
 * never read in part (9.3; S1-F06-T02).
 */
export async function readXlsx(bytes: Buffer, options: { readonly maxRows?: number } = {}): Promise<XlsxRead> {
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(bytes as unknown as ArrayBuffer);
  } catch {
    return { kind: 'unreadable' };
  }
  const notes: GridNote[] = [];
  const budget = { rowsLeft: options.maxRows ?? Number.POSITIVE_INFINITY };
  try {
    const sheets = workbook.worksheets.map((worksheet, index) => sheetOf(worksheet, index + 1, notes, budget));
    return { kind: 'read', grid: { sheets, notes } };
  } catch (error) {
    if (error instanceof TooManyRows) return { kind: 'too-many-rows' };
    throw error;
  }
}
