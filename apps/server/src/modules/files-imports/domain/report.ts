import { sumDecimals } from '@apparel-os/calculations';
import {
  normalisedName,
  type DocumentPreview,
  type FieldClass,
  type IssueClass,
  type IssueSeverity,
  type LayoutStructure,
  type MappingFields,
} from '@apparel-os/schemas';
import type { GridCell } from './grid.js';
import type { IdentityFinding } from './identity.js';
import { sameLabel, type RowRole, type SheetSummary, type StagedValue } from './staging.js';

// The validation report (imports-and-opening-data 6.6, 8.1 to 8.3; PRD-IMP-005, PRD-IMP-007, PRD-IMP-013,
// PRD-MOD-015; S1-F06-T03): the row issues of a batch version, each with its class, severity, place, original value,
// what is wrong, the correction needed and the rule applied, and the control totals against the sums of the lines.
// It runs the checks of 8.3 that synthetic master files in XLSX meet: A-4, A-7, A-8, A-10, A-11, C-1, C-2, G-1, J-1
// and K-1, a required field Unknown, a word that confirmed rules map to different targets, a calculated value that
// disagrees with the supplied one, and what the target's handler finds. An excluded document is not checked: it is
// not published (3.2). Pure: no database.

/** A value as validation reads it: from the file, or entered by a person, which is known. */
export type EffectiveValue = StagedValue | { readonly kind: 'entered'; readonly value: string };

export interface ReportRow {
  readonly stagedRowId: string;
  readonly sheet: string;
  readonly rowNumber: number;
  readonly hidden: boolean;
  readonly cells: readonly GridCell[];
}

export interface ReportDocument {
  readonly documentId: string;
  readonly reference: string;
  readonly excluded: boolean;
  readonly rows: readonly (ReportRow & { readonly values: Readonly<Record<string, EffectiveValue>> })[];
  /** The handler's preview of the document, which writes nothing (13.2). */
  readonly preview: DocumentPreview;
  /** What it is against the published document of its source identity (7.2, 7.3); new when none is published. */
  readonly identity?: IdentityFinding;
}

export interface ReportInput {
  /** How the rule applied is named, such as the layout's code and version. */
  readonly layoutName: string;
  readonly mappingName: string;
  readonly target: string;
  readonly layout: LayoutStructure;
  readonly mapping: MappingFields;
  /** The fields of the handler's staged row, with which a document needs known (PRD-MOD-015). */
  readonly fields: readonly { readonly name: string; readonly required: boolean }[];
  readonly sheets: readonly SheetSummary[];
  readonly documents: readonly ReportDocument[];
  readonly others: readonly (ReportRow & { readonly role: RowRole })[];
}

export interface IssueDraft {
  /** A problem class of 8.3 or an import class, from the one list the request schema and the database share. */
  readonly class: IssueClass;
  readonly severity: IssueSeverity;
  readonly code: string;
  readonly correction: string;
  readonly rule: string;
  readonly documentId?: string;
  readonly stagedRowId?: string;
  readonly sheet?: string;
  readonly rowNumber?: number;
  readonly column?: string;
  readonly field?: string;
  readonly original?: string;
  /** The class of the column the original value comes from, for masking it (section 11). */
  readonly restrictedClass?: FieldClass;
  readonly missing: readonly { readonly kind: string; readonly [field: string]: string }[];
}

export interface ControlTotalDraft {
  readonly sheet: string;
  readonly rowNumber: number;
  readonly column: string;
  /** The total the file reports, or null when it is no number. */
  readonly reported: string | null;
  /** The sum of the lines, or null (Unknown) when a line's value is not known; never zero (PRD-MOD-015). */
  readonly summed: string | null;
}

export interface Report {
  readonly issues: readonly IssueDraft[];
  readonly controlTotals: readonly ControlTotalDraft[];
}

const ENTER = 'files-imports.correct-the-file-or-enter-the-value';
const NO_ACTION = 'files-imports.no-action';
const DECIMAL = /^\d+(?:\.\d+)?$/;

function columnLetters(ref: string): string {
  return /^[A-Z]+/.exec(ref)?.[0] ?? '';
}

function cellAt(row: ReportRow, column: number | undefined): GridCell | undefined {
  return column === undefined ? undefined : row.cells.find((cell) => cell.column === column);
}

const shown = (cell: GridCell | undefined) => (cell === undefined ? undefined : cell.text);

