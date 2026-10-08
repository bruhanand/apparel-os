import { sql } from 'drizzle-orm';
import { CommandDefect, type TransactionContext } from '../../../../kernel/index.js';

/**
 * "Has this book held stock?" (stock-ledger 13.7; module-map section 3, rule 6; DEC-116). `finance` · books asks it
 * before a cost-setting version changes a book's formula or pool mode, and refuses that change while the answer is
 * yes (books-and-posting 2.2; stock-ledger 7.12, SL-6). `finance` defines the contract and its token when S1-F09-T01
 * builds it; this is its shape, which `stock` · ledger implements, and `finance` never imports `stock`.
 */
export interface BookStockHistoryContract {
  /**
   * Whether any stock row of the book was ever written, in the caller's transaction: a receipt origin counted into a
   * unit of the book, a movement leg at such a unit, or a cost pool of the book. The answer does not depend on what
   * the caller's actor may see.
   */
  hasHeldStock(context: TransactionContext, bookId: string): Promise<boolean>;
}

/**
 * The ledger's implementation, answered from its own rows of the book through `stock.book_has_held_stock`, the one
 * narrowly authorised function that reads them whatever the actor's scope and returns only yes or no (stock-ledger
 * 14.3; code-house-rules 5.2).
 */
export class BookStockHistory implements BookStockHistoryContract {
  async hasHeldStock(context: TransactionContext, bookId: string): Promise<boolean> {
    const result = await context.tx.execute<{ held: boolean }>(
      sql`select stock.book_has_held_stock(${bookId}::uuid) as held`,
    );
    const held = result.rows[0]?.held;
    if (held === undefined) throw new CommandDefect('stock.book_has_held_stock answered no row');
    return held;
  }
}
