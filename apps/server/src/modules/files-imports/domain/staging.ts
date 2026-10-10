import { rupeesToPaise, sumDecimals } from '@apparel-os/calculations';
import {
  ENCRYPTED_FIELD_CLASSES,
  normalisedName,
  type Calculation,
  type CalculationOrigin,
  type FieldClass,
  type FileStagedValue,
  type LayoutStructure,
  type MappingFields,
  type SuppliedOriginView,
  type UnknownBecause,
} from '@apparel-os/schemas';
import type { Grid, GridCell, GridNote, GridRow, GridSheet } from './grid.js';
import { matchRule, type RuleInForce, type RuleScopes } from './rules.js';

// Map and stage (imports-and-opening-data 3.1 step 5, section 5, 6.1 to 6.6, 11; PRD-IMP-003, PRD-IMP-006,
// PRD-MOD-014, PRD-MOD-015; S1-F06-T01, S1-F06-T03). A layout version records the structure of a file, never data; a
// mapping version fills one target's fields from it. Staging keeps every original cell of a row, except a column of
// an encrypted class, which is left out (section 11), and marks each normalised value with its origin: Supplied,
// Calculated by a named function with its version and inputs, or Mapped by a confirmed rule with the original word
// kept. A value the file gives that cannot be read for its field stays Unknown with the reason, never zero
// (PRD-MOD-015). Pure: no database.

export type { LayoutStructure, MappingFields };
export type StagedValue = FileStagedValue;
export type SuppliedOrigin = SuppliedOriginView;

/** A row's role (6.6): data, the header, a control total, filler or a free-text note. */
export type RowRole = 'data' | 'header' | 'total' | 'filler' | 'note';

export interface StagedRowDraft {
  readonly sheet: string;
  readonly rowNumber: number;
  readonly role: RowRole;
  readonly hidden: boolean;
  /** Every original cell of the row, as read, but a column of an encrypted class (section 11); never changed. */
  readonly cells: readonly GridCell[];
  /** The target's fields, each with its origin or Unknown. Empty for a row that is not data. */
  readonly values: Readonly<Record<string, StagedValue>>;
}

export interface StagedDocumentDraft {
  readonly reference: string;
  readonly rows: readonly StagedRowDraft[];
}

/** A sheet as the reader found it (8.1; A-7, A-8): its state and row count, and whether the layout imports it. */
export interface SheetSummary {
  readonly name: string;
  readonly position: number;
  readonly state: GridSheet['state'];
  readonly rows: number;
  readonly imported: boolean;
}

export interface Staged {
  readonly kind: 'staged';
  readonly documents: readonly StagedDocumentDraft[];
  /** The header and the rows below it that are not data, each with its role, counted and shown (6.6). */
  readonly others: readonly StagedRowDraft[];
  readonly sheets: readonly SheetSummary[];
}

export interface Refused {
  readonly kind: 'refused';
  readonly code: 'files-imports.layout-not-matched';
  readonly missing: readonly { readonly kind: string; readonly [field: string]: string }[];
}

/** What staging reads besides the file: the target, the rules in force and the scopes the batch reads them in (6.3). */
export interface StagingContext {
  readonly target: string;
  readonly rules: readonly RuleInForce[];
  readonly scopes: RuleScopes;
}

export { normalisedName };

/** The columns found at a sheet's header row, by normalised name. */
interface Found {
  readonly sheet: GridSheet;
  readonly columns: ReadonlyMap<string, number>;
}

/**
 * Whether a file matches a layout version's structure (6.5, 6.6; PRD-IMP-004): its sheet, every required column at
 * its header row, and no labelled column the layout does not know (A-4). The reason names what does not match.
 */
export function compatibility(grid: Grid, layout: LayoutStructure): Found | Refused {
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
  const known = new Set(layout.columns.map((column) => normalisedName(column.name)));
  const missing: { kind: string; [field: string]: string }[] = [];
  for (const cell of header?.cells ?? []) {
    const name = cellText(cell);
    if (name === '') continue;
    columns.set(name, cell.column);
    if (!known.has(name)) missing.push({ kind: 'layout-unknown-column', column: name });
  }
  for (const column of layout.columns) {
    if (column.required && !columns.has(normalisedName(column.name))) {
      missing.unshift({ kind: 'layout-column', column: column.name });
    }
  }
  if (missing.length > 0) return { kind: 'refused', code: 'files-imports.layout-not-matched', missing };
  return { sheet, columns };
}

function cellText(cell: GridCell): string {
  if (cell.type === 'empty' || cell.type === 'error') return '';
  return normalisedName(typeof cell.raw === 'string' ? cell.raw : cell.text);
}

