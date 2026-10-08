import { sql } from 'drizzle-orm';
import { CommandDefect, type TransactionContext } from '../../../../kernel/index.js';
import type { LocationInUse } from '../../../organisation/index.js';

/**
 * The ledger's implementation of `organisation`'s location-in-use contract (structure-and-masters 3.5; module-map
 * section 3, rule 6; stock-ledger 13.7; S1-F02-T02): whether stock is still recorded at a location, answered from the
 * ledger's own rows through `stock.location_has_stock`, the one narrowly authorised function that reads them whatever
 * the actor's scope and returns only yes or no (stock-ledger 14.3; code-house-rules 5.2). The composition root hands it
 * to `organisation` under LOCATION_IN_USE.
 */
export class LocationStock implements LocationInUse {
  async hasStock(context: TransactionContext, locationId: string): Promise<boolean> {
    const result = await context.tx.execute<{ held: boolean }>(
      sql`select stock.location_has_stock(${locationId}::uuid) as held`,
    );
    const held = result.rows[0]?.held;
    if (held === undefined) throw new CommandDefect('stock.location_has_stock answered no row');
    return held;
  }
}
