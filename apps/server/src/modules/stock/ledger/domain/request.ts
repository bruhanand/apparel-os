import type { Paise } from '@apparel-os/domain';
import type { HoldKind, StockCondition } from '@apparel-os/schemas';
import type { CommandRefusal, MissingItem } from '../../../../kernel/index.js';

// The ledger request of stock-ledger 13.1 and 13.3 and the unvalued items of 13.4 and 13.5 (S1-F10-T02). Pure types:
// no database, no clock (code-house-rules 2). The valued items of 13.4 (S1-F10-T03) follow them.

/** A condition of stock (2.2, 14.1), one list with the shared schemas' (`stockConditionSchema`). */
export type Condition = StockCondition;

/**
 * The import kind a source carries (imports-and-opening-data 4.1; stock-ledger 13.2): none, one of the kinds that may
 * post, or historical reference, which never does (PRD-LIF-014, PRD-IMP-010).
 */
export type ImportKind = 'none' | 'create' | 'update' | 'opening-balance' | 'transaction' | 'historical-reference';

/** The source of 13.2: owning module, record type, record and version (books-and-posting 5.1). */
export interface LedgerSource {
  readonly module: string;
  readonly recordType: string;
  readonly recordId: string;
  readonly versionId: string;
  readonly importKind: ImportKind;
}

/**
 * The record type a source's journals carry (books-and-posting 5.1, 4.3): the record type as the permission registry
 * names it, `<module>.<record type>`, as a reopening names a correction and every other caller of Post passes it. A
 * movement keeps its module and record type apart (14.2). S1-F10-T06: found by P5, where a reopening could not name a
 * stock posting's source.
 */
export function postedRecordType(source: Pick<LedgerSource, 'module' | 'recordType'>): string {
  return `${source.module}.${source.recordType}`;
}

/** Who acts (13.3; PRD-ACS-013, PRD-SEC-018): a user, or a service identity and the person it acts for. */
export type LedgerActor =
  | { readonly kind: 'user'; readonly userId: string; readonly roleAssignmentId: string }
  | {
      readonly kind: 'service-identity';
      readonly serviceIdentityId: string;
      readonly onBehalfOfUserId?: string;
      readonly roleAssignmentId: string;
    };

/** A place inside one Site: the Site, the business unit and the internal location (13.3; PRD-ORG-012). */
export interface Place {
  readonly siteId: string;
  readonly businessUnitId: string;
  readonly locationId: string;
}

/**
 * Goods an item names (13.3 "Origins and pieces"): pieces by their codes for piece-tracked goods (PRD-MER-016), or a
 * quantity of a SKU, from a named receipt origin or else the oldest first (PRD-STK-013).
 */
export interface Goods {
  readonly skuId: string;
  readonly quantity: number;
  readonly receiptOriginId?: string;
  readonly pieceCodes?: readonly string[];
}

/**
 * Goods of a product not yet set up, named by their receipt origin (stock-ledger 13.15; goods-in 8.2; PRD-DMG-005;
 * S2-F08-T01): no SKU names them before the identity step, so a hold, the damaged condition and the reversal of a
 * condition change name the origin they were counted under. They are counted by quantity, in pieces (DEC-137), so they
 * carry no piece codes.
 */
export interface OriginGoods {
  readonly skuId: null;
  readonly receiptOriginId: string;
  readonly quantity: number;
  readonly pieceCodes?: undefined;
}

/** Goods a hold, a condition change or its reversal names: of a SKU, or of Unknown SKU by their origin (13.15). */
export type NamedGoods = Goods | OriginGoods;

/** The owner a receipt count records on its origin (PRD-ORG-014, PRD-ORG-019), or Unknown. */
export type Owner =
  | { readonly kind: 'organisation'; readonly legalEntityId: string; readonly agreementVersionId?: string }
  | { readonly kind: 'supplier'; readonly partyId: string; readonly agreementVersionId: string }
  | { readonly kind: 'brand'; readonly brandId: string; readonly agreementVersionId: string }
  | { readonly kind: 'unknown' };

