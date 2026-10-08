import type {
  AccountingBookList,
  AreaList,
  CityList,
  CountryList,
  GroupingKind,
  GroupingList,
  LegalEntityList,
  MasterLists,
  OperatingModel,
  PhysicalKind,
  PlaceStatus,
  RecordState,
  SiteList,
  StateList,
  StoreFormat,
  StoreList,
  TaxRegistrationList,
} from '@apparel-os/schemas';
import { asc, desc, inArray, sql, type AnyColumn } from 'drizzle-orm';
import type { TransactionContext } from '../../../kernel/index.js';
import type { LatestRequest } from '../../access/index.js';
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
  groupingMember,
  groupingVersion,
  legalEntity,
  legalEntityVersion,
  site,
  siteAlias,
  siteVersion,
  state,
  stateVersion,
  store,
  storeAlias,
  storeVersion,
  taxRegistration,
  taxRegistrationVersion,
} from '../db/schema.js';
import { versionState, type MasterKind } from '../domain/kinds.js';

// The reads of the structure (structure-and-masters 3.8, 8; module-map 4.11): each master with every version and the
// state each shows, newest first, for the screens' version history; and the version of each master in force on a
// date, for the master lists and for other modules. The records carry no scope fact: the caller has authorised view
// on the record type (access-and-approvals 5.3, 7.1). Only organisation reads these tables (PRD-MOD-002).

/** The latest approval request of each version, which `access` keeps (access-and-approvals 9.1, 9.6). */
export type RequestReader = (versionIds: readonly string[]) => Promise<ReadonlyMap<string, LatestRequest>>;

const startOf = (range: AnyColumn) => sql<string>`lower(${range})::text`;
const endOf = (range: AnyColumn) => sql<string | null>`upper(${range})::text`;

interface VersionRow {
  readonly id: string;
  readonly decision: string;
  readonly start: string;
  readonly end: string | null;
}

interface VersionView {
  readonly id: string;
  readonly validFrom: string;
  readonly validTo?: string;
  readonly state: RecordState;
  readonly request?: LatestRequest;
}

function viewOf(row: VersionRow, today: string, requests: ReadonlyMap<string, LatestRequest>): VersionView {
  const request = requests.get(row.id);
  return {
    id: row.id,
    validFrom: row.start,
    ...(row.end === null ? {} : { validTo: row.end }),
    state: versionState({
      decision: row.decision,
      start: row.start,
      end: row.end ?? undefined,
      today,
      requestState: request?.state,
    }),
    ...(request === undefined ? {} : { request: { id: request.id, state: request.state } }),
  };
}

/** Each record with its versions, newest first; `fields` gives a version's own fields. */
async function assemble<
  Identity extends { id: string; code: string },
  Row extends VersionRow & { owner: string },
  Fixed,
  Fields,
>(
  identities: readonly Identity[],
  versions: readonly Row[],
  today: string,
  requests: RequestReader,
  fixed: (identity: Identity) => Fixed,
  fields: (row: Row) => Fields,
) {
  const latest = await requests(versions.map((row) => row.id));
  return identities.map((identity) => ({
    id: identity.id,
    code: identity.code,
    ...fixed(identity),
    versions: versions
      .filter((row) => row.owner === identity.id)
      .map((row) => ({ ...viewOf(row, today, latest), ...fields(row) })),
  }));
}

const newestFirst = (range: AnyColumn, recordedAt: AnyColumn) => [desc(sql`lower(${range})`), desc(recordedAt)];

function versionColumns(table: { id: AnyColumn; decision: AnyColumn; validDuring: AnyColumn }) {
  return {
    id: sql<string>`${table.id}`,
    decision: sql<string>`${table.decision}`,
    start: startOf(table.validDuring),
    end: endOf(table.validDuring),
  };
}

const optional = <K extends string>(key: K, date: string | null) =>
  (date === null ? {} : { [key]: date }) as Partial<Record<K, string>>;

