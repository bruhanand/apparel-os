import { and, eq, gt, inArray } from 'drizzle-orm';
import type { TransactionContext } from '../../../kernel/index.js';
import { balance, coverage, hold, holdClaim, piece, receiptOrigin, reservationClaim } from './db/schema.js';
import { skuKey, unitKey, type UnitKey } from './domain/keys.js';
import { refusalOf, StockRefused, type Goods, type LedgerItem, type LedgerRequest } from './domain/request.js';
import type { LedgerPlaces, LedgerSkus, SkuFacts, UnitFacts } from './ports.js';

// Plan (stock-ledger 13.1; S1-F10-T02): before any lock, reads the places and SKUs as of the business date and finds
// the receipt origins, pieces, balances, holds and reservations the items touch. Writes nothing and locks nothing.

/** The plan of a request (13.1 "Plan"): what it read before any lock, and what Lock locks at steps 2 to 5. */
export interface LedgerPlan {
  readonly request: LedgerRequest;
  readonly businessDate: string;
  readonly occurredAt: Date;
  readonly units: ReadonlyMap<UnitKey, UnitFacts>;
  readonly skus: ReadonlyMap<string, SkuFacts>;
  readonly anchors: readonly AnchorTarget[];
  readonly skuBalances: readonly SkuBalanceTarget[];
  readonly originIds: ReadonlyMap<string, 'exclusive' | 'shared'>;
  readonly pieceIds: ReadonlySet<string>;
  readonly holdIds: ReadonlySet<string>;
  readonly reservationIds: ReadonlySet<string>;
  readonly coverageIds: ReadonlySet<string>;
  readonly freezeUnits: ReadonlySet<UnitKey>;
  /** Per SKU at a Site and unit, the origins with stock there that Plan found (13.1 "Plan staleness"). */
  readonly originsSeen: ReadonlyMap<string, ReadonlySet<string>>;
  /** Origins whose covered quantity the request counts at every balance of the origin (13.9). */
  readonly coverageOrigins: ReadonlySet<string>;
  readonly usedCodes: ReadonlySet<string>;
}

export interface AnchorTarget {
  readonly unit: UnitFacts;
  readonly mode: 'exclusive' | 'shared';
}

export interface SkuBalanceTarget {
  readonly unit: UnitFacts;
  readonly sku: SkuFacts;
}

/** What Plan reads from: the declared reads of `organisation` and `merchandise` (13.9). */
export interface PlanReads {
  readonly places: LedgerPlaces;
  readonly skus: LedgerSkus;
}