/**
 * The hold kinds a Place hold item may raise (6.1), one list with the shared schemas' (`holdKindSchema`); a count freeze
 * has items of its own (13.5).
 */
export type PlacedHoldKind = HoldKind;

export type ReservationKind = 'transfer' | 'supplier-return' | 'held-goods' | 'offline-protected';

/**
 * The identity of goods of a product not yet set up, as the count describes it (stock-ledger 13.14; goods-in 4.3, 4.5;
 * GI-1): the style code as the invoice writes it, the colour as the invoice names it (DEC-138) and the size from the
 * Organisation's size list. A colour or size the invoice does not state is null, Unknown, never a default
 * (PRD-MER-005, PRD-MOD-015).
 */
export interface DescribedIdentity {
  readonly styleCode: string;
  readonly colour: string | null;
  readonly size: string | null;
}

/**
 * One part of an identity step (stock-ledger 13.14; goods-in 6.3 step 4): units of one receipt origin that take one SKU.
 * A part that names a new origin moves its units into it, a new receipt origin of the kind identity-resolved with the
 * named one as its parent and the SKU given, in good condition; a part that names none keeps its origin and the SKU
 * the origin already names, and returns any of its units held wrong or unidentified to good (POL-17.02).
 */
export interface IdentityPart {
  readonly receiptOriginId: string;
  readonly skuId: string;
  readonly quantity: number;
  /** The new origin's identifier, a UUIDv7 the caller makes (PRD-MOD-008), so later items can name it. */
  readonly newReceiptOriginId?: string;
}

/**
 * What a receipt count counts (stock-ledger 13.14, 13.16): goods of a SKU, with no identity as described, whose brand is
 * the SKU's; goods of a product not yet set up, their SKU null, Unknown, with their identity as described and the brand
 * they are counted under, counted in good condition and not quarantined (stock-ledger 2.2, 14.1; PRD-DMG-005; GI-1,
 * RR-555); or unidentified goods, their SKU and identity both Unknown, `described` null, under the brand they are
 * counted under, in the unidentified condition, which their quarantine in the same request holds (goods-in 4.4;
 * PRD-REC-012, POL-17.02; S2-F02-T03). Receiving names its Arrival's brand, so a person scoped to that brand sees the
 * goods before PT approval names their SKU.
 */
export type CountedGoods =
  | { readonly skuId: string; readonly described?: undefined; readonly brandId?: undefined }
  | { readonly skuId: null; readonly described: DescribedIdentity | null; readonly brandId: string };

/**
 * Whether the goods a receipt count names give their brand wrongly (13.14, 14.1; RR-555): goods of Unknown SKU name the
 * brand they are counted under, never none; a SKU's goods are of the SKU's brand and name none. The item's type holds
 * it (`CountedGoods`); Plan, before it locks their SKU balance, and the Recheck still check every request they are given.
 */
export function countedBrandRefused(goods: {
  readonly skuId: string | null;
  readonly brandId?: string | undefined;
}): boolean {
  if (goods.skuId !== null) return goods.brandId !== undefined;
  return typeof goods.brandId !== 'string' || goods.brandId.trim() === '';
}

