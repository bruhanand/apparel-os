import { uuidv7 } from '@apparel-os/domain';
import {
  ACCOUNT_CHANGE,
  ACCOUNT_TYPE,
  BOOK_SETTING_CHANGE,
  BOOK_SETTING_TYPE,
  POSTING_MAP_TYPE,
  type AccountDraft,
  type AccountVersionDraft,
  type BookSettingDraft,
  type CaEvidenceDraft,
  type CaEvidenceRecorded,
  type CoveredVersion,
  type SettingOrigin,
  type FinanceChanged,
  type MissingItem,
} from '@apparel-os/schemas';
import { and, eq, inArray, sql } from 'drizzle-orm';
import {
  LOCK_STEP,
  lockTable,
  UNIQUE_VIOLATION,
  withSavepoint,
  type CommandRefusal,
  type TransactionContext,
} from '../../../../kernel/index.js';
import type { AccessInterface, Preparer } from '../../../access/index.js';
import type { AuditChange, AuditInterface } from '../../../audit/index.js';
import type { FilesImportsInterface } from '../../../files-imports/index.js';
import { accountingBookExists } from '../../../organisation/index.js';
import type { BookHeldStock } from '../contracts/book-held-stock.js';
import {
  account,
  accountVersion,
  bookSetting,
  bookSettingVersion,
  postingMapVersion,
  type Decision,
} from '../db/schema.js';
import { recordCaEvidence, type CoveredKind, type EvidenceTarget, type EvidenceVersions } from './ca-evidence.js';
import { costChangeRefusal } from './cost-change.js';
import { accountLine, approvedOn, refused, settingLine, staleToken, today, type Outcome } from './lines.js';

// Maintain accounts and settings (books-and-posting 2.2, 2.3, 3.1, 6.3, 9.1; module-map 4.14; S1-F09-T01): a new
// account with its first version, an account's later version, a book setting's version, each under its record's lock
// and waiting for a different authorised Accounts user (POL-09.01; DEC-112, GC4-2), decided through `access`
// (effects.ts); and the CA's approval evidence recorded against the versions it covers, without which a decision gives
// a version no effect (6.3). Each change writes its audit record in the same transaction (structure-and-masters 2.5).

type ValueChange = Extract<AuditChange, { kind: 'value' }>;
type Json = ValueChange['after'];
const value = (field: string, after: Json): ValueChange => ({ kind: 'value', field, before: null, after });
const from = (start: string) => `[${start},)`;
const bookItem = (bookId: string): MissingItem => ({
  kind: 'record',
  recordType: 'organisation.accounting_book',
  recordId: bookId,
});

/** The books part's versions the CA's evidence may name (6.3): each kind's table, record column and identity row. */
const COVERED = {
  [ACCOUNT_TYPE]: { kind: 'account', versions: accountVersion, owner: accountVersion.accountId, identity: 'account' },
  [BOOK_SETTING_TYPE]: {
    kind: 'book-setting',
    versions: bookSettingVersion,
    owner: bookSettingVersion.bookSettingId,
    identity: 'book_setting',
  },
  [POSTING_MAP_TYPE]: {
    kind: 'posting-map',
    versions: postingMapVersion,
    owner: postingMapVersion.postingMapId,
    identity: 'posting_map',
  },
} as const satisfies Record<
  CoveredVersion['recordType'],
  { readonly kind: CoveredKind; readonly identity: string; readonly versions: object; readonly owner: object }
>;

/** How the CA's evidence finds the books part's versions it names (ca-evidence.ts). */
const booksVersions: EvidenceVersions<CoveredVersion> = {
  async find(context, refs) {
    const found = new Map<string, EvidenceTarget>();
    for (const [recordType, line] of Object.entries(COVERED)) {
      const ids = refs.filter((each) => each.recordType === recordType).map((each) => each.versionId);
      if (ids.length === 0) continue;
      const versions = line.versions as unknown as typeof accountVersion;
      const rows = await context.tx
        .select({
          id: versions.id,
          ownerId: sql<string>`${line.owner}::text`,
          decision: sql<Decision>`${versions.decision}`,
        })
        .from(versions)
        .where(inArray(versions.id, ids));
      for (const row of rows) {
        found.set(row.id, {
          kind: line.kind,
          recordType,
          recordId: row.ownerId,
          versionId: row.id,
          decision: row.decision,
          lock: { table: lockTable('finance', line.identity), id: row.ownerId, mode: 'exclusive' },
        });
      }
    }
    return refs.map((each) => found.get(each.versionId));
  },
  missing: (ref) => ({ kind: 'version', recordType: ref.recordType, versionId: ref.versionId }),
};

export interface MaintainDependencies {
  readonly audit: AuditInterface;
  readonly access: Pick<AccessInterface, 'requestApproval'>;
  readonly files: Pick<FilesImportsInterface, 'attach'>;
  /** The "has this book held stock?" implementation `stock` gives, or undefined while none answers (2.2). */
  readonly bookHeldStock?: BookHeldStock | undefined;
}

