import { Module } from '@nestjs/common';
import { CommandRunnerModule } from '../../../kernel/index.js';
import { ACCESS, AccessModule, type AccessInterface } from '../../access/index.js';
import { AUDIT, AuditModule, type AuditInterface } from '../../audit/index.js';
import { Catalogue } from './catalogue.js';
import { STOCK_PRESENCE, type StockPresence } from './contracts/stock-presence.js';
import { SUPPLIER_ROLES, type SupplierRoles } from './contracts/supplier-roles.js';
import { CatalogueController } from './http/catalogue.controller.js';
import { CATALOGUE } from './tokens.js';

/**
 * merchandise · catalogue (module-map 4.12; structure-and-masters 4): tier 2, uses `access`, `audit`, `organisation`
 * and `kernel`. Brands, brand coverage, categories, size sets, attributes, vocabularies and vocabulary proposals
 * (S1-F03-T01); tracking profiles, styles, SKUs, packs, external codes and product proposals (S1-F03-T02). Its approval
 * rules and decision effects reach `access` through the composition root (catalogueApprovals; access-and-approvals
 * 9.8b), and so does its side of the scope contract, for brands (catalogueScopeMembers; module-map section 3, rule 6).
 * The contracts it defines reach it there too: stock presence, which `stock` · ledger implements (STOCK_PRESENCE; while
 * none is provided, a stock unit change and a change to piece-tracked are refused), and supplier roles, which the
 * parties part implements (SUPPLIER_ROLES). It reads business units and Sites through `organisation`'s interface.
 */
@Module({
  imports: [CommandRunnerModule, AuditModule, AccessModule],
  controllers: [CatalogueController],
  providers: [
    {
      provide: CATALOGUE,
      useFactory: (
        audit: AuditInterface,
        access: AccessInterface,
        suppliers: SupplierRoles,
        stockPresence: StockPresence | undefined,
      ) => new Catalogue({ audit, access, suppliers, stockPresence }),
      inject: [AUDIT, ACCESS, SUPPLIER_ROLES, { token: STOCK_PRESENCE, optional: true }],
    },
  ],
  exports: [CATALOGUE],
})
export class CatalogueModule {}