export async function listCountries(
  context: TransactionContext,
  today: string,
  requests: RequestReader,
): Promise<Omit<CountryList, 'asOf'>> {
  const identities = await context.tx.select().from(country).orderBy(asc(country.code));
  const versions = await context.tx
    .select({ ...versionColumns(countryVersion), owner: countryVersion.countryId, name: countryVersion.name })
    .from(countryVersion)
    .orderBy(...newestFirst(countryVersion.validDuring, countryVersion.recordedAt));
  return {
    records: await assemble(
      identities,
      versions,
      today,
      requests,
      () => ({}),
      (row) => ({ name: row.name }),
    ),
  };
}

export async function listStates(
  context: TransactionContext,
  today: string,
  requests: RequestReader,
): Promise<Omit<StateList, 'asOf'>> {
  const identities = await context.tx.select().from(state).orderBy(asc(state.code));
  const versions = await context.tx
    .select({ ...versionColumns(stateVersion), owner: stateVersion.stateId, name: stateVersion.name })
    .from(stateVersion)
    .orderBy(...newestFirst(stateVersion.validDuring, stateVersion.recordedAt));
  return {
    records: await assemble(
      identities,
      versions,
      today,
      requests,
      (identity) => ({ countryId: identity.countryId }),
      (row) => ({ name: row.name }),
    ),
  };
}

export async function listCities(
  context: TransactionContext,
  today: string,
  requests: RequestReader,
): Promise<Omit<CityList, 'asOf'>> {
  const identities = await context.tx.select().from(city).orderBy(asc(city.code));
  const versions = await context.tx
    .select({ ...versionColumns(cityVersion), owner: cityVersion.cityId, name: cityVersion.name })
    .from(cityVersion)
    .orderBy(...newestFirst(cityVersion.validDuring, cityVersion.recordedAt));
  return {
    records: await assemble(
      identities,
      versions,
      today,
      requests,
      (identity) => ({ stateId: identity.stateId }),
      (row) => ({ name: row.name }),
    ),
  };
}

export async function listAreas(
  context: TransactionContext,
  today: string,
  requests: RequestReader,
): Promise<Omit<AreaList, 'asOf'>> {
  const identities = await context.tx.select().from(area).orderBy(asc(area.code));
  const versions = await context.tx
    .select({ ...versionColumns(areaVersion), owner: areaVersion.areaId, name: areaVersion.name })
    .from(areaVersion)
    .orderBy(...newestFirst(areaVersion.validDuring, areaVersion.recordedAt));
  return {
    records: await assemble(
      identities,
      versions,
      today,
      requests,
      (identity) => ({ cityId: identity.cityId }),
      (row) => ({ name: row.name }),
    ),
  };
}

export async function listLegalEntities(
  context: TransactionContext,
  today: string,
  requests: RequestReader,
): Promise<Omit<LegalEntityList, 'asOf'>> {
  const identities = await context.tx.select().from(legalEntity).orderBy(asc(legalEntity.code));
  const versions = await context.tx
    .select({
      ...versionColumns(legalEntityVersion),
      owner: legalEntityVersion.legalEntityId,
      legalName: legalEntityVersion.legalName,
    })
    .from(legalEntityVersion)
    .orderBy(...newestFirst(legalEntityVersion.validDuring, legalEntityVersion.recordedAt));
  return {
    records: await assemble(
      identities,
      versions,
      today,
      requests,
      () => ({}),
      (row) => ({ legalName: row.legalName }),
    ),
  };
}

export async function listTaxRegistrations(
  context: TransactionContext,
  today: string,
  requests: RequestReader,
): Promise<Omit<TaxRegistrationList, 'asOf'>> {
  const identities = await context.tx.select().from(taxRegistration).orderBy(asc(taxRegistration.code));
  const versions = await context.tx
    .select({
      ...versionColumns(taxRegistrationVersion),
      owner: taxRegistrationVersion.taxRegistrationId,
      registrationNumber: taxRegistrationVersion.registrationNumber,
      stateId: taxRegistrationVersion.stateId,
      validityFrom: startOf(taxRegistrationVersion.validity),
      validityTo: endOf(taxRegistrationVersion.validity),
    })
    .from(taxRegistrationVersion)
    .orderBy(...newestFirst(taxRegistrationVersion.validDuring, taxRegistrationVersion.recordedAt));
  return {
    records: await assemble(
      identities,
      versions,
      today,
      requests,
      (identity) => ({ legalEntityId: identity.legalEntityId }),
      (row) => ({
        registrationNumber: row.registrationNumber,
        stateId: row.stateId,
        validityFrom: row.validityFrom,
        ...optional('validityTo', row.validityTo),
      }),
    ),
  };
}

