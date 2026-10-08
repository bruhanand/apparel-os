import type {
  AccountingBookDraft,
  AreaDraft,
  CityDraft,
  CountryDraft,
  GroupingDraft,
  GroupingVersionDraft,
  LegalEntityDraft,
  LegalEntityVersionDraft,
  NameVersionDraft,
  SiteDraft,
  SiteVersionDraft,
  StateDraft,
  StoreDraft,
  StoreVersionDraft,
  TaxRegistrationDraft,
  TaxRegistrationVersionDraft,
} from '@apparel-os/schemas';
import type { TransactionContext } from '../../kernel/index.js';
import type { AccessInterface } from '../access/index.js';
import type { AuditInterface } from '../audit/index.js';
import type { Prepared, Preparer } from './commands/common.js';
import { StructurePreparation, type NamedKind, type PreparedVersion } from './commands/prepare.js';
import type { MasterKind } from './domain/kinds.js';
import {
  kindReads,
  structureOn,
  type PageRequest,
  type RecordPage,
  type RecordView,
  type Structure,
} from './queries/records.js';

type Answer = Promise<Prepared<PreparedVersion>>;

/**
 * The organisation module's interface (module-map 4.11; structure-and-masters 3.8), as built by S1-F02-T01: Maintain
 * the structure for geography, legal entities, tax registrations, accounting books, Sites, Stores and groupings, each
 * change a draft version for a different authorised person to approve (2.3); each master's records with their version
 * history, a page at a time or one record; and Read the structure as of a date. Business units, mappings and
 * locations arrive with S1-F02-T02. Every operation joins the caller's transaction through its context
 * (code-house-rules 8.1); the caller has authorised it.
 */
export interface OrganisationInterface {
  prepareCountry(context: TransactionContext, preparer: Preparer, draft: CountryDraft): Answer;
  prepareState(context: TransactionContext, preparer: Preparer, draft: StateDraft): Answer;
  prepareCity(context: TransactionContext, preparer: Preparer, draft: CityDraft): Answer;
  prepareArea(context: TransactionContext, preparer: Preparer, draft: AreaDraft): Answer;
  prepareLegalEntity(context: TransactionContext, preparer: Preparer, draft: LegalEntityDraft): Answer;
  prepareTaxRegistration(context: TransactionContext, preparer: Preparer, draft: TaxRegistrationDraft): Answer;
  prepareAccountingBook(context: TransactionContext, preparer: Preparer, draft: AccountingBookDraft): Answer;
  prepareSite(context: TransactionContext, preparer: Preparer, draft: SiteDraft): Answer;
  prepareStore(context: TransactionContext, preparer: Preparer, draft: StoreDraft): Answer;
  prepareGrouping(context: TransactionContext, preparer: Preparer, draft: GroupingDraft): Answer;
  /** A new version of a master whose versions hold only a name. */
  prepareNameVersion(
    context: TransactionContext,
    preparer: Preparer,
    kind: NamedKind,
    recordId: string,
    draft: NameVersionDraft,
  ): Answer;
  prepareLegalEntityVersion(
    context: TransactionContext,
    preparer: Preparer,
    recordId: string,
    draft: LegalEntityVersionDraft,
  ): Answer;
  prepareTaxRegistrationVersion(
    context: TransactionContext,
    preparer: Preparer,
    recordId: string,
    draft: TaxRegistrationVersionDraft,
  ): Answer;
  prepareSiteVersion(
    context: TransactionContext,
    preparer: Preparer,
    recordId: string,
    draft: SiteVersionDraft,
  ): Answer;
  prepareStoreVersion(
    context: TransactionContext,
    preparer: Preparer,
    recordId: string,
    draft: StoreVersionDraft,
  ): Answer;
  prepareGroupingVersion(
    context: TransactionContext,
    preparer: Preparer,
    recordId: string,
    draft: GroupingVersionDraft,
  ): Answer;
  /**
   * A page of a master's records in code order, each with every version and the state each shows today
   * (structure-and-masters 8; code-house-rules 12.1).
   */
  list<K extends MasterKind>(
    context: TransactionContext,
    kind: K,
    today: string,
    page: PageRequest,
  ): Promise<RecordPage<K>>;
  /** One record with every version, or undefined when there is none of that identifier. */
  record<K extends MasterKind>(
    context: TransactionContext,
    kind: K,
    recordId: string,
    today: string,
  ): Promise<RecordView<K> | undefined>;
  /**
   * Read the structure as of a date (structure-and-masters 3.8): each master's version in force on it, a Store with
   * the Site it is at on that date (3.3; PRD-ORG-021).
   */
  structureOn(context: TransactionContext, date: string): Promise<Structure>;
}

export interface OrganisationDependencies {
  readonly audit: AuditInterface;
  readonly access: Pick<AccessInterface, 'requestApproval' | 'approvalRequestsOf'>;
}

/** Preparing is StructurePreparation's; the reads are the queries'. */
export class Organisation extends StructurePreparation implements OrganisationInterface {
  private readonly approvals: OrganisationDependencies['access'];

  constructor(dependencies: OrganisationDependencies) {
    super(dependencies.audit, dependencies.access);
    this.approvals = dependencies.access;
  }

  list<K extends MasterKind>(context: TransactionContext, kind: K, today: string, page: PageRequest) {
    return kindReads[kind].page(context, page, today, (ids) => this.approvals.approvalRequestsOf(context, ids));
  }

  record<K extends MasterKind>(context: TransactionContext, kind: K, recordId: string, today: string) {
    return kindReads[kind].one(context, recordId, today, (ids) => this.approvals.approvalRequestsOf(context, ids));
  }

  structureOn(context: TransactionContext, date: string) {
    return structureOn(context, date);
  }
}