export class BooksMaintenance {
  constructor(protected readonly dependencies: MaintainDependencies) {}

  protected async startOf(context: TransactionContext, validFrom: string): Promise<CommandRefusal | undefined> {
    const date = await today(context);
    if (typeof date !== 'string') return date;
    // GC2-7, DEC-105: no version ever starts on a past date (6.3; structure-and-masters 2.2).
    if (validFrom < date) return { kind: 'refused', code: 'finance.starts-in-past', missing: [] };
    return undefined;
  }

  /** Locks a record's identity row exclusively at step 1 (code-house-rules 8.2); false when it does not exist. */
  protected async lockRecord(
    context: TransactionContext,
    table: 'account' | 'book_setting' | 'posting_map',
    ids: readonly string[],
  ): Promise<boolean> {
    const locked = await context.lock(
      LOCK_STEP.document,
      ids.map((id) => ({ table: lockTable('finance', table), id, mode: 'exclusive' as const })),
    );
    return locked.missing.length === 0;
  }

  protected async audit(
    context: TransactionContext,
    preparer: Preparer,
    record: { readonly type: string; readonly id: string; readonly versionId?: string },
    operation: string,
    changes: readonly AuditChange[],
  ): Promise<void> {
    await this.dependencies.audit.record(context, {
      actor: { kind: 'user', id: preparer.userId },
      roleAssignmentId: preparer.roleAssignmentId,
      record: { module: 'finance', ...record },
      operation,
      changes,
      source: { kind: 'screen' },
    });
  }

  /** A different authorised Accounts user decides it; an open request on an earlier version is Superseded (9.6). */
  protected request(
    context: TransactionContext,
    preparer: Preparer,
    actionType: string,
    recordType: string,
    recordId: string,
    versionId: string,
  ): Promise<string> {
    return this.dependencies.access.requestApproval(context, {
      actionType,
      document: { module: 'finance', recordType, recordId, versionId },
      value: { kind: 'none' },
      preparers: [preparer.userId],
      requestedBy: preparer,
    });
  }

  // The chart of accounts (3.1; PRD-LED-001).

  private async writeAccountVersion(
    context: TransactionContext,
    preparer: Preparer,
    accountId: string,
    draft: {
      readonly name: string;
      readonly retired: boolean;
      readonly origin: SettingOrigin;
      readonly validFrom: string;
    },
  ): Promise<string> {
    const versionId = uuidv7();
    await context.tx.insert(accountVersion).values({
      id: versionId,
      accountId,
      name: draft.name,
      retired: draft.retired,
      origin: draft.origin,
      validDuring: from(draft.validFrom),
      decision: 'Awaiting approval',
      preparedByUserId: preparer.userId,
    });
    return versionId;
  }

  /** A new account in a book (3.1): its code unique in the book, its nature fixed; its first version waits (6.3). */
  async prepareAccount(
    context: TransactionContext,
    preparer: Preparer,
    draft: AccountDraft,
  ): Promise<Outcome<FinanceChanged>> {
    const past = await this.startOf(context, draft.validFrom);
    if (past !== undefined) return { kind: 'refusal', refusal: past };
    if (!(await accountingBookExists(context, draft.bookId))) {
      return refused('not-found', 'finance.record-not-found', [bookItem(draft.bookId)]);
    }
    const accountId = uuidv7();
    // A code taken in the book, a race included, meets the unique constraint (3.1).
    const written = await withSavepoint(context, 'finance_new_account', [UNIQUE_VIOLATION], () =>
      context.tx
        .insert(account)
        .values({ id: accountId, bookId: draft.bookId, code: draft.code, nature: draft.nature }),
    );
    if (written.kind !== 'done') return refused('refused', 'finance.code-taken', [bookItem(draft.bookId)]);
    const versionId = await this.writeAccountVersion(context, preparer, accountId, { ...draft, retired: false });
    await this.audit(context, preparer, { type: 'account', id: accountId, versionId }, 'prepare-account', [
      value('bookId', draft.bookId),
      value('code', draft.code),
      value('nature', draft.nature),
      value('name', draft.name),
      value('retired', false),
      value('origin', draft.origin),
      value('validFrom', draft.validFrom),
    ]);
    const requestId = await this.request(context, preparer, ACCOUNT_CHANGE, ACCOUNT_TYPE, accountId, versionId);
    return { kind: 'success', answer: { recordId: accountId, versionId, requestId } };
  }

