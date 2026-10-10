// Public interface of finance · books (module-map 4.14). Other code imports only from here.
export { BooksModule } from './books.module.js';
export { BOOKS, POSTING_EVENT_KINDS } from './tokens.js';
export { Books } from './books.js';
export type { BooksDependencies, BooksInterface } from './books.js';
export { booksApprovals } from './commands/effects.js';
export { BOOK_HELD_STOCK } from './contracts/book-held-stock.js';
export type { BookHeldStock } from './contracts/book-held-stock.js';
export type { LineDimensions } from './queries/dimensions.js';
export { JOURNAL_KIND } from './commands/post.js';
export type {
  ChangedItem,
  ItemCheck,
  PostComponent,
  PostedJournal,
  PostItem,
  PostRequest,
  PostResult,
  ReversalPlan,
  ReverseRequest,
} from './commands/post.js';
export { checkEventKinds } from './domain/posting.js';
export type { PostingEventKind } from './domain/posting.js';
export { journalPosted, postingMapChanged } from './events.js';
export { POSTING_CONFIGURATION_CHECK, postingConfigurationCheck } from './queries/validity.js';
