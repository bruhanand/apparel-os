import { uuidv7 } from '@apparel-os/domain';
import type { MissingItem } from '../../../../kernel/index.js';
import type { SkuFacts, UnitFacts } from '../ports.js';
import {
  refuse,
  type Condition,
  type FreezeScope,
  type Goods,
  type ItemValue,
  type LedgerItem,
  type Owner,
  type Place,
} from './request.js';

// The working state of one ledger request (stock-ledger 13.1 "Recheck and value", 13.4, 13.5; S1-F10-T02): the rows
// the command locked and read after its locks, held in memory, which each item checks and changes in order, so that a
// later item sees what an earlier one did and the request stays all or nothing (PRD-INT-004, PRD-IMP-012). Pure: no
// database, no clock (code-house-rules 2). What it decides is written by Write; what it cannot see, the holds,
// reservations and freezes hidden from the actor, the command asks the narrowly authorised function about (DEC-117),
// with what this state collects for it.

export interface Scope {
  readonly siteId: string;
  readonly storeId: string | null;
  readonly businessUnitId: string;
  readonly legalEntityId: string;
  readonly brandId: string | null;
}

export interface SkuBalanceState {
  readonly id: string;
  readonly siteId: string;
  readonly businessUnitId: string;
  readonly skuId: string | null;
  quantity: number;
  changed: boolean;
}

export interface BalanceState {
  readonly id: string;
  readonly isNew: boolean;
  readonly skuBalanceId: string;
  readonly siteId: string;
  readonly businessUnitId: string;
  readonly locationId: string;
  readonly condition: Condition;
  readonly skuId: string | null;
  readonly batchCode: string | null;
  readonly expiryDate: string | null;
  readonly receiptOriginId: string;
  readonly countDate: string;
  readonly scope: Scope;
  quantity: number;
  accepted: number;
  changed: boolean;
}

export interface PieceState {
  readonly id: string;
  readonly isNew: boolean;
  readonly code: string;
  readonly skuId: string | null;
  readonly receiptOriginId: string;
  siteId: string;
  storeId: string | null;
  businessUnitId: string;
  legalEntityId: string;
  readonly brandId: string | null;
  locationId: string | null;
  condition: Condition;
  heldAs: 'custody' | 'in-transit' | 'billed-retained';
  inCustody: boolean;
  ptRevisionId: string | null;
  acceptedSiteId: string | null;
  lastMovementId: string | null;
  changed: boolean;
}

export interface OriginState {
  readonly id: string;
  readonly isNew: boolean;
  readonly skuId: string | null;
  readonly pieceTracked: boolean;
  readonly batchCode: string | null;
  readonly expiryDate: string | null;
  readonly countDate: string;
  readonly quantity: number;
  readonly scope: Scope;
  readonly stateId: string;
  readonly valueKnown: boolean;
  ptRevisionId: string | null;
  coveredQuantity: number;
  lastStateMovementId: string | null;
  stateChanged: boolean;
}

/** A claim of a hold or a reservation whose header the actor can see (14.2; 6.2). */
export interface ClaimState {
  readonly id: string;
  readonly isNew: boolean;
  readonly owner: 'hold' | 'reservation';
  readonly headerId: string;
  readonly headerKind: string;
  /** For a hold: the reservation it sits inside, if any (6.2). */
  readonly withinReservationId: string | null;
  readonly balanceId: string | null;
  readonly pieceId: string | null;
  readonly claimed: number;
  readonly scope: Scope;
  quantity: number;
  changed: boolean;
}

/** A hold or reservation header being released or ended, locked at step 5 (14.3). */
export interface HeaderState {
  readonly id: string;
  readonly owner: 'hold' | 'reservation';
  readonly kind: string;
  readonly scope: Omit<Scope, 'brandId'>;
  /** For a count freeze: whether it has ended (13.5). */
  readonly ended: boolean;
}

export interface CoverageState {
  readonly id: string;
  readonly action: 'cover' | 'remove';
  readonly ptRevisionId: string;
  readonly receiptOriginId: string;
  readonly pieceId: string | null;
  readonly quantity: number;
  readonly removed: boolean;
  readonly scope: Scope;
}

/** What the request writes, beyond the projections the state marks changed (14.2). */
export interface Entries {
  readonly origins: OriginState[];
  readonly movements: MovementEntry[];
  readonly coverage: CoverageEntry[];
  readonly acceptances: AcceptanceEntry[];
  readonly holds: HoldEntry[];
  readonly holdReleases: HoldReleaseEntry[];
  readonly reservations: ReservationEntry[];
  readonly reservationEvents: ReservationEventEntry[];
}

export interface MovementEntry {
  readonly id: string;
  readonly kind: 'receipt-count' | 'location-move' | 'condition-change';
  readonly lineId: string;
  readonly scope: Omit<Scope, 'brandId'>;
  readonly brandIds: (string | null)[];
  readonly legs: LegEntry[];
  readonly pieceIds: string[];
  readonly owner?: Owner;
}

export interface LegEntry {
  readonly id: string;
  readonly direction: 'out' | 'in';
  readonly receiptOriginId: string;
  readonly skuId: string | null;
  readonly quantity: number;
  readonly accepted: number;
  readonly locationId: string;
  readonly condition: Condition;
  readonly batchCode: string | null;
  readonly expiryDate: string | null;
  readonly bookId: string;
  readonly scope: Scope;
}

export interface CoverageEntry {
  readonly id: string;
  readonly lineId: string;
  readonly ptRevisionId: string;
  readonly receiptOriginId: string;
  readonly pieceTracked: boolean;
  readonly pieceId: string | null;
  readonly quantity: number;
  readonly action: 'cover' | 'remove';
  readonly removesCoverageId: string | null;
  readonly scope: Scope;
}

export interface AcceptanceEntry {
  readonly id: string;
  readonly lineId: string;
  readonly locationId: string;
  readonly condition: Condition;
  readonly receiptOriginId: string;
  readonly pieceId: string | null;
  readonly quantity: number;
  readonly scope: Scope;
}

export interface HoldEntry {
  readonly id: string;
  readonly lineId: string;
  readonly kind: string;
  readonly reason: string;
  readonly evidenceFileId: string | null;
  readonly withinReservationId: string | null;
  readonly scope: Omit<Scope, 'brandId'>;
  readonly brandIds: (string | null)[];
  readonly freezeScope: FreezeScope[];
  readonly claims: ClaimState[];
}

export interface HoldReleaseEntry {
  readonly id: string;
  readonly lineId: string;
  readonly holdId: string;
  readonly holdKind: string;
  readonly claimId: string | null;
  readonly event: string;
  readonly quantity: number | null;
  readonly pieceId: string | null;
  readonly scope: Scope;
}

