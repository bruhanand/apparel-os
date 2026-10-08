// Public interface of stock · ledger (module-map 4.13; stock-ledger 13). Other code imports only from here.
export { BOOK_STOCK_HISTORY, STOCK_LEDGER, StockLedgerModule } from './stock-ledger.module.js';
export { BookStockHistory, type BookStockHistoryContract } from './contracts/book-stock-history.js';
export { StockLedger } from './ledger.js';
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
export type {
  Condition,
  FreezeScope,
  Goods,
  ImportKind,
  ItemValue,
  LedgerActor,
  LedgerItem,
  LedgerItemKind,
  LedgerRequest,
  LedgerSource,
  Owner,
  Place,
  PlacedHoldKind,
  ReservationKind,
} from './domain/request.js';
export type { ExpectedQuantity } from './domain/working.js';
export type { LedgerPlaces, LedgerSkus, SkuFacts, UnitFacts } from './ports.js';
export type { CallerRegistration, RegisteredRecordType } from './registry.js';
export { availability, custody, pieceByCode, rebuildAndCompare } from './queries/reads.js';
export type { AvailabilityRow, CustodyQuery, CustodyRow, RebuildDifference } from './queries/reads.js';
export { countFreezeChanged, holdChanged, movementsPosted, reservationChanged } from './events.js';
