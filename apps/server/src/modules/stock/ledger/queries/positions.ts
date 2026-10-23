import { known, paise, unknownValue, type MaybeKnown, type Paise } from '@apparel-os/domain';
import { sql, type SQL } from 'drizzle-orm';
import {
  CommandDefect,
  containsPattern,
  declareReadModel,
  serveReadModel,
  type TransactionContext,
} from '../../../../kernel/index.js';
import { recheckHidden, type FreezeTouch } from '../db/recheck-hidden.js';
import {
  quantitiesOf,
  totalOf,
  type HeldByKind,
  type PositionBalance,
  type PositionQuantities,
} from '../domain/positions.js';
import type { Condition, PlacedHoldKind } from '../domain/request.js';

// The ledger's read models of stock search (goods-in 9.2, 9.4; stock-ledger 13.6, 13.22; module-map section 3 rule 5;
// PRD-STK-001, PRD-STK-006, PRD-MOD-003; S2-F11-T01), served through the kernel's read-model gateway: the stock of
// products at places, a page at a time, with their quantities apart; the same products' stock at each business unit;
// and the cost of the balances a reader may see cost of. Each takes no lock and runs in the reader's transaction under
// the reader's actor, so row-level security keeps out what the reader may not see (PRD-SEC-005; 14.3); the gateway
// answers the time it was read. A count freeze is marked whatever freeze covers the goods, through the narrowly
// authorised `stock.recheck_hidden` (DEC-117), as the Availability read marks it.

/**
 * Where a result sits in the read's order: its place, its product's key and the legal entity of its balances. A page
 * starts after one (code-house-rules 12.1 "Reads": a cursor).
 */
export interface PositionKey {
  readonly siteId: string;
  readonly businessUnitId: string;
  readonly locationId: string;
  readonly productKey: string;
  readonly legalEntityId: string;
}

/** Which goods a read takes, every filter together (goods-in 9.2; PRD-STK-006). */
export interface PositionFilters {
  /**
   * The products to read: these SKUs, and goods of a product not yet set up whose counted style code holds `text` as a
   * part of it and whose counted size is `size`, ignoring case, when `counted` is given; none: every product.
   */
  readonly products?: {
    readonly skuIds: readonly string[];
    readonly counted?: { readonly text?: string; readonly size?: string };
  };
  readonly brandId?: string;
  readonly siteId?: string;
  readonly businessUnitId?: string;
  readonly locationId?: string;
  readonly condition?: Condition;
}

export interface PositionsQuery extends PositionFilters {
  readonly after?: PositionKey;
  /** The most results the page holds; the caller caps it. */
  readonly limit: number;
}

/**
 * The goods of a result: a product by its SKU; goods of a product not yet set up by their style code, colour and size
 * as counted, the first counted of those that share them (13.14); or unidentified goods (13.16).
 */
export type PositionProduct =
  | { readonly kind: 'sku'; readonly skuId: string }
  | {
      readonly kind: 'counted';
      readonly styleCode: string;
      readonly colour: string | null;
      readonly size: string | null;
    }
  | { readonly kind: 'unidentified' };

/** One result: a product at a place, with its quantities apart and the balances they are of (goods-in 9.2). */
export interface Position extends PositionQuantities {
  readonly key: PositionKey;
  readonly product: PositionProduct;
  /** The SKU's brand, or the brand goods of Unknown SKU were counted under (14.1; RR-555). */
  readonly brandId: string;
  readonly storeId: string | null;
  readonly frozen: boolean;
  readonly balanceIds: readonly string[];
}

/** The same products at one business unit, summed over its locations (goods-in 9.2; PRD-STK-006). */
export interface UnitPosition extends PositionQuantities {
  readonly productKey: string;
  readonly siteId: string;
  readonly storeId: string | null;
  readonly businessUnitId: string;
  readonly legalEntityId: string;
  readonly brandId: string;
  readonly frozen: boolean;
}

