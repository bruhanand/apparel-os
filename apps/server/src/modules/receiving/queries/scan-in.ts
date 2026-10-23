import { SCAN_PAGE_CAP, type Scan, type ScanInProduct, type ScanInQuery, type ScanInRead } from '@apparel-os/schemas';
import { and, desc, eq, lt } from 'drizzle-orm';
import type { TransactionContext } from '../../../kernel/index.js';
import { skuOn } from '../../merchandise/catalogue/index.js';
import { structureOn } from '../../organisation/index.js';
import { ptRevisionGoods, type PtRevisionGoods } from '../../stock/ledger/index.js';
import { scan, type grn } from '../db/schema.js';
import { destinationAllowed, progressOf, scanInComplete, type CoveredGoods } from '../domain/scan-in.js';
import type { ArrivalRow } from '../commands/common.js';
import { receivingMissing, type AvailabilityDependencies } from './availability.js';
import { setMarksOf } from './pt-mark.js';

// The scan-in of a GRN as the inbox and its screen read it (goods-in 4.1, 7, 7.5, section 11; S2-F07-T01): the PT it
// scans in, once approved, whose covered goods the ledger answers whatever the reader may see of the stock rows
// (stock-ledger 13.20; DEC-117); what of each product waits, is accepted or is held; where pieces may go; and the scans,
// newest first, a page at a time. Read under the reader's actor, so row-level security keeps out a GRN or scans the
// reader may not see (code-house-rules 6.2).

type GrnRow = typeof grn.$inferSelect;

const coveredOf = (row: PtRevisionGoods): CoveredGoods => ({
  receiptOriginId: row.receiptOriginId,
  skuId: row.skuId,
  covered: row.covered,
  locationId: row.locationId,
  condition: row.condition,
  quantity: row.quantity,
  accepted: row.accepted,
  held: row.held,
});

/** A GRN's approved PT: the revision its "PT attached" mark names, and the goods it covers (goods-in 5.8, 6.3). */
export interface OfficialPt {
  readonly ptRevisionId: string;
  readonly goods: readonly CoveredGoods[];
}

/**
 * The approved PTs of the GRNs given, by GRN (goods-in 7.1): the revision each GRN's mark names while set, once that
 * revision covers goods, which only its approval records (stock-ledger 13.5, 13.19); a PT waiting for approval, queued
 * for its posting or whose posting failed covers none yet, so its GRN has none.
 */
export async function officialPtsOf(
  context: TransactionContext,
  grnIds: readonly string[],
): Promise<ReadonlyMap<string, OfficialPt>> {
  const marks = await setMarksOf(context, grnIds);
  const goods = await ptRevisionGoods(context, [...marks.values()]);
  const official = new Map<string, OfficialPt>();
  for (const [grnId, ptRevisionId] of marks) {
    const covered = goods.filter((row) => row.ptRevisionId === ptRevisionId).map(coveredOf);
    if (covered.length > 0) official.set(grnId, { ptRevisionId, goods: covered });
  }
  return official;
}

/** A GRN's approved PT, or undefined while it has none (goods-in 7.1). */
export async function officialPtOf(context: TransactionContext, grnId: string): Promise<OfficialPt | undefined> {
  return (await officialPtsOf(context, [grnId])).get(grnId);
}

/**
 * Where the scan-in of each GRN given stands, by GRN, once its PT is approved (goods-in 4.1, 7.1, 7.3): scanning while
 * a piece the PT covers waits at its receiving location, complete once none does. A GRN with no approved PT is left
 * out.
 */
export async function scanInsOf(
  context: TransactionContext,
  grns: readonly { readonly grnId: string; readonly receivingLocationId: string }[],
): Promise<ReadonlyMap<string, 'scanning' | 'complete'>> {
  const official = await officialPtsOf(
    context,
    grns.map((each) => each.grnId),
  );
  const states = new Map<string, 'scanning' | 'complete'>();
  for (const { grnId, receivingLocationId } of grns) {
    const pt = official.get(grnId);
    if (pt === undefined) continue;
    states.set(grnId, scanInComplete(progressOf(pt.goods, receivingLocationId)) ? 'complete' : 'scanning');
  }
  return states;
}

/**
 * Whether any piece of the GRN is scanned in (goods-in 6.4, 7.4; DEC-137): what `merchandise` · PT reads before a PT's
 * reversal (S2-F09-T01), under the GRN's lock its caller holds, from the scan-in's own record. The scans carry the GRN's
 * facts, so whoever may see the GRN sees them.
 */
