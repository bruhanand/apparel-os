import { known, paise, uuidv7 } from '@apparel-os/domain';
import { and, eq, gt, inArray, sql } from 'drizzle-orm';
import type { TransactionContext } from '../../../kernel/index.js';
import type { ItemCheck, PostItem } from '../../finance/books/index.js';
import {
  balance,
  coverage,
  hold,
  holdClaim,
  movement,
  movementLeg,
  piece,
  receiptOrigin,
  reservationClaim,
  transitValue,
  transitValueLayer,
} from './db/schema.js';
import { STOCK_POSTING_EVENT_KINDS } from './domain/event-kinds.js';
import { skuKey, unitKey, type UnitKey } from './domain/keys.js';
import {
  postedRecordType,
  refusalOf,
  StockRefused,
  type Goods,
  type LedgerItem,
  type LedgerRequest,
} from './domain/request.js';
import type { Formula, PoolMode } from './domain/valuation.js';
import type { TransitKind } from './domain/working.js';
import type { LedgerBooks, LedgerPlaces, LedgerSkus, SkuFacts, UnitFacts } from './ports.js';

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
  /** The cost setting of each book a valued item touches, read at Plan, which a new pool takes (13.1, 14.2). */
  readonly costSettings: ReadonlyMap<string, CostSetting>;
  /** The pools the valued items need, by key; a missing one is created empty at step 6 (10.3; SL-24). */
  readonly pools: ReadonlyMap<string, PoolTarget>;
  /** Further pools to lock at step 6 by identifier, such as those a late cost change's lineage reaches (7.7). */
  readonly poolIds: ReadonlySet<string>;
  /** The transit values the valued items need, by key; one a dispatch or a departure makes is created at step 6. */
  readonly transits: ReadonlyMap<string, TransitTarget>;
  /** The sales the customer returns bring back (7.5). */
  readonly saleIds: ReadonlySet<string>;
  /** The movements a reversal undoes or a piece correction corrects (7.5, 8.4; S1-F10-T06). */
  readonly reversedIds: ReadonlySet<string>;
  /** Origins whose established value a reversal reads, with the units their cost put into pools (7.5). */
  readonly enteredOrigins: ReadonlySet<string>;
  /**
   * Check postable's answer for each valued item, asked before any lock with every component of its kind (13.1
   * "Plan"; books-and-posting 9.1), whose periods the caller holds at step 7 and journal series at step 8.
   */
  readonly postingChecks: readonly ItemCheck[];
}

/** A book's cost setting in force on the business date (books-and-posting 2.2). */
export interface CostSetting {
  readonly versionId: string;
  readonly formula: Formula;
  readonly poolMode: PoolMode;
}

/** A cost pool a request needs: one per book and SKU, and per Site in Site mode (7.1). */
export interface PoolTarget {
  readonly key: string;
  readonly bookId: string;
  readonly skuId: string;
  readonly mode: PoolMode;
  readonly siteId: string | null;
  readonly formula: Formula;
  readonly costSettingVersionId: string;
  readonly legalEntityId: string;
  readonly brandId: string;
}

/** A transit value a request needs: one per dispatch or shipment, book and SKU (14.2). */
export interface TransitTarget {
  readonly key: string;
  readonly kind: TransitKind;
  readonly ref: string;
  readonly bookId: string;
  readonly skuId: string;
  /** Created at step 6 when missing: a dispatch between pools, a supplier-return departure (7.8). */
  readonly create: boolean;
  readonly unit: UnitFacts;
  readonly brandId: string;
  /** Its book's formula, which a new transit value keeps (7.8; 0067). */
  readonly formula: Formula;
}

/** The key of the pool a unit's goods of a SKU are in, under its book's pool mode (7.1; PRD-LED-015). */
export function poolKey(bookId: string, skuId: string, siteId: string | null): string {
  return `${bookId}|${skuId}|${siteId ?? '-'}`;
}

export function transitKey(kind: TransitKind, ref: string, bookId: string, skuId: string): string {
  return `${kind}|${ref}|${bookId}|${skuId}`;
}

export interface AnchorTarget {
  readonly unit: UnitFacts;
  readonly mode: 'exclusive' | 'shared';
}

