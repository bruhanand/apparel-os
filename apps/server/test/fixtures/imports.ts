import ExcelJS from 'exceljs';
import { syntheticCode, syntheticFileName, syntheticName } from './synthetic.js';

// S1-F06-T01: the SYNTHETIC product file of the import tracer, its one fixed layout and its one fixed mapping
// (imports-and-opening-data 6.1, 6.2, 17 "Fixtures"; code-house-rules 11.1). Nothing here is a KDPS layout or value:
// the data notes' layouts are samples, never settings. The file says SYNTHETIC in its name and in a document property
// (its title and subject), set here by the first file generator (code-house-rules 11.1).

/** The sheet, the header row and the columns of the SYNTHETIC product file. */
export const SYNTHETIC_PRODUCT_SHEET = 'SYNTHETIC Products';
export const SYNTHETIC_PRODUCT_COLUMNS = [
  'Style code',
  'SKU code',
  'Brand code',
  'Category code',
  'Size',
  'Stock unit',
  'Purpose',
] as const;

/** The SYNTHETIC layout version's structure (6.1): one sheet, one header row, the style code as the reference. */
export const SYNTHETIC_PRODUCT_LAYOUT = {
  shape: 'layout-version/1',
  format: 'xlsx',
  sheet: SYNTHETIC_PRODUCT_SHEET,
  headerRow: 1,
  dataStartRow: 2,
  columns: [
    { name: 'Style code', required: true },
    { name: 'SKU code', required: true },
    { name: 'Brand code', required: true },
    { name: 'Category code', required: true },
    { name: 'Size', required: false },
    { name: 'Stock unit', required: true },
    { name: 'Purpose', required: true },
  ],
  documentReference: 'Style code',
} as const;

/** The SYNTHETIC mapping version's fields (6.2): each target field of the `merchandise` handler from one column. */
export const SYNTHETIC_PRODUCT_MAPPING = {
  shape: 'mapping-version/1',
  fields: {
    styleCode: { column: 'Style code', transform: 'text' },
    skuCode: { column: 'SKU code', transform: 'text' },
    brandCode: { column: 'Brand code', transform: 'text' },
    categoryCode: { column: 'Category code', transform: 'text' },
    size: { column: 'Size', transform: 'text' },
    stockUnit: { column: 'Stock unit', transform: 'text' },
    purpose: { column: 'Purpose', transform: 'text' },
  },
} as const;

/** The SYNTHETIC layout's and mapping's codes and labels. */
export const SYNTHETIC_PRODUCT_LAYOUT_CODE = syntheticCode('PRODUCT-LAYOUT');
export const SYNTHETIC_PRODUCT_MAPPING_CODE = syntheticCode('PRODUCT-MAPPING');
export const SYNTHETIC_LAYOUT_SOURCE = syntheticName('Product file');

/** The SYNTHETIC import batch code format (numbering-and-audit 3.5: no format has a default). */
export const SYNTHETIC_IMPORT_BATCH_FORMAT = [
  { kind: 'text', text: 'SYN-IB-' },
  { kind: 'sequence', width: 5 },
] as const;

export type SyntheticProductRow = Readonly<Record<(typeof SYNTHETIC_PRODUCT_COLUMNS)[number], string | undefined>>;

/** The generated file's name: SYNTHETIC-<stem>.xlsx. */
export function syntheticProductFileName(stem: string): string {
  return syntheticFileName(stem, 'xlsx');
}

/**
 * A SYNTHETIC product workbook: a hidden notes sheet before the product sheet, the header row, then the rows given
 * (a missing value is an empty cell). The title and subject say SYNTHETIC. `marker` makes each file's bytes unique.
 */
export async function syntheticProductWorkbook(rows: readonly SyntheticProductRow[], marker: string): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.title = `SYNTHETIC product file ${marker}`;
  workbook.subject = 'SYNTHETIC';
  workbook.creator = 'SYNTHETIC generator';
  const notes = workbook.addWorksheet('SYNTHETIC Notes');
  notes.state = 'hidden';
  notes.addRow([`SYNTHETIC ${marker}`]);
  const sheet = workbook.addWorksheet(SYNTHETIC_PRODUCT_SHEET);
  sheet.addRow([...SYNTHETIC_PRODUCT_COLUMNS]);
  for (const row of rows) sheet.addRow(SYNTHETIC_PRODUCT_COLUMNS.map((column) => row[column] ?? null));
  return Buffer.from(await workbook.xlsx.writeBuffer());
}