/** One item of a request (13.4, 13.5). `lineId` is the source line, kept without a foreign key (PRD-ACS-007). */
export type LedgerItem =
  | ({
      readonly kind: 'receipt-count';
      readonly lineId: string;
      /**
       * The identifier of the receipt origin the count makes, a UUIDv7 the caller makes (PRD-MOD-008), so later items
       * of the same request can name its goods, as a GRN's holds do (stock-ledger 13.16; goods-in 4.5); the ledger
       * makes one when it is left out.
       */
      readonly receiptOriginId?: string;
      readonly quantity: number;
      readonly to: Place;
      readonly condition: Condition;
      readonly owner: Owner;
      readonly pieceCodes?: readonly string[];
      readonly batch?: { readonly code: string; readonly expiryDate: string };
    } & CountedGoods)
  | {
      /**
       * Identity resolved (stock-ledger 2.3, 13.4, 13.14; goods-in 6.3 step 4; PRD-DMG-005, POL-17.02; GI-1): the free
       * units of the origins named, at one Site and business unit, take the SKUs of the parts, by quantity, under the
       * approved identity route the request's approval carries. Every free unit of a named origin there takes exactly
       * one part.
       */
      readonly kind: 'identity-resolved';
      readonly lineId: string;
      readonly at: UnitPlace;
      readonly parts: readonly IdentityPart[];
    }
  | {
      /**
       * Opening count (stock-ledger 9, 13.4; S1-F13-T03): a receipt count from an opening batch, its source's import
       * kind opening balance; it creates opening receipt origins, whose value stays Unknown until an opening PT is
       * approved (PRD-LIF-004, PRD-LIF-027, POL-14.02). A counted row without the valuation evidence PRD-LIF-005 needs
       * is not opening stock: a surplus origin, held as excess, its owner, coverage and cost Unknown (9 step 3;
       * PRD-STK-014).
       */
      readonly kind: 'opening-count';
      readonly lineId: string;
      readonly skuId: string;
      readonly quantity: number;
      readonly to: Place;
      readonly condition: Condition;
      readonly owner: Owner;
      readonly pieceCodes?: readonly string[];
      readonly batch?: { readonly code: string; readonly expiryDate: string };
      readonly withoutValuationEvidence?: { readonly reason: string };
    }
  | {
      readonly kind: 'location-move';
      readonly lineId: string;
      readonly from: Place;
      readonly to: { readonly businessUnitId: string; readonly locationId: string };
      readonly condition: Condition;
      readonly goods: Goods;
    }
  | {
      readonly kind: 'condition-change';
      readonly lineId: string;
      readonly at: Place;
      readonly from: Condition;
      readonly to: Condition;
      readonly goods: NamedGoods;
    }
  | {
      readonly kind: 'record-coverage';
      readonly lineId: string;
      readonly ptRevisionId: string;
      readonly receiptOriginId: string;
      readonly quantity?: number;
      readonly pieceCodes?: readonly string[];
    }
  | { readonly kind: 'remove-coverage'; readonly lineId: string; readonly coverageId: string }
  | {
      /**
       * Record acceptance (13.5; PRD-REC-021, PRD-REC-022): the barcode verified and the units physically accepted at
       * the place. With a condition, only units in it are accepted, as the scan-in accepts good pieces only, never
       * damaged ones (13.20; goods-in 7.2; PRD-DMG-010); with none, any condition at the place, as before.
       */
      readonly kind: 'record-acceptance';
      readonly lineId: string;
      readonly at: Place;
      readonly goods: Goods;
      readonly condition?: Condition;
    }
  | {
      readonly kind: 'place-hold';
      readonly lineId: string;
      readonly holdKind: PlacedHoldKind;
      readonly reason: string;
      readonly evidenceFileId?: string;
      readonly withinReservationId?: string;
      readonly at: Place;
      readonly condition: Condition;
      readonly goods: readonly NamedGoods[];
    }
  | { readonly kind: 'release-hold'; readonly lineId: string; readonly holdId: string; readonly event: string }
  | {
      readonly kind: 'start-count-freeze';
      readonly lineId: string;
      readonly siteId: string;
      readonly businessUnitId: string;
      readonly reason: string;
      readonly scope: readonly FreezeScope[];
    }
  | { readonly kind: 'end-count-freeze'; readonly lineId: string; readonly holdId: string }
  | {
      readonly kind: 'reserve';
      readonly lineId: string;
      readonly reservationKind: ReservationKind;
      readonly at: Place;
      readonly goods: readonly Goods[];
    }
  | {
      readonly kind: 'end-reservation';
      readonly lineId: string;
      readonly reservationId: string;
      readonly event: string;
    }
  | ValuedItem;

/** A Site and business unit, without a location: a transit's source, or a dispatch's destination (13.3). */
export interface UnitPlace {
  readonly siteId: string;
  readonly businessUnitId: string;
}