/**
 * A SKU balance a request locks at step 3 (10.3): of a SKU at a unit, or of the goods of Unknown SKU there of one brand,
 * which share one row, in pieces, of the brand they were counted under (14.1, 14.2; 13.14; RR-555).
 */
export interface SkuBalanceTarget {
  readonly unit: UnitFacts;
  readonly skuId: string | null;
  readonly stockUnit: SkuFacts['stockUnit'];
  readonly brandId: string | null;
}

/** What Plan reads from: the declared reads of `organisation` and `merchandise` (13.9). */
export interface PlanReads {
  readonly places: LedgerPlaces;
  readonly skus: LedgerSkus;
  readonly books: LedgerBooks;
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
  /**
   * The origins an identity step of this request makes, by the identifier the caller gave (13.14): later items of the
   * request may name them, as PT approval records their coverage and cost (goods-in 6.3 steps 4 and 5).
   */
  const madeInRequest = new Map<string, { at: UnitFacts; receiving: UnitFacts; sku: SkuFacts }>();

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
    skuBalances.set(skuKey(unit.siteId, unit.businessUnitId, sku.skuId), {
      unit,
      skuId: sku.skuId,
      stockUnit: sku.stockUnit,
      brandId: sku.brandId,
    });
  /**
   * The SKU balance of the goods of Unknown SKU of one brand at a unit (13.14): one row, in pieces, of the brand they
   * were counted under (14.1; RR-555).
   */
  const unknownBalanceOf = (unit: UnitFacts, brandId: string | null) =>
    skuBalances.set(skuKey(unit.siteId, unit.businessUnitId, null, brandId), {
      unit,
      skuId: null,
      stockUnit: 'piece',
      brandId,
    });
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