export interface ReservationEntry {
  readonly id: string;
  readonly lineId: string;
  readonly kind: string;
  readonly scope: Omit<Scope, 'brandId'>;
  readonly brandIds: (string | null)[];
  readonly claims: ClaimState[];
}

export interface ReservationEventEntry {
  readonly id: string;
  readonly lineId: string;
  readonly reservationId: string;
  readonly reservationKind: string;
  readonly claimId: string;
  readonly event: string;
  readonly quantity: number;
  readonly pieceId: string | null;
  readonly scope: Scope;
}

/** What one unit needs of the hidden-row recheck (DEC-117): the free units the request left, per balance and piece. */
export interface HiddenCheck {
  readonly siteId: string;
  readonly businessUnitId: string;
  readonly spares: Map<string, number>;
  readonly pieceIds: Set<string>;
}

/** A count freeze's expected quantities: the balances in its scope under its locks (8.1, 13.5). */
export interface ExpectedQuantity {
  readonly holdId: string;
  readonly balanceId: string;
  readonly receiptOriginId: string;
  readonly skuId: string | null;
  readonly locationId: string;
  readonly condition: Condition;
  readonly quantity: number;
}

/** The release events of each hold kind and the events of each reservation kind (6.1; 14.2). */
const RELEASE_EVENTS: Readonly<Record<string, readonly string[]>> = {
  damage: ['report-rejected', 'damage-confirmed'],
  quarantine: ['approved-decision'],
  excess: ['pt-route', 'loss-link'],
  'source-conflict': ['conflict-resolved'],
  expiry: ['rule-change', 'supplier-return', 'write-off', 'disposal'],
  ordinary: ['released'],
  'count-freeze': ['count-closed'],
  inspection: ['inspected'],
  'write-off': ['disposal', 'write-off-reversed'],
};
const RESERVATION_EVENTS: Readonly<Record<string, readonly string[]>> = {
  transfer: ['cancelled'],
  'supplier-return': ['withdrawn'],
  'held-goods': ['cancelled'],
  'offline-protected': ['released'],
};

const key = (...parts: (string | null)[]) => parts.map((part) => part ?? '-').join('|');

/** What the state needs that Plan read before the locks (13.1). */
export interface WorkingInputs {
  readonly businessDate: string;
  readonly units: ReadonlyMap<string, UnitFacts>;
  readonly skus: ReadonlyMap<string, SkuFacts>;
  readonly skuBalances: readonly SkuBalanceState[];
  readonly balances: readonly BalanceState[];
  readonly origins: readonly OriginState[];
  readonly pieces: readonly PieceState[];
  readonly claims: readonly ClaimState[];
  readonly headers: readonly HeaderState[];
  readonly coverage: readonly CoverageState[];
  /** Per Site and unit, the origins Plan found with stock, for the staleness check (13.1). */
  readonly originsSeen: ReadonlyMap<string, ReadonlySet<string>>;
  /** Codes of pieces already written anywhere the actor can see (13.4 "Piece codes unused"). */
  readonly usedCodes: ReadonlySet<string>;
}

export class Working {
  readonly entries: Entries = {
    origins: [],
    movements: [],
    coverage: [],
    acceptances: [],
    holds: [],
    holdReleases: [],
    reservations: [],
    reservationEvents: [],
  };
  readonly skuBalances = new Map<string, SkuBalanceState>();
  readonly balances = new Map<string, BalanceState>();
  readonly origins = new Map<string, OriginState>();
  readonly pieces = new Map<string, PieceState>();
  readonly piecesByCode = new Map<string, PieceState>();
  readonly claims: ClaimState[] = [];
  readonly hidden = new Map<string, HiddenCheck>();
  readonly expected: ExpectedQuantity[] = [];
  private readonly headers = new Map<string, HeaderState>();
  private readonly coverage = new Map<string, CoverageState>();
  private readonly usedCodes: Set<string>;

  constructor(private readonly inputs: WorkingInputs) {
    for (const row of inputs.skuBalances) this.skuBalances.set(row.id, row);
    for (const row of inputs.balances) this.balances.set(row.id, row);
    for (const row of inputs.origins) this.origins.set(row.id, row);
    for (const row of inputs.pieces) {
      this.pieces.set(row.id, row);
      this.piecesByCode.set(row.code, row);
    }
    this.claims.push(...inputs.claims);
    for (const row of inputs.headers) this.headers.set(row.id, row);
    for (const row of inputs.coverage) this.coverage.set(row.id, row);
    this.usedCodes = new Set(inputs.usedCodes);
  }

  /** Applies one item, refusing with the first failed check (13.8); answers its value on its approval basis. */
  apply(item: LedgerItem): ItemValue {
    switch (item.kind) {
      case 'receipt-count':
        return this.receiptCount(item);
      case 'location-move':
        return this.locationMove(item);
      case 'condition-change':
        return this.conditionChange(item);
      case 'record-coverage':
        return this.recordCoverage(item);
      case 'remove-coverage':
        return this.removeCoverage(item);
      case 'record-acceptance':
        return this.recordAcceptance(item);
      case 'place-hold':
        return this.placeHold(item);
      case 'release-hold':
        return this.releaseHold(item);
      case 'start-count-freeze':
        return this.startFreeze(item);
      case 'end-count-freeze':
        return this.endFreeze(item);
      case 'reserve':
        return this.reserve(item);
      case 'end-reservation':
        return this.endReservation(item);
    }
  }

  // --- reading the state ---------------------------------------------------------------------------------------

  unit(siteId: string, businessUnitId: string): UnitFacts {
    const unit = this.inputs.units.get(key(siteId, businessUnitId));
    if (unit === undefined) throw new Error(`No unit facts for ${siteId} ${businessUnitId}`);
    return unit;
  }

  sku(skuId: string): SkuFacts {
    const sku = this.inputs.skus.get(skuId);
    if (sku === undefined) throw new Error(`No SKU facts for ${skuId}`);
    return sku;
  }

  private scopeAt(siteId: string, businessUnitId: string, brandId: string | null): Scope {
    const unit = this.unit(siteId, businessUnitId);
    return { siteId, storeId: unit.storeId, businessUnitId, legalEntityId: unit.legalEntityId, brandId };
  }

  /** The scope of a header row, which records a brand set instead of one brand (14.1). */
  private headerScopeAt(siteId: string, businessUnitId: string): Omit<Scope, 'brandId'> {
    const unit = this.unit(siteId, businessUnitId);
    return { siteId, storeId: unit.storeId, businessUnitId, legalEntityId: unit.legalEntityId };
  }

  private skuBalanceOf(siteId: string, businessUnitId: string, skuId: string | null): SkuBalanceState {
    for (const row of this.skuBalances.values()) {
      if (row.siteId === siteId && row.businessUnitId === businessUnitId && row.skuId === skuId) return row;
    }
    throw new Error(`SKU balance not locked: ${siteId} ${businessUnitId} ${String(skuId)}`);
  }