/**
 * The column a field is read from, and the class it holds: the first of its inputs that holds one, a calculation kept
 * beside a supplied value counting as an input, since its value is worked out from those columns (section 11).
 */
function sourceOf(
  input: ReportInput,
  field: string,
): { readonly column?: string; readonly restrictedClass?: FieldClass } {
  const source = input.mapping.fields[field];
  if (source === undefined) return {};
  const names =
    'calculation' in source ? source.calculation.columns : [source.column, ...(source.alsoCalculated?.columns ?? [])];
  const columns = names.map((name) =>
    input.layout.columns.find((each) => normalisedName(each.name) === normalisedName(name)),
  );
  const classed = columns.find((column) => column?.restrictedClass !== undefined);
  return {
    ...(names[0] === undefined ? {} : { column: names[0] }),
    ...(classed?.restrictedClass === undefined ? {} : { restrictedClass: classed.restrictedClass }),
  };
}

/** The class, severity and code of a value Unknown because of what its cell holds (8.3). */
function unknownIssue(because: string, required: boolean): Pick<IssueDraft, 'class' | 'severity' | 'code'> | undefined {
  switch (because) {
    case 'error-cell':
      return { class: 'J-1', severity: required ? 'Blocking' : 'Warning', code: 'files-imports.error-cell' };
    case 'not-a-number':
      return { class: 'C-1', severity: required ? 'Blocking' : 'Warning', code: 'files-imports.not-a-number' };
    case 'not-read':
      return { class: 'A-11', severity: required ? 'Blocking' : 'Warning', code: 'files-imports.cell-not-read' };
    case 'finer-than-paise':
      return { class: 'C-2', severity: 'Warning', code: 'files-imports.finer-than-paise' };
    case 'ambiguous-rules':
      return { class: 'rule', severity: 'Warning', code: 'files-imports.rules-disagree' };
    default:
      return undefined;
  }
}

/** Two decimals compared exactly where both are decimals; otherwise as text. */
function same(a: string, b: string): boolean {
  if (DECIMAL.test(a) && DECIMAL.test(b)) return sumDecimals([a]) === sumDecimals([b]);
  return a === b;
}

function valueIssues(input: ReportInput, document: ReportDocument): IssueDraft[] {
  const issues: IssueDraft[] = [];
  const required = new Set(input.fields.filter((field) => field.required).map((field) => field.name));
  for (const row of document.rows) {
    const place = {
      documentId: document.documentId,
      stagedRowId: row.stagedRowId,
      sheet: row.sheet,
      rowNumber: row.rowNumber,
    };
    if (row.hidden) {
      issues.push({
        ...place,
        class: 'A-7',
        severity: 'Warning',
        code: 'files-imports.hidden-row',
        correction: 'files-imports.check-the-hidden-row',
        rule: `layout ${input.layoutName}`,
        missing: [],
      });
    }
    for (const field of input.fields) {
      const value = row.values[field.name] ?? { kind: 'unknown' as const };
      const source = sourceOf(input, field.name);
      const where = {
        ...place,
        field: field.name,
        ...(source.column === undefined ? {} : { column: source.column }),
        ...(source.restrictedClass === undefined ? {} : { restrictedClass: source.restrictedClass }),
      };
      const rule = `mapping ${input.mappingName} field ${field.name}`;
      if (value.kind === 'unknown') {
        const original = value.origin?.text;
        const cause = value.because === undefined ? undefined : unknownIssue(value.because, required.has(field.name));
        if (cause !== undefined) {
          issues.push({
            ...where,
            ...cause,
            ...(value.origin === undefined ? {} : { column: value.origin.column }),
            ...(original === undefined ? {} : { original }),
            correction: cause.class === 'rule' ? 'files-imports.confirm-one-rule-or-enter-the-value' : ENTER,
            rule: cause.class === 'rule' ? `mapping rules of ${input.target}.${field.name}` : rule,
            missing: (value.rules ?? []).map((ruleId) => ({ kind: 'mapping-rule', ruleId })),
          });
        }
        if (required.has(field.name) && cause?.severity !== 'Blocking') {
          issues.push({
            ...where,
            class: 'required',
            severity: 'Blocking',
            code: 'files-imports.required-value-unknown',
            correction: ENTER,
            rule,
            missing: [],
          });
        }
      }
      if (value.kind === 'supplied' && value.calculated !== undefined) {
        const calculated = value.calculated.value;
        if (calculated === null || !same(calculated, value.value)) {
          issues.push({
            ...where,
            class: 'calculation',
            severity: 'Warning',
            code: 'files-imports.calculated-differs',
            correction: 'files-imports.check-the-supplied-against-the-calculated',
            rule: `${rule} calculation ${value.calculated.calculation.name}/1`,
            original: value.origin.text,
            missing: [{ kind: 'calculated', value: calculated ?? 'unknown' }],
          });
        }
      }
    }
  }
  if (document.preview.kind === 'issues') {
    for (const issue of document.preview.issues) {
      // A required field Unknown is reported above with its place; the handler's own findings follow it.
      if (issue.code === 'files-imports.required-value-unknown') continue;
      const row = document.rows.find((each) => each.rowNumber === issue.rowNumber);
      const source = issue.field === undefined ? {} : sourceOf(input, issue.field);
      const value = issue.field === undefined ? undefined : row?.values[issue.field];
      const cellOrigin =
        value === undefined
          ? undefined
          : value.kind === 'supplied' || value.kind === 'mapped'
            ? value.origin
            : undefined;
      const original = cellOrigin?.text;
      issues.push({
        documentId: document.documentId,
        ...(row === undefined ? {} : { stagedRowId: row.stagedRowId, sheet: row.sheet, rowNumber: row.rowNumber }),
        ...(issue.field === undefined ? {} : { field: issue.field }),
        ...(cellOrigin === undefined
          ? source.column === undefined
            ? {}
            : { column: source.column }
          : { column: cellOrigin.column }),
        ...(source.restrictedClass === undefined ? {} : { restrictedClass: source.restrictedClass }),
        ...(original === undefined ? {} : { original }),
        class: 'handler',
        severity: 'Blocking',
        code: issue.code,
        correction: 'files-imports.correct-the-reference-or-enter-the-value',
        rule: `handler ${input.target}`,
        missing: issue.missing ?? [],
      });
    }
  }
  return issues;
}

