import type { TransactionContext } from '../../../kernel/index.js';

/**
 * The location-in-use contract (structure-and-masters 3.5; module-map section 3, rule 6; S1-F02-T02): `organisation`
 * asks it before a location is retired and never reads stock tables; `stock` · ledger implements it, and the
 * composition root hands the implementation to `organisation` at start under LOCATION_IN_USE. While no implementation
 * answers, retiring a location is refused (`organisation.location-in-use-unanswered`).
 */
export interface LocationInUse {
  /**
   * Whether stock is still recorded at the location, in the caller's transaction. The answer does not depend on what
   * the caller's actor may see.
   */
  hasStock(context: TransactionContext, locationId: string): Promise<boolean>;
}

/** The token under which the composition root provides the location-in-use implementation. */
export const LOCATION_IN_USE = 'organisation.LocationInUse';
