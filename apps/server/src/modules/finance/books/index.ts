// Public interface of finance · books (module-map 4.14). Other code imports only from here.
export { BooksModule } from './books.module.js';
export { BOOKS, POSTING_EVENT_KINDS } from './tokens.js';
export { Books } from './books.js';
export type { BooksDependencies, BooksInterface } from './books.js';
export { booksApprovals } from './commands/effects.js';
export { BOOK_HELD_STOCK } from './contracts/book-held-stock.js';
export type { BookHeldStock } from './contracts/book-held-stock.js';
export type { LineDimensions } from './queries/dimensions.js';
export { JOURNAL_KIND } from './commands/posting/journal.js';
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
} from './commands/posting/types.js';
export { checkEventKinds } from './domain/posting.js';
export type { PostingEventKind } from './domain/posting.js';
export { journalPosted, postingMapChanged } from './events.js';
export { POSTING_CONFIGURATION_CHECK, postingConfigurationCheck } from './queries/validity.js';

// What the parts of `finance` share, which the tax rules part calls (module-map 4.14; product owner, 10 Oct 2026,
// RR-486): the version lines and their decisions, the one record of the CA's approval evidence, and the routes'
// command and read plumbing.
export {
  approvedOn,
  datesOf,
  newestVersion,
  refused,
  staleToken,
  takeEffect,
  today,
  versionLine,
} from './commands/lines.js';
export type { Line, Outcome } from './commands/lines.js';
export { approvable, decisionChange, recordDecision } from './commands/decisions.js';
export type { VersionHead } from './commands/decisions.js';
export { caEvidenceCovers, caEvidenceOf, recordCaEvidence } from './commands/ca-evidence.js';
export type { CaEvidence, EvidenceDependencies, EvidenceTarget, EvidenceVersions } from './commands/ca-evidence.js';
export { FinanceRoutes } from './http/finance-routes.js';
