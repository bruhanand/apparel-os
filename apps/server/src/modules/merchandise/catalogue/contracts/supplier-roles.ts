import type { TransactionContext } from '../../../../kernel/index.js';

/**
 * The supplier-role contract (structure-and-masters 4.3; S1-F03-T02): a code scoped to one supplier names a party
 * holding the supplier role. The parties part reads brands through the catalogue's interface (module-map 4.12), so the
 * catalogue does not call the parties part back: it defines this contract, the parties part implements it from its
 * dated roles, and the composition root hands the implementation to the catalogue under SUPPLIER_ROLES.
 */
export interface SupplierRoles {
  /** Whether the party holds the supplier role in force on the date, in the caller's transaction. */
  holdsSupplierRole(context: TransactionContext, partyId: string, date: string): Promise<boolean>;
}

/** The token under which the composition root provides the supplier-role implementation. */
export const SUPPLIER_ROLES = 'merchandise.SupplierRoles';
