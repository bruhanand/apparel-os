import { sql, type SQL } from 'drizzle-orm';
import { CommandDefect, declareReadModel, serveReadModel, type TransactionContext } from '../../../../kernel/index.js';
import { totalOf, type PositionQuantities } from '../domain/positions.js';
import type { Condition } from '../domain/request.js';
import {
  brandOf,
  filtersOf,
  IN_CUSTODY,
  matchingBalances,
  productKey,
  productOf,
  type DetailRow,
  type PositionFilters,
  type PositionProduct,
} from './positions.js';

// The ledger's read model of the stage 2 stock report (goods-in 9.3, 9.5; stock-ledger 13.6, 13.22, 13.23;
// module-map section 3 rule 5; PRD-PRO-001, PRD-ORG-014, PRD-ORG-015; S2-F11-T02), served through the kernel's
// read-model gateway: the stock in custody of products at locations, as stock search reads it (13.22), split further
// by condition and by owner, with the quantities of stock search apart (one arithmetic, `quantitiesOf`), each
// balance's pieces and receipt origin for the MRP and the cost its caller reads, and the source of each origin's first
// receipt count, the record its pieces were counted on (the drill-down). Takes no lock and runs in the reader's
// transaction under the reader's actor, so row-level security keeps out what the reader may not see (14.3).

/** Who owns goods, from the origin's state (14.2; DEC-141): Unknown until recorded (PRD-MOD-015). */
export type HoldingOwner =
  | { readonly kind: 'organisation'; readonly legalEntityId: string }
  | { readonly kind: 'supplier'; readonly partyId: string }
  | { readonly kind: 'brand'; readonly brandId: string }
  | { readonly kind: 'unknown' };

/** Where a row sits in the read's order. A page starts after one (code-house-rules 12.1 "Reads": a cursor). */
export interface HoldingKey {
  readonly siteId: string;
  readonly businessUnitId: string;
  readonly locationId: string;
  readonly productKey: string;
  readonly condition: string;
  readonly ownerKey: string;
  readonly legalEntityId: string;
}

export interface HoldingsQuery extends Omit<PositionFilters, 'products'> {
  readonly after?: HoldingKey;
  /** The most rows the page holds; the caller caps it. */
  readonly limit: number;
}

/** A balance of a row, with its pieces and receipt origin, for its MRP and cost. */
export interface HoldingBalance {
  readonly balanceId: string;
  readonly receiptOriginId: string;
  readonly quantity: number;
}

/** A record a receipt origin's first receipt count names (stock-ledger 2.1, 13.2). */
export interface HoldingSource {
  readonly module: string;
  readonly recordType: string;
  readonly recordId: string;
}

/** One row: a product at a place, in a condition, of an owner, with its quantities apart (goods-in 9.3). */
export interface Holding extends PositionQuantities {
  readonly key: HoldingKey;
  readonly product: PositionProduct;
  readonly brandId: string;
  readonly storeId: string | null;
  readonly condition: Condition;
  readonly owner: HoldingOwner;
  readonly frozen: boolean;
  readonly balances: readonly HoldingBalance[];
  readonly sources: readonly HoldingSource[];
}

/** The owner's key, opaque text that orders and compares in SQL, over an origin's state `s`: its kind and party. */
const ownerKey = sql`jsonb_build_array(coalesce(s.owner_kind, 'unknown'), case s.owner_kind
  when 'organisation' then s.owner_legal_entity_id when 'supplier' then s.owner_party_id
  when 'brand' then s.owner_brand_id end)::text`;

/** The owner of a balance as the parts of its key: its kind and party, as `ownerKey` builds them. */
function ownerPartsOf(row: DetailRow): readonly [string, string | null] {
  switch (row.owner_kind) {
    case 'organisation':
      return ['organisation', row.owner_legal_entity_id];
    case 'supplier':
      return ['supplier', row.owner_party_id];
    case 'brand':
      return ['brand', row.owner_brand_id];
    default:
      return ['unknown', null];
  }
}

