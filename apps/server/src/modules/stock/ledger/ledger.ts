import { uuidv7 } from '@apparel-os/domain';
import { and, eq, gt, inArray, or, sql } from 'drizzle-orm';
import {
  CommandDefect,
  LOCK_STEP,
  lockTable,
  type CommandRefusal,
  type Composition,
  type LockTarget,
  type TransactionContext,
} from '../../../kernel/index.js';
import type { AuditInterface, AuditSource } from '../../audit/index.js';
import {
  acceptance,
  balance,
  coverage,
  hold,
  holdClaim,
  holdRelease,
  holdScope,
  movement,
  movementLeg,
  movementPiece,
  piece,
  receiptOrigin,
  receiptOriginState,
  reservation,
  reservationClaim,
  reservationEvent,
  skuBalance,
  unitAnchor,
} from './db/schema.js';
import { integerArray, uuidArray } from './db/sql.js';
import {
  refusalOf,
  StockRefused,
  type Condition,
  type Goods,
  type ItemValue,
  type LedgerItem,
  type LedgerRequest,
} from './domain/request.js';
import {
  Working,
  workingKey as key,
  type BalanceState,
  type ClaimState,
  type CoverageState,
  type ExpectedQuantity,
  type HeaderState,
  type OriginState,
  type PieceState,
  type SkuBalanceState,
} from './domain/working.js';
import { countFreezeChanged, holdChanged, movementsPosted, reservationChanged } from './events.js';
import type { LedgerPlaces, LedgerSkus, SkuFacts, UnitFacts } from './ports.js';
import { CallerRegistry, type CallerRegistration } from './registry.js';

// The ledger's interface for the unvalued operations (stock-ledger 13.1 to 13.5; S1-F10-T02): one request in four
// operations, Plan, Lock, Recheck and value and Write, inside the caller's command, which it joins and never opens or
// commits (code-house-rules 8.1; module-map section 3, rule 3). The valued items and the call to Post arrive with
// S1-F10-T03.

const RECEIPT_ORIGIN = lockTable('stock', 'receipt_origin');
const UNIT_ANCHOR = lockTable('stock', 'unit_anchor');
const SKU_BALANCE = lockTable('stock', 'sku_balance');
const PIECE = lockTable('stock', 'piece');
const HOLD = lockTable('stock', 'hold');
const RESERVATION = lockTable('stock', 'reservation');

/** An operation's answer: its value, or the refusal of 13.8. */
export type LedgerResult<Value> =
  { readonly kind: 'done'; readonly value: Value } | { readonly kind: 'refused'; readonly refusal: CommandRefusal };

/** The plan of a request (13.1 "Plan"): what it read before any lock, and what Lock locks at steps 2 to 5. */
export interface LedgerPlan {
  readonly request: LedgerRequest;
  readonly businessDate: string;
  readonly occurredAt: Date;
  readonly units: ReadonlyMap<string, UnitFacts>;
  readonly skus: ReadonlyMap<string, SkuFacts>;
  readonly anchors: readonly AnchorTarget[];
  readonly skuBalances: readonly SkuBalanceTarget[];
  readonly originIds: ReadonlyMap<string, 'exclusive' | 'shared'>;
  readonly pieceIds: ReadonlySet<string>;
  readonly holdIds: ReadonlySet<string>;
  readonly reservationIds: ReadonlySet<string>;
  readonly coverageIds: ReadonlySet<string>;
  readonly freezeUnits: ReadonlySet<string>;
  readonly originsSeen: ReadonlyMap<string, ReadonlySet<string>>;
  readonly usedCodes: ReadonlySet<string>;
}

interface AnchorTarget {
  readonly unit: UnitFacts;
  readonly mode: 'exclusive' | 'shared';
}

interface SkuBalanceTarget {
  readonly unit: UnitFacts;
  readonly sku: SkuFacts;
}

/** Targets a caller adds to the ledger's steps 2 to 6 (13.1 "Lock"). */
export type ExtraTargets = Partial<Record<2 | 3 | 4 | 5 | 6, readonly LockTarget[]>>;

/** A plan whose rows are locked (13.1 "Lock"). */
export interface LockedPlan {
  readonly plan: LedgerPlan;
  readonly skuBalanceIds: readonly string[];
  readonly missing: readonly LockTarget[];
}

/** A request rechecked and valued under the locks (13.1 "Recheck and value"). Writes nothing. */
export interface CheckedRequest {
  readonly plan: LedgerPlan;
  readonly working: Working;
  /** Each item's value on its approval basis, and the request's (PRD-ACS-015, PRD-ACS-016, DEC-066). */
  readonly itemValues: readonly ItemValue[];
  readonly value: ItemValue;
}

/** What Write wrote (13.1 "Write"): identifiers only. */
export interface Written {
  readonly movementIds: string[];
  readonly receiptOriginIds: string[];
  readonly holdIds: string[];
  readonly reservationIds: string[];
  readonly coverageIds: string[];
  readonly acceptanceIds: string[];
  /** A count freeze's expected quantities: the balances in its scope under its locks (8.1). */
  readonly expected: ExpectedQuantity[];
}

export interface StockLedgerDependencies {
  readonly audit: AuditInterface;
  readonly places: LedgerPlaces;
  readonly skus: LedgerSkus;
  readonly registrations: readonly CallerRegistration[];
  readonly composition: Composition;
}

/** The ledger's interface (stock-ledger 13.1; module-map 4.13). Each operation takes the command's context first. */
export interface StockLedgerInterface {
  plan(context: TransactionContext, request: LedgerRequest): Promise<LedgerResult<LedgerPlan>>;
  lock(context: TransactionContext, plan: LedgerPlan, extra?: ExtraTargets): Promise<LockedPlan>;
  recheck(context: TransactionContext, locked: LockedPlan): Promise<LedgerResult<CheckedRequest>>;
  write(context: TransactionContext, checked: CheckedRequest, source?: AuditSource): Promise<Written>;
}

type Item = LedgerItem;

/** The goods and places an item touches, for the count-freeze check (8.1; 13.5). */
interface Touch {
  readonly lineId: string;
  readonly siteId: string;
  readonly businessUnitId: string;
  readonly locationIds: string[];
  readonly skuIds: string[];
  readonly brandIds: (string | null)[];
}

