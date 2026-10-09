import { sql } from 'drizzle-orm';
import type { TransactionContext } from '../../../../kernel/index.js';
import type { StockPresence } from '../../../merchandise/catalogue/index.js';

/**
 * The ledger's implementation of `merchandise`'s stock-presence contract (structure-and-masters 4.4, 4.6; module-map
 * section 3, rule 6; stock-ledger 13.7; S1-F03-T02): the Sites where stock of the SKUs is recorded, answered from the
 * ledger's own balances through `stock.sites_holding_stock`, the one narrowly authorised function that reads them
 * whatever the actor's scope and returns only Site identifiers (stock-ledger 14.3; code-house-rules 5.2). The
 * composition root hands it to the catalogue under STOCK_PRESENCE.
 */
export class SkuStockPresence implements StockPresence {
  async sitesHoldingStock(context: TransactionContext, skuIds: readonly string[]): Promise<readonly string[]> {
    if (skuIds.length === 0) return [];
    const result = await context.tx.execute<{ site_id: string }>(
      sql`select site_id::text as site_id from stock.sites_holding_stock(${`{${skuIds.join(',')}}`}::uuid[]) as site_id`,
    );
    return result.rows.map((row) => row.site_id);
  }
}
