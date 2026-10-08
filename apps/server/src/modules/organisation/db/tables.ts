import type { AnyPgColumn, PgTable } from 'drizzle-orm/pg-core';
import type { MasterKind } from '../domain/kinds.js';
import {
  accountingBook,
  accountingBookVersion,
  area,
  areaVersion,
  businessUnit,
  businessUnitMapping,
  businessUnitVersion,
  city,
  cityVersion,
  country,
  countryVersion,
  grouping,
  groupingVersion,
  legalEntity,
  legalEntityVersion,
  location,
  locationVersion,
  site,
  siteVersion,
  state,
  stateVersion,
  store,
  storeDefaultWarehouse,
  storeVersion,
  taxRegistration,
  taxRegistrationVersion,
} from './schema.js';

/**
 * Each master's identity table, its version table and the version's column naming its master (6.1). A business unit's
 * mapping and a Store's default warehouse have the unit's and the Store's identity (S1-F02-T02), so `identityTable`
 * names the table a decision locks the identity row in.
 */
export interface MasterTables {
  readonly identity: PgTable;
  readonly identityTable: string;
  readonly identityId: AnyPgColumn;
  readonly identityCode: AnyPgColumn;
  readonly version: PgTable;
  readonly versionId: AnyPgColumn;
  readonly owner: AnyPgColumn;
  readonly validDuring: AnyPgColumn;
  readonly decision: AnyPgColumn;
}

function tables(
  identityTable: string,
  identity: PgTable & { id: AnyPgColumn; code: AnyPgColumn },
  version: PgTable & { id: AnyPgColumn; validDuring: AnyPgColumn; decision: AnyPgColumn },
  owner: AnyPgColumn,
): MasterTables {
  return {
    identity,
    identityTable,
    identityId: identity.id,
    identityCode: identity.code,
    version,
    versionId: version.id,
    owner,
    validDuring: version.validDuring,
    decision: version.decision,
  };
}

export const masterTables: Readonly<Record<MasterKind, MasterTables>> = {
  country: tables('country', country, countryVersion, countryVersion.countryId),
  state: tables('state', state, stateVersion, stateVersion.stateId),
  city: tables('city', city, cityVersion, cityVersion.cityId),
  area: tables('area', area, areaVersion, areaVersion.areaId),
  legal_entity: tables('legal_entity', legalEntity, legalEntityVersion, legalEntityVersion.legalEntityId),
  tax_registration: tables(
    'tax_registration',
    taxRegistration,
    taxRegistrationVersion,
    taxRegistrationVersion.taxRegistrationId,
  ),
  accounting_book: tables(
    'accounting_book',
    accountingBook,
    accountingBookVersion,
    accountingBookVersion.accountingBookId,
  ),
  site: tables('site', site, siteVersion, siteVersion.siteId),
  store: tables('store', store, storeVersion, storeVersion.storeId),
  grouping: tables('grouping', grouping, groupingVersion, groupingVersion.groupingId),
  business_unit: tables('business_unit', businessUnit, businessUnitVersion, businessUnitVersion.businessUnitId),
  business_unit_mapping: tables('business_unit', businessUnit, businessUnitMapping, businessUnitMapping.businessUnitId),
  location: tables('location', location, locationVersion, locationVersion.locationId),
  store_default_warehouse: tables('store', store, storeDefaultWarehouse, storeDefaultWarehouse.storeId),
};
