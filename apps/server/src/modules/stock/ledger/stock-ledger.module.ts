import { Module } from '@nestjs/common';
import { BookStockHistory } from './contracts/book-stock-history.js';

/** The token under which the ledger provides "has this book held stock?" until `finance` · books names its own. */
export const BOOK_STOCK_HISTORY = 'stock.ledger.BookStockHistory';

/**
 * `stock` · ledger (module-map 4.13; stock-ledger 13): tier 3. So far its tables (stock-ledger 14; S1-F10-T01) and the
 * "has this book held stock?" contract it implements for `finance` · books (13.7). In stage 1 the production
 * composition registers no caller, so no stock posts outside tests (13.2).
 */
@Module({
  providers: [{ provide: BOOK_STOCK_HISTORY, useFactory: () => new BookStockHistory() }],
  exports: [BOOK_STOCK_HISTORY],
})
export class StockLedgerModule {}