/** The owner a balance's origin records; a kind recorded without its party is a defect (14.2). */
function ownerOf(row: DetailRow): HoldingOwner {
  if (row.owner_kind === null) return { kind: 'unknown' };
  if (row.owner_kind === 'organisation' && row.owner_legal_entity_id !== null) {
    return { kind: 'organisation', legalEntityId: row.owner_legal_entity_id };
  }
  if (row.owner_kind === 'supplier' && row.owner_party_id !== null) {
    return { kind: 'supplier', partyId: row.owner_party_id };
  }
  if (row.owner_kind === 'brand' && row.owner_brand_id !== null) return { kind: 'brand', brandId: row.owner_brand_id };
  throw new CommandDefect(`An origin's owner names no party: ${row.receipt_origin_id}`);
}

/** The source of each origin's first receipt count, following the origins it was split from (13.14, 13.19). */
async function rootSources(
  context: TransactionContext,
  originIds: readonly string[],
): Promise<Map<string, HoldingSource>> {
  if (originIds.length === 0) return new Map();
  const result = await context.tx.execute<{
    start_id: string;
    source_module: string;
    source_record_type: string;
    source_record_id: string;
  }>(sql`
    with recursive up (start_id, id, parent_id, source_module, source_record_type, source_record_id) as (
      select o.id, o.id, o.parent_origin_id, o.source_module, o.source_record_type, o.source_record_id
        from stock.receipt_origin o where o.id = any(${sql.param([...new Set(originIds)])}::uuid[])
      union all
      select up.start_id, p.id, p.parent_origin_id, p.source_module, p.source_record_type, p.source_record_id
        from stock.receipt_origin p join up on p.id = up.parent_id
    )
    select start_id::text as start_id, source_module, source_record_type, source_record_id::text as source_record_id
    from up where parent_id is null`);
  return new Map(
    result.rows.map((row) => [
      row.start_id,
      { module: row.source_module, recordType: row.source_record_type, recordId: row.source_record_id },
    ]),
  );
}

/**
 * Stock by product, size, location, condition and owner (goods-in 9.3; PRD-PRO-001): each row a product at a location
 * in one condition of one owner, with its quantities apart, a page at a time in the order of place, product,
 * condition and owner, starting after `after`.
 */
