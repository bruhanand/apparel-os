import { and, eq, inArray, sql } from 'drizzle-orm';
import type { TransactionContext } from '../../../kernel/index.js';
import type { PlaceExpansion, ScopeMember, ScopeMembers, SelectedPlace } from '../../access/index.js';
import { businessUnit, businessUnitVersion, location, storeVersion } from '../db/schema.js';
import { masterTables } from '../db/tables.js';
import type { MasterKind } from '../domain/kinds.js';

// Scope by place (structure-and-masters 3.8, 3.9, 6.1; access-and-approvals 5; module-map section 3, rule 6;
// S1-F02-T03): `organisation`'s side of the scope contract `access` defines, and the place facts each of its record
// types declares, which the routes pass to Authorise and the approval requests keep (access-and-approvals 5.3, 9.1).
// Only organisation reads these tables (PRD-MOD-002); its tables carry no row-level security (6.1), so the answers do
// not depend on what the caller's actor may see.

/** The member types `organisation` answers, and the master each is a record of. */
const memberKinds = {
  'legal-entity': 'legal_entity',
  site: 'site',
  store: 'store',
  'business-unit': 'business_unit',
} as const satisfies Partial<Record<ScopeMember['type'], MasterKind>>;

type OrganisationMember = keyof typeof memberKinds;

/**
 * The code of a place or legal entity a refusal names (access-and-approvals 7.1; PRD-UXP-003): codes and identifiers
 * only (code-house-rules 12.3). Undefined for any other fact, or one that does not exist.
 */
export async function placeCode(
  context: TransactionContext,
  type: string | undefined,
  id: string | undefined,
): Promise<string | undefined> {
  if (type === undefined || id === undefined || !(type in memberKinds)) return undefined;
  const tables = masterTables[memberKinds[type as OrganisationMember]];
  const [row] = await context.tx
    .select({ code: sql<string>`${tables.identityCode}` })
    .from(tables.identity)
    .where(eq(tables.identityId, id));
  return row?.code;
}

/**
 * Check scope membership (structure-and-masters 3.8): a member exists as the master its type names, so a Store is
 * never taken for a Site, and has an approved version in force on some day of the assignment's dates, so a record
 * still awaiting approval, rejected, or ended before the assignment starts is not where the assignment says.
 */
async function notFound(
  context: TransactionContext,
  members: readonly ScopeMember[],
  dates: { readonly validFrom: string; readonly validTo?: string | undefined },
): Promise<ScopeMember[]> {
  const range = `[${dates.validFrom},${dates.validTo ?? ''})`;
  const missing: ScopeMember[] = [];
  for (const type of Object.keys(memberKinds) as OrganisationMember[]) {
    const asked = members.filter((member) => member.type === type);
    if (asked.length === 0) continue;
    const tables = masterTables[memberKinds[type]];
    const found = await context.tx
      .selectDistinct({ id: sql<string>`${tables.owner}` })
      .from(tables.version)
      .where(
        and(
          inArray(
            tables.owner,
            asked.map((member) => member.id),
          ),
          eq(tables.decision, 'Approved'),
          sql`${tables.validDuring} && ${range}::daterange`,
        ),
      );
    const ids = new Set(found.map((row) => row.id));
    missing.push(...asked.filter((member) => !ids.has(member.id)));
  }
  return missing;
}

/**
 * Expand a place for access (structure-and-masters 3.9): a Site covers the Stores linked to it on the date and every
 * business unit at it, a Store's own and the warehouse and office units that hang under the Site; a Store covers its
 * business units; a unit covers only itself. Each Store and unit with an approved version in force on the date.
 */
async function expand(context: TransactionContext, place: SelectedPlace, date: string): Promise<PlaceExpansion> {
  if (place.type === 'business-unit') return { storeIds: [], businessUnitIds: [place.id] };
  const unitsInForce = await context.tx
    .selectDistinct({ id: businessUnit.id })
    .from(businessUnit)
    .innerJoin(
      businessUnitVersion,
      and(
        eq(businessUnitVersion.businessUnitId, businessUnit.id),
        eq(businessUnitVersion.decision, 'Approved'),
        sql`${businessUnitVersion.validDuring} @> ${date}::date`,
      ),
    )
    .where(place.type === 'site' ? eq(businessUnit.siteId, place.id) : eq(businessUnit.storeId, place.id))
    .orderBy(businessUnit.id);
  const businessUnitIds = unitsInForce.map((row) => row.id);
  if (place.type === 'store') return { storeIds: [], businessUnitIds };
  const stores = await context.tx
    .selectDistinct({ id: storeVersion.storeId })
    .from(storeVersion)
    .where(
      and(
        eq(storeVersion.siteId, place.id),
        eq(storeVersion.decision, 'Approved'),
        sql`${storeVersion.validDuring} @> ${date}::date`,
      ),
    )
    .orderBy(storeVersion.storeId);
  return { storeIds: stores.map((row) => row.id), businessUnitIds };
}

