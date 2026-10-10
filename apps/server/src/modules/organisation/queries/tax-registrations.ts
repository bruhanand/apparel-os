import { inArray } from 'drizzle-orm';
import type { TransactionContext } from '../../../kernel/index.js';
import { taxRegistration } from '../db/schema.js';

// What `finance` · tax rules reads of a tax registration through `organisation`'s interface (module-map 4.11, 4.14;
// shared-calculations 10.1): its code, which the registration applicability names. Only organisation reads its tables
// (PRD-MOD-002).

/** The codes of the tax registrations named, by identifier; one that does not exist is left out. */
export async function taxRegistrationCodes(
  context: TransactionContext,
  registrationIds: readonly string[],
): Promise<ReadonlyMap<string, string>> {
  if (registrationIds.length === 0) return new Map();
  const rows = await context.tx
    .select({ id: taxRegistration.id, code: taxRegistration.code })
    .from(taxRegistration)
    .where(inArray(taxRegistration.id, [...registrationIds]));
  return new Map(rows.map((row) => [row.id, row.code]));
}
