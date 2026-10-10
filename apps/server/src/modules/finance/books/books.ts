import type { PeriodDraft, PostingMapDraft, ReopeningDraft } from '@apparel-os/schemas';
import type { TransactionContext } from '../../../kernel/index.js';
import type { AccessInterface, Preparer } from '../../access/index.js';
import type { AuditInterface } from '../../audit/index.js';
import type { FilesImportsInterface } from '../../files-imports/index.js';
import type { NumberingInterface } from '../../numbering/index.js';
import { BooksMaintenance } from './commands/maintain.js';
import { preparePostingMap } from './commands/maps.js';
import { lockPeriod, requestReopening, withdrawReopening } from './commands/period-close.js';
import { definePeriod } from './commands/periods.js';
import {
  checkPostable,
  holdPeriods,
  holdReversal,
  planReversal,
  post,
  reverse,
  type ItemCheck,
  type PostRequest,
  type ReversalPlan,
  type ReverseRequest,
} from './commands/post.js';
import type { BookHeldStock } from './contracts/book-held-stock.js';
import type { PostingEventKind } from './domain/posting.js';
import { dimensionsOn } from './queries/dimensions.js';
import { ledgerOf, trialBalance } from './queries/ledger.js';
import { mapsOfBook } from './queries/maps.js';
import { periodCloseOf, reopeningRead } from './queries/period-close.js';
import { periodsOfBook } from './queries/periods.js';
import { accountRecord, accountsOfBook, costSettingOn, settingsOfBook } from './queries/records.js';

export interface BooksDependencies {
  readonly audit: AuditInterface;
  readonly access: Pick<AccessInterface, 'requestApproval' | 'approvalRequestsOf'>;
  readonly files: Pick<FilesImportsInterface, 'attach'>;
  /** The "has this book held stock?" implementation `stock` gives, or undefined while none answers (2.2). */
  readonly bookHeldStock?: BookHeldStock | undefined;
  /** The journal series (5.4); `numbering` serves the journal kind the composition root declares. */
  readonly numbering: NumberingInterface;
  /** The posting event kinds the posting modules declare, checked at start (7.1; checkEventKinds). */
  readonly kinds: ReadonlyMap<string, PostingEventKind>;
}

/**
 * The books part's interface (module-map 4.14; books-and-posting 9.1): Maintain accounts, settings and posting maps,
 * record the CA's approval evidence, define periods, Check postable, Hold periods, Post and Reverse, and Read the
 * books' records, the ledger and the trial balance (S1-F09-T01, S1-F09-T02). Every operation joins the caller's
 * transaction through its context (code-house-rules 8.1); the caller has authorised it. Lock a period, request and
 * withdraw a reopening, whose decision is `access`'s Decide, and Money › Period close (S1-F09-T03).
 */
export class Books extends BooksMaintenance {
  private readonly readers: BooksDependencies['access'];
  private readonly numbering: NumberingInterface;
  private readonly kinds: ReadonlyMap<string, PostingEventKind>;

  constructor(dependencies: BooksDependencies) {
    super(dependencies);
    this.readers = dependencies.access;
    this.numbering = dependencies.numbering;
    this.kinds = dependencies.kinds;
  }

  private readonly requests = (context: TransactionContext) => (ids: readonly string[]) =>
    this.readers.approvalRequestsOf(context, ids);

  private get posting() {
    return { kinds: this.kinds, numbering: this.numbering };
  }

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

  /** The book, mapping version, Site, Store and brand of a line for a unit on the accounting date (2.1, 3.2). */
  dimensionsOn(
    context: TransactionContext,
    source: { readonly businessUnitId: string; readonly brandId: string | null },
    date: string,
  ) {
    return dimensionsOn(context, source, date);
  }

  // Posting maps (6).

  /** The posting event kinds declared in this build (7.1). */
  eventKinds(): readonly PostingEventKind[] {
    return [...this.kinds.values()].sort((a, b) => a.kind.localeCompare(b.kind));
  }