export class StockLedger implements StockLedgerInterface {
  private readonly registry: CallerRegistry;

  constructor(private readonly dependencies: StockLedgerDependencies) {
    this.registry = new CallerRegistry(dependencies.registrations, dependencies.composition);
  }

  // --- Plan -----------------------------------------------------------------------------------------------------

  /**
   * Plan (13.1): checks the caller's registration (13.2) and each item's shape; reads the places and SKUs as of the
   * business date (stand-ins until S1-F02 and S1-F03); finds the receipt origins, pieces, holds and reservations the
   * items touch and the SKU balances and unit anchors to lock. Writes nothing and locks nothing.
   */
  async plan(context: TransactionContext, request: LedgerRequest): Promise<LedgerResult<LedgerPlan>> {
    const registered = this.registry.check(request.source, request.items);
    if (registered !== undefined) return { kind: 'refused', refusal: registered };
    const date = await context.businessDate();
    if (date.kind === 'not-set') return { kind: 'refused', refusal: refusalOf('business-date-not-set', undefined) };
    if (request.items.length === 0) return { kind: 'refused', refusal: refusalOf('invalid-item', undefined) };
    try {
      return { kind: 'done', value: await this.planItems(context, request, date.date) };
    } catch (error) {
      if (error instanceof StockRefused) return { kind: 'refused', refusal: error.refusal };
      throw error;
    }
  }

