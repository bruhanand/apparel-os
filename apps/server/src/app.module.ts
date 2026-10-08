import { Global, Module } from '@nestjs/common';
import { CommandRunnerModule, idempotencyModuleWith, KernelModule, OrganisationRoutingModule } from './kernel/index.js';
import { AccessContractsModule, AccessModule, MODULE_APPROVALS } from './modules/access/index.js';
import { AUDIT, AuditModule, type AuditInterface } from './modules/audit/index.js';
import { FilesImportsModule } from './modules/files-imports/index.js';
import { InboxModule } from './modules/inbox/index.js';
import { ConfigurationTimezoneModule } from './modules/configuration/index.js';
import { CatalogueModule } from './modules/merchandise/catalogue/index.js';
import { PartiesModule } from './modules/merchandise/parties/index.js';
import {
  LOCATION_IN_USE,
  OrganisationModule,
  organisationApprovals,
  type LocationInUse,
} from './modules/organisation/index.js';
import { LocationStock, StockLedgerModule } from './modules/stock/ledger/index.js';

/**
 * The contracts a lower module defines and a higher one implements, handed over at start (module-map section 3, rule
 * 6): the approval rules and decision effects the modules above `access` declare for their documents
 * (access-and-approvals 8, 9.8b), and the location-in-use contract of `organisation` that `stock` · ledger implements
 * (structure-and-masters 3.5; S1-F02-T02). The defining module never depends on the implementing one. Global, so the
 * modules' factories reach them.
 */
@Global()
@Module({
  imports: [AuditModule],
  providers: [
    { provide: LOCATION_IN_USE, useFactory: (): LocationInUse => new LocationStock() },
    {
      provide: MODULE_APPROVALS,
      useFactory: (audit: AuditInterface, locationInUse: LocationInUse) => organisationApprovals(audit, locationInUse),
      inject: [AUDIT, LOCATION_IN_USE],
    },
  ],
  exports: [MODULE_APPROVALS, LOCATION_IN_USE],
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