export interface UnitPositionsQuery {
  readonly productKeys: readonly string[];
  readonly brandId?: string;
  readonly condition?: Condition;
  /** The place the search names, whose units are left out: a Site, or a business unit. */
  readonly outside:
    { readonly kind: 'site'; readonly siteId: string } | { readonly kind: 'unit'; readonly businessUnitId: string };
}

/** The cost of one balance's pieces, at its origin's `P RATE` (goods-in 9.4); Unknown while not established. */
export interface BalanceCost {
  readonly balanceId: string;
  readonly cost: MaybeKnown<Paise>;
}

/** The product key of a balance, opaque text that orders and compares in SQL: a SKU, or goods as counted. */
const productKey = sql`case when b.sku_id is not null then jsonb_build_array('sku', b.sku_id)::text
  else jsonb_build_array('counted', b.brand_id, upper(btrim(o.described_style_code)),
    upper(btrim(o.described_colour)), o.described_size)::text end`;

/** The filters of a read, as SQL over a balance `b` and its origin `o` (goods-in 9.2). */
function filtersOf(filters: PositionFilters): SQL[] {
  const where: SQL[] = [];
  if (filters.products !== undefined) {
    const { skuIds, counted } = filters.products;
    const ofSkus = sql`b.sku_id = any(${sql.param([...skuIds])}::uuid[])`;
    if (counted === undefined) {
      where.push(ofSkus);
    } else {
      const parts: SQL[] = [sql`b.sku_id is null`, sql`o.described_style_code is not null`];
      if (counted.text !== undefined) parts.push(sql`o.described_style_code ilike ${containsPattern(counted.text)}`);
      if (counted.size !== undefined) parts.push(sql`upper(btrim(o.described_size)) = upper(btrim(${counted.size}))`);
      where.push(sql`(${ofSkus} or (${sql.join(parts, sql` and `)}))`);
    }
  }
  if (filters.brandId !== undefined) where.push(sql`b.brand_id = ${filters.brandId}::uuid`);
  if (filters.siteId !== undefined) where.push(sql`b.site_id = ${filters.siteId}::uuid`);
  if (filters.businessUnitId !== undefined) where.push(sql`b.business_unit_id = ${filters.businessUnitId}::uuid`);
  if (filters.locationId !== undefined) where.push(sql`b.location_id = ${filters.locationId}::uuid`);
  if (filters.condition !== undefined) where.push(sql`b.condition = ${filters.condition}`);
  return where;
}

const IN_CUSTODY = sql`b.held_as = 'custody' and b.quantity > 0 and b.location_id is not null`;

interface DetailRow extends Record<string, unknown> {
  id: string;
  matching: boolean;
  site_id: string;
  store_id: string | null;
  business_unit_id: string;
  location_id: string;
  legal_entity_id: string;
  brand_id: string | null;
  sku_id: string | null;
  receipt_origin_id: string;
  condition: Condition;
  quantity: number;
  accepted_quantity: number;
  product_key: string;
  described_style_code: string | null;
  described_colour: string | null;
  described_size: string | null;
  holds: { kind: PlacedHoldKind; quantity: number }[];
  reserved: number;
  covered: number;
  reserved_everywhere: number;
}

/** A balance read in detail, with its quantities and whether a count freeze covers it. */
interface Detailed {
  readonly row: DetailRow;
  readonly quantities: PositionQuantities;
  readonly frozen: boolean;
}

/**
 * The balances in custody that match `where`, each with its quantities, oldest first. Every balance of their origins is
 * read with them, under the reader's actor, so an origin's covered quantity is drawn on once as the Availability read
 * draws it (13.9); only the matching ones are answered.
 */
