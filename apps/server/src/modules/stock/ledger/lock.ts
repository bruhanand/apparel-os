import { uuidv7 } from '@apparel-os/domain';
import { and, eq, isNull, sql } from 'drizzle-orm';
import {
  CommandDefect,
  LOCK_STEP,
  lockTable,
  type LockTarget,
  type TransactionContext,
} from '../../../kernel/index.js';
import { costPool, skuBalance, transitValue, unitAnchor } from './db/schema.js';
import { compareCodeUnits, skuKey, unitKey } from './domain/keys.js';
import type { LedgerPlan } from './plan.js';

// Lock (stock-ledger 13.1; 10.3 steps 2 to 6, with SL-24): one lock call per step through `kernel`'s lock helper,
// with any targets the caller adds for the step (code-house-rules 8.2).

const RECEIPT_ORIGIN = lockTable('stock', 'receipt_origin');
const UNIT_ANCHOR = lockTable('stock', 'unit_anchor');
const SKU_BALANCE = lockTable('stock', 'sku_balance');
const PIECE = lockTable('stock', 'piece');
const HOLD = lockTable('stock', 'hold');
const RESERVATION = lockTable('stock', 'reservation');
const COST_POOL = lockTable('stock', 'cost_pool');
const TRANSIT_VALUE = lockTable('stock', 'transit_value');

/** Targets a caller adds to the ledger's steps 2 to 6 (13.1 "Lock"). */
export type ExtraTargets = Partial<Record<2 | 3 | 4 | 5 | 6, readonly LockTarget[]>>;

/** A plan whose rows are locked (13.1 "Lock"). */
export interface LockedPlan {
  readonly plan: LedgerPlan;
  readonly skuBalanceIds: readonly string[];
  /** The cost pools and transit values locked at step 6 (10.3; 14.3). */
  readonly poolIds: readonly string[];
  readonly transitIds: readonly string[];
  /** Targets not locked: missing, or hidden from the actor by row-level security. */
  readonly missing: readonly LockTarget[];
}

/**
 * Lock (13.1; 10.3 steps 2 to 5, with SL-24): receipt origins, exclusive where their state changes and shared where
 * only read; the missing unit anchors and SKU balances created empty in ascending key order, then locked in one call
 * with the anchors, shared for every item and exclusive to start or end a count freeze; pieces; and the holds and
 * reservations being released, ended or moved. Nothing that records the request's effects is written here.
 */
