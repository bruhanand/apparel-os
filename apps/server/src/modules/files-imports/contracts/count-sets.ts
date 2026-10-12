import type { TransactionContext } from '../../../kernel/index.js';
import type { ComparisonRow } from '../domain/comparison.js';

/**
 * The count side of a comparison run (imports-and-opening-data 10.3; S1-F13-T01): the stock counted at a unit, read
 * from the stock module's read model under the reader's own authorisation, with the time it was read. A contract
 * files-imports defines and `stock` · ledger implements, handed over by the composition root (module-map section 3,
 * rule 6): files-imports never depends on `stock`. Each row is one SKU at one location, with no barcode.
 *
 * As built in stage 1 the stock ledger answers it from Custody (stock-ledger 13.6) of the unit at its Site; the switch
 * count document of the stage 4 design replaces that source, behind the same contract.
 */
export interface CountSets {
  /** The count of the unit at its Site, as the reader may see it; a row's identifier names its SKU and location. */
  countAt(
    context: TransactionContext,
    place: { readonly siteId: string; readonly businessUnitId: string },
  ): Promise<{ readonly asOf: string; readonly rows: readonly ComparisonRow[] }>;
}

/** The token of the count read, which the composition root provides. */
export const COUNT_SETS = 'files-imports.CountSets';