async function matchingBalances(context: TransactionContext, where: SQL): Promise<Detailed[]> {
  const result = await context.tx.execute<DetailRow>(sql`
    with matching as (
      select b.id, b.receipt_origin_id from stock.balance b
      join stock.receipt_origin o on o.id = b.receipt_origin_id
      where ${IN_CUSTODY} and ${where}
    )
    select b.id, b.id in (select id from matching) as matching, b.site_id, b.store_id, b.business_unit_id,
           b.location_id, b.legal_entity_id, b.brand_id, b.sku_id, b.receipt_origin_id, b.condition, b.quantity,
           b.accepted_quantity, ${productKey} as product_key, o.described_style_code, o.described_colour,
           o.described_size,
           (select coalesce(jsonb_agg(jsonb_build_object('kind', k.kind, 'quantity', k.quantity) order by k.kind),
                            '[]'::jsonb)
              from (select h.kind, sum(c.quantity)::integer as quantity
                      from stock.hold_claim c join stock.hold h on h.id = c.hold_id
                     where c.balance_id = b.id and h.within_reservation_id is null and c.quantity > 0
                     group by h.kind) k) as holds,
           coalesce((select sum(c.quantity) from stock.reservation_claim c
                     join stock.reservation r on r.id = c.reservation_id where c.balance_id = b.id), 0)::integer
             as reserved,
           coalesce(s.covered_quantity, 0) as covered,
           coalesce((select sum(c.quantity) from stock.reservation_claim c
                     join stock.reservation r on r.id = c.reservation_id
                     join stock.balance e on e.id = c.balance_id
                     where e.receipt_origin_id = b.receipt_origin_id), 0)::integer as reserved_everywhere
    from stock.balance b
    join stock.receipt_origin o on o.id = b.receipt_origin_id
    left join stock.receipt_origin_state s on s.receipt_origin_id = b.receipt_origin_id
    where ${IN_CUSTODY} and b.receipt_origin_id in (select receipt_origin_id from matching)
    order by b.expiry_date nulls last, b.count_date, b.id`);
  const rows = result.rows;
  // Whatever freeze covers a balance marks it, asked once for the whole read (8.1; DEC-117).
  const touches = rows.flatMap((row, line): FreezeTouch[] => {
    const at = { line, siteId: row.site_id, businessUnitId: row.business_unit_id };
    const members: FreezeTouch[] = [{ ...at, kind: 'location', id: row.location_id }];
    if (row.sku_id !== null) members.push({ ...at, kind: 'sku', id: row.sku_id });
    if (row.brand_id !== null) members.push({ ...at, kind: 'brand', id: row.brand_id });
    return members;
  });
  const frozen = new Set((await recheckHidden(context, { touches })).map((answer) => answer.line));
  const balances: PositionBalance[] = rows.map((row, line) => ({
    balanceId: row.id,
    receiptOriginId: row.receipt_origin_id,
    condition: row.condition,
    quantity: row.quantity,
    accepted: row.accepted_quantity,
    reserved: row.reserved,
    holds: row.holds.map((hold): HeldByKind => ({ kind: hold.kind, quantity: hold.quantity })),
    covered: row.covered,
    reservedEverywhere: row.reserved_everywhere,
    frozen: frozen.has(line),
  }));
  const quantities = quantitiesOf(balances);
  return rows.flatMap((row, line) => {
    if (!row.matching) return [];
    const each = quantities.get(row.id);
    if (each === undefined) throw new CommandDefect(`A balance with no quantities: ${row.id}`);
    return [{ row, quantities: each, frozen: frozen.has(line) }];
  });
}

/** The brand of a balance: the SKU's, or the one its goods were counted under; a balance has one (14.2). */
function brandOf(row: DetailRow): string {
  if (row.brand_id === null) throw new CommandDefect(`A balance with no brand: ${row.id}`);
  return row.brand_id;
}

/** The goods of a result, from its balances, the first counted where several share an identity (13.14). */
function productOf(rows: readonly DetailRow[]): PositionProduct {
  const first = [...rows].sort((a, b) => a.receipt_origin_id.localeCompare(b.receipt_origin_id))[0];
  if (first === undefined) throw new CommandDefect('A result with no balance');
  if (first.sku_id !== null) return { kind: 'sku', skuId: first.sku_id };
  if (first.described_style_code === null) return { kind: 'unidentified' };
  return {
    kind: 'counted',
    styleCode: first.described_style_code,
    colour: first.described_colour,
    size: first.described_size,
  };
}

