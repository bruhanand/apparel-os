import type { CommandRefusal, MissingItem } from '../../../../kernel/index.js';

// The ledger request of stock-ledger 13.1 and 13.3 and the unvalued items of 13.4 and 13.5 (S1-F10-T02). Pure types:
// no database, no clock (code-house-rules 2). The valued items arrive with S1-F10-T03.

export type Condition = 'good' | 'damaged' | 'wrong' | 'unidentified';

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

/** The owner a receipt count records on its origin (PRD-ORG-014, PRD-ORG-019), or Unknown. */
export type Owner =
  | { readonly kind: 'organisation'; readonly legalEntityId: string; readonly agreementVersionId?: string }
  | { readonly kind: 'supplier'; readonly partyId: string; readonly agreementVersionId: string }
  | { readonly kind: 'brand'; readonly brandId: string; readonly agreementVersionId: string }
  | { readonly kind: 'unknown' };

/** The hold kinds a Place hold item may raise (6.1); a count freeze has items of its own (13.5). */
export type PlacedHoldKind =
  'damage' | 'quarantine' | 'excess' | 'source-conflict' | 'expiry' | 'ordinary' | 'inspection' | 'write-off';

export type ReservationKind = 'transfer' | 'supplier-return' | 'held-goods' | 'offline-protected';

/** One item of a request (13.4, 13.5). `lineId` is the source line, kept without a foreign key (PRD-ACS-007). */
export type LedgerItem =
  | {
      readonly kind: 'receipt-count';
      readonly lineId: string;
      readonly skuId: string;
      readonly quantity: number;
      readonly to: Place;
      readonly condition: Condition;
      readonly owner: Owner;
      readonly pieceCodes?: readonly string[];
      readonly batch?: { readonly code: string; readonly expiryDate: string };
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
      readonly goods: Goods;
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
  | { readonly kind: 'record-acceptance'; readonly lineId: string; readonly at: Place; readonly goods: Goods }
  | {
      readonly kind: 'place-hold';
      readonly lineId: string;
      readonly holdKind: PlacedHoldKind;
      readonly reason: string;
      readonly evidenceFileId?: string;
      readonly withinReservationId?: string;
      readonly at: Place;
      readonly condition: Condition;
      readonly goods: readonly Goods[];
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
    };

export type LedgerItemKind = LedgerItem['kind'];

/** One member of a count freeze's scope at one Site and business unit (8.1, 13.5): a location, a brand or a SKU. */
export type FreezeScope = { readonly locationId: string } | { readonly brandId: string } | { readonly skuId: string };

/** Every item kind this ledger takes so far (13.4, 13.5). */
export const ITEM_KINDS: readonly LedgerItemKind[] = [
  'receipt-count',
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
  readonly items: readonly LedgerItem[];
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
  | 'rule-not-set';

const KIND_OF: Partial<Record<StockReason, CommandRefusal['kind']>> = {
  'business-date-not-set': 'unavailable',
  'plan-stale': 'conflict',
  'rule-not-set': 'unavailable',
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
export type ItemValue = { readonly kind: 'none' } | { readonly kind: 'unknown' };
