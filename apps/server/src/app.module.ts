import { Global, Module } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import {
  CommandRunnerModule,
  idempotencyModuleWith,
  KernelModule,
  LiveUpdatesModule,
  OrganisationRoutingModule,
} from './kernel/index.js';
import {
  ACCESS,
  AccessContractsModule,
  AccessModule,
  DECISION_EVIDENCE,
  MODULE_APPROVALS,
  SCOPE_MEMBERS,
  type AccessInterface,
  type ModuleApprovals,
  type ScopeMembers,
} from './modules/access/index.js';
import { BookingModule, bookingApprovals } from './modules/booking/index.js';
import {
  ReceivingModule,
  receivingApprovals,
  receivingExceptionTypes,
  receivingStockCaller,
} from './modules/receiving/index.js';
import { AUDIT, AuditModule, type AuditInterface } from './modules/audit/index.js';
import { composedNumbering, numberedKinds } from './numbered-kinds.js';
import {
  COUNT_SETS,
  decisionEvidence,
  filesImportsApprovals,
  FilesImportsModule,
  IMPORT_HANDLERS,
  ImportHandlers,
  openingPlansOf,
  policyEvidence,
  type CountSets,
} from './modules/files-imports/index.js';
import {
  EXCEPTION_TYPES,
  ExceptionsModule,
  routingApprovals,
  type ExceptionTypeRegistration,
} from './modules/exceptions/index.js';
import { InboxModule, workItemRoutingApprovals } from './modules/inbox/index.js';
import { NUMBERED_KINDS } from './modules/numbering/index.js';
import {
  CONFIGURATION,
  ConfigurationModule,
  ConfigurationTimezoneModule,
  POLICY_EVIDENCE,
  type ConfigurationInterface,
} from './modules/configuration/index.js';
import { SiteLifecycleModule, siteLifecycleApprovals } from './modules/site-lifecycle/index.js';
import { PosModule, posApprovals } from './modules/pos/index.js';
import { EboImportsModule } from './modules/ebo-imports/index.js';
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
import { TaxRulesModule, taxRulesApprovals } from './modules/finance/tax-rules/index.js';
import {
  BookStockHistory,
  LedgerCountSet,
  LocationStock,
  SkuStockPresence,
  STOCK_CALLERS,
  STOCK_LEDGER,
  STOCK_POSTING_EVENT_KINDS,
  StockLedgerModule,
  type CallerRegistration,
  type StockLedgerInterface,
} from './modules/stock/ledger/index.js';
import {
  damageExceptionType,
  StockDocumentsModule,
  stockDocumentsApprovals,
  stockDocumentsStockCaller,
} from './modules/stock/documents/index.js';
import {
  BOOK_HELD_STOCK,
  BooksModule,
  booksApprovals,
  checkEventKinds,
  POSTING_EVENT_KINDS,
  type BookHeldStock,
  type PostingEventKind,
} from './modules/finance/books/index.js';

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
    // The import handler contract of `files-imports`, which `merchandise` and `organisation` implement and register
    // with at start (imports-and-opening-data 13.2; module-map 4.7). Provided here because `files-imports`' own
    // decision effects check a mapping rule's target through the handler that owns it (6.3; S1-F06-T03).
    { provide: IMPORT_HANDLERS, useFactory: () => new ImportHandlers() },
    // The count side of a comparison run, which `stock` · ledger answers from Custody (imports-and-opening-data 10.3;
    // S1-F13-T01).
    { provide: COUNT_SETS, useFactory: (): CountSets => new LedgerCountSet() },
    // The catalogue's contracts (structure-and-masters 4.3, 4.4, 4.6; S1-F03-T02): stock presence, which `stock` ·
    // ledger answers, and supplier roles, which the parties part answers.
    { provide: STOCK_PRESENCE, useFactory: (): StockPresence => new SkuStockPresence() },
    { provide: SUPPLIER_ROLES, useValue: partiesSupplierRoles satisfies SupplierRoles },
    // "Has this book held stock?", the contract of `finance` · books that `stock` · ledger answers (books-and-posting
    // 2.2; stock-ledger 13.7; DEC-116; S1-F09-T01).
    { provide: BOOK_HELD_STOCK, useFactory: (): BookHeldStock => new BookStockHistory() },
    {
      provide: MODULE_APPROVALS,
      useFactory: (
        audit: AuditInterface,
        locationInUse: LocationInUse,
        configuration: ConfigurationInterface,
        bookHeldStock: BookHeldStock,
        importHandlers: ImportHandlers,
        modules: ModuleRef,
      ) =>
        bothApprovals(
          organisationApprovals(audit, locationInUse),
          routingApprovals(audit),
          // Task and approval routing (access-and-approvals 9.4, 11.3; S1-F05-T02).
          workItemRoutingApprovals(audit),
          // Brand coverage and vocabulary confirmation (structure-and-masters 3.3, 4.2; S1-F03-T01), and the season and
          // size attributes, whose origin `configuration` rechecks (4.2 "As built"; RR-550, RR-556).
          catalogueApprovals(audit, configuration),
          // Bank-detail changes and agreement versions (structure-and-masters 5.1, 5.2; S1-F03-T03).
          partiesApprovals(audit),
          // Tax-rule versions, decided by a different Accounts user with the CA's evidence (shared-calculations 10.1;
          // S1-F09-T04).
          taxRulesApprovals(audit),
          // A Site's shared readiness and an activity's approval, which writes the grant into configuration with the
          // one writer of grants, claimed here for it (module-map 4.4, 4.16; S1-F04-T02).
          siteLifecycleApprovals({
            audit,
            configuration,
            grants: configuration.claimActivityGrants(),
            locationInUse,
            // The opening plan read of files-imports: an approved, unpublished opening-stock batch (DEC-117; S1-F13-T01).
            openingPlans: openingPlansOf(importHandlers),
          }),
          // Account and book-setting versions (books-and-posting 6.3; S1-F09-T01).
          booksApprovals(audit, bookHeldStock),
          // The financial years and the bill-number format, whose approval defines every Active billing device's
          // missing series, through `numbering` built with every declared kind, the origin rechecked by `configuration`
          // (offline-counter 4.3b; DEC-117; code-house-rules 12.14; S1-F12-T03).
          posApprovals({ audit, numbering: composedNumbering(), origins: configuration }),
          // Layout, mapping and mapping rule versions (imports-and-opening-data 6.4; S1-F06-T03).
          filesImportsApprovals(audit, importHandlers),
          // An open-to-buy budget version's check and approval (goods-in 3.3; S2-F01-T02). The check's effect requests
          // the approval in the decision's transaction through `access`, which is built with these effects, so it
          // reaches `access` when it runs, never at start (access-and-approvals 9.8b "As built for a document decided
          // in two steps").
          // A booking version's approval asks the policy gate and draws its number from the booking series through
          // `numbering` built with every declared kind (goods-in 3.4, 10.5; S2-F01-T03).
          bookingApprovals({
            audit,
            configuration,
            numbering: composedNumbering(),
            requests: () => modules.get<AccessInterface>(ACCESS, { strict: false }),
          }),
          // A damage report's decision and a reversal's approval (goods-in 8.3; S2-F08-T01), which post through the
          // stock ledger and verify and use the decision under its locks; `access` and the ledger are built after
          // these effects, so they reach them when they run, never at start (access-and-approvals 9.8b).
          stockDocumentsApprovals({
            audit,
            services: () => ({
              access: modules.get<AccessInterface>(ACCESS, { strict: false }),
              ledger: modules.get<StockLedgerInterface>(STOCK_LEDGER, { strict: false }),
              configuration,
            }),
          }),
          // A held line's decision, taking excess, wrong or unidentified goods in or leaving them held, which asks the
          // policy gate under the held line's lock (goods-in 4.6, 10.5; S2-F02-T03).
          receivingApprovals({ audit, services: () => ({ configuration }) }),
        ),
      inject: [AUDIT, LOCATION_IN_USE, CONFIGURATION, BOOK_HELD_STOCK, IMPORT_HANDLERS, ModuleRef],
    },
    // The scope contract `access` defines: `organisation` answers legal entities and places (S1-F02-T03), and
    // `merchandise` · catalogue brands (S1-F03-T01).
    {
      provide: SCOPE_MEMBERS,
      useValue: [organisationScopeMembers, catalogueScopeMembers] satisfies readonly ScopeMembers[],
    },
    // The kinds the owning modules number: the exception code (S1-F08-T02), the journal (books-and-posting 5.4;
    // S1-F09-T02), the bill, per billing device and tax registration (offline-counter 4.1; S1-F12-T01), and the import
    // batch code (imports-and-opening-data 15.1; GC9-9; S1-F06-T01): `numbered-kinds.ts`.
    {
      provide: NUMBERED_KINDS,
      useValue: numberedKinds,
    },
    // The posting event kinds the posting modules declare (books-and-posting 7.1): `stock` · ledger's kinds of 7.2 and
    // their reversal kinds (S1-F10-T03).
    {
      provide: POSTING_EVENT_KINDS,
      useFactory: () => checkEventKinds(STOCK_POSTING_EVENT_KINDS satisfies readonly PostingEventKind[]),
    },
    // The modules that post stock, registered with the ledger at start, none synthetic (stock-ledger 13.2): `receiving`'s
    // receipt counts from a GRN and the holds of what its count found (goods-in 4.5, 4.9; stock-ledger 13.16;
    // S2-F02-T02, S2-F02-T03), and `stock` · documents' damage holds, decisions and reversals (goods-in 8;
    // stock-ledger 13.15; S2-F08-T01).
    {
      provide: STOCK_CALLERS,
      useValue: [receivingStockCaller, stockDocumentsStockCaller] satisfies readonly CallerRegistration[],
    },
    // The exception types the raising modules register (access-and-approvals 12.1): the damage a report raises, to
    // Operations as its routing says (goods-in 8.2; S2-F08-T01), and the shortage and held lines a GRN's count finds,
    // to Booking (goods-in 4.5; S2-F02-T03).
    {
      provide: EXCEPTION_TYPES,
      useValue: [damageExceptionType, ...receivingExceptionTypes] satisfies readonly ExceptionTypeRegistration[],
    },
    // The decision-evidence contract of `access`, which files-imports' Attach implements (9.5; S1-F08-T03).
    { provide: DECISION_EVIDENCE, useFactory: (audit: AuditInterface) => decisionEvidence(audit), inject: [AUDIT] },
    // The policy-evidence contract of `configuration`, which files-imports' Attach implements (module-map 4.4;
    // S1-F04-T01).
    { provide: POLICY_EVIDENCE, useFactory: (audit: AuditInterface) => policyEvidence(audit), inject: [AUDIT] },
  ],
  exports: [
    MODULE_APPROVALS,
    IMPORT_HANDLERS,
    COUNT_SETS,
    LOCATION_IN_USE,
    BOOK_HELD_STOCK,
    STOCK_PRESENCE,
    SUPPLIER_ROLES,
    SCOPE_MEMBERS,
    NUMBERED_KINDS,
    POSTING_EVENT_KINDS,
    STOCK_CALLERS,
    EXCEPTION_TYPES,
    DECISION_EVIDENCE,
    POLICY_EVIDENCE,
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
    // The policy gate, with the policy status, capabilities and activity grants (module-map 4.4; S1-F04-T01).
    ConfigurationModule,
    OrganisationModule,
    AuditModule,
    AccessModule,
    InboxModule,
    ExceptionsModule,
    FilesImportsModule,
    CatalogueModule,
    PartiesModule,
    StockLedgerModule,
    // The tax-rule records the calculations read (shared-calculations 10; S1-F09-T04).
    TaxRulesModule,
    // Readiness checks and unit activation (module-map 4.16; S1-F04-T02).
    SiteLifecycleModule,
    // Book settings, the chart of accounts and the CA's approval evidence (module-map 4.14; S1-F09-T01).
    BooksModule,
    // Billing devices, their enrolment and bill series (module-map 4.17; offline-counter 3, 4; S1-F12-T01).
    PosModule,
    // The historical-reference handler for the earlier POS's SOH and daily sales, which never moves stock (module-map
    // section 5, 11.1; imports-and-opening-data 4.1; DEC-116; S1-F13-T01).
    EboImportsModule,
    // Bookings: in the first piece of stage 2, the open-to-buy budgets (module-map section 5; goods-in 3.3; S2-F01-T02).
    BookingModule,
    // Receive Goods: the inbox, the Arrival, the count and the GRN (module-map section 5; goods-in 4; S2-F02-T02).
    ReceivingModule,
    // Damage reports (module-map section 5; goods-in 8; S2-F08-T01).
    StockDocumentsModule,
  ],
})
export class AppModule {}