/**
 * The valued movement items of 13.4 (S1-F10-T03). Amounts are integer paise (PRD-MOD-014). A dispatch and a
 * supplier-return shipment are named by the caller's identifier, the transit reference their units travel under (14.2).
 */
export type ValuedItem =
  | {
      /** PT approval gives the origin its cost: the covering revision's P RATE, per unit (7.6; PRD-PTW-010). */
      readonly kind: 'cost-established';
      readonly lineId: string;
      readonly receiptOriginId: string;
      readonly ptRevisionId: string;
      readonly pRatePaise: Paise;
    }
  | {
      /**
       * A later approved change of the origin's cost, the signed total over the units its cost established put into
       * pools, shared equally among them (7.7; PRD-LED-016).
       */
      readonly kind: 'cost-adjustment';
      readonly lineId: string;
      readonly receiptOriginId: string;
      readonly amountPaise: Paise;
    }
  | {
      /** Custody leaves the source into transit on the dispatch; consumes the reservation (7.8; PRD-TRF-011). */
      readonly kind: 'dispatch';
      readonly lineId: string;
      readonly dispatchId: string;
      readonly reservationId: string;
      readonly from: Place;
      readonly to: UnitPlace;
      readonly goods: Goods;
    }
  | {
      /** The counted good units of a dispatch arrive at the destination (7.8; PRD-TRF-016, PRD-TRF-018). */
      readonly kind: 'arrival-count';
      readonly lineId: string;
      readonly dispatchId: string;
      readonly from: UnitPlace;
      readonly to: Place;
      readonly goods: Goods;
    }
  | {
      /** Custody leaves at customer handover (6.3; PRD-STK-003, PRD-POS-018). */
      readonly kind: 'sale-issue';
      readonly lineId: string;
      readonly at: Place;
      readonly handover: 'now' | 'billed-retained';
      readonly goods: Goods;
      /**
       * For units supplier- or brand-owned until their sale: the cost per unit the agreement gives at the sale, at
       * which they pass through (7.2; `PRD-ORG-015`, `POL-01.13`; a working assumption, SL-4). Without it such a sale
       * is `rule-not-set` (S1-F10-T06).
       */
      readonly agreedCostPaise?: Paise;
    }
  | {
      /** Custody back after physical acceptance, at the cost its sale issued (7.5; PRD-RET-013, PRD-LED-017). */
      readonly kind: 'customer-return';
      readonly lineId: string;
      readonly saleMovementId: string;
      readonly to: Place;
      readonly condition: Condition;
      readonly goods: Goods;
    }
  | {
      /** Custody leaves for the supplier on a return shipment; consumes the reservation (7.8; PRD-OFR-012). */
      readonly kind: 'supplier-return-departure';
      readonly lineId: string;
      readonly shipmentId: string;
      readonly reservationId: string;
      readonly from: Place;
      readonly goods: Goods;
    }
  | {
      /** Custody ends at confirmed handover or supplier receipt (7.8; PRD-TRF-020). */
      readonly kind: 'supplier-handover';
      readonly lineId: string;
      readonly shipmentId: string;
      readonly from: UnitPlace;
      readonly goods: Goods;
    }
  | {
      /** Goods the supplier refuses come back, counted at the place named (7.8; PRD-OFR-014). */
      readonly kind: 'supplier-rejection-return';
      readonly lineId: string;
      readonly shipmentId: string;
      readonly from: UnitPlace;
      readonly to: Place;
      readonly goods: Goods;
    }
  | {
      /**
       * Disposal (13.4; PRD-DMG-012, PRD-DMG-015, PRD-DMG-016): custody ends for goods under the hold named, a
       * quarantine, expiry or write-off hold, whose claim on them the disposal ends (S1-F10-T06).
       */
      readonly kind: 'disposal';
      readonly lineId: string;
      readonly at: Place;
      readonly condition: Condition;
      readonly holdId: string;
      readonly goods: Goods;
    }
  | {
      /**
       * Count difference (13.4, 8.2 to 8.4; PRD-STK-012, PRD-STK-014): an approved difference of the count whose freeze
       * is named. A loss leaves at the formula cost; a gain with no known origin is a new surplus origin held as excess,
       * with new piece codes for piece-tracked goods (S1-F10-T06).
       */
      readonly kind: 'count-difference';
      readonly lineId: string;
      readonly countId: string;
      readonly at: Place;
      readonly condition: Condition;
      readonly difference: 'loss' | 'gain';
      readonly reason: string;
      readonly goods: Goods;
    }
  | {
      /**
       * Reversal (13.4, 7.5; PRD-MOD-011, PRD-ACS-014, PRD-LED-017, PRD-LED-018): undoes units of the movement named,
       * at the place the units are, or come back to. A count loss linked to a surplus names the surplus origin whose
       * units it takes the place of (8.4; S1-F10-T06). A condition change made in error, such as a mistaken damage
       * confirmation, has its units return to the condition they had, under the approval the request carries (13.15;
       * PRD-STK-017; S2-F08-T01); goods of Unknown SKU are named by their origin.
       */
      readonly kind: 'reversal';
      readonly lineId: string;
      readonly movementId: string;
      readonly at: Place;
      readonly goods: NamedGoods;
      readonly replacesOriginId?: string;
    }
  | {
      /**
       * Ownership change (2.3, 13.4, 13.20; PRD-ORG-014, POL-01.05; DEC-141): at the Agreement's ownership event, the
       * units of the origin named pass from the brand or supplier its owner names to the owner given, the Organisation,
       * as the legal entity of the receiving unit. Units of known cost would then enter a pool, for which no posting
       * event kind exists yet: refused `rule-not-set` naming SL-26 until the product owner settles it (S2-F07-T01).
       */
      readonly kind: 'ownership-change';
      readonly lineId: string;
      readonly receiptOriginId: string;
      readonly quantity: number;
      readonly at: Place;
      readonly owner: Owner;
    }
  | {
      /**
       * Piece correction (13.4, 8.4; PRD-STK-015, DEC-035): piece A, found at the place named, was wrongly named by the
       * movement named, and piece B of the same SKU left instead (S1-F10-T06).
       */
      readonly kind: 'piece-correction';
      readonly lineId: string;
      readonly foundPieceCode: string;
      readonly movementId: string;
      readonly missingPieceCode: string;
      readonly at: Place;
      /** The count whose freeze covers the place, when a count found the piece (8.1, 8.4). */
      readonly countId?: string;
    };

