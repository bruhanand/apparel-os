import type { BusinessUnitKind } from '@apparel-os/schemas';
import { and, eq, inArray, sql } from 'drizzle-orm';
import type { TransactionContext } from '../../../kernel/index.js';
import { exists, inForceOn } from '../commands/common.js';
import { businessUnit, location, locationVersion, site } from '../db/schema.js';
import { mappingOn } from './records.js';

// What another module reads of a business unit through `organisation`'s interface (module-map 4.11, section 3;
// structure-and-masters 3.3): `merchandise` keeps a unit's brand coverage and checks the unit's kind here
// (S1-F03-T01). Only organisation reads its tables (PRD-MOD-002).

/** A business unit's code and kind, fixed at creation (structure-and-masters 3.1, 3.3). */
export interface BusinessUnitHead {
  readonly id: string;
  readonly code: string;
  readonly kind: BusinessUnitKind;
}

/** The units named, by identifier; one that does not exist is left out. */
export async function businessUnitHeads(
  context: TransactionContext,
  unitIds: readonly string[],
): Promise<ReadonlyMap<string, BusinessUnitHead>> {
  if (unitIds.length === 0) return new Map();
  const rows = await context.tx
    .select({ id: businessUnit.id, code: businessUnit.code, kind: businessUnit.kind })
    .from(businessUnit)
    .where(inArray(businessUnit.id, [...unitIds]));
  return new Map(rows.map((row) => [row.id, row]));
}

/** Whether a unit has an approved version in force on a date (structure-and-masters 2.2). */
export function businessUnitInForce(context: TransactionContext, unitId: string, date: string): Promise<boolean> {
  return inForceOn(context, 'business_unit', unitId, date);
}

/**
 * Answer readiness checks (module-map 4.11; structure-and-masters 3.7, 3.8; PRD-LIF-002, POL-10.08; S1-F04-T02): a
 * unit's kind and place, whether its mapping is in force and verified on the date, and how many of its locations are
 * in force and not retired then. Undefined for a unit that does not exist. `site-lifecycle` asks it.
 */
export interface UnitReadinessAnswer {
  readonly businessUnitId: string;
  readonly kind: BusinessUnitKind;
  readonly siteId: string;
  readonly storeId: string | null;
  readonly mapping:
    | { readonly state: 'none' }
    | { readonly state: 'unverified' | 'verified'; readonly mappingVersionId: string; readonly legalEntityId: string };
  readonly locationsInForce: number;
}

export async function unitReadiness(
  context: TransactionContext,
  unitId: string,
  date: string,
): Promise<UnitReadinessAnswer | undefined> {
  const [unit] = await context.tx
    .select({
      id: businessUnit.id,
      kind: businessUnit.kind,
      siteId: businessUnit.siteId,
      storeId: businessUnit.storeId,
    })
    .from(businessUnit)
    .where(eq(businessUnit.id, unitId));
  if (unit === undefined) return undefined;
  const mapping = await mappingOn(context, unitId, date);
  const [counted] = await context.tx
    .select({ count: sql<number>`count(*)::int` })
    .from(location)
    .innerJoin(locationVersion, eq(locationVersion.locationId, location.id))
    .where(
      and(
        eq(location.businessUnitId, unitId),
        eq(locationVersion.decision, 'Approved'),
        eq(locationVersion.retired, false),
        sql`${locationVersion.validDuring} @> ${date}::date`,
      ),
    );
  return {
    businessUnitId: unit.id,
    kind: unit.kind,
    siteId: unit.siteId,
    storeId: unit.storeId,
    mapping:
      mapping === undefined
        ? { state: 'none' }
        : {
            state: mapping.verification === undefined ? 'unverified' : 'verified',
            mappingVersionId: mapping.mappingVersionId,
            legalEntityId: mapping.legalEntityId,
          },
    locationsInForce: counted?.count ?? 0,
  };
}

/** Whether a Site exists, for its shared readiness (module-map 4.16; PRD-LIF-001). */
export async function siteExists(context: TransactionContext, siteId: string): Promise<boolean> {
  const [row] = await context.tx.select({ id: site.id }).from(site).where(eq(site.id, siteId));
  return row !== undefined;
}

/**
 * Every location of a unit, retired or not, for asking the stock ledger whether it holds stock at the unit through the
 * location-in-use contract (structure-and-masters 3.5; PRD-LIF-003; RR-483).
 */
/**
 * Whether an accounting book exists, for `finance` · books, which keeps each book's settings and chart by the book's
 * identifier (books-and-posting 2.1, 13; structure-and-masters 2.5; S1-F09-T01).
 */
export function accountingBookExists(context: TransactionContext, bookId: string): Promise<boolean> {
  return exists(context, 'accounting_book', bookId);
}

export async function unitLocationIds(context: TransactionContext, unitId: string): Promise<string[]> {
  const rows = await context.tx
    .select({ id: location.id })
    .from(location)
    .where(eq(location.businessUnitId, unitId))
    .orderBy(location.id);
  return rows.map((row) => row.id);
}
