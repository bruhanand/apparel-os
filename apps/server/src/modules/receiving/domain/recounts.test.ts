import { describe, expect, it } from 'vitest';
import { piecesToReverse, recountOfLine, type RecountedLine } from './recounts.js';

// The recount's rules (goods-in 4.7, 4.11; PRD-REC-019; S2-F02-T05), worked by hand.

const line = (changes: Partial<RecountedLine> = {}): RecountedLine => ({
  goods: 'on-invoice',
  invoiceQuantity: 10,
  countedNow: 8,
  extra: null,
  damagedQuantity: null,
  heldLineId: null,
  ...changes,
});

describe('which lines a recount changes (goods-in 4.11)', () => {
  it('PRD-REC-019 pieces found on the invoice add to those received, and the shortage falls', () => {
    expect(recountOfLine(line(), 10)).toEqual({
      kind: 'recounted',
      before: { shortage: 2, extra: 0, received: 8, held: null, damaged: 0 },
      after: { shortage: 0, extra: 0, received: 10, held: null, damaged: 0 },
    });
  });

  it('PRD-REC-008 extra pieces not received change the finding, never the pieces received', () => {
    expect(recountOfLine(line({ invoiceQuantity: 3, countedNow: 4, extra: 'not-received' }), 6)).toMatchObject({
      before: { received: 3, extra: 1 },
      after: { received: 3, extra: 3 },
    });
    expect(recountOfLine(line({ invoiceQuantity: 3, countedNow: 4, extra: 'not-received' }), 2)).toMatchObject({
      after: { received: 2, extra: 0, shortage: 1 },
    });
  });

  it('PRD-REC-013 a held line, goods not on the invoice, pieces beyond the invoice unrecorded, below the damage and no change are refused', () => {
    expect(recountOfLine(line({ heldLineId: 'held' }), 9)).toEqual({
      kind: 'refused',
      code: 'receiving.recount-held-line',
    });
    expect(recountOfLine(line({ goods: 'wrong', invoiceQuantity: 0, extra: 'not-received' }), 3)).toEqual({
      kind: 'refused',
      code: 'receiving.recount-not-on-invoice',
    });
    expect(recountOfLine(line(), 8)).toEqual({ kind: 'refused', code: 'receiving.recount-unchanged' });
    expect(recountOfLine(line(), 11)).toEqual({ kind: 'refused', code: 'receiving.recount-adds-extra' });
    expect(recountOfLine(line({ damagedQuantity: 3 }), 2)).toEqual({
      kind: 'refused',
      code: 'receiving.recount-below-damage',
    });
    expect(recountOfLine(line({ damagedQuantity: 3 }), 3)).toMatchObject({ kind: 'recounted' });
  });
});

describe('which pieces a recount takes back (goods-in 4.11)', () => {
  const origins = [
    { receiptOriginId: 'grn', movementId: 'count', pieces: 8 },
    { receiptOriginId: 'first', movementId: 'first-count', pieces: 2 },
    { receiptOriginId: 'second', movementId: 'second-count', pieces: 0 },
  ];

  it('PRD-REC-019 takes the newest pieces first, skipping an origin with none left', () => {
    expect(piecesToReverse(origins, 3)).toEqual([
      { receiptOriginId: 'first', movementId: 'first-count', quantity: 2 },
      { receiptOriginId: 'grn', movementId: 'count', quantity: 1 },
    ]);
    expect(piecesToReverse(origins, 1)).toEqual([{ receiptOriginId: 'first', movementId: 'first-count', quantity: 1 }]);
  });

  it('PRD-REC-019 never takes back more pieces than the line received', () => {
    expect(() => piecesToReverse(origins, 11)).toThrow();
  });
});
