import type { BusinessUnitKind } from '@apparel-os/schemas';
import { and, eq, ne, sql } from 'drizzle-orm';
import type { CommandRefusal, TransactionContext } from '../../../kernel/index.js';
import type { LocationInUse } from '../contracts/location-in-use.js';
import {
  accountingBook,
  area,
  businessUnit,
  businessUnitVersion,
  city,
  location,
  locationVersion,
  siteVersion,
  storeVersion,
  taxRegistration,
  taxRegistrationVersion,
} from '../db/schema.js';
import { recordTypeOf } from '../domain/kinds.js';

// The rules of business units, mappings, locations and default warehouses (structure-and-masters 3.3 to 3.6; S1-F02-T02),
// checked when a change is prepared, so the screen names the reason at once, and again when it is approved under its
// locks (code-house-rules 8.2). The migration's triggers guard the same rules behind them (0029).

type Check = Promise<CommandRefusal | undefined>;

const refused = (code: string, missing: CommandRefusal['missing'] = []): CommandRefusal => ({
  kind: 'refused',
  code,
  missing,
});

/** The registration and the book belong to the mapped legal entity (3.4; PRD-ORG-020). Both are fixed to theirs. */
export async function mappingLegalEntity(
  context: TransactionContext,
  mapping: { legalEntityId: string; taxRegistrationId: string; accountingBookId: string },
): Check {
  const [registration] = await context.tx
    .select({ legalEntityId: taxRegistration.legalEntityId })
    .from(taxRegistration)
    .where(eq(taxRegistration.id, mapping.taxRegistrationId));
  if (registration !== undefined && registration.legalEntityId !== mapping.legalEntityId) {
    return refused('organisation.mapping-legal-entity-mismatch', [
      { kind: 'record', recordType: recordTypeOf('tax_registration'), recordId: mapping.taxRegistrationId },
    ]);
  }
  const [book] = await context.tx
    .select({ legalEntityId: accountingBook.legalEntityId })
    .from(accountingBook)
    .where(eq(accountingBook.id, mapping.accountingBookId));
  if (book !== undefined && book.legalEntityId !== mapping.legalEntityId) {
    return refused('organisation.mapping-legal-entity-mismatch', [
      { kind: 'record', recordType: recordTypeOf('accounting_book'), recordId: mapping.accountingBookId },
    ]);
  }
  return undefined;
}

/**
 * When preparing: the registration's State is the State of the Site on the start, read from the approved versions in
 * force then (3.4; GC2-1, DEC-105). Where either has none yet, approval checks it under its locks.
 */
export async function registrationInSiteState(
  context: TransactionContext,
  siteId: string,
  taxRegistrationId: string,
  date: string,
): Check {
  const [site] = await context.tx
    .select({ stateId: city.stateId })
    .from(siteVersion)
    .innerJoin(area, eq(area.id, siteVersion.areaId))
    .innerJoin(city, eq(city.id, area.cityId))
    .where(
      and(
        eq(siteVersion.siteId, siteId),
        eq(siteVersion.decision, 'Approved'),
        sql`${siteVersion.validDuring} @> ${date}::date`,
      ),
    );
  const [registration] = await context.tx
    .select({ stateId: taxRegistrationVersion.stateId })
    .from(taxRegistrationVersion)
    .where(
      and(
        eq(taxRegistrationVersion.taxRegistrationId, taxRegistrationId),
        eq(taxRegistrationVersion.decision, 'Approved'),
        sql`${taxRegistrationVersion.validDuring} @> ${date}::date`,
      ),
    );
  if (site !== undefined && registration !== undefined && site.stateId !== registration.stateId) {
    return refused('organisation.registration-in-another-state', [
      { kind: 'record', recordType: recordTypeOf('tax_registration'), recordId: taxRegistrationId },
    ]);
  }
  return undefined;
}

/** The fixed facts of a business unit (3.3). */
export interface UnitFacts {
  readonly id?: string;
  readonly siteId: string;
  readonly kind: BusinessUnitKind;
  readonly storeId: string | null;
}

/**
 * A Store's unit is created at the Site its Store is linked to on its start, and a Store has one whole-store unit at
 * that Site (3.3). The Store's link is read from its approved version in force on the date; where it has none yet,
 * approval refuses the unit as naming a record not in force.
 */
