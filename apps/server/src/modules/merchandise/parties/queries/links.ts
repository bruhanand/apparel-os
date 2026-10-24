import { and, eq, sql } from 'drizzle-orm';
import type { TransactionContext } from '../../../../kernel/index.js';
import { holdsRoleOn } from '../commands/lines.js';
import { brandSupplierLink, brandSupplierLinkVersion } from '../db/schema.js';

/**
 * Whether a supplier is linked to a brand on a date (structure-and-masters 5.1; PRD-MER-021; module-map 4.12 "Read a
 * party"): an approved link version in force on the date says linked, and the party holds the supplier role then,
 * since a later change of its roles does not end a link already recorded. `receiving` asks it of an Arrival's
 * supplier and brand on the arrival date (goods-in 4.2; S2-F02-T02).
 */
export async function brandSupplierLinkedOn(
  context: TransactionContext,
  brandId: string,
  partyId: string,
  date: string,
): Promise<boolean> {
  const [linked] = await context.tx
    .select({ linked: brandSupplierLinkVersion.linked })
    .from(brandSupplierLinkVersion)
    .innerJoin(brandSupplierLink, eq(brandSupplierLink.id, brandSupplierLinkVersion.linkId))
    .where(
      and(
        eq(brandSupplierLink.brandId, brandId),
        eq(brandSupplierLink.partyId, partyId),
        eq(brandSupplierLinkVersion.decision, 'Approved'),
        sql`${brandSupplierLinkVersion.validDuring} @> ${date}::date`,
      ),
    )
    .limit(1);
  return linked?.linked === true && (await holdsRoleOn(context, partyId, 'supplier', date));
}
