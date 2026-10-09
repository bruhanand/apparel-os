import {
  routes,
  type CommandRoute,
  type MappingVerified,
  type MasterLists,
  type MasterPageQuery,
  type PermissionAction,
} from '@apparel-os/schemas';
import { Controller, Inject } from '@nestjs/common';
import {
  ApiRefusal,
  ApiRoute,
  COMMAND_RUNNER,
  CommandDefect,
  commandAnswer,
  IDEMPOTENCY_HELPER,
  requestContentOf,
  RouteInput,
  type CommandOutcome,
  type CommandRunner,
  type IdempotencyHelper,
  type JsonValue,
  type ReplayAuthorisation,
  type RequestContent,
  type RouteInputOf,
  type TransactionContext,
} from '../../../kernel/index.js';
import {
  ACCESS,
  SignedIn,
  type AccessInterface,
  type Authorisation,
  type RecordFacts,
  type SignedInUser,
} from '../../access/index.js';
import type { Prepared, Preparer } from '../commands/common.js';
import type { PreparedVersion } from '../commands/prepare.js';
import { masterKinds, recordTypeOf, type MasterKind } from '../domain/kinds.js';
import { isPlaceScoped, placeCode } from '../queries/scope.js';
import type { OrganisationInterface } from '../organisation.js';
import { ORGANISATION } from '../tokens.js';

/**
 * The scope facts a command on a place-scoped record type is authorised with (access-and-approvals 5.3, 7.1 step 3;
 * structure-and-masters 6.1): the record's facts on the day, or a new record's from its draft, and, for a version that
 * moves the record, the facts it moves it to, which the same assignment must cover (product owner, 9 Oct 2026).
 */
interface CommandFacts {
  readonly facts: RecordFacts;
  readonly movesTo?: RecordFacts;
}

/** Finds a command's scope facts in its transaction, on the business date. */
type CommandFactsOf = (context: TransactionContext, today: string) => Promise<CommandFacts>;

/** Authorise's answer in the command, with the facts it covered when allowed. */
type CommandAuthorisation =
  | Authorisation
  | ({
      readonly kind: 'allowed';
      readonly roleAssignmentId: string;
      /** The assignment that granted the further permission the command needs, where it needs one. */
      readonly alsoAssignmentId?: string;
    } & CommandFacts);

/**
 * A permission a command needs besides its route's, on the same facts: preparing a unit with its first mapping needs
 * edit on the mapping as well as create or edit on the unit, as deciding it needs approve on both
 * (access-and-approvals 9.8b; RR-444, product owner 9 Oct 2026).
 */
interface FurtherPermission {
  readonly action: PermissionAction;
  readonly recordType: string;
}

/** The permission a unit's first mapping needs when it is prepared with a unit version (RR-444). */
const MAPPING_EDIT: FurtherPermission = { action: 'edit', recordType: recordTypeOf('business_unit_mapping') };

/**
 * The routes of the organisation structure (structure-and-masters 2.3, 3.8, 6.1, 8; module-map 4.11; code-house-rules
 * 12.1): each master's records with their version history, a page at a time or one record, preparing a new master
 * or a new version, and the master lists read model. Authenticate ran in the guard. On a record type that carries no
 * scope fact, Authorise ran there too, on the route's action and type; on a place-scoped one it runs here, with the
 * record's facts on the day, for a one-record read, each row of a list, and a command, before any lock
 * (access-and-approvals 5.3, 7.1 step 3; product owner, 9 Oct 2026). Each command runs under its idempotency key,
 * holds its preparer's authority at step 0, and a replay is answered only while the same Authorise still passes (12.4,
 * CH-14). The structure's own rules are `organisation`'s commands'.
 */
@Controller()
export class StructureController {
  constructor(
    @Inject(IDEMPOTENCY_HELPER) private readonly helper: IdempotencyHelper,
    @Inject(COMMAND_RUNNER) private readonly runner: CommandRunner,
    @Inject(ACCESS) private readonly access: AccessInterface,
    @Inject(ORGANISATION) private readonly organisation: OrganisationInterface,
  ) {}

  // The lists, a page at a time, and one record at a time (structure-and-masters 8; code-house-rules 12.1).

  @ApiRoute(routes.listCountries)
  listCountries(@RouteInput() input: RouteInputOf<typeof routes.listCountries>, @SignedIn() user: SignedInUser) {
    return this.list(user, 'country', input.query);
  }

  @ApiRoute(routes.readCountry)
  readCountry(@RouteInput() input: RouteInputOf<typeof routes.readCountry>, @SignedIn() user: SignedInUser) {
    return this.one(user, 'country', input.params.recordId);
  }

  @ApiRoute(routes.listStates)
  listStates(@RouteInput() input: RouteInputOf<typeof routes.listStates>, @SignedIn() user: SignedInUser) {
    return this.list(user, 'state', input.query);
  }

  @ApiRoute(routes.readState)
  readState(@RouteInput() input: RouteInputOf<typeof routes.readState>, @SignedIn() user: SignedInUser) {
    return this.one(user, 'state', input.params.recordId);
  }

  @ApiRoute(routes.listCities)
  listCities(@RouteInput() input: RouteInputOf<typeof routes.listCities>, @SignedIn() user: SignedInUser) {
    return this.list(user, 'city', input.query);
  }

  @ApiRoute(routes.readCity)
  readCity(@RouteInput() input: RouteInputOf<typeof routes.readCity>, @SignedIn() user: SignedInUser) {
    return this.one(user, 'city', input.params.recordId);
  }

