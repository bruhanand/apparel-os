import { describe, expect, it } from 'vitest';
import { productsOf, type ProductFacts, type ProductRow } from './products.js';

// S2-F04-T02: each row's product (goods-in 5.5; PRD-MER-007, PRD-MER-013, DEC-135; goods-in 12 test 10, the proposal
// part): an existing product found by the row's barcode's mapping first, a repeated barcode narrowed by style, size and
// colour, then by brand, style, colour and size (code review 6 of stage 2); otherwise a new product proposed from the
// row; a barcode on several products flagged, never refused; a row that differs from its product in a value the product
// holds shown as a difference. Every identifier and code here is SYNTHETIC.

const id = (n: number) => `01900000-0000-7000-8000-${String(n).padStart(12, '0')}`;
const COLOUR = id(900);
const HSN_STYLE = id(10);

const facts: ProductFacts = {
  colourAttributeId: COLOUR,
  styleAttributes: { season: id(901), gender: id(902), type: id(903), item: id(904), fit: id(905) },
  styles: new Map([
    ['SYN-OLD', { styleId: HSN_STYLE, categoryId: id(20), hsn: '61091000', attributes: new Map([[id(902), id(51)]]) }],
  ]),
  skus: [
    { skuId: id(1), styleCode: 'SYN-OLD', size: 'M', colourValueId: id(31) },
    { skuId: id(2), styleCode: 'SYN-OLD', size: 'L', colourValueId: id(31) },
    { skuId: id(3), styleCode: 'SYN-OLD', size: 'L', colourValueId: id(33) },
  ],
  barcodes: new Map([
    ['111', [id(1)]],
    ['222', [id(1), id(2)]],
    ['333', [id(2), id(3)]],
    // A SKU of another brand, named by a mapping for the whole Organisation: never the row's (5.3).
    ['444', [id(99)]],
  ]),
  codes: new Map([
    [id(31), 'SYN NAVY'],
    [id(32), 'PREMIUM'],
    [id(33), 'SYN RED'],
    [id(51), 'SYN MALE'],
    [id(52), 'SYN KIDS'],
    [id(20), 'SYN CASUAL'],
    [id(21), 'SYN FORMAL'],
  ]),
};

const row = (rowNumber: number, values: Partial<ProductRow> = {}): ProductRow => ({
  rowNumber,
  styleCode: 'SYN-OLD',
  sizeCode: 'M',
  colour: { code: 'SYN NAVY', valueId: id(31) },
  barcode: '111',
  categoryId: id(20),
  subCategoryCode: 'SYN CASUAL',
  hsn: '61091000',
  styleValues: { gender: { code: 'SYN MALE', valueId: id(51) } },
  ...values,
});

