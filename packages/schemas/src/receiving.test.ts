import { describe, expect, it } from 'vitest';
import { countLineDraftSchema, lineFindings, type CountedLine } from './receiving.js';

// What the count finds on a line (goods-in 4.4, 4.9; PRD-REC-006; S2-F02-T03): worked out from what the count records,
// shared by the server and the count screen. Every value here is SYNTHETIC.

const onInvoice = (invoiceQuantity: number, countedQuantity: number, overrides: Partial<CountedLine> = {}) => ({
  goods: 'on-invoice' as const,
  invoiceQuantity,
  countedQuantity,
  extra: null,
  damagedQuantity: null,
  ...overrides,
});

describe('a line’s findings (goods-in 4.4)', () => {
  it('PRD-ACP-001 invoice 10, counted 8: a shortage of 2, nothing held, 8 received', () => {
    expect(lineFindings(onInvoice(10, 8))).toEqual({ shortage: 2, extra: 0, received: 8, held: null, damaged: 0 });
  });

  it('PRD-REC-013 excess received is held as excess; not received, no custody is created for it', () => {
    expect(lineFindings(onInvoice(10, 12, { extra: 'received' }))).toEqual({
      shortage: 0,
      extra: 2,
      received: 12,
      held: { kind: 'excess', quantity: 2 },
      damaged: 0,
    });
    expect(lineFindings(onInvoice(10, 12, { extra: 'not-received' }))).toEqual({
      shortage: 0,
      extra: 2,
      received: 10,
      held: null,
      damaged: 0,
    });
  });

  it('PRD-REC-012 every piece of goods not on the invoice is extra: wrong and unidentified goods held as such, or not received', () => {
    const notOnInvoice = (goods: 'wrong' | 'unidentified', extra: 'received' | 'not-received') =>
      lineFindings({ goods, invoiceQuantity: 0, countedQuantity: 3, extra, damagedQuantity: null });
    expect(notOnInvoice('wrong', 'received')).toEqual({
      shortage: 0,
      extra: 3,
      received: 3,
      held: { kind: 'wrong', quantity: 3 },
      damaged: 0,
    });
    expect(notOnInvoice('unidentified', 'received').held).toEqual({ kind: 'unidentified', quantity: 3 });
    expect(notOnInvoice('unidentified', 'not-received')).toMatchObject({ received: 0, held: null });
  });

  it('PRD-REC-006 damage never lowers the counted quantity and coexists with a shortage', () => {
    expect(lineFindings(onInvoice(10, 9, { damagedQuantity: 2 }))).toEqual({
      shortage: 1,
      extra: 0,
      received: 9,
      held: null,
      damaged: 2,
    });
  });
});

const draft = (overrides: Record<string, unknown>) => ({
  goods: 'on-invoice',
  styleCode: 'SYN-STYLE',
  colour: null,
  sizeValueId: null,
  skuId: null,
  description: null,
  invoiceQuantity: 5,
  countedQuantity: 5,
  extra: null,
  damage: null,
  batch: null,
  ...overrides,
});
const SKU = '01900000-0000-7000-8000-00000000c001';
const issues = (overrides: Record<string, unknown>) => {
  const parsed = countLineDraftSchema.safeParse(draft(overrides));
  return parsed.success ? [] : parsed.error.issues.map((issue) => issue.path.join('.'));
};

describe('a count line as the receiver records it (goods-in 4.4, 4.9)', () => {
  it('PRD-REC-006 a clean line, a short one, an excess one with its pieces recorded, and damage on invoiced pieces are taken', () => {
    expect(issues({})).toEqual([]);
    expect(issues({ countedQuantity: 3 })).toEqual([]);
    expect(issues({ countedQuantity: 7, extra: 'not-received' })).toEqual([]);
    expect(issues({ damage: { quantity: 5, description: 'SYNTHETIC torn', photo: null } })).toEqual([]);
    expect(
      issues({
        goods: 'unidentified',
        styleCode: null,
        description: 'SYNTHETIC blue jacket, no tag',
        invoiceQuantity: 0,
        countedQuantity: 2,
        extra: 'received',
      }),
    ).toEqual([]);
    expect(issues({ goods: 'wrong', skuId: SKU, invoiceQuantity: 0, countedQuantity: 1, extra: 'received' })).toEqual(
      [],
    );
  });

  it('PRD-REC-013 extra pieces are recorded as received or not exactly when the line has some', () => {
    expect(issues({ countedQuantity: 7 })).toEqual(['extra']);
    expect(issues({ extra: 'received' })).toEqual(['extra']);
  });

  it('PRD-REC-012 PRD-MOD-015 goods not on the invoice have none on it; wrong goods name their product; unidentified goods carry no identity', () => {
    expect(issues({ goods: 'wrong', invoiceQuantity: 1, countedQuantity: 1, extra: 'received' })).toEqual([
      'skuId',
      'invoiceQuantity',
    ]);
    expect(
      issues({ goods: 'unidentified', invoiceQuantity: 0, countedQuantity: 1, extra: 'received', skuId: SKU }),
    ).toEqual(['styleCode', 'skuId', 'description']);
    expect(issues({ invoiceQuantity: 0, countedQuantity: 2, extra: 'received' })).toEqual(['invoiceQuantity']);
    expect(issues({ description: 'SYNTHETIC words' })).toEqual(['description']);
  });

  it('PRD-DMG-001 damage at the count is of pieces on the invoice that were counted, never of goods held wrong or unidentified', () => {
    expect(issues({ countedQuantity: 3, damage: { quantity: 4, description: 'SYNTHETIC', photo: null } })).toEqual([
      'damage',
    ]);
    expect(
      issues({
        countedQuantity: 7,
        extra: 'received',
        damage: { quantity: 6, description: 'SYNTHETIC', photo: null },
      }),
    ).toEqual(['damage']);
    expect(
      issues({
        goods: 'wrong',
        skuId: SKU,
        invoiceQuantity: 0,
        countedQuantity: 2,
        extra: 'received',
        damage: { quantity: 1, description: 'SYNTHETIC', photo: null },
      }),
    ).toEqual(['damage']);
  });
});
