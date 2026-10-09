import type { SupplierRoles } from '../../catalogue/index.js';
import { holdsRoleOn } from '../commands/lines.js';

/**
 * The parties part's implementation of the catalogue's supplier-role contract (structure-and-masters 4.3, 5.1;
 * S1-F03-T02): whether a party holds the supplier role in force on a date, from its dated roles. The composition root
 * hands it to the catalogue under SUPPLIER_ROLES.
 */
export const partiesSupplierRoles: SupplierRoles = {
  holdsSupplierRole: (context, partyId, date) => holdsRoleOn(context, partyId, 'supplier', date),
};