export async function listAccountingBooks(
  context: TransactionContext,
  today: string,
  requests: RequestReader,
): Promise<Omit<AccountingBookList, 'asOf'>> {
  const identities = await context.tx.select().from(accountingBook).orderBy(asc(accountingBook.code));
  const versions = await context.tx
    .select({
      ...versionColumns(accountingBookVersion),
      owner: accountingBookVersion.accountingBookId,
      name: accountingBookVersion.name,
    })
    .from(accountingBookVersion)
    .orderBy(...newestFirst(accountingBookVersion.validDuring, accountingBookVersion.recordedAt));
  return {
    records: await assemble(
      identities,
      versions,
      today,
      requests,
      (identity) => ({ legalEntityId: identity.legalEntityId }),
      (row) => ({ name: row.name }),
    ),
  };
}

/** The texts frozen with each version, in the order they were written. */
function byVersion<Row extends { versionId: string }, T>(rows: readonly Row[], pick: (row: Row) => T) {
  const map = new Map<string, T[]>();
  for (const row of rows) map.set(row.versionId, [...(map.get(row.versionId) ?? []), pick(row)]);
  return map;
}

export async function listSites(
  context: TransactionContext,
  today: string,
  requests: RequestReader,
): Promise<Omit<SiteList, 'asOf'>> {
  const identities = await context.tx.select().from(site).orderBy(asc(site.code));
  const versions = await context.tx
    .select({
      ...versionColumns(siteVersion),
      owner: siteVersion.siteId,
      name: siteVersion.name,
      physicalKind: siteVersion.physicalKind,
      areaId: siteVersion.areaId,
      addresses: siteVersion.addresses,
      openingDate: siteVersion.openingDate,
      closingDate: siteVersion.closingDate,
      status: siteVersion.status,
    })
    .from(siteVersion)
    .orderBy(...newestFirst(siteVersion.validDuring, siteVersion.recordedAt));
  const aliases = byVersion(
    versions.length === 0
      ? []
      : await context.tx
          .select({ versionId: siteAlias.siteVersionId, alias: siteAlias.alias })
          .from(siteAlias)
          .where(
            inArray(
              siteAlias.siteVersionId,
              versions.map((row) => row.id),
            ),
          )
          .orderBy(asc(siteAlias.recordedAt), asc(siteAlias.id)),
    (row) => row.alias,
  );
  return {
    records: await assemble(
      identities,
      versions,
      today,
      requests,
      () => ({}),
      (row) => ({
        name: row.name,
        physicalKind: row.physicalKind as PhysicalKind,
        areaId: row.areaId,
        addresses: row.addresses,
        aliases: aliases.get(row.id) ?? [],
        ...optional('openingDate', row.openingDate),
        ...optional('closingDate', row.closingDate),
        status: row.status as PlaceStatus,
      }),
    ),
  };
}

export async function listStores(
  context: TransactionContext,
  today: string,
  requests: RequestReader,
): Promise<Omit<StoreList, 'asOf'>> {
  const identities = await context.tx.select().from(store).orderBy(asc(store.code));
  const versions = await context.tx
    .select({
      ...versionColumns(storeVersion),
      owner: storeVersion.storeId,
      name: storeVersion.name,
      format: storeVersion.format,
      operatingModel: storeVersion.operatingModel,
      siteId: storeVersion.siteId,
      openingDate: storeVersion.openingDate,
      closingDate: storeVersion.closingDate,
      status: storeVersion.status,
    })
    .from(storeVersion)
    .orderBy(...newestFirst(storeVersion.validDuring, storeVersion.recordedAt));
  const aliases = byVersion(
    versions.length === 0
      ? []
      : await context.tx
          .select({ versionId: storeAlias.storeVersionId, alias: storeAlias.alias })
          .from(storeAlias)
          .where(
            inArray(
              storeAlias.storeVersionId,
              versions.map((row) => row.id),
            ),
          )
          .orderBy(asc(storeAlias.recordedAt), asc(storeAlias.id)),
    (row) => row.alias,
  );
  return {
    records: await assemble(
      identities,
      versions,
      today,
      requests,
      () => ({}),
      (row) => ({
        name: row.name,
        format: row.format as StoreFormat,
        operatingModel: row.operatingModel as OperatingModel,
        siteId: row.siteId,
        aliases: aliases.get(row.id) ?? [],
        ...optional('openingDate', row.openingDate),
        ...optional('closingDate', row.closingDate),
        status: row.status as PlaceStatus,
      }),
    ),
  };
}