function columnLetters(ref: string): string {
  return /^[A-Z]+/.exec(ref)?.[0] ?? '';
}

function originOf(sheet: string, row: number, cell: GridCell): SuppliedOrigin {
  return {
    sheet,
    row,
    column: columnLetters(cell.ref),
    ref: cell.ref,
    raw: cell.raw,
    cellType: cell.type,
    text: cell.text,
  };
}

/** A signed decimal as a spreadsheet writes it: digits, optionally a point and more digits. */
const DECIMAL = /^-?\d+(?:\.\d+)?$/;
const UNKNOWN: StagedValue = { kind: 'unknown' };

/** A cell read for a field: its text and origin, or why it gives none (A-11, J-1). */
type Read =
  | { readonly kind: 'value'; readonly text: string; readonly origin: SuppliedOrigin }
  | { readonly kind: 'unknown'; readonly because?: UnknownBecause; readonly origin?: SuppliedOrigin };

interface RowReader {
  readonly sheet: string;
  readonly row: GridRow;
  readonly notes: ReadonlySet<string>;
  readonly columns: ReadonlyMap<string, number>;
  readonly types: ReadonlyMap<string, LayoutStructure['columns'][number]['type']>;
}

function readColumn(reader: RowReader, name: string): Read {
  const at = reader.columns.get(normalisedName(name));
  const cell = at === undefined ? undefined : reader.row.cells.find((each) => each.column === at);
  if (cell === undefined || cell.type === 'empty') {
    if (cell !== undefined && reader.notes.has(cell.ref)) {
      return { kind: 'unknown', because: 'not-read', origin: originOf(reader.sheet, reader.row.number, cell) };
    }
    return { kind: 'unknown' };
  }
  const origin = originOf(reader.sheet, reader.row.number, cell);
  if (cell.type === 'error') return { kind: 'unknown', because: 'error-cell', origin };
  const text = (typeof cell.raw === 'string' ? cell.raw : cell.text).trim();
  if (text === '') return { kind: 'unknown' };
  const type = reader.types.get(normalisedName(name)) ?? 'text';
  // A number or money column holds a decimal; text in it is an error for that field, kept as text, never zero (C-1).
  if (type !== 'text' && !DECIMAL.test(text)) return { kind: 'unknown', because: 'not-a-number', origin };
  return { kind: 'value', text, origin };
}

/** The `decimal` and `paise` transforms (6.2): exact decimal arithmetic through `packages/calculations`. */
function transformed(read: Extract<Read, { kind: 'value' }>, transform: 'text' | 'decimal' | 'paise'): StagedValue {
  if (transform === 'text') return { kind: 'supplied', value: read.text, origin: read.origin };
  if (!DECIMAL.test(read.text)) return { kind: 'unknown', because: 'not-a-number', origin: read.origin };
  if (transform === 'decimal') return { kind: 'supplied', value: read.text, origin: read.origin };
  if (read.text.startsWith('-')) return { kind: 'unknown', because: 'not-a-number', origin: read.origin };
  const amount = rupeesToPaise(read.text);
  if (amount.kind === 'finer-than-paise') return { kind: 'unknown', because: 'finer-than-paise', origin: read.origin };
  return { kind: 'supplied', value: String(amount.paise), origin: read.origin };
}

/** A named calculation (6.2; section 5 "Calculated"): its value, or Unknown when an input is Unknown. */
function calculate(
  reader: RowReader,
  calculation: Calculation,
): { readonly value: string | null; readonly origin: CalculationOrigin } {
  const reads = calculation.columns.map((column) => readColumn(reader, column));
  const inputs = reads.flatMap((read) => (read.origin === undefined ? [] : [read.origin]));
  const origin: CalculationOrigin = { name: calculation.name, version: 1, inputs };
  const texts = reads.flatMap((read) => (read.kind === 'value' ? [read.text] : []));
  if (texts.length !== reads.length) return { value: null, origin };
  if (calculation.name === 'join') return { value: texts.join(calculation.separator ?? ''), origin };
  if (!texts.every((text) => DECIMAL.test(text) && !text.startsWith('-'))) return { value: null, origin };
  const sum = sumDecimals(texts);
  if (calculation.as !== 'paise') return { value: sum, origin };
  const amount = rupeesToPaise(sum);
  return { value: amount.kind === 'paise' ? String(amount.paise) : null, origin };
}

