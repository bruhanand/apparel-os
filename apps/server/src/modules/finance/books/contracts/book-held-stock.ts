import type { TransactionContext } from '../../../../kernel/index.js';

/**
 * "Has this book held stock?" (books-and-posting 2.2; stock-ledger 13.7; module-map section 3, rule 6; DEC-116): the
 * contract `finance` · books asks before a cost-setting version changes a book's formula or pool mode, and refuses that
 * change while the answer is yes (stock-ledger 7.12, SL-6). `finance` sits in tier 2 and never imports `stock`; `stock`
 * · ledger implements it, and the composition root hands the implementation to `finance` at start under
 * BOOK_HELD_STOCK. While no implementation answers, such a change is refused (`finance.book-stock-unanswered`).
 */
export interface BookHeldStock {
  /**
   * Whether any stock row of the book was ever written, in the caller's transaction. The answer does not depend on
   * what the caller's actor may see.
   */
  hasHeldStock(context: TransactionContext, bookId: string): Promise<boolean>;
}

/** The token under which the composition root provides the "has this book held stock?" implementation. */
export const BOOK_HELD_STOCK = 'finance.BookHeldStock';
