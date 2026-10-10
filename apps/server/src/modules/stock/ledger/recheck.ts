import { uuidv7 } from '@apparel-os/domain';
import { and, eq, gt, inArray, notInArray, or, sql } from 'drizzle-orm';
import type { TransactionContext } from '../../../kernel/index.js';
import {
  balance,
  costLayer,
  costPool,
  coverage,
  hold,
  holdClaim,
  holdRelease,
  piece,
  receiptOrigin,
  receiptOriginState,
  reservation,
  reservationClaim,
  skuBalance,
  movement,
  movementLeg,
  movementPiece,
  transitValue,
  transitValueLayer,
  valuation,
  valuationLayer,
} from './db/schema.js';
import { Valuing, type SaleState, type TransitState, type ValuingInputs } from './domain/valuing.js';
import type { Formula, PoolMode, PoolState } from './domain/valuation.js';
import { paise } from '@apparel-os/domain';
import { recheckHidden, type HiddenAnswer } from './db/recheck-hidden.js';
import { refusalOf, StockRefused, type Condition, type ItemValue } from './domain/request.js';
import {
  Working,
  type BalanceState,
  type ClaimState,
  type CoverageState,
  type HeaderState,
  type OriginState,
  type PieceState,
  type HeldAs,
  type SkuBalanceState,
  type TransitKind,
} from './domain/working.js';
import type { LockedPlan } from './lock.js';
import type { LedgerPlan } from './plan.js';

// Recheck and value (stock-ledger 13.1; 10.4; S1-F10-T02): reads under the locks the rows the request touches, then
// checks every item in order against them, and asks the narrowly authorised function about what the actor cannot see
// (DEC-117), once for the count freezes and once for the claims. Writes nothing.

/** A request rechecked and valued under the locks (13.1 "Recheck and value"). Writes nothing. */
export interface CheckedRequest {
  readonly plan: LedgerPlan;
  readonly working: Valuing;
  /** Each item's value on its approval basis, and the request's (PRD-ACS-015, PRD-ACS-016, DEC-066). */
  readonly itemValues: readonly ItemValue[];
  readonly value: ItemValue;
}

/** Rechecks a locked plan; throws `StockRefused` with the first refusal (13.8). */
export async function recheckPlan(context: TransactionContext, locked: LockedPlan): Promise<CheckedRequest> {
  const { plan } = locked;
  // Every target must be locked, the unit anchors too, or the count-freeze interlock would be skipped (14.3).
  const [lost] = locked.missing;
  if (lost !== undefined) {
    throw new StockRefused(
      refusalOf('invalid-item', undefined, [{ kind: lost.table.table.replaceAll('_', '-'), id: lost.id }]),
    );
  }
  const working = new Valuing(await load(context, locked));
  await checkFreezes(context, plan, working);
  const itemValues = plan.request.items.map((item, line) => working.apply(item, line));
  await checkHidden(context, plan, working);
  return { plan, working, itemValues, value: requestValue(itemValues) };
}

/** The request's value on its approval basis: Unknown when any item's is, the sum when any is known (PRD-ACS-016). */
function requestValue(values: readonly ItemValue[]): ItemValue {
  if (values.some((each) => each.kind === 'unknown')) return { kind: 'unknown' };
  const known = values.flatMap((each) => (each.kind === 'known' ? [each.amountPaise] : []));
  if (known.length === 0) return { kind: 'none' };
  return { kind: 'known', amountPaise: paise(known.reduce((sum, each) => sum + each, 0)) };
}

/** The first line the function answered for, in the request's order (13.8 names the item's line). */
function firstLine(answers: readonly HiddenAnswer[]): number | undefined {
  return answers.reduce<number | undefined>(
    (first, each) => (first === undefined || each.line < first ? each.line : first),
    undefined,
  );
}