  // The valued items (13.4; S1-F10-T03): cost settings, pools, transit values, sales returned and posting probes.
  const costSettings = new Map<string, CostSetting>();
  const pools = new Map<string, PoolTarget>();
  const poolIds = new Set<string>();
  const transits = new Map<string, TransitTarget>();
  const saleIds = new Set<string>();
  const reversedIds = new Set<string>();
  const enteredOrigins = new Set<string>();
  const probes: PostItem[] = [];
  const probeLines = new Map<string, string>();
  /** The book's cost setting in force on the business date, if it has one (books-and-posting 2.2). */
  const settingIfAny = async (bookId: string): Promise<CostSetting | undefined> => {
    let setting = costSettings.get(bookId);
    if (setting === undefined) {
      const read = await reads.books.costSettingOn(context, bookId, businessDate);
      if (read.kind !== 'set') return undefined;
      setting = { versionId: read.versionId, formula: read.formula, poolMode: read.poolMode };
      costSettings.set(bookId, setting);
    }
    return setting;
  };
  const settingOf = async (lineId: string, bookId: string): Promise<CostSetting> => {
    const setting = await settingIfAny(bookId);
    // books-and-posting 2.2; PRD-SEC-017: a book with no approved cost setting takes no valued movement.
    if (setting === undefined) {
      throw new StockRefused(refusalOf('no-cost-setting', lineId, [{ kind: 'book-setting', bookId }]));
    }
    return setting;
  };
  /** The pool a unit's goods of a SKU are in (7.1), named for step 6. */
  const poolOf = async (lineId: string, unit: UnitFacts, sku: SkuFacts): Promise<PoolTarget> => {
    const setting = await settingOf(lineId, unit.bookId);
    const siteId = setting.poolMode === 'site' ? unit.siteId : null;
    const key = poolKey(unit.bookId, sku.skuId, siteId);
    let target = pools.get(key);
    if (target === undefined) {
      target = {
        key,
        bookId: unit.bookId,
        skuId: sku.skuId,
        mode: setting.poolMode,
        siteId,
        formula: setting.formula,
        costSettingVersionId: setting.versionId,
        legalEntityId: unit.legalEntityId,
        brandId: sku.brandId,
      };
      pools.set(key, target);
    }
    return target;
  };
  const transitOf = async (
    lineId: string,
    kind: TransitKind,
    ref: string,
    unit: UnitFacts,
    sku: SkuFacts,
    create: boolean,
  ): Promise<TransitTarget | undefined> => {
    const key = transitKey(kind, ref, unit.bookId, sku.skuId);
    const found = transits.get(key);
    if (found !== undefined) return found;
    if (!create) {
      const [row] = await context.tx
        .select({ id: transitValue.id })
        .from(transitValue)
        .where(
          and(
            eq(transitValue.transitKind, kind),
            eq(transitValue.transitRef, ref),
            eq(transitValue.bookId, unit.bookId),
            eq(transitValue.skuId, sku.skuId),
          ),
        );
      if (row === undefined) return undefined;
    }
    const target: TransitTarget = {
      key,
      kind,
      ref,
      bookId: unit.bookId,
      skuId: sku.skuId,
      create,
      unit,
      brandId: sku.brandId,
      formula: (await settingOf(lineId, unit.bookId)).formula,
    };
    transits.set(key, target);
    return target;
  };
  /** Check postable is asked about each valued item before any lock, with every component of its kind (13.1). */
  const probe = (lineId: string, eventKind: string, unit: UnitFacts, sku: SkuFacts) => {
    const kind = STOCK_POSTING_EVENT_KINDS.find((each) => each.kind === eventKind);
    const itemKey = uuidv7();
    probeLines.set(itemKey, lineId);
    probes.push({
      itemKey,
      eventKind,
      businessUnitId: unit.businessUnitId,
      brandId: sku.brandId,
      businessDate,
      components: (kind?.components ?? []).map((component) => ({ component, amount: known(paise(1)) })),
    });
  };
  /** A transit's units at its source unit: its balances there are locked, as any balance a request changes. */
  const transitPlace = async (lineId: string, from: { siteId: string; businessUnitId: string }, goods: Goods) => {
    const unit = await unitOf(lineId, from.siteId, from.businessUnitId);
    anchor(unit, 'shared');
    await goodsAt(lineId, unit, goods);
    return { unit, sku: await skuOf(lineId, goods.skuId, unit.siteId) };
  };
  /**
   * A cost item's origin (7.6, 7.7): locked exclusively at step 2 with every balance it has (10.3); the pools and
   * transit values its units are in, and under FIFO those its cost layers' lineage reached, locked at step 6.
   */
  const costOrigin = async (lineId: string, originId: string, adjusting: boolean) => {
    // An origin the identity step makes earlier in the request (13.14): a new row, so nothing of it is locked; its
    // units are at the identity step's unit, whose pool is locked at step 6, and it keeps its parent's receiving unit.
    const madeHere = madeInRequest.get(originId);
    if (madeHere !== undefined) {
      if (adjusting) throw new StockRefused(refusalOf('exceeds-source', lineId, [{ kind: 'cost-established' }]));
      await poolOf(lineId, madeHere.at, madeHere.sku);
      await settingOf(lineId, madeHere.receiving.bookId);
      return { unit: madeHere.receiving, sku: madeHere.sku };
    }
    const [origin] = await context.tx.select().from(receiptOrigin).where(eq(receiptOrigin.id, originId));
    if (origin?.skuId == null) {
      throw new StockRefused(
        refusalOf('invalid-item', lineId, [{ kind: 'receipt-origin', receiptOriginId: originId }]),
      );
    }
    originIds.set(originId, 'exclusive');
    coverageOrigins.add(originId);
    const unit = await unitOf(lineId, origin.siteId, origin.businessUnitId);
    const sku = await skuOf(lineId, origin.skuId, origin.siteId);
    const held = await context.tx
      .select()
      .from(balance)
      .where(and(eq(balance.receiptOriginId, originId), gt(balance.quantity, 0)));
    for (const row of held) {
      const at = await unitOf(lineId, row.siteId, row.businessUnitId);
      if (row.transitKind !== null && row.transitRef !== null) {
        const transit = await transitOf(lineId, row.transitKind as TransitKind, row.transitRef, at, sku, false);
        if (transit === undefined && row.transitKind === 'dispatch') await poolOf(lineId, at, sku);
      } else await poolOf(lineId, at, sku);
    }
    if (adjusting) {
      // FIFO lineage (7.7): the layers the origin's cost made, the layers that came from them, and the transit values
      // holding their units, wherever they are now.
      const lineage = await context.tx.execute<{ id: string; pool: string }>(sql`
        with recursive l as (
          select id, cost_pool_id from stock.cost_layer where receipt_origin_id = ${originId}::uuid
          union
          select c.id, c.cost_pool_id from stock.cost_layer c join l on c.from_layer_id = l.id)
        select id, cost_pool_id as pool from l`);
      for (const row of lineage.rows) poolIds.add(row.pool);
      const layerIds = lineage.rows.map((row) => row.id);
      if (layerIds.length > 0) {
        const inTransit = await context.tx
          .selectDistinct({
            kind: transitValue.transitKind,
            ref: transitValue.transitRef,
            bookId: transitValue.bookId,
          })
          .from(transitValueLayer)
          .innerJoin(transitValue, eq(transitValue.id, transitValueLayer.transitValueId))
          .where(and(inArray(transitValueLayer.sourceLayerId, layerIds), gt(transitValueLayer.quantity, 0)));
        for (const row of inTransit) {
          await transitOf(lineId, row.kind as TransitKind, row.ref, { ...unit, bookId: row.bookId }, sku, false);
        }
      }
    }
    await settingOf(lineId, unit.bookId);
    return { unit, sku };
  };

