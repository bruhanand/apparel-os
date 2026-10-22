import { fraction, isDecimal, parseDecimal, roundToInteger } from '@apparel-os/calculations';
import { ticketMargin } from '@apparel-os/calculations/costing';
import { known } from '@apparel-os/domain';

// The checks of goods-in 5.3 on one row of a PT file (S2-F04-T02; PRD-PTW-011, PRD-MER-007, PRD-IMP-006, PRD-IMP-007,
// DEC-134, DEC-135, DEC-140). Each value of a list is on its list, compared as the code of an approved value, exactly as
// the file gives it once its mapping trimmed it (structure-and-masters 2.1); the brand is the GRN's; the barcode digits,
// its leading zeros kept; HSN six or eight digits; QTY whole pieces above zero; MRP, BASIC and P RATE above zero in
// whole paise, P RATE not above MRP; NAG equal to QTY; MARGIN, rounded half up to two decimals, equal to the shared
// ticket-margin calculation's. Every problem of the row is found at once (PRD-IMP-007). A value Unknown is reported by
// the required check of files-imports, so its own checks are skipped and the rest still run (PRD-MOD-015). Pure: no
// database, no clock.

/** The fields of the PT handler's staged row: the template's 20 columns and its two `SUGGESTED` hints (5.2, 5.3). */
export const PT_FIELDS = [
  'season',
  'brand',
  'colour',
  'gender',
  'subCategory',
  'type',
  'item',
  'fit',
  'size',
  'barcode',
  'design',
  'hsn',
  'qty',
  'mrp',
  'basic',
  'pRate',
  'inputTax',
  'outputTax',
  'nag',
  'margin',
  'suggestedSubCategory',
  'suggestedType',
] as const;
export type PtField = (typeof PT_FIELDS)[number];

/** The two hints the template carries, never applied (PRD-PTW-012); every other field must be filled (DEC-140). */
export const PT_HINT_FIELDS: readonly PtField[] = ['suggestedSubCategory', 'suggestedType'];

/**
 * The lists of the master sheet a row's values must be on (5.2): the attribute each list is, as the Organisation marks
 * it, by the codes of its approved values in force; the brands and categories (Sub category) by their codes.
 */
export type PtList = 'season' | 'colour' | 'gender' | 'type' | 'item' | 'fit' | 'size' | 'gstRate';

/** The list each field is checked against. */
const LIST_OF: Readonly<Partial<Record<PtField, PtList>>> = {
  season: 'season',
  colour: 'colour',
  gender: 'gender',
  type: 'type',
  item: 'item',
  fit: 'fit',
  size: 'size',
  inputTax: 'gstRate',
  outputTax: 'gstRate',
};

export interface PtLists {
  /** The GRN's brand (5.3: on the brand list, and the GRN's brand). */
  readonly grnBrandId: string;
  /** Codes to identifiers. */
  readonly brands: ReadonlyMap<string, string>;
  readonly categories: ReadonlyMap<string, string>;
  readonly attributes: Readonly<Record<PtList, ReadonlyMap<string, string>>>;
}

/** One row as the handler is given it: each field's known text, or undefined while Unknown (PRD-MOD-015). */
export interface PtRowInput {
  readonly rowNumber: number;
  readonly values: Readonly<Record<PtField, string | undefined>>;
}

/** A problem found on a row, by the field it is in, which names the column (PRD-IMP-007). */
export interface PtIssue {
  readonly code: string;
  readonly field?: PtField;
  readonly rowNumber?: number;
  readonly missing?: readonly { readonly kind: string; readonly [field: string]: string }[];
}

/** A row that passed every check, with its values as the draft PT keeps them (5.7). */
export interface CheckedRow {
  readonly rowNumber: number;
  readonly brandId: string;
  readonly categoryId: string;
  readonly subCategoryCode: string;
  /** Each list's value: its code as given and the approved value it names. */
  readonly values: Readonly<Record<Exclude<PtList, 'gstRate'>, { readonly code: string; readonly valueId: string }>>;
  readonly inputTax: { readonly code: string; readonly valueId: string };
  readonly outputTax: { readonly code: string; readonly valueId: string };
  readonly colourCode: string;
  readonly sizeCode: string;
  readonly styleCode: string;
  readonly barcode: string;
  readonly hsn: string;
  readonly quantity: number;
  readonly mrpPaise: number;
  readonly basicPaise: number;
  readonly pRatePaise: number;
  readonly nag: number;
  /** Worked out by the shared ticket-margin calculation, two decimals (PRD-PTW-011). */
  readonly margin: string;
  readonly suggestedSubCategory?: string;
  readonly suggestedType?: string;
}

const DIGITS = /^\d+$/;
const HSN = /^(?:\d{6}|\d{8})$/;

/** A whole number of pieces above zero, or undefined. */
function pieces(text: string): number | undefined {
  if (!DIGITS.test(text)) return undefined;
  const value = Number(text);
  return Number.isSafeInteger(value) && value > 0 ? value : undefined;
}

/** A decimal text in hundredths, rounded half up (PRD-PTW-011), or undefined when it is no decimal. */
export function hundredthsOf(text: string): bigint | undefined {
  const negative = text.startsWith('-');
  const body = negative ? text.slice(1) : text;
  if (!isDecimal(body)) return undefined;
  const value = parseDecimal(body);
  const rounded = roundToInteger(fraction(value.n * 100n, value.d), 'half-up');
  return negative ? -rounded : rounded;
}

