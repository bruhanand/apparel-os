import { describe, expect, it } from 'vitest';
import type { GridCell } from './grid.js';
import { validationReport, type ReportInput } from './report.js';

// S1-F06-T03: the validation report (imports-and-opening-data 6.6, 8.1 to 8.3; PRD-IMP-005, PRD-IMP-007,
// PRD-IMP-013, PRD-MOD-015). Every value here is SYNTHETIC.

function text(column: number, ref: string, raw: string): GridCell {
  return { column, ref, type: 'text', raw, text: raw };
}
function number(column: number, ref: string, raw: number): GridCell {
  return { column, ref, type: 'number', raw, text: String(raw) };
}

const id = (n: number) => `01900000-0000-7000-8000-0000000e${String(n).padStart(4, '0')}`;

const base: ReportInput = {
  layoutName: 'SYN-LAYOUT v1',
  mappingName: 'SYN-MAPPING v1',
  target: 'merchandise',
  layout: {
    shape: 'layout-version/1',
    format: 'xlsx',
    sheet: 'SYNTHETIC Products',
    headerRow: 1,
    dataStartRow: 2,
    columns: [
      { name: 'Style', required: true },
      { name: 'Units', required: false, type: 'number', restrictedClass: 'cost' },
    ],
    documentReference: 'Style',
    controlTotals: [{ column: 'Units', labelColumn: 'Style', label: 'SYN TOTAL' }],
  },
  mapping: {
    shape: 'mapping-version/1',
    fields: { styleCode: { column: 'Style', transform: 'text' }, units: { column: 'Units', transform: 'decimal' } },
  },
  fields: [
    { name: 'styleCode', required: true },
    { name: 'units', required: true },
  ],
  sheets: [
    { name: 'SYNTHETIC Notes', position: 1, state: 'hidden', rows: 3, imported: false },
    { name: 'SYNTHETIC Products', position: 2, state: 'visible', rows: 6, imported: true },
  ],
  documents: [],
  others: [
    {
      stagedRowId: id(1),
      sheet: 'SYNTHETIC Products',
      rowNumber: 1,
      hidden: false,
      role: 'header',
      cells: [text(1, 'A1', 'Style'), text(2, 'B1', 'Units')],
    },
  ],
};

const origin = (ref: string, raw: string | number) => ({
  sheet: 'SYNTHETIC Products',
  row: Number(ref.slice(1)),
  column: ref.slice(0, 1),
  ref,
  raw,
  cellType: typeof raw === 'number' ? ('number' as const) : ('text' as const),
  text: String(raw),
});

