import type { TransactionContext } from '../../../../kernel/index.js';

/**
 * The stock-presence contract (structure-and-masters 4.4, 4.6; module-map section 3, rule 6; S1-F03-T02): `merchandise`
 * asks it before a SKU's stock unit changes (GC2-5) and before a tracking profile becomes piece-tracked (PRD-MER-018),
 * and never reads stock tables; `stock` · ledger implements it from its balances, and the composition root hands the
 * implementation to the catalogue at start under STOCK_PRESENCE. While none answers, those changes are refused
 * (`merchandise.stock-presence-unanswered`).
 */
export interface StockPresence {
  /**
   * The Sites where stock of any of the SKUs is recorded, in the caller's transaction, each once. The answer does not
   * depend on what the caller's actor may see.
   */
  sitesHoldingStock(context: TransactionContext, skuIds: readonly string[]): Promise<readonly string[]>;
}

/** The token under which the composition root provides the stock-presence implementation. */
export const STOCK_PRESENCE = 'merchandise.StockPresence';
