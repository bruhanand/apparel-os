import type { BusinessUnitKind } from '@apparel-os/schemas';
import { inArray } from 'drizzle-orm';
import type { TransactionContext } from '../../../kernel/index.js';
import { inForceOn } from '../commands/common.js';
import { businessUnit } from '../db/schema.js';

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