describe('the product of each PT row (goods-in 5.5)', () => {
  it('PRD-MER-007 finds the product by its barcode, and by brand, style, colour and size where the barcode is new', () => {
    const found = productsOf([row(3), row(4, { barcode: '999' })], facts);
    expect(found.rows).toEqual([
      {
        rowNumber: 3,
        product: { kind: 'existing', skuId: id(1), barcodeMapped: true },
        repeated: false,
        differences: [],
      },
      {
        rowNumber: 4,
        product: { kind: 'existing', skuId: id(1), barcodeMapped: false },
        repeated: false,
        differences: [],
      },
    ]);
    expect(found.proposals).toEqual([]);
  });

  it('PRD-MER-013 proposes a new product, of a new style or of an existing one, grouping rows of one style, colour and size', () => {
    const found = productsOf(
      [
        row(3, { styleCode: 'SYN-NEW', barcode: '501' }),
        row(4, { styleCode: 'SYN-NEW', barcode: '501' }),
        row(5, { sizeCode: 'XL', barcode: '502' }),
      ],
      facts,
    );
    expect(found.proposals).toEqual([
      {
        key: 'SYN-NEW|SYN NAVY|M',
        styleCode: 'SYN-NEW',
        existingStyleId: null,
        colour: { code: 'SYN NAVY', valueId: id(31) },
        sizeCode: 'M',
        rowNumbers: [3, 4],
      },
      {
        key: 'SYN-OLD|SYN NAVY|XL',
        styleCode: 'SYN-OLD',
        existingStyleId: HSN_STYLE,
        colour: { code: 'SYN NAVY', valueId: id(31) },
        sizeCode: 'XL',
        rowNumbers: [5],
      },
    ]);
    expect(found.rows.map((each) => each.product)).toEqual([
      { kind: 'proposed', key: 'SYN-NEW|SYN NAVY|M' },
      { kind: 'proposed', key: 'SYN-NEW|SYN NAVY|M' },
      { kind: 'proposed', key: 'SYN-OLD|SYN NAVY|XL' },
    ]);
  });

  it('DEC-135 flags a barcode on several products, kept for each, and never refuses it', () => {
    const found = productsOf(
      [row(3, { barcode: '222' }), row(4, { styleCode: 'SYN-NEW', barcode: '777' }), row(5, { barcode: '777' })],
      facts,
    );
    expect(found.rows.map((each) => [each.rowNumber, each.repeated])).toEqual([
      [3, true],
      [4, true],
      [5, true],
    ]);
    expect(found.rows[0]?.product).toEqual({ kind: 'existing', skuId: id(1), barcodeMapped: true });
    // The same barcode on several rows of one product is ordinary.
    expect(productsOf([row(3), row(4)], facts).rows.map((each) => each.repeated)).toEqual([false, false]);
  });

  it('DEC-138 finds by the barcode a product of the same style and size whose colour differs, and shows the difference', () => {
    const found = productsOf(
      [
        row(3, {
          colour: { code: 'PREMIUM', valueId: id(32) },
          categoryId: id(21),
          subCategoryCode: 'SYN FORMAL',
          hsn: '61099000',
          styleValues: { gender: { code: 'SYN KIDS', valueId: id(52) } },
        }),
      ],
      facts,
    );
    expect(found.rows[0]).toEqual({
      rowNumber: 3,
      product: { kind: 'existing', skuId: id(1), barcodeMapped: true },
      repeated: false,
      differences: [
        { field: 'colour', file: 'PREMIUM', product: 'SYN NAVY' },
        { field: 'subCategory', file: 'SYN FORMAL', product: 'SYN CASUAL' },
        { field: 'hsn', file: '61099000', product: '61091000' },
        { field: 'gender', file: 'SYN KIDS', product: 'SYN MALE' },
      ],
    });
  });

  it('PRD-MER-007 takes the product its barcode maps to first, even of another style or size, showing the difference', () => {
    // Goods-in 5.5: "found by its barcode's external code mapping, or by brand, style, colour and size", in that order.
    const found = productsOf([row(3, { styleCode: 'SYN-OTHER', sizeCode: 'S', barcode: '111' })], facts);
    expect(found.rows[0]).toEqual({
      rowNumber: 3,
      product: { kind: 'existing', skuId: id(1), barcodeMapped: true },
      repeated: false,
      differences: [
        { field: 'design', file: 'SYN-OTHER', product: 'SYN-OLD' },
        { field: 'size', file: 'S', product: 'M' },
      ],
    });
    expect(found.proposals).toEqual([]);
    // The barcode's mapping comes before the row's identity: a row of SKU 2's identity takes SKU 1 by its barcode.
    expect(productsOf([row(4, { sizeCode: 'L' })], facts).rows[0]?.product).toEqual({
      kind: 'existing',
      skuId: id(1),
      barcodeMapped: true,
    });
  });

  it('PRD-MER-007 DEC-135 narrows a barcode the brand repeats by style and size, then colour; with none left it proposes', () => {
    // 222 names SKU 1 (M) and SKU 2 (L): the row's size narrows it to SKU 2.
    expect(productsOf([row(3, { sizeCode: 'L', barcode: '222' })], facts).rows[0]).toMatchObject({
      product: { kind: 'existing', skuId: id(2), barcodeMapped: true },
      repeated: true,
    });
    // 333 names two SKUs of size L, navy and red: the row's colour narrows it to SKU 3.
    expect(
      productsOf([row(3, { sizeCode: 'L', barcode: '333', colour: { code: 'SYN RED', valueId: id(33) } })], facts)
        .rows[0]?.product,
    ).toEqual({ kind: 'existing', skuId: id(3), barcodeMapped: true });
    // Of size XL none is left, and no SKU of the style has it: a new product, the barcode flagged and kept for both.
    expect(productsOf([row(3, { sizeCode: 'XL', barcode: '222' })], facts).rows[0]).toMatchObject({
      product: { kind: 'proposed', key: 'SYN-OLD|SYN NAVY|XL' },
      repeated: true,
    });
  });

  it('PRD-MER-007 never takes a SKU of another brand a barcode names: the row is found by its identity instead', () => {
    expect(productsOf([row(3, { barcode: '444' })], facts).rows[0]).toMatchObject({
      product: { kind: 'existing', skuId: id(1), barcodeMapped: false },
      repeated: true,
    });
  });
});