/** The checks of the file's structure (8.1, 8.3): sheets, hidden sheet, unlabelled columns, note and filler rows. */
function fileIssues(input: ReportInput): IssueDraft[] {
  const issues: IssueDraft[] = [];
  const rule = `layout ${input.layoutName}`;
  for (const sheet of input.sheets) {
    if (sheet.imported && sheet.state !== 'visible') {
      issues.push({
        class: 'A-7',
        severity: 'Warning',
        code: 'files-imports.hidden-sheet',
        correction: 'files-imports.check-the-hidden-row',
        rule,
        sheet: sheet.name,
        missing: [],
      });
    }
    if (!sheet.imported) {
      issues.push({
        class: 'A-8',
        severity: 'Note',
        code: 'files-imports.sheet-not-imported',
        correction: NO_ACTION,
        rule,
        sheet: sheet.name,
        missing: [{ kind: 'sheet-rows', rows: String(sheet.rows), state: sheet.state }],
      });
    }
  }
  const header = input.others.find((row) => row.role === 'header');
  const labelled = new Set(
    (header?.cells ?? []).filter((cell) => cell.type !== 'empty' && cell.text.trim() !== '').map((cell) => cell.column),
  );
  const unlabelled = new Map<number, string>();
  for (const document of input.documents) {
    if (document.excluded) continue;
    for (const row of document.rows) {
      for (const cell of row.cells) {
        if (cell.type !== 'empty' && !labelled.has(cell.column)) unlabelled.set(cell.column, columnLetters(cell.ref));
      }
    }
  }
  for (const [, letters] of [...unlabelled].sort(([a], [b]) => a - b)) {
    issues.push({
      class: 'A-4',
      severity: 'Blocking',
      code: 'files-imports.unlabelled-column',
      correction: 'files-imports.label-the-column-in-the-layout',
      rule,
      ...(header === undefined ? {} : { sheet: header.sheet }),
      column: letters,
      missing: [],
    });
  }
  for (const row of input.others) {
    if (row.role !== 'note' && row.role !== 'filler') continue;
    const text = row.cells.find((cell) => cell.type !== 'empty')?.text;
    issues.push({
      class: 'A-10',
      severity: 'Note',
      code: row.role === 'note' ? 'files-imports.note-row' : 'files-imports.filler-row',
      correction: NO_ACTION,
      rule,
      stagedRowId: row.stagedRowId,
      sheet: row.sheet,
      rowNumber: row.rowNumber,
      ...(row.role === 'note' && text !== undefined ? { original: text } : {}),
      missing: [],
    });
  }
  return issues;
}

