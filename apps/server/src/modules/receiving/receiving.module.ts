import { Inject, Module, type OnModuleInit } from '@nestjs/common';
import { CommandRunnerModule } from '../../kernel/index.js';
import { ACCESS, AccessModule, type AccessInterface } from '../access/index.js';
import { AUDIT, AuditModule, type AuditInterface } from '../audit/index.js';
import { CONFIGURATION, type ConfigurationInterface } from '../configuration/index.js';
import { FILES_IMPORTS, FilesImportsModule, type FilesImportsInterface } from '../files-imports/index.js';
import { CATALOGUE, CatalogueModule, type CatalogueInterface } from '../merchandise/catalogue/index.js';
import { NUMBERING, NumberingModule, type NumberingInterface } from '../numbering/index.js';
import { ORGANISATION, OrganisationModule, type OrganisationInterface } from '../organisation/index.js';
import { STOCK_LEDGER, StockLedgerModule, type StockLedgerInterface } from '../stock/ledger/index.js';
import { RECEIVING_OPERATIONS } from './domain/gate.js';
import { ReceivingController } from './http/receiving.controller.js';
import { Receiving } from './receiving.js';
import { RECEIVING } from './tokens.js';

/**
 * `receiving` (module-map section 5; goods-in 10.1): tier 4, uses `stock` · ledger, `merchandise` · catalogue and
 * parties, `organisation`, `files-imports`, `numbering`, `configuration`, `access`, `audit` and `kernel`. In its first
 * piece the inbox, the Arrival, the count and a clean GRN (goods-in 4.1 to 4.5; S2-F02-T02). Its receiving operations
 * reach the policy gate at start (goods-in 10.5), and its registration as a stock caller and its GRN number kind reach
 * the ledger and `numbering` through the composition root (module-map section 3, rule 6).
 */
@Module({
  imports: [
    CommandRunnerModule,
    AuditModule,
    AccessModule,
    FilesImportsModule,
    CatalogueModule,
    OrganisationModule,
    NumberingModule,
    StockLedgerModule,
  ],
  controllers: [ReceivingController],
  providers: [
    {
      provide: RECEIVING,
      useFactory: (
        audit: AuditInterface,
        access: AccessInterface,
        configuration: ConfigurationInterface,
        files: FilesImportsInterface,
        numbering: NumberingInterface,
        ledger: StockLedgerInterface,
        catalogue: CatalogueInterface,
        organisation: OrganisationInterface,
      ) => new Receiving({ audit, access, configuration, files, numbering, ledger, catalogue, organisation }),
      inject: [AUDIT, ACCESS, CONFIGURATION, FILES_IMPORTS, NUMBERING, STOCK_LEDGER, CATALOGUE, ORGANISATION],
    },
  ],
  exports: [RECEIVING],
})
export class ReceivingModule implements OnModuleInit {
  constructor(@Inject(CONFIGURATION) private readonly configuration: ConfigurationInterface) {}

  /** The receiving operations, for the policy gate (module-map 4.4; goods-in 10.5). */
  onModuleInit(): void {
    for (const operation of RECEIVING_OPERATIONS) this.configuration.registerOperation(operation);
  }
}