export async function listGroupings(
  context: TransactionContext,
  today: string,
  requests: RequestReader,
): Promise<Omit<GroupingList, 'asOf'>> {
  const identities = await context.tx.select().from(grouping).orderBy(asc(grouping.code));
  const versions = await context.tx
    .select({ ...versionColumns(groupingVersion), owner: groupingVersion.groupingId, name: groupingVersion.name })
    .from(groupingVersion)
    .orderBy(...newestFirst(groupingVersion.validDuring, groupingVersion.recordedAt));
  const members = byVersion(
    versions.length === 0
      ? []
      : await context.tx
          .select({ versionId: groupingMember.groupingVersionId, storeId: groupingMember.storeId })
          .from(groupingMember)
          .where(
            inArray(
              groupingMember.groupingVersionId,
              versions.map((row) => row.id),
            ),
          )
          .orderBy(asc(groupingMember.recordedAt), asc(groupingMember.id)),
    (row) => row.storeId,
  );
  return {
    records: await assemble(
      identities,
      versions,
      today,
      requests,
      (identity) => ({ kind: identity.kind as GroupingKind }),
      (row) => ({ name: row.name, storeIds: members.get(row.id) ?? [] }),
    ),
  };
}

/** The list read of each master kind (structure-and-masters 8). */
export const masterListReads = {
  country: listCountries,
  state: listStates,
  city: listCities,
  area: listAreas,
  legal_entity: listLegalEntities,
  tax_registration: listTaxRegistrations,
  accounting_book: listAccountingBooks,
  site: listSites,
  store: listStores,
  grouping: listGroupings,
} as const satisfies Record<MasterKind, unknown>;

const APPROVED: readonly RecordState[] = ['Scheduled', 'In force', 'Ended'];
const VERSION_VIEW_KEYS = new Set(['id', 'validFrom', 'validTo', 'state', 'request']);

/** Each record with its approved version in force on the date, if it has one (structure-and-masters 2.2, 3.8). */
function onDate<T>(records: readonly { versions: readonly VersionView[] }[], date: string): T[] {
  return records.flatMap((record) => {
    const version = record.versions.find(
      (each) =>
        APPROVED.includes(each.state) && each.validFrom <= date && (each.validTo === undefined || date < each.validTo),
    );
    if (version === undefined) return [];
    // The record's fixed fields and the version's own fields, without the history's dates, state and request.
    const identity = Object.entries(record).filter(([key]) => key !== 'versions');
    const fields = Object.entries(version).filter(([key]) => !VERSION_VIEW_KEYS.has(key));
    return [{ ...Object.fromEntries([...identity, ...fields]), versionId: version.id } as T];
  });
}

/** No approval request is needed to read what is in force. */
const noRequests: RequestReader = () => Promise.resolve(new Map());

/** The structure as of a date: every master's version in force on it (structure-and-masters 3.8; module-map 4.11). */
export type Structure = Omit<MasterLists, 'date' | 'asOf' | 'notShown'>;

export async function structureOn(context: TransactionContext, today: string, date: string): Promise<Structure> {
  const read = async (kind: MasterKind) =>
    (await masterListReads[kind](context, today, noRequests)).records as readonly {
      versions: readonly VersionView[];
    }[];
  return {
    countries: onDate(await read('country'), date),
    states: onDate(await read('state'), date),
    cities: onDate(await read('city'), date),
    areas: onDate(await read('area'), date),
    legalEntities: onDate(await read('legal_entity'), date),
    taxRegistrations: onDate(await read('tax_registration'), date),
    accountingBooks: onDate(await read('accounting_book'), date),
    sites: onDate(await read('site'), date),
    stores: onDate(await read('store'), date),
    groupings: onDate(await read('grouping'), date),
  };
}