  @ApiRoute(routes.listAreas)
  listAreas(@RouteInput() input: RouteInputOf<typeof routes.listAreas>, @SignedIn() user: SignedInUser) {
    return this.list(user, 'area', input.query);
  }

  @ApiRoute(routes.readArea)
  readArea(@RouteInput() input: RouteInputOf<typeof routes.readArea>, @SignedIn() user: SignedInUser) {
    return this.one(user, 'area', input.params.recordId);
  }

  @ApiRoute(routes.listLegalEntities)
  listLegalEntities(
    @RouteInput() input: RouteInputOf<typeof routes.listLegalEntities>,
    @SignedIn() user: SignedInUser,
  ) {
    return this.list(user, 'legal_entity', input.query);
  }

  @ApiRoute(routes.readLegalEntity)
  readLegalEntity(@RouteInput() input: RouteInputOf<typeof routes.readLegalEntity>, @SignedIn() user: SignedInUser) {
    return this.one(user, 'legal_entity', input.params.recordId);
  }

  @ApiRoute(routes.listTaxRegistrations)
  listTaxRegistrations(
    @RouteInput() input: RouteInputOf<typeof routes.listTaxRegistrations>,
    @SignedIn() user: SignedInUser,
  ) {
    return this.list(user, 'tax_registration', input.query);
  }

  @ApiRoute(routes.readTaxRegistration)
  readTaxRegistration(
    @RouteInput() input: RouteInputOf<typeof routes.readTaxRegistration>,
    @SignedIn() user: SignedInUser,
  ) {
    return this.one(user, 'tax_registration', input.params.recordId);
  }

  @ApiRoute(routes.listAccountingBooks)
  listAccountingBooks(
    @RouteInput() input: RouteInputOf<typeof routes.listAccountingBooks>,
    @SignedIn() user: SignedInUser,
  ) {
    return this.list(user, 'accounting_book', input.query);
  }

  @ApiRoute(routes.readAccountingBook)
  readAccountingBook(
    @RouteInput() input: RouteInputOf<typeof routes.readAccountingBook>,
    @SignedIn() user: SignedInUser,
  ) {
    return this.one(user, 'accounting_book', input.params.recordId);
  }

  @ApiRoute(routes.listSites)
  listSites(@RouteInput() input: RouteInputOf<typeof routes.listSites>, @SignedIn() user: SignedInUser) {
    return this.list(user, 'site', input.query);
  }

  @ApiRoute(routes.readSite)
  readSite(@RouteInput() input: RouteInputOf<typeof routes.readSite>, @SignedIn() user: SignedInUser) {
    return this.one(user, 'site', input.params.recordId);
  }

  @ApiRoute(routes.listStores)
  listStores(@RouteInput() input: RouteInputOf<typeof routes.listStores>, @SignedIn() user: SignedInUser) {
    return this.list(user, 'store', input.query);
  }

  @ApiRoute(routes.readStore)
  readStore(@RouteInput() input: RouteInputOf<typeof routes.readStore>, @SignedIn() user: SignedInUser) {
    return this.one(user, 'store', input.params.recordId);
  }

  @ApiRoute(routes.listGroupings)
  listGroupings(@RouteInput() input: RouteInputOf<typeof routes.listGroupings>, @SignedIn() user: SignedInUser) {
    return this.list(user, 'grouping', input.query);
  }

  @ApiRoute(routes.readGrouping)
  readGrouping(@RouteInput() input: RouteInputOf<typeof routes.readGrouping>, @SignedIn() user: SignedInUser) {
    return this.one(user, 'grouping', input.params.recordId);
  }

  // New masters (structure-and-masters 2.3, 3.1).

  @ApiRoute(routes.prepareCountry)
  prepareCountry(@RouteInput() input: RouteInputOf<typeof routes.prepareCountry>, @SignedIn() user: SignedInUser) {
    return this.prepare(routes.prepareCountry, 'organisation.prepare-country', user, input, (c, p) =>
      this.organisation.prepareCountry(c, p, input.body),
    );
  }

  @ApiRoute(routes.prepareState)
  prepareState(@RouteInput() input: RouteInputOf<typeof routes.prepareState>, @SignedIn() user: SignedInUser) {
    return this.prepare(routes.prepareState, 'organisation.prepare-state', user, input, (c, p) =>
      this.organisation.prepareState(c, p, input.body),
    );
  }

  @ApiRoute(routes.prepareCity)
  prepareCity(@RouteInput() input: RouteInputOf<typeof routes.prepareCity>, @SignedIn() user: SignedInUser) {
    return this.prepare(routes.prepareCity, 'organisation.prepare-city', user, input, (c, p) =>
      this.organisation.prepareCity(c, p, input.body),
    );
  }

  @ApiRoute(routes.prepareArea)
  prepareArea(@RouteInput() input: RouteInputOf<typeof routes.prepareArea>, @SignedIn() user: SignedInUser) {
    return this.prepare(routes.prepareArea, 'organisation.prepare-area', user, input, (c, p) =>
      this.organisation.prepareArea(c, p, input.body),
    );
  }

  @ApiRoute(routes.prepareLegalEntity)
  prepareLegalEntity(
    @RouteInput() input: RouteInputOf<typeof routes.prepareLegalEntity>,
    @SignedIn() user: SignedInUser,
  ) {
    return this.prepare(routes.prepareLegalEntity, 'organisation.prepare-legal-entity', user, input, (c, p) =>
      this.organisation.prepareLegalEntity(c, p, input.body),
    );
  }

