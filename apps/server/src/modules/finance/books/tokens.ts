/** The token of the books part's interface (BooksInterface). Inject it with @Inject(BOOKS). */
export const BOOKS = 'finance.Books';
/**
 * The posting event kinds the posting modules declare (books-and-posting 7.1), checked by `checkEventKinds` under the
 * composition that hands them to the books part (module-map section 3, rule 6): a synthetic kind only in a test one. Inject it with @Inject(POSTING_EVENT_KINDS).
 */
export const POSTING_EVENT_KINDS = 'finance.PostingEventKinds';