/** Plans a request whose caller is registered (13.1); throws `StockRefused` with the first refusal. */
export async function planRequest(
  context: TransactionContext,
  reads: PlanReads,
  request: LedgerRequest,
  businessDate: string,
): Promise<LedgerPlan> {
  const units = new Map<UnitKey, UnitFacts>();
  const skus = new Map<string, SkuFacts>();
  const anchors = new Map<UnitKey, AnchorTarget>();
  const skuBalances = new Map<string, SkuBalanceTarget>();
  const originIds = new Map<string, 'exclusive' | 'shared'>();
  const pieceCodes = new Map<string, string>();
  const newCodes = new Set<string>();
  const holdIds = new Set<string>();
  const reservationIds = new Set<string>();
  const coverageIds = new Set<string>();
  const freezeUnits = new Set<UnitKey>();
  const quantityGoods = new Map<string, { unit: UnitFacts; sku: SkuFacts }>();
  const coverageOrigins = new Set<string>();
  const reservedSkus = new Set<string>();

  const shared = (originId: string) => {
    if (!originIds.has(originId)) originIds.set(originId, 'shared');
  };
  const unitOf = async (lineId: string, siteId: string, businessUnitId: string): Promise<UnitFacts> => {
    const at = unitKey(siteId, businessUnitId);
    let unit = units.get(at);
    if (unit === undefined) {
      unit = await reads.places.unitAt(context, { siteId, businessUnitId }, businessDate);
      if (unit === undefined)
        throw new StockRefused(refusalOf('place-invalid', lineId, [{ kind: 'unit', businessUnitId }]));
      units.set(at, unit);
    }
    return unit;
  };
  const anchor = (unit: UnitFacts, mode: 'shared' | 'exclusive') => {
    const at = unitKey(unit.siteId, unit.businessUnitId);
    if (anchors.get(at)?.mode !== 'exclusive') anchors.set(at, { unit, mode });
  };
  const place = async (lineId: string, siteId: string, businessUnitId: string, locationId: string) => {
    const unit = await unitOf(lineId, siteId, businessUnitId);
    const location = await reads.places.locationOf(context, locationId);
    if (location?.siteId !== siteId || location.businessUnitId !== businessUnitId) {
      throw new StockRefused(refusalOf('place-invalid', lineId, [{ kind: 'location', locationId }]));
    }
    anchor(unit, 'shared');
    return unit;
  };
  const skuOf = async (lineId: string, skuId: string, siteId: string): Promise<SkuFacts> => {
    let sku = skus.get(skuId);
    if (sku === undefined) {
      sku = await reads.skus.skuAt(context, skuId, siteId, businessDate);
      if (sku === undefined) throw new StockRefused(refusalOf('invalid-item', lineId, [{ kind: 'sku', skuId }]));
      skus.set(skuId, sku);
    }
    return sku;
  };
  const balanceOf = (unit: UnitFacts, sku: SkuFacts) =>
    skuBalances.set(skuKey(unit.siteId, unit.businessUnitId, sku.skuId), { unit, sku });
  const goodsAt = async (lineId: string, unit: UnitFacts, goods: Goods, reserving = false) => {
    const sku = await skuOf(lineId, goods.skuId, unit.siteId);
    balanceOf(unit, sku);
    for (const code of goods.pieceCodes ?? []) pieceCodes.set(code, lineId);
    if (goods.receiptOriginId !== undefined) {
      shared(goods.receiptOriginId);
      if (reserving && !sku.pieceTracked) coverageOrigins.add(goods.receiptOriginId);
    } else if (!sku.pieceTracked) {
      const at = skuKey(unit.siteId, unit.businessUnitId, sku.skuId);
      quantityGoods.set(at, { unit, sku });
      if (reserving) reservedSkus.add(at);
    }
  };
  /** Adds the SKU balances of the claims a release or end will end, so it locks their balances and pieces (13.5). */
  const claimsOf = async (lineId: string, claims: readonly { balanceId: string | null; pieceId: string | null }[]) => {
    for (const claim of claims) {
      if (claim.balanceId !== null) {
        const [row] = await context.tx.select().from(balance).where(eq(balance.id, claim.balanceId));
        if (row?.skuId != null)
          balanceOf(await unitOf(lineId, row.siteId, row.businessUnitId), await skuOf(lineId, row.skuId, row.siteId));
      }
      if (claim.pieceId !== null) {
        const [row] = await context.tx.select({ code: piece.code }).from(piece).where(eq(piece.id, claim.pieceId));
        if (row !== undefined) pieceCodes.set(row.code, lineId);
      }
    }
  };

  const planItem = async (item: LedgerItem) => {
    switch (item.kind) {
      case 'receipt-count': {
        const unit = await place(item.lineId, item.to.siteId, item.to.businessUnitId, item.to.locationId);
        const sku = await skuOf(item.lineId, item.skuId, unit.siteId);
        if (!Number.isInteger(item.quantity) || item.quantity <= 0)
          throw new StockRefused(refusalOf('invalid-item', item.lineId, [{ kind: 'quantity' }]));
        if (sku.batchTracked !== (item.batch !== undefined))
          throw new StockRefused(refusalOf('invalid-item', item.lineId, [{ kind: 'batch' }]));
        const codes = item.pieceCodes ?? [];
        if (
          sku.pieceTracked !== (item.pieceCodes !== undefined) ||
          (sku.pieceTracked && new Set(codes).size !== item.quantity) ||
          codes.some((code) => code.trim() === '')
        ) {
          throw new StockRefused(refusalOf('invalid-item', item.lineId, [{ kind: 'piece-codes' }]));
        }
        for (const code of codes) newCodes.add(code);
        balanceOf(unit, sku);
        return;
      }
      case 'location-move': {
        const from = await place(item.lineId, item.from.siteId, item.from.businessUnitId, item.from.locationId);
        const to = await place(item.lineId, item.from.siteId, item.to.businessUnitId, item.to.locationId);
        await goodsAt(item.lineId, from, item.goods);
        const sku = await skuOf(item.lineId, item.goods.skuId, from.siteId);
        balanceOf(to, sku);
        // Inside one unit a move carries reserved units with their claims, which change only under their
        // reservation's lock (13.9, 14.3; product owner, 8 Oct 2026): the reservations at the place are locked.
        if (from === to && !sku.pieceTracked) {
          const rows = await context.tx
            .selectDistinct({ id: reservationClaim.reservationId })
            .from(reservationClaim)
            .innerJoin(balance, eq(balance.id, reservationClaim.balanceId))
            .where(
              and(
                eq(balance.siteId, from.siteId),
                eq(balance.businessUnitId, from.businessUnitId),
                eq(balance.locationId, item.from.locationId),
                eq(balance.skuId, sku.skuId),
                gt(reservationClaim.quantity, 0),
              ),
            );
          for (const row of rows) reservationIds.add(row.id);
        }
        return;
      }
      case 'condition-change':
      case 'record-acceptance': {
        const unit = await place(item.lineId, item.at.siteId, item.at.businessUnitId, item.at.locationId);
        await goodsAt(item.lineId, unit, item.goods);
        return;
      }
      case 'place-hold':
      case 'reserve': {
        const unit = await place(item.lineId, item.at.siteId, item.at.businessUnitId, item.at.locationId);
        for (const goods of item.goods) await goodsAt(item.lineId, unit, goods, item.kind === 'reserve');
        if (item.kind === 'place-hold' && item.withinReservationId !== undefined)
          reservationIds.add(item.withinReservationId);
        return;
      }
      case 'record-coverage': {
        const [origin] = await context.tx
          .select()
          .from(receiptOrigin)
          .where(eq(receiptOrigin.id, item.receiptOriginId));
        if (origin === undefined)
          throw new StockRefused(
            refusalOf('invalid-item', item.lineId, [{ kind: 'receipt-origin', receiptOriginId: item.receiptOriginId }]),
          );
        originIds.set(item.receiptOriginId, 'exclusive');
        for (const code of item.pieceCodes ?? []) pieceCodes.set(code, item.lineId);
        if (origin.skuId !== null) await skuOf(item.lineId, origin.skuId, origin.siteId);
        return;
      }
      case 'remove-coverage': {
        const [record] = await context.tx.select().from(coverage).where(eq(coverage.id, item.coverageId));
        if (record === undefined)
          throw new StockRefused(
            refusalOf('invalid-item', item.lineId, [{ kind: 'coverage', coverageId: item.coverageId }]),
          );
        coverageIds.add(record.id);
        originIds.set(record.receiptOriginId, 'exclusive');
        if (record.pieceId !== null) await claimsOf(item.lineId, [{ balanceId: null, pieceId: record.pieceId }]);
        // The reservations relying on the coverage are read under the balances' locks, wherever its units are (13.5).
        else coverageOrigins.add(record.receiptOriginId);
        return;
      }
      case 'release-hold':
      case 'end-reservation': {
        const isHold = item.kind === 'release-hold';
        const headerId = isHold ? item.holdId : item.reservationId;
        (isHold ? holdIds : reservationIds).add(headerId);
        await claimsOf(
          item.lineId,
          isHold
            ? await context.tx
                .select()
                .from(holdClaim)
                .where(and(eq(holdClaim.holdId, headerId), gt(holdClaim.quantity, 0)))
            : await context.tx
                .select()
                .from(reservationClaim)
                .where(and(eq(reservationClaim.reservationId, headerId), gt(reservationClaim.quantity, 0))),
        );
        return;
      }
      case 'start-count-freeze':
      case 'end-count-freeze': {
        let at: { siteId: string; businessUnitId: string } | undefined;
        if (item.kind === 'start-count-freeze') at = { siteId: item.siteId, businessUnitId: item.businessUnitId };
        else {
          holdIds.add(item.holdId);
          [at] = await context.tx
            .select({ siteId: hold.siteId, businessUnitId: hold.businessUnitId })
            .from(hold)
            .where(eq(hold.id, item.holdId));
          if (at === undefined)
            throw new StockRefused(refusalOf('invalid-item', item.lineId, [{ kind: 'hold', holdId: item.holdId }]));
        }
        const unit = await unitOf(item.lineId, at.siteId, at.businessUnitId);
        anchor(unit, 'exclusive');
        freezeUnits.add(unitKey(at.siteId, at.businessUnitId));
        if (item.kind === 'start-count-freeze') {
          for (const member of item.scope) {
            if ('locationId' in member) {
              const location = await reads.places.locationOf(context, member.locationId);
              if (location?.siteId !== at.siteId || location.businessUnitId !== at.businessUnitId) {
                throw new StockRefused(
                  refusalOf('place-invalid', item.lineId, [{ kind: 'location', locationId: member.locationId }]),
                );
              }
            }
            if ('skuId' in member) await skuOf(item.lineId, member.skuId, at.siteId);
          }
        }
        return;
      }
    }
  };
  for (const item of request.items) await planItem(item);

  // Plan staleness (13.1): every origin with stock of an unnamed quantity-tracked SKU at the unit is locked shared.
  const originsSeen = new Map<string, Set<string>>();
  for (const [at, { unit, sku }] of quantityGoods) {
    const rows = await context.tx
      .select({ originId: balance.receiptOriginId })
      .from(balance)
      .where(
        and(
          eq(balance.siteId, unit.siteId),
          eq(balance.businessUnitId, unit.businessUnitId),
          eq(balance.skuId, sku.skuId),
          gt(balance.quantity, 0),
        ),
      );
    const seen = new Set(rows.map((row) => row.originId));
    originsSeen.set(at, seen);
    for (const id of seen) {
      shared(id);
      if (reservedSkus.has(at)) coverageOrigins.add(id);
    }
  }

  // An origin's covered quantity is drawn on by reservations at every balance of the origin, so the request locks
  // the SKU balances of every unit where it is (6.2, 13.9; 10.3 step 3).
  if (coverageOrigins.size > 0) {
    const rows = await context.tx
      .selectDistinct({ siteId: balance.siteId, businessUnitId: balance.businessUnitId, skuId: balance.skuId })
      .from(balance)
      .where(inArray(balance.receiptOriginId, [...coverageOrigins]));
    for (const row of rows) {
      if (row.skuId === null) continue;
      const lineId = request.items[0]?.lineId ?? '';
      balanceOf(await unitOf(lineId, row.siteId, row.businessUnitId), await skuOf(lineId, row.skuId, row.siteId));
    }
  }

  // Pieces by their codes; a named piece's receipt origin is read, so it is locked shared at step 2 (10.3; SL-24).
  const pieceIds = new Set<string>();
  if (pieceCodes.size > 0) {
    const rows = await context.tx
      .select({ id: piece.id, code: piece.code, originId: piece.receiptOriginId })
      .from(piece)
      .where(inArray(piece.code, [...pieceCodes.keys()]));
    const found = new Map(rows.map((row) => [row.code, row]));
    for (const [code, lineId] of pieceCodes) {
      const row = found.get(code);
      if (row === undefined) throw new StockRefused(refusalOf('invalid-item', lineId, [{ kind: 'piece', code }]));
      pieceIds.add(row.id);
      shared(row.originId);
    }
  }
  const usedCodes = new Set<string>();
  if (newCodes.size > 0) {
    const rows = await context.tx
      .select({ code: piece.code })
      .from(piece)
      .where(inArray(piece.code, [...newCodes]));
    for (const row of rows) usedCodes.add(row.code);
  }

  return {
    request,
    businessDate,
    occurredAt: request.occurredAt ?? context.startedAt,
    units,
    skus,
    anchors: [...anchors.values()],
    skuBalances: [...skuBalances.values()],
    originIds,
    pieceIds,
    holdIds,
    reservationIds,
    coverageIds,
    freezeUnits,
    originsSeen,
    coverageOrigins,
    usedCodes,
  };
}
