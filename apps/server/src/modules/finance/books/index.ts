// Public interface of finance · books (module-map 4.14). Other code imports only from here.
export { BooksModule } from './books.module.js';
export { BOOKS } from './tokens.js';
export { Books } from './books.js';
export type { BooksDependencies, BooksInterface } from './books.js';
export { booksApprovals } from './commands/effects.js';
export { BOOK_HELD_STOCK } from './contracts/book-held-stock.js';
export type { BookHeldStock } from './contracts/book-held-stock.js';
export type { LineDimensions } from './queries/dimensions.js';