  private activeClaims(filter: (claim: ClaimState) => boolean): ClaimState[] {
    return this.claims.filter((claim) => claim.quantity > 0 && filter(claim));
  }

  /** Units of a balance reserved, and held outside reservations, by claims the actor can see (6.2). */
  private claimedOn(balance: BalanceState): { reserved: number; held: number; holds: ClaimState[] } {
    const on = this.activeClaims((claim) => claim.balanceId === balance.id);
    const reserved = on.filter((claim) => claim.owner === 'reservation').reduce((sum, c) => sum + c.quantity, 0);
    const holds = on.filter((claim) => claim.owner === 'hold' && claim.withinReservationId === null);
    const held = holds.reduce((sum, c) => sum + c.quantity, 0);
    return { reserved, held, holds };
  }

  /** available = custody − reserved − held outside reservations, never below zero (6.2). */
  private freeOn(balance: BalanceState): number {
    const { reserved, held } = this.claimedOn(balance);
    return Math.max(0, balance.quantity - reserved - held);
  }

  private pieceClaims(piece: PieceState): ClaimState[] {
    return this.activeClaims(
      (claim) => claim.pieceId === piece.id && !(claim.owner === 'hold' && claim.withinReservationId !== null),
    );
  }

  private hiddenAt(siteId: string, businessUnitId: string): HiddenCheck {
    const at = key(siteId, businessUnitId);
    let check = this.hidden.get(at);
    if (check === undefined) {
      check = { siteId, businessUnitId, spares: new Map(), pieceIds: new Set() };
      this.hidden.set(at, check);
    }
    return check;
  }

  /** Records the free units a take left on a balance, for the hidden-row recheck (DEC-117). */
  private leaveSpare(balance: BalanceState, spare: number): void {
    const check = this.hiddenAt(balance.siteId, balance.businessUnitId);
    check.spares.set(balance.id, Math.min(check.spares.get(balance.id) ?? spare, spare));
  }

  /** The balances of a SKU at a place, in one condition, oldest first: soonest expiry, then count date (PRD-STK-013). */
  private balancesAt(place: Place, condition: Condition, goods: Goods): BalanceState[] {
    return [...this.balances.values()]
      .filter(
        (row) =>
          row.siteId === place.siteId &&
          row.businessUnitId === place.businessUnitId &&
          row.locationId === place.locationId &&
          row.condition === condition &&
          row.skuId === goods.skuId &&
          (goods.receiptOriginId === undefined || row.receiptOriginId === goods.receiptOriginId),
      )
      .sort(
        (a, b) =>
          (a.expiryDate ?? '9999-12-31').localeCompare(b.expiryDate ?? '9999-12-31') ||
          a.countDate.localeCompare(b.countDate) ||
          a.id.localeCompare(b.id),
      );
  }

  /** Plan staleness (13.1): every origin with stock here was one Plan found and locked. */
  private checkNotStale(lineId: string, place: Place, goods: Goods, candidates: readonly BalanceState[]): void {
    if (goods.receiptOriginId !== undefined || goods.pieceCodes !== undefined) return;
    const seen = this.inputs.originsSeen.get(key(place.siteId, place.businessUnitId, goods.skuId));
    if (candidates.some((row) => row.quantity > 0 && seen?.has(row.receiptOriginId) !== true)) {
      refuse('plan-stale', lineId);
    }
  }

  // --- changing the state --------------------------------------------------------------------------------------

  private balanceFor(
    siteId: string,
    businessUnitId: string,
    locationId: string,
    condition: Condition,
    origin: OriginState,
  ): BalanceState {
    for (const row of this.balances.values()) {
      if (
        row.siteId === siteId &&
        row.businessUnitId === businessUnitId &&
        row.locationId === locationId &&
        row.condition === condition &&
        row.receiptOriginId === origin.id
      ) {
        return row;
      }
    }
    const created: BalanceState = {
      id: uuidv7(),
      isNew: true,
      skuBalanceId: this.skuBalanceOf(siteId, businessUnitId, origin.skuId).id,
      siteId,
      businessUnitId,
      locationId,
      condition,
      skuId: origin.skuId,
      batchCode: origin.batchCode,
      expiryDate: origin.expiryDate,
      receiptOriginId: origin.id,
      countDate: origin.countDate,
      scope: this.scopeAt(siteId, businessUnitId, origin.scope.brandId),
      quantity: 0,
      accepted: 0,
      changed: true,
    };
    this.balances.set(created.id, created);
    return created;
  }

  private addTo(balance: BalanceState, quantity: number, accepted: number): void {
    balance.quantity += quantity;
    balance.accepted += accepted;
    balance.changed = true;
    const total = this.skuBalanceOf(balance.siteId, balance.businessUnitId, balance.skuId);
    total.quantity += quantity;
    total.changed = true;
  }

  private origin(lineId: string, originId: string): OriginState {
    const origin = this.origins.get(originId);
    if (origin === undefined) refuse('invalid-item', lineId, [{ kind: 'receipt-origin', receiptOriginId: originId }]);
    if (origin.valueKnown) throw new Error('Valued items arrive with S1-F10-T03');
    return origin;
  }

  private piece(lineId: string, code: string): PieceState {
    const piece = this.piecesByCode.get(code);
    if (piece === undefined) refuse('invalid-item', lineId, [{ kind: 'piece', code }]);
    return piece;
  }

  private brandOf(skuId: string | null): string | null {
    return skuId === null ? null : this.sku(skuId).brandId;
  }

  /** Why free units fall short (13.8): held or reserved by what the actor can see, or simply not there. */
  private shortfall(lineId: string, candidates: readonly BalanceState[], wanted: number, reservation = false): never {
    let quantity = 0;
    let reserved = 0;
    let held = 0;
    const holds: MissingItem[] = [];
    for (const row of candidates) {
      const on = this.claimedOn(row);
      quantity += row.quantity;
      reserved += on.reserved;
      held += on.held;
      holds.push(...on.holds.map((claim) => ({ kind: 'hold', holdKind: claim.headerKind, holdId: claim.headerId })));
    }
    if (wanted <= quantity - reserved && held > 0) refuse('held', lineId, holds);
    if (wanted <= quantity && reserved > 0) refuse(reservation ? 'reservation-overlap' : 'reserved', lineId);
    if (wanted <= quantity && held > 0) refuse('held', lineId, holds);
    refuse('insufficient-available', lineId);
  }