  @ApiRoute(routes.prepareTaxRegistration)
  prepareTaxRegistration(
    @RouteInput() input: RouteInputOf<typeof routes.prepareTaxRegistration>,
    @SignedIn() user: SignedInUser,
  ) {
    return this.prepare(routes.prepareTaxRegistration, 'organisation.prepare-tax-registration', user, input, (c, p) =>
      this.organisation.prepareTaxRegistration(c, p, input.body),
    );
  }

  @ApiRoute(routes.prepareAccountingBook)
  prepareAccountingBook(
    @RouteInput() input: RouteInputOf<typeof routes.prepareAccountingBook>,
    @SignedIn() user: SignedInUser,
  ) {
    return this.prepare(routes.prepareAccountingBook, 'organisation.prepare-accounting-book', user, input, (c, p) =>
      this.organisation.prepareAccountingBook(c, p, input.body),
    );
  }

  @ApiRoute(routes.prepareSite)
  prepareSite(@RouteInput() input: RouteInputOf<typeof routes.prepareSite>, @SignedIn() user: SignedInUser) {
    // A new Site is a place no selection names yet: only all-members place scope covers it (5.3; PRD-MOD-015;
    // product owner, 9 Oct 2026).
    return this.prepare(
      routes.prepareSite,
      'organisation.prepare-site',
      user,
      input,
      (c, p) => this.organisation.prepareSite(c, p, input.body),
      () => Promise.resolve({ facts: {} }),
    );
  }

  @ApiRoute(routes.prepareStore)
  prepareStore(@RouteInput() input: RouteInputOf<typeof routes.prepareStore>, @SignedIn() user: SignedInUser) {
    // A new Store at its Site: a selected Site covers the Stores added at it later (5.2; PRD-ACS-021).
    return this.prepare(
      routes.prepareStore,
      'organisation.prepare-store',
      user,
      input,
      (c, p) => this.organisation.prepareStore(c, p, input.body),
      () => Promise.resolve({ facts: { siteId: input.body.siteId } }),
    );
  }

  @ApiRoute(routes.prepareGrouping)
  prepareGrouping(@RouteInput() input: RouteInputOf<typeof routes.prepareGrouping>, @SignedIn() user: SignedInUser) {
    return this.prepare(routes.prepareGrouping, 'organisation.prepare-grouping', user, input, (c, p) =>
      this.organisation.prepareGrouping(c, p, input.body),
    );
  }

  // New versions (structure-and-masters 2.2).

  @ApiRoute(routes.prepareCountryVersion)
  prepareCountryVersion(
    @RouteInput() input: RouteInputOf<typeof routes.prepareCountryVersion>,
    @SignedIn() user: SignedInUser,
  ) {
    return this.prepare(routes.prepareCountryVersion, 'organisation.prepare-country-version', user, input, (c, p) =>
      this.organisation.prepareNameVersion(c, p, 'country', input.params.recordId, input.body),
    );
  }

  @ApiRoute(routes.prepareStateVersion)
  prepareStateVersion(
    @RouteInput() input: RouteInputOf<typeof routes.prepareStateVersion>,
    @SignedIn() user: SignedInUser,
  ) {
    return this.prepare(routes.prepareStateVersion, 'organisation.prepare-state-version', user, input, (c, p) =>
      this.organisation.prepareNameVersion(c, p, 'state', input.params.recordId, input.body),
    );
  }

  @ApiRoute(routes.prepareCityVersion)
  prepareCityVersion(
    @RouteInput() input: RouteInputOf<typeof routes.prepareCityVersion>,
    @SignedIn() user: SignedInUser,
  ) {
    return this.prepare(routes.prepareCityVersion, 'organisation.prepare-city-version', user, input, (c, p) =>
      this.organisation.prepareNameVersion(c, p, 'city', input.params.recordId, input.body),
    );
  }

  @ApiRoute(routes.prepareAreaVersion)
  prepareAreaVersion(
    @RouteInput() input: RouteInputOf<typeof routes.prepareAreaVersion>,
    @SignedIn() user: SignedInUser,
  ) {
    return this.prepare(routes.prepareAreaVersion, 'organisation.prepare-area-version', user, input, (c, p) =>
      this.organisation.prepareNameVersion(c, p, 'area', input.params.recordId, input.body),
    );
  }

  @ApiRoute(routes.prepareLegalEntityVersion)
  prepareLegalEntityVersion(
    @RouteInput() input: RouteInputOf<typeof routes.prepareLegalEntityVersion>,
    @SignedIn() user: SignedInUser,
  ) {
    return this.prepare(
      routes.prepareLegalEntityVersion,
      'organisation.prepare-legal-entity-version',
      user,
      input,
      (c, p) => this.organisation.prepareLegalEntityVersion(c, p, input.params.recordId, input.body),
    );
  }

  @ApiRoute(routes.prepareTaxRegistrationVersion)
  prepareTaxRegistrationVersion(
    @RouteInput() input: RouteInputOf<typeof routes.prepareTaxRegistrationVersion>,
    @SignedIn() user: SignedInUser,
  ) {
    return this.prepare(
      routes.prepareTaxRegistrationVersion,
      'organisation.prepare-tax-registration-version',
      user,
      input,
      (c, p) => this.organisation.prepareTaxRegistrationVersion(c, p, input.params.recordId, input.body),
    );
  }

  @ApiRoute(routes.prepareAccountingBookVersion)
  prepareAccountingBookVersion(
    @RouteInput() input: RouteInputOf<typeof routes.prepareAccountingBookVersion>,
    @SignedIn() user: SignedInUser,
  ) {
    return this.prepare(
      routes.prepareAccountingBookVersion,
      'organisation.prepare-accounting-book-version',
      user,
      input,
      (c, p) => this.organisation.prepareNameVersion(c, p, 'accounting_book', input.params.recordId, input.body),
    );
  }

