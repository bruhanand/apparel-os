import type {
  AccountingBookDraft,
  AreaDraft,
  BusinessUnitDraft,
  BusinessUnitMappingVersionDraft,
  BusinessUnitVersionDraft,
  LocationDraft,
  LocationVersionDraft,
  MappingVerificationRequest,
  MappingVerified,
  StoreDefaultWarehouseVersionDraft,
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
import type { FilesImportsInterface } from '../files-imports/index.js';
import type { Prepared, Preparer } from './commands/common.js';
import { StructurePreparation, type NamedKind, type PreparedVersion } from './commands/prepare.js';
import { verifyMapping } from './commands/verify.js';
import type { LocationInUse } from './contracts/location-in-use.js';
import type { MasterKind } from './domain/kinds.js';
import {
  kindReads,
  mappingOn,
  structureOn,
  type UnitMapping,
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
 * history, a page at a time or one record; and Read the structure as of a date. S1-F02-T02 adds business units with
 * their mappings and the mappings' verification, locations, default warehouses, and Read a unit's mapping as of a
 * date. Every operation joins the caller's transaction through its context (code-house-rules 8.1); the caller has
 * authorised it.
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
   * the Site it is at on that date (3.3; PRD-ORG-021), each business unit with its kind and its mapping version, its
   * locations and each Store's default warehouse (S1-F02-T02).
   */
  structureOn(context: TransactionContext, date: string): Promise<Structure>;
  // Business units, their mappings, locations and default warehouses (3.3 to 3.6; S1-F02-T02).
  /** A new unit with its first mapping version, decided together (3.4). */
  prepareBusinessUnit(context: TransactionContext, preparer: Preparer, draft: BusinessUnitDraft): Answer;
  prepareBusinessUnitVersion(
    context: TransactionContext,
    preparer: Preparer,
    recordId: string,
    draft: BusinessUnitVersionDraft,
  ): Answer;
  prepareBusinessUnitMappingVersion(
    context: TransactionContext,
    preparer: Preparer,
    unitId: string,
    draft: BusinessUnitMappingVersionDraft,
  ): Answer;
  prepareLocation(context: TransactionContext, preparer: Preparer, draft: LocationDraft): Answer;
  prepareLocationVersion(
    context: TransactionContext,
    preparer: Preparer,
    recordId: string,
    draft: LocationVersionDraft,
  ): Answer;
  prepareStoreDefaultWarehouseVersion(
    context: TransactionContext,
    preparer: Preparer,
    storeId: string,
    draft: StoreDefaultWarehouseVersionDraft,
  ): Answer;
  /**
   * Verify an approved mapping version (3.4; POL-10.08): the caller holds the verify permission; the verifier is not
   * the person who made it; the evidence files are attached to the verification.
   */
  verifyMapping(
    context: TransactionContext,
    verifier: Preparer,
    unitId: string,
    mappingVersionId: string,
    request: MappingVerificationRequest,
  ): Promise<Prepared<MappingVerified>>;
  /**
   * Read a unit's mapping as of a date (3.8): legal entity, registration, book, the mapping version identifier for the
   * caller to store (PRD-ACP-013) and its verification; refused when no mapping is in force on that date.
   */
  mappingOn(context: TransactionContext, unitId: string, date: string): Promise<Prepared<UnitMapping>>;
}

export interface OrganisationDependencies {
  readonly audit: AuditInterface;
  readonly access: Pick<AccessInterface, 'requestApproval' | 'approvalRequestsOf'>;
  /** Where verification evidence is attached (S1-F06-T05). */
  readonly files: Pick<FilesImportsInterface, 'attach'>;
  /** The location-in-use contract `stock` implements, or undefined while none answers (3.5). */
  readonly locationInUse?: LocationInUse | undefined;
}

/** Preparing is StructurePreparation's; the reads are the queries'. */
export class Organisation extends StructurePreparation implements OrganisationInterface {
  private readonly approvals: OrganisationDependencies['access'];
  private readonly files: OrganisationDependencies['files'];

  constructor(dependencies: OrganisationDependencies) {
    super(dependencies.audit, dependencies.access, dependencies.locationInUse);
    this.approvals = dependencies.access;
    this.files = dependencies.files;
  }

  verifyMapping(
    context: TransactionContext,
    verifier: Preparer,
    unitId: string,
    mappingVersionId: string,
    request: MappingVerificationRequest,
  ) {
    return verifyMapping(
      context,
      { audit: this.audit, files: this.files },
      verifier,
      unitId,
      mappingVersionId,
      request,
    );
  }

  async mappingOn(context: TransactionContext, unitId: string, date: string): Promise<Prepared<UnitMapping>> {
    const mapping = await mappingOn(context, unitId, date);
    if (mapping === undefined) {
      return {
        kind: 'refusal',
        refusal: {
          kind: 'not-found',
          code: 'organisation.no-mapping-in-force',
          missing: [{ kind: 'record', recordType: 'organisation.business_unit_mapping', recordId: unitId }],
        },
      };
    }
    return { kind: 'success', answer: mapping };
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