  /**
   * Takes free units of goods at a place for a movement or a reservation (6.2, 6.3): the pieces named, or a quantity
   * oldest first. Answers the balances and pieces taken. Refuses `piece-not-at-place`, `held`, `reserved` or
   * `insufficient-available`; a reservation names `reservation-overlap` for reserved units.
   */
  private takeFree(
    lineId: string,
    place: Place,
    condition: Condition,
    goods: Goods,
    options: { readonly reservation?: boolean; readonly fits?: (balance: BalanceState, free: number) => number } = {},
  ): { balance: BalanceState; quantity: number; pieces: PieceState[] }[] {
    const sku = this.sku(goods.skuId);
    if (sku.pieceTracked) {
      const taken = new Map<string, { balance: BalanceState; quantity: number; pieces: PieceState[] }>();
      for (const code of goods.pieceCodes ?? []) {
        const piece = this.piece(lineId, code);
        if (
          !piece.inCustody ||
          piece.heldAs !== 'custody' ||
          piece.siteId !== place.siteId ||
          piece.businessUnitId !== place.businessUnitId ||
          piece.locationId !== place.locationId ||
          piece.condition !== condition ||
          piece.skuId !== goods.skuId
        ) {
          refuse('piece-not-at-place', lineId, [{ kind: 'piece', code }]);
        }
        const claims = this.pieceClaims(piece);
        const hold = claims.find((claim) => claim.owner === 'hold');
        if (hold !== undefined)
          refuse('held', lineId, [{ kind: 'hold', holdKind: hold.headerKind, holdId: hold.headerId }]);
        if (claims.length > 0) refuse(options.reservation === true ? 'reservation-overlap' : 'reserved', lineId);
        const balance = this.balanceFor(
          place.siteId,
          place.businessUnitId,
          place.locationId,
          condition,
          this.origin(lineId, piece.receiptOriginId),
        );
        const entry = taken.get(balance.id) ?? { balance, quantity: 0, pieces: [] };
        entry.quantity += 1;
        entry.pieces.push(piece);
        taken.set(balance.id, entry);
        this.hiddenAt(place.siteId, place.businessUnitId).pieceIds.add(piece.id);
      }
      return [...taken.values()];
    }
    const candidates = this.balancesAt(place, condition, goods);
    this.checkNotStale(lineId, place, goods, candidates);
    let left = goods.quantity;
    const taken: { balance: BalanceState; quantity: number; pieces: PieceState[] }[] = [];
    for (const balance of candidates) {
      if (left === 0) break;
      const free = this.freeOn(balance);
      const usable = options.fits === undefined ? free : options.fits(balance, free);
      const take = Math.min(left, usable);
      if (take <= 0) continue;
      taken.push({ balance, quantity: take, pieces: [] });
      left -= take;
    }
    if (left > 0) this.shortfall(lineId, candidates, goods.quantity, options.reservation);
    for (const each of taken) this.leaveSpare(each.balance, this.freeOn(each.balance) - each.quantity);
    return taken;
  }

  private checkGoodsShape(lineId: string, goods: Goods): void {
    const sku = this.sku(goods.skuId);
    if (!Number.isInteger(goods.quantity) || goods.quantity <= 0)
      refuse('invalid-item', lineId, [{ kind: 'quantity' }]);
    if (sku.pieceTracked !== (goods.pieceCodes !== undefined))
      refuse('invalid-item', lineId, [{ kind: 'piece-codes' }]);
    if (goods.pieceCodes !== undefined && new Set(goods.pieceCodes).size !== goods.quantity) {
      refuse('invalid-item', lineId, [{ kind: 'piece-codes' }]);
    }
  }

  private newMovement(
    kind: MovementEntry['kind'],
    lineId: string,
    siteId: string,
    businessUnitId: string,
    skuIds: readonly (string | null)[],
  ): MovementEntry {
    const scope = this.headerScopeAt(siteId, businessUnitId);
    const movement: MovementEntry = {
      id: uuidv7(),
      kind,
      lineId,
      scope,
      brandIds: [...new Set(skuIds.map((skuId) => this.brandOf(skuId)))],
      legs: [],
      pieceIds: [],
    };
    this.entries.movements.push(movement);
    return movement;
  }

  private leg(direction: 'out' | 'in', balance: BalanceState, quantity: number, accepted: number): LegEntry {
    return {
      id: uuidv7(),
      direction,
      receiptOriginId: balance.receiptOriginId,
      skuId: balance.skuId,
      quantity,
      accepted,
      locationId: balance.locationId,
      condition: balance.condition,
      batchCode: balance.batchCode,
      expiryDate: balance.expiryDate,
      bookId: this.unit(balance.siteId, balance.businessUnitId).bookId,
      scope: balance.scope,
    };
  }

  // --- movement items (13.4) -----------------------------------------------------------------------------------

  /** Receipt count (13.4; PRD-REC-008, PRD-MER-015, PRD-ORG-019): a new receipt origin, its custody and pieces. */
  private receiptCount(item: Extract<LedgerItem, { kind: 'receipt-count' }>): ItemValue {
    const sku = this.sku(item.skuId);
    const codes = item.pieceCodes ?? [];
    for (const code of codes) {
      if (this.usedCodes.has(code)) refuse('invalid-item', item.lineId, [{ kind: 'piece-code-used', code }]);
      this.usedCodes.add(code);
    }
    const unit = this.unit(item.to.siteId, item.to.businessUnitId);
    const scope = this.scopeAt(item.to.siteId, item.to.businessUnitId, sku.brandId);
    const movement = this.newMovement('receipt-count', item.lineId, item.to.siteId, item.to.businessUnitId, [
      item.skuId,
    ]);
    const origin: OriginState = {
      id: uuidv7(),
      isNew: true,
      skuId: item.skuId,
      pieceTracked: sku.pieceTracked,
      batchCode: item.batch?.code ?? null,
      expiryDate: item.batch?.expiryDate ?? null,
      countDate: this.inputs.businessDate,
      quantity: item.quantity,
      scope,
      stateId: uuidv7(),
      valueKnown: false,
      ptRevisionId: null,
      coveredQuantity: 0,
      lastStateMovementId: movement.id,
      stateChanged: true,
    };
    this.origins.set(origin.id, origin);
    this.entries.origins.push(origin);
    (movement as { owner?: Owner }).owner = item.owner;
    const balance = this.balanceFor(item.to.siteId, item.to.businessUnitId, item.to.locationId, item.condition, origin);
    this.addTo(balance, item.quantity, 0);
    movement.legs.push(this.leg('in', balance, item.quantity, 0));
    for (const code of codes) {
      const piece: PieceState = {
        id: uuidv7(),
        isNew: true,
        code,
        skuId: item.skuId,
        receiptOriginId: origin.id,
        siteId: item.to.siteId,
        storeId: unit.storeId,
        businessUnitId: item.to.businessUnitId,
        legalEntityId: unit.legalEntityId,
        brandId: sku.brandId,
        locationId: item.to.locationId,
        condition: item.condition,
        heldAs: 'custody',
        inCustody: true,
        ptRevisionId: null,
        acceptedSiteId: null,
        lastMovementId: movement.id,
        changed: true,
      };
      this.pieces.set(piece.id, piece);
      this.piecesByCode.set(code, piece);
      movement.pieceIds.push(piece.id);
    }
    return { kind: 'unknown' };
  }