  @ApiRoute(routes.prepareSiteVersion)
  prepareSiteVersion(
    @RouteInput() input: RouteInputOf<typeof routes.prepareSiteVersion>,
    @SignedIn() user: SignedInUser,
  ) {
    return this.prepare(
      routes.prepareSiteVersion,
      'organisation.prepare-site-version',
      user,
      input,
      (c, p) => this.organisation.prepareSiteVersion(c, p, input.params.recordId, input.body),
      this.factsOf('site', input.params.recordId),
    );
  }

  @ApiRoute(routes.prepareStoreVersion)
  prepareStoreVersion(
    @RouteInput() input: RouteInputOf<typeof routes.prepareStoreVersion>,
    @SignedIn() user: SignedInUser,
  ) {
    return this.prepare(
      routes.prepareStoreVersion,
      'organisation.prepare-store-version',
      user,
      input,
      (c, p) => this.organisation.prepareStoreVersion(c, p, input.params.recordId, input.body),
      // A version linking the Store to another Site is authorised at both Sites (6.1; product owner, 9 Oct 2026).
      this.factsOf('store', input.params.recordId, (facts) => ({ ...facts, siteId: input.body.siteId })),
    );
  }

  // Business units, their mappings and verifications, locations and default warehouses (structure-and-masters 3.3 to
  // 3.6; S1-F02-T02).

  @ApiRoute(routes.listBusinessUnits)
  listBusinessUnits(
    @RouteInput() input: RouteInputOf<typeof routes.listBusinessUnits>,
    @SignedIn() user: SignedInUser,
  ) {
    return this.list(user, 'business_unit', input.query);
  }

  @ApiRoute(routes.readBusinessUnit)
  readBusinessUnit(@RouteInput() input: RouteInputOf<typeof routes.readBusinessUnit>, @SignedIn() user: SignedInUser) {
    return this.one(user, 'business_unit', input.params.recordId);
  }

  @ApiRoute(routes.prepareBusinessUnit)
  prepareBusinessUnit(
    @RouteInput() input: RouteInputOf<typeof routes.prepareBusinessUnit>,
    @SignedIn() user: SignedInUser,
  ) {
    // A new unit at its Site, and of its Store where it has one (5.2; PRD-ACS-021), of the legal entity its first
    // mapping names (POL-10.01).
    return this.prepare(
      routes.prepareBusinessUnit,
      'organisation.prepare-business-unit',
      user,
      input,
      (c, p) => this.organisation.prepareBusinessUnit(c, p, input.body),
      () =>
        Promise.resolve({
          facts: {
            legalEntityId: input.body.legalEntityId,
            siteId: input.body.siteId,
            ...(input.body.storeId === undefined ? {} : { storeId: input.body.storeId }),
          },
        }),
      MAPPING_EDIT,
    );
  }

  @ApiRoute(routes.prepareBusinessUnitVersion)
  prepareBusinessUnitVersion(
    @RouteInput() input: RouteInputOf<typeof routes.prepareBusinessUnitVersion>,
    @SignedIn() user: SignedInUser,
  ) {
    return this.prepare(
      routes.prepareBusinessUnitVersion,
      'organisation.prepare-business-unit-version',
      user,
      input,
      (c, p) => this.organisation.prepareBusinessUnitVersion(c, p, input.params.recordId, input.body),
      // A version carrying a mapping maps the unit to its legal entity (3.4; POL-10.01).
      this.factsOf('business_unit', input.params.recordId, (facts) =>
        input.body.legalEntityId === undefined ? facts : { ...facts, legalEntityId: input.body.legalEntityId },
      ),
      // A version that names a mapping is a new unit's draft re-dated with its first mapping (3.4; RR-444).
      input.body.legalEntityId === undefined ? undefined : MAPPING_EDIT,
    );
  }

  @ApiRoute(routes.listBusinessUnitMappings)
  listBusinessUnitMappings(
    @RouteInput() input: RouteInputOf<typeof routes.listBusinessUnitMappings>,
    @SignedIn() user: SignedInUser,
  ) {
    return this.list(user, 'business_unit_mapping', input.query);
  }

  @ApiRoute(routes.readBusinessUnitMapping)
  readBusinessUnitMapping(
    @RouteInput() input: RouteInputOf<typeof routes.readBusinessUnitMapping>,
    @SignedIn() user: SignedInUser,
  ) {
    return this.one(user, 'business_unit_mapping', input.params.recordId);
  }

  @ApiRoute(routes.prepareBusinessUnitMappingVersion)
  prepareBusinessUnitMappingVersion(
    @RouteInput() input: RouteInputOf<typeof routes.prepareBusinessUnitMappingVersion>,
    @SignedIn() user: SignedInUser,
  ) {
    return this.prepare(
      routes.prepareBusinessUnitMappingVersion,
      'organisation.prepare-business-unit-mapping-version',
      user,
      input,
      (c, p) => this.organisation.prepareBusinessUnitMappingVersion(c, p, input.params.recordId, input.body),
      // A mapping to another legal entity is authorised for both legal entities (6.1; POL-10.01).
      this.factsOf('business_unit_mapping', input.params.recordId, (facts) => ({
        ...facts,
        legalEntityId: input.body.legalEntityId,
      })),
    );
  }

