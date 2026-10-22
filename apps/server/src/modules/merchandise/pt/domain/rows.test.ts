import { describe, expect, it } from 'vitest';
import { checkRow, type PtLists, type PtRowInput } from './rows.js';

// S2-F04-T02: the checks of goods-in 5.3 on one row of a PT file, as pure functions (goods-in 12 test 8; PRD-PTW-011,
// PRD-MER-007, PRD-IMP-006, PRD-IMP-007, DEC-134, DEC-135, DEC-140). Every list, code and amount here is SYNTHETIC.

const id = (n: number) => `01900000-0000-7000-8000-${String(n).padStart(12, '0')}`;
const list = (...codes: string[]) => new Map(codes.map((code, at) => [code, id(at + 100 * codes.length)]));

/** The GRN's brand (goods-in 5.3: on the brand list, and the GRN's brand). */
const GRN_BRAND = id(1);
const types = list('SYN TOP', 'SYN BOTTOM');
const items = list('SYN T-SHIRT', 'SYN SHORTS');
const at = (entries: ReadonlyMap<string, string>, code: string) => entries.get(code) ?? 'SYN-NOT-ON-THE-LIST';

const lists: PtLists = {
  brands: new Map([
    ['SYN-BRAND', GRN_BRAND],
    ['SYN-OTHER-BRAND', id(2)],
  ]),
  categories: new Map([
    ['SYN CASUAL', id(3)],
    ['SYN SPORT', id(4)],
  ]),
  attributes: {
    season: list('SYN SPRING(Jun-26)'),
    colour: list('SYN NAVY', 'PREMIUM'),
    gender: list('SYN MALE'),
    type: types,
    item: items,
    fit: list('SYN SLIM'),
    size: list('M', '8'),
    gstRate: list('5', '18'),
  },
  // The master sheet's item map (goods-in 5.2): each item's sub category and type; SYN SHORTS has none.
  itemMap: new Map([[at(items, 'SYN T-SHIRT'), { categoryId: id(3), typeValueId: at(types, 'SYN TOP') }]]),
};

/** A good SYNTHETIC row: 2 pieces at MRP 1,999.00, BASIC 700.00, P RATE 945.00, so MARGIN 52.73 (CG-22). */
const good: PtRowInput = {
  rowNumber: 3,
  values: {
    season: 'SYN SPRING(Jun-26)',
    brand: 'SYN-BRAND',
    colour: 'PREMIUM',
    gender: 'SYN MALE',
    subCategory: 'SYN CASUAL',
    type: 'SYN TOP',
    item: 'SYN T-SHIRT',
    fit: 'SYN SLIM',
    size: 'M',
    barcode: '0890123456789',
    design: 'SYN-DESIGN-1',
    hsn: '61091000',
    qty: '2',
    mrp: '199900',
    basic: '70000',
    pRate: '94500',
    inputTax: '5',
    outputTax: '18',
    nag: '2',
    margin: '52.7263',
    suggestedSubCategory: undefined,
    suggestedType: undefined,
  },
};

const withValues = (values: Partial<PtRowInput['values']>): PtRowInput => ({
  ...good,
  values: { ...good.values, ...values },
});

const codes = (input: PtRowInput) =>
  checkRow(input, lists, GRN_BRAND).issues.map((issue) => [issue.field ?? '', issue.code] as const);