export async function storeUnitRules(context: TransactionContext, unit: UnitFacts, date: string): Check {
  if (unit.storeId === null) return undefined;
  const [link] = await context.tx
    .select({ siteId: storeVersion.siteId })
    .from(storeVersion)
    .where(
      and(
        eq(storeVersion.storeId, unit.storeId),
        eq(storeVersion.decision, 'Approved'),
        sql`${storeVersion.validDuring} @> ${date}::date`,
      ),
    );
  if (link !== undefined && link.siteId !== unit.siteId) {
    return refused('organisation.store-at-another-site', [
      { kind: 'record', recordType: recordTypeOf('store'), recordId: unit.storeId },
    ]);
  }
  if (unit.kind === 'whole-store') {
    const [other] = await context.tx
      .selectDistinct({ id: businessUnit.id })
      .from(businessUnit)
      .innerJoin(
        businessUnitVersion,
        and(eq(businessUnitVersion.businessUnitId, businessUnit.id), eq(businessUnitVersion.decision, 'Approved')),
      )
      .where(
        and(
          eq(businessUnit.storeId, unit.storeId),
          eq(businessUnit.siteId, unit.siteId),
          eq(businessUnit.kind, 'whole-store'),
          unit.id === undefined ? undefined : ne(businessUnit.id, unit.id),
        ),
      )
      .limit(1);
    if (other !== undefined) {
      return refused('organisation.whole-store-unit-exists', [
        { kind: 'record', recordType: recordTypeOf('business_unit'), recordId: other.id },
      ]);
    }
  }
  return undefined;
}

/** A unit's fixed facts, or undefined when there is none. */
export async function unitOf(context: TransactionContext, unitId: string): Promise<Required<UnitFacts> | undefined> {
  const [row] = await context.tx
    .select({
      id: businessUnit.id,
      siteId: businessUnit.siteId,
      kind: businessUnit.kind,
      storeId: businessUnit.storeId,
    })
    .from(businessUnit)
    .where(eq(businessUnit.id, unitId));
  return row;
}

/** A default warehouse is a warehouse unit (3.6; PRD-ORG-013). */
export async function warehouseUnit(context: TransactionContext, unitId: string): Check {
  const unit = await unitOf(context, unitId);
  if (unit !== undefined && unit.kind !== 'warehouse') {
    return refused('organisation.not-a-warehouse', [
      { kind: 'record', recordType: recordTypeOf('business_unit'), recordId: unitId },
    ]);
  }
  return undefined;
}

/** A location's unit is at its Site (3.5; DM-9), and its parent is a location of the same unit. */
export async function locationPlace(
  context: TransactionContext,
  place: { siteId: string; businessUnitId: string },
  parentLocationId: string | undefined,
): Check {
  const unit = await unitOf(context, place.businessUnitId);
  if (unit !== undefined && unit.siteId !== place.siteId) {
    return refused('organisation.location-unit-at-another-site', [
      { kind: 'record', recordType: recordTypeOf('business_unit'), recordId: place.businessUnitId },
    ]);
  }
  if (parentLocationId !== undefined) {
    const [parent] = await context.tx
      .select({ businessUnitId: location.businessUnitId })
      .from(location)
      .where(eq(location.id, parentLocationId));
    if (parent !== undefined && parent.businessUnitId !== place.businessUnitId) {
      return refused('organisation.location-unit-at-another-site', [
        { kind: 'record', recordType: recordTypeOf('location'), recordId: parentLocationId },
      ]);
    }
  }
  return undefined;
}

/** A location's Site and unit, fixed at creation, or undefined when there is none. */
export async function placeOfLocation(
  context: TransactionContext,
  locationId: string,
): Promise<{ siteId: string; businessUnitId: string } | undefined> {
  const [row] = await context.tx
    .select({ siteId: location.siteId, businessUnitId: location.businessUnitId })
    .from(location)
    .where(eq(location.id, locationId));
  return row;
}

/**
 * A location is retired only while no stock is recorded there, asked of `stock` through the location-in-use contract
 * (3.5; module-map section 3, rule 6); while no implementation answers, it is not retired.
 */