/** Balances by a key of theirs, in the order first met. */
function groupBy<Key>(details: readonly Detailed[], keyOf: (row: DetailRow) => Key, text: (key: Key) => string) {
  const groups = new Map<string, { key: Key; members: Detailed[] }>();
  for (const each of details) {
    const key = keyOf(each.row);
    const found = groups.get(text(key));
    if (found === undefined) groups.set(text(key), { key, members: [each] });
    else found.members.push(each);
  }
  return [...groups.values()];
}

const keyText = (key: PositionKey) =>
  JSON.stringify([key.siteId, key.businessUnitId, key.locationId, key.productKey, key.legalEntityId]);

/**
 * Stock of products at places (goods-in 9.2; PRD-STK-001, PRD-STK-006): each result a product at a location, with its
 * quantities apart, a page at a time in the order of place and product, starting after `after`. A result's product and
 * place are those of its balances; its quantities are summed over the balances that match the filters.
 */
export async function stockPositions(
  context: TransactionContext,
  query: PositionsQuery,
): Promise<{ readonly positions: Position[]; readonly next: PositionKey | null }> {
  const where = sql.join([IN_CUSTODY, ...filtersOf(query)], sql` and `);
  const after =
    query.after === undefined
      ? sql`true`
      : sql`(p.site_id, p.business_unit_id, p.location_id, p.product_key, p.legal_entity_id) >
            (${query.after.siteId}::uuid, ${query.after.businessUnitId}::uuid, ${query.after.locationId}::uuid,
             ${query.after.productKey}::text, ${query.after.legalEntityId}::uuid)`;
  const page = await context.tx.execute<{
    site_id: string;
    business_unit_id: string;
    location_id: string;
    product_key: string;
    legal_entity_id: string;
  }>(sql`
    select distinct p.site_id, p.business_unit_id, p.location_id, p.product_key, p.legal_entity_id
    from (select b.site_id, b.business_unit_id, b.location_id, b.legal_entity_id, ${productKey} as product_key
            from stock.balance b join stock.receipt_origin o on o.id = b.receipt_origin_id
           where ${where}) p
    where ${after}
    order by p.site_id, p.business_unit_id, p.location_id, p.product_key, p.legal_entity_id
    limit ${query.limit + 1}`);
  const keys = page.rows.slice(0, query.limit).map((row): PositionKey => ({
    siteId: row.site_id,
    businessUnitId: row.business_unit_id,
    locationId: row.location_id,
    productKey: row.product_key,
    legalEntityId: row.legal_entity_id,
  }));
  if (keys.length === 0) return { positions: [], next: null };
  const inPage = sql`(b.site_id, b.business_unit_id, b.location_id, ${productKey}, b.legal_entity_id) in (
    select * from unnest(${sql.param(keys.map((key) => key.siteId))}::uuid[],
                         ${sql.param(keys.map((key) => key.businessUnitId))}::uuid[],
                         ${sql.param(keys.map((key) => key.locationId))}::uuid[],
                         ${sql.param(keys.map((key) => key.productKey))}::text[],
                         ${sql.param(keys.map((key) => key.legalEntityId))}::uuid[]))`;
  const details = await matchingBalances(context, sql.join([...filtersOf(query), inPage], sql` and `));
  const byKey = new Map(
    groupBy(
      details,
      (row): PositionKey => ({
        siteId: row.site_id,
        businessUnitId: row.business_unit_id,
        locationId: row.location_id,
        productKey: row.product_key,
        legalEntityId: row.legal_entity_id,
      }),
      keyText,
    ).map((group) => [keyText(group.key), group.members]),
  );
  const positions = keys.map((key): Position => {
    const members = byKey.get(keyText(key));
    const first = members?.[0];
    if (members === undefined || first === undefined) throw new CommandDefect('A result of the page has no balance');
    return {
      key,
      product: productOf(members.map((each) => each.row)),
      brandId: brandOf(first.row),
      storeId: first.row.store_id,
      frozen: members.some((each) => each.frozen),
      balanceIds: members.map((each) => each.row.id),
      ...totalOf(members.map((each) => each.quantities)),
    };
  });
  return { positions, next: page.rows.length > query.limit ? (keys.at(-1) ?? null) : null };
}

