import type { TransactionContext } from '../../../../kernel/index.js';
import type { ComparisonRow, CountSets } from '../../../files-imports/index.js';
import { custody } from '../queries/reads.js';

/**
 * The ledger's implementation of `files-imports`' count-set contract (imports-and-opening-data 10.3; module-map
 * section 3, rule 6; S1-F13-T01): the stock of a unit at its Site as Custody reads it (stock-ledger 13.6), in the
 * reader's transaction and under the reader's own row-level security, summed per SKU and location, with the time it
 * was read. Only a physical count creates stock, so the quantity the ledger holds is the count as posted; until the
 * switch count document of the stage 4 design exists, it is the count a comparison reads. A balance with no SKU or no
 * location is kept with that part Unknown, never dropped. The composition root hands it to `files-imports` under
 * COUNT_SETS.
 */
export class LedgerCountSet implements CountSets {
  async countAt(
    context: TransactionContext,
    place: { readonly siteId: string; readonly businessUnitId: string },
  ): Promise<{ readonly asOf: string; readonly rows: readonly ComparisonRow[] }> {
    const read = await custody(context, { siteId: place.siteId, businessUnitId: place.businessUnitId });
    const sums = new Map<string, { skuId: string | null; locationId: string | null; quantity: number }>();
    for (const row of read.rows) {
      const key = `${row.skuId ?? '-'}|${row.locationId ?? '-'}`;
      const sum = sums.get(key) ?? { skuId: row.skuId, locationId: row.locationId, quantity: 0 };
      sum.quantity += row.quantity;
      sums.set(key, sum);
    }
    return {
      asOf: read.asOf,
      rows: [...sums.entries()].map(([key, sum]) => ({
        rowId: key,
        barcode: null,
        skuId: sum.skuId,
        locationId: sum.locationId,
        quantity: sum.quantity,
      })),
    };
  }
}
