import { Module } from '@nestjs/common';
import { AUDIT, AuditModule, type AuditInterface } from '../../audit/index.js';
import { BookStockHistory } from './contracts/book-stock-history.js';
import { StockLedger } from './ledger.js';
import { placesNotBuilt, skusNotBuilt } from './ports.js';

/** The token under which the ledger provides "has this book held stock?" until `finance` · books names its own. */
export const BOOK_STOCK_HISTORY = 'stock.ledger.BookStockHistory';
/** The token of the ledger's interface (stock-ledger 13.1). */
export const STOCK_LEDGER = 'stock.ledger.StockLedger';

/**
 * `stock` · ledger (module-map 4.13; stock-ledger 13): tier 3. Its tables (stock-ledger 14; S1-F10-T01), its
 * quantity operations and reads (13.1 to 13.6; S1-F10-T02) and the "has this book held stock?" contract it implements
 * for `finance` · books (13.7). In stage 1 the production composition registers no caller, so no stock posts outside
 * tests (13.2); the reads of `organisation` and `merchandise` are not built yet (S1-F02, S1-F03).
 */
@Module({
  imports: [AuditModule],
  providers: [
    { provide: BOOK_STOCK_HISTORY, useFactory: () => new BookStockHistory() },
    {
      provide: STOCK_LEDGER,
      useFactory: (audit: AuditInterface) =>
        new StockLedger({
          audit,
          places: placesNotBuilt,
          skus: skusNotBuilt,
          registrations: [],
          composition: 'production',
        }),
      inject: [AUDIT],
    },
  ],
  exports: [BOOK_STOCK_HISTORY, STOCK_LEDGER],
})
export class StockLedgerModule {}
