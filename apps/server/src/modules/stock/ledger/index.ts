// Public interface of stock · ledger (module-map 4.13; stock-ledger 13). Other code imports only from here.
export { BOOK_STOCK_HISTORY, STOCK_CALLERS, STOCK_LEDGER, StockLedgerModule } from './stock-ledger.module.js';
export { BookStockHistory, type BookStockHistoryContract } from './contracts/book-stock-history.js';
export { LocationStock } from './contracts/location-stock.js';
export { LedgerCountSet } from './contracts/count-set.js';
export { SkuStockPresence } from './contracts/stock-presence.js';
export { StockLedger } from './ledger.js';
export { STOCK_POSTING_EVENT_KINDS } from './domain/event-kinds.js';
export type {
  CheckedRequest,
  ExtraTargets,
  LedgerPlan,
  LedgerResult,
  LockedPlan,
  StockLedgerDependencies,
  StockLedgerInterface,
  Written,
} from './ledger.js';
export { splitIdentity } from './domain/identity.js';
export type { IdentityRow, IdentitySource, IdentitySplit } from './domain/identity.js';
export type {
  Condition,
  DescribedIdentity,
  FreezeScope,
  Goods,
  IdentityPart,
  ImportKind,
  ItemValue,
  LedgerActor,
  LedgerItem,
  LedgerItemKind,
  LedgerRequest,
  LedgerSource,
  MadeSku,
  NamedGoods,
  OriginGoods,
  Owner,
  Place,
  PlacedHoldKind,
  ReservationKind,
} from './domain/request.js';
export type { ExpectedQuantity } from './domain/working.js';
export type { LedgerBooks, LedgerPlaces, LedgerSkus, SkuFacts, UnitFacts } from './ports.js';
export { booksNotComposed, catalogueSkus, organisationPlaces } from './ports.js';
export type { CallerRegistration, RegisteredRecordType } from './registry.js';
export { custody, originOfSourceLine, pieceByCode, receiptCountOfLine, sourceOfLine } from './queries/reads.js';
export type { CustodyQuery, CustodyRow, LineSource, SourceLineOrigin } from './queries/reads.js';
export { availability } from './queries/availability.js';
export { ptRevisionGoods } from './queries/pt-goods.js';
export type { PtRevisionGoods } from './queries/pt-goods.js';
export type { AvailabilityRow } from './queries/availability.js';
// The read models of stock search, served through the kernel's read-model gateway (stock-ledger 13.21; goods-in 9.4;
// S2-F11-T01): their declarations, which a reader names, and the served list the composition root hands the gateway.
export {
  STOCK_BALANCE_COSTS,
  STOCK_POSITIONS,
  STOCK_UNIT_POSITIONS,
  stockLedgerReadModels,
} from './queries/positions.js';
export type { Position, PositionFilters, PositionKey, UnitPosition, UnitPositionsQuery } from './queries/positions.js';
// The read model of the stage 2 stock report (stock-ledger 13.22; goods-in 9.5; S2-F11-T02).
export { STOCK_HOLDINGS, stockReportReadModels } from './queries/holdings.js';
export type { Holding, HoldingKey, HoldingOwner } from './queries/holdings.js';
export { rebuildAndCompare } from './queries/rebuild.js';
export { inventoryReconciliation, value } from './queries/value.js';
export type { PoolValue, ReconciledMovement, TransitHeld, ValueLayer } from './queries/value.js';
export type { RebuildAnswer, RebuildDifference } from './queries/rebuild.js';
export { countFreezeChanged, holdChanged, movementsPosted, reservationChanged } from './events.js';
export { stockLedgerRestoreParticipant } from './restore-participant.js';
