import { Inject, Module, type OnModuleInit } from '@nestjs/common';
import { CommandRunnerModule } from '../../../kernel/index.js';
import { ACCESS, AccessModule, type AccessInterface } from '../../access/index.js';
import { AUDIT, AuditModule, type AuditInterface } from '../../audit/index.js';
import { CONFIGURATION, type ConfigurationInterface } from '../../configuration/index.js';
import { FilesImportsModule, IMPORT_HANDLERS, type ImportHandlers } from '../../files-imports/index.js';
import { Catalogue } from './catalogue.js';
import { productImportHandler } from './commands/import-products.js';
import { STOCK_PRESENCE, type StockPresence } from './contracts/stock-presence.js';
import { SUPPLIER_ROLES, type SupplierRoles } from './contracts/supplier-roles.js';
import { CatalogueController } from './http/catalogue.controller.js';
import { trackingProfilesCheck } from './queries/validity.js';
import { CATALOGUE } from './tokens.js';

/**
 * merchandise · catalogue (module-map 4.12; structure-and-masters 4): tier 2, uses `access`, `audit`, `organisation`,
 * `files-imports`, `configuration` (an origin's acceptance and the policy gate; RR-558) and `kernel`. Brands, brand
 * coverage, categories, size sets, attributes, vocabularies and vocabulary proposals (S1-F03-T01); tracking profiles,
 * styles, SKUs, packs, external codes and product proposals (S1-F03-T02).
 * Its approval rules and decision effects reach `access` through the composition root (catalogueApprovals;
 * access-and-approvals 9.8b), and so does its side of the scope contract, for brands (catalogueScopeMembers; module-map
 * section 3, rule 6). The contracts it defines reach it there too: stock presence, which `stock` · ledger implements
 * (STOCK_PRESENCE; while none is provided, a stock unit change and a change to piece-tracked are refused), and supplier
 * roles, which the parties part implements (SUPPLIER_ROLES). It reads business units and Sites through
 * `organisation`'s interface. At start it registers its create handler for products with files-imports
 * (imports-and-opening-data 13.2; structure-and-masters 7; S1-F06-T01).
 */
@Module({
  imports: [CommandRunnerModule, AuditModule, AccessModule, FilesImportsModule],
  controllers: [CatalogueController],
  providers: [
    {
      provide: CATALOGUE,
      useFactory: (
        audit: AuditInterface,
        access: AccessInterface,
        suppliers: SupplierRoles,
        stockPresence: StockPresence | undefined,
        origins: ConfigurationInterface,
      ) => new Catalogue({ audit, access, suppliers, stockPresence, origins }),
      inject: [AUDIT, ACCESS, SUPPLIER_ROLES, { token: STOCK_PRESENCE, optional: true }, CONFIGURATION],
    },
  ],
  exports: [CATALOGUE],
})
export class CatalogueModule implements OnModuleInit {
  constructor(
    @Inject(AUDIT) private readonly audit: AuditInterface,
    @Inject(ACCESS) private readonly access: AccessInterface,
    @Inject(IMPORT_HANDLERS) private readonly handlers: ImportHandlers,
    @Inject(CATALOGUE) private readonly catalogue: Catalogue,
    @Inject(CONFIGURATION) private readonly configuration: ConfigurationInterface,
  ) {}

  /**
   * Publishing a product import reaches the catalogue's own Propose a product, and an update its Prepare a SKU version
   * (module-map section 3, rule 8). The tracking profiles reach the policy gate as policy 4's values
   * (trackingProfilesCheck; module-map 4.4; goods-in 10.5; RR-558).
   */
  onModuleInit(): void {
    this.handlers.register(productImportHandler({ audit: this.audit, access: this.access, catalogue: this.catalogue }));
    this.configuration.registerCheck(trackingProfilesCheck);
  }
}