  private async planItems(context: TransactionContext, request: LedgerRequest, businessDate: string) {
    const units = new Map<string, UnitFacts>();
    const skus = new Map<string, SkuFacts>();
    const anchors = new Map<string, AnchorTarget>();
    const skuBalances = new Map<string, SkuBalanceTarget>();
    const originIds = new Map<string, 'exclusive' | 'shared'>();
    const pieceCodes = new Map<string, string>();
    const newCodes = new Set<string>();
    const holdIds = new Set<string>();
    const reservationIds = new Set<string>();
    const coverageIds = new Set<string>();
    const freezeUnits = new Set<string>();
    const quantityGoods = new Map<string, { unit: UnitFacts; sku: SkuFacts }>();

    const unitOf = async (lineId: string, siteId: string, businessUnitId: string): Promise<UnitFacts> => {
      const at = key(siteId, businessUnitId);
      let unit = units.get(at);
      if (unit === undefined) {
        unit = await this.dependencies.places.unitAt(context, { siteId, businessUnitId }, businessDate);
        if (unit === undefined)
          throw new StockRefused(refusalOf('place-invalid', lineId, [{ kind: 'unit', businessUnitId }]));
        units.set(at, unit);
      }
      return unit;
    };
    const place = async (
      lineId: string,
      siteId: string,
      businessUnitId: string,
      locationId: string,
      mode: 'shared' | 'exclusive' = 'shared',
    ) => {
      const unit = await unitOf(lineId, siteId, businessUnitId);
      const location = await this.dependencies.places.locationOf(context, locationId);
      if (location?.siteId !== siteId || location.businessUnitId !== businessUnitId) {
        throw new StockRefused(refusalOf('place-invalid', lineId, [{ kind: 'location', locationId }]));
      }
      const current = anchors.get(key(siteId, businessUnitId));
      if (current?.mode !== 'exclusive') anchors.set(key(siteId, businessUnitId), { unit, mode });
      return unit;
    };
    const skuOf = async (lineId: string, skuId: string, siteId: string): Promise<SkuFacts> => {
      let sku = skus.get(skuId);
      if (sku === undefined) {
        sku = await this.dependencies.skus.skuAt(context, skuId, siteId, businessDate);
        if (sku === undefined) throw new StockRefused(refusalOf('invalid-item', lineId, [{ kind: 'sku', skuId }]));
        skus.set(skuId, sku);
      }
      return sku;
    };
    const balanceOf = (unit: UnitFacts, sku: SkuFacts) =>
      skuBalances.set(key(unit.siteId, unit.businessUnitId, sku.skuId), { unit, sku });
    const goodsAt = async (lineId: string, unit: UnitFacts, goods: Goods) => {
      const sku = await skuOf(lineId, goods.skuId, unit.siteId);
      balanceOf(unit, sku);
      for (const code of goods.pieceCodes ?? []) pieceCodes.set(code, lineId);
      if (goods.receiptOriginId !== undefined) {
        if (!originIds.has(goods.receiptOriginId)) originIds.set(goods.receiptOriginId, 'shared');
      } else if (!sku.pieceTracked) {
        quantityGoods.set(key(unit.siteId, unit.businessUnitId, sku.skuId), { unit, sku });
      }
    };

    for (const item of request.items) {
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
          break;
        }
        case 'location-move': {
          const from = await place(item.lineId, item.from.siteId, item.from.businessUnitId, item.from.locationId);
          const to = await place(item.lineId, item.from.siteId, item.to.businessUnitId, item.to.locationId);
          await goodsAt(item.lineId, from, item.goods);
          balanceOf(to, await skuOf(item.lineId, item.goods.skuId, from.siteId));
          break;
        }
        case 'condition-change': {
          const unit = await place(item.lineId, item.at.siteId, item.at.businessUnitId, item.at.locationId);
          await goodsAt(item.lineId, unit, item.goods);
          break;
        }
        case 'record-acceptance': {
          const unit = await place(item.lineId, item.at.siteId, item.at.businessUnitId, item.at.locationId);
          await goodsAt(item.lineId, unit, item.goods);
          break;
        }
        case 'place-hold':
        case 'reserve': {
          const unit = await place(item.lineId, item.at.siteId, item.at.businessUnitId, item.at.locationId);
          for (const goods of item.goods) await goodsAt(item.lineId, unit, goods);
          if (item.kind === 'place-hold' && item.withinReservationId !== undefined)
            reservationIds.add(item.withinReservationId);
          break;
        }
        case 'record-coverage': {
          const origin = await this.originRow(context, item.receiptOriginId);
          if (origin === undefined)
            throw new StockRefused(
              refusalOf('invalid-item', item.lineId, [
                { kind: 'receipt-origin', receiptOriginId: item.receiptOriginId },
              ]),
            );
          originIds.set(item.receiptOriginId, 'exclusive');
          for (const code of item.pieceCodes ?? []) pieceCodes.set(code, item.lineId);
          if (origin.skuId !== null) await skuOf(item.lineId, origin.skuId, origin.siteId);
          break;
        }
        case 'remove-coverage': {
          const [record] = await context.tx.select().from(coverage).where(eq(coverage.id, item.coverageId));
          if (record === undefined)
            throw new StockRefused(
              refusalOf('invalid-item', item.lineId, [{ kind: 'coverage', coverageId: item.coverageId }]),
            );
          coverageIds.add(record.id);
          originIds.set(record.receiptOriginId, 'exclusive');
          if (record.pieceId !== null) {
            const [row] = await context.tx.select({ code: piece.code }).from(piece).where(eq(piece.id, record.pieceId));
            if (row !== undefined) pieceCodes.set(row.code, item.lineId);
          }
          // The reservations relying on the coverage are read under the balances' locks (13.5 "Remove coverage").
          for (const row of await context.tx
            .select()
            .from(balance)
            .where(eq(balance.receiptOriginId, record.receiptOriginId))) {
            if (row.skuId === null) continue;
            const unit = await unitOf(item.lineId, row.siteId, row.businessUnitId);
            balanceOf(unit, await skuOf(item.lineId, row.skuId, row.siteId));
          }
          break;
        }
        case 'release-hold':
        case 'end-reservation': {
          const isHold = item.kind === 'release-hold';
          const headerId = isHold ? item.holdId : item.reservationId;
          (isHold ? holdIds : reservationIds).add(headerId);
          // The claims it ends lock their balances and pieces with it (13.5).
          const claims = isHold
            ? await context.tx
                .select()
                .from(holdClaim)
                .where(and(eq(holdClaim.holdId, headerId), gt(holdClaim.quantity, 0)))
            : await context.tx
                .select()
                .from(reservationClaim)
                .where(and(eq(reservationClaim.reservationId, headerId), gt(reservationClaim.quantity, 0)));
          for (const claim of claims) {
            if (claim.balanceId !== null) {
              const [row] = await context.tx.select().from(balance).where(eq(balance.id, claim.balanceId));
              if (row?.skuId != null)
                balanceOf(
                  await unitOf(item.lineId, row.siteId, row.businessUnitId),
                  await skuOf(item.lineId, row.skuId, row.siteId),
                );
            }
            if (claim.pieceId !== null) {
              const [row] = await context.tx.select().from(piece).where(eq(piece.id, claim.pieceId));
              if (row !== undefined) pieceCodes.set(row.code, item.lineId);
            }
          }
          break;
        }
        case 'start-count-freeze':
        case 'end-count-freeze': {
          const at =
            item.kind === 'start-count-freeze'
              ? { siteId: item.siteId, businessUnitId: item.businessUnitId }
              : await this.holdPlace(context, item.holdId);
          if (item.kind === 'end-count-freeze') holdIds.add(item.holdId);
          if (at === undefined)
            throw new StockRefused(
              refusalOf('invalid-item', item.lineId, [{ kind: 'hold', holdId: (item as { holdId: string }).holdId }]),
            );
          const unit = await unitOf(item.lineId, at.siteId, at.businessUnitId);
          anchors.set(key(at.siteId, at.businessUnitId), { unit, mode: 'exclusive' });
          freezeUnits.add(key(at.siteId, at.businessUnitId));
          if (item.kind === 'start-count-freeze') {
            for (const member of item.scope) {
              if ('locationId' in member) {
                const location = await this.dependencies.places.locationOf(context, member.locationId);
                if (location?.siteId !== at.siteId || location.businessUnitId !== at.businessUnitId) {
                  throw new StockRefused(
                    refusalOf('place-invalid', item.lineId, [{ kind: 'location', locationId: member.locationId }]),
                  );
                }
              }
              if ('skuId' in member) await skuOf(item.lineId, member.skuId, at.siteId);
            }
          }
          break;
        }
      }
    }

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
      for (const id of seen) if (!originIds.has(id)) originIds.set(id, 'shared');
    }

    const pieceIds = new Set<string>();
    if (pieceCodes.size > 0) {
      const rows = await context.tx
        .select({ id: piece.id, code: piece.code })
        .from(piece)
        .where(inArray(piece.code, [...pieceCodes.keys()]));
      const found = new Map(rows.map((row) => [row.code, row.id]));
      for (const [code, lineId] of pieceCodes) {
        const id = found.get(code);
        if (id === undefined) throw new StockRefused(refusalOf('invalid-item', lineId, [{ kind: 'piece', code }]));
        pieceIds.add(id);
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

    const occurredAt = request.occurredAt ?? context.startedAt;
    return {
      request,
      businessDate,
      occurredAt,
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
      usedCodes,
    } satisfies LedgerPlan;
  }

  private async originRow(context: TransactionContext, id: string) {
    const [row] = await context.tx.select().from(receiptOrigin).where(eq(receiptOrigin.id, id));
    return row;
  }

  private async holdPlace(context: TransactionContext, holdId: string) {
    const [row] = await context.tx
      .select({ siteId: hold.siteId, businessUnitId: hold.businessUnitId })
      .from(hold)
      .where(eq(hold.id, holdId));
    return row;
  }

  // --- Lock -----------------------------------------------------------------------------------------------------

  /**
   * Lock (13.1; 10.3 steps 2 to 5, with SL-24): receipt origins, exclusive where their state changes and shared where
   * only read; the missing unit anchors and SKU balances created empty in ascending key order, then locked in one call
   * with the anchors, shared for every item and exclusive to start or end a count freeze; pieces; and the holds and
   * reservations being released or ended. Each step in one call, with the caller's targets for it (code-house-rules
   * 8.2). Nothing that records the request's effects is written here.
   */
  async lock(context: TransactionContext, plan: LedgerPlan, extra: ExtraTargets = {}): Promise<LockedPlan> {
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

    // Step 3: create what is missing, empty, in ascending key order (10.3; code-house-rules 8.2), then lock.
    const anchors = [...plan.anchors].sort((a, b) =>
      key(a.unit.siteId, a.unit.businessUnitId).localeCompare(key(b.unit.siteId, b.unit.businessUnitId)),
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
    const totals = [...plan.skuBalances].sort((a, b) =>
      key(a.unit.siteId, a.unit.businessUnitId, a.sku.skuId).localeCompare(
        key(b.unit.siteId, b.unit.businessUnitId, b.sku.skuId),
      ),
    );
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
    const anchorTargets: LockTarget[] = [];
    for (const { unit, mode } of anchors) {
      const [row] = await context.tx
        .select({ id: unitAnchor.id })
        .from(unitAnchor)
        .where(and(eq(unitAnchor.siteId, unit.siteId), eq(unitAnchor.businessUnitId, unit.businessUnitId)));
      if (row === undefined) throw new CommandDefect('A unit anchor just created is not visible to its actor');
      anchorTargets.push({ table: UNIT_ANCHOR, id: row.id, mode });
    }
    const skuBalanceIds: string[] = [];
    for (const { unit, sku } of totals) {
      const [row] = await context.tx
        .select({ id: skuBalance.id })
        .from(skuBalance)
        .where(
          and(
            eq(skuBalance.siteId, unit.siteId),
            eq(skuBalance.businessUnitId, unit.businessUnitId),
            eq(skuBalance.skuId, sku.skuId),
          ),
        );
      if (row === undefined) throw new CommandDefect('A SKU balance just created is not visible to its actor');
      skuBalanceIds.push(row.id);
    }
    await step(
      LOCK_STEP.balance,
      [...anchorTargets, ...skuBalanceIds.map((id) => ({ table: SKU_BALANCE, id, mode: 'exclusive' as const }))],
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

  // --- Recheck and value ----------------------------------------------------------------------------------------

  /**
   * Recheck and value (13.1; 10.4): reads under the locks the rows the request touches, then checks every item in
   * order against them: a count freeze over its goods (8.1), available quantity, where each piece is, holds,
   * reservations, coverage and acceptance (6.2, 6.3), and what the actor cannot see through the narrowly authorised
   * function (DEC-117). Writes nothing. Answers each item's value on its approval basis: Unknown for goods, none for
   * a release; the request's is Unknown when any item's is (PRD-ACS-016).
   */
  async recheck(context: TransactionContext, locked: LockedPlan): Promise<LedgerResult<CheckedRequest>> {
    const { plan } = locked;
    const lost = locked.missing.find((target) => target.table.table !== 'unit_anchor');
    if (lost !== undefined) {
      return {
        kind: 'refused',
        refusal: refusalOf('invalid-item', undefined, [{ kind: lost.table.table.replace('_', '-'), id: lost.id }]),
      };
    }
    const working = new Working(await this.load(context, locked));
    try {
      await this.checkFreezes(context, plan, working);
      const itemValues = plan.request.items.map((item) => working.apply(item));
      await this.checkHidden(context, plan, working);
      const value: ItemValue = itemValues.some((each) => each.kind === 'unknown')
        ? { kind: 'unknown' }
        : { kind: 'none' };
      return { kind: 'done', value: { plan, working, itemValues, value } };
    } catch (error) {
      if (error instanceof StockRefused) return { kind: 'refused', refusal: error.refusal };
      throw error;
    }
  }

  /** The rows read under the locks (code-house-rules 8.1): every one locked, or changed only under a lock held. */
  private async load(context: TransactionContext, locked: LockedPlan) {
    const { plan } = locked;
    const totals =
      locked.skuBalanceIds.length === 0
        ? []
        : await context.tx
            .select()
            .from(skuBalance)
            .where(inArray(skuBalance.id, [...locked.skuBalanceIds]));
    const freezeUnits = [...plan.freezeUnits].map((at) => at.split('|'));
    const balanceRows = await context.tx
      .select()
      .from(balance)
      .where(
        or(
          locked.skuBalanceIds.length === 0 ? sql`false` : inArray(balance.skuBalanceId, [...locked.skuBalanceIds]),
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
    const coverageRows =
      plan.coverageIds.size === 0
        ? []
        : await context.tx
            .select()
            .from(coverage)
            .where(inArray(coverage.id, [...plan.coverageIds]));
    const removed =
      plan.coverageIds.size === 0
        ? []
        : await context.tx
            .select({ id: coverage.removesCoverageId })
            .from(coverage)
            .where(inArray(coverage.removesCoverageId, [...plan.coverageIds]));
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
    const claimPieceIds = [...plan.pieceIds];
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
            claimPieceIds.length === 0 ? sql`false` : inArray(holdClaim.pieceId, claimPieceIds),
            plan.holdIds.size === 0 ? sql`false` : inArray(holdClaim.holdId, [...plan.holdIds]),
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
            claimPieceIds.length === 0 ? sql`false` : inArray(reservationClaim.pieceId, claimPieceIds),
            plan.reservationIds.size === 0
              ? sql`false`
              : inArray(reservationClaim.reservationId, [...plan.reservationIds]),
          ),
        ),
      );
    const holdHeaders =
      plan.holdIds.size === 0
        ? []
        : await context.tx
            .select()
            .from(hold)
            .where(inArray(hold.id, [...plan.holdIds]));
    const freezeEnds =
      plan.holdIds.size === 0
        ? []
        : await context.tx
            .select({ holdId: holdRelease.holdId })
            .from(holdRelease)
            .where(and(inArray(holdRelease.holdId, [...plan.holdIds]), eq(holdRelease.holdKind, 'count-freeze')));
    const reservationHeaders =
      plan.reservationIds.size === 0
        ? []
        : await context.tx
            .select()
            .from(reservation)
            .where(inArray(reservation.id, [...plan.reservationIds]));

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
        locationId: row.locationId ?? '',
        condition: row.condition as Condition,
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
        valueKnown: state.valueKnown,
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
    };
  }

  /** The goods and places each item of a request touches, for the count-freeze check (8.1, 13.5). */
  private touches(item: Item, working: Working): Touch[] {
    const brands = (skuIds: readonly string[]) => skuIds.map((skuId) => working.sku(skuId).brandId);
    switch (item.kind) {
      case 'receipt-count':
        return [
          {
            lineId: item.lineId,
            siteId: item.to.siteId,
            businessUnitId: item.to.businessUnitId,
            locationIds: [item.to.locationId],
            skuIds: [item.skuId],
            brandIds: brands([item.skuId]),
          },
        ];
      case 'location-move': {
        const from = {
          lineId: item.lineId,
          siteId: item.from.siteId,
          skuIds: [item.goods.skuId],
          brandIds: brands([item.goods.skuId]),
        };
        if (item.to.businessUnitId === item.from.businessUnitId) {
          return [
            {
              ...from,
              businessUnitId: item.from.businessUnitId,
              locationIds: [item.from.locationId, item.to.locationId],
            },
          ];
        }
        return [
          { ...from, businessUnitId: item.from.businessUnitId, locationIds: [item.from.locationId] },
          { ...from, businessUnitId: item.to.businessUnitId, locationIds: [item.to.locationId] },
        ];
      }
      case 'condition-change':
        return [
          {
            lineId: item.lineId,
            siteId: item.at.siteId,
            businessUnitId: item.at.businessUnitId,
            locationIds: [item.at.locationId],
            skuIds: [item.goods.skuId],
            brandIds: brands([item.goods.skuId]),
          },
        ];
      case 'reserve':
        return [
          {
            lineId: item.lineId,
            siteId: item.at.siteId,
            businessUnitId: item.at.businessUnitId,
            locationIds: [item.at.locationId],
            skuIds: item.goods.map((goods) => goods.skuId),
            brandIds: brands(item.goods.map((goods) => goods.skuId)),
          },
        ];
      case 'start-count-freeze': {
        const inScope = working.freezeBalances(item.siteId, item.businessUnitId, item.scope);
        return [
          {
            lineId: item.lineId,
            siteId: item.siteId,
            businessUnitId: item.businessUnitId,
            locationIds: [
              ...item.scope.flatMap((member) => ('locationId' in member ? [member.locationId] : [])),
              ...inScope.map((row) => row.locationId),
            ],
            skuIds: [
              ...item.scope.flatMap((member) => ('skuId' in member ? [member.skuId] : [])),
              ...inScope.flatMap((row) => (row.skuId === null ? [] : [row.skuId])),
            ],
            brandIds: [
              ...item.scope.flatMap((member) =>
                'brandId' in member ? [member.brandId] : 'skuId' in member ? brands([member.skuId]) : [],
              ),
              ...inScope.map((row) => row.scope.brandId),
            ],
          },
        ];
      }
      default:
        // Holds, releases, coverage and acceptance change no quantity at a place, so a freeze does not stop them.
        return [];
    }
  }

  /**
   * The count-freeze check (8.1; 13.4, 13.5): a freeze not yet ended whose scope covers a location, SKU or brand an
   * item touches stops it. A freeze the actor can see is named (`count-freeze-active`); one it cannot is a generic
   * refusal that names nothing of it (`blocked`; DEC-117). The freeze rows start and end only under the unit's anchor
   * held exclusively, and every item holds it shared, so what is read here holds until the commit (14.3).
   */
  private async checkFreezes(context: TransactionContext, plan: LedgerPlan, working: Working): Promise<void> {
    for (const item of plan.request.items) {
      for (const touch of this.touches(item, working)) {
        const rows = await this.recheckHidden(context, touch.siteId, touch.businessUnitId, {
          locationIds: touch.locationIds,
          skuIds: touch.skuIds,
          brandIds: touch.brandIds,
          spares: new Map(),
          pieceIds: new Set(),
        });
        const visible = rows.filter((row) => row.blocker === 'count-freeze');
        if (visible.length > 0) {
          throw new StockRefused(
            refusalOf(
              'count-freeze-active',
              touch.lineId,
              visible.map((row) => ({ kind: 'count-freeze', holdId: row.hold_id ?? '' })),
            ),
          );
        }
        if (rows.length > 0) throw new StockRefused(refusalOf('blocked', touch.lineId));
      }
    }
  }

  /**
   * The rest of DEC-117: claims of holds and reservations the actor cannot see that take a piece the request takes, or
   * more units of a balance than the request left free there, refuse the request generically (`blocked`).
   */
  private async checkHidden(context: TransactionContext, plan: LedgerPlan, working: Working): Promise<void> {
    for (const check of working.hidden.values()) {
      if (check.spares.size === 0 && check.pieceIds.size === 0) continue;
      const rows = await this.recheckHidden(context, check.siteId, check.businessUnitId, {
        locationIds: [],
        skuIds: [],
        brandIds: [],
        spares: check.spares,
        pieceIds: check.pieceIds,
      });
      if (rows.some((row) => row.blocker === 'hidden')) {
        const line = plan.request.items[0]?.lineId;
        throw new StockRefused(refusalOf('blocked', line));
      }
    }
  }

  private async recheckHidden(
    context: TransactionContext,
    siteId: string,
    businessUnitId: string,
    input: {
      readonly locationIds: readonly string[];
      readonly skuIds: readonly string[];
      readonly brandIds: readonly (string | null)[];
      readonly spares: ReadonlyMap<string, number>;
      readonly pieceIds: ReadonlySet<string>;
    },
  ): Promise<{ blocker: string; hold_id: string | null }[]> {
    const spares = [...input.spares];
    const result = await context.tx.execute<{ blocker: string; hold_id: string | null }>(
      sql`select blocker, hold_id from stock.recheck_hidden(${siteId}::uuid, ${businessUnitId}::uuid,
            ${uuidArray(input.locationIds)}, ${uuidArray(input.skuIds)}, ${uuidArray(input.brandIds.filter((id) => id !== null))},
            ${uuidArray(spares.map(([id]) => id))}, ${integerArray(spares.map(([, spare]) => spare))},
            ${uuidArray(input.pieceIds)})`,
    );
    return result.rows;
  }

  // --- Write ----------------------------------------------------------------------------------------------------

  /**
   * Write (13.1): the movements and their legs and pieces, the receipt origins and their state, balances, pieces,
   * coverage, acceptance, holds, reservations, claims, releases and events of the request, set-based in the order of
   * their keys; one audit record naming them; the events of 13.7 (PRD-INT-004, PRD-MOD-006). Movements carry the
   * approval use the caller recorded first (13.3; DEC-097). A constraint refusing a row here is a defect (10.4).
   */
  async write(
    context: TransactionContext,
    checked: CheckedRequest,
    source: AuditSource = { kind: 'screen' },
  ): Promise<Written> {
    const { plan, working } = checked;
    const { request } = plan;
    const { entries } = working;
    const lines = new Map(request.items.map((item) => [item.lineId, item]));
    const sourceColumns = (lineId: string) => ({
      sourceModule: request.source.module,
      sourceRecordType: request.source.recordType,
      sourceRecordId: request.source.recordId,
      sourceVersionId: request.source.versionId,
      sourceLineId: lineId,
      sourceImportKind: request.source.importKind,
    });
    const actor = request.actor;
    const actorColumns = {
      actorUserId: actor.kind === 'user' ? actor.userId : null,
      actorServiceIdentityId: actor.kind === 'service-identity' ? actor.serviceIdentityId : null,
      onBehalfOfUserId: actor.kind === 'service-identity' ? (actor.onBehalfOfUserId ?? null) : null,
      roleAssignmentId: actor.roleAssignmentId,
    };
    const times = { businessDate: plan.businessDate, occurredAt: plan.occurredAt };
    if (
      !entries.origins.every((origin) =>
        lines.has(entries.movements.find((m) => m.id === origin.lastStateMovementId)?.lineId ?? ''),
      )
    ) {
      throw new CommandDefect('An origin without its receipt movement');
    }

    if (entries.origins.length > 0) {
      await context.tx.insert(receiptOrigin).values(
        entries.origins.map((origin) => {
          const unit = working.unit(origin.scope.siteId, origin.scope.businessUnitId);
          const sku = working.sku(origin.skuId ?? '');
          const movementOf = entries.movements.find((each) => each.id === origin.lastStateMovementId);
          return {
            id: origin.id,
            originKind: 'receipt',
            parentOriginId: null,
            ...sourceColumns(movementOf?.lineId ?? ''),
            skuId: origin.skuId,
            skuVersionId: sku.versionId,
            stockUnit: sku.stockUnit,
            pieceTracked: origin.pieceTracked,
            batchTracked: sku.batchTracked,
            batchCode: origin.batchCode,
            expiryDate: origin.expiryDate,
            quantity: origin.quantity,
            countDate: origin.countDate,
            ...origin.scope,
            mappingVersionId: unit.mappingVersionId,
            bookId: unit.bookId,
            occurredAt: plan.occurredAt,
          };
        }),
      );
    }
    if (entries.movements.length > 0) {
      await context.tx.insert(movement).values(
        entries.movements.map((each) => ({
          id: each.id,
          kind: each.kind,
          ...sourceColumns(each.lineId),
          ...actorColumns,
          approvalUseId: request.approval?.useId ?? null,
          reversesMovementId: null,
          correctionOfMovementId: null,
          ...times,
          ...each.scope,
          brandIds: each.brandIds as string[],
        })),
      );
      const legs = entries.movements.flatMap((each) =>
        each.legs.map((leg) => ({
          id: leg.id,
          movementId: each.id,
          direction: leg.direction,
          receiptOriginId: leg.receiptOriginId,
          skuId: leg.skuId,
          quantity: leg.quantity,
          acceptedQuantity: leg.accepted,
          locationId: leg.locationId,
          condition: leg.condition,
          heldAs: 'custody',
          transitKind: null,
          transitRef: null,
          batchCode: leg.batchCode,
          expiryDate: leg.expiryDate,
          bookId: leg.bookId,
          ...leg.scope,
        })),
      );
      if (legs.length > 0) await context.tx.insert(movementLeg).values(legs);
    }
    // Origin states: new ones with their owner (PRD-ORG-014, PRD-ORG-019); changed ones in place, under the origin's
    // exclusive lock (14.3).
    const newStates = entries.origins.map((origin) => {
      const owner = entries.movements.find((each) => each.id === origin.lastStateMovementId)?.owner ?? {
        kind: 'unknown' as const,
      };
      return {
        id: origin.stateId,
        receiptOriginId: origin.id,
        ownerKind: owner.kind === 'unknown' ? null : owner.kind,
        ownerLegalEntityId: owner.kind === 'organisation' ? owner.legalEntityId : null,
        ownerPartyId: owner.kind === 'supplier' ? owner.partyId : null,
        ownerBrandId: owner.kind === 'brand' ? owner.brandId : null,
        agreementVersionId: owner.kind === 'unknown' ? null : (owner.agreementVersionId ?? null),
        valueKnown: false,
        pRatePaise: null,
        establishedValuePaise: null,
        originQuantity: origin.quantity,
        ptRevisionId: origin.ptRevisionId,
        coveredQuantity: origin.coveredQuantity,
        lastStateMovementId: origin.lastStateMovementId ?? '',
        ...origin.scope,
      };
    });
    if (newStates.length > 0) await context.tx.insert(receiptOriginState).values(newStates);
    for (const origin of working.origins.values()) {
      if (origin.isNew || !origin.stateChanged) continue;
      await context.tx
        .update(receiptOriginState)
        .set({ ptRevisionId: origin.ptRevisionId, coveredQuantity: origin.coveredQuantity })
        .where(eq(receiptOriginState.id, origin.stateId));
    }
    for (const total of working.skuBalances.values()) {
      if (total.changed)
        await context.tx.update(skuBalance).set({ quantity: total.quantity }).where(eq(skuBalance.id, total.id));
    }
    const balances = [...working.balances.values()];
    const newBalances = balances.filter((row) => row.isNew);
    if (newBalances.length > 0) {
      await context.tx.insert(balance).values(
        newBalances.map((row) => ({
          id: row.id,
          skuBalanceId: row.skuBalanceId,
          siteId: row.siteId,
          businessUnitId: row.businessUnitId,
          locationId: row.locationId,
          condition: row.condition,
          heldAs: 'custody',
          transitKind: null,
          transitRef: null,
          skuId: row.skuId,
          batchCode: row.batchCode,
          expiryDate: row.expiryDate,
          receiptOriginId: row.receiptOriginId,
          countDate: row.countDate,
          quantity: row.quantity,
          acceptedQuantity: row.accepted,
          storeId: row.scope.storeId,
          legalEntityId: row.scope.legalEntityId,
          brandId: row.scope.brandId,
        })),
      );
    }
    for (const row of balances) {
      if (row.isNew || !row.changed) continue;
      await context.tx
        .update(balance)
        .set({ quantity: row.quantity, acceptedQuantity: row.accepted })
        .where(eq(balance.id, row.id));
    }
    const pieces = [...working.pieces.values()];
    const newPieces = pieces.filter((row) => row.isNew);
    if (newPieces.length > 0) {
      await context.tx.insert(piece).values(
        newPieces.map((row) => ({
          id: row.id,
          code: row.code,
          skuId: row.skuId,
          receiptOriginId: row.receiptOriginId,
          locationId: row.locationId,
          condition: row.condition,
          heldAs: row.heldAs,
          transitKind: null,
          transitRef: null,
          inCustody: row.inCustody,
          ptRevisionId: row.ptRevisionId,
          acceptedSiteId: row.acceptedSiteId,
          lastMovementId: row.lastMovementId,
          siteId: row.siteId,
          storeId: row.storeId,
          businessUnitId: row.businessUnitId,
          legalEntityId: row.legalEntityId,
          brandId: row.brandId,
        })),
      );
    }
    for (const row of pieces) {
      if (row.isNew || !row.changed) continue;
      await context.tx
        .update(piece)
        .set({
          locationId: row.locationId,
          condition: row.condition,
          inCustody: row.inCustody,
          ptRevisionId: row.ptRevisionId,
          acceptedSiteId: row.acceptedSiteId,
          lastMovementId: row.lastMovementId,
          storeId: row.storeId,
          businessUnitId: row.businessUnitId,
        })
        .where(eq(piece.id, row.id));
    }
    const movedPieces = entries.movements.flatMap((each) =>
      each.pieceIds.map((pieceId) => {
        const moved = working.pieces.get(pieceId);
        if (moved === undefined) throw new CommandDefect('A moved piece is not loaded');
        return {
          id: uuidv7(),
          movementId: each.id,
          pieceId,
          siteId: each.scope.siteId,
          storeId: each.scope.storeId,
          businessUnitId: each.scope.businessUnitId,
          legalEntityId: each.scope.legalEntityId,
          brandId: moved.brandId,
        };
      }),
    );
    if (movedPieces.length > 0) await context.tx.insert(movementPiece).values(movedPieces);
    const status = { ...actorColumns, ...times };
    if (entries.coverage.length > 0) {
      await context.tx.insert(coverage).values(
        entries.coverage.map((row) => ({
          id: row.id,
          ptRevisionId: row.ptRevisionId,
          receiptOriginId: row.receiptOriginId,
          pieceTracked: row.pieceTracked,
          pieceId: row.pieceId,
          quantity: row.quantity,
          action: row.action,
          removesCoverageId: row.removesCoverageId,
          ...sourceColumns(row.lineId),
          ...status,
          ...row.scope,
        })),
      );
    }
    if (entries.acceptances.length > 0) {
      await context.tx.insert(acceptance).values(
        entries.acceptances.map((row) => ({
          id: row.id,
          receiptOriginId: row.receiptOriginId,
          pieceId: row.pieceId,
          quantity: row.quantity,
          locationId: row.locationId,
          condition: row.condition,
          ...sourceColumns(row.lineId),
          ...status,
          ...row.scope,
        })),
      );
    }
    if (entries.reservations.length > 0) {
      await context.tx.insert(reservation).values(
        entries.reservations.map((row) => ({
          id: row.id,
          kind: row.kind,
          ...sourceColumns(row.lineId),
          ...status,
          ...row.scope,
          brandIds: row.brandIds as string[],
        })),
      );
    }
    if (entries.holds.length > 0) {
      await context.tx.insert(hold).values(
        entries.holds.map((row) => ({
          id: row.id,
          kind: row.kind,
          reason: row.reason,
          evidenceFileId: row.evidenceFileId,
          withinReservationId: row.withinReservationId,
          ...sourceColumns(row.lineId),
          ...status,
          ...row.scope,
          brandIds: row.brandIds as string[],
        })),
      );
      const scopes = entries.holds.flatMap((row) =>
        row.freezeScope.map((member) => ({
          id: uuidv7(),
          holdId: row.id,
          holdKind: row.kind,
          locationId: 'locationId' in member ? member.locationId : null,
          scopeBrandId: 'brandId' in member ? member.brandId : null,
          skuId: 'skuId' in member ? member.skuId : null,
          ...row.scope,
          brandIds: row.brandIds as string[],
        })),
      );
      if (scopes.length > 0) await context.tx.insert(holdScope).values(scopes);
    }
    const newClaims = working.claims.filter((claim) => claim.isNew);
    const claimRow = (claim: ClaimState) => ({
      id: claim.id,
      pieceId: claim.pieceId,
      balanceId: claim.balanceId,
      quantity: claim.quantity,
      claimedQuantity: claim.claimed,
      ...claim.scope,
    });
    const newHoldClaims = newClaims.filter((claim) => claim.owner === 'hold');
    if (newHoldClaims.length > 0) {
      await context.tx
        .insert(holdClaim)
        .values(newHoldClaims.map((claim) => ({ ...claimRow(claim), holdId: claim.headerId })));
    }
    const newReservationClaims = newClaims.filter((claim) => claim.owner === 'reservation');
    if (newReservationClaims.length > 0) {
      await context.tx
        .insert(reservationClaim)
        .values(newReservationClaims.map((claim) => ({ ...claimRow(claim), reservationId: claim.headerId })));
    }
    for (const claim of working.claims) {
      if (claim.isNew || !claim.changed) continue;
      const table = claim.owner === 'hold' ? holdClaim : reservationClaim;
      await context.tx.update(table).set({ quantity: claim.quantity }).where(eq(table.id, claim.id));
    }
    if (entries.holdReleases.length > 0) {
      await context.tx.insert(holdRelease).values(
        entries.holdReleases.map((row) => ({
          id: row.id,
          holdId: row.holdId,
          holdKind: row.holdKind,
          holdClaimId: row.claimId,
          releaseEvent: row.event,
          quantity: row.quantity,
          pieceId: row.pieceId,
          ...sourceColumns(row.lineId),
          ...status,
          ...row.scope,
        })),
      );
    }
    if (entries.reservationEvents.length > 0) {
      await context.tx.insert(reservationEvent).values(
        entries.reservationEvents.map((row) => ({
          id: row.id,
          reservationId: row.reservationId,
          reservationKind: row.reservationKind,
          reservationClaimId: row.claimId,
          event: row.event,
          quantity: row.quantity,
          pieceId: row.pieceId,
          movementId: null,
          ...sourceColumns(row.lineId),
          ...status,
          ...row.scope,
        })),
      );
    }

    const written: Written = {
      movementIds: entries.movements.map((row) => row.id),
      receiptOriginIds: entries.origins.map((row) => row.id),
      holdIds: [...new Set([...entries.holds.map((row) => row.id), ...entries.holdReleases.map((row) => row.holdId)])],
      reservationIds: [
        ...new Set([
          ...entries.reservations.map((row) => row.id),
          ...entries.reservationEvents.map((row) => row.reservationId),
        ]),
      ],
      coverageIds: entries.coverage.map((row) => row.id),
      acceptanceIds: entries.acceptances.map((row) => row.id),
      expected: working.expected,
    };
    await this.audit(context, checked, written, source);
    await this.publish(context, checked, written);
    return written;
  }

  /** One audit record naming what the request wrote (13.1 "Write"; PRD-ACS-013), with its approval evidence. */
  private async audit(context: TransactionContext, checked: CheckedRequest, written: Written, source: AuditSource) {
    const { request } = checked.plan;
    const entries = checked.working.entries;
    const first = entries.movements[0] ?? entries.holds[0] ?? entries.reservations[0];
    const record =
      written.movementIds[0] !== undefined
        ? { type: 'movement', id: written.movementIds[0] }
        : written.holdIds[0] !== undefined
          ? { type: 'hold', id: written.holdIds[0] }
          : written.reservationIds[0] !== undefined
            ? { type: 'reservation', id: written.reservationIds[0] }
            : written.coverageIds[0] !== undefined
              ? { type: 'coverage', id: written.coverageIds[0] }
              : { type: 'acceptance', id: written.acceptanceIds[0] ?? '' };
    const brands = new Set(entries.movements.flatMap((each) => each.brandIds));
    const scope = first?.scope;
    const brandId = brands.size === 1 ? [...brands][0] : undefined;
    await this.dependencies.audit.record(context, {
      actor:
        request.actor.kind === 'user'
          ? { kind: 'user', id: request.actor.userId }
          : {
              kind: 'service-identity',
              id: request.actor.serviceIdentityId,
              ...(request.actor.onBehalfOfUserId === undefined
                ? {}
                : { onBehalfOfUserId: request.actor.onBehalfOfUserId }),
            },
      roleAssignmentId: request.actor.roleAssignmentId,
      occurredAt: checked.plan.occurredAt,
      ...(scope === undefined
        ? {}
        : {
            scope: {
              siteId: scope.siteId,
              ...(scope.storeId === null ? {} : { storeId: scope.storeId }),
              businessUnitId: scope.businessUnitId,
              legalEntityId: scope.legalEntityId,
              ...(brandId == null ? {} : { brandId }),
            },
          }),
      record: { module: 'stock', type: record.type, id: record.id, versionId: request.source.versionId },
      operation: 'post-stock',
      changes: [
        { kind: 'value', field: 'source', before: null, after: { ...request.source } },
        { kind: 'value', field: 'movements', before: null, after: written.movementIds },
        { kind: 'value', field: 'holds', before: null, after: written.holdIds },
        { kind: 'value', field: 'reservations', before: null, after: written.reservationIds },
        { kind: 'value', field: 'coverage', before: null, after: written.coverageIds },
        { kind: 'value', field: 'acceptances', before: null, after: written.acceptanceIds },
      ],
      source,
      ...(request.approval === undefined ? {} : { approval: { ...request.approval } }),
      ...(request.idempotencyKey === undefined ? {} : { idempotencyKey: request.idempotencyKey }),
    });
  }

  /** The events of 13.7, identifiers only, in the request's transaction (PRD-MOD-006). */
  private async publish(context: TransactionContext, checked: CheckedRequest, written: Written) {
    const { request } = checked.plan;
    const subject = (recordType: string, recordId: string) => ({
      module: 'stock',
      recordType,
      recordId,
      versionId: request.source.versionId,
    });
    const freezes = new Set([
      ...checked.working.entries.holds.filter((row) => row.kind === 'count-freeze').map((row) => row.id),
      ...checked.working.entries.holdReleases.filter((row) => row.holdKind === 'count-freeze').map((row) => row.holdId),
    ]);
    const holds = written.holdIds.filter((id) => !freezes.has(id));
    const [movementId] = written.movementIds;
    if (movementId !== undefined) {
      await context.publish(movementsPosted, {
        subject: subject('stock.movement', movementId),
        payload: { movementIds: written.movementIds },
      });
    }
    const [holdId] = holds;
    if (holdId !== undefined)
      await context.publish(holdChanged, { subject: subject('stock.hold', holdId), payload: { holdIds: holds } });
    const [reservationId] = written.reservationIds;
    if (reservationId !== undefined) {
      await context.publish(reservationChanged, {
        subject: subject('stock.reservation', reservationId),
        payload: { reservationIds: written.reservationIds },
      });
    }
    const [freezeId] = freezes;
    if (freezeId !== undefined) {
      await context.publish(countFreezeChanged, {
        subject: subject('stock.hold', freezeId),
        payload: { holdIds: [...freezes] },
      });
    }
  }
}