/** `organisation`'s implementation of the scope contract, for legal entities and places (module-map 4.11). */
export const organisationScopeMembers: ScopeMembers = {
  answers: Object.keys(memberKinds) as OrganisationMember[],
  notFound,
  expand,
};

/**
 * The kinds whose record types declare place facts, and how each finds them (structure-and-masters 6.1; product owner,
 * 8 and 9 Oct 2026): a Site is its own place; a Store is itself at the Site it is linked to; a business unit, its
 * mapping and the mapping's verification are the unit at its Site, and its Store where it has one, of the legal entity
 * its mapping names (POL-10.01); a location is its unit's; a Store's default warehouse is the Store's, of the legal
 * entity of the Store's whole-store unit. None declares a brand, and a Site or Store no legal entity.
 */
export const placeScopedKinds = [
  'site',
  'store',
  'business_unit',
  'business_unit_mapping',
  'location',
  'store_default_warehouse',
] as const satisfies readonly MasterKind[];
export type PlaceScopedKind = (typeof placeScopedKinds)[number];

export const isPlaceScoped = (kind: MasterKind): kind is PlaceScopedKind =>
  (placeScopedKinds as readonly MasterKind[]).includes(kind);

/**
 * The order that puts each record's version nearest a date first (structure-and-masters 6.1; product owner, 9 Oct
 * 2026): approved versions first; of those, the latest starting on or before the date, so the one in force, or the
 * last one of a record ended or relocated by then; else the earliest starting after it. A record with no approved
 * version, such as a new one awaiting approval, by its other versions alike.
 */
const nearest = (date: string) => sql`(decision = 'Approved') desc, (lower(valid_during) <= ${date}::date) desc,
  case when lower(valid_during) <= ${date}::date then lower(valid_during) end desc nulls last, lower(valid_during),
  recorded_at desc`;

const uuidArray = (ids: readonly string[]) => sql`${`{${ids.join(',')}}`}::uuid[]`;

/** The Site each Store is linked to on the date, by its version nearest the date (3.3). */
async function storeSites(
  context: TransactionContext,
  storeIds: readonly string[],
  date: string,
): Promise<Map<string, string>> {
  if (storeIds.length === 0) return new Map();
  const rows = await context.tx.execute<{ store_id: string; site_id: string }>(sql`
    select distinct on (store_id) store_id, site_id from organisation.store_version
    where store_id = any (${uuidArray(storeIds)})
    order by store_id, ${nearest(date)}`);
  return new Map(rows.rows.map((row) => [row.store_id, row.site_id]));
}

/** The legal entity each unit is mapped to on the date, by its mapping version nearest the date (3.4; POL-10.01). */
async function unitLegalEntities(
  context: TransactionContext,
  unitIds: readonly string[],
  date: string,
): Promise<Map<string, string>> {
  if (unitIds.length === 0) return new Map();
  const rows = await context.tx.execute<{ business_unit_id: string; legal_entity_id: string }>(sql`
    select distinct on (business_unit_id) business_unit_id, legal_entity_id from organisation.business_unit_mapping
    where business_unit_id = any (${uuidArray(unitIds)})
    order by business_unit_id, ${nearest(date)}`);
  return new Map(rows.rows.map((row) => [row.business_unit_id, row.legal_entity_id]));
}

/**
 * A record's place facts (access-and-approvals 5.3): its Site, Store and business unit, and the legal entity of a
 * unit's mapping, as they apply; one left out is not carried, or Unknown. Fits both Authorise's facts and the audit
 * record's scope, whose fields are never set to undefined.
 */
export interface PlaceFacts {
  readonly legalEntityId?: string;
  readonly siteId?: string;
  readonly storeId?: string;
  readonly businessUnitId?: string;
}

