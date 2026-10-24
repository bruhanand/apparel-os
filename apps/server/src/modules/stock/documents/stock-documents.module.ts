import { Inject, Module, type OnModuleInit } from '@nestjs/common';
import { CommandRunnerModule } from '../../../kernel/index.js';
import { ACCESS, AccessModule, type AccessInterface } from '../../access/index.js';
import { AUDIT, AuditModule, type AuditInterface } from '../../audit/index.js';
import { CONFIGURATION, type ConfigurationInterface } from '../../configuration/index.js';
import { EXCEPTIONS, ExceptionsModule, type ExceptionsInterface } from '../../exceptions/index.js';
import { FILES_IMPORTS, FilesImportsModule, type FilesImportsInterface } from '../../files-imports/index.js';
import { NUMBERING, NumberingModule, type NumberingInterface } from '../../numbering/index.js';
import { STOCK_LEDGER, StockLedgerModule, type StockLedgerInterface } from '../ledger/index.js';
import { StockDocuments } from './documents.js';
import { DAMAGE_REPORTS } from './domain/kinds.js';
import { DamageController } from './http/damage.controller.js';
import { STOCK_DOCUMENTS } from './tokens.js';

/**
 * `stock` · documents (module-map section 5; goods-in 8, 10.1): tier 4, uses `stock` · ledger, `access`, `audit`,
 * `configuration`, `exceptions`, `files-imports`, `numbering`, `organisation`, `merchandise` · catalogue and `kernel`.
 * In its first piece the damage reports (S2-F08-T01). It reads the masters of `organisation` and `merchandise` through
 * their read functions, so it injects only the services it acts through. Its damage operation reaches the policy gate
 * at start (goods-in 10.5); its registration as a stock caller, its number kind, its approval rules and decision effects
 * and its exception type reach the modules below through the composition root (module-map section 3, rule 6).
 */
@Module({
  imports: [
    CommandRunnerModule,
    AuditModule,
    AccessModule,
    ExceptionsModule,
    FilesImportsModule,
    NumberingModule,
    StockLedgerModule,
  ],
  controllers: [DamageController],
  providers: [
    {
      provide: STOCK_DOCUMENTS,
      useFactory: (
        audit: AuditInterface,
        access: AccessInterface,
        configuration: ConfigurationInterface,
        files: FilesImportsInterface,
        numbering: NumberingInterface,
        ledger: StockLedgerInterface,
        exceptions: ExceptionsInterface,
      ) => new StockDocuments({ audit, access, configuration, files, numbering, ledger, exceptions }),
      inject: [AUDIT, ACCESS, CONFIGURATION, FILES_IMPORTS, NUMBERING, STOCK_LEDGER, EXCEPTIONS],
    },
  ],
  exports: [STOCK_DOCUMENTS],
})
export class StockDocumentsModule implements OnModuleInit {
  constructor(@Inject(CONFIGURATION) private readonly configuration: ConfigurationInterface) {}

  /** The damage operation, for the policy gate (module-map 4.4; goods-in 10.5). */
  onModuleInit(): void {
    this.configuration.registerOperation(DAMAGE_REPORTS);
  }
}