export async function anyAccepted(context: TransactionContext, grnId: string): Promise<boolean> {
  const [row] = await context.tx
    .select({ id: scan.id })
    .from(scan)
    .where(and(eq(scan.grnId, grnId), eq(scan.outcome, 'accepted')))
    .limit(1);
  return row !== undefined;
}

/**
 * The locations of the GRN's unit a piece may go to, in force today and not retired (goods-in 7.2;
 * structure-and-masters 3.5): its floor and backstore at a Store, its bins at a warehouse, never the receiving location.
 */
export async function destinationsOf(context: TransactionContext, arrival: ArrivalRow, today: string) {
  const structure = await structureOn(context, today);
  return structure.locations
    .filter(
      (each) =>
        each.businessUnitId === arrival.businessUnitId &&
        !each.retired &&
        destinationAllowed({ atStore: arrival.storeId !== null }, each, arrival.receivingLocationId),
    )
    .map((each) => ({ id: each.id, code: each.code, name: each.name, kind: each.kind }));
}

/** Each product the PT covers with what it counts, named by its SKU as of today at the Site, Unknown when unread. */
async function productsOf(
  context: TransactionContext,
  pt: OfficialPt | undefined,
  arrival: ArrivalRow,
  today: string,
): Promise<ScanInProduct[]> {
  if (pt === undefined) return [];
  const products: ScanInProduct[] = [];
  for (const product of progressOf(pt.goods, arrival.receivingLocationId)) {
    const read = await skuOn(context, product.skuId, arrival.siteId, today);
    const sku = 'sku' in read ? read.sku : undefined;
    products.push({
      ...product,
      code: sku?.code ?? null,
      styleCode: sku?.styleCode ?? null,
      size: sku?.size ?? null,
    });
  }
  return products;
}

/** The GRN's scans, newest first, a page of at most SCAN_PAGE_CAP after the cursor (code-house-rules 12.1). */
async function scansOf(
  context: TransactionContext,
  grnId: string,
  query: ScanInQuery,
): Promise<{ readonly scans: Scan[]; readonly next: string | null }> {
  const limit = Math.min(Number(query.limit ?? SCAN_PAGE_CAP), SCAN_PAGE_CAP);
  const rows = await context.tx
    .select()
    .from(scan)
    .where(and(eq(scan.grnId, grnId), query.after === undefined ? undefined : lt(scan.id, query.after)))
    .orderBy(desc(scan.id))
    .limit(limit + 1);
  const page = rows.slice(0, limit);
  return {
    scans: page.map((row) => ({
      id: row.id,
      barcode: row.barcode,
      outcome: row.outcome,
      reason: row.reason,
      skuId: row.skuId,
      destinationLocationId: row.destinationLocationId,
      scannedBy: row.scannedByUserId,
      scannedAt: row.scannedAt.toISOString(),
    })),
    next: rows.length > limit ? (page.at(-1)?.id ?? null) : null,
  };
}

/** The scan-in of a GRN as its screen shows it (goods-in 7, section 11), without its as-of time and names. */
export async function scanInView(
  context: TransactionContext,
  dependencies: AvailabilityDependencies,
  grnRow: GrnRow,
  arrival: ArrivalRow,
  query: ScanInQuery,
  today: string,
): Promise<Omit<ScanInRead, 'asOf' | 'people'>> {
  const pt = await officialPtOf(context, grnRow.id);
  const products = await productsOf(context, pt, arrival, today);
  const { scans, next } = await scansOf(context, grnRow.id, query);
  return {
    grnId: grnRow.id,
    grnNumber: grnRow.number,
    arrivalId: arrival.id,
    state: pt === undefined ? 'waiting-for-pt' : scanInComplete(products) ? 'complete' : 'scanning',
    ptRevisionId: pt?.ptRevisionId ?? null,
    siteId: arrival.siteId,
    businessUnitId: arrival.businessUnitId,
    receivingLocationId: arrival.receivingLocationId,
    destinations: await destinationsOf(context, arrival, today),
    products,
    scans,
    next,
    blocking: await receivingMissing(
      context,
      dependencies,
      { siteId: arrival.siteId, businessUnitId: arrival.businessUnitId },
      today,
    ),
  };
}