/** Each unit's facts on the date: the unit, its Site, its Store where it has one (3.3), its mapping's legal entity. */
async function unitFacts(
  context: TransactionContext,
  unitIds: readonly string[],
  date: string,
): Promise<Map<string, PlaceFacts>> {
  if (unitIds.length === 0) return new Map();
  const rows = await context.tx
    .select({ id: businessUnit.id, siteId: businessUnit.siteId, storeId: businessUnit.storeId })
    .from(businessUnit)
    .where(inArray(businessUnit.id, [...unitIds]));
  const entities = await unitLegalEntities(
    context,
    rows.map((row) => row.id),
    date,
  );
  return new Map(
    rows.map((row) => {
      const legalEntityId = entities.get(row.id);
      const facts: PlaceFacts = {
        ...(legalEntityId === undefined ? {} : { legalEntityId }),
        siteId: row.siteId,
        ...(row.storeId === null ? {} : { storeId: row.storeId }),
        businessUnitId: row.id,
      };
      return [row.id, facts];
    }),
  );
}

/** The legal entity of each Store's whole-store unit on the date, which its default warehouse carries (3.3, 3.6). */
async function storeLegalEntities(
  context: TransactionContext,
  storeIds: readonly string[],
  date: string,
): Promise<Map<string, string>> {
  if (storeIds.length === 0) return new Map();
  const units = await context.tx
    .select({ id: businessUnit.id, storeId: businessUnit.storeId })
    .from(businessUnit)
    .where(and(inArray(businessUnit.storeId, [...storeIds]), eq(businessUnit.kind, 'whole-store')))
    .orderBy(businessUnit.id);
  const entities = await unitLegalEntities(
    context,
    units.map((unit) => unit.id),
    date,
  );
  const found = new Map<string, string>();
  for (const unit of units) {
    const legalEntityId = entities.get(unit.id);
    if (unit.storeId !== null && legalEntityId !== undefined && !found.has(unit.storeId)) {
      found.set(unit.storeId, legalEntityId);
    }
  }
  return found;
}

/**
 * The place facts of records of a place-scoped kind on a date (access-and-approvals 5.3; structure-and-masters 6.1),
 * by record identifier: a unit's mapping and a Store's default warehouse by the unit's and the Store's. A record that
 * does not exist is left out.
 */
export async function placeFactsOf(
  context: TransactionContext,
  kind: PlaceScopedKind,
  recordIds: readonly string[],
  date: string,
): Promise<Map<string, PlaceFacts>> {
  const ids = [...new Set(recordIds)];
  if (ids.length === 0) return new Map();
  switch (kind) {
    case 'site': {
      const tables = masterTables.site;
      const found = await context.tx
        .select({ id: sql<string>`${tables.identityId}` })
        .from(tables.identity)
        .where(inArray(tables.identityId, ids));
      return new Map(found.map((row) => [row.id, { siteId: row.id }]));
    }
    case 'store': {
      const sites = await storeSites(context, ids, date);
      return new Map([...sites].map(([storeId, siteId]) => [storeId, { siteId, storeId }]));
    }
    case 'store_default_warehouse': {
      const sites = await storeSites(context, ids, date);
      const entities = await storeLegalEntities(context, [...sites.keys()], date);
      return new Map(
        [...sites].map(([storeId, siteId]) => {
          const legalEntityId = entities.get(storeId);
          const facts: PlaceFacts = { ...(legalEntityId === undefined ? {} : { legalEntityId }), siteId, storeId };
          return [storeId, facts];
        }),
      );
    }
    case 'business_unit':
    case 'business_unit_mapping':
      return unitFacts(context, ids, date);
    case 'location': {
      const rows = await context.tx
        .select({ id: location.id, unitId: location.businessUnitId })
        .from(location)
        .where(inArray(location.id, ids));
      const units = await unitFacts(
        context,
        rows.map((row) => row.unitId),
        date,
      );
      return new Map(
        rows.flatMap((row) => {
          const facts = units.get(row.unitId);
          return facts === undefined ? [] : [[row.id, facts] as const];
        }),
      );
    }
  }
}

/**
 * One record's place facts on the date (6.1): undefined for a kind that carries none; none for a place-scoped record
 * that does not exist, which only all-members scope covers (access-and-approvals 5.3; PRD-MOD-015).
 */
export async function placeFactsOfRecord(
  context: TransactionContext,
  kind: MasterKind,
  recordId: string,
  date: string,
): Promise<PlaceFacts | undefined> {
  if (!isPlaceScoped(kind)) return undefined;
  return (await placeFactsOf(context, kind, [recordId], date)).get(recordId) ?? {};
}