  /** An account's later version: its name, or its retirement from the start; the nature never changes (3.1). */
  async prepareAccountVersion(
    context: TransactionContext,
    preparer: Preparer,
    accountId: string,
    draft: AccountVersionDraft,
  ): Promise<Outcome<FinanceChanged>> {
    const past = await this.startOf(context, draft.validFrom);
    if (past !== undefined) return { kind: 'refusal', refusal: past };
    if (!(await this.lockRecord(context, 'account', [accountId]))) {
      return refused('not-found', 'finance.record-not-found', [
        { kind: 'record', recordType: ACCOUNT_TYPE, recordId: accountId },
      ]);
    }
    const line = accountLine(ACCOUNT_TYPE, accountId);
    const stale = await staleToken(context, line, draft.versionToken);
    if (stale !== undefined) return { kind: 'refusal', refusal: stale };
    const overlap = await approvedOn(context, line, draft.validFrom);
    if (overlap !== undefined) return { kind: 'refusal', refusal: overlap };
    const versionId = await this.writeAccountVersion(context, preparer, accountId, draft);
    await this.audit(context, preparer, { type: 'account', id: accountId, versionId }, 'prepare-account-version', [
      value('name', draft.name),
      value('retired', draft.retired),
      value('origin', draft.origin),
      value('validFrom', draft.validFrom),
    ]);
    const requestId = await this.request(context, preparer, ACCOUNT_CHANGE, ACCOUNT_TYPE, accountId, versionId);
    return { kind: 'success', answer: { recordId: accountId, versionId, requestId } };
  }

  // Book settings (2.2, 2.3).

  /**
   * A version of a book's cost setting or voucher-model setting (2.2, 2.3), with its origin (code-house-rules 12.14):
   * the setting is created with its first version. A cost version that changes the formula or pool mode of a book that
   * has held stock is refused (2.2, SL-6). It waits for a different authorised Accounts user (6.3).
   */
  async prepareBookSetting(
    context: TransactionContext,
    preparer: Preparer,
    bookId: string,
    draft: BookSettingDraft,
  ): Promise<Outcome<FinanceChanged>> {
    const past = await this.startOf(context, draft.validFrom);
    if (past !== undefined) return { kind: 'refusal', refusal: past };
    if (!(await accountingBookExists(context, bookId))) {
      return refused('not-found', 'finance.record-not-found', [bookItem(bookId)]);
    }
    await context.tx.insert(bookSetting).values({ id: uuidv7(), bookId, kind: draft.kind }).onConflictDoNothing();
    const [setting] = await context.tx
      .select({ id: bookSetting.id })
      .from(bookSetting)
      .where(and(eq(bookSetting.bookId, bookId), eq(bookSetting.kind, draft.kind)));
    if (setting === undefined || !(await this.lockRecord(context, 'book_setting', [setting.id]))) {
      throw new Error('A book setting could be neither written nor found');
    }
    const line = settingLine(BOOK_SETTING_TYPE, setting.id);
    const stale = await staleToken(context, line, draft.versionToken);
    if (stale !== undefined) return { kind: 'refusal', refusal: stale };
    const overlap = await approvedOn(context, line, draft.validFrom);
    if (overlap !== undefined) return { kind: 'refusal', refusal: overlap };
    if (draft.kind === 'cost') {
      const change = await costChangeRefusal(
        context,
        this.dependencies.bookHeldStock,
        { id: setting.id, bookId },
        draft,
      );
      if (change !== undefined) return { kind: 'refusal', refusal: change };
    }
    const versionId = uuidv7();
    await context.tx.insert(bookSettingVersion).values({
      id: versionId,
      bookSettingId: setting.id,
      kind: draft.kind,
      formula: draft.kind === 'cost' ? draft.formula : null,
      poolMode: draft.kind === 'cost' ? draft.poolMode : null,
      voucherModel: draft.kind === 'voucher-model' ? draft.voucherModel : null,
      origin: draft.origin,
      validDuring: from(draft.validFrom),
      decision: 'Awaiting approval',
      preparedByUserId: preparer.userId,
    });
    await this.audit(
      context,
      preparer,
      { type: 'book_setting', id: setting.id, versionId },
      'prepare-book-setting-version',
      [
        value('bookId', bookId),
        value('kind', draft.kind),
        ...(draft.kind === 'cost'
          ? [value('formula', draft.formula), value('poolMode', draft.poolMode)]
          : [value('voucherModel', draft.voucherModel)]),
        value('origin', draft.origin),
        value('validFrom', draft.validFrom),
      ],
    );
    const requestId = await this.request(
      context,
      preparer,
      BOOK_SETTING_CHANGE,
      BOOK_SETTING_TYPE,
      setting.id,
      versionId,
    );
    return { kind: 'success', answer: { recordId: setting.id, versionId, requestId } };
  }

  // The CA's approval evidence (6.3; POL-09.01; DEC-112, GC4-2; RR-486).

  /**
   * Record the CA's approval evidence (6.3) for a named set of the books part's versions, each awaiting its decision,
   * through the one record of `finance` (ca-evidence.ts): a stored file attached to each, or a reference.
   */
  recordCaEvidence(
    context: TransactionContext,
    preparer: Preparer,
    draft: CaEvidenceDraft,
  ): Promise<Outcome<CaEvidenceRecorded>> {
    return recordCaEvidence(context, this.dependencies, preparer, draft, booksVersions);
  }
}