  /**
   * Moves free units between two balance keys at one Site in one movement: an out leg and an in leg per origin.
   * Acceptance moves with the goods, accepted units first (13.4 "Keeps condition and acceptance"; S1-F10-T02).
   */
  private moveUnits(
    movement: MovementEntry,
    taken: readonly { balance: BalanceState; quantity: number; pieces: PieceState[] }[],
    to: { readonly businessUnitId: string; readonly locationId: string; readonly condition: Condition },
  ): void {
    for (const { balance, quantity, pieces } of taken) {
      const origin = this.origins.get(balance.receiptOriginId);
      if (origin === undefined) throw new Error('origin not loaded');
      const target = this.balanceFor(balance.siteId, to.businessUnitId, to.locationId, to.condition, origin);
      const accepted =
        pieces.length > 0
          ? pieces.filter((piece) => piece.acceptedSiteId === balance.siteId).length
          : Math.min(quantity, balance.accepted);
      this.addTo(balance, -quantity, -accepted);
      this.addTo(target, quantity, accepted);
      movement.legs.push(this.leg('out', balance, quantity, accepted), this.leg('in', target, quantity, accepted));
      const unit = this.unit(balance.siteId, to.businessUnitId);
      for (const piece of pieces) {
        piece.businessUnitId = to.businessUnitId;
        piece.storeId = unit.storeId;
        piece.locationId = to.locationId;
        piece.condition = to.condition;
        piece.lastMovementId = movement.id;
        piece.changed = true;
        movement.pieceIds.push(piece.id);
      }
    }
  }

  /**
   * Location move (13.4; PRD-STK-005): inside one Site; between two units only when book, legal entity and tax
   * registration are unchanged (7.1, DEC-066; MM-13). Takes only free units: held goods move only under their own
   * authority, and reserved units stay where their reservation names them (6.2).
   */
  private locationMove(item: Extract<LedgerItem, { kind: 'location-move' }>): ItemValue {
    this.checkGoodsShape(item.lineId, item.goods);
    const from = this.unit(item.from.siteId, item.from.businessUnitId);
    const to = this.unit(item.from.siteId, item.to.businessUnitId);
    if (
      from.bookId !== to.bookId ||
      from.legalEntityId !== to.legalEntityId ||
      from.taxRegistrationId !== to.taxRegistrationId
    ) {
      refuse('route-not-allowed', item.lineId, [{ kind: 'route', route: 'between-books-or-registrations' }]);
    }
    if (item.from.businessUnitId === item.to.businessUnitId && item.from.locationId === item.to.locationId) {
      refuse('invalid-item', item.lineId, [{ kind: 'same-place' }]);
    }
    const taken = this.takeFree(item.lineId, item.from, item.condition, item.goods);
    const movement = this.newMovement('location-move', item.lineId, item.from.siteId, item.from.businessUnitId, [
      item.goods.skuId,
    ]);
    this.moveUnits(movement, taken, { ...item.to, condition: item.condition });
    return { kind: 'unknown' };
  }

  /**
   * Condition change (13.4; PRD-DMG-003, PRD-DMG-010, POL-17.02): never to good, since damaged goods never become good
   * and wrong or unidentified goods do so only through the identity route (`condition-route`). Takes free units; the
   * hold the new condition raises is its own item in the same request (13.5).
   */
  private conditionChange(item: Extract<LedgerItem, { kind: 'condition-change' }>): ItemValue {
    this.checkGoodsShape(item.lineId, item.goods);
    if (item.to === 'good')
      refuse('condition-route', item.lineId, [{ kind: 'condition', from: item.from, to: item.to }]);
    if (item.from === item.to) refuse('invalid-item', item.lineId, [{ kind: 'same-condition' }]);
    const taken = this.takeFree(item.lineId, item.at, item.from, item.goods);
    const movement = this.newMovement('condition-change', item.lineId, item.at.siteId, item.at.businessUnitId, [
      item.goods.skuId,
    ]);
    this.moveUnits(movement, taken, {
      businessUnitId: item.at.businessUnitId,
      locationId: item.at.locationId,
      condition: item.to,
    });
    return { kind: 'unknown' };
  }

  // --- status items (13.5) -------------------------------------------------------------------------------------

  /**
   * Record coverage (13.5; PRD-REC-015, PRD-REC-017, PRD-ACP-002, PRD-INT-005): no unit covered by two approved
   * revisions. One origin is covered by one revision; a split goes through its own origins (section 4).
   */
  private recordCoverage(item: Extract<LedgerItem, { kind: 'record-coverage' }>): ItemValue {
    const origin = this.origin(item.lineId, item.receiptOriginId);
    if (origin.ptRevisionId !== null && origin.ptRevisionId !== item.ptRevisionId) {
      refuse('coverage-overlap', item.lineId, [{ kind: 'coverage', ptRevisionId: origin.ptRevisionId }]);
    }
    const pieces = origin.pieceTracked ? (item.pieceCodes ?? []).map((code) => this.piece(item.lineId, code)) : [];
    const quantity = origin.pieceTracked ? pieces.length : (item.quantity ?? 0);
    if (origin.pieceTracked !== (item.pieceCodes !== undefined) || !Number.isInteger(quantity) || quantity <= 0) {
      refuse('invalid-item', item.lineId, [{ kind: 'quantity' }]);
    }
    for (const piece of pieces) {
      if (piece.receiptOriginId !== origin.id)
        refuse('invalid-item', item.lineId, [{ kind: 'piece', code: piece.code }]);
      if (piece.ptRevisionId !== null) refuse('coverage-overlap', item.lineId, [{ kind: 'piece', code: piece.code }]);
    }
    if (origin.coveredQuantity + quantity > origin.quantity) {
      refuse('coverage-overlap', item.lineId, [{ kind: 'coverage', ptRevisionId: item.ptRevisionId }]);
    }
    origin.ptRevisionId = item.ptRevisionId;
    origin.coveredQuantity += quantity;
    origin.stateChanged = true;
    const cover = (piece: PieceState | null, units: number) =>
      this.entries.coverage.push({
        id: uuidv7(),
        lineId: item.lineId,
        ptRevisionId: item.ptRevisionId,
        receiptOriginId: origin.id,
        pieceTracked: origin.pieceTracked,
        pieceId: piece?.id ?? null,
        quantity: units,
        action: 'cover',
        removesCoverageId: null,
        scope: origin.scope,
      });
    if (origin.pieceTracked) {
      for (const piece of pieces) {
        piece.ptRevisionId = item.ptRevisionId;
        piece.changed = true;
        cover(piece, 1);
      }
    } else {
      cover(null, quantity);
    }
    return { kind: 'unknown' };
  }

