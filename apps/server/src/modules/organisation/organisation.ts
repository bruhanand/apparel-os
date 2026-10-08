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
import { StructurePreparation, type Prepared, type PreparedVersion, type Preparer } from './commands/changes.js';
import type { MasterKind } from './domain/kinds.js';
import { masterListReads, structureOn, type Structure } from './queries/records.js';

type Answer = Promise<Prepared<PreparedVersion>>;

/** The kinds whose versions hold only a name. */
export type NamedKind = 'country' | 'state' | 'city' | 'area' | 'accounting_book';

/** A master's list with every version, as the screens read it (structure-and-masters 8). */
export type MasterList<K extends MasterKind> = Awaited<ReturnType<(typeof masterListReads)[K]>>;

/**
 * The organisation module's interface (module-map 4.11; structure-and-masters 3.8), as built by S1-F02-T01: Maintain
 * the structure for geography, legal entities, tax registrations, accounting books, Sites, Stores and groupings, each
 * change a draft version for a different authorised person to approve (2.3); each master's list with its version
 * history; and Read the structure as of a date. Business units, mappings and locations arrive with S1-F02-T02. Every
 * operation joins the caller's transaction through its context (code-house-rules 8.1); the caller has authorised it.
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
  /** A master's records with every version and the state each shows today (structure-and-masters 8). */
  list<K extends MasterKind>(context: TransactionContext, kind: K, today: string): Promise<MasterList<K>>;
  /**
   * Read the structure as of a date (structure-and-masters 3.8): each master's version in force on it, a Store with
   * the Site it is at on that date (3.3; PRD-ORG-021).
   */
  structureOn(context: TransactionContext, today: string, date: string): Promise<Structure>;
}

export interface OrganisationDependencies {
  readonly audit: AuditInterface;
  readonly access: Pick<AccessInterface, 'requestApproval' | 'approvalRequestsOf'>;
}

export class Organisation implements OrganisationInterface {
  private readonly preparation: StructurePreparation;

  constructor(private readonly dependencies: OrganisationDependencies) {
    this.preparation = new StructurePreparation(dependencies.audit, dependencies.access);
  }

  prepareCountry(context: TransactionContext, preparer: Preparer, draft: CountryDraft) {
    return this.preparation.prepareCountry(context, preparer, draft);
  }

  prepareState(context: TransactionContext, preparer: Preparer, draft: StateDraft) {
    return this.preparation.prepareState(context, preparer, draft);
  }

  prepareCity(context: TransactionContext, preparer: Preparer, draft: CityDraft) {
    return this.preparation.prepareCity(context, preparer, draft);
  }

  prepareArea(context: TransactionContext, preparer: Preparer, draft: AreaDraft) {
    return this.preparation.prepareArea(context, preparer, draft);
  }

  prepareLegalEntity(context: TransactionContext, preparer: Preparer, draft: LegalEntityDraft) {
    return this.preparation.prepareLegalEntity(context, preparer, draft);
  }

  prepareTaxRegistration(context: TransactionContext, preparer: Preparer, draft: TaxRegistrationDraft) {
    return this.preparation.prepareTaxRegistration(context, preparer, draft);
  }

  prepareAccountingBook(context: TransactionContext, preparer: Preparer, draft: AccountingBookDraft) {
    return this.preparation.prepareAccountingBook(context, preparer, draft);
  }

  prepareSite(context: TransactionContext, preparer: Preparer, draft: SiteDraft) {
    return this.preparation.prepareSite(context, preparer, draft);
  }

  prepareStore(context: TransactionContext, preparer: Preparer, draft: StoreDraft) {
    return this.preparation.prepareStore(context, preparer, draft);
  }

  prepareGrouping(context: TransactionContext, preparer: Preparer, draft: GroupingDraft) {
    return this.preparation.prepareGrouping(context, preparer, draft);
  }

  prepareNameVersion(
    context: TransactionContext,
    preparer: Preparer,
    kind: NamedKind,
    recordId: string,
    draft: NameVersionDraft,
  ) {
    return this.preparation.prepareNameVersion(context, preparer, kind, recordId, draft);
  }

  prepareLegalEntityVersion(
    context: TransactionContext,
    preparer: Preparer,
    recordId: string,
    draft: LegalEntityVersionDraft,
  ) {
    return this.preparation.prepareLegalEntityVersion(context, preparer, recordId, draft);
  }

  prepareTaxRegistrationVersion(
    context: TransactionContext,
    preparer: Preparer,
    recordId: string,
    draft: TaxRegistrationVersionDraft,
  ) {
    return this.preparation.prepareTaxRegistrationVersion(context, preparer, recordId, draft);
  }

  prepareSiteVersion(context: TransactionContext, preparer: Preparer, recordId: string, draft: SiteVersionDraft) {
    return this.preparation.prepareSiteVersion(context, preparer, recordId, draft);
  }

  prepareStoreVersion(context: TransactionContext, preparer: Preparer, recordId: string, draft: StoreVersionDraft) {
    return this.preparation.prepareStoreVersion(context, preparer, recordId, draft);
  }

  prepareGroupingVersion(
    context: TransactionContext,
    preparer: Preparer,
    recordId: string,
    draft: GroupingVersionDraft,
  ) {
    return this.preparation.prepareGroupingVersion(context, preparer, recordId, draft);
  }

  list<K extends MasterKind>(context: TransactionContext, kind: K, today: string): Promise<MasterList<K>> {
    const read = masterListReads[kind] as unknown as (
      context: TransactionContext,
      today: string,
      requests: (ids: readonly string[]) => Promise<ReadonlyMap<string, never>>,
    ) => Promise<MasterList<K>>;
    return read(context, today, (ids) => this.dependencies.access.approvalRequestsOf(context, ids) as never);
  }

  structureOn(context: TransactionContext, today: string, date: string) {
    return structureOn(context, today, date);
  }
}