  /** Verify a mapping version (3.4; POL-10.08): create on the verification record is the verify permission. */
  @ApiRoute(routes.verifyBusinessUnitMapping)
  verifyBusinessUnitMapping(
    @RouteInput() input: RouteInputOf<typeof routes.verifyBusinessUnitMapping>,
    @SignedIn() user: SignedInUser,
  ) {
    return this.prepare(
      routes.verifyBusinessUnitMapping,
      'organisation.verify-business-unit-mapping',
      user,
      input,
      (c, p) => this.organisation.verifyMapping(c, p, input.params.recordId, input.params.versionId, input.body),
      this.factsOf('business_unit_mapping', input.params.recordId),
    );
  }

  @ApiRoute(routes.listLocations)
  listLocations(@RouteInput() input: RouteInputOf<typeof routes.listLocations>, @SignedIn() user: SignedInUser) {
    return this.list(user, 'location', input.query);
  }

  @ApiRoute(routes.readLocation)
  readLocation(@RouteInput() input: RouteInputOf<typeof routes.readLocation>, @SignedIn() user: SignedInUser) {
    return this.one(user, 'location', input.params.recordId);
  }

  @ApiRoute(routes.prepareLocation)
  prepareLocation(@RouteInput() input: RouteInputOf<typeof routes.prepareLocation>, @SignedIn() user: SignedInUser) {
    // A new location at its unit (5.2).
    return this.prepare(
      routes.prepareLocation,
      'organisation.prepare-location',
      user,
      input,
      (c, p) => this.organisation.prepareLocation(c, p, input.body),
      this.factsOf('business_unit', input.body.businessUnitId),
    );
  }

  @ApiRoute(routes.prepareLocationVersion)
  prepareLocationVersion(
    @RouteInput() input: RouteInputOf<typeof routes.prepareLocationVersion>,
    @SignedIn() user: SignedInUser,
  ) {
    return this.prepare(
      routes.prepareLocationVersion,
      'organisation.prepare-location-version',
      user,
      input,
      (c, p) => this.organisation.prepareLocationVersion(c, p, input.params.recordId, input.body),
      this.factsOf('location', input.params.recordId),
    );
  }

  @ApiRoute(routes.listStoreDefaultWarehouses)
  listStoreDefaultWarehouses(
    @RouteInput() input: RouteInputOf<typeof routes.listStoreDefaultWarehouses>,
    @SignedIn() user: SignedInUser,
  ) {
    return this.list(user, 'store_default_warehouse', input.query);
  }

  @ApiRoute(routes.readStoreDefaultWarehouse)
  readStoreDefaultWarehouse(
    @RouteInput() input: RouteInputOf<typeof routes.readStoreDefaultWarehouse>,
    @SignedIn() user: SignedInUser,
  ) {
    return this.one(user, 'store_default_warehouse', input.params.recordId);
  }

  @ApiRoute(routes.prepareStoreDefaultWarehouseVersion)
  prepareStoreDefaultWarehouseVersion(
    @RouteInput() input: RouteInputOf<typeof routes.prepareStoreDefaultWarehouseVersion>,
    @SignedIn() user: SignedInUser,
  ) {
    return this.prepare(
      routes.prepareStoreDefaultWarehouseVersion,
      'organisation.prepare-store-default-warehouse-version',
      user,
      input,
      (c, p) => this.organisation.prepareStoreDefaultWarehouseVersion(c, p, input.params.recordId, input.body),
      this.factsOf('store_default_warehouse', input.params.recordId),
    );
  }

  @ApiRoute(routes.prepareGroupingVersion)
  prepareGroupingVersion(
    @RouteInput() input: RouteInputOf<typeof routes.prepareGroupingVersion>,
    @SignedIn() user: SignedInUser,
  ) {
    return this.prepare(routes.prepareGroupingVersion, 'organisation.prepare-grouping-version', user, input, (c, p) =>
      this.organisation.prepareGroupingVersion(c, p, input.params.recordId, input.body),
    );
  }

  // The Organisation's own grouping kinds and classification kinds and values (structure-and-masters 3.1, 3.6; RR-440;
  // S1-F02-T04).

  @ApiRoute(routes.listGroupingKinds)
  listGroupingKinds(
    @RouteInput() input: RouteInputOf<typeof routes.listGroupingKinds>,
    @SignedIn() user: SignedInUser,
  ) {
    return this.list(user, 'grouping_kind', input.query);
  }

  @ApiRoute(routes.readGroupingKind)
  readGroupingKind(@RouteInput() input: RouteInputOf<typeof routes.readGroupingKind>, @SignedIn() user: SignedInUser) {
    return this.one(user, 'grouping_kind', input.params.recordId);
  }

  @ApiRoute(routes.prepareGroupingKind)
  prepareGroupingKind(
    @RouteInput() input: RouteInputOf<typeof routes.prepareGroupingKind>,
    @SignedIn() user: SignedInUser,
  ) {
    return this.prepare(routes.prepareGroupingKind, 'organisation.prepare-grouping-kind', user, input, (c, p) =>
      this.organisation.prepareGroupingKind(c, p, input.body),
    );
  }

  @ApiRoute(routes.prepareGroupingKindVersion)
  prepareGroupingKindVersion(
    @RouteInput() input: RouteInputOf<typeof routes.prepareGroupingKindVersion>,
    @SignedIn() user: SignedInUser,
  ) {
    return this.prepare(
      routes.prepareGroupingKindVersion,
      'organisation.prepare-grouping-kind-version',
      user,
      input,
      (c, p) => this.organisation.prepareNameVersion(c, p, 'grouping_kind', input.params.recordId, input.body),
    );
  }