  /**
   * Remove coverage (13.5; PRD-REC-019): only while no reservation relies on the units it covers. A reservation of
   * covered units is the dependent quantity the ledger keeps; later dependents add their own checks.
   */
  private removeCoverage(item: Extract<LedgerItem, { kind: 'remove-coverage' }>): ItemValue {
    const record = this.coverage.get(item.coverageId);
    if (record?.action !== 'cover')
      refuse('invalid-item', item.lineId, [{ kind: 'coverage', coverageId: item.coverageId }]);
    if (record.removed) refuse('exceeds-source', item.lineId, [{ kind: 'coverage', coverageId: record.id }]);
    const origin = this.origin(item.lineId, record.receiptOriginId);
    if (record.pieceId !== null) {
      const piece = this.pieces.get(record.pieceId);
      if (piece === undefined) throw new Error('piece not loaded');
      if (this.pieceClaims(piece).some((claim) => claim.owner === 'reservation')) {
        refuse('exceeds-source', item.lineId, [{ kind: 'piece', code: piece.code }]);
      }
      piece.ptRevisionId = null;
      piece.changed = true;
    } else {
      const reserved = this.activeClaims(
        (claim) =>
          claim.owner === 'reservation' &&
          claim.balanceId !== null &&
          this.balances.get(claim.balanceId)?.receiptOriginId === origin.id,
      ).reduce((sum, claim) => sum + claim.quantity, 0);
      if (origin.coveredQuantity - record.quantity < reserved) {
        refuse('exceeds-source', item.lineId, [{ kind: 'coverage', coverageId: record.id }]);
      }
    }
    origin.coveredQuantity -= record.quantity;
    if (origin.coveredQuantity === 0) origin.ptRevisionId = null;
    origin.stateChanged = true;
    this.coverage.set(record.id, { ...record, removed: true });
    this.entries.coverage.push({
      id: uuidv7(),
      lineId: item.lineId,
      ptRevisionId: record.ptRevisionId,
      receiptOriginId: origin.id,
      pieceTracked: origin.pieceTracked,
      pieceId: record.pieceId,
      quantity: record.quantity,
      action: 'remove',
      removesCoverageId: record.id,
      scope: record.scope,
    });
    return { kind: 'unknown' };
  }

  /**
   * Record acceptance (13.5; PRD-REC-021, PRD-REC-022, PRD-STK-003): barcode verified and physically accepted at the
   * Site, of units in custody there and not yet accepted: a piece elsewhere is `piece-not-at-place`; more units than
   * are unaccepted there is `exceeds-source`.
   */
  private recordAcceptance(item: Extract<LedgerItem, { kind: 'record-acceptance' }>): ItemValue {
    this.checkGoodsShape(item.lineId, item.goods);
    const sku = this.sku(item.goods.skuId);
    if (sku.pieceTracked) {
      for (const code of item.goods.pieceCodes ?? []) {
        const piece = this.piece(item.lineId, code);
        if (
          !piece.inCustody ||
          piece.siteId !== item.at.siteId ||
          piece.businessUnitId !== item.at.businessUnitId ||
          piece.locationId !== item.at.locationId
        ) {
          refuse('piece-not-at-place', item.lineId, [{ kind: 'piece', code }]);
        }
        if (piece.acceptedSiteId === item.at.siteId) refuse('exceeds-source', item.lineId, [{ kind: 'piece', code }]);
        piece.acceptedSiteId = item.at.siteId;
        piece.changed = true;
        const balance = this.balanceFor(
          item.at.siteId,
          item.at.businessUnitId,
          item.at.locationId,
          piece.condition,
          this.origin(item.lineId, piece.receiptOriginId),
        );
        balance.accepted += 1;
        balance.changed = true;
        this.acceptance(item.lineId, balance, piece, 1);
      }
      return { kind: 'unknown' };
    }
    let left = item.goods.quantity;
    const candidates = [...this.balances.values()]
      .filter(
        (row) =>
          row.siteId === item.at.siteId &&
          row.businessUnitId === item.at.businessUnitId &&
          row.locationId === item.at.locationId &&
          row.skuId === item.goods.skuId &&
          (item.goods.receiptOriginId === undefined || row.receiptOriginId === item.goods.receiptOriginId),
      )
      .sort((a, b) => a.countDate.localeCompare(b.countDate) || a.id.localeCompare(b.id));
    for (const balance of candidates) {
      const take = Math.min(left, balance.quantity - balance.accepted);
      if (take <= 0) continue;
      balance.accepted += take;
      balance.changed = true;
      this.acceptance(item.lineId, balance, null, take);
      left -= take;
      if (left === 0) break;
    }
    if (left > 0) refuse('exceeds-source', item.lineId, [{ kind: 'unaccepted-units' }]);
    return { kind: 'unknown' };
  }

  private acceptance(lineId: string, balance: BalanceState, piece: PieceState | null, quantity: number): void {
    this.entries.acceptances.push({
      id: uuidv7(),
      lineId,
      locationId: balance.locationId,
      condition: balance.condition,
      receiptOriginId: balance.receiptOriginId,
      pieceId: piece?.id ?? null,
      quantity,
      scope: balance.scope,
    });
  }