describe('validationReport (imports-and-opening-data 8)', () => {
  it('PRD-IMP-007 C-1: text in a required number column is Blocking, with its place, original value and correction', () => {
    const report = validationReport({
      ...base,
      documents: [
        {
          documentId: id(10),
          reference: 'S1',
          excluded: false,
          preview: { kind: 'would-create', records: [] },
          rows: [
            {
              stagedRowId: id(11),
              sheet: 'SYNTHETIC Products',
              rowNumber: 2,
              hidden: true,
              cells: [text(1, 'A2', 'S1'), text(2, 'B2', 'four')],
              values: {
                styleCode: { kind: 'supplied', value: 'S1', origin: origin('A2', 'S1') },
                units: { kind: 'unknown', because: 'not-a-number', origin: origin('B2', 'four') },
              },
            },
          ],
        },
      ],
    });
    expect(report.issues).toEqual([
      expect.objectContaining({ class: 'A-8', severity: 'Note', sheet: 'SYNTHETIC Notes' }),
      expect.objectContaining({ class: 'A-7', severity: 'Warning', code: 'files-imports.hidden-row', rowNumber: 2 }),
      {
        class: 'C-1',
        severity: 'Blocking',
        code: 'files-imports.not-a-number',
        correction: 'files-imports.correct-the-file-or-enter-the-value',
        rule: 'mapping SYN-MAPPING v1 field units',
        documentId: id(10),
        stagedRowId: id(11),
        sheet: 'SYNTHETIC Products',
        rowNumber: 2,
        column: 'B',
        field: 'units',
        original: 'four',
        restrictedClass: 'cost',
        missing: [],
      },
    ]);
  });

  it('PRD-MOD-015 a required field Unknown is Blocking; an entered value is known; an excluded document is not checked', () => {
    const row = (n: number, units: ReportInput['documents'][number]['rows'][number]['values']['units']) => ({
      stagedRowId: id(n),
      sheet: 'SYNTHETIC Products',
      rowNumber: n,
      hidden: false,
      cells: [text(1, `A${String(n)}`, `S${String(n)}`)],
      values: { styleCode: { kind: 'supplied' as const, value: 'S', origin: origin(`A${String(n)}`, 'S') }, units },
    });
    const preview = { kind: 'would-create' as const, records: [] };
    const report = validationReport({
      ...base,
      sheets: [],
      documents: [
        { documentId: id(20), reference: 'S2', excluded: false, preview, rows: [row(2, { kind: 'unknown' })] },
        {
          documentId: id(30),
          reference: 'S3',
          excluded: false,
          preview,
          rows: [row(3, { kind: 'entered', value: '4' })],
        },
        { documentId: id(40), reference: 'S4', excluded: true, preview, rows: [row(4, { kind: 'unknown' })] },
      ],
    });
    expect(report.issues.map((issue) => [issue.class, issue.severity, issue.code, issue.rowNumber])).toEqual([
      ['required', 'Blocking', 'files-imports.required-value-unknown', 2],
    ]);
  });

  it('PRD-IMP-013 K-1 compares a control total with the sum of the lines, and reports a difference', () => {
    const line = (n: number, units: number) => ({
      stagedRowId: id(n),
      sheet: 'SYNTHETIC Products',
      rowNumber: n,
      hidden: false,
      cells: [text(1, `A${String(n)}`, 'S'), number(2, `B${String(n)}`, units)],
      values: {
        styleCode: { kind: 'supplied' as const, value: 'S', origin: origin(`A${String(n)}`, 'S') },
        units: { kind: 'supplied' as const, value: String(units), origin: origin(`B${String(n)}`, units) },
      },
    });
    const report = validationReport({
      ...base,
      sheets: [],
      documents: [
        {
          documentId: id(50),
          reference: 'S',
          excluded: false,
          preview: { kind: 'would-create', records: [] },
          rows: [line(2, 1.5), line(3, 2)],
        },
      ],
      others: [
        ...base.others,
        {
          stagedRowId: id(4),
          sheet: 'SYNTHETIC Products',
          rowNumber: 4,
          hidden: false,
          role: 'total',
          cells: [text(1, 'A4', 'SYN Total'), number(2, 'B4', 4)],
        },
      ],
    });
    expect(report.controlTotals).toEqual([
      { sheet: 'SYNTHETIC Products', rowNumber: 4, column: 'Units', reported: '4', summed: '3.5' },
    ]);
    expect(report.issues).toEqual([
      expect.objectContaining({
        class: 'K-1',
        severity: 'Warning',
        code: 'files-imports.control-total-differs',
        missing: [{ kind: 'control-total', column: 'Units', reported: '4', summed: '3.5' }],
      }),
    ]);
  });

  it('PRD-IMP-007 A-4: a column holding data with no header text is Blocking; the handler finds the rest', () => {
    const report = validationReport({
      ...base,
      sheets: [],
      documents: [
        {
          documentId: id(60),
          reference: 'S',
          excluded: false,
          preview: {
            kind: 'issues',
            issues: [{ code: 'merchandise.record-not-found', field: 'styleCode', rowNumber: 2 }],
          },
          rows: [
            {
              stagedRowId: id(61),
              sheet: 'SYNTHETIC Products',
              rowNumber: 2,
              hidden: false,
              cells: [text(1, 'A2', 'S'), number(2, 'B2', 1), text(3, 'C2', 'stray')],
              values: {
                styleCode: { kind: 'supplied', value: 'S', origin: origin('A2', 'S') },
                units: { kind: 'supplied', value: '1', origin: origin('B2', 1) },
              },
            },
          ],
        },
      ],
    });
    expect(
      report.issues.map((issue) => [issue.class, issue.severity, issue.code, issue.column, issue.original]),
    ).toEqual([
      ['A-4', 'Blocking', 'files-imports.unlabelled-column', 'C', undefined],
      ['handler', 'Blocking', 'merchandise.record-not-found', 'A', 'S'],
    ]);
  });
});
