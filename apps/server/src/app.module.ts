import { Global, Module } from '@nestjs/common';
import {
  CommandRunnerModule,
  idempotencyModuleWith,
  KernelModule,
  LiveUpdatesModule,
  OrganisationRoutingModule,
} from './kernel/index.js';
import {
  AccessContractsModule,
  AccessModule,
  DECISION_EVIDENCE,
  MODULE_APPROVALS,
  SCOPE_MEMBERS,
  type ModuleApprovals,
  type ScopeMembers,
} from './modules/access/index.js';
import { AUDIT, AuditModule, type AuditInterface } from './modules/audit/index.js';
import { decisionEvidence, FilesImportsModule } from './modules/files-imports/index.js';
import {
  EXCEPTION_CODE_KIND,
  EXCEPTION_TYPES,
  ExceptionsModule,
  routingApprovals,
  type ExceptionTypeRegistration,
} from './modules/exceptions/index.js';
import { InboxModule, workItemRoutingApprovals } from './modules/inbox/index.js';
import { NUMBERED_KINDS, type NumberedKind } from './modules/numbering/index.js';
import { ConfigurationTimezoneModule } from './modules/configuration/index.js';
import {
  CatalogueModule,
  catalogueApprovals,
  catalogueScopeMembers,
  STOCK_PRESENCE,
  SUPPLIER_ROLES,
  type StockPresence,
  type SupplierRoles,
} from './modules/merchandise/catalogue/index.js';
import { PartiesModule, partiesApprovals, partiesSupplierRoles } from './modules/merchandise/parties/index.js';
import {
  LOCATION_IN_USE,
  OrganisationModule,
  organisationApprovals,
  organisationScopeMembers,
  type LocationInUse,
} from './modules/organisation/index.js';
import { LocationStock, SkuStockPresence, StockLedgerModule } from './modules/stock/ledger/index.js';

/** The approval rules and decision effects of several modules, as one (access-and-approvals 9.8b). */
function bothApprovals(...modules: readonly ModuleApprovals[]): ModuleApprovals {
  return {
    rules: modules.flatMap((each) => each.rules),
    effects: new Map(modules.flatMap((each) => [...each.effects])),
  };
}

/**
 * The contracts a lower module defines and a higher one implements, handed over at start (module-map section 3, rule
 * 6): the approval rules and decision effects the modules above `access` declare for their documents
 * (access-and-approvals 8, 9.8b), the scope contract of `access` that `organisation` implements (5.1; S1-F02-T03),
 * the location-in-use contract of `organisation` that `stock` · ledger implements
 * (structure-and-masters 3.5; S1-F02-T02), and the kinds `numbering` serves, declared by the modules that own them
 * (numbering-and-audit 3.1; S1-F08-T02). The defining module never depends on the implementing one. Global, so the
 * modules' factories reach them.
 */
@Global()
@Module({
  imports: [AuditModule],
  providers: [
    { provide: LOCATION_IN_USE, useFactory: (): LocationInUse => new LocationStock() },
    // The catalogue's contracts (structure-and-masters 4.3, 4.4, 4.6; S1-F03-T02): stock presence, which `stock` ·
    // ledger answers, and supplier roles, which the parties part answers.
    { provide: STOCK_PRESENCE, useFactory: (): StockPresence => new SkuStockPresence() },
    { provide: SUPPLIER_ROLES, useValue: partiesSupplierRoles satisfies SupplierRoles },
    {
      provide: MODULE_APPROVALS,
      useFactory: (audit: AuditInterface, locationInUse: LocationInUse) =>
        bothApprovals(
          organisationApprovals(audit, locationInUse),
          routingApprovals(audit),
          // Task and approval routing (access-and-approvals 9.4, 11.3; S1-F05-T02).
          workItemRoutingApprovals(audit),
          // Brand coverage and vocabulary confirmation (structure-and-masters 3.3, 4.2; S1-F03-T01).
          catalogueApprovals(audit),
          // Bank-detail changes and agreement versions (structure-and-masters 5.1, 5.2; S1-F03-T03).
          partiesApprovals(audit),
        ),
      inject: [AUDIT, LOCATION_IN_USE],
    },
    // The scope contract `access` defines: `organisation` answers legal entities and places (S1-F02-T03), and
    // `merchandise` · catalogue brands (S1-F03-T01).
    {
      provide: SCOPE_MEMBERS,
      useValue: [organisationScopeMembers, catalogueScopeMembers] satisfies readonly ScopeMembers[],
    },
    // The kinds the owning modules number (numbering-and-audit 3.1): so far the exception code (S1-F08-T02).
    { provide: NUMBERED_KINDS, useValue: [EXCEPTION_CODE_KIND] satisfies readonly NumberedKind[] },
    // The exception types the raising modules register (access-and-approvals 12.1): none yet beside the module's own.
    { provide: EXCEPTION_TYPES, useValue: [] satisfies readonly ExceptionTypeRegistration[] },
    // The decision-evidence contract of `access`, which files-imports' Attach implements (9.5; S1-F08-T03).
    { provide: DECISION_EVIDENCE, useFactory: (audit: AuditInterface) => decisionEvidence(audit), inject: [AUDIT] },
  ],
  exports: [
    MODULE_APPROVALS,
    LOCATION_IN_USE,
    STOCK_PRESENCE,
    SUPPLIER_ROLES,
    SCOPE_MEMBERS,
    NUMBERED_KINDS,
    EXCEPTION_TYPES,
    DECISION_EVIDENCE,
  ],
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
    // Live updates and the operations view (code-house-rules 12.9, 12.12; S1-F08-T04).
    LiveUpdatesModule,
    // The idempotency helper with the contracts access implements (RR-248), global for every module's commands.
    idempotencyModuleWith(AccessContractsModule),
    ModuleApprovalsModule,
    OrganisationModule,
    AuditModule,
    AccessModule,
    InboxModule,
    ExceptionsModule,
    FilesImportsModule,
    CatalogueModule,
    PartiesModule,
    StockLedgerModule,
  ],
})
export class AppModule {}