/**
 * The count-freeze check (8.1; 13.4, 13.5): a freeze not yet ended whose scope covers a location, SKU or brand an item
 * touches stops it. A freeze the actor can see is named (`count-freeze-active`); one it cannot is a generic refusal
 * that names nothing of it (`blocked`; DEC-117). The freeze rows start and end only under the unit's anchor held
 * exclusively, and every item holds it shared, so what is read here holds until the commit (14.3).
 */
async function checkFreezes(context: TransactionContext, plan: LedgerPlan, working: Working): Promise<void> {
  const answers = await recheckHidden(context, {
    touches: plan.request.items.flatMap((item, line) => working.touches(item).map((touch) => ({ ...touch, line }))),
  });
  const line = firstLine(answers);
  if (line === undefined) return;
  const lineId = plan.request.items[line]?.lineId;
  const visible = answers.filter((each) => each.line === line && each.blocker === 'count-freeze');
  if (visible.length > 0) {
    throw new StockRefused(
      refusalOf(
        'count-freeze-active',
        lineId,
        visible.map((each) => ({ kind: 'count-freeze', holdId: each.holdId ?? '' })),
      ),
    );
  }
  throw new StockRefused(refusalOf('blocked', lineId));
}

/**
 * The rest of DEC-117: claims of holds and reservations the actor cannot see that take a piece the request takes, more
 * units of a balance than an item left free there, or more of an origin's covered quantity than a reservation left,
 * refuse the request generically (`blocked`), naming the first item they stop (13.8).
 */
async function checkHidden(context: TransactionContext, plan: LedgerPlan, working: Working): Promise<void> {
  const answers = await recheckHidden(context, {
    ...working.hidden,
    countedBalances: [...working.balances.values()].filter((row) => !row.isNew).map((row) => row.id),
  });
  const line = firstLine(answers);
  if (line !== undefined) throw new StockRefused(refusalOf('blocked', plan.request.items[line]?.lineId));
}

const scopeOf = (row: {
  siteId: string;
  storeId: string | null;
  businessUnitId: string;
  legalEntityId: string;
  brandId: string | null;
}) => ({
  siteId: row.siteId,
  storeId: row.storeId,
  businessUnitId: row.businessUnitId,
  legalEntityId: row.legalEntityId,
  brandId: row.brandId,
});

const headerScope = (row: {
  siteId: string;
  storeId: string | null;
  businessUnitId: string;
  legalEntityId: string;
}) => ({
  siteId: row.siteId,
  storeId: row.storeId,
  businessUnitId: row.businessUnitId,
  legalEntityId: row.legalEntityId,
});