  /**
   * Place hold (13.5; 6.1, 6.2; PRD-DMG-001, PRD-REC-006, PRD-TRF-007): on units in custody at the place, whether free,
   * reserved or already held, since holds coexist; units not there are `not-in-custody`. A quantity claims balances
   * oldest first, each hold its own units (6.2).
   */
  private placeHold(item: Extract<LedgerItem, { kind: 'place-hold' }>): ItemValue {
    if (item.reason.trim() === '' || item.goods.length === 0) refuse('invalid-item', item.lineId, [{ kind: 'hold' }]);
    if (item.withinReservationId !== undefined) {
      const inside = this.claims.some(
        (claim) => claim.owner === 'reservation' && claim.headerId === item.withinReservationId,
      );
      if (!inside)
        refuse('invalid-item', item.lineId, [{ kind: 'reservation', reservationId: item.withinReservationId }]);
    }
    const scope = this.headerScopeAt(item.at.siteId, item.at.businessUnitId);
    const hold: HoldEntry = {
      id: uuidv7(),
      lineId: item.lineId,
      kind: item.holdKind,
      reason: item.reason,
      evidenceFileId: item.evidenceFileId ?? null,
      withinReservationId: item.withinReservationId ?? null,
      scope,
      brandIds: [...new Set(item.goods.map((goods) => this.brandOf(goods.skuId)))],
      freezeScope: [],
      claims: [],
    };
    for (const goods of item.goods) {
      this.checkGoodsShape(item.lineId, goods);
      if (this.sku(goods.skuId).pieceTracked) {
        for (const code of goods.pieceCodes ?? []) {
          const piece = this.piece(item.lineId, code);
          if (
            !piece.inCustody ||
            piece.siteId !== item.at.siteId ||
            piece.businessUnitId !== item.at.businessUnitId ||
            piece.locationId !== item.at.locationId ||
            piece.condition !== item.condition
          ) {
            refuse('not-in-custody', item.lineId, [{ kind: 'piece', code }]);
          }
          hold.claims.push(
            this.newClaim(
              'hold',
              hold.id,
              item.holdKind,
              hold.withinReservationId,
              null,
              piece.id,
              1,
              this.scopeOfPiece(piece),
            ),
          );
        }
        continue;
      }
      let left = goods.quantity;
      for (const balance of this.balancesAt(item.at, item.condition, goods)) {
        const take = Math.min(left, balance.quantity);
        if (take <= 0) continue;
        hold.claims.push(
          this.newClaim(
            'hold',
            hold.id,
            item.holdKind,
            hold.withinReservationId,
            balance.id,
            null,
            take,
            balance.scope,
          ),
        );
        left -= take;
        if (left === 0) break;
      }
      if (left > 0) refuse('not-in-custody', item.lineId, [{ kind: 'quantity', skuId: goods.skuId }]);
    }
    this.entries.holds.push(hold);
    return { kind: 'unknown' };
  }

  private scopeOfPiece(piece: PieceState): Scope {
    return {
      siteId: piece.siteId,
      storeId: piece.storeId,
      businessUnitId: piece.businessUnitId,
      legalEntityId: piece.legalEntityId,
      brandId: piece.brandId,
    };
  }

  private newClaim(
    owner: 'hold' | 'reservation',
    headerId: string,
    headerKind: string,
    withinReservationId: string | null,
    balanceId: string | null,
    pieceId: string | null,
    quantity: number,
    scope: Scope,
  ): ClaimState {
    const claim: ClaimState = {
      id: uuidv7(),
      isNew: true,
      owner,
      headerId,
      headerKind,
      withinReservationId,
      balanceId,
      pieceId,
      claimed: quantity,
      scope,
      quantity,
      changed: false,
    };
    this.claims.push(claim);
    return claim;
  }

  private header(lineId: string, id: string, owner: 'hold' | 'reservation'): HeaderState {
    const header = this.headers.get(id);
    if (header?.owner !== owner) refuse('invalid-item', lineId, [{ kind: owner, id }]);
    return header;
  }

  /**
   * Release hold (13.5; 6.2; PRD-DMG-003, PRD-REC-013, POL-08.05): by the release event of its own kind, ending every
   * claim it still holds; it releases no other hold (`wrong-release-event`). A count freeze ends by its own item.
   */
  private releaseHold(item: Extract<LedgerItem, { kind: 'release-hold' }>): ItemValue {
    const hold = this.header(item.lineId, item.holdId, 'hold');
    if (hold.kind === 'count-freeze') refuse('invalid-item', item.lineId, [{ kind: 'count-freeze', holdId: hold.id }]);
    if (!(RELEASE_EVENTS[hold.kind] ?? []).includes(item.event)) {
      refuse('wrong-release-event', item.lineId, [{ kind: 'hold', holdKind: hold.kind, event: item.event }]);
    }
    const claims = this.activeClaims((claim) => claim.owner === 'hold' && claim.headerId === hold.id);
    if (claims.length === 0) refuse('exceeds-source', item.lineId, [{ kind: 'hold', holdId: hold.id }]);
    for (const claim of claims) {
      this.entries.holdReleases.push({
        id: uuidv7(),
        lineId: item.lineId,
        holdId: hold.id,
        holdKind: hold.kind,
        claimId: claim.id,
        event: item.event,
        quantity: claim.quantity,
        pieceId: claim.pieceId,
        scope: claim.scope,
      });
      claim.quantity = 0;
      claim.changed = true;
    }
    return { kind: 'none' };
  }

  /**
   * Start count freeze (13.5; 8.1; PRD-STK-008, PRD-STK-009, DEC-019): over locations, brands or SKUs at one Site and
   * unit, under the unit's anchor held exclusively. Its expected quantities are the balances in its scope now. Refuses
   * `reserved` while offline protected quantity is in the scope (8.1); another freeze over the same units is found by
   * the command's freeze check, as for any item (`count-freeze-active`).
   */
  private startFreeze(item: Extract<LedgerItem, { kind: 'start-count-freeze' }>): ItemValue {
    if (item.reason.trim() === '' || item.scope.length === 0) refuse('invalid-item', item.lineId, [{ kind: 'scope' }]);
    const inScope = this.freezeBalances(item.siteId, item.businessUnitId, item.scope);
    const protectedQuantity = this.activeClaims(
      (claim) =>
        claim.owner === 'reservation' &&
        claim.headerKind === 'offline-protected' &&
        ((claim.balanceId !== null && inScope.some((row) => row.id === claim.balanceId)) ||
          (claim.pieceId !== null &&
            inScope.some((row) => row.receiptOriginId === this.pieces.get(claim.pieceId ?? '')?.receiptOriginId))),
    );
    if (protectedQuantity.length > 0)
      refuse('reserved', item.lineId, [{ kind: 'reservation', reservationKind: 'offline-protected' }]);
    const scope = this.headerScopeAt(item.siteId, item.businessUnitId);
    const brands = new Set<string | null>(inScope.map((row) => row.scope.brandId));
    for (const member of item.scope) {
      if ('brandId' in member) brands.add(member.brandId);
      if ('skuId' in member) brands.add(this.brandOf(member.skuId));
    }
    const hold: HoldEntry = {
      id: uuidv7(),
      lineId: item.lineId,
      kind: 'count-freeze',
      reason: item.reason,
      evidenceFileId: null,
      withinReservationId: null,
      scope,
      brandIds: [...brands],
      freezeScope: [...item.scope],
      claims: [],
    };
    this.entries.holds.push(hold);
    for (const row of inScope) {
      if (row.quantity === 0) continue;
      this.expected.push({
        holdId: hold.id,
        balanceId: row.id,
        receiptOriginId: row.receiptOriginId,
        skuId: row.skuId,
        locationId: row.locationId,
        condition: row.condition,
        quantity: row.quantity,
      });
    }
    return { kind: 'none' };
  }

  /** The balances at a unit a freeze's scope covers (8.1). */
  freezeBalances(siteId: string, businessUnitId: string, scope: readonly FreezeScope[]): BalanceState[] {
    return [...this.balances.values()].filter(
      (row) =>
        row.siteId === siteId &&
        row.businessUnitId === businessUnitId &&
        scope.some(
          (member) =>
            ('locationId' in member && member.locationId === row.locationId) ||
            ('skuId' in member && member.skuId === row.skuId) ||
            ('brandId' in member && member.brandId === row.scope.brandId),
        ),
    );
  }

