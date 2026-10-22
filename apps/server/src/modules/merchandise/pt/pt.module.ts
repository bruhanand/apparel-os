import { Inject, Module, type OnModuleInit } from '@nestjs/common';
import { CommandRunnerModule } from '../../../kernel/index.js';
import { ACCESS, AccessModule, type AccessInterface } from '../../access/index.js';
import { AUDIT, AuditModule, type AuditInterface } from '../../audit/index.js';
import {
  FILES_IMPORTS,
  FilesImportsModule,
  IMPORT_HANDLERS,
  type FilesImportsInterface,
  type ImportHandlers,
} from '../../files-imports/index.js';
import { CONFIGURATION, type ConfigurationInterface } from '../../configuration/index.js';
import { NUMBERING, NumberingModule, type NumberingInterface } from '../../numbering/index.js';
import { RECEIVING, ReceivingModule, type ReceivingInterface } from '../../receiving/index.js';
import { STOCK_LEDGER, StockLedgerModule, type StockLedgerInterface } from '../../stock/ledger/index.js';
import { PT_OPERATIONS } from './domain/gate.js';
import { PtController } from './http/pt.controller.js';
import { Pt } from './pt.js';
import { PT } from './tokens.js';

/**
 * `merchandise` · PT (module-map section 5; goods-in 5, 10.1): tier 4, uses `receiving` (goods-in 10.2: the GRN's good
 * pieces, its held lines and its "PT attached" mark), `merchandise` · catalogue (the lists, products and barcodes, read
 * through its read functions), `files-imports` (the import pipeline and its handler contract), `access`, `audit` and
 * `kernel`. In the first version a PT is made only by uploading a PT file for a GRN (DEC-134; S2-F04-T02). Its approval
 * posts through `stock` · ledger, draws its numbers from `numbering` and asks the policy gate in `configuration`
 * (goods-in 6.3, 10.5; S2-F06-T01). At start it registers its import handler with `files-imports`
 * (imports-and-opening-data 13.2) and its operations with the policy gate; its approval rule and decision effect reach
 * `access` through the composition root (ptApprovals; access-and-approvals 8, 9.8b), as its registration as a stock
 * caller reaches the ledger (stock-ledger 13.2).
 */
@Module({
  imports: [
    CommandRunnerModule,
    AuditModule,
    AccessModule,
    FilesImportsModule,
    ReceivingModule,
    NumberingModule,
    StockLedgerModule,
  ],
  controllers: [PtController],
  providers: [
    {
      provide: PT,
      useFactory: (
        audit: AuditInterface,
        access: AccessInterface,
        receiving: ReceivingInterface,
        files: FilesImportsInterface,
        configuration: ConfigurationInterface,
        ledger: StockLedgerInterface,
        numbering: NumberingInterface,
      ) => new Pt({ audit, access, receiving, files, configuration, ledger, numbering }),
      inject: [AUDIT, ACCESS, RECEIVING, FILES_IMPORTS, CONFIGURATION, STOCK_LEDGER, NUMBERING],
    },
  ],
  exports: [PT],
})
export class PtModule implements OnModuleInit {
  constructor(
    @Inject(IMPORT_HANDLERS) private readonly handlers: ImportHandlers,
    @Inject(PT) private readonly pt: Pt,
    @Inject(CONFIGURATION) private readonly configuration: ConfigurationInterface,
  ) {}

  /**
   * Publishing a PT file reaches `merchandise` · PT's own submit (module-map section 3, rule 8); its approval's
   * operations reach the policy gate (goods-in 10.5).
   */
  onModuleInit(): void {
    this.handlers.register(this.pt.importHandler());
    for (const operation of PT_OPERATIONS) this.configuration.registerOperation(operation);
  }
}