  /** A new version of a book's posting map for an event kind (6.1 to 6.3), waiting for its decision. */
  preparePostingMap(context: TransactionContext, preparer: Preparer, draft: PostingMapDraft) {
    return preparePostingMap(
      context,
      {
        kinds: this.kinds,
        startOf: async (c, validFrom) => {
          const refusal = await this.startOf(c, validFrom);
          return refusal === undefined ? undefined : { kind: 'refusal', refusal };
        },
        lock: (c, mapId) => this.lockRecord(c, 'posting_map', [mapId]),
        audit: (c, p, record, operation, changes) => this.audit(c, p, record, operation, changes),
        request: (c, p, actionType, recordType, recordId, versionId) =>
          this.request(c, p, actionType, recordType, recordId, versionId),
      },
      preparer,
      draft,
    );
  }

  /** A book's posting maps with every version, and the version in force on the date asked (14). */
  listPostingMaps(context: TransactionContext, bookId: string, on: string, today: string) {
    return mapsOfBook(context, bookId, on, today, this.kinds, this.requests(context));
  }

  // Periods (4.1).

  definePeriod(context: TransactionContext, preparer: Preparer, bookId: string, draft: PeriodDraft) {
    return definePeriod(
      context,
      (c, p, record, operation, changes) => this.audit(c, p, record, operation, changes),
      preparer,
      bookId,
      draft,
    );
  }

  listPeriods(context: TransactionContext, bookId: string) {
    return periodsOfBook(context, bookId);
  }

  // Lock and reopening (4.2, 4.3; S1-F09-T03).

  /** Lock a period (4.2; PRD-LED-009): it waits for the postings in flight in it (4.5). */
  lockPeriod(context: TransactionContext, preparer: Preparer, periodId: string) {
    return lockPeriod(context, this.dependencies, preparer, periodId);
  }

  /** Request a reopening of a Locked period, naming its corrections (4.3; PRD-LED-019, PRD-LED-020). */
  requestReopening(context: TransactionContext, preparer: Preparer, periodId: string, draft: ReopeningDraft) {
    return requestReopening(context, this.dependencies, preparer, periodId, draft);
  }

  /** Withdraw a reopening in force (4.3 step 4; PRD-LED-020). */
  withdrawReopening(context: TransactionContext, preparer: Preparer, reopeningId: string) {
    return withdrawReopening(context, this.dependencies, preparer, reopeningId);
  }

  /** Money › Period close: each period's state and its reopenings with their named corrections (14). */
  periodClose(context: TransactionContext, bookId: string) {
    return periodCloseOf(context, bookId, this.requests(context));
  }

  /** A reopening as made, with its period, for the approval panel (PRD-ACS-007). */
  readReopening(context: TransactionContext, reopeningId: string) {
    return reopeningRead(context, reopeningId, this.requests(context));
  }

  // Posting (8, 9).

  /** Check postable (9.1): each item's book, period and state, map version and journal series, or its refusal. */
  checkPostable(context: TransactionContext, request: Pick<PostRequest, 'sourceModule' | 'items'>) {
    return checkPostable(context, this.posting, request);
  }

  /** Hold periods (9.1, 4.5): the periods in shared mode at step 7; answers the series for the caller's step 8. */
  holdPeriods(context: TransactionContext, checks: readonly ItemCheck[]) {
    return holdPeriods(context, this.numbering, checks);
  }

  /** Post (9.1 to 9.3), in the caller's transaction, under its locks. */
  post(context: TransactionContext, request: PostRequest) {
    return post(context, this.posting, request);
  }

  /** The checks of a reversal before any lock (9.1). */
  planReversal(context: TransactionContext, request: Pick<ReverseRequest, 'journalId' | 'businessDate'>) {
    return planReversal(context, this.numbering, request);
  }

  /** Holds a reversal's period at step 7; answers its series for the caller's step 8. */
  holdReversal(context: TransactionContext, plan: Extract<ReversalPlan, { kind: 'reversible' }>) {
    return holdReversal(context, this.numbering, plan);
  }

  /** Reverse (9.1, 9.4): a linked journal with the lines on opposite sides, at most once. */
  reverse(context: TransactionContext, request: ReverseRequest) {
    return reverse(context, this.numbering, request);
  }

  // Read models (12).

  trialBalance(context: TransactionContext, bookId: string, periodId: string) {
    return trialBalance(context, bookId, periodId);
  }

  ledger(context: TransactionContext, accountId: string, from: string, to: string) {
    return ledgerOf(context, accountId, from, to);
  }
}

export type BooksInterface = Books;