describe('the checks on each row of a PT file (goods-in 5.3)', () => {
  it('DEC-134 PRD-PTW-011 accepts a row whose every value is on its list, with NAG, MARGIN and the amounts in order', () => {
    const checked = checkRow(good, lists, GRN_BRAND);
    expect(checked.issues).toEqual([]);
    expect(checked.row).toMatchObject({
      rowNumber: 3,
      brandId: id(1),
      categoryId: id(3),
      styleCode: 'SYN-DESIGN-1',
      sizeCode: 'M',
      colourCode: 'PREMIUM',
      barcode: '0890123456789',
      quantity: 2,
      mrpPaise: 199900,
      basicPaise: 70000,
      pRatePaise: 94500,
      nag: 2,
      margin: '52.73',
    });
  });

  it('DEC-134 names the cell of each value off its list, every one at once', () => {
    const issues = codes(
      withValues({ season: 'SYN WINTER', colour: 'SYN PINK', subCategory: 'SYN FORMAL', size: 'XXL', outputTax: '7' }),
    );
    expect(issues).toEqual([
      ['season', 'merchandise.pt-value-not-on-list'],
      ['colour', 'merchandise.pt-value-not-on-list'],
      ['subCategory', 'merchandise.pt-value-not-on-list'],
      ['size', 'merchandise.pt-value-not-on-list'],
      ['outputTax', 'merchandise.pt-value-not-on-list'],
    ]);
  });

  it('DEC-134 refuses a brand off the list, and a brand on it that is not the GRN brand', () => {
    expect(codes(withValues({ brand: 'SYN-NO-SUCH' }))).toEqual([['brand', 'merchandise.pt-value-not-on-list']]);
    expect(codes(withValues({ brand: 'SYN-OTHER-BRAND' }))).toEqual([['brand', 'merchandise.pt-brand-not-the-grn']]);
  });

  it('PRD-MER-007 keeps a barcode leading zeros and refuses one that is not digits', () => {
    expect(checkRow(withValues({ barcode: '000123' }), lists, GRN_BRAND).row?.barcode).toBe('000123');
    expect(codes(withValues({ barcode: '89012-34' }))).toEqual([['barcode', 'merchandise.pt-barcode-not-digits']]);
  });

  it('DEC-134 refuses an HSN that is not six or eight digits', () => {
    expect(codes(withValues({ hsn: '610910' }))).toEqual([]);
    expect(codes(withValues({ hsn: '6109100' }))).toEqual([['hsn', 'merchandise.pt-hsn-invalid']]);
    expect(codes(withValues({ hsn: '6109A000' }))).toEqual([['hsn', 'merchandise.pt-hsn-invalid']]);
  });

  it('DEC-134 refuses a quantity that is not whole pieces above zero', () => {
    expect(codes(withValues({ qty: '0', nag: '0' }))).toEqual([['qty', 'merchandise.pt-quantity-invalid']]);
    expect(codes(withValues({ qty: '1.5', nag: '1.5' }))).toEqual([['qty', 'merchandise.pt-quantity-invalid']]);
  });

  it('PRD-PTW-011 refuses NAG that is not QTY', () => {
    expect(codes(withValues({ nag: '3' }))).toEqual([['nag', 'merchandise.pt-nag-not-qty']]);
  });

  it('PRD-PTW-011 compares NAG with QTY exactly, never at two decimals (code review 6 of stage 2)', () => {
    // SYNTHETIC: 2.004 rounds to 2.00 at two decimals, but is not 2 pieces.
    expect(codes(withValues({ nag: '2.004' }))).toEqual([['nag', 'merchandise.pt-nag-not-qty']]);
    expect(codes(withValues({ nag: '1.999' }))).toEqual([['nag', 'merchandise.pt-nag-not-qty']]);
    // The same number written with a fraction of zero is QTY.
    expect(codes(withValues({ nag: '2.00' }))).toEqual([]);
    expect(codes(withValues({ nag: '-2' }))).toEqual([['nag', 'merchandise.pt-nag-not-qty']]);
  });

  it('DEC-134 PRD-IMP-007 refuses an ITEM the item map does not give the row SUB CATEGORY and TYPE (goods-in 5.3; RR-583)', () => {
    expect(codes(withValues({ subCategory: 'SYN SPORT' }))).toEqual([
      ['subCategory', 'merchandise.pt-item-map-disagrees'],
    ]);
    expect(codes(withValues({ type: 'SYN BOTTOM' }))).toEqual([['type', 'merchandise.pt-item-map-disagrees']]);
    expect(codes(withValues({ subCategory: 'SYN SPORT', type: 'SYN BOTTOM' }))).toEqual([
      ['subCategory', 'merchandise.pt-item-map-disagrees'],
      ['type', 'merchandise.pt-item-map-disagrees'],
    ]);
    // An item the map does not hold is never given a sub category or type by default.
    expect(codes(withValues({ item: 'SYN SHORTS' }))).toEqual([['item', 'merchandise.pt-item-not-mapped']]);
    expect(checkRow(withValues({ item: 'SYN SHORTS' }), lists, GRN_BRAND).row).toBeUndefined();
  });

  it('PRD-PTW-011 refuses MARGIN that, rounded half up to two decimals, disagrees with (MRP - P RATE) / MRP x 100', () => {
    // SYNTHETIC: 52.725 rounds half up to 52.73, so it agrees; 52.72 does not.
    expect(codes(withValues({ margin: '52.725' }))).toEqual([]);
    expect(codes(withValues({ margin: '52.72' }))).toEqual([['margin', 'merchandise.pt-margin-disagrees']]);
  });

  it('DEC-134 refuses an amount of zero and P RATE above MRP, with no MARGIN check on a loss', () => {
    expect(codes(withValues({ basic: '0' }))).toEqual([['basic', 'merchandise.pt-amount-not-positive']]);
    expect(codes(withValues({ pRate: '200000', margin: '-0.05' }))).toEqual([
      ['pRate', 'merchandise.pt-p-rate-above-mrp'],
    ]);
  });

  it('PRD-MOD-015 skips the checks of an Unknown value, which the required check reports, and checks the rest', () => {
    expect(codes(withValues({ hsn: undefined, colour: 'SYN PINK' }))).toEqual([
      ['colour', 'merchandise.pt-value-not-on-list'],
    ]);
    expect(checkRow(withValues({ hsn: undefined }), lists, GRN_BRAND).row).toBeUndefined();
  });
});