function fieldValue(
  reader: RowReader,
  field: string,
  source: MappingFields['fields'][string],
  context: StagingContext,
): StagedValue {
  if ('calculation' in source) {
    const result = calculate(reader, source.calculation);
    if (result.value === null) return { kind: 'unknown', because: 'input-unknown' };
    return { kind: 'calculated', value: result.value, calculation: result.origin };
  }
  const read = readColumn(reader, source.column);
  if (read.kind === 'unknown') {
    return read.because === undefined ? UNKNOWN : { kind: 'unknown', because: read.because, origin: read.origin };
  }
  const value = transformed(read, source.transform);
  if (value.kind !== 'supplied') return value;
  if (source.rules === true) {
    const match = matchRule(context.rules, `${context.target}.${field}`, read.text, context.scopes);
    if (match.kind === 'mapped') {
      return {
        kind: 'mapped',
        value: match.target,
        word: read.text,
        origin: read.origin,
        rule: { ruleId: match.ruleId, ruleVersionId: match.ruleVersionId },
      };
    }
    if (match.kind === 'ambiguous') {
      return { kind: 'unknown', because: 'ambiguous-rules', origin: read.origin, rules: [...match.ruleIds] };
    }
  }
  if (source.alsoCalculated === undefined) return value;
  // Kept beside the supplied value, never replacing it; a disagreement is a row issue (section 5).
  const calculated = calculate(reader, source.alsoCalculated);
  return { ...value, calculated: { value: calculated.value, calculation: calculated.origin } };
}

/** Whether a cell holds a control total's label: compared trimmed, spaces collapsed, case ignored (6.6). */
export function sameLabel(text: string, label: string): boolean {
  return normalisedName(text).toLowerCase() === normalisedName(label).toLowerCase();
}

/** The columns of an encrypted class, whose cells are left out of staging (section 11). */
function leftOutColumns(layout: LayoutStructure, columns: ReadonlyMap<string, number>): ReadonlySet<number> {
  const encrypted = new Set<FieldClass>(ENCRYPTED_FIELD_CLASSES);
  const left = new Set<number>();
  for (const column of layout.columns) {
    const at = columns.get(normalisedName(column.name));
    if (at !== undefined && column.restrictedClass !== undefined && encrypted.has(column.restrictedClass)) left.add(at);
  }
  return left;
}

/**
 * The role of a row below the header that is not data (6.6; A-10, G-1): a control total when its label column holds a
 * total rule's label; a note when it holds one text cell; filler otherwise.
 */
function otherRole(reader: RowReader, layout: LayoutStructure): RowRole {
  for (const total of layout.controlTotals ?? []) {
    const label = readColumn(reader, total.labelColumn);
    if (label.kind === 'value' && sameLabel(label.text, total.label)) return 'total';
  }
  const filled = reader.row.cells.filter((cell) => cell.type !== 'empty');
  return filled.length === 1 && filled[0]?.type === 'text' ? 'note' : 'filler';
}

/** Stages a grid with one layout version and one mapping version, or refuses when the file does not match it. */
export function stage(
  grid: Grid,
  layout: LayoutStructure,
  mapping: MappingFields,
  context: StagingContext,
): Staged | Refused {
  const found = compatibility(grid, layout);
  if ('kind' in found) return found;
  const { sheet, columns } = found;
  const notes = new Set(
    grid.notes.flatMap((note: GridNote) => (note.sheet === sheet.name && note.ref !== undefined ? [note.ref] : [])),
  );
  const types = new Map(layout.columns.map((column) => [normalisedName(column.name), column.type ?? 'text']));
  const left = leftOutColumns(layout, columns);
  const keep = (row: GridRow) => row.cells.filter((cell) => !left.has(cell.column));
  const documents = new Map<string, StagedRowDraft[]>();
  const others: StagedRowDraft[] = [];
  for (const row of sheet.rows) {
    const base = { sheet: sheet.name, rowNumber: row.number, hidden: row.hidden, cells: keep(row) };
    if (row.number === layout.headerRow) {
      others.push({ ...base, role: 'header', values: {} });
      continue;
    }
    if (row.number < layout.dataStartRow) continue;
    const reader: RowReader = { sheet: sheet.name, row, notes, columns, types };
    const reference = readColumn({ ...reader, types: new Map() }, layout.documentReference);
    if (reference.kind !== 'value') {
      others.push({ ...base, role: otherRole(reader, layout), values: {} });
      continue;
    }
    const values: Record<string, StagedValue> = {};
    for (const [field, source] of Object.entries(mapping.fields))
      values[field] = fieldValue(reader, field, source, context);
    const rows = documents.get(reference.text) ?? [];
    rows.push({ ...base, role: 'data', values });
    documents.set(reference.text, rows);
  }
  const sheets = grid.sheets.map((each) => ({
    name: each.name,
    position: each.position,
    state: each.state,
    rows: each.rows.length,
    imported: each === sheet,
  }));
  return {
    kind: 'staged',
    documents: [...documents].map(([reference, rows]) => ({ reference, rows })),
    others,
    sheets,
  };
}