export async function retirable(
  context: TransactionContext,
  locationInUse: LocationInUse | undefined,
  locationId: string,
): Check {
  if (locationInUse === undefined) {
    return {
      kind: 'unavailable',
      code: 'organisation.location-in-use-unanswered',
      missing: [{ kind: 'contract', contract: 'organisation.location-in-use' }],
    };
  }
  if (await locationInUse.hasStock(context, locationId)) {
    return refused('organisation.location-holds-stock', [
      { kind: 'record', recordType: recordTypeOf('location'), recordId: locationId },
    ]);
  }
  return undefined;
}

/** The first unit whose approved mapping is out of step with the State rule, by the given filter (3.4; GC2-1). */
export async function unitOutOfStep(
  context: TransactionContext,
  where: { siteId: string } | { taxRegistrationId: string } | { mappingId: string },
): Promise<string | undefined> {
  const filter =
    'siteId' in where
      ? sql`u.site_id = ${where.siteId}::uuid`
      : 'taxRegistrationId' in where
        ? sql`m.tax_registration_id = ${where.taxRegistrationId}::uuid`
        : sql`m.id = ${where.mappingId}::uuid`;
  const result = await context.tx.execute<{ unit: string }>(
    sql`select m.business_unit_id as unit from organisation.business_unit_mapping m
        join organisation.business_unit u on u.id = m.business_unit_id
        where m.decision = 'Approved' and ${filter} and organisation.mapping_out_of_step(m.id)
        limit 1`,
  );
  return result.rows[0]?.unit;
}

/** What a location version would break in the nesting of locations, as `organisation.location_nesting_broken`. */
const nestingRefusals = {
  cycle: 'organisation.location-nesting-cycle',
  children: 'organisation.location-has-children',
  'parent-retired': 'organisation.location-parent-retired',
} as const;

/**
 * The nesting rules of locations over the days given (3.5; S1-F02-T02 review, product owner, 8 Oct 2026): a location
 * never nests under itself through any number of levels on a day; it is not retired while a location nested under it
 * is not; and it does not nest under a parent retired on a day it is in force. Read from the approved versions by the
 * database's own function, which the check at commit uses too (0029).
 */
export async function locationNesting(
  context: TransactionContext,
  version: {
    readonly locationId: string | undefined;
    readonly parentLocationId: string | undefined;
    readonly retired: boolean;
    readonly during: string;
  },
): Check {
  const result = await context.tx.execute<{ broken: keyof typeof nestingRefusals | null }>(
    sql`select organisation.location_nesting_broken(${version.locationId ?? null}::uuid,
          ${version.parentLocationId ?? null}::uuid, ${version.retired}, ${version.during}::daterange) as broken`,
  );
  const broken = result.rows[0]?.broken ?? null;
  if (broken === null) return undefined;
  const named = broken === 'children' ? version.locationId : version.parentLocationId;
  return refused(
    nestingRefusals[broken],
    named === undefined ? [] : [{ kind: 'record', recordType: recordTypeOf('location'), recordId: named }],
  );
}

/**
 * The days a location version starting on the date would have once approved: to the start of the next approved
 * version, or open-ended (structure-and-masters 2.2), as a date range literal.
 */
export async function locationDaysFrom(
  context: TransactionContext,
  locationId: string | undefined,
  start: string,
): Promise<string> {
  if (locationId === undefined) return `[${start},)`;
  const [next] = await context.tx
    .select({ start: sql<string>`lower(${locationVersion.validDuring})::text` })
    .from(locationVersion)
    .where(
      and(
        eq(locationVersion.locationId, locationId),
        eq(locationVersion.decision, 'Approved'),
        sql`lower(${locationVersion.validDuring}) > ${start}::date`,
      ),
    )
    .orderBy(sql`lower(${locationVersion.validDuring})`)
    .limit(1);
  return `[${start},${next?.start ?? ''})`;
}

/**
 * The locations a parent is nested under on any day, the parent included, read from the approved versions. A decision
 * on a location version locks them with its own, shared, so two decisions that would close a loop of nesting
 * together, or retire a parent while a child is nested under it, never pass each other (code-house-rules 8.2).
 */
export async function ancestorsOf(context: TransactionContext, parentLocationId: string): Promise<string[]> {
  const result = await context.tx.execute<{ id: string }>(
    sql`with recursive chain (id) as (
          select ${parentLocationId}::uuid
          union
          select p.parent_location_id from organisation.location_version p join chain on p.location_id = chain.id
          where p.decision = 'Approved' and p.parent_location_id is not null)
        select id from chain`,
  );
  return result.rows.map((row) => row.id);
}