  const planItem = async (item: LedgerItem) => {
    switch (item.kind) {
      case 'identity-resolved': {
        // The approved identity route (13.4, 13.14; PRD-DMG-005, POL-17.02): the request carries the approval it runs
        // under, the PT approval's. Whether that decision holds is `access`'s Verify under lock (13.1).
        if (request.approval === undefined) {
          throw new StockRefused(refusalOf('condition-route', item.lineId, [{ kind: 'route', route: 'identity' }]));
        }
        if (item.parts.length === 0)
          throw new StockRefused(refusalOf('invalid-item', item.lineId, [{ kind: 'parts' }]));
        const at = await unitOf(item.lineId, item.at.siteId, item.at.businessUnitId);
        anchor(at, 'shared');
        const made: string[] = [];
        for (const part of item.parts) {
          const [origin] = await context.tx
            .select()
            .from(receiptOrigin)
            .where(eq(receiptOrigin.id, part.receiptOriginId));
          if (origin === undefined) {
            throw new StockRefused(
              refusalOf('invalid-item', item.lineId, [
                { kind: 'receipt-origin', receiptOriginId: part.receiptOriginId },
              ]),
            );
          }
          // The origin's identity is what changes, so it is locked exclusively (14.3), with the SKU balances its units
          // leave and enter at the unit (10.3 steps 2 and 3).
          originIds.set(origin.id, 'exclusive');
          const receiving = await unitOf(item.lineId, origin.siteId, origin.businessUnitId);
          if (origin.skuId === null) unknownBalanceOf(at, origin.brandId);
          else balanceOf(at, await skuOf(item.lineId, origin.skuId, at.siteId));
          const sku = await skuOf(item.lineId, part.skuId, at.siteId);
          balanceOf(at, sku);
          if (part.newReceiptOriginId !== undefined) {
            made.push(part.newReceiptOriginId);
            madeInRequest.set(part.newReceiptOriginId, { at, receiving, sku });
          }
        }
        // A new origin's identifier is the caller's (13.14): one already written is no new origin.
        if (made.length > 0) {
          const [taken] = await context.tx
            .select({ id: receiptOrigin.id })
            .from(receiptOrigin)
            .where(inArray(receiptOrigin.id, made));
          if (taken !== undefined) {
            throw new StockRefused(
              refusalOf('invalid-item', item.lineId, [{ kind: 'receipt-origin', receiptOriginId: taken.id }]),
            );
          }
        }
        return;
      }
      case 'receipt-count':
      case 'opening-count': {
        // An opening count comes from an opening batch only (13.4; S1-F13-T03).
        if (item.kind === 'opening-count' && request.source.importKind !== 'opening-balance')
          throw new StockRefused(refusalOf('invalid-item', item.lineId, [{ kind: 'import-kind' }]));
        if (item.kind === 'opening-count' && item.withoutValuationEvidence !== undefined) {
          // Held as excess, owner Unknown (9 step 3; PRD-STK-014), for a stated reason.
          if (item.owner.kind !== 'unknown')
            throw new StockRefused(refusalOf('invalid-item', item.lineId, [{ kind: 'owner' }]));
          if (item.withoutValuationEvidence.reason.trim() === '')
            throw new StockRefused(refusalOf('invalid-item', item.lineId, [{ kind: 'reason' }]));
        }
        const unit = await place(item.lineId, item.to.siteId, item.to.businessUnitId, item.to.locationId);
        if (!Number.isInteger(item.quantity) || item.quantity <= 0)
          throw new StockRefused(refusalOf('invalid-item', item.lineId, [{ kind: 'quantity' }]));
        if (item.skuId === null) {
          // Goods of a product not yet set up (13.14; GI-1): their SKU balance is of the brand they are counted under,
          // which they must name before anything is locked (RR-555); the Recheck checks their identity as described.
          if (typeof item.brandId !== 'string' || item.brandId.trim() === '')
            throw new StockRefused(refusalOf('invalid-item', item.lineId, [{ kind: 'brand' }]));
          unknownBalanceOf(unit, item.brandId);
          return;
        }
        const sku = await skuOf(item.lineId, item.skuId, unit.siteId);
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
        // A reservation is valued for its approval at its pool's cost of the units (13.10 "Value for approval";
        // product owner, 11 Oct 2026): the pool is locked at step 6 and read under the lock. A book with no cost
        // setting has no pool, and the reservation's value is Unknown.
        if (item.kind === 'reserve' && (await settingIfAny(unit.bookId)) !== undefined) {
          for (const goods of item.goods)
            await poolOf(item.lineId, unit, await skuOf(item.lineId, goods.skuId, unit.siteId));
        }
        return;
      }
      case 'record-coverage': {
        // An origin the identity step makes earlier in the request (13.14): a new row, nothing of it to read or lock.
        if (madeInRequest.has(item.receiptOriginId)) {
          if (item.pieceCodes !== undefined)
            throw new StockRefused(refusalOf('invalid-item', item.lineId, [{ kind: 'piece-codes' }]));
          return;
        }
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
      case 'cost-established':
      case 'cost-adjustment': {
        const { unit, sku } = await costOrigin(item.lineId, item.receiptOriginId, item.kind === 'cost-adjustment');
        probe(item.lineId, `stock.${item.kind}`, unit, sku);
        return;
      }
      case 'dispatch':
      case 'supplier-return-departure': {
        const from = await place(item.lineId, item.from.siteId, item.from.businessUnitId, item.from.locationId);
        await goodsAt(item.lineId, from, item.goods);
        const sku = await skuOf(item.lineId, item.goods.skuId, from.siteId);
        reservationIds.add(item.reservationId);
        const source = await poolOf(item.lineId, from, sku);
        if (item.kind === 'supplier-return-departure') {
          await transitOf(item.lineId, 'return-shipment', item.shipmentId, from, sku, true);
          probe(item.lineId, 'stock.supplier-return-departure', from, sku);
          return;
        }
        const to = await unitOf(item.lineId, item.to.siteId, item.to.businessUnitId);
        const destination = await poolOf(item.lineId, to, sku);
        // Different pools (Site pools, or two books): value leaves the source pool onto the dispatch (7.8).
        if (destination.key !== source.key) {
          await transitOf(item.lineId, 'dispatch', item.dispatchId, from, sku, true);
          probe(item.lineId, 'stock.pool-dispatch', from, sku);
        }
        return;
      }
      case 'arrival-count':
      case 'supplier-rejection-return':
      case 'supplier-handover': {
        const source = await transitPlace(item.lineId, item.from, item.goods);
        const kind: TransitKind = item.kind === 'arrival-count' ? 'dispatch' : 'return-shipment';
        const ref = item.kind === 'arrival-count' ? item.dispatchId : item.shipmentId;
        const transit = await transitOf(item.lineId, kind, ref, source.unit, source.sku, false);
        if (item.kind === 'supplier-handover') {
          if (transit !== undefined) probe(item.lineId, 'stock.supplier-handover', source.unit, source.sku);
          return;
        }
        const to = await place(item.lineId, item.to.siteId, item.to.businessUnitId, item.to.locationId);
        balanceOf(to, source.sku);
        await poolOf(item.lineId, to, source.sku);
        await poolOf(item.lineId, source.unit, source.sku);
        if (transit !== undefined) {
          probe(
            item.lineId,
            item.kind === 'arrival-count' ? 'stock.pool-arrival' : 'stock.supplier-rejection-return',
            to,
            source.sku,
          );
        }
        return;
      }
      case 'sale-issue': {
        const unit = await place(item.lineId, item.at.siteId, item.at.businessUnitId, item.at.locationId);
        await goodsAt(item.lineId, unit, item.goods);
        const sku = await skuOf(item.lineId, item.goods.skuId, unit.siteId);
        await poolOf(item.lineId, unit, sku);
        // A supplier-owned unit passing through at its agreed cost posts its own kind (7.2; S1-F10-T06).
        probe(item.lineId, item.agreedCostPaise === undefined ? 'stock.sale-issue' : 'stock.pass-through', unit, sku);
        return;
      }
      case 'disposal': {
        const unit = await place(item.lineId, item.at.siteId, item.at.businessUnitId, item.at.locationId);
        await goodsAt(item.lineId, unit, item.goods);
        holdIds.add(item.holdId);
        await claimsOf(
          item.lineId,
          await context.tx
            .select()
            .from(holdClaim)
            .where(and(eq(holdClaim.holdId, item.holdId), gt(holdClaim.quantity, 0))),
        );
        const sku = await skuOf(item.lineId, item.goods.skuId, unit.siteId);
        await poolOf(item.lineId, unit, sku);
        probe(item.lineId, 'stock.disposal-loss', unit, sku);
        return;
      }
      case 'count-difference': {
        const unit = await place(item.lineId, item.at.siteId, item.at.businessUnitId, item.at.locationId);
        const sku = await skuOf(item.lineId, item.goods.skuId, unit.siteId);
        holdIds.add(item.countId);
        if (item.difference === 'gain') {
          // New piece codes labelled at the count, unused (8.4; PRD-MER-015).
          balanceOf(unit, sku);
          for (const code of item.goods.pieceCodes ?? []) newCodes.add(code);
          return;
        }
        await goodsAt(item.lineId, unit, item.goods);
        await poolOf(item.lineId, unit, sku);
        probe(item.lineId, 'stock.count-loss', unit, sku);
        return;
      }
      case 'reversal': {
        const [reversed] = await context.tx.select().from(movement).where(eq(movement.id, item.movementId));
        if (reversed === undefined) {
          throw new StockRefused(
            refusalOf('invalid-item', item.lineId, [{ kind: 'movement', movementId: item.movementId }]),
          );
        }
        // Built for a receipt count made in error and a count loss (13.4 "Reversal"; S1-F10-T06).
        if (reversed.kind !== 'receipt-count' && reversed.kind !== 'count-difference') {
          throw new StockRefused(
            refusalOf('invalid-item', item.lineId, [{ kind: 'reversal-of', movementKind: reversed.kind }]),
          );
        }
        reversedIds.add(reversed.id);
        const unit = await place(item.lineId, item.at.siteId, item.at.businessUnitId, item.at.locationId);
        const sku = await skuOf(item.lineId, item.goods.skuId, unit.siteId);
        const legs = await context.tx
          .select({ originId: movementLeg.receiptOriginId })
          .from(movementLeg)
          .where(eq(movementLeg.movementId, reversed.id));
        await poolOf(item.lineId, unit, sku);
        if (reversed.kind === 'receipt-count') {
          // An inflow made in error: its origin's established value changes, so the origin is locked exclusively
          // (10.3 step 2); its units leave from the place named (7.5).
          for (const leg of legs) {
            originIds.set(leg.originId, 'exclusive');
            enteredOrigins.add(leg.originId);
          }
          await goodsAt(item.lineId, unit, {
            ...item.goods,
            ...(sku.pieceTracked ? {} : { receiptOriginId: legs[0]?.originId ?? '' }),
          });
          probe(item.lineId, 'stock.cost-established-reversal', unit, sku);
          return;
        }
        // An outflow brought back (7.5, 8.4): its origins only read; the units come back at the place named.
        for (const leg of legs) shared(leg.originId);
        await unitOf(item.lineId, reversed.siteId, reversed.businessUnitId);
        balanceOf(unit, sku);
        for (const code of item.goods.pieceCodes ?? []) pieceCodes.set(code, item.lineId);
        if (item.replacesOriginId !== undefined) {
          await goodsAt(item.lineId, unit, { ...item.goods, receiptOriginId: item.replacesOriginId });
        }
        await poolOf(item.lineId, await unitOf(item.lineId, reversed.siteId, reversed.businessUnitId), sku);
        probe(item.lineId, 'stock.count-loss-reversal', unit, sku);
        return;
      }
      case 'piece-correction': {
        const [corrected] = await context.tx.select().from(movement).where(eq(movement.id, item.movementId));
        if (corrected === undefined) {
          throw new StockRefused(
            refusalOf('invalid-item', item.lineId, [{ kind: 'movement', movementId: item.movementId }]),
          );
        }
        reversedIds.add(corrected.id);
        if (item.countId !== undefined) holdIds.add(item.countId);
        const unit = await place(item.lineId, item.at.siteId, item.at.businessUnitId, item.at.locationId);
        const rows = await context.tx
          .select({
            code: piece.code,
            skuId: piece.skuId,
            siteId: piece.siteId,
            businessUnitId: piece.businessUnitId,
          })
          .from(piece)
          .where(inArray(piece.code, [item.foundPieceCode, item.missingPieceCode]));
        for (const code of [item.foundPieceCode, item.missingPieceCode]) {
          const row = rows.find((each) => each.code === code);
          if (row?.skuId == null)
            throw new StockRefused(refusalOf('invalid-item', item.lineId, [{ kind: 'piece', code }]));
          pieceCodes.set(code, item.lineId);
          const sku = await skuOf(item.lineId, row.skuId, row.siteId);
          const at = await unitOf(item.lineId, row.siteId, row.businessUnitId);
          anchor(at, 'shared');
          balanceOf(at, sku);
          balanceOf(unit, sku);
          await poolOf(item.lineId, at, sku);
          await poolOf(item.lineId, unit, sku);
          await poolOf(item.lineId, await unitOf(item.lineId, corrected.siteId, corrected.businessUnitId), sku);
        }
        return;
      }
      case 'customer-return': {
        const [sale] = await context.tx.select().from(movement).where(eq(movement.id, item.saleMovementId));
        if (sale?.kind !== 'sale-issue') {
          throw new StockRefused(
            refusalOf('invalid-item', item.lineId, [{ kind: 'movement', movementId: item.saleMovementId }]),
          );
        }
        saleIds.add(sale.id);
        await unitOf(item.lineId, sale.siteId, sale.businessUnitId);
        const legs = await context.tx
          .select({ originId: movementLeg.receiptOriginId })
          .from(movementLeg)
          .where(eq(movementLeg.movementId, sale.id));
        for (const leg of legs) shared(leg.originId);
        const unit = await place(item.lineId, item.to.siteId, item.to.businessUnitId, item.to.locationId);
        const sku = await skuOf(item.lineId, item.goods.skuId, unit.siteId);
        balanceOf(unit, sku);
        for (const code of item.goods.pieceCodes ?? []) pieceCodes.set(code, item.lineId);
        await poolOf(item.lineId, unit, sku);
        probe(item.lineId, 'stock.customer-return', unit, sku);
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

  // 13.1 "Plan"; books-and-posting 9.1, 10 step 1: Check postable before any lock; a refusal stops the command with
  // nothing written and names its reason (PRD-UXP-003; SL-23).
  const postingChecks =
    probes.length === 0
      ? []
      : await reads.books.checkPostable(context, {
          sourceModule: request.source.module,
          document: {
            recordType: postedRecordType(request.source),
            recordId: request.source.recordId,
            versionId: request.source.versionId,
            importKind: request.source.importKind,
          },
          items: probes,
        });
  const refused = postingChecks.find((check) => check.kind === 'refused');
  if (refused !== undefined) {
    throw new StockRefused(
      refusalOf('posting-refused', probeLines.get(refused.itemKey), [
        { kind: 'posting', code: refused.refusal.code },
        ...refused.refusal.missing,
      ]),
    );
  }

  return {
    request,
    businessDate,
    costSettings,
    pools,
    poolIds,
    transits,
    saleIds,
    reversedIds,
    enteredOrigins,
    postingChecks,
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
