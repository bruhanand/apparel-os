import type { PostingEventKind } from '../../../finance/books/index.js';

// The posting event kinds `stock` · ledger declares for its valued movements (books-and-posting 7.1, 7.2; stock-ledger
// 7.11; S1-F10-T03): each with its components and the stage it goes live, and a reversal kind with the same
// components, named `<kind>-reversal`. The reversal of an inflow made in error, a cost established or a cost
// adjustment, also carries `variance` for the part that would take a pool below zero (7.5; PRD-LED-018). Declared
// here before any code posts them; the composition root hands them to `finance` · books (POSTING_EVENT_KINDS).

const forward: readonly { kind: string; components: readonly string[]; liveStage: number; inflow?: true }[] = [
  { kind: 'stock.cost-established', components: ['to-pool', 'to-dispatch'], liveStage: 2, inflow: true },
  {
    kind: 'stock.cost-adjustment',
    components: ['to-pool', 'to-dispatch', 'to-cogs', 'to-supplier-claim', 'to-loss', 'excess-to-cogs'],
    liveStage: 2,
    inflow: true,
  },
  { kind: 'stock.sale-issue', components: ['cost'], liveStage: 4 },
  { kind: 'stock.customer-return', components: ['cost'], liveStage: 4 },
  { kind: 'stock.pool-dispatch', components: ['cost'], liveStage: 3 },
  { kind: 'stock.pool-arrival', components: ['cost'], liveStage: 3 },
  { kind: 'stock.failed-delivery-return', components: ['cost'], liveStage: 3 },
  { kind: 'stock.dispatch-loss', components: ['cost'], liveStage: 3 },
  { kind: 'stock.supplier-return-departure', components: ['cost'], liveStage: 3 },
  { kind: 'stock.supplier-handover', components: ['cost'], liveStage: 3 },
  { kind: 'stock.supplier-rejection-return', components: ['cost'], liveStage: 3 },
  { kind: 'stock.count-loss', components: ['cost'], liveStage: 3 },
  { kind: 'stock.write-off', components: ['cost'], liveStage: 3 },
  { kind: 'stock.disposal-loss', components: ['cost'], liveStage: 3 },
  { kind: 'stock.pass-through', components: ['cost'], liveStage: 4 },
  { kind: 'stock.nrv-write-down', components: ['cost'], liveStage: 5 },
];

/** The kinds of books-and-posting 7.2 and their reversal kinds. */
export const STOCK_POSTING_EVENT_KINDS: readonly PostingEventKind[] = forward.flatMap((each) => [
  {
    kind: each.kind,
    components: each.components,
    reversalKind: `${each.kind}-reversal`,
    liveStage: each.liveStage,
  },
  {
    kind: `${each.kind}-reversal`,
    components: each.inflow === true ? [...each.components, 'variance'] : each.components,
    reversalKind: null,
    liveStage: each.liveStage,
  },
]);