  /** End count freeze (13.5): the count's closure, `count-closed`, once; under the anchor held exclusively. */
  private endFreeze(item: Extract<LedgerItem, { kind: 'end-count-freeze' }>): ItemValue {
    const hold = this.header(item.lineId, item.holdId, 'hold');
    if (hold.kind !== 'count-freeze')
      refuse('wrong-release-event', item.lineId, [{ kind: 'hold', holdKind: hold.kind, event: 'count-closed' }]);
    if (hold.ended) refuse('exceeds-source', item.lineId, [{ kind: 'count-freeze', holdId: hold.id }]);
    this.entries.holdReleases.push({
      id: uuidv7(),
      lineId: item.lineId,
      holdId: hold.id,
      holdKind: hold.kind,
      claimId: null,
      event: 'count-closed',
      quantity: null,
      pieceId: null,
      scope: { ...hold.scope, brandId: null },
    });
    this.headers.set(hold.id, { ...hold, ended: true });
    return { kind: 'none' };
  }

  /**
   * Reserve (13.5; 6.2; PRD-TRF-006 to PRD-TRF-009, PRD-OFF-006, PRD-INT-005): goods in good condition, in custody,
   * covered and accepted at the Site and not held; reservations never overlap. For quantity-tracked goods an origin's
   * covered quantity is counted against each of its balances, which is exact while an origin is wholly covered or at
   * one place, and never reserves an uncovered unit (S1-F10-T02). Held-goods reservations reserve held goods under
   * their own authority and arrive with the routes that make them (stage 2 and 3).
   */
  private reserve(item: Extract<LedgerItem, { kind: 'reserve' }>): ItemValue {
    if (item.goods.length === 0) refuse('invalid-item', item.lineId, [{ kind: 'goods' }]);
    if (item.reservationKind === 'held-goods')
      refuse('invalid-item', item.lineId, [{ kind: 'reservation-kind', reservationKind: item.reservationKind }]);
    const scope = this.headerScopeAt(item.at.siteId, item.at.businessUnitId);
    const reservation: ReservationEntry = {
      id: uuidv7(),
      lineId: item.lineId,
      kind: item.reservationKind,
      scope,
      brandIds: [...new Set(item.goods.map((goods) => this.brandOf(goods.skuId)))],
      claims: [],
    };
    for (const goods of item.goods) {
      this.checkGoodsShape(item.lineId, goods);
      if (this.sku(goods.skuId).pieceTracked) {
        for (const code of goods.pieceCodes ?? []) {
          const piece = this.piece(item.lineId, code);
          if (piece.ptRevisionId === null) refuse('not-covered', item.lineId, [{ kind: 'piece', code }]);
          if (piece.acceptedSiteId !== item.at.siteId) refuse('not-accepted', item.lineId, [{ kind: 'piece', code }]);
        }
        for (const taken of this.takeFree(item.lineId, item.at, 'good', goods, { reservation: true })) {
          for (const piece of taken.pieces) {
            reservation.claims.push(
              this.newClaim(
                'reservation',
                reservation.id,
                item.reservationKind,
                null,
                null,
                piece.id,
                1,
                this.scopeOfPiece(piece),
              ),
            );
          }
        }
        continue;
      }
      const candidates = this.balancesAt(item.at, 'good', goods);
      const covered = candidates.reduce((sum, row) => sum + this.coveredFree(row), 0);
      const accepted = candidates.reduce((sum, row) => sum + this.acceptedFree(row), 0);
      const free = candidates.reduce((sum, row) => sum + this.freeOn(row), 0);
      if (goods.quantity <= free && goods.quantity > covered)
        refuse('not-covered', item.lineId, [{ kind: 'quantity', skuId: goods.skuId }]);
      if (goods.quantity <= free && goods.quantity > accepted)
        refuse('not-accepted', item.lineId, [{ kind: 'quantity', skuId: goods.skuId }]);
      const taken = this.takeFree(item.lineId, item.at, 'good', goods, {
        reservation: true,
        fits: (row, rowFree) => Math.min(rowFree, this.coveredFree(row), this.acceptedFree(row)),
      });
      for (const each of taken) {
        reservation.claims.push(
          this.newClaim(
            'reservation',
            reservation.id,
            item.reservationKind,
            null,
            each.balance.id,
            null,
            each.quantity,
            each.balance.scope,
          ),
        );
      }
    }
    this.entries.reservations.push(reservation);
    return { kind: 'unknown' };
  }

  /** Units of a balance that are covered and not reserved or held (6.2, 6.3), bounded by the origin's coverage. */
  private coveredFree(balance: BalanceState): number {
    const origin = this.origins.get(balance.receiptOriginId);
    const { reserved, held } = this.claimedOn(balance);
    return Math.max(0, Math.min(balance.quantity, origin?.coveredQuantity ?? 0) - reserved - held);
  }

  /** Units of a balance that are accepted and not reserved or held (6.3). */
  private acceptedFree(balance: BalanceState): number {
    const { reserved, held } = this.claimedOn(balance);
    return Math.max(0, balance.accepted - reserved - held);
  }

  /**
   * End reservation (13.5; PRD-TRF-022, PRD-OFR-016, PRD-OFF-011): by its own event, never by time, ending every claim
   * it still holds. Consumption is made by the movement that consumes it (dispatch, departure, an offline sale), which
   * arrives with those movements.
   */
  private endReservation(item: Extract<LedgerItem, { kind: 'end-reservation' }>): ItemValue {
    const reservation = this.header(item.lineId, item.reservationId, 'reservation');
    if (!(RESERVATION_EVENTS[reservation.kind] ?? []).includes(item.event)) {
      refuse('wrong-release-event', item.lineId, [
        { kind: 'reservation', reservationKind: reservation.kind, event: item.event },
      ]);
    }
    const claims = this.activeClaims((claim) => claim.owner === 'reservation' && claim.headerId === reservation.id);
    if (claims.length === 0)
      refuse('exceeds-source', item.lineId, [{ kind: 'reservation', reservationId: reservation.id }]);
    for (const claim of claims) {
      this.entries.reservationEvents.push({
        id: uuidv7(),
        lineId: item.lineId,
        reservationId: reservation.id,
        reservationKind: reservation.kind,
        claimId: claim.id,
        event: item.event,
        quantity: claim.quantity,
        pieceId: claim.pieceId,
        scope: claim.scope,
      });
      claim.quantity = 0;
      claim.changed = true;
    }
    return { kind: 'none' };
  }
}

export { key as workingKey };
