import { syntheticCode } from './synthetic.js';

// S1-F13-T01: the SYNTHETIC layouts and mappings of the opening-stock manifest, the earlier POS's stock on hand and its
// daily sales (imports-and-opening-data 6.1, 6.2, 10.2, 17 "Fixtures"; code-house-rules 11.1). None is a KDPS layout:
// the data notes' layouts are samples, never settings, and the sample layouts of 6.7 arrive with S2-F13 (DEC-115).
// Every sheet, column and code says SYNTHETIC where it names one.

interface Column {
  readonly name: string;
  readonly required: boolean;
  readonly type?: 'text' | 'number' | 'money';
  readonly restrictedClass?: 'cost';
}

const layoutOf = (sheet: string, columns: readonly Column[], documentReference: string) => ({
  shape: 'layout-version/1',
  format: 'xlsx',
  sheet,
  headerRow: 1,
  dataStartRow: 2,
  columns,
  documentReference,
});

const mappingOf = (fields: Readonly<Record<string, string>>, transforms: Readonly<Record<string, string>> = {}) => ({
  shape: 'mapping-version/1',
  fields: Object.fromEntries(
    Object.entries(fields).map(([field, column]) => [field, { column, transform: transforms[field] ?? 'text' }]),
  ),
});

/** The SYNTHETIC opening-stock manifest (10.2): one row per SKU or source identity at one location of the unit. */
export const MANIFEST_SHEET = 'SYNTHETIC Opening manifest';
export const MANIFEST_FIELDS = {
  manifestReference: 'Manifest',
  section: 'Section',
  siteCode: 'Site',
  unitCode: 'Unit',
  locationCode: 'Location',
  barcode: 'Barcode',
  supplierCode: 'Supplier code',
  styleWord: 'Style',
  colourWord: 'Colour',
  sizeWord: 'Size',
  itemWord: 'Item',
  brandWord: 'Brand',
  supplierWord: 'Supplier',
  designWord: 'Design',
  quantity: 'Qty',
  batchCode: 'Batch',
  expiryDate: 'Expiry',
  condition: 'Condition',
  ownerCode: 'Owner',
  season: 'Season',
  unitCost: 'Unit cost',
  valuationEvidence: 'Valuation evidence',
  receiptDate: 'Receipt date',
  receiptEvidence: 'Receipt evidence',
  billReference: 'Bill reference',
} as const;
export type ManifestRow = Partial<Record<keyof typeof MANIFEST_FIELDS, string>>;
const MANIFEST_REQUIRED = new Set(['Manifest', 'Section', 'Site', 'Unit', 'Location', 'Qty', 'Condition', 'Owner']);
export const MANIFEST_LAYOUT = layoutOf(
  MANIFEST_SHEET,
  Object.values(MANIFEST_FIELDS).map((name) => ({
    name,
    required: MANIFEST_REQUIRED.has(name),
    ...(name === 'Unit cost' ? { type: 'money' as const, restrictedClass: 'cost' as const } : {}),
  })),
  'Manifest',
);
export const MANIFEST_MAPPING = mappingOf(MANIFEST_FIELDS, { unitCost: 'paise' });

/** The SYNTHETIC stock on hand of the earlier POS: one row per barcode, positive quantities only (I-1). */
export const SOH_SHEET = 'SYNTHETIC Stock on hand';
export const SOH_FIELDS = { reportDate: 'Report date', barcode: 'Barcode', itemCode: 'Item code', quantity: 'Qty' };
export type SohRow = Partial<Record<keyof typeof SOH_FIELDS, string>>;
export const SOH_LAYOUT = layoutOf(
  SOH_SHEET,
  Object.values(SOH_FIELDS).map((name) => ({ name, required: name === 'Report date' || name === 'Qty' })),
  'Report date',
);
export const SOH_MAPPING = mappingOf(SOH_FIELDS);

/** The SYNTHETIC daily sales report of the earlier POS: one row per bill line, a return as a negative quantity. */
export const SALES_SHEET = 'SYNTHETIC Daily sales';
export const SALES_FIELDS = {
  reportDate: 'Report date',
  billNumber: 'Bill number',
  barcode: 'Barcode',
  itemCode: 'Item code',
  quantity: 'Qty',
  amount: 'Amount',
};
export type SalesRow = Partial<Record<keyof typeof SALES_FIELDS, string>>;
export const SALES_LAYOUT = layoutOf(
  SALES_SHEET,
  Object.values(SALES_FIELDS).map((name) => ({
    name,
    required: name === 'Report date' || name === 'Qty',
    ...(name === 'Amount' ? { type: 'money' as const } : {}),
  })),
  'Report date',
);
export const SALES_MAPPING = mappingOf(SALES_FIELDS, { amount: 'paise' });

/** The SYNTHETIC layouts' codes. */
export const OPENING_LAYOUT_CODES = {
  manifest: { layout: syntheticCode('MANIFEST-LAYOUT'), mapping: syntheticCode('MANIFEST-MAPPING') },
  soh: { layout: syntheticCode('SOH-LAYOUT'), mapping: syntheticCode('SOH-MAPPING') },
  sales: { layout: syntheticCode('SALES-LAYOUT'), mapping: syntheticCode('SALES-MAPPING') },
} as const;

/** The cells of a row in the columns' order, a missing value an empty cell. */
export function cellsOf<F extends Readonly<Record<string, string>>>(
  fields: F,
  row: Partial<Record<keyof F, string>>,
): (string | null)[] {
  return (Object.keys(fields) as (keyof F)[]).map((field) => row[field] ?? null);
}