export type ValuedItemKind = ValuedItem['kind'];

/** The valued item kinds (13.4; S1-F10-T03). */
export const VALUED_ITEM_KINDS: readonly ValuedItemKind[] = [
  'cost-established',
  'cost-adjustment',
  'dispatch',
  'arrival-count',
  'sale-issue',
  'customer-return',
  'supplier-return-departure',
  'supplier-handover',
  'supplier-rejection-return',
  'disposal',
  'count-difference',
  'reversal',
  'piece-correction',
  'ownership-change',
];

export type LedgerItemKind = LedgerItem['kind'];

/** One member of a count freeze's scope at one Site and business unit (8.1, 13.5): a location, a brand or a SKU. */
export type FreezeScope = { readonly locationId: string } | { readonly brandId: string } | { readonly skuId: string };

/** Every item kind this ledger takes so far (13.4, 13.5). */
export const ITEM_KINDS: readonly LedgerItemKind[] = [
  'receipt-count',
  'identity-resolved',
  'opening-count',
  'location-move',
  'condition-change',
  'record-coverage',
  'remove-coverage',
  'record-acceptance',
  'place-hold',
  'release-hold',
  'start-count-freeze',
  'end-count-freeze',
  'reserve',
  'end-reservation',
  ...VALUED_ITEM_KINDS,
];

