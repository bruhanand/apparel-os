import { sql, type SQL } from 'drizzle-orm';
import { CommandDefect, declareReadModel, serveReadModel, type TransactionContext } from '../../../../kernel/index.js';
import type { Condition, SourceRecord } from '../domain/request.js';
import { ownerKey } from './holdings.js';
import { IN_CUSTODY, productKey } from './positions.js';

// The records behind a figure of stock search or the stock report (goods-in 9.1 "Every figure drills down to its
// records: the booking, the GRN, the PT, the movements", 9.2, 9.5; stock-ledger 2.1, 13.6, 13.22; PRD-EXC-011;
// S2-F11-T01, S2-F11-T02; code reviews 8 and 9 of stage 2), served through the kernel's read-model gateway: for the
// balances of one result, a product at one location of one legal entity, and for a stock report row also one condition
// and owner, the sources of their receipt origins and of the origins they were split or identified from (the GRN that
// counted them, the PT that identified them), the PT revisions that cover them, and the movements of those origins at
// the location, newest first, a page at a time. Takes no lock and runs in the reader's transaction under the reader's
// actor, so row-level security keeps out what the reader may not see (14.3).

/** The balances a figure is of: a stock search result's key, and a stock report row's condition and owner too. */
export interface RecordsOf {
  readonly siteId: string;
  readonly businessUnitId: string;
  readonly locationId: string;
  readonly productKey: string;
  readonly legalEntityId: string;
  readonly condition?: Condition;
  readonly ownerKey?: string;
}

export interface StockRecordsQuery {
  readonly of: RecordsOf;
  /** The last movement leg of the page before. */
  readonly after?: string;
  /** The most movements the page holds; the caller caps it. */
  readonly limit: number;
}

/** A movement of the goods at the location (stock-ledger 2.3, 14.2): one leg of it, in or out. */
export interface RecordsMovement {
  readonly legId: string;
  readonly movementId: string;
  readonly kind: string;
  readonly direction: 'in' | 'out';
  readonly quantity: number;
  readonly condition: Condition;
  readonly businessDate: string;
  readonly occurredAt: string;
  readonly source: SourceRecord;
  /** The source of the first receipt count of the leg's origin, the GRN its pieces were counted on. */
  readonly rootSource: SourceRecord;
}

export type StockRecordsAnswer =
  | { readonly found: false }
  | {
      readonly found: true;
      /** The brand and Store of the balances, which the caller authorises the figure with (14.1). */
      readonly brandId: string;
      readonly storeId: string | null;
      /** The source of each origin, and of each it came from, its first receipt count's root first. */
      readonly sources: readonly SourceRecord[];
      /** The PT revisions covering the balances' origins (13.5), each with the root source of the origin it covers. */
      readonly covered: readonly { readonly ptRevisionId: string; readonly rootSource: SourceRecord }[];
      readonly movements: readonly RecordsMovement[];
      readonly next: string | null;
    };

const sourceOf = (module: string, recordType: string, recordId: string): SourceRecord => ({
  module,
  recordType,
  recordId,
});

