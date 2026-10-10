import type { TransactionContext } from '../../../kernel/index.js';
import type { AccessInterface } from '../../access/index.js';
import type { AuditInterface } from '../../audit/index.js';
import type { FilesImportsInterface } from '../../files-imports/index.js';
import { BooksMaintenance } from './commands/maintain.js';
import type { BookHeldStock } from './contracts/book-held-stock.js';
import { dimensionsOn } from './queries/dimensions.js';
import { accountRecord, accountsOfBook, costSettingOn, settingsOfBook } from './queries/records.js';

export interface BooksDependencies {
  readonly audit: AuditInterface;
  readonly access: Pick<AccessInterface, 'requestApproval' | 'approvalRequestsOf'>;
  readonly files: Pick<FilesImportsInterface, 'attach'>;
  /** The "has this book held stock?" implementation `stock` gives, or undefined while none answers (2.2). */
  readonly bookHeldStock?: BookHeldStock | undefined;
}

/**
 * The books part's interface (module-map 4.14; books-and-posting 9.1), as built by S1-F09-T01: Maintain accounts and
 * settings, record the CA's approval evidence, Read a book's accounts and settings, Read the cost setting of a book on
 * a date, and the dimensions of a line. Every operation joins the caller's transaction through its context
 * (code-house-rules 8.1); the caller has authorised it.
 */
export class Books extends BooksMaintenance {
  private readonly readers: BooksDependencies['access'];

  constructor(dependencies: BooksDependencies) {
    super(dependencies);
    this.readers = dependencies.access;
  }

  private readonly requests = (context: TransactionContext) => (ids: readonly string[]) =>
    this.readers.approvalRequestsOf(context, ids);

  /** A book's chart of accounts with every version (3.1). */
  listAccounts(context: TransactionContext, bookId: string, today: string) {
    return accountsOfBook(context, bookId, today, this.requests(context));
  }

  readAccount(context: TransactionContext, accountId: string, today: string) {
    return accountRecord(context, accountId, today, this.requests(context));
  }

  /** A book's cost and voucher-model settings with every version (2.2, 2.3). */
  listSettings(context: TransactionContext, bookId: string, today: string) {
    return settingsOfBook(context, bookId, today, this.requests(context));
  }

  /** Read the cost setting of a book on a date (2.2; stock-ledger 13.1): its version in force, or not set (12.14). */
  costSettingOn(context: TransactionContext, bookId: string, date: string) {
    return costSettingOn(context, bookId, date);
  }

  /** The book, mapping version, Store and brand of a line for a unit on the accounting date (2.1, 3.2). */
  dimensionsOn(
    context: TransactionContext,
    source: { readonly businessUnitId: string; readonly brandId: string | null },
    date: string,
  ) {
    return dimensionsOn(context, source, date);
  }
}

export type BooksInterface = Books;