export async function lockPlan(
  context: TransactionContext,
  plan: LedgerPlan,
  extra: ExtraTargets = {},
): Promise<LockedPlan> {
  const missing: LockTarget[] = [];
  const step = async (
    lockStep: (typeof LOCK_STEP)[keyof typeof LOCK_STEP],
    own: readonly LockTarget[],
    added: readonly LockTarget[] = [],
  ) => {
    if (own.length === 0 && added.length === 0) return;
    const result = await context.lock(lockStep, [...own, ...added]);
    missing.push(...result.missing);
  };
  await step(
    LOCK_STEP.receiptOrigin,
    [...plan.originIds].map(([id, mode]) => ({ table: RECEIPT_ORIGIN, id, mode })),
    extra[2],
  );

  // Step 3: what is missing, created empty in ascending key order by code unit (10.3; code-house-rules 8.2), then
  // every anchor and SKU balance found again and locked in one call.
  const anchors = [...plan.anchors].sort((a, b) =>
    compareCodeUnits(unitKey(a.unit.siteId, a.unit.businessUnitId), unitKey(b.unit.siteId, b.unit.businessUnitId)),
  );
  const totals = [...plan.skuBalances].sort((a, b) =>
    compareCodeUnits(
      skuKey(a.unit.siteId, a.unit.businessUnitId, a.sku.skuId),
      skuKey(b.unit.siteId, b.unit.businessUnitId, b.sku.skuId),
    ),
  );
  for (const { unit } of anchors) {
    await context.tx
      .insert(unitAnchor)
      .values({
        id: uuidv7(),
        siteId: unit.siteId,
        storeId: unit.storeId,
        businessUnitId: unit.businessUnitId,
        legalEntityId: unit.legalEntityId,
      })
      .onConflictDoNothing({ target: [unitAnchor.siteId, unitAnchor.businessUnitId] });
  }
  for (const { unit, sku } of totals) {
    await context.tx
      .insert(skuBalance)
      .values({
        id: uuidv7(),
        siteId: unit.siteId,
        businessUnitId: unit.businessUnitId,
        skuId: sku.skuId,
        stockUnit: sku.stockUnit,
        quantity: 0,
        storeId: unit.storeId,
        legalEntityId: unit.legalEntityId,
        brandId: sku.brandId,
      })
      .onConflictDoNothing();
  }
  const rowsOf = async (
    found: readonly { siteId: string; businessUnitId: string; skuId?: string }[],
    read: (each: { siteId: string; businessUnitId: string; skuId?: string }) => Promise<{ id: string } | undefined>,
    what: string,
  ) => {
    const ids: string[] = [];
    for (const each of found) {
      const row = await read(each);
      if (row === undefined) throw new CommandDefect(`A ${what} just created is not visible to its actor`);
      ids.push(row.id);
    }
    return ids;
  };
  const anchorIds = await rowsOf(
    anchors.map(({ unit }) => unit),
    async ({ siteId, businessUnitId }) =>
      (
        await context.tx
          .select({ id: unitAnchor.id })
          .from(unitAnchor)
          .where(and(eq(unitAnchor.siteId, siteId), eq(unitAnchor.businessUnitId, businessUnitId)))
      )[0],
    'unit anchor',
  );
  const skuBalanceIds = await rowsOf(
    totals.map(({ unit, sku }) => ({ siteId: unit.siteId, businessUnitId: unit.businessUnitId, skuId: sku.skuId })),
    async ({ siteId, businessUnitId, skuId }) =>
      (
        await context.tx
          .select({ id: skuBalance.id })
          .from(skuBalance)
          .where(
            and(
              eq(skuBalance.siteId, siteId),
              eq(skuBalance.businessUnitId, businessUnitId),
              eq(skuBalance.skuId, skuId ?? ''),
            ),
          )
      )[0],
    'SKU balance',
  );
  await step(
    LOCK_STEP.balance,
    [
      ...anchorIds.map((id, index) => ({ table: UNIT_ANCHOR, id, mode: anchors[index]?.mode ?? ('shared' as const) })),
      ...skuBalanceIds.map((id) => ({ table: SKU_BALANCE, id, mode: 'exclusive' as const })),
    ],
    extra[3],
  );
  await step(
    LOCK_STEP.piece,
    [...plan.pieceIds].map((id) => ({ table: PIECE, id, mode: 'exclusive' as const })),
    extra[4],
  );
  await step(
    LOCK_STEP.holdAndReservation,
    [
      ...[...plan.holdIds].map((id) => ({ table: HOLD, id, mode: 'exclusive' as const })),
      ...[...plan.reservationIds].map((id) => ({ table: RESERVATION, id, mode: 'exclusive' as const })),
    ],
    extra[5],
  );

  // A target of steps 2 to 5 not locked, hidden or missing, refuses the request at Recheck (13.9): nothing of step 6
  // is created or admitted for it.
  if (missing.length > 0) return { plan, skuBalanceIds, poolIds: [], transitIds: [], missing };
  await admitPools(context, plan);

  // Step 6 (10.3; SL-24): a missing pool or transit value is created empty, a new pool taking its formula, pool mode
  // and cost-setting version from the cost setting read at Plan (14.2); then every pool and transit value is locked in
  // one call.
  for (const target of [...plan.pools.values()].sort((a, b) => compareCodeUnits(a.key, b.key))) {
    await context.tx
      .insert(costPool)
      .values({
        id: uuidv7(),
        bookId: target.bookId,
        skuId: target.skuId,
        poolMode: target.mode,
        siteId: target.siteId,
        formula: target.formula,
        costSettingVersionId: target.costSettingVersionId,
        quantity: 0,
        valuePaise: 0,
        lastSequence: 0,
        legalEntityId: target.legalEntityId,
        brandId: target.brandId,
      })
      .onConflictDoNothing();
  }
  const transits = [...plan.transits.values()].sort((a, b) => compareCodeUnits(a.key, b.key));
  for (const target of transits.filter((each) => each.create)) {
    await context.tx
      .insert(transitValue)
      .values({
        id: uuidv7(),
        transitKind: target.kind,
        transitRef: target.ref,
        bookId: target.bookId,
        skuId: target.skuId,
        quantity: 0,
        valuePaise: 0,
        siteId: target.unit.siteId,
        storeId: target.unit.storeId,
        businessUnitId: target.unit.businessUnitId,
        legalEntityId: target.unit.legalEntityId,
        brandId: target.brandId,
      })
      .onConflictDoNothing();
  }
  const poolIds = new Set(plan.poolIds);
  for (const target of plan.pools.values()) {
    const [row] = await context.tx
      .select({ id: costPool.id })
      .from(costPool)
      .where(
        and(
          eq(costPool.bookId, target.bookId),
          eq(costPool.skuId, target.skuId),
          sql`${costPool.siteId} is not distinct from ${target.siteId}::uuid`,
          isNull(costPool.closedAt),
        ),
      );
    if (row === undefined) throw new CommandDefect('A cost pool just created is not visible to its actor');
    poolIds.add(row.id);
  }
  const transitIds = new Set<string>();
  for (const target of transits) {
    const [row] = await context.tx
      .select({ id: transitValue.id })
      .from(transitValue)
      .where(
        and(
          eq(transitValue.transitKind, target.kind),
          eq(transitValue.transitRef, target.ref),
          eq(transitValue.bookId, target.bookId),
          eq(transitValue.skuId, target.skuId),
        ),
      );
    if (row === undefined) throw new CommandDefect('A transit value just created is not visible to its actor');
    transitIds.add(row.id);
  }
  await step(
    LOCK_STEP.costPoolAndDispatchValue,
    [
      ...[...poolIds].map((id) => ({ table: COST_POOL, id, mode: 'exclusive' as const })),
      ...[...transitIds].map((id) => ({ table: TRANSIT_VALUE, id, mode: 'exclusive' as const })),
    ],
    extra[6],
  );
  return { plan, skuBalanceIds, poolIds: [...poolIds], transitIds: [...transitIds], missing };
}

/**
 * The pool admission of 14.3 (code-house-rules 6.2; migration 0057): names, for the rest of the transaction, each pool
 * the request's items reach, so a poster whose scope covers the items' places but not the pool, such as a seller of
 * one Store under a book or Site pool (SL-25 (c), (e)), can lock, value and write it. Called only once steps 2 to 5
 * have locked every row of the items' own places, which row-level security admits only within the actor's scope. It
 * adds to what an earlier request of the same command named.
 */
async function admitPools(context: TransactionContext, plan: LedgerPlan): Promise<void> {
  const keys = [...plan.pools.values()].map((pool) => `${pool.bookId}:${pool.skuId}:${pool.siteId ?? '-'}`);
  if (keys.length === 0) return;
  await context.tx.execute(sql`
    select pg_catalog.set_config('aos.admitted_pools',
      concat_ws(',', nullif(pg_catalog.current_setting('aos.admitted_pools', true), ''), ${keys.join(',')}::text),
      true)`);
}
