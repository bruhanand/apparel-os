import type { CodeMapping, CodeScope, ExternalCodeKind, ProductProposal } from '@apparel-os/schemas';
import { desc, eq, inArray, sql } from 'drizzle-orm';
import type { TransactionContext } from '../../../../kernel/index.js';
import { productProposal, sku } from '../db/schema.js';
import type { PageRequest, RequestReader } from './records.js';

// Product proposals and code mappings, a page at a time (structure-and-masters 4.2, 4.3, 8; code-house-rules 12.1;
// S1-F03-T02).

/** A technical cap the builders set (code-house-rules 12.1), the same as the structure's. */
const PAGE_CAP = 100;

async function proposalViews(
  context: TransactionContext,
  rows: readonly (typeof productProposal.$inferSelect)[],
  requests: RequestReader,
): Promise<ProductProposal[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((row) => row.id);
  const made = await context.tx
    .select({ id: sku.id, code: sku.code, proposalId: sku.proposalId })
    .from(sku)
    .where(inArray(sku.proposalId, ids));
  const latest = await requests(ids);
  return rows.map((row) => {
    const stored = row.proposal;
    const skuIds = stored.skus.flatMap(
      (proposed) => made.find((each) => each.proposalId === row.id && each.code === proposed.code)?.id ?? [],
    );
    const request = latest.get(row.id);
    return {
      id: row.id,
      ...(stored.style === undefined ? {} : { style: stored.style }),
      ...(row.styleId === null ? {} : { styleId: row.styleId }),
      skus: [...stored.skus],
      ...(row.sourceWords === null ? {} : { sourceWords: row.sourceWords }),
      state: row.state,
      proposedByUserId: row.proposedByUserId,
      proposedAt: row.recordedAt.toISOString(),
      ...(row.decidedAt === null ? {} : { decidedAt: row.decidedAt.toISOString() }),
      skuIds,
      ...(request === undefined ? {} : { request: { id: request.id, state: request.state } }),
    };
  });
}

/** A page of the product proposals, newest first (4.2). */
export async function productProposalPage(
  context: TransactionContext,
  page: PageRequest,
  requests: RequestReader,
): Promise<{ readonly records: ProductProposal[]; readonly next: string | null }> {
  const limit = Math.min(page.limit ?? PAGE_CAP, PAGE_CAP);
  const rows = await context.tx
    .select()
    .from(productProposal)
    .where(page.after === undefined ? undefined : sql`${productProposal.id} < ${page.after}::uuid`)
    .orderBy(desc(productProposal.id))
    .limit(limit + 1);
  const shown = rows.slice(0, limit);
  return {
    records: await proposalViews(context, shown, requests),
    next: rows.length > limit ? (shown.at(-1)?.id ?? null) : null,
  };
}

/** One product proposal, or undefined. */
export async function productProposalRecord(
  context: TransactionContext,
  proposalId: string,
  requests: RequestReader,
): Promise<ProductProposal | undefined> {
  const rows = await context.tx.select().from(productProposal).where(eq(productProposal.id, proposalId));
  const [view] = await proposalViews(context, rows, requests);
  return view;
}

/** A page of the code mappings, of one SKU where named, in code order then identifier (4.3). */
export async function codeMappingPage(
  context: TransactionContext,
  query: PageRequest & { readonly skuId?: string | undefined },
): Promise<{ readonly records: CodeMapping[]; readonly next: string | null }> {
  const limit = Math.min(query.limit ?? PAGE_CAP, PAGE_CAP);
  const result = await context.tx.execute<{
    id: string;
    code: string;
    kind: ExternalCodeKind;
    scope_kind: CodeScope['kind'];
    scope_party_id: string | null;
    scope_brand_id: string | null;
    sku_id: string;
    pack_id: string | null;
    alias: boolean;
    start: string;
    end: string | null;
  }>(sql`
    select c.id::text as id, k.code, k.kind, c.scope_kind, c.scope_party_id::text as scope_party_id,
           c.scope_brand_id::text as scope_brand_id, c.sku_id::text as sku_id, c.pack_id::text as pack_id, c.alias,
           lower(c.valid_during)::text as start, upper(c.valid_during)::text as end
    from merchandise.external_code c join merchandise.external_code_key k on k.id = c.code_key_id
    where (${query.skuId ?? null}::uuid is null or c.sku_id = ${query.skuId ?? null}::uuid)
      and (${query.after ?? null}::uuid is null
           or (k.code, c.id) > (select k2.code, c2.id from merchandise.external_code c2
                                join merchandise.external_code_key k2 on k2.id = c2.code_key_id
                                where c2.id = ${query.after ?? null}::uuid))
    order by k.code, c.id
    limit ${limit + 1}`);
  const shown = result.rows.slice(0, limit);
  return {
    records: shown.map((row) => ({
      id: row.id,
      code: row.code,
      kind: row.kind,
      scope:
        row.scope_kind === 'supplier'
          ? { kind: 'supplier', partyId: row.scope_party_id ?? '' }
          : row.scope_kind === 'brand'
            ? { kind: 'brand', brandId: row.scope_brand_id ?? '' }
            : { kind: 'organisation' },
      skuId: row.sku_id,
      ...(row.pack_id === null ? {} : { packId: row.pack_id }),
      alias: row.alias,
      validFrom: row.start,
      ...(row.end === null ? {} : { validTo: row.end }),
    })),
    next: result.rows.length > limit ? (shown.at(-1)?.id ?? null) : null,
  };
}
