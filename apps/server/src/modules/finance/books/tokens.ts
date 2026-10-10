/** The token of the books part's interface (BooksInterface). Inject it with @Inject(BOOKS). */
export const BOOKS = 'finance.Books';
/**
 * The posting event kinds the posting modules declare (books-and-posting 7.1), which the composition root hands to the
 * books part (module-map section 3, rule 6). Inject it with @Inject(POSTING_EVENT_KINDS).
 */
export const POSTING_EVENT_KINDS = 'finance.PostingEventKinds';