  @ApiRoute(routes.listClassificationKinds)
  listClassificationKinds(
    @RouteInput() input: RouteInputOf<typeof routes.listClassificationKinds>,
    @SignedIn() user: SignedInUser,
  ) {
    return this.list(user, 'classification_kind', input.query);
  }

  @ApiRoute(routes.readClassificationKind)
  readClassificationKind(
    @RouteInput() input: RouteInputOf<typeof routes.readClassificationKind>,
    @SignedIn() user: SignedInUser,
  ) {
    return this.one(user, 'classification_kind', input.params.recordId);
  }

  @ApiRoute(routes.prepareClassificationKind)
  prepareClassificationKind(
    @RouteInput() input: RouteInputOf<typeof routes.prepareClassificationKind>,
    @SignedIn() user: SignedInUser,
  ) {
    return this.prepare(
      routes.prepareClassificationKind,
      'organisation.prepare-classification-kind',
      user,
      input,
      (c, p) => this.organisation.prepareClassificationKind(c, p, input.body),
    );
  }

  @ApiRoute(routes.prepareClassificationKindVersion)
  prepareClassificationKindVersion(
    @RouteInput() input: RouteInputOf<typeof routes.prepareClassificationKindVersion>,
    @SignedIn() user: SignedInUser,
  ) {
    return this.prepare(
      routes.prepareClassificationKindVersion,
      'organisation.prepare-classification-kind-version',
      user,
      input,
      (c, p) => this.organisation.prepareNameVersion(c, p, 'classification_kind', input.params.recordId, input.body),
    );
  }

  @ApiRoute(routes.listClassificationValues)
  listClassificationValues(
    @RouteInput() input: RouteInputOf<typeof routes.listClassificationValues>,
    @SignedIn() user: SignedInUser,
  ) {
    return this.list(user, 'classification_value', input.query);
  }

  @ApiRoute(routes.readClassificationValue)
  readClassificationValue(
    @RouteInput() input: RouteInputOf<typeof routes.readClassificationValue>,
    @SignedIn() user: SignedInUser,
  ) {
    return this.one(user, 'classification_value', input.params.recordId);
  }

  @ApiRoute(routes.prepareClassificationValue)
  prepareClassificationValue(
    @RouteInput() input: RouteInputOf<typeof routes.prepareClassificationValue>,
    @SignedIn() user: SignedInUser,
  ) {
    return this.prepare(
      routes.prepareClassificationValue,
      'organisation.prepare-classification-value',
      user,
      input,
      (c, p) => this.organisation.prepareClassificationValue(c, p, input.body),
    );
  }

  @ApiRoute(routes.prepareClassificationValueVersion)
  prepareClassificationValueVersion(
    @RouteInput() input: RouteInputOf<typeof routes.prepareClassificationValueVersion>,
    @SignedIn() user: SignedInUser,
  ) {
    return this.prepare(
      routes.prepareClassificationValueVersion,
      'organisation.prepare-classification-value-version',
      user,
      input,
      (c, p) => this.organisation.prepareNameVersion(c, p, 'classification_value', input.params.recordId, input.body),
    );
  }

  /**
   * The master lists (module-map 4.11; phases.md stage 1 reports): each master's version in force on the date, read
   * under the reader's own authorisation (module-map section 3, rule 5). They need no permission of their own: a list
   * whose type the reader may not view is left out and named (product owner, 8 Oct 2026; PRD-UXP-003).
   */
  @ApiRoute(routes.readMasterLists)
  async readMasterLists(
    @RouteInput() input: RouteInputOf<typeof routes.readMasterLists>,
    @SignedIn() user: SignedInUser,
  ): Promise<MasterLists> {
    const date = input.query.date;
    return this.read(user, 'organisation.read-master-lists', async (context) => {
      const structure = await this.organisation.structureOn(context, date);
      const notShown: string[] = [];
      for (const kind of masterKinds) {
        // A place-scoped type is shown when an assignment grants view on it; its rows are then filtered by scope.
        const request = { actorId: user.userId, action: 'view' as const, recordType: recordTypeOf(kind) };
        const authorised = isPlaceScoped(kind)
          ? await this.access.authoriseEach(context, request, [])
          : await this.access.authorise(context, request);
        if (authorised.kind === 'refused') notShown.push(recordTypeOf(kind));
      }
      // Of a place-scoped master, the records the reader's scope covers on the date (structure-and-masters 6.1).
      const covered = async <T extends { id: string }>(kind: MasterKind, list: T[]): Promise<T[]> => {
        if (notShown.includes(recordTypeOf(kind)) || !isPlaceScoped(kind) || list.length === 0) return list;
        return this.coveredRows(context, user, kind, list, date);
      };
      const shown = <T>(kind: MasterKind, list: T[]): T[] => (notShown.includes(recordTypeOf(kind)) ? [] : list);
      return {
        date,
        asOf: context.startedAt.toISOString(),
        notShown,
        countries: shown('country', structure.countries),
        states: shown('state', structure.states),
        cities: shown('city', structure.cities),
        areas: shown('area', structure.areas),
        legalEntities: shown('legal_entity', structure.legalEntities),
        taxRegistrations: shown('tax_registration', structure.taxRegistrations),
        accountingBooks: shown('accounting_book', structure.accountingBooks),
        sites: shown('site', await covered('site', structure.sites)),
        stores: shown('store', await covered('store', structure.stores)),
        groupings: shown('grouping', structure.groupings),
        businessUnits: shown('business_unit', await covered('business_unit', structure.businessUnits)),
        businessUnitMappings: shown(
          'business_unit_mapping',
          await covered('business_unit_mapping', structure.businessUnitMappings),
        ),
        locations: shown('location', await covered('location', structure.locations)),
        storeDefaultWarehouses: shown(
          'store_default_warehouse',
          await covered('store_default_warehouse', structure.storeDefaultWarehouses),
        ),
        groupingKinds: shown('grouping_kind', structure.groupingKinds),
        classificationKinds: shown('classification_kind', structure.classificationKinds),
        classificationValues: shown('classification_value', structure.classificationValues),
      };
    });
  }

