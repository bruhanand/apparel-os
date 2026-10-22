import { Inject, Module, type OnModuleInit } from '@nestjs/common';
import { CommandRunnerModule } from '../../kernel/index.js';
import { ACCESS, AccessModule, type AccessInterface } from '../access/index.js';
import { AUDIT, AuditModule, type AuditInterface } from '../audit/index.js';
import { BOOKING, BookingModule, type BookingInterface } from '../booking/index.js';
import { CONFIGURATION, type ConfigurationInterface } from '../configuration/index.js';
import { EXCEPTIONS, ExceptionsModule, type ExceptionsInterface } from '../exceptions/index.js';
import { FILES_IMPORTS, FilesImportsModule, type FilesImportsInterface } from '../files-imports/index.js';
import { NUMBERING, NumberingModule, type NumberingInterface } from '../numbering/index.js';
import { STOCK_DOCUMENTS, StockDocumentsModule, type StockDocumentsInterface } from '../stock/documents/index.js';
import { STOCK_LEDGER, StockLedgerModule, type StockLedgerInterface } from '../stock/ledger/index.js';
import { RECEIVING_OPERATIONS } from './domain/gate.js';
import { ReceivingController } from './http/receiving.controller.js';
import { Receiving } from './receiving.js';
import { RECEIVING } from './tokens.js';

/**
 * `receiving` (module-map section 5; goods-in 10.1): tier 4, uses `booking` and `stock` · documents (goods-in 10.2),
 * `stock` · ledger, `merchandise` · catalogue and parties, `organisation`, `exceptions`, `files-imports`, `numbering`,
 * `configuration`, `access`, `audit` and `kernel`. The inbox, the Arrival, the count with its findings, the GRN, the
 * held lines Booking decides and the links of GRN lines to bookings (goods-in 3.7, 4.1 to 4.6, 4.10; S2-F02-T02 to
 * S2-F02-T04). It reads the masters of `organisation` and
 * `merchandise` through their read functions, so it injects only the services it acts through. Its operations reach
 * the policy gate at start (goods-in 10.5), and its registration as a stock caller, its GRN number kind, its approval
 * rule and decision effect and its exception types reach the modules below through the composition root (module-map
 * section 3, rule 6).
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
    StockDocumentsModule,
    BookingModule,
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
        exceptions: ExceptionsInterface,
        documents: StockDocumentsInterface,
        booking: BookingInterface,
      ) => new Receiving({ audit, access, configuration, files, numbering, ledger, exceptions, documents, booking }),
      inject: [
        AUDIT,
        ACCESS,
        CONFIGURATION,
        FILES_IMPORTS,
        NUMBERING,
        STOCK_LEDGER,
        EXCEPTIONS,
        STOCK_DOCUMENTS,
        BOOKING,
      ],
    },
  ],
  exports: [RECEIVING],
})
export class ReceivingModule implements OnModuleInit {
  constructor(@Inject(CONFIGURATION) private readonly configuration: ConfigurationInterface) {}

  /** Receiving's operations, for the policy gate (module-map 4.4; goods-in 10.5). */
  onModuleInit(): void {
    for (const operation of RECEIVING_OPERATIONS) this.configuration.registerOperation(operation);
  }
}
