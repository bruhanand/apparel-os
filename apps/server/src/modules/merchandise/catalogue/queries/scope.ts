import { and, eq, inArray, sql } from 'drizzle-orm';
import type { TransactionContext } from '../../../../kernel/index.js';
import type { ScopeMember, ScopeMembers } from '../../../access/index.js';
import { brandVersion } from '../db/schema.js';

// `merchandise`'s side of the scope contract `access` defines (module-map section 3, rule 6, and 4.12;
// access-and-approvals 5.1; S1-F03-T01): Check scope membership for brands. A brand is no place, so it expands to
// nothing and the contract's Expand is left out. The answer does not depend on what the caller's actor may see: the
// catalogue's tables carry no row-level security (structure-and-masters 6.2).

/**
 * Check scope membership for brands: of the brands an assignment names, those that do not exist, or have no approved
 * version in force that does not retire them on any day of the assignment's dates `[validFrom, validTo)`, so an
 * unknown or retired brand is refused (access-and-approvals 5.1; structure-and-masters 2.5).
 */
async function notFound(
  context: TransactionContext,
  members: readonly ScopeMember[],
  dates: { readonly validFrom: string; readonly validTo?: string | undefined },
): Promise<ScopeMember[]> {
  const asked = members.filter((member) => member.type === 'brand');
  if (asked.length === 0) return [];
  const range = `[${dates.validFrom},${dates.validTo ?? ''})`;
  const found = await context.tx
    .selectDistinct({ id: brandVersion.brandId })
    .from(brandVersion)
    .where(
      and(
        inArray(
          brandVersion.brandId,
          asked.map((member) => member.id),
        ),
        eq(brandVersion.decision, 'Approved'),
        eq(brandVersion.retired, false),
        sql`${brandVersion.validDuring} && ${range}::daterange`,
      ),
    );
  const ids = new Set(found.map((row) => row.id));
  return asked.filter((member) => !ids.has(member.id));
}

/** `merchandise`'s implementation of the scope contract, for brands (module-map 4.12). */
export const catalogueScopeMembers: ScopeMembers = { answers: ['brand'], notFound };