  /**
   * A page of a master's records. Of a place-scoped master, only the records the reader's scope covers today, each
   * authorised with its own facts (access-and-approvals 7.1 step 3, "in a list, each row's"; structure-and-masters
   * 6.1), so a page may hold fewer records than its limit; its cursor still moves on past the records left out.
   */
  private list<K extends MasterKind>(user: SignedInUser, kind: K, query: MasterPageQuery) {
    const page = { after: query.after, limit: query.limit === undefined ? undefined : Number(query.limit) };
    return this.read(user, `organisation.list-${kind.replaceAll('_', '-')}`, async (context, today) => {
      const found = await this.organisation.list(context, kind, today, page);
      const records = isPlaceScoped(kind)
        ? await this.coveredRows(context, user, kind, found.records, today)
        : found.records;
      return { asOf: context.startedAt.toISOString(), records, next: found.next };
    });
  }

  /**
   * The rows of a place-scoped master the reader's scope covers on the date, each through one assignment granting
   * view on it (access-and-approvals 7.1 step 3, 7.2). Refused when no assignment grants view on the type at all.
   */
  private async coveredRows<T extends { id: string }>(
    context: TransactionContext,
    user: SignedInUser,
    kind: MasterKind,
    rows: readonly T[],
    date: string,
  ): Promise<T[]> {
    const facts = await this.organisation.placeFactsOf(
      context,
      kind,
      rows.map((row) => row.id),
      date,
    );
    const checked = await this.access.authoriseEach(
      context,
      { actorId: user.userId, action: 'view', recordType: recordTypeOf(kind) },
      rows.map((row) => facts.get(row.id) ?? {}),
    );
    if (checked.kind === 'refused') throw new ApiRefusal({ ...checked.refusal, missing: [...checked.refusal.missing] });
    return rows.filter((_row, index) => checked.each[index]?.kind === 'allowed');
  }

  /**
   * Authorise in the command for a place-scoped record (access-and-approvals 7.1 step 3, 5.3; RR-296): with its facts
   * on the date. A refusal for a place names the place by its code too, so the screen can say which (PRD-UXP-003).
   */
  private async authoriseFacts(
    context: TransactionContext,
    user: SignedInUser,
    action: PermissionAction,
    recordType: string,
    command: CommandFacts,
  ): Promise<Authorisation> {
    const authorised = await this.access.authorise(context, { actorId: user.userId, action, recordType, ...command });
    if (authorised.kind === 'allowed') return authorised;
    const missing = await Promise.all(
      authorised.refusal.missing.map(async (item) => {
        const code = await placeCode(context, item.factType, item.factId);
        return code === undefined ? item : { ...item, factCode: code };
      }),
    );
    return { kind: 'refused', refusal: { ...authorised.refusal, missing } };
  }

  /**
   * The facts of an existing record of a place-scoped kind today, for a command or a replay to authorise with, and,
   * for a version that may move it, the facts it moves it to.
   */
  private factsOf(kind: MasterKind, recordId: string, moving?: (facts: RecordFacts) => RecordFacts): CommandFactsOf {
    return async (context, today) => {
      const facts = await this.organisation.placeFacts(context, kind, recordId, today);
      return moving === undefined ? { facts } : { facts, movesTo: moving(facts) };
    };
  }

  /**
   * One record, or not found, naming it (PRD-UXP-003). A place-scoped record is authorised with its facts first, so a
   * reader outside its scope is refused, naming the place, and learns nothing more of it; one that does not exist
   * carries no fact, which only all-members scope covers (5.3; PRD-MOD-015).
   */
  private async one<K extends MasterKind>(user: SignedInUser, kind: K, recordId: string) {
    const answer = await this.read(user, `organisation.read-${kind.replaceAll('_', '-')}`, async (context, today) => {
      if (isPlaceScoped(kind)) {
        const facts = await this.organisation.placeFacts(context, kind, recordId, today);
        const authorised = await this.authoriseFacts(context, user, 'view', recordTypeOf(kind), { facts });
        if (authorised.kind === 'refused') return { refused: authorised.refusal };
      }
      return {
        asOf: context.startedAt.toISOString(),
        record: await this.organisation.record(context, kind, recordId, today),
      };
    });
    if ('refused' in answer) throw new ApiRefusal({ ...answer.refused, missing: [...answer.refused.missing] });
    if (answer.record === undefined) {
      throw new ApiRefusal({
        kind: 'not-found',
        code: 'organisation.record-not-found',
        missing: [{ kind: 'record', recordType: recordTypeOf(kind), recordId }],
      });
    }
    return { asOf: answer.asOf, record: answer.record };
  }

  private async read<Answer>(
    user: SignedInUser,
    commandName: string,
    work: (context: TransactionContext, today: string) => Promise<Answer>,
  ): Promise<Answer> {
    const answer = await this.runner.read(
      {
        commandName,
        organisation: user.organisation,
        correlationId: user.correlationId,
        actor: { kind: 'actor', actorId: user.userId },
      },
      async (context) => {
        const date = await context.businessDate();
        return date.kind === 'not-set' ? undefined : { read: await work(context, date.date) };
      },
    );
    if (answer === undefined) {
      throw new ApiRefusal({
        kind: 'unavailable',
        code: 'access.business-date-not-set',
        missing: [{ kind: 'setting', setting: 'configuration.timezone' }],
      });
    }
    return answer.read;
  }

