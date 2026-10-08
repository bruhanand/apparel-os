import {
  MASTER_PAGE_CAP,
  type BusinessUnitKind,
  type MappingVerification,
  type MasterKind,
  type MasterLists,
  type MasterRecords,
  type RecordState,
} from '@apparel-os/schemas';
import { and, asc, eq, inArray, sql, type AnyColumn, type SQL } from 'drizzle-orm';
import type { PgSelect } from 'drizzle-orm/pg-core';
import type { TransactionContext } from '../../../kernel/index.js';
import type { LatestRequest } from '../../access/index.js';
import {
  accountingBook,
  accountingBookVersion,
  area,
  areaVersion,
  businessUnit,
  businessUnitMapping,
  businessUnitMappingVerification,
  businessUnitVersion,
  city,
  cityVersion,
  location,
  locationVersion,
  storeDefaultWarehouse,
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
import { masterTables } from '../db/tables.js';
import { versionState, type Decision } from '../domain/kinds.js';

// The reads of the structure (structure-and-masters 3.8, 8; module-map 4.11; code-house-rules 12.1): a page of a
// master's records, or one record, each with every version and the state each shows, newest first, for the screens'
// version history; and every record's version in force on a date, for the master lists and for other modules, read
// without the histories. The records carry no scope fact: the caller has authorised view on the record type
// (access-and-approvals 5.3, 7.1). Only organisation reads these tables (PRD-MOD-002).

/** The latest approval request of each version, which `access` keeps (access-and-approvals 9.1, 9.6). */
export type RequestReader = (versionIds: readonly string[]) => Promise<ReadonlyMap<string, LatestRequest>>;

type Tx = TransactionContext['tx'];

/** A version's first day, and the day after its last, or null while open-ended (code-house-rules 7.3). */
export const startOf = (range: AnyColumn) => sql<string>`lower(${range})::text`;
export const endOf = (range: AnyColumn) => sql<string | null>`upper(${range})::text`;

/** The columns every version is read with. */
function versionColumns(table: { id: AnyColumn; decision: AnyColumn; validDuring: AnyColumn }) {
  return {
    id: sql<string>`${table.id}`,
    decision: sql<Decision>`${table.decision}`,
    start: startOf(table.validDuring),
    end: endOf(table.validDuring),
  };
}

interface VersionRow {
  readonly id: string;
  readonly owner: string;
  readonly decision: Decision;
  readonly start: string;
  readonly end: string | null;
}

/** What every version shows in a history: its dates, its state and its latest approval request. */
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

/** Records in code order, then by identifier, so a page boundary is exact (code-house-rules 12.1). */
function inCodeOrder<T extends PgSelect>(query: T, where: SQL | undefined, limit: number | undefined) {
  const ordered = query.where(where).orderBy(sql`code`, sql`id`);
  return limit === undefined ? ordered : ordered.limit(limit);
}

/** Versions newest first: by start, then by when they were recorded. */
function newestFirst<T extends PgSelect>(query: T, where: SQL) {
  return query.where(where).orderBy(sql`lower(valid_during) desc`, sql`recorded_at desc`);
}

/** The texts frozen with each version, in the order they were written. */
function byVersion<Row extends { versionId: string }, T>(rows: readonly Row[], pick: (row: Row) => T) {
  const map = new Map<string, T[]>();
  for (const row of rows) map.set(row.versionId, [...(map.get(row.versionId) ?? []), pick(row)]);
  return map;
}

const optional = <K extends string>(key: K, date: string | null) =>
  (date === null ? {} : { [key]: date }) as Partial<Record<K, string>>;

/** A record as a history shows it, without its versions. */
type RecordHead<K extends MasterKind> = Omit<MasterRecords[K], 'versions'>;
/** A version's own fields, without what every version shows. */
type VersionFields<K extends MasterKind> = Omit<MasterRecords[K]['versions'][number], keyof VersionView>;

/** How one kind is read: its identity rows, its version rows, and how each becomes what the screens show. */
interface KindSpec<K extends MasterKind, Identity extends { id: string }, Row extends VersionRow> {
  identities(tx: Tx, where: SQL | undefined, limit: number | undefined): Promise<Identity[]>;
  versions(tx: Tx, where: SQL): Promise<Row[]>;
  head(identity: Identity): RecordHead<K>;
  fields(row: Row): VersionFields<K>;
}

/** A record with every version, as the screens' history shows it: the shape of the schemas' record (8). */
export type RecordView<K extends MasterKind> = RecordHead<K> & {
  readonly versions: (VersionView & VersionFields<K>)[];
};

/** A master as of a date: its record head, its version's fields and that version (structure-and-masters 3.8). */
export type InForce<K extends MasterKind> = RecordHead<K> & VersionFields<K> & { readonly versionId: string };

/** A page of records and where the next page starts, null on the last (code-house-rules 12.1). */
export interface RecordPage<K extends MasterKind> {
  readonly records: RecordView<K>[];
  readonly next: string | null;
}

/** Where a page starts and how long it is, at most the cap (code-house-rules 12.1). */
export interface PageRequest {
  readonly after?: string | undefined;
  readonly limit?: number | undefined;
}

/** The reads of one kind (code-house-rules 12.1). */
export interface KindReads<K extends MasterKind> {
  page(context: TransactionContext, page: PageRequest, today: string, requests: RequestReader): Promise<RecordPage<K>>;
  one(
    context: TransactionContext,
    id: string,
    today: string,
    requests: RequestReader,
  ): Promise<RecordView<K> | undefined>;
  inForceOn(context: TransactionContext, date: string): Promise<InForce<K>[]>;
}

function reads<K extends MasterKind, Identity extends { id: string }, Row extends VersionRow>(
  kind: K,
  spec: KindSpec<K, Identity, Row>,
): KindReads<K> {
  const tables = masterTables[kind];
  const assemble = async (
    tx: Tx,
    identities: readonly Identity[],
    today: string,
    requests: RequestReader,
  ): Promise<RecordView<K>[]> => {
    if (identities.length === 0) return [];
    const versions = await spec.versions(
      tx,
      inArray(
        tables.owner,
        identities.map((identity) => identity.id),
      ),
    );
    const latest = await requests(versions.map((row) => row.id));
    return identities.map((identity) => ({
      ...spec.head(identity),
      versions: versions
        .filter((row) => row.owner === identity.id)
        .map((row) => ({ ...viewOf(row, today, latest), ...spec.fields(row) })),
    }));
  };
  return {
    async page(context, page, today, requests) {
      const limit = Math.min(page.limit ?? MASTER_PAGE_CAP, MASTER_PAGE_CAP);
      let where: SQL | undefined;
      if (page.after !== undefined) {
        const [cursor] = await context.tx
          .select({ code: sql<string>`${tables.identityCode}` })
          .from(tables.identity)
          .where(eq(tables.identityId, page.after));
        if (cursor === undefined) return { records: [], next: null };
        where = sql`(${tables.identityCode}, ${tables.identityId}) > (${cursor.code}, ${page.after}::uuid)`;
      }
      const identities = await spec.identities(context.tx, where, limit + 1);
      const shown = identities.slice(0, limit);
      return {
        records: await assemble(context.tx, shown, today, requests),
        next: identities.length > limit ? (shown.at(-1)?.id ?? null) : null,
      };
    },
    async one(context, id, today, requests) {
      const identities = await spec.identities(context.tx, eq(tables.identityId, id), 1);
      return (await assemble(context.tx, identities, today, requests))[0];
    },
    async inForceOn(context, date) {
      const versions = await spec.versions(
        context.tx,
        and(eq(tables.decision, 'Approved'), sql`${tables.validDuring} @> ${date}::date`) ?? sql`false`,
      );
      if (versions.length === 0) return [];
      const identities = await spec.identities(
        context.tx,
        inArray(
          tables.identityId,
          versions.map((row) => row.owner),
        ),
        undefined,
      );
      const byOwner = new Map(versions.map((row) => [row.owner, row]));
      return identities.flatMap((identity) => {
        const row = byOwner.get(identity.id);
        return row === undefined ? [] : [{ ...spec.head(identity), ...spec.fields(row), versionId: row.id }];
      });
    },
  };
}

/** The versions of a kind whose versions hold only a name. */
function named(
  table:
    | typeof countryVersion
    | typeof stateVersion
    | typeof cityVersion
    | typeof areaVersion
    | typeof accountingBookVersion,
  owner: AnyColumn,
) {
  return (tx: Tx, where: SQL) =>
    newestFirst(
      tx
        .select({ ...versionColumns(table), owner: sql<string>`${owner}`, name: table.name })
        .from(table)
        .$dynamic(),
      where,
    );
}

/** Each master kind's reads (structure-and-masters 3.1, 8). */
export const kindReads: { readonly [K in MasterKind]: KindReads<K> } = {
  country: reads('country', {
    identities: (tx, where, limit) => inCodeOrder(tx.select().from(country).$dynamic(), where, limit),
    versions: named(countryVersion, countryVersion.countryId),
    head: (identity) => ({ id: identity.id, code: identity.code }),
    fields: (row) => ({ name: row.name }),
  }),
  state: reads('state', {
    identities: (tx, where, limit) => inCodeOrder(tx.select().from(state).$dynamic(), where, limit),
    versions: named(stateVersion, stateVersion.stateId),
    head: (identity) => ({ id: identity.id, code: identity.code, countryId: identity.countryId }),
    fields: (row) => ({ name: row.name }),
  }),
  city: reads('city', {
    identities: (tx, where, limit) => inCodeOrder(tx.select().from(city).$dynamic(), where, limit),
    versions: named(cityVersion, cityVersion.cityId),
    head: (identity) => ({ id: identity.id, code: identity.code, stateId: identity.stateId }),
    fields: (row) => ({ name: row.name }),
  }),
  area: reads('area', {
    identities: (tx, where, limit) => inCodeOrder(tx.select().from(area).$dynamic(), where, limit),
    versions: named(areaVersion, areaVersion.areaId),
    head: (identity) => ({ id: identity.id, code: identity.code, cityId: identity.cityId }),
    fields: (row) => ({ name: row.name }),
  }),
  legal_entity: reads('legal_entity', {
    identities: (tx, where, limit) => inCodeOrder(tx.select().from(legalEntity).$dynamic(), where, limit),
    versions: (tx, where) =>
      newestFirst(
        tx
          .select({
            ...versionColumns(legalEntityVersion),
            owner: legalEntityVersion.legalEntityId,
            legalName: legalEntityVersion.legalName,
          })
          .from(legalEntityVersion)
          .$dynamic(),
        where,
      ),
    head: (identity) => ({ id: identity.id, code: identity.code }),
    fields: (row) => ({ legalName: row.legalName }),
  }),
  tax_registration: reads('tax_registration', {
    identities: (tx, where, limit) => inCodeOrder(tx.select().from(taxRegistration).$dynamic(), where, limit),
    versions: (tx, where) =>
      newestFirst(
        tx
          .select({
            ...versionColumns(taxRegistrationVersion),
            owner: taxRegistrationVersion.taxRegistrationId,
            registrationNumber: taxRegistrationVersion.registrationNumber,
            stateId: taxRegistrationVersion.stateId,
            validityFrom: startOf(taxRegistrationVersion.validity),
            validityTo: endOf(taxRegistrationVersion.validity),
          })
          .from(taxRegistrationVersion)
          .$dynamic(),
        where,
      ),
    head: (identity) => ({ id: identity.id, code: identity.code, legalEntityId: identity.legalEntityId }),
    fields: (row) => ({
      registrationNumber: row.registrationNumber,
      stateId: row.stateId,
      validityFrom: row.validityFrom,
      ...optional('validityTo', row.validityTo),
    }),
  }),
  accounting_book: reads('accounting_book', {
    identities: (tx, where, limit) => inCodeOrder(tx.select().from(accountingBook).$dynamic(), where, limit),
    versions: named(accountingBookVersion, accountingBookVersion.accountingBookId),
    head: (identity) => ({ id: identity.id, code: identity.code, legalEntityId: identity.legalEntityId }),
    fields: (row) => ({ name: row.name }),
  }),
  site: reads('site', {
    identities: (tx, where, limit) => inCodeOrder(tx.select().from(site).$dynamic(), where, limit),
    versions: async (tx, where) => {
      const rows = await newestFirst(
        tx
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
          .$dynamic(),
        where,
      );
      const aliases = byVersion(
        rows.length === 0
          ? []
          : await tx
              .select({ versionId: siteAlias.siteVersionId, alias: siteAlias.alias })
              .from(siteAlias)
              .where(
                inArray(
                  siteAlias.siteVersionId,
                  rows.map((row) => row.id),
                ),
              )
              .orderBy(asc(siteAlias.recordedAt), asc(siteAlias.id)),
        (row) => row.alias,
      );
      return rows.map((row) => ({ ...row, aliases: aliases.get(row.id) ?? [] }));
    },
    head: (identity) => ({ id: identity.id, code: identity.code }),
    fields: (row) => ({
      name: row.name,
      physicalKind: row.physicalKind,
      areaId: row.areaId,
      addresses: row.addresses,
      aliases: row.aliases,
      ...optional('openingDate', row.openingDate),
      ...optional('closingDate', row.closingDate),
      status: row.status,
    }),
  }),
  store: reads('store', {
    identities: (tx, where, limit) => inCodeOrder(tx.select().from(store).$dynamic(), where, limit),
    versions: async (tx, where) => {
      const rows = await newestFirst(
        tx
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
          .$dynamic(),
        where,
      );
      const aliases = byVersion(
        rows.length === 0
          ? []
          : await tx
              .select({ versionId: storeAlias.storeVersionId, alias: storeAlias.alias })
              .from(storeAlias)
              .where(
                inArray(
                  storeAlias.storeVersionId,
                  rows.map((row) => row.id),
                ),
              )
              .orderBy(asc(storeAlias.recordedAt), asc(storeAlias.id)),
        (row) => row.alias,
      );
      return rows.map((row) => ({ ...row, aliases: aliases.get(row.id) ?? [] }));
    },
    head: (identity) => ({ id: identity.id, code: identity.code }),
    fields: (row) => ({
      name: row.name,
      format: row.format,
      operatingModel: row.operatingModel,
      siteId: row.siteId,
      aliases: row.aliases,
      ...optional('openingDate', row.openingDate),
      ...optional('closingDate', row.closingDate),
      status: row.status,
    }),
  }),
  grouping: reads('grouping', {
    identities: (tx, where, limit) => inCodeOrder(tx.select().from(grouping).$dynamic(), where, limit),
    versions: async (tx, where) => {
      const rows = await newestFirst(
        tx
          .select({ ...versionColumns(groupingVersion), owner: groupingVersion.groupingId, name: groupingVersion.name })
          .from(groupingVersion)
          .$dynamic(),
        where,
      );
      const members = byVersion(
        rows.length === 0
          ? []
          : await tx
              .select({ versionId: groupingMember.groupingVersionId, storeId: groupingMember.storeId })
              .from(groupingMember)
              .where(
                inArray(
                  groupingMember.groupingVersionId,
                  rows.map((row) => row.id),
                ),
              )
              .orderBy(asc(groupingMember.recordedAt), asc(groupingMember.id)),
        (row) => row.storeId,
      );
      return rows.map((row) => ({ ...row, storeIds: members.get(row.id) ?? [] }));
    },
    head: (identity) => ({ id: identity.id, code: identity.code, kind: identity.kind }),
    fields: (row) => ({ name: row.name, storeIds: row.storeIds }),
  }),
  business_unit: reads('business_unit', {
    identities: (tx, where, limit) => inCodeOrder(tx.select().from(businessUnit).$dynamic(), where, limit),
    // With the mapping a version was prepared with, decided with it (structure-and-masters 3.4).
    versions: async (tx, where) => {
      const rows = await newestFirst(
        tx
          .select({
            ...versionColumns(businessUnitVersion),
            owner: businessUnitVersion.businessUnitId,
            name: businessUnitVersion.name,
            status: businessUnitVersion.status,
          })
          .from(businessUnitVersion)
          .$dynamic(),
        where,
      );
      const prepared =
        rows.length === 0
          ? []
          : await tx
              .select({
                versionId: businessUnitMapping.preparedWithVersionId,
                legalEntityId: businessUnitMapping.legalEntityId,
                taxRegistrationId: businessUnitMapping.taxRegistrationId,
                accountingBookId: businessUnitMapping.accountingBookId,
              })
              .from(businessUnitMapping)
              .where(
                inArray(
                  businessUnitMapping.preparedWithVersionId,
                  rows.map((row) => row.id),
                ),
              );
      const byVersion = new Map(prepared.map((each) => [each.versionId, each]));
      return rows.map((row) => {
        const mapping = byVersion.get(row.id);
        return {
          ...row,
          legalEntityId: mapping?.legalEntityId ?? null,
          taxRegistrationId: mapping?.taxRegistrationId ?? null,
          accountingBookId: mapping?.accountingBookId ?? null,
        };
      });
    },
    head: (identity) => ({
      id: identity.id,
      code: identity.code,
      siteId: identity.siteId,
      kind: identity.kind,
      ...(identity.storeId === null ? {} : { storeId: identity.storeId }),
    }),
    fields: (row) => ({
      name: row.name,
      status: row.status,
      ...(row.legalEntityId === null || row.taxRegistrationId === null || row.accountingBookId === null
        ? {}
        : {
            legalEntityId: row.legalEntityId,
            taxRegistrationId: row.taxRegistrationId,
            accountingBookId: row.accountingBookId,
          }),
    }),
  }),
  // A unit's mapping versions, each with its verification (structure-and-masters 3.4): the record is the unit.
  business_unit_mapping: reads('business_unit_mapping', {
    identities: (tx, where, limit) => inCodeOrder(tx.select().from(businessUnit).$dynamic(), where, limit),
    versions: async (tx, where) => {
      const rows = await newestFirst(
        tx
          .select({
            ...versionColumns(businessUnitMapping),
            owner: businessUnitMapping.businessUnitId,
            legalEntityId: businessUnitMapping.legalEntityId,
            taxRegistrationId: businessUnitMapping.taxRegistrationId,
            accountingBookId: businessUnitMapping.accountingBookId,
          })
          .from(businessUnitMapping)
          .$dynamic(),
        where,
      );
      const verifications =
        rows.length === 0
          ? []
          : await tx
              .select()
              .from(businessUnitMappingVerification)
              .where(
                inArray(
                  businessUnitMappingVerification.businessUnitMappingId,
                  rows.map((row) => row.id),
                ),
              );
      const byMapping = new Map(verifications.map((each) => [each.businessUnitMappingId, each]));
      return rows.map((row) => ({ ...row, verification: byMapping.get(row.id) }));
    },
    head: (identity) => ({ id: identity.id, code: identity.code }),
    fields: (row) => ({
      legalEntityId: row.legalEntityId,
      taxRegistrationId: row.taxRegistrationId,
      accountingBookId: row.accountingBookId,
      ...(row.verification === undefined
        ? {}
        : {
            verification: {
              id: row.verification.id,
              verifiedByUserId: row.verification.verifiedByUserId,
              verifiedAt: row.verification.verifiedAt.toISOString(),
              attachmentIds: row.verification.attachmentIds,
            },
          }),
    }),
  }),
  location: reads('location', {
    identities: (tx, where, limit) => inCodeOrder(tx.select().from(location).$dynamic(), where, limit),
    versions: (tx, where) =>
      newestFirst(
        tx
          .select({
            ...versionColumns(locationVersion),
            owner: locationVersion.locationId,
            name: locationVersion.name,
            kind: locationVersion.kind,
            parentLocationId: locationVersion.parentLocationId,
            retired: locationVersion.retired,
          })
          .from(locationVersion)
          .$dynamic(),
        where,
      ),
    head: (identity) => ({
      id: identity.id,
      code: identity.code,
      siteId: identity.siteId,
      businessUnitId: identity.businessUnitId,
    }),
    fields: (row) => ({
      name: row.name,
      kind: row.kind,
      ...(row.parentLocationId === null ? {} : { parentLocationId: row.parentLocationId }),
      retired: row.retired,
    }),
  }),
  // A Store's default warehouse versions (3.6): the record is the Store.
  store_default_warehouse: reads('store_default_warehouse', {
    identities: (tx, where, limit) => inCodeOrder(tx.select().from(store).$dynamic(), where, limit),
    versions: (tx, where) =>
      newestFirst(
        tx
          .select({
            ...versionColumns(storeDefaultWarehouse),
            owner: storeDefaultWarehouse.storeId,
            warehouseUnitId: storeDefaultWarehouse.warehouseUnitId,
          })
          .from(storeDefaultWarehouse)
          .$dynamic(),
        where,
      ),
    head: (identity) => ({ id: identity.id, code: identity.code }),
    fields: (row) => ({ warehouseUnitId: row.warehouseUnitId }),
  }),
};

/** The structure as of a date: every master's version in force on it (structure-and-masters 3.8; module-map 4.11). */
export type Structure = Omit<MasterLists, 'date' | 'asOf' | 'notShown'>;

/** Reads only the versions in force on the date, never the histories (code-house-rules 12.1). */
export async function structureOn(context: TransactionContext, date: string): Promise<Structure> {
  return {
    countries: await kindReads.country.inForceOn(context, date),
    states: await kindReads.state.inForceOn(context, date),
    cities: await kindReads.city.inForceOn(context, date),
    areas: await kindReads.area.inForceOn(context, date),
    legalEntities: await kindReads.legal_entity.inForceOn(context, date),
    taxRegistrations: await kindReads.tax_registration.inForceOn(context, date),
    accountingBooks: await kindReads.accounting_book.inForceOn(context, date),
    sites: await kindReads.site.inForceOn(context, date),
    stores: await kindReads.store.inForceOn(context, date),
    groupings: await kindReads.grouping.inForceOn(context, date),
    // A unit as of a date, without the mapping its first version was prepared with: its mapping in force is its own list.
    businessUnits: (await kindReads.business_unit.inForceOn(context, date)).map((unit) => ({
      id: unit.id,
      code: unit.code,
      versionId: unit.versionId,
      siteId: unit.siteId,
      kind: unit.kind,
      ...(unit.storeId === undefined ? {} : { storeId: unit.storeId }),
      name: unit.name,
      status: unit.status,
    })),
    businessUnitMappings: await kindReads.business_unit_mapping.inForceOn(context, date),
    locations: await kindReads.location.inForceOn(context, date),
    storeDefaultWarehouses: await kindReads.store_default_warehouse.inForceOn(context, date),
  };
}

/** A unit's mapping as of a date (structure-and-masters 3.8): what a caller stores, and its verification. */
export interface UnitMapping {
  readonly businessUnitId: string;
  readonly siteId: string;
  readonly storeId: string | null;
  readonly kind: BusinessUnitKind;
  readonly legalEntityId: string;
  readonly taxRegistrationId: string;
  readonly accountingBookId: string;
  /** The mapping version the caller stores on what it writes (PRD-ACP-013, PRD-MOD-010). */
  readonly mappingVersionId: string;
  /** Absent while the version is unverified; a live statutory action refuses then (POL-10.08). */
  readonly verification?: MappingVerification;
}

/** The unit's mapping version in force on the date, or undefined when none is (3.8). */
export async function mappingOn(
  context: TransactionContext,
  businessUnitId: string,
  date: string,
): Promise<UnitMapping | undefined> {
  const [row] = await context.tx
    .select({
      siteId: businessUnit.siteId,
      storeId: businessUnit.storeId,
      kind: businessUnit.kind,
      mappingVersionId: businessUnitMapping.id,
      legalEntityId: businessUnitMapping.legalEntityId,
      taxRegistrationId: businessUnitMapping.taxRegistrationId,
      accountingBookId: businessUnitMapping.accountingBookId,
    })
    .from(businessUnitMapping)
    .innerJoin(businessUnit, eq(businessUnit.id, businessUnitMapping.businessUnitId))
    .where(
      and(
        eq(businessUnitMapping.businessUnitId, businessUnitId),
        eq(businessUnitMapping.decision, 'Approved'),
        sql`${businessUnitMapping.validDuring} @> ${date}::date`,
      ),
    );
  if (row === undefined) return undefined;
  const [verified] = await context.tx
    .select()
    .from(businessUnitMappingVerification)
    .where(eq(businessUnitMappingVerification.businessUnitMappingId, row.mappingVersionId));
  return {
    businessUnitId,
    ...row,
    ...(verified === undefined
      ? {}
      : {
          verification: {
            id: verified.id,
            verifiedByUserId: verified.verifiedByUserId,
            verifiedAt: verified.verifiedAt.toISOString(),
            attachmentIds: verified.attachmentIds,
          },
        }),
  };
}
