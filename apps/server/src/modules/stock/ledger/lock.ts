import { uuidv7 } from '@apparel-os/domain';
import { and, eq } from 'drizzle-orm';
import {
  CommandDefect,
  LOCK_STEP,
  lockTable,
  type LockTarget,
  type TransactionContext,
} from '../../../kernel/index.js';
import { skuBalance, unitAnchor } from './db/schema.js';
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

/** Targets a caller adds to the ledger's steps 2 to 6 (13.1 "Lock"). */
export type ExtraTargets = Partial<Record<2 | 3 | 4 | 5 | 6, readonly LockTarget[]>>;

/** A plan whose rows are locked (13.1 "Lock"). */
export interface LockedPlan {
  readonly plan: LedgerPlan;
  readonly skuBalanceIds: readonly string[];
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
  await step(LOCK_STEP.costPoolAndDispatchValue, [], extra[6]);
  return { plan, skuBalanceIds, missing };
}