export async function stockRecords(context: TransactionContext, query: StockRecordsQuery): Promise<StockRecordsAnswer> {
  const { of } = query;
  const where: SQL[] = [
    IN_CUSTODY,
    sql`b.site_id = ${of.siteId}::uuid`,
    sql`b.business_unit_id = ${of.businessUnitId}::uuid`,
    sql`b.location_id = ${of.locationId}::uuid`,
    sql`b.legal_entity_id = ${of.legalEntityId}::uuid`,
    sql`${productKey} = ${of.productKey}::text`,
    ...(of.condition === undefined ? [] : [sql`b.condition = ${of.condition}`]),
    ...(of.ownerKey === undefined ? [] : [sql`${ownerKey} = ${of.ownerKey}::text`]),
  ];
  const balances = await context.tx.execute<{
    receipt_origin_id: string;
    brand_id: string | null;
    store_id: string | null;
    pt_revision_id: string | null;
  }>(sql`
    select b.receipt_origin_id::text as receipt_origin_id, b.brand_id::text as brand_id,
           b.store_id::text as store_id, s.pt_revision_id::text as pt_revision_id
    from stock.balance b
    join stock.receipt_origin o on o.id = b.receipt_origin_id
    left join stock.receipt_origin_state s on s.receipt_origin_id = b.receipt_origin_id
    where ${sql.join(where, sql` and `)}`);
  const [first] = balances.rows;
  if (first?.brand_id === undefined || first.brand_id === null) return { found: false };
  const originIds = [...new Set(balances.rows.map((row) => row.receipt_origin_id))];
  // Each origin and every origin it came from, with the root (the first receipt count) of each (13.14, 13.19).
  const chain = await context.tx.execute<{
    start_id: string;
    id: string;
    is_root: boolean;
    source_module: string;
    source_record_type: string;
    source_record_id: string;
  }>(sql`
    with recursive up (start_id, id, parent_id, depth, source_module, source_record_type, source_record_id) as (
      select o.id, o.id, o.parent_origin_id, 0, o.source_module, o.source_record_type, o.source_record_id
        from stock.receipt_origin o where o.id = any(${sql.param(originIds)}::uuid[])
      union all
      select up.start_id, p.id, p.parent_origin_id, up.depth + 1, p.source_module, p.source_record_type,
             p.source_record_id
        from stock.receipt_origin p join up on p.id = up.parent_id
    )
    select start_id::text as start_id, id::text as id, parent_id is null as is_root, source_module,
           source_record_type, source_record_id::text as source_record_id
    from up order by start_id, depth desc`);
  const chainIds = [...new Set(chain.rows.map((row) => row.id))];
  // Each origin of a chain by the root of its chain: read root first, each chain from its root down (`depth desc`).
  const rootOf = new Map<string, SourceRecord>();
  const seen = new Set<string>();
  const sources: SourceRecord[] = [];
  let root: SourceRecord | undefined;
  for (const row of chain.rows) {
    const source = sourceOf(row.source_module, row.source_record_type, row.source_record_id);
    if (row.is_root) root = source;
    if (root === undefined) throw new CommandDefect(`A receipt origin's chain has no root: ${row.start_id}`);
    rootOf.set(row.id, root);
    const text = JSON.stringify(source);
    if (!seen.has(text)) {
      seen.add(text);
      sources.push(source);
    }
  }
  const legs = await context.tx.execute<{
    leg_id: string;
    movement_id: string;
    kind: string;
    direction: 'in' | 'out';
    quantity: number;
    condition: Condition;
    receipt_origin_id: string;
    business_date: string;
    occurred_at: Date;
    source_module: string;
    source_record_type: string;
    source_record_id: string;
  }>(sql`
    select l.id::text as leg_id, m.id::text as movement_id, m.kind, l.direction, l.quantity, l.condition,
           l.receipt_origin_id::text as receipt_origin_id, m.business_date::text as business_date, m.occurred_at,
           m.source_module, m.source_record_type, m.source_record_id::text as source_record_id
    from stock.movement_leg l
    join stock.movement m on m.id = l.movement_id
    where l.receipt_origin_id = any(${sql.param(chainIds)}::uuid[])
      and l.location_id = ${of.locationId}::uuid
      ${of.condition === undefined ? sql`` : sql`and l.condition = ${of.condition}`}
      ${query.after === undefined ? sql`` : sql`and l.id < ${query.after}::uuid`}
    order by l.id desc
    limit ${query.limit + 1}`);
  const page = legs.rows.slice(0, query.limit);
  const movements = page.map((row): RecordsMovement => {
    const source = sourceOf(row.source_module, row.source_record_type, row.source_record_id);
    const rootSource = rootOf.get(row.receipt_origin_id);
    if (rootSource === undefined)
      throw new CommandDefect(`A movement leg of an origin outside its chain: ${row.leg_id}`);
    return {
      legId: row.leg_id,
      movementId: row.movement_id,
      kind: row.kind,
      direction: row.direction,
      quantity: row.quantity,
      condition: row.condition,
      businessDate: row.business_date,
      occurredAt: new Date(row.occurred_at).toISOString(),
      source,
      rootSource,
    };
  });
  return {
    found: true,
    brandId: first.brand_id,
    storeId: first.store_id,
    sources,
    covered: [
      ...new Map(
        balances.rows.flatMap((row) => {
          if (row.pt_revision_id === null) return [];
          const rootSource = rootOf.get(row.receipt_origin_id);
          if (rootSource === undefined)
            throw new CommandDefect(`A balance's origin has no chain: ${row.receipt_origin_id}`);
          return [[row.pt_revision_id, { ptRevisionId: row.pt_revision_id, rootSource }] as const];
        }),
      ).values(),
    ],
    movements,
    next: legs.rows.length > query.limit ? (page.at(-1)?.leg_id ?? null) : null,
  };
}

/** The read model of a figure's records, declared for the read-model gateway (module-map section 3, rule 5). */
export const STOCK_RECORDS = declareReadModel<StockRecordsQuery, StockRecordsAnswer>('stock.records');
export const stockRecordsReadModels = [serveReadModel(STOCK_RECORDS, stockRecords)];
