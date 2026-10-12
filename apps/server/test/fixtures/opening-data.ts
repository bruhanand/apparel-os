import { syntheticCode } from './synthetic.js';

// S1-F13-T01: the SYNTHETIC layouts and mappings of the opening-stock manifest, the earlier POS's stock on hand and its
// daily sales (imports-and-opening-data 6.1, 6.2, 10.2, 17 "Fixtures"; code-house-rules 11.1). None is a KDPS layout:
// the data notes' layouts are samples, never settings, and the sample layouts of 6.7 arrive with S2-F13 (DEC-115).
// Every sheet, column and code says SYNTHETIC where it names one.

interface Column {
  readonly name: string;
  readonly required: boolean;
  readonly type?: 'text' | 'number' | 'money';
  readonly restrictedClass?: 'cost' | 'customer-contact';
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

// S1-F13-T02: the SYNTHETIC layouts of opening dues, advances and deposits, each its own opening kind (10.4;
// PRD-LIF-009), and of the closed-books balances they reconcile with (POL-14.03). Their fields are GC-6's Proposed
// ones (GC6-10, RR-133: the real fields stay with Accounts and the CA); amounts in rupees with up to two decimals,
// staged as integer paise (PRD-MOD-014). Every row names the batch's unit and the cutoff date.

const balanceLayout = (
  sheet: string,
  fields: Readonly<Record<string, string>>,
  required: readonly string[],
  money: readonly string[],
  reference: string,
  restricted: Readonly<Record<string, 'customer-contact'>> = {},
) =>
  layoutOf(
    sheet,
    Object.entries(fields).map(([field, name]) => ({
      name,
      required: required.includes(field),
      ...(money.includes(field) ? { type: 'money' as const } : {}),
      ...(restricted[field] === undefined ? {} : { restrictedClass: restricted[field] }),
    })),
    reference,
  );
const paiseOf = (money: readonly string[]) => Object.fromEntries(money.map((field) => [field, 'paise']));

/** SYNTHETIC supplier dues: one open supplier document (10.4). */
export const SUPPLIER_DUES_SHEET = 'SYNTHETIC Supplier dues';
export const SUPPLIER_DUES_FIELDS = {
  openingReference: 'Opening',
  unitCode: 'Unit',
  cutoffDate: 'Cutoff',
  partyCode: 'Party',
  legalEntityCode: 'Legal entity',
  bookCode: 'Book',
  documentReference: 'Document',
  documentDate: 'Document date',
  originalAmount: 'Original amount',
  openAmount: 'Open amount',
  dueDate: 'Due date',
} as const;
const SUPPLIER_DUES_MONEY = ['originalAmount', 'openAmount'];
export const SUPPLIER_DUES_LAYOUT = balanceLayout(
  SUPPLIER_DUES_SHEET,
  SUPPLIER_DUES_FIELDS,
  [
    'openingReference',
    'unitCode',
    'cutoffDate',
    'partyCode',
    'legalEntityCode',
    'bookCode',
    'documentReference',
    'documentDate',
    'openAmount',
  ],
  SUPPLIER_DUES_MONEY,
  'Opening',
);
export const SUPPLIER_DUES_MAPPING = mappingOf(SUPPLIER_DUES_FIELDS, paiseOf(SUPPLIER_DUES_MONEY));

/** SYNTHETIC customer dues: one open customer amount (10.4); the customer's name is customer contact (section 11). */
export const CUSTOMER_DUES_SHEET = 'SYNTHETIC Customer dues';
export const CUSTOMER_DUES_FIELDS = {
  openingReference: 'Opening',
  unitCode: 'Unit',
  cutoffDate: 'Cutoff',
  customerCode: 'Customer',
  customerName: 'Customer name',
  documentReference: 'Document',
  documentDate: 'Document date',
  openAmount: 'Open amount',
  dueDate: 'Due date',
} as const;
export const CUSTOMER_DUES_LAYOUT = balanceLayout(
  CUSTOMER_DUES_SHEET,
  CUSTOMER_DUES_FIELDS,
  ['openingReference', 'unitCode', 'cutoffDate', 'customerCode', 'documentReference', 'documentDate', 'openAmount'],
  ['openAmount'],
  'Opening',
  { customerName: 'customer-contact' },
);
export const CUSTOMER_DUES_MAPPING = mappingOf(CUSTOMER_DUES_FIELDS, paiseOf(['openAmount']));

/** SYNTHETIC advances given and received: one advance (10.4). */
export const ADVANCES_SHEET = 'SYNTHETIC Advances';
export const ADVANCES_FIELDS = {
  openingReference: 'Opening',
  unitCode: 'Unit',
  cutoffDate: 'Cutoff',
  direction: 'Given or received',
  partyCode: 'Party',
  purpose: 'Purpose',
  amount: 'Amount',
  evidence: 'Evidence',
} as const;
export const ADVANCES_LAYOUT = balanceLayout(
  ADVANCES_SHEET,
  ADVANCES_FIELDS,
  ['openingReference', 'unitCode', 'cutoffDate', 'direction', 'partyCode', 'purpose', 'amount', 'evidence'],
  ['amount'],
  'Opening',
);
export const ADVANCES_MAPPING = mappingOf(ADVANCES_FIELDS, paiseOf(['amount']));

/** SYNTHETIC deposits given and received: one deposit (10.4). */
export const DEPOSITS_SHEET = 'SYNTHETIC Deposits';
export const DEPOSITS_FIELDS = {
  openingReference: 'Opening',
  unitCode: 'Unit',
  cutoffDate: 'Cutoff',
  direction: 'Given or received',
  partyCode: 'Party',
  agreementReference: 'Agreement',
  amount: 'Amount',
  evidence: 'Evidence',
} as const;
export const DEPOSITS_LAYOUT = balanceLayout(
  DEPOSITS_SHEET,
  DEPOSITS_FIELDS,
  ['openingReference', 'unitCode', 'cutoffDate', 'direction', 'partyCode', 'agreementReference', 'amount', 'evidence'],
  ['amount'],
  'Opening',
);
export const DEPOSITS_MAPPING = mappingOf(DEPOSITS_FIELDS, paiseOf(['amount']));

/**
 * SYNTHETIC closed-books balances: one balance of a book's account, of a party or of the account alone (10.4). Their
 * real form, such as a Tally export, is OPEN (GC6-10).
 */
export const CLOSED_BOOKS_SHEET = 'SYNTHETIC Closed books';
export const CLOSED_BOOKS_FIELDS = {
  balancesReference: 'Balances',
  closedOn: 'Closed on',
  bookCode: 'Book',
  account: 'Account',
  partyCode: 'Party',
  balance: 'Balance',
} as const;
export const CLOSED_BOOKS_LAYOUT = balanceLayout(
  CLOSED_BOOKS_SHEET,
  CLOSED_BOOKS_FIELDS,
  ['balancesReference', 'closedOn', 'bookCode', 'account', 'balance'],
  ['balance'],
  'Balances',
);
export const CLOSED_BOOKS_MAPPING = mappingOf(CLOSED_BOOKS_FIELDS, paiseOf(['balance']));

/** The SYNTHETIC layouts' codes. */
export const OPENING_LAYOUT_CODES = {
  manifest: { layout: syntheticCode('MANIFEST-LAYOUT'), mapping: syntheticCode('MANIFEST-MAPPING') },
  soh: { layout: syntheticCode('SOH-LAYOUT'), mapping: syntheticCode('SOH-MAPPING') },
  sales: { layout: syntheticCode('SALES-LAYOUT'), mapping: syntheticCode('SALES-MAPPING') },
  supplierDues: { layout: syntheticCode('SUPPLIER-DUES-LAYOUT'), mapping: syntheticCode('SUPPLIER-DUES-MAPPING') },
  customerDues: { layout: syntheticCode('CUSTOMER-DUES-LAYOUT'), mapping: syntheticCode('CUSTOMER-DUES-MAPPING') },
  advances: { layout: syntheticCode('ADVANCES-LAYOUT'), mapping: syntheticCode('ADVANCES-MAPPING') },
  deposits: { layout: syntheticCode('DEPOSITS-LAYOUT'), mapping: syntheticCode('DEPOSITS-MAPPING') },
  closedBooks: { layout: syntheticCode('CLOSED-BOOKS-LAYOUT'), mapping: syntheticCode('CLOSED-BOOKS-MAPPING') },
} as const;

/** The cells of a row in the columns' order, a missing value an empty cell. */
export function cellsOf<F extends Readonly<Record<string, string>>>(
  fields: F,
  row: Partial<Record<keyof F, string>>,
): (string | null)[] {
  return (Object.keys(fields) as (keyof F)[]).map((field) => row[field] ?? null);
}