/** The rows read under the locks (code-house-rules 8.1): every one locked, or changed only under a lock held. */
async function load(context: TransactionContext, locked: LockedPlan): Promise<ValuingInputs> {
  const { plan } = locked;
  const totalIds = [...locked.skuBalanceIds];
  const totals =
    totalIds.length === 0 ? [] : await context.tx.select().from(skuBalance).where(inArray(skuBalance.id, totalIds));
  // An origin whose coverage the request counts must have no stock under a SKU balance it did not lock (13.1, 13.9).
  if (plan.coverageOrigins.size > 0) {
    const elsewhere = await context.tx
      .select({ id: balance.id })
      .from(balance)
      .where(
        and(
          inArray(balance.receiptOriginId, [...plan.coverageOrigins]),
          gt(balance.quantity, 0),
          totalIds.length === 0 ? sql`true` : notInArray(balance.skuBalanceId, totalIds),
        ),
      );
    if (elsewhere.length > 0) throw new StockRefused(refusalOf('plan-stale', plan.request.items[0]?.lineId));
  }
  const freezeUnits = [...plan.freezeUnits].map((at) => at.split('|'));
  const balanceRows = await context.tx
    .select()
    .from(balance)
    .where(
      or(
        totalIds.length === 0 ? sql`false` : inArray(balance.skuBalanceId, totalIds),
        ...freezeUnits.map(([siteId, unitId]) =>
          and(eq(balance.siteId, siteId ?? ''), eq(balance.businessUnitId, unitId ?? '')),
        ),
      ),
    );
  const pieceRows =
    plan.pieceIds.size === 0
      ? []
      : await context.tx
          .select()
          .from(piece)
          .where(inArray(piece.id, [...plan.pieceIds]));
  const coverageIds = [...plan.coverageIds];
  const coverageRows =
    coverageIds.length === 0 ? [] : await context.tx.select().from(coverage).where(inArray(coverage.id, coverageIds));
  const removed =
    coverageIds.length === 0
      ? []
      : await context.tx
          .select({ id: coverage.removesCoverageId })
          .from(coverage)
          .where(inArray(coverage.removesCoverageId, coverageIds));
  const originIds = new Set<string>([
    ...plan.originIds.keys(),
    ...balanceRows.map((row) => row.receiptOriginId),
    ...pieceRows.map((row) => row.receiptOriginId),
  ]);
  const originRows =
    originIds.size === 0
      ? []
      : await context.tx
          .select({ origin: receiptOrigin, state: receiptOriginState })
          .from(receiptOrigin)
          .innerJoin(receiptOriginState, eq(receiptOriginState.receiptOriginId, receiptOrigin.id))
          .where(inArray(receiptOrigin.id, [...originIds]));
  const balanceIds = balanceRows.map((row) => row.id);
  const pieceIds = [...plan.pieceIds];
  const holdIds = [...plan.holdIds];
  const reservationIds = [...plan.reservationIds];
  const holdClaims = await context.tx
    .select({
      claim: holdClaim,
      header: { id: hold.id, kind: hold.kind, withinReservationId: hold.withinReservationId },
    })
    .from(holdClaim)
    .innerJoin(hold, eq(hold.id, holdClaim.holdId))
    .where(
      and(
        gt(holdClaim.quantity, 0),
        or(
          balanceIds.length === 0 ? sql`false` : inArray(holdClaim.balanceId, balanceIds),
          pieceIds.length === 0 ? sql`false` : inArray(holdClaim.pieceId, pieceIds),
          holdIds.length === 0 ? sql`false` : inArray(holdClaim.holdId, holdIds),
        ),
      ),
    );
  const reservationClaims = await context.tx
    .select({ claim: reservationClaim, header: { id: reservation.id, kind: reservation.kind } })
    .from(reservationClaim)
    .innerJoin(reservation, eq(reservation.id, reservationClaim.reservationId))
    .where(
      and(
        gt(reservationClaim.quantity, 0),
        or(
          balanceIds.length === 0 ? sql`false` : inArray(reservationClaim.balanceId, balanceIds),
          pieceIds.length === 0 ? sql`false` : inArray(reservationClaim.pieceId, pieceIds),
          reservationIds.length === 0 ? sql`false` : inArray(reservationClaim.reservationId, reservationIds),
        ),
      ),
    );
  const holdHeaders = holdIds.length === 0 ? [] : await context.tx.select().from(hold).where(inArray(hold.id, holdIds));
  const freezeEnds =
    holdIds.length === 0
      ? []
      : await context.tx
          .select({ holdId: holdRelease.holdId })
          .from(holdRelease)
          .where(and(inArray(holdRelease.holdId, holdIds), eq(holdRelease.holdKind, 'count-freeze')));
  const reservationHeaders =
    reservationIds.length === 0
      ? []
      : await context.tx.select().from(reservation).where(inArray(reservation.id, reservationIds));
  const ended = new Set(freezeEnds.map((row) => row.holdId));
  return {
    businessDate: plan.businessDate,
    units: plan.units,
    skus: plan.skus,
    skuBalances: totals.map((row): SkuBalanceState => ({
      id: row.id,
      siteId: row.siteId,
      businessUnitId: row.businessUnitId,
      skuId: row.skuId,
      quantity: row.quantity,
      changed: false,
    })),
    balances: balanceRows.map((row): BalanceState => ({
      id: row.id,
      isNew: false,
      skuBalanceId: row.skuBalanceId,
      siteId: row.siteId,
      businessUnitId: row.businessUnitId,
      locationId: row.locationId,
      condition: row.condition as Condition,
      heldAs: row.heldAs as HeldAs,
      transitKind: row.transitKind as TransitKind | null,
      transitRef: row.transitRef,
      skuId: row.skuId,
      batchCode: row.batchCode,
      expiryDate: row.expiryDate,
      receiptOriginId: row.receiptOriginId,
      countDate: row.countDate,
      scope: scopeOf(row),
      quantity: row.quantity,
      accepted: row.acceptedQuantity,
      changed: false,
    })),
    origins: originRows.map(({ origin, state }): OriginState => ({
      id: origin.id,
      isNew: false,
      skuId: origin.skuId,
      pieceTracked: origin.pieceTracked,
      batchCode: origin.batchCode,
      expiryDate: origin.expiryDate,
      countDate: origin.countDate,
      quantity: origin.quantity,
      scope: scopeOf(origin),
      stateId: state.id,
      ownerKind: state.ownerKind as OriginState['ownerKind'],
      valueKnown: state.valueKnown,
      pRatePaise: state.pRatePaise,
      establishedValuePaise: state.establishedValuePaise,
      ptRevisionId: state.ptRevisionId,
      coveredQuantity: state.coveredQuantity,
      lastStateMovementId: state.lastStateMovementId,
      stateChanged: false,
    })),
    pieces: pieceRows.map((row): PieceState => ({
      id: row.id,
      isNew: false,
      code: row.code,
      skuId: row.skuId,
      receiptOriginId: row.receiptOriginId,
      siteId: row.siteId,
      storeId: row.storeId,
      businessUnitId: row.businessUnitId,
      legalEntityId: row.legalEntityId,
      brandId: row.brandId,
      locationId: row.locationId,
      condition: row.condition as Condition,
      heldAs: row.heldAs as PieceState['heldAs'],
      transitKind: row.transitKind as TransitKind | null,
      transitRef: row.transitRef,
      inCustody: row.inCustody,
      ptRevisionId: row.ptRevisionId,
      acceptedSiteId: row.acceptedSiteId,
      lastMovementId: row.lastMovementId,
      changed: false,
    })),
    claims: [
      ...holdClaims.map(({ claim, header }): ClaimState => ({
        id: claim.id,
        isNew: false,
        owner: 'hold',
        headerId: header.id,
        headerKind: header.kind,
        withinReservationId: header.withinReservationId,
        balanceId: claim.balanceId,
        pieceId: claim.pieceId,
        claimed: claim.claimedQuantity,
        scope: scopeOf(claim),
        quantity: claim.quantity,
        changed: false,
      })),
      ...reservationClaims.map(({ claim, header }): ClaimState => ({
        id: claim.id,
        isNew: false,
        owner: 'reservation',
        headerId: header.id,
        headerKind: header.kind,
        withinReservationId: null,
        balanceId: claim.balanceId,
        pieceId: claim.pieceId,
        claimed: claim.claimedQuantity,
        scope: scopeOf(claim),
        quantity: claim.quantity,
        changed: false,
      })),
    ],
    headers: [
      ...holdHeaders.map((row): HeaderState => ({
        id: row.id,
        owner: 'hold',
        kind: row.kind,
        scope: headerScope(row),
        ended: ended.has(row.id),
      })),
      ...reservationHeaders.map((row): HeaderState => ({
        id: row.id,
        owner: 'reservation',
        kind: row.kind,
        scope: headerScope(row),
        ended: false,
      })),
    ],
    coverage: coverageRows.map((row): CoverageState => ({
      id: row.id,
      action: row.action as 'cover' | 'remove',
      ptRevisionId: row.ptRevisionId,
      receiptOriginId: row.receiptOriginId,
      pieceId: row.pieceId,
      quantity: row.quantity,
      removed: removed.some((each) => each.id === row.id),
      scope: scopeOf(row),
    })),
    originsSeen: plan.originsSeen,
    usedCodes: plan.usedCodes,
    lockedReservations: plan.reservationIds,
    newId: uuidv7,
    ...(await loadValuing(context, locked)),
  };
}