export async function stockHoldings(
  context: TransactionContext,
  query: HoldingsQuery,
): Promise<{ readonly holdings: readonly Holding[]; readonly next: HoldingKey | null }> {
  const filters: SQL[] = filtersOf(query);
  const where = sql.join([IN_CUSTODY, ...filters], sql` and `);
  const after =
    query.after === undefined
      ? sql`true`
      : sql`(p.site_id, p.business_unit_id, p.location_id, p.product_key, p.condition, p.owner_key, p.legal_entity_id) >
            (${query.after.siteId}::uuid, ${query.after.businessUnitId}::uuid, ${query.after.locationId}::uuid,
             ${query.after.productKey}::text, ${query.after.condition}::text, ${query.after.ownerKey}::text,
             ${query.after.legalEntityId}::uuid)`;
  const page = await context.tx.execute<{
    site_id: string;
    business_unit_id: string;
    location_id: string;
    product_key: string;
    condition: string;
    owner_key: string;
    legal_entity_id: string;
  }>(sql`
    select distinct p.site_id, p.business_unit_id, p.location_id, p.product_key, p.condition, p.owner_key,
           p.legal_entity_id
    from (select b.site_id, b.business_unit_id, b.location_id, b.legal_entity_id, b.condition,
                 ${productKey} as product_key, ${ownerKey} as owner_key
            from stock.balance b join stock.receipt_origin o on o.id = b.receipt_origin_id
            left join stock.receipt_origin_state s on s.receipt_origin_id = b.receipt_origin_id
           where ${where}) p
    where ${after}
    order by p.site_id, p.business_unit_id, p.location_id, p.product_key, p.condition, p.owner_key, p.legal_entity_id
    limit ${query.limit + 1}`);
  const keys = page.rows.slice(0, query.limit).map((row): HoldingKey => ({
    siteId: row.site_id,
    businessUnitId: row.business_unit_id,
    locationId: row.location_id,
    productKey: row.product_key,
    condition: row.condition,
    ownerKey: row.owner_key,
    legalEntityId: row.legal_entity_id,
  }));
  if (keys.length === 0) return { holdings: [], next: null };
  const inPage = sql`(b.site_id, b.business_unit_id, b.location_id, ${productKey}, b.condition, ${ownerKey},
    b.legal_entity_id) in (
    select * from unnest(${sql.param(keys.map((key) => key.siteId))}::uuid[],
                         ${sql.param(keys.map((key) => key.businessUnitId))}::uuid[],
                         ${sql.param(keys.map((key) => key.locationId))}::uuid[],
                         ${sql.param(keys.map((key) => key.productKey))}::text[],
                         ${sql.param(keys.map((key) => key.condition))}::text[],
                         ${sql.param(keys.map((key) => key.ownerKey))}::text[],
                         ${sql.param(keys.map((key) => key.legalEntityId))}::uuid[]))`;
  const details = await matchingBalances(context, sql.join([...filters, inPage], sql` and `));
  const sources = await rootSources(context, [...new Set(details.map((each) => each.row.receipt_origin_id))]);
  // A row's balances, grouped by the parts of its key read back as values, never by comparing SQL's text with
  // JavaScript's: the product key is SQL's own text, the owner's key its kind and party (`ownerKey`).
  const canonical = (parts: readonly unknown[]) => JSON.stringify(parts);
  const groups = new Map<string, (typeof details)[number][]>();
  for (const each of details) {
    const { row } = each;
    const text = canonical([
      row.site_id,
      row.business_unit_id,
      row.location_id,
      row.product_key,
      row.condition,
      ...ownerPartsOf(row),
      row.legal_entity_id,
    ]);
    groups.set(text, [...(groups.get(text) ?? []), each]);
  }
  const holdings = keys.map((key): Holding => {
    const parsed: unknown = JSON.parse(key.ownerKey);
    if (!Array.isArray(parsed)) throw new CommandDefect(`An owner key that is no array: ${key.ownerKey}`);
    const owner = parsed as readonly unknown[];
    const members = groups.get(
      canonical([
        key.siteId,
        key.businessUnitId,
        key.locationId,
        key.productKey,
        key.condition,
        ...owner,
        key.legalEntityId,
      ]),
    );
    const first = members?.[0];
    if (members === undefined || first === undefined) throw new CommandDefect('A row of the page has no balance');
    const seen = new Set<string>();
    const rowSources: HoldingSource[] = [];
    for (const each of members) {
      const source = sources.get(each.row.receipt_origin_id);
      if (source === undefined) continue;
      const text = `${source.module}|${source.recordType}|${source.recordId}`;
      if (seen.has(text)) continue;
      seen.add(text);
      rowSources.push(source);
    }
    return {
      key,
      product: productOf(members.map((each) => each.row)),
      brandId: brandOf(first.row),
      storeId: first.row.store_id,
      condition: first.row.condition,
      owner: ownerOf(first.row),
      frozen: members.some((each) => each.frozen),
      balances: members.map((each) => ({
        balanceId: each.row.id,
        receiptOriginId: each.row.receipt_origin_id,
        quantity: each.row.quantity,
      })),
      sources: rowSources,
      ...totalOf(members.map((each) => each.quantities)),
    };
  });
  return { holdings, next: page.rows.length > query.limit ? (keys.at(-1) ?? null) : null };
}

/** The read model of the stock report, declared for the read-model gateway (module-map section 3, rule 5). */
export const STOCK_HOLDINGS = declareReadModel<HoldingsQuery, Awaited<ReturnType<typeof stockHoldings>>>(
  'stock.holdings',
);

/** The ledger's read models of the stage 2 reports as it serves them, handed to the gateway by the composition root. */
export const stockReportReadModels = [serveReadModel(STOCK_HOLDINGS, stockHoldings)];