/**
 * MARGIN against the shared ticket-margin calculation (PRD-PTW-011; shared-calculations 8): the file's value, rounded
 * half up to two decimals, must equal (MRP − P RATE) ÷ MRP × 100 rounded the same way. Undefined where it gives none.
 */
export function marginOf(mrpPaise: number, pRatePaise: number): string | undefined {
  const result = ticketMargin({ mrp: known(mrpPaise), pRate: known(pRatePaise) });
  return result.ok && result.value.kind === 'known' ? result.value.value : undefined;
}

/** Runs every check of 5.3 on one row: its issues, and the row as kept when it has none. */
export function checkRow(input: PtRowInput, lists: PtLists): { issues: PtIssue[]; row?: CheckedRow } {
  const issues: PtIssue[] = [];
  const issue = (field: PtField, code: string) => issues.push({ code, field, rowNumber: input.rowNumber });
  const value = (field: PtField) => input.values[field];
  const onList = (field: PtField, entries: ReadonlyMap<string, string>) => {
    const text = value(field);
    if (text === undefined) return undefined;
    const found = entries.get(text);
    if (found === undefined) issue(field, 'merchandise.pt-value-not-on-list');
    return found === undefined ? undefined : { code: text, valueId: found };
  };

  const season = onList('season', lists.attributes.season);
  const brand = value('brand');
  let brandId: string | undefined;
  if (brand !== undefined) {
    brandId = lists.brands.get(brand);
    if (brandId === undefined) issue('brand', 'merchandise.pt-value-not-on-list');
    else if (brandId !== lists.grnBrandId) issue('brand', 'merchandise.pt-brand-not-the-grn');
  }
  const colour = onList('colour', lists.attributes.colour);
  const gender = onList('gender', lists.attributes.gender);
  const subCategory = onList('subCategory', lists.categories);
  const type = onList('type', lists.attributes.type);
  const item = onList('item', lists.attributes.item);
  const fit = onList('fit', lists.attributes.fit);
  const size = onList('size', lists.attributes.size);

  const barcode = value('barcode');
  if (barcode !== undefined && !DIGITS.test(barcode)) issue('barcode', 'merchandise.pt-barcode-not-digits');
  const hsn = value('hsn');
  if (hsn !== undefined && !HSN.test(hsn)) issue('hsn', 'merchandise.pt-hsn-invalid');
  const qtyText = value('qty');
  const quantity = qtyText === undefined ? undefined : pieces(qtyText);
  if (qtyText !== undefined && quantity === undefined) issue('qty', 'merchandise.pt-quantity-invalid');

  // MRP, BASIC and P RATE arrive in whole paise by the mapping's exact transform, never rounded (PRD-IMP-006).
  const amount = (field: 'mrp' | 'basic' | 'pRate') => {
    const text = value(field);
    if (text === undefined) return undefined;
    const paise = Number(text);
    if (!DIGITS.test(text) || !Number.isSafeInteger(paise) || paise <= 0) {
      issue(field, 'merchandise.pt-amount-not-positive');
      return undefined;
    }
    return paise;
  };
  const mrpPaise = amount('mrp');
  const basicPaise = amount('basic');
  const pRatePaise = amount('pRate');
  const above = mrpPaise !== undefined && pRatePaise !== undefined && pRatePaise > mrpPaise;
  if (above) issue('pRate', 'merchandise.pt-p-rate-above-mrp');

  const inputTax = onList('inputTax', lists.attributes.gstRate);
  const outputTax = onList('outputTax', lists.attributes.gstRate);

  const nagText = value('nag');
  if (nagText !== undefined && qtyText !== undefined && hundredthsOf(nagText) !== hundredthsOf(qtyText)) {
    issue('nag', 'merchandise.pt-nag-not-qty');
  }
  const marginText = value('margin');
  const margin = mrpPaise === undefined || pRatePaise === undefined || above ? undefined : marginOf(mrpPaise, pRatePaise);
  if (marginText !== undefined && margin !== undefined && hundredthsOf(marginText) !== hundredthsOf(margin)) {
    issue('margin', 'merchandise.pt-margin-disagrees');
  }

  const design = value('design');
  if (
    issues.length > 0 ||
    season === undefined ||
    brandId === undefined ||
    colour === undefined ||
    gender === undefined ||
    subCategory === undefined ||
    type === undefined ||
    item === undefined ||
    fit === undefined ||
    size === undefined ||
    barcode === undefined ||
    design === undefined ||
    hsn === undefined ||
    quantity === undefined ||
    mrpPaise === undefined ||
    basicPaise === undefined ||
    pRatePaise === undefined ||
    inputTax === undefined ||
    outputTax === undefined ||
    nagText === undefined ||
    margin === undefined ||
    marginText === undefined
  ) {
    return { issues };
  }
  const suggestedSubCategory = value('suggestedSubCategory');
  const suggestedType = value('suggestedType');
  return {
    issues,
    row: {
      rowNumber: input.rowNumber,
      brandId,
      categoryId: subCategory.valueId,
      subCategoryCode: subCategory.code,
      values: { season, colour, gender, type, item, fit, size },
      inputTax,
      outputTax,
      colourCode: colour.code,
      sizeCode: size.code,
      styleCode: design,
      barcode,
      hsn,
      quantity,
      mrpPaise,
      basicPaise,
      pRatePaise,
      nag: quantity,
      margin,
      ...(suggestedSubCategory === undefined ? {} : { suggestedSubCategory }),
      ...(suggestedType === undefined ? {} : { suggestedType }),
    },
  };
}

/** The list a field is checked against, where it has one. */
export function listOf(field: PtField): PtList | undefined {
  return LIST_OF[field];
}
