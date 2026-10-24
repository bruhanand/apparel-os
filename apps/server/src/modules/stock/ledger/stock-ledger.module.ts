import { Module } from '@nestjs/common';
import { PRODUCTION_COMPOSITION } from '../../../kernel/index.js';
import { AUDIT, AuditModule, type AuditInterface } from '../../audit/index.js';
import { BOOKS, BooksModule, type BooksInterface } from '../../finance/books/index.js';
import { BookStockHistory } from './contracts/book-stock-history.js';
import { StockLedger } from './ledger.js';
import { catalogueSkus, organisationPlaces } from './ports.js';
import type { CallerRegistration } from './registry.js';

/** The token under which the ledger provides "has this book held stock?" until `finance` · books names its own. */
export const BOOK_STOCK_HISTORY = 'stock.ledger.BookStockHistory';
/** The token of the ledger's interface (stock-ledger 13.1). */
export const STOCK_LEDGER = 'stock.ledger.StockLedger';
/**
 * The token of the stock callers' registrations (stock-ledger 13.2): the modules above the ledger that post stock,
 * handed over by the composition root at start (module-map section 3, rule 6). None when nothing provides it.
 */
export const STOCK_CALLERS = 'stock.ledger.StockCallers';

/**
 * `stock` · ledger (module-map 4.13; stock-ledger 13): tier 3. Its tables (stock-ledger 14; S1-F10-T01), its
 * quantity operations and reads (13.1 to 13.6; S1-F10-T02) and the "has this book held stock?" contract it implements
 * for `finance` · books (13.7). Its callers are the registrations the composition root hands over under STOCK_CALLERS,
 * none synthetic: in stage 1 none, so no stock posted outside tests; from stage 2 `receiving`'s (13.2; S2-F02-T02). Its
 * SKU read is `merchandise`'s Read a SKU (S1-F03-T02) and its place read `organisation`'s (RR-436).
 */
@Module({
  imports: [AuditModule, BooksModule],
  providers: [
    { provide: BOOK_STOCK_HISTORY, useFactory: () => new BookStockHistory() },
    {
      provide: STOCK_LEDGER,
      useFactory: (audit: AuditInterface, books: BooksInterface, callers: readonly CallerRegistration[] | undefined) =>
        new StockLedger({
          audit,
          // finance · books: the cost setting, Check postable, Hold periods and Post (7.11; S1-F10-T03).
          books,
          // The organisation half of RR-436: Read a unit's mapping as of a date and a location's place (S1-F10-T04).
          places: organisationPlaces,
          // The merchandise half of RR-436: Read a SKU as of a date (S1-F03-T02).
          skus: catalogueSkus,
          registrations: callers ?? [],
          composition: PRODUCTION_COMPOSITION,
        }),
      inject: [AUDIT, BOOKS, { token: STOCK_CALLERS, optional: true }],
    },
  ],
  exports: [BOOK_STOCK_HISTORY, STOCK_LEDGER],
})
export class StockLedgerModule {}
