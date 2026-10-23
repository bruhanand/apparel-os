import { sql } from 'drizzle-orm';
import { declareReadModel, serveReadModel, type TransactionContext } from '../../../kernel/index.js';

// The places a report names (goods-in 9.2, 9.4; structure-and-masters 3.5, 3.8; module-map section 3 rule 5;
// S2-F11-T01), served through the kernel's read-model gateway: Sites, business units and locations by identifier, each
// with its code and its name in force on the date, a unit with its Site and Store, a location with its kind and unit.
// The masters are unscoped (structure-and-masters 6.1): a reader learns of a place only through the records its own
// grants show it. One that does not exist, or has no version in force on the date, is not answered.

export interface PlacesQuery {
  readonly siteIds: readonly string[];
  readonly businessUnitIds: readonly string[];
  readonly locationIds: readonly string[];
  readonly date: string;
}

export interface PlaceName {
  readonly id: string;
  readonly code: string;
  readonly name: string;
}

export interface PlacesAnswer {
  readonly sites: readonly PlaceName[];
  readonly businessUnits: readonly (PlaceName & { readonly siteId: string; readonly storeId: string | null })[];
  readonly locations: readonly (PlaceName & {
    readonly siteId: string;
    readonly businessUnitId: string;
    readonly kind: string;
  })[];
}

const ids = (values: readonly string[]) => sql.param([...new Set(values)]);

export async function placesNamed(context: TransactionContext, query: PlacesQuery): Promise<PlacesAnswer> {
  const sites =
    query.siteIds.length === 0
      ? []
      : (
          await context.tx.execute<{ id: string; code: string; name: string }>(sql`
      select s.id::text as id, s.code, v.name
      from organisation.site s join organisation.site_version v on v.site_id = s.id
      where s.id = any(${ids(query.siteIds)}::uuid[]) and v.decision = 'Approved'
        and v.valid_during @> ${query.date}::date
      order by s.id`)
        ).rows;
  const units =
    query.businessUnitIds.length === 0
      ? []
      : (
          await context.tx.execute<{
            id: string;
            code: string;
            name: string;
            site_id: string;
            store_id: string | null;
          }>(
            sql`
      select u.id::text as id, u.code, v.name, u.site_id::text as site_id, u.store_id::text as store_id
      from organisation.business_unit u join organisation.business_unit_version v on v.business_unit_id = u.id
      where u.id = any(${ids(query.businessUnitIds)}::uuid[]) and v.decision = 'Approved'
        and v.valid_during @> ${query.date}::date
      order by u.id`,
          )
        ).rows;
  const locations =
    query.locationIds.length === 0
      ? []
      : (
          await context.tx.execute<{
            id: string;
            code: string;
            name: string;
            kind: string;
            site_id: string;
            business_unit_id: string;
          }>(sql`
      select l.id::text as id, l.code, v.name, v.kind, l.site_id::text as site_id,
             l.business_unit_id::text as business_unit_id
      from organisation.location l join organisation.location_version v on v.location_id = l.id
      where l.id = any(${ids(query.locationIds)}::uuid[]) and v.decision = 'Approved'
        and v.valid_during @> ${query.date}::date
      order by l.id`)
        ).rows;
  return {
    sites,
    businessUnits: units.map((row) => ({
      id: row.id,
      code: row.code,
      name: row.name,
      siteId: row.site_id,
      storeId: row.store_id,
    })),
    locations: locations.map((row) => ({
      id: row.id,
      code: row.code,
      name: row.name,
      kind: row.kind,
      siteId: row.site_id,
      businessUnitId: row.business_unit_id,
    })),
  };
}

/** The read model of places, declared for the read-model gateway (module-map section 3, rule 5). */
export const ORGANISATION_PLACES = declareReadModel<PlacesQuery, PlacesAnswer>('organisation.places');

/** `organisation`'s read models as it serves them, handed to the gateway by the composition root. */
export const organisationReadModels = [serveReadModel(ORGANISATION_PLACES, placesNamed)];
