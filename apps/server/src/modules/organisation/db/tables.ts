import type { AnyPgColumn, PgTable } from 'drizzle-orm/pg-core';
import type { MasterKind } from '../domain/kinds.js';
import {
  accountingBook,
  accountingBookVersion,
  area,
  areaVersion,
  city,
  cityVersion,
  country,
  countryVersion,
  grouping,
  groupingVersion,
  legalEntity,
  legalEntityVersion,
  site,
  siteVersion,
  state,
  stateVersion,
  store,
  storeVersion,
  taxRegistration,
  taxRegistrationVersion,
} from './schema.js';

/** Each master's identity table, its version table and the version's column naming its master (6.1). */
export interface MasterTables {
  readonly identity: PgTable;
  readonly identityId: AnyPgColumn;
  readonly identityCode: AnyPgColumn;
  readonly version: PgTable;
  readonly versionId: AnyPgColumn;
  readonly owner: AnyPgColumn;
  readonly validDuring: AnyPgColumn;
  readonly decision: AnyPgColumn;
}

function tables(
  identity: PgTable & { id: AnyPgColumn; code: AnyPgColumn },
  version: PgTable & { id: AnyPgColumn; validDuring: AnyPgColumn; decision: AnyPgColumn },
  owner: AnyPgColumn,
): MasterTables {
  return {
    identity,
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
  country: tables(country, countryVersion, countryVersion.countryId),
  state: tables(state, stateVersion, stateVersion.stateId),
  city: tables(city, cityVersion, cityVersion.cityId),
  area: tables(area, areaVersion, areaVersion.areaId),
  legal_entity: tables(legalEntity, legalEntityVersion, legalEntityVersion.legalEntityId),
  tax_registration: tables(taxRegistration, taxRegistrationVersion, taxRegistrationVersion.taxRegistrationId),
  accounting_book: tables(accountingBook, accountingBookVersion, accountingBookVersion.accountingBookId),
  site: tables(site, siteVersion, siteVersion.siteId),
  store: tables(store, storeVersion, storeVersion.storeId),
  grouping: tables(grouping, groupingVersion, groupingVersion.groupingId),
};
