import { Global, Module } from '@nestjs/common';
import { CommandRunnerModule, idempotencyModuleWith, KernelModule, OrganisationRoutingModule } from './kernel/index.js';
import { AccessContractsModule, AccessModule, MODULE_APPROVALS } from './modules/access/index.js';
import { AUDIT, AuditModule, type AuditInterface } from './modules/audit/index.js';
import { FilesImportsModule } from './modules/files-imports/index.js';
import { InboxModule } from './modules/inbox/index.js';
import { ConfigurationTimezoneModule } from './modules/configuration/index.js';
import { CatalogueModule } from './modules/merchandise/catalogue/index.js';
import { PartiesModule } from './modules/merchandise/parties/index.js';
import { OrganisationModule, organisationApprovals } from './modules/organisation/index.js';
import { StockLedgerModule } from './modules/stock/ledger/index.js';

/**
 * The approval rules and decision effects the modules above `access` declare for their documents, handed to `access`
 * at start (access-and-approvals 8, 9.8b; module-map section 3, rule 6): `access` defines the contract and never
 * depends on the modules that implement it. Global, so AccessModule's factory reaches it.
 */
@Global()
@Module({
  imports: [AuditModule],
  providers: [
    {
      provide: MODULE_APPROVALS,
      useFactory: (audit: AuditInterface) => organisationApprovals(audit),
      inject: [AUDIT],
    },
  ],
  exports: [MODULE_APPROVALS],
})
export class ModuleApprovalsModule {}

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
    ModuleApprovalsModule,
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