type ValuingOnly = Pick<
  ValuingInputs,
  'costSettings' | 'pools' | 'transits' | 'sales' | 'entered' | 'handedOver' | 'lineage' | 'occurredAt'
>;

/**
 * What the valued items read under the locks (7, 13.1 "Recheck and value"): the pools and transit values locked at
 * step 6 with their layers, the sales the returns bring back, and for a late cost change the units its origin's cost
 * put into pools, those handed over to a supplier and, under FIFO, its layers' lineage, every pool of which must be
 * locked (`plan-stale` otherwise; 13.1).
 */
async function loadValuing(context: TransactionContext, locked: LockedPlan): Promise<ValuingOnly> {
  const { plan } = locked;
  const poolIds = [...locked.poolIds];
  const poolRows =
    poolIds.length === 0 ? [] : await context.tx.select().from(costPool).where(inArray(costPool.id, poolIds));
  const layerRows =
    poolIds.length === 0
      ? []
      : await context.tx
          .select()
          .from(costLayer)
          .where(inArray(costLayer.costPoolId, poolIds))
          .orderBy(costLayer.enteredSequence, costLayer.id);
  const pools: PoolState[] = poolRows.map((row) => ({
    id: row.id,
    isNew: false,
    bookId: row.bookId,
    skuId: row.skuId,
    mode: row.poolMode as PoolMode,
    siteId: row.siteId,
    formula: row.formula as Formula,
    costSettingVersionId: row.costSettingVersionId,
    legalEntityId: row.legalEntityId,
    brandId: row.brandId,
    quantity: row.quantity,
    value: row.valuePaise,
    lastSequence: row.lastSequence,
    changed: false,
    layers: layerRows
      .filter((layer) => layer.costPoolId === row.id)
      .map((layer) => ({
        id: layer.id,
        isNew: false,
        poolId: layer.costPoolId,
        enteredSequence: layer.enteredSequence,
        enteredAt: layer.enteredAt,
        quantityIn: layer.quantityIn,
        valueIn: layer.valueInPaise,
        quantityLeft: layer.quantityLeft,
        valueLeft: layer.valueLeftPaise,
        fromLayerId: layer.fromLayerId,
        receiptOriginId: layer.receiptOriginId,
        fromValuationId: layer.fromValuationId,
        changed: false,
      })),
  }));
  const transitIds = [...locked.transitIds];
  const transitRows =
    transitIds.length === 0
      ? []
      : await context.tx.select().from(transitValue).where(inArray(transitValue.id, transitIds));
  const transitLayers =
    transitIds.length === 0
      ? []
      : await context.tx
          .select({ layer: transitValueLayer, order: costLayer.enteredSequence })
          .from(transitValueLayer)
          .innerJoin(costLayer, eq(costLayer.id, transitValueLayer.sourceLayerId))
          .where(inArray(transitValueLayer.transitValueId, transitIds));
  const transitPieces =
    transitIds.length === 0
      ? []
      : await context.tx
          .select({
            transitId: valuation.transitValueId,
            pieceId: valuationLayer.pieceId,
            layerId: valuationLayer.costLayerId,
          })
          .from(valuationLayer)
          .innerJoin(valuation, eq(valuation.id, valuationLayer.valuationId))
          .where(and(inArray(valuation.transitValueId, transitIds), gt(valuationLayer.valuePaise, 0)))
          .orderBy(valuationLayer.id);
  const transits: TransitState[] = transitRows.map((row) => ({
    id: row.id,
    kind: row.transitKind as TransitKind,
    ref: row.transitRef,
    bookId: row.bookId,
    skuId: row.skuId,
    scope: scopeOf(row),
    quantity: row.quantity,
    value: row.valuePaise,
    changed: false,
    layers: transitLayers
      .filter((each) => each.layer.transitValueId === row.id)
      .map((each) => ({
        id: each.layer.id,
        isNew: false,
        sourceLayerId: each.layer.sourceLayerId,
        order: each.order,
        quantity: each.layer.quantity,
        value: each.layer.valuePaise,
        changed: false,
      })),
    pieceLayers: new Map(
      transitPieces.flatMap((each) =>
        each.transitId === row.id && each.pieceId !== null ? [[each.pieceId, each.layerId] as const] : [],
      ),
    ),
  }));
  const sales: SaleState[] = [];
  for (const saleId of plan.saleIds) sales.push(await loadSale(context, saleId));
  const adjusted = plan.request.items.flatMap((item) =>
    item.kind === 'cost-adjustment' ? [item.receiptOriginId] : [],
  );
  const entered = new Map<string, number>();
  const handedOver = new Map<string, number>();
  const lineage = new Map<string, { layerIds: ReadonlySet<string>; handedOver: number }>();
  for (const originId of adjusted) {
    const [established] = await context.tx
      .select({ quantity: sql<number>`coalesce(sum(${valuation.quantityDelta}), 0)::integer` })
      .from(valuation)
      .where(
        and(
          eq(valuation.receiptOriginId, originId),
          eq(valuation.eventKind, 'stock.cost-established'),
          gt(valuation.quantityDelta, 0),
        ),
      );
    entered.set(originId, established?.quantity ?? 0);
    const [handed] = await context.tx
      .select({ quantity: sql<number>`coalesce(sum(${movementLeg.quantity}), 0)::integer` })
      .from(movementLeg)
      .innerJoin(movement, eq(movement.id, movementLeg.movementId))
      .where(
        and(
          eq(movementLeg.receiptOriginId, originId),
          eq(movement.kind, 'supplier-handover'),
          eq(movementLeg.direction, 'out'),
        ),
      );
    handedOver.set(originId, handed?.quantity ?? 0);
    const layers = await context.tx.execute<{ id: string; pool: string }>(sql`
      with recursive l as (
        select id, cost_pool_id from stock.cost_layer where receipt_origin_id = ${originId}::uuid
        union
        select c.id, c.cost_pool_id from stock.cost_layer c join l on c.from_layer_id = l.id)
      select id, cost_pool_id as pool from l`);
    if (layers.rows.some((row) => !poolIds.includes(row.pool))) {
      throw new StockRefused(refusalOf('plan-stale', plan.request.items[0]?.lineId));
    }
    const layerIds = new Set(layers.rows.map((row) => row.id));
    const [handedFifo] =
      layerIds.size === 0
        ? [{ quantity: 0 }]
        : await context.tx
            .select({ quantity: sql<number>`coalesce(sum(${valuationLayer.quantity}), 0)::integer` })
            .from(valuationLayer)
            .innerJoin(valuation, eq(valuation.id, valuationLayer.valuationId))
            .where(
              and(
                inArray(valuationLayer.costLayerId, [...layerIds]),
                eq(valuation.eventKind, 'stock.supplier-handover'),
              ),
            );
    lineage.set(originId, { layerIds, handedOver: handedFifo?.quantity ?? 0 });
  }
  return {
    costSettings: plan.costSettings,
    pools,
    transits,
    sales,
    entered,
    handedOver,
    lineage,
    occurredAt: plan.occurredAt,
  };
}

