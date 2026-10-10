import type { FieldClass } from '@apparel-os/schemas';
import type { CellType, Grid, GridCell, GridRow } from './grid.js';

// Map and stage (imports-and-opening-data 3.1 step 5, section 5, 6.1, 6.2, 6.6; PRD-IMP-003, PRD-IMP-006,
// PRD-MOD-015; S1-F06-T01). A layout version records the structure of a file, never data; a mapping version fills one
// target's fields from it. Staging keeps every original cell of a row and marks each normalised value with its origin.
// As built for the tracer: one sheet named by the layout, one header row, columns found by name, one reference
// column grouping data rows into documents, and the transform `text` (trimmed). Detection, more transforms, named
// calculations, mapping rules and the row roles beyond data and ignored are S1-F06-T03's. Pure: no database.

/** The structure a layout version records (6.1), as built for stage 1. Never a value of the file. */
export interface LayoutStructure {
  readonly shape: 'layout-version/1';
  readonly format: 'xlsx';
  /** The sheet, by name; names compare trimmed with spaces collapsed (6.1). */
  readonly sheet: string;
  readonly headerRow: number;
  readonly dataStartRow: number;
  readonly columns: readonly {
    readonly name: string;
    readonly required: boolean;
    /** The restricted field class the column holds, where it holds one (section 11). */
    readonly restrictedClass?: FieldClass | undefined;
  }[];
  /** The column whose value is the document reference (7.1); a row is data only when it is filled (6.6). */
  readonly documentReference: string;
}

/** The transforms a mapping may name (6.2). As built: `text`, the cell's text trimmed. */
export type Transform = 'text';

/** How a mapping version fills a target's fields from a layout version's columns (6.2). */
export interface MappingFields {
  readonly shape: 'mapping-version/1';
  readonly fields: Readonly<Record<string, { readonly column: string; readonly transform: Transform }>>;
}

/** Where a Supplied value came from (section 5): sheet, row, column, raw value, cell type and displayed text. */
export interface SuppliedOrigin {
  readonly sheet: string;
  readonly row: number;
  /** The column's letters, such as `B`. */
  readonly column: string;
  readonly ref: string;
  readonly raw: GridCell['raw'];
  readonly cellType: CellType;
  readonly text: string;
}

/** A staged value: Supplied with its origin, or Unknown. Nothing gets a default (6.2; PRD-MOD-015). */
export type StagedValue =
  { readonly kind: 'unknown' } | { readonly kind: 'supplied'; readonly value: string; readonly origin: SuppliedOrigin };

export interface StagedRowDraft {
  readonly sheet: string;
  readonly rowNumber: number;
  readonly role: 'data' | 'ignored';
  readonly hidden: boolean;
  /** Every original cell of the row, as read; never changed (15.1). */
  readonly cells: readonly GridCell[];
  /** The target's fields, each Supplied or Unknown. Empty for an ignored row. */
  readonly values: Readonly<Record<string, StagedValue>>;
}

export interface StagedDocumentDraft {
  readonly reference: string;
  readonly rows: readonly StagedRowDraft[];
}

export type Staged =
  | {
      readonly kind: 'staged';
      readonly documents: readonly StagedDocumentDraft[];
      /** Rows below the header that are not data, counted and shown (6.6). */
      readonly ignored: readonly StagedRowDraft[];
    }
  | {
      readonly kind: 'refused';
      readonly code: 'files-imports.layout-not-matched';
      readonly missing: readonly { readonly kind: string; readonly [field: string]: string }[];
    };

/** A name as layouts compare it: trimmed, with runs of spaces collapsed (6.1). */
export function normalisedName(name: string): string {
  return name.trim().replace(/\s+/g, ' ');
}

const UNKNOWN: StagedValue = { kind: 'unknown' };

function columnLetters(ref: string): string {
  return /^[A-Z]+/.exec(ref)?.[0] ?? '';
}

/** The `text` transform: the cell's value as text, trimmed; an empty cell, an error or blank text is Unknown. */
function textValue(sheet: string, row: number, cell: GridCell | undefined): StagedValue {
  if (cell === undefined || cell.type === 'empty' || cell.type === 'error') return UNKNOWN;
  const value = (typeof cell.raw === 'string' ? cell.raw : cell.text).trim();
  if (value === '') return UNKNOWN;
  return {
    kind: 'supplied',
    value,
    origin: {
      sheet,
      row,
      column: columnLetters(cell.ref),
      ref: cell.ref,
      raw: cell.raw,
      cellType: cell.type,
      text: cell.text,
    },
  };
}

function cellAt(row: GridRow, column: number): GridCell | undefined {
  return row.cells.find((cell) => cell.column === column);
}

/** Stages a grid with one layout version and one mapping version, or refuses when the file does not match it. */
export function stage(grid: Grid, layout: LayoutStructure, mapping: MappingFields): Staged {
  const wanted = normalisedName(layout.sheet);
  const sheet = grid.sheets.find((each) => normalisedName(each.name) === wanted);
  if (sheet === undefined) {
    return {
      kind: 'refused',
      code: 'files-imports.layout-not-matched',
      missing: [{ kind: 'layout-sheet', sheet: layout.sheet }],
    };
  }
  const header = sheet.rows.find((row) => row.number === layout.headerRow);
  const columns = new Map<string, number>();
  for (const cell of header?.cells ?? []) {
    if (cell.type === 'text' && typeof cell.raw === 'string') columns.set(normalisedName(cell.raw), cell.column);
  }
  const missing = layout.columns
    .filter((column) => column.required && !columns.has(normalisedName(column.name)))
    .map((column) => ({ kind: 'layout-column', column: column.name }));
  if (missing.length > 0) return { kind: 'refused', code: 'files-imports.layout-not-matched', missing };
  const at = (name: string) => columns.get(normalisedName(name));
  const referenceColumn = at(layout.documentReference);
  const documents = new Map<string, StagedRowDraft[]>();
  const ignored: StagedRowDraft[] = [];
  for (const row of sheet.rows) {
    if (row.number < layout.dataStartRow || row.number === layout.headerRow) continue;
    const reference = textValue(
      sheet.name,
      row.number,
      referenceColumn === undefined ? undefined : cellAt(row, referenceColumn),
    );
    const base = { sheet: sheet.name, rowNumber: row.number, hidden: row.hidden, cells: row.cells };
    if (reference.kind === 'unknown') {
      ignored.push({ ...base, role: 'ignored', values: {} });
      continue;
    }
    const values: Record<string, StagedValue> = {};
    for (const [field, source] of Object.entries(mapping.fields)) {
      const column = at(source.column);
      values[field] = textValue(sheet.name, row.number, column === undefined ? undefined : cellAt(row, column));
    }
    const rows = documents.get(reference.value) ?? [];
    rows.push({ ...base, role: 'data', values });
    documents.set(reference.value, rows);
  }
  return {
    kind: 'staged',
    documents: [...documents].map(([reference, rows]) => ({ reference, rows })),
    ignored,
  };
}
