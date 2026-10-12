import { describe, expect, it } from 'vitest';
import { checkEventKinds } from '../../../finance/books/index.js';
import { STOCK_POSTING_EVENT_KINDS } from './event-kinds.js';

// The posting event kinds `stock` · ledger declares (books-and-posting 7.1, 7.2; S1-F10-T03).

describe('stock posting event kinds (books-and-posting 7.2)', () => {
  it('declares every kind of 7.2 with its components, each with a reversal kind, as the production composition checks them', () => {
    const kinds = checkEventKinds(STOCK_POSTING_EVENT_KINDS);
    expect(kinds.get('stock.cost-established')?.components).toEqual(['to-pool', 'to-dispatch']);
    expect(kinds.get('stock.cost-adjustment')?.components).toEqual([
      'to-pool',
      'to-dispatch',
      'to-cogs',
      'to-supplier-claim',
      'to-loss',
      'excess-to-cogs',
    ]);
    for (const kind of [
      'stock.sale-issue',
      'stock.customer-return',
      'stock.pool-dispatch',
      'stock.pool-arrival',
      'stock.failed-delivery-return',
      'stock.dispatch-loss',
      'stock.supplier-return-departure',
      'stock.supplier-handover',
      'stock.supplier-rejection-return',
      'stock.count-loss',
      'stock.write-off',
      'stock.disposal-loss',
      'stock.pass-through',
      'stock.nrv-write-down',
    ]) {
      expect(kinds.get(kind)?.components).toEqual(['cost']);
    }
    // PRD-LED-018: the reversal of an inflow made in error carries a variance (7.1; 16.1).
    expect(kinds.get('stock.cost-established-reversal')?.components).toEqual(['to-pool', 'to-dispatch', 'variance']);
    expect(kinds.get('stock.sale-issue-reversal')?.components).toEqual(['cost']);
  });
});
