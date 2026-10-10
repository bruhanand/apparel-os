// The neutral grid every format reader produces, so detection, mapping and validation never depend on the format
// (imports-and-opening-data 9.1). Plain types only (code-house-rules 2). As built for stage 1 (S1-F06-T01): sheets
// with their order and hidden state, rows with their hidden mark, cells with their raw value, type and displayed text,
// and notes for what the reader could not read. Merged ranges and filters join it with the checks that read them
// (S1-F06-T03; S2-F13).

/** A cell's type (9.1). An error is its own type, never text or zero (J-1); empty is no value. */
export type CellType = 'text' | 'number' | 'date' | 'boolean' | 'error' | 'empty';

export interface GridCell {
  /** The column's number, from 1. */
  readonly column: number;
  /** The cell's reference, such as `B3`. */
  readonly ref: string;
  readonly type: CellType;
  /**
   * The raw value: a text, a number as the reader gives it, a boolean, a date as its ISO instant, an error's code
   * (`#N/A`), or null for empty. For a formula, its cached value only; no formula is evaluated (A-10).
   */
  readonly raw: string | number | boolean | null;
  /** The text the cell shows, where the format gives it; a number is its shortest decimal form. */
  readonly text: string;
}

export interface GridRow {
  /** The row's number in its sheet, from 1. */
  readonly number: number;
  readonly hidden: boolean;
  readonly cells: readonly GridCell[];
}

export type SheetState = 'visible' | 'hidden' | 'very-hidden';

export interface GridSheet {
  readonly name: string;
  /** The sheet's place in the workbook, from 1. */
  readonly position: number;
  readonly state: SheetState;
  readonly rows: readonly GridRow[];
}

/** Something the reader skipped or could not read, cell by cell (A-11). One bad cell never stops the file. */
export interface GridNote {
  readonly sheet: string;
  readonly ref?: string;
  readonly note: 'formula-without-cached-value' | 'cell-not-read';
}

export interface Grid {
  readonly sheets: readonly GridSheet[];
  readonly notes: readonly GridNote[];
}