  private async prepare<R extends CommandRoute & { access: { kind: 'action' } }>(
    route: R,
    commandName: string,
    user: SignedInUser,
    input: RouteInputOf<R>,
    work: (context: TransactionContext, preparer: Preparer) => Promise<Prepared<PreparedVersion | MappingVerified>>,
    /** For a route on a place-scoped record type, which authorises in its command: its scope facts. */
    commandFactsOf?: CommandFactsOf,
    /** A permission the command needs besides the route's, on the same facts (RR-444). */
    further?: FurtherPermission,
  ) {
    if (further !== undefined && commandFactsOf === undefined) {
      throw new CommandDefect(`Route ${route.path} needs a further permission only with the record's facts`);
    }
    if ((commandFactsOf === undefined) !== (route.access.authorisedIn !== 'command')) {
      throw new CommandDefect(`Route ${route.path} authorises in its command only with the record's facts`);
    }
    if (commandFactsOf === undefined && user.roleAssignmentId === undefined) {
      throw new CommandDefect(`Route ${route.path} prepares a structure change without Authorise`);
    }
    const key: string = input.idempotencyKey;
    const content: RequestContent = requestContentOf(route, input);
    /** Authorise as the guard did, or, for a place-scoped type, with the record's facts in the command's transaction. */
    const authoriseIn = async (context: TransactionContext): Promise<CommandAuthorisation> => {
      if (commandFactsOf === undefined) {
        return { kind: 'allowed', roleAssignmentId: user.roleAssignmentId ?? '' };
      }
      const date = await context.businessDate();
      if (date.kind === 'not-set') {
        return {
          kind: 'refused',
          refusal: {
            kind: 'unavailable',
            code: 'access.business-date-not-set',
            missing: [{ kind: 'setting', setting: 'configuration.timezone' }],
          },
        };
      }
      const command = await commandFactsOf(context, date.date);
      const authorised = await this.authoriseFacts(
        context,
        user,
        route.access.action,
        route.access.recordType,
        command,
      );
      if (authorised.kind === 'refused') return authorised;
      if (further === undefined) return { ...authorised, ...command };
      // The further permission on the same facts, its refusal naming it (PRD-UXP-003).
      const also = await this.authoriseFacts(context, user, further.action, further.recordType, command);
      if (also.kind === 'refused') return also;
      return { ...authorised, ...command, alsoAssignmentId: also.roleAssignmentId };
    };
    const need = { actorId: user.userId, action: route.access.action, recordType: route.access.recordType };
    const authoriseReplay: ReplayAuthorisation = async (context) => {
      const authorised =
        commandFactsOf === undefined ? await this.access.authorise(context, need) : await authoriseIn(context);
      if (authorised.kind === 'allowed') return { kind: 'allowed' };
      return {
        kind: 'refused',
        refusal: { kind: 'not-authorised', code: authorised.refusal.code, missing: authorised.refusal.missing },
      };
    };
    const answer = await this.helper.run(
      {
        commandName,
        organisation: user.organisation,
        correlationId: user.correlationId,
        actor: { kind: 'actor', actorId: user.userId },
      },
      {
        key,
        content,
        authoriseReplay,
        work: async (context): Promise<CommandOutcome<JsonValue>> => {
          // Authorise with the record's facts, for a place-scoped type, before any lock (7.1 step 3).
          const authorised = await authoriseIn(context);
          if (authorised.kind === 'refused') {
            return { kind: 'refusal', refusal: authorised.refusal, causedBySecret: false };
          }
          // The further permission goes with the preparer once held, so the command checks it too (RR-444).
          const alsoHeld = further !== undefined && 'alsoAssignmentId' in authorised ? [further] : [];
          const preparer: Preparer = { userId: user.userId, roleAssignmentId: authorised.roleAssignmentId };
          // Step 0: the preparer and the assignment Authorise found, rechecked under the locks with the same facts
          // (code-house-rules 8.2 "Authority first"; access-and-approvals 7.1 step 4).
          const held = await this.access.holdAuthority(
            context,
            { kind: 'user', id: user.userId },
            preparer.roleAssignmentId,
            {
              action: need.action,
              recordType: need.recordType,
              ...('facts' in authorised ? { facts: authorised.facts } : {}),
              ...('movesTo' in authorised ? { movesTo: authorised.movesTo } : {}),
            },
            [],
            // The further permission's assignment, held in the same step and rechecked with the same facts (RR-444).
            further !== undefined && 'alsoAssignmentId' in authorised
              ? [
                  {
                    roleAssignmentId: authorised.alsoAssignmentId,
                    need: {
                      action: further.action,
                      recordType: further.recordType,
                      facts: authorised.facts,
                      ...(authorised.movesTo === undefined ? {} : { movesTo: authorised.movesTo }),
                    },
                  },
                ]
              : [],
          );
          if (held !== undefined) return { kind: 'refusal', refusal: held, causedBySecret: false };
          const outcome = await work(context, { ...preparer, alsoHeld });
          if (outcome.kind === 'success') return { kind: 'success', answer: { ...outcome.answer }, shows: 'nothing' };
          return { kind: 'refusal', refusal: outcome.refusal, causedBySecret: false };
        },
      },
    );
    return commandAnswer(answer);
  }
}