/** The control totals the file reports against the sums of its lines (6.6; G-1, K-1; PRD-IMP-013). */
function controlTotals(input: ReportInput): { totals: ControlTotalDraft[]; issues: IssueDraft[] } {
  const totals: ControlTotalDraft[] = [];
  const issues: IssueDraft[] = [];
  const header = input.others.find((row) => row.role === 'header');
  const columnOf = (name: string) =>
    header?.cells.find((cell) => normalisedName(cell.text) === normalisedName(name))?.column;
  const lines = input.documents.filter((document) => !document.excluded).flatMap((document) => document.rows);
  for (const row of input.others.filter((each) => each.role === 'total')) {
    for (const rule of input.layout.controlTotals ?? []) {
      const label = shown(cellAt(row, columnOf(rule.labelColumn)));
      if (label === undefined || !sameLabel(label, rule.label)) continue;
      const column = columnOf(rule.column);
      const reportedText = shown(cellAt(row, column))?.trim();
      const reported = reportedText !== undefined && DECIMAL.test(reportedText) ? reportedText : null;
      const lineTexts = lines.map((line) => shown(cellAt(line, column))?.trim());
      const summed = lineTexts.every((text): text is string => text !== undefined && DECIMAL.test(text))
        ? sumDecimals(lineTexts)
        : null;
      totals.push({ sheet: row.sheet, rowNumber: row.rowNumber, column: rule.column, reported, summed });
      if (reported === null || summed === null || !same(reported, summed)) {
        issues.push({
          class: 'K-1',
          severity: 'Warning',
          code: 'files-imports.control-total-differs',
          correction: 'files-imports.check-the-total-against-the-lines',
          rule: `layout ${input.layoutName} control total ${rule.column}`,
          stagedRowId: row.stagedRowId,
          sheet: row.sheet,
          rowNumber: row.rowNumber,
          ...(reportedText === undefined ? {} : { original: reportedText }),
          missing: [
            {
              kind: 'control-total',
              column: rule.column,
              reported: reported ?? 'unknown',
              summed: summed ?? 'unknown',
            },
          ],
        });
      }
    }
  }
  return { totals, issues };
}

/**
 * A document against the published document of its source identity (7.2, 7.3; PRD-IMP-011, PRD-ACP-012): a duplicate
 * has no effect and is a Note; other content is a conflict, Blocking until the document is excluded or imported as a
 * governed revision; a governed revision is a Note naming what it revises.
 */
function identityIssues(input: ReportInput, document: ReportDocument): IssueDraft[] {
  const identity = document.identity;
  if (identity === undefined || identity.kind === 'new') return [];
  const place = { documentId: document.documentId, original: document.reference };
  const rule = `source identity ${input.target}`;
  const missing = [{ kind: 'import-document', documentId: identity.of }];
  switch (identity.kind) {
    case 'duplicate':
      return [
        {
          ...place,
          class: 'duplicate',
          severity: 'Note',
          code: 'files-imports.duplicate-document',
          correction: NO_ACTION,
          rule,
          missing,
        },
      ];
    case 'conflict':
      return [
        {
          ...place,
          class: 'conflict',
          severity: 'Blocking',
          code: 'files-imports.conflicting-document',
          correction: 'files-imports.exclude-or-import-as-a-revision',
          rule,
          missing,
        },
      ];
    case 'revision':
      return [
        {
          ...place,
          class: 'revision',
          severity: 'Note',
          code: 'files-imports.revises-document',
          correction: NO_ACTION,
          rule,
          missing,
        },
      ];
  }
}

/** Whether a document is checked for publishing: neither excluded nor a duplicate or a conflict, which never publish. */
export function checkedForPublishing(document: Pick<ReportDocument, 'excluded' | 'identity'>): boolean {
  const kind = document.identity?.kind;
  return !document.excluded && kind !== 'duplicate' && kind !== 'conflict';
}

/** The validation report of one batch version. */
export function validationReport(input: ReportInput): Report {
  const totals = controlTotals(input);
  return {
    issues: [
      ...fileIssues(input),
      ...input.documents
        .filter((document) => !document.excluded)
        .flatMap((document) => identityIssues(input, document)),
      ...input.documents.filter(checkedForPublishing).flatMap((document) => valueIssues(input, document)),
      ...totals.issues,
    ],
    controlTotals: totals.totals,
  };
}