/**
 * One ledger request (13.1, 13.3): the stock effects of one business document, or one step of it, from one registered
 * caller, inside that caller's command. All or nothing.
 */
export interface LedgerRequest {
  readonly source: LedgerSource;
  readonly actor: LedgerActor;
  /** The event time; the command's start by default (code-house-rules 9; PRD-MOD-009). */
  readonly occurredAt?: Date;
  /** Where the action needed approval: the decision and the identifier of its use (13.3; DEC-097). */
  readonly approval?: { readonly decisionId: string; readonly useId: string };
  /** The command's idempotency key, for the audit record (code-house-rules 12.4). */
  readonly idempotencyKey?: string;
  /**
   * SKUs the caller's command makes, written in its transaction once every lock is held, which no read of `merchandise`
   * answers before (stock-ledger 13.19; goods-in 6.3 step 2): their facts as the SKU read would give them, at the Site
   * and on the request's business date. Plan takes these for them instead of reading. Their identifiers are UUIDv7s the
   * caller made (PRD-MOD-008), which its own write of the SKUs holds unique.
   */
  readonly madeSkus?: readonly MadeSku[];
  readonly items: readonly LedgerItem[];
}

/** A SKU a request's command makes (13.19): its identifiers and facts, as `merchandise`'s SKU read would answer. */
export interface MadeSku {
  readonly skuId: string;
  readonly versionId: string;
  readonly brandId: string;
  readonly stockUnit: 'piece' | 'pair' | 'pack';
  readonly pieceTracked: boolean;
  readonly batchTracked: boolean;
}

/** The reasons of 13.8, without the `stock.` of their codes. */
export type StockReason =
  | 'caller-not-registered'
  | 'item-not-registered'
  | 'historical-reference-source'
  | 'business-date-not-set'
  | 'invalid-item'
  | 'place-invalid'
  | 'route-not-allowed'
  | 'plan-stale'
  | 'insufficient-available'
  | 'not-in-custody'
  | 'piece-not-at-place'
  | 'count-freeze-active'
  | 'held'
  | 'reserved'
  | 'blocked'
  | 'not-covered'
  | 'not-accepted'
  | 'coverage-overlap'
  | 'reservation-overlap'
  | 'exceeds-source'
  | 'wrong-release-event'
  | 'condition-route'
  | 'rule-not-set'
  | 'no-cost-setting'
  | 'not-sellable'
  | 'posting-refused';

/**
 * The kind of each refusal that is not `refused` (code-house-rules 12.3). `plan-stale` is `refused`: the request is
 * submitted again under a new key (13.1, 13.8), and the one conflict a command decides is a stale version (12.7).
 */
const KIND_OF: Partial<Record<StockReason, CommandRefusal['kind']>> = {
  'business-date-not-set': 'unavailable',
  'rule-not-set': 'unavailable',
  'no-cost-setting': 'unavailable',
};

/** Thrown inside the ledger to stop at the first failing item; the operation answers it as its refusal. */
export class StockRefused extends Error {
  constructor(readonly refusal: CommandRefusal) {
    super(refusal.code);
  }
}

/**
 * A refusal of 13.8 naming the item and what failed (PRD-UXP-003): the item's line first, then the details. A
 * `blocked` refusal names only the line (DEC-117).
 */
export function refusalOf(
  reason: StockReason,
  lineId: string | undefined,
  details: MissingItem[] = [],
): CommandRefusal {
  return {
    kind: KIND_OF[reason] ?? 'refused',
    code: `stock.${reason}`,
    missing: [...(lineId === undefined ? [] : [{ kind: 'line', lineId }]), ...details],
  };
}

export function refuse(reason: StockReason, lineId: string | undefined, details: MissingItem[] = []): never {
  throw new StockRefused(refusalOf(reason, lineId, details));
}

/** The value of an item on its approval basis, or of the request (13.1 "Recheck and value"; PRD-ACS-016). */
export type ItemValue =
  { readonly kind: 'none' } | { readonly kind: 'unknown' } | { readonly kind: 'known'; readonly amountPaise: Paise };