/** A sale a customer return brings back (7.5): its legs, pieces, valuations and the returns made of it so far. */
async function loadSale(context: TransactionContext, saleId: string): Promise<SaleState> {
  const [sale] = await context.tx.select().from(movement).where(eq(movement.id, saleId));
  if (sale === undefined) {
    throw new StockRefused(refusalOf('invalid-item', undefined, [{ kind: 'movement', movementId: saleId }]));
  }
  const legs = await context.tx
    .select({ originId: movementLeg.receiptOriginId, quantity: movementLeg.quantity })
    .from(movementLeg)
    .where(eq(movementLeg.movementId, saleId))
    .orderBy(movementLeg.id);
  const pieces = await context.tx
    .select({ pieceId: movementPiece.pieceId })
    .from(movementPiece)
    .where(eq(movementPiece.movementId, saleId));
  const valuations = await context.tx
    .select()
    .from(valuation)
    .where(and(eq(valuation.movementId, saleId), sql`${valuation.costPoolId} is not null`));
  const valued = new Map<string, { quantity: number; value: number }>();
  for (const row of valuations) {
    const sum = valued.get(row.receiptOriginId) ?? { quantity: 0, value: 0 };
    sum.quantity -= row.quantityDelta;
    sum.value -= row.valueDeltaPaise;
    valued.set(row.receiptOriginId, sum);
  }
  const layers =
    valuations.length === 0
      ? []
      : await context.tx
          .select({ layer: valuationLayer, originId: valuation.receiptOriginId })
          .from(valuationLayer)
          .innerJoin(valuation, eq(valuation.id, valuationLayer.valuationId))
          .where(
            inArray(
              valuationLayer.valuationId,
              valuations.map((row) => row.id),
            ),
          )
          .orderBy(valuationLayer.id);
  const returns = await context.tx
    .select({ id: movement.id })
    .from(movement)
    .where(eq(movement.returnsMovementId, saleId));
  const returnIds = returns.map((row) => row.id);
  const returned = new Map<string, { quantity: number; value: number }>();
  const returnedFromLayer = new Map<string, { quantity: number; value: number }>();
  if (returnIds.length > 0) {
    const returnLegs = await context.tx
      .select({ originId: movementLeg.receiptOriginId, quantity: movementLeg.quantity })
      .from(movementLeg)
      .where(inArray(movementLeg.movementId, returnIds));
    for (const leg of returnLegs) {
      const sum = returned.get(leg.originId) ?? { quantity: 0, value: 0 };
      sum.quantity += leg.quantity;
      returned.set(leg.originId, sum);
    }
    const returnValues = await context.tx
      .select({ originId: valuation.receiptOriginId, value: valuation.valueDeltaPaise })
      .from(valuation)
      .where(and(inArray(valuation.movementId, returnIds), sql`${valuation.costPoolId} is not null`));
    for (const row of returnValues) {
      const sum = returned.get(row.originId) ?? { quantity: 0, value: 0 };
      sum.value += row.value;
      returned.set(row.originId, sum);
    }
    const returnLayers = await context.tx
      .select({ from: costLayer.fromLayerId, quantity: valuationLayer.quantity, value: valuationLayer.valuePaise })
      .from(valuationLayer)
      .innerJoin(valuation, eq(valuation.id, valuationLayer.valuationId))
      .innerJoin(costLayer, eq(costLayer.id, valuationLayer.costLayerId))
      .where(inArray(valuation.movementId, returnIds));
    for (const row of returnLayers) {
      if (row.from === null) continue;
      const sum = returnedFromLayer.get(row.from) ?? { quantity: 0, value: 0 };
      sum.quantity += row.quantity;
      sum.value += row.value;
      returnedFromLayer.set(row.from, sum);
    }
  }
  return {
    id: sale.id,
    siteId: sale.siteId,
    businessUnitId: sale.businessUnitId,
    legs,
    pieceIds: new Set(pieces.map((row) => row.pieceId)),
    valued,
    layers: layers.map((row) => ({
      originId: row.originId,
      layerId: row.layer.costLayerId,
      pieceId: row.layer.pieceId,
      quantity: row.layer.quantity,
      value: -row.layer.valuePaise,
    })),
    returned,
    returnedFromLayer,
  };
}
