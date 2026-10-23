import type { CodeResolved, ResolveCodeQuery } from '@apparel-os/schemas';
import { and, asc, eq, or, sql } from 'drizzle-orm';
import type { CommandRefusal, TransactionContext } from '../../../../kernel/index.js';
import { externalCode, externalCodeKey } from '../db/schema.js';
import { mayRepeat } from '../domain/codes.js';

// The resolution of an external code to the products it names (structure-and-masters 4.3, 4.7; PRD-MER-006 to
// PRD-MER-008; S1-F03-T02), a read, apart from the commands that map and end codes (code-house-rules 2; code review 8
// of stage 2). Read under the reader's actor.

/**
 * Resolve a code (4.7; PRD-MER-006, PRD-MER-007): the mappings of the code and kind in force on the date whose scope is
 * the Organisation, or the supplier given, or the brand given; with no brand given, every brand's, since a PT barcode is
 * recorded under its product's brand and a caller that knows no brand, such as the earlier POS's reference handler,
 * must still find it (RR-554). Active mappings first: one target answers it. A barcode recorded under a brand (the
 * brand given, or any where none is) that names more than one SKU answers every candidate, one for each SKU in mapping
 * order, flagged as repeated, so the person chooses and nothing is chosen silently (DEC-135); a mapping in another scope
 * that names one of them adds no choice (RR-554). One SKU in two units, or more than one SKU where any is not named
 * under a brand, is ambiguous and refused. With no active match, historical aliases the same way. None matching is not
 * found. **Design choice:** an alias answers only where no active mapping does, so an old label still finds its SKU.
 */
export async function resolveCode(
  context: TransactionContext,
  query: ResolveCodeQuery,
): Promise<{ readonly resolved: CodeResolved } | { readonly refusal: CommandRefusal }> {
  const rows = await context.tx
    .select({
      id: externalCode.id,
      skuId: externalCode.skuId,
      packId: externalCode.packId,
      alias: externalCode.alias,
      target: externalCode.target,
      scopeKind: externalCode.scopeKind,
    })
    .from(externalCode)
    .innerJoin(externalCodeKey, eq(externalCodeKey.id, externalCode.codeKeyId))
    .where(
      and(
        eq(externalCodeKey.code, query.code),
        eq(externalCodeKey.kind, query.kind),
        sql`${externalCode.validDuring} @> ${query.date}::date`,
        or(
          eq(externalCode.scopeKind, 'organisation'),
          query.supplierId === undefined
            ? undefined
            : and(eq(externalCode.scopeKind, 'supplier'), eq(externalCode.scopePartyId, query.supplierId)),
          query.brandId === undefined
            ? eq(externalCode.scopeKind, 'brand')
            : and(eq(externalCode.scopeKind, 'brand'), eq(externalCode.scopeBrandId, query.brandId)),
        ),
      ),
    )
    .orderBy(asc(externalCode.id));
  for (const alias of [false, true]) {
    const matches = rows.filter((row) => row.alias === alias);
    if (matches.length === 0) continue;
    const ambiguous = {
      refusal: {
        kind: 'refused',
        code: 'merchandise.code-ambiguous',
        missing: matches.map((row) => ({
          kind: 'record',
          recordType: 'merchandise.external_code',
          recordId: row.id,
        })),
      },
    } as const;
    // The first mapping of each SKU, in mapping order; a second unit of one SKU no choice of product could settle.
    const bySku = new Map<string, (typeof matches)[number]>();
    for (const row of matches) {
      const held = bySku.get(row.skuId);
      if (held === undefined) bySku.set(row.skuId, row);
      else if (held.target !== row.target) return ambiguous;
    }
    // Only a barcode recorded under a brand may name more than one SKU: each SKU must be one a brand's mapping matched
    // names, the brand given's, or any brand's where none is given (PRD-MER-007, DEC-135; RR-554).
    if (bySku.size > 1) {
      const underBrand = new Set(matches.filter((row) => mayRepeat(query.kind, row.scopeKind)).map((row) => row.skuId));
      if ([...bySku.keys()].some((skuId) => !underBrand.has(skuId))) return ambiguous;
    }
    const candidates = [...bySku.values()].map((row) => ({
      skuId: row.skuId,
      ...(row.packId === null ? {} : { packId: row.packId }),
      mappingId: row.id,
    }));
    const [only] = candidates;
    return {
      resolved: {
        candidates,
        repeated: candidates.length > 1,
        alias,
        // The one candidate at the top level too, for the clients of the earlier deploy (code-house-rules 12.1
        // "Compatible changes"); removed in a later deploy (open-items section 4).
        ...(candidates.length === 1 && only !== undefined ? only : {}),
      },
    };
  }
  return { refusal: { kind: 'not-found', code: 'merchandise.code-not-found', missing: [] } };
}
