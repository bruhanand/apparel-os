import { Module } from '@nestjs/common';
import { CommandRunnerModule, idempotencyModuleWith, KernelModule, OrganisationRoutingModule } from './kernel/index.js';
import { AccessContractsModule, AccessModule } from './modules/access/index.js';
import { AuditModule } from './modules/audit/index.js';
import { FilesImportsModule } from './modules/files-imports/index.js';
import { InboxModule } from './modules/inbox/index.js';
import { ConfigurationTimezoneModule } from './modules/configuration/index.js';
import { CatalogueModule } from './modules/merchandise/catalogue/index.js';
import { PartiesModule } from './modules/merchandise/parties/index.js';
import { OrganisationModule } from './modules/organisation/index.js';
import { StockLedgerModule } from './modules/stock/ledger/index.js';

// House rule: every constructor injection names its token with @Inject(...), so nothing depends on decorator metadata.
@Module({
  imports: [
    KernelModule,
    OrganisationRoutingModule,
    // configuration supplies the Organisation's timezone to the command runner (RR-231, RR-250).
    ConfigurationTimezoneModule,
    CommandRunnerModule,
    // The idempotency helper with the contracts access implements (RR-248), global for every module's commands.
    idempotencyModuleWith(AccessContractsModule),
    OrganisationModule,
    AuditModule,
    AccessModule,
    InboxModule,
    FilesImportsModule,
    CatalogueModule,
    PartiesModule,
    StockLedgerModule,
  ],
})
export class AppModule {}