/**
 * The same products at each business unit outside the place the search names, summed over its locations (goods-in 9.2;
 * PRD-STK-006): what a Store's staff look at to find a size elsewhere. Only the units the reader may see.
 */
export async function unitPositions(
  context: TransactionContext,
  query: UnitPositionsQuery,
): Promise<readonly UnitPosition[]> {
  if (query.productKeys.length === 0) return [];
  const where: SQL[] = [
    sql`${productKey} = any(${sql.param([...query.productKeys])}::text[])`,
    query.outside.kind === 'site'
      ? sql`b.site_id <> ${query.outside.siteId}::uuid`
      : sql`b.business_unit_id <> ${query.outside.businessUnitId}::uuid`,
    ...filtersOf({
      ...(query.brandId === undefined ? {} : { brandId: query.brandId }),
      ...(query.condition === undefined ? {} : { condition: query.condition }),
    }),
  ];
  const details = await matchingBalances(context, sql.join(where, sql` and `));
  return groupBy(
    details,
    (row) => ({
      productKey: row.product_key,
      siteId: row.site_id,
      businessUnitId: row.business_unit_id,
      legalEntityId: row.legal_entity_id,
    }),
    (key) => JSON.stringify([key.productKey, key.siteId, key.businessUnitId, key.legalEntityId]),
  ).map(({ key, members }): UnitPosition => {
    const first = members[0];
    if (first === undefined) throw new CommandDefect('A unit with no balance');
    return {
      ...key,
      storeId: first.row.store_id,
      brandId: brandOf(first.row),
      frozen: members.some((each) => each.frozen),
      ...totalOf(members.map((each) => each.quantities)),
    };
  });
}

/**
 * The cost of the balances given, the pieces at their origin's `P RATE`, the cost the PT established (goods-in 9.4;
 * stock-ledger 13.4 "Cost established"): Unknown while an origin's cost is not established, or its state is one the
 * reader may not see. Read under the reader's actor, the field class cost being the caller's to authorise first
 * (access-and-approvals 6; PRD-ACS-008); a balance the reader may not see is not answered.
 */
export async function balanceCosts(
  context: TransactionContext,
  balanceIds: readonly string[],
): Promise<readonly BalanceCost[]> {
  if (balanceIds.length === 0) return [];
  const result = await context.tx.execute<{
    id: string;
    quantity: number;
    value_known: boolean | null;
    p_rate_paise: string | null;
  }>(sql`
    select b.id, b.quantity, s.value_known, s.p_rate_paise::text as p_rate_paise
    from stock.balance b
    left join stock.receipt_origin_state s on s.receipt_origin_id = b.receipt_origin_id
    where b.id = any(${sql.param([...new Set(balanceIds)])}::uuid[])`);
  return result.rows.map((row) => ({
    balanceId: row.id,
    cost:
      row.value_known === true && row.p_rate_paise !== null
        ? known(paise(Number(row.p_rate_paise) * row.quantity))
        : unknownValue(),
  }));
}

/** The read models of stock search, declared for the read-model gateway (module-map section 3, rule 5). */
export const STOCK_POSITIONS = declareReadModel<PositionsQuery, Awaited<ReturnType<typeof stockPositions>>>(
  'stock.positions',
);
export const STOCK_UNIT_POSITIONS = declareReadModel<UnitPositionsQuery, readonly UnitPosition[]>(
  'stock.unit-positions',
);
export const STOCK_BALANCE_COSTS = declareReadModel<readonly string[], readonly BalanceCost[]>('stock.balance-costs');

/** The ledger's read models as it serves them, handed to the gateway by the composition root. */
export const stockLedgerReadModels = [
  serveReadModel(STOCK_POSITIONS, stockPositions),
  serveReadModel(STOCK_UNIT_POSITIONS, unitPositions),
  serveReadModel(STOCK_BALANCE_COSTS, balanceCosts),
];
