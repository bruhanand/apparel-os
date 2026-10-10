import { and, eq, sql } from 'drizzle-orm';
import type { TransactionContext } from '../../../../kernel/index.js';
import { exists, inForceOn } from '../commands/common.js';
import { businessUnitBrand, businessUnitBrandMember } from '../db/schema.js';

/** Whether the brand exists (structure-and-masters 4.1). */
export function brandExists(context: TransactionContext, brandId: string): Promise<boolean> {
  return exists(context, 'brand', brandId);
}

/** Whether the brand has an approved version in force on the date that does not retire it (2.2, 2.5). */
export function brandInForce(context: TransactionContext, brandId: string, date: string): Promise<boolean> {
  return inForceOn(context, 'brand', brandId, date);
}

/**
 * The brands a business unit's coverage holds in force on a date, each in force and not retired then
 * (structure-and-masters 3.3 as built; PRD-ORG-006): for the brand-coverage readiness check, which refuses activating a
 * brand-counter unit that has none (product owner, 10 Oct 2026; S1-F04-T02).
 */
export async function unitBrandsOn(context: TransactionContext, unitId: string, date: string): Promise<string[]> {
  const rows = await context.tx
    .select({ brandId: businessUnitBrandMember.brandId })
    .from(businessUnitBrand)
    .innerJoin(businessUnitBrandMember, eq(businessUnitBrandMember.businessUnitBrandId, businessUnitBrand.id))
    .where(
      and(
        eq(businessUnitBrand.businessUnitId, unitId),
        eq(businessUnitBrand.decision, 'Approved'),
        sql`${businessUnitBrand.validDuring} @> ${date}::date`,
      ),
    );
  const inForce: string[] = [];
  for (const row of rows) if (await brandInForce(context, row.brandId, date)) inForce.push(row.brandId);
  return inForce.sort();
}
