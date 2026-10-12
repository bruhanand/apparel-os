import { paise, type Paise } from '@apparel-os/domain';
import { and, asc, eq, inArray, type SQL } from 'drizzle-orm';
import type { TransactionContext } from '../../../../kernel/index.js';
import { costLayer, costPool, transitValue, valuation } from '../db/schema.js';
import { sumPaise, type Formula, type PoolMode } from '../domain/valuation.js';

// The ledger's reads of value (stock-ledger 13.6 "Value" and "Inventory reconciliation"; S1-F10-T03): pools and FIFO
// layers, values held on dispatches and shipments, and each valued movement's effect on them, for matching with the
// posting-source rows of books-and-posting 8.3 (PRD-LED-008). They take no lock and run in the reader's transaction
// under the reader's actor, so row-level security filters what each reader sees (PRD-SEC-005; 14.3). Each answers the
// time it was read; reads as of an earlier time arrive with the reports that use them. Cost and value are the
// restricted class cost (13.6), which the routes that serve these reads mask; no route serves them yet.

export interface ValueLayer {
  readonly id: string;
  readonly enteredSequence: number;
  readonly quantityIn: number;
  readonly quantityLeft: number;
  readonly valueInPaise: Paise;
  readonly valueLeftPaise: Paise;
  readonly fromLayerId: string | null;
  readonly receiptOriginId: string | null;
}

export interface PoolValue {
  readonly id: string;
  readonly bookId: string;
  readonly skuId: string;
  readonly poolMode: PoolMode;
  readonly siteId: string | null;
  readonly formula: Formula;
  readonly costSettingVersionId: string;
  readonly quantity: number;
  readonly valuePaise: Paise;
  /** Under FIFO its layers, oldest first. */
  readonly layers: ValueLayer[];
}

export interface TransitHeld {
  readonly id: string;
  readonly transitKind: string;
  readonly transitRef: string;
  readonly bookId: string;
  readonly skuId: string;
  readonly quantity: number;
  readonly valuePaise: Paise;
}

/** Value (13.6; PRD-LED-014, PRD-LED-015): the open pools with their layers, and the values held in transit, now. */
export async function value(
  context: TransactionContext,
  query: { readonly bookId?: string; readonly skuId?: string },
): Promise<{ readonly asOf: string; readonly pools: PoolValue[]; readonly transits: TransitHeld[] }> {
  const poolFilters: SQL[] = [];
  const transitFilters: SQL[] = [];
  if (query.bookId !== undefined) {
    poolFilters.push(eq(costPool.bookId, query.bookId));
    transitFilters.push(eq(transitValue.bookId, query.bookId));
  }
  if (query.skuId !== undefined) {
    poolFilters.push(eq(costPool.skuId, query.skuId));
    transitFilters.push(eq(transitValue.skuId, query.skuId));
  }
  const pools = await context.tx
    .select()
    .from(costPool)
    .where(and(...poolFilters))
    .orderBy(asc(costPool.id));
  const layers =
    pools.length === 0
      ? []
      : await context.tx
          .select()
          .from(costLayer)
          .where(
            inArray(
              costLayer.costPoolId,
              pools.map((row) => row.id),
            ),
          )
          .orderBy(asc(costLayer.enteredSequence), asc(costLayer.id));
  const transits = await context.tx
    .select()
    .from(transitValue)
    .where(and(...transitFilters))
    .orderBy(asc(transitValue.id));
  return {
    asOf: context.startedAt.toISOString(),
    pools: pools.map((row) => ({
      id: row.id,
      bookId: row.bookId,
      skuId: row.skuId,
      poolMode: row.poolMode,
      siteId: row.siteId,
      formula: row.formula,
      costSettingVersionId: row.costSettingVersionId,
      quantity: row.quantity,
      valuePaise: row.valuePaise,
      layers: layers
        .filter((layer) => layer.costPoolId === row.id)
        .map((layer) => ({
          id: layer.id,
          enteredSequence: layer.enteredSequence,
          quantityIn: layer.quantityIn,
          quantityLeft: layer.quantityLeft,
          valueInPaise: layer.valueInPaise,
          valueLeftPaise: layer.valueLeftPaise,
          fromLayerId: layer.fromLayerId,
          receiptOriginId: layer.receiptOriginId,
        })),
    })),
    transits: transits.map((row) => ({
      id: row.id,
      transitKind: row.transitKind,
      transitRef: row.transitRef,
      bookId: row.bookId,
      skuId: row.skuId,
      quantity: row.quantity,
      valuePaise: row.valuePaise,
    })),
  };
}

/** One valued movement's effect on the pools and transit values of a book (13.6 "Inventory reconciliation"). */
export interface ReconciledMovement {
  readonly movementId: string;
  readonly eventKind: string;
  /** The signed change of the book's pool value, which the inventory account matches (PRD-LED-008). */
  readonly poolValuePaise: Paise;
  /** The signed change of the value held on dispatches and shipments. */
  readonly transitValuePaise: Paise;
}

/**
 * Inventory reconciliation (13.6; books-and-posting 8.3; PRD-LED-008): the pool value of a book and the value held in
 * transit, and each valued movement's effect on them, so the posting-source rows, keyed by the movement, reconcile the
 * inventory account with the ledger movement by movement.
 */
export async function inventoryReconciliation(
  context: TransactionContext,
  bookId: string,
): Promise<{
  readonly asOf: string;
  readonly poolValuePaise: Paise;
  readonly transitValuePaise: Paise;
  readonly movements: ReconciledMovement[];
}> {
  const pools = await context.tx
    .select({ id: costPool.id, value: costPool.valuePaise })
    .from(costPool)
    .where(eq(costPool.bookId, bookId));
  const transits = await context.tx
    .select({ id: transitValue.id, value: transitValue.valuePaise })
    .from(transitValue)
    .where(eq(transitValue.bookId, bookId));
  const poolIds = new Set(pools.map((row) => row.id));
  const transitIds = new Set(transits.map((row) => row.id));
  const rows =
    pools.length + transits.length === 0
      ? []
      : await context.tx.select().from(valuation).orderBy(asc(valuation.movementId), asc(valuation.id));
  const byMovement = new Map<string, { eventKind: string; pool: number; transit: number }>();
  for (const row of rows) {
    const inPool = row.costPoolId !== null && poolIds.has(row.costPoolId);
    const inTransit = row.transitValueId !== null && transitIds.has(row.transitValueId);
    if (!inPool && !inTransit) continue;
    const sum = byMovement.get(row.movementId) ?? { eventKind: row.eventKind, pool: 0, transit: 0 };
    if (inPool) sum.pool += row.valueDeltaPaise;
    else sum.transit += row.valueDeltaPaise;
    byMovement.set(row.movementId, sum);
  }
  return {
    asOf: context.startedAt.toISOString(),
    poolValuePaise: sumPaise(pools.map((row) => row.value)),
    transitValuePaise: sumPaise(transits.map((row) => row.value)),
    movements: [...byMovement].map(([movementId, sum]) => ({
      movementId,
      eventKind: sum.eventKind,
      poolValuePaise: paise(sum.pool),
      transitValuePaise: paise(sum.transit),
    })),
  };
}
