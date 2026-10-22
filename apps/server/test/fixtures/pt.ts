import ExcelJS from 'exceljs';
import { syntheticCode, syntheticFileName, syntheticName } from './synthetic.js';

// S2-F04-T02: a SYNTHETIC replica of the Organisation's PT template, its layout and its mapping to the PT handler's
// fields, and a generator of PT files filled in it (goods-in 5.2, 5.3; code-house-rules 11.1). The template's 20 columns
// and two hints are those PRD-PTW-008 names; the empty narrow column between MARGIN and the hints is kept, as the data
// notes describe the template (pt-file-layouts 1.2). Nothing here is a KDPS value, list or layout: the data notes'
// layouts are samples, never settings, and every value a file holds here is SYNTHETIC.

/** The template's columns in order, an empty string for the unlabelled one (pt-file-layouts 1.2). */
export const SYNTHETIC_PT_COLUMNS = [
  'SEASON',
  'BRAND',
  'COLOR',
  'GENDER',
  'SUB CATEGORY',
  'TYPE',
  'ITEM',
  'FIT',
  'SIZE',
  'BARCODE',
  'DESIGN',
  'HSN',
  'QTY',
  'MRP',
  'BASIC',
  'P RATE',
  'INPUT TAX',
  'OUTPUT TAX',
  'NAG',
  'MARGIN',
  '',
  'SUGGESTED SUB CATEGORY',
  'SUGGESTED TYPE',
] as const;
export type SyntheticPtColumn = Exclude<(typeof SYNTHETIC_PT_COLUMNS)[number], ''>;

const NUMBER: readonly string[] = ['QTY', 'NAG', 'MARGIN'];
const MONEY: readonly string[] = ['MRP', 'BASIC', 'P RATE'];
const HINTS: readonly string[] = ['SUGGESTED SUB CATEGORY', 'SUGGESTED TYPE'];

/** The SYNTHETIC layout version: the header found on row 1 or 2, on whichever sheet holds it (goods-in 5.2). */
export const SYNTHETIC_PT_LAYOUT = {
  shape: 'layout-version/1',
  format: 'xlsx',
  sheet: 'SYNTHETIC PT',
  headerRow: 1,
  dataStartRow: 2,
  headerRows: [1, 2],
  sheetByHeader: true,
  columns: SYNTHETIC_PT_COLUMNS.filter((name) => name !== '').map((name) => ({
    name,
    // Every column of the template is filled but the two hints (DEC-140).
    required: !HINTS.includes(name),
    ...(NUMBER.includes(name) ? { type: 'number' } : MONEY.includes(name) ? { type: 'money' } : {}),
  })),
  // A row is a PT line when its DESIGN is filled (imports-and-opening-data 6.6).
  documentReference: 'DESIGN',
} as const;

/** The field of the PT handler each column fills (imports-and-opening-data 6.2). */
const FIELD_OF: Readonly<Record<SyntheticPtColumn, string>> = {
  SEASON: 'season',
  BRAND: 'brand',
  COLOR: 'colour',
  GENDER: 'gender',
  'SUB CATEGORY': 'subCategory',
  TYPE: 'type',
  ITEM: 'item',
  FIT: 'fit',
  SIZE: 'size',
  BARCODE: 'barcode',
  DESIGN: 'design',
  HSN: 'hsn',
  QTY: 'qty',
  MRP: 'mrp',
  BASIC: 'basic',
  'P RATE': 'pRate',
  'INPUT TAX': 'inputTax',
  'OUTPUT TAX': 'outputTax',
  NAG: 'nag',
  MARGIN: 'margin',
  'SUGGESTED SUB CATEGORY': 'suggestedSubCategory',
  'SUGGESTED TYPE': 'suggestedType',
};

/** The SYNTHETIC mapping version: amounts to paise exactly, quantities and MARGIN as exact decimals (6.2). */
export const SYNTHETIC_PT_MAPPING = {
  shape: 'mapping-version/1',
  fields: Object.fromEntries(
    (Object.entries(FIELD_OF) as [SyntheticPtColumn, string][]).map(([column, field]) => [
      field,
      {
        column,
        transform: MONEY.includes(column) ? 'paise' : NUMBER.includes(column) ? 'decimal' : 'text',
      },
    ]),
  ),
} as const;

export const SYNTHETIC_PT_LAYOUT_CODE = syntheticCode('PT-TEMPLATE');
export const SYNTHETIC_PT_MAPPING_CODE = syntheticCode('PT-TEMPLATE-MAPPING');

/** One row of a SYNTHETIC PT file: a value a column leaves out is an empty cell. */
export type SyntheticPtRow = Readonly<Partial<Record<SyntheticPtColumn, string | number | undefined>>>;

/**
 * A SYNTHETIC PT workbook (goods-in 5.2): the template's header on row 1, or on row 2 below a subtotal row as on a
 * preparer's work tab; a lists sheet before it, as the blank template carries; the rows given. Its title and subject
 * say SYNTHETIC. `marker` makes each file's bytes unique.
 */
export async function syntheticPtWorkbook(options: {
  readonly rows: readonly SyntheticPtRow[];
  readonly marker: string;
  readonly headerRow?: 1 | 2;
  readonly sheet?: string;
}): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.title = `SYNTHETIC PT file ${options.marker}`;
  workbook.subject = 'SYNTHETIC';
  workbook.creator = 'SYNTHETIC generator';
  const lists = workbook.addWorksheet('SYNTHETIC Lists');
  lists.addRow([`SYNTHETIC ${options.marker}`]);
  const sheet = workbook.addWorksheet(options.sheet ?? syntheticName('PT tab'));
  if (options.headerRow === 2) {
    // A subtotal row above the header, by its cached values only, as a work tab has (pt-file-layouts 1.2).
    const qty = options.rows.reduce((sum, row) => sum + Number(row.QTY ?? 0), 0);
    sheet.addRow(SYNTHETIC_PT_COLUMNS.map((name) => (name === 'QTY' ? qty : null)));
  }
  sheet.addRow([...SYNTHETIC_PT_COLUMNS]);
  for (const row of options.rows) {
    sheet.addRow(SYNTHETIC_PT_COLUMNS.map((name) => (name === '' ? null : (row[name] ?? null))));
  }
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

/** The generated file's name: SYNTHETIC-<stem>.xlsx. */
export const syntheticPtFileName = (stem: string) => syntheticFileName(stem, 'xlsx');
