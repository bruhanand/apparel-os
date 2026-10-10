import type { AccountRecord, BookSettingRecord, CaEvidenceView, CostSettingInForce } from '@apparel-os/schemas';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import type { TransactionContext } from '../../../../kernel/index.js';
import type { LatestRequest } from '../../../access/index.js';
import { account, accountVersion, bookSetting, bookSettingVersion, type Decision } from '../db/schema.js';
import { caEvidenceOf } from '../commands/ca-evidence.js';
import { versionState } from '../domain/kinds.js';
import { datesOf } from '../commands/lines.js';

// The books part's records with every version (books-and-posting 2.2, 2.3, 3.1, 6.3, 9.1; S1-F09-T01): a book's
// accounts and settings, each version with its state, its latest approval request and the CA's evidence covering it;
// and Read the cost setting of a book on a date, its version in force or not set (code-house-rules 12.14).

/** The latest approval request of each version named, from `access` (9.1, 9.6). */
export type RequestReader = (versionIds: readonly string[]) => Promise<ReadonlyMap<string, LatestRequest>>;

interface VersionRow {
  readonly id: string;
  readonly validDuring: string;
  readonly decision: Decision;
}

export function versionView(
  row: VersionRow,
  today: string,
  request: LatestRequest | undefined,
  evidence: readonly CaEvidenceView[],
) {
  const dates = datesOf(row.validDuring);
  return {
    id: row.id,
    validFrom: dates.start,
    ...(dates.end === undefined ? {} : { validTo: dates.end }),
    state: versionState({
      decision: row.decision,
      start: dates.start,
      end: dates.end,
      today,
      requestState: request?.state,
    }),
    ...(request === undefined ? {} : { request: { id: request.id, state: request.state } }),
    caEvidence: [...evidence],
  };
}

export const newestFirst = <T extends VersionRow>(rows: readonly T[]) =>
  [...rows].sort((a, b) => {
    const byStart = datesOf(b.validDuring).start.localeCompare(datesOf(a.validDuring).start);
    return byStart !== 0 ? byStart : b.id.localeCompare(a.id);
  });
export const tokenOf = (rows: readonly VersionRow[]) =>
  rows
    .map((row) => row.id)
    .sort()
    .at(-1);

/** The CA's evidence covering each version named (6.3), by version. */
export const evidenceOf = caEvidenceOf;

async function accountsOf(
  context: TransactionContext,
  where: ReturnType<typeof eq>,
  today: string,
  requests: RequestReader,
): Promise<AccountRecord[]> {
  const heads = await context.tx.select().from(account).where(where).orderBy(asc(account.code), asc(account.id));
  if (heads.length === 0) return [];
  const versions = await context.tx
    .select()
    .from(accountVersion)
    .where(
      inArray(
        accountVersion.accountId,
        heads.map((head) => head.id),
      ),
    )
    .orderBy(desc(accountVersion.id));
  const latest = await requests(versions.filter((row) => row.decision === 'Awaiting approval').map((row) => row.id));
  const evidence = await evidenceOf(
    context,
    versions.map((row) => row.id),
  );
  return heads.map((head) => {
    const own = newestFirst(versions.filter((row) => row.accountId === head.id));
    const token = tokenOf(own);
    return {
      id: head.id,
      bookId: head.bookId,
      code: head.code,
      nature: head.nature,
      ...(token === undefined ? {} : { versionToken: token }),
      versions: own.map((row) => ({
        ...versionView(row, today, latest.get(row.id), evidence.get(row.id) ?? []),
        name: row.name,
        retired: row.retired,
        origin: row.origin,
      })),
    };
  });
}

/** A book's chart of accounts, in code order (3.1); retired accounts stay readable. */
export function accountsOfBook(context: TransactionContext, bookId: string, today: string, requests: RequestReader) {
  return accountsOf(context, eq(account.bookId, bookId), today, requests);
}

export async function accountRecord(
  context: TransactionContext,
  accountId: string,
  today: string,
  requests: RequestReader,
): Promise<AccountRecord | undefined> {
  const [record] = await accountsOf(context, eq(account.id, accountId), today, requests);
  return record;
}

/** A book's settings, cost and voucher model, with every version (2.2, 2.3). */
export async function settingsOfBook(
  context: TransactionContext,
  bookId: string,
  today: string,
  requests: RequestReader,
): Promise<BookSettingRecord[]> {
  const heads = await context.tx
    .select()
    .from(bookSetting)
    .where(eq(bookSetting.bookId, bookId))
    .orderBy(asc(bookSetting.kind));
  if (heads.length === 0) return [];
  const versions = await context.tx
    .select()
    .from(bookSettingVersion)
    .where(
      inArray(
        bookSettingVersion.bookSettingId,
        heads.map((head) => head.id),
      ),
    );
  const latest = await requests(versions.filter((row) => row.decision === 'Awaiting approval').map((row) => row.id));
  const evidence = await evidenceOf(
    context,
    versions.map((row) => row.id),
  );
  return heads.map((head) => {
    const own = newestFirst(versions.filter((row) => row.bookSettingId === head.id));
    const token = tokenOf(own);
    return {
      id: head.id,
      bookId: head.bookId,
      kind: head.kind,
      ...(token === undefined ? {} : { versionToken: token }),
      versions: own.map((row) => ({
        ...versionView(row, today, latest.get(row.id), evidence.get(row.id) ?? []),
        origin: row.origin,
        ...(row.formula === null ? {} : { formula: row.formula }),
        ...(row.poolMode === null ? {} : { poolMode: row.poolMode }),
        ...(row.voucherModel === null ? {} : { voucherModel: row.voucherModel }),
      })),
    };
  });
}

/**
 * Read the cost setting of a book on a date (2.2; stock-ledger 13.1; code-house-rules 12.14): the approved version in
 * force, with its identifier, which a new cost pool keeps; or not set, a stated answer and never a default
 * (PRD-SEC-017). The stock ledger refuses a valued item while it is not set (`no-cost-setting`, stock-ledger 13.8).
 */
export async function costSettingOn(
  context: TransactionContext,
  bookId: string,
  date: string,
): Promise<CostSettingInForce> {
  const [row] = await context.tx
    .select({
      versionId: bookSettingVersion.id,
      formula: bookSettingVersion.formula,
      poolMode: bookSettingVersion.poolMode,
      origin: bookSettingVersion.origin,
      validDuring: bookSettingVersion.validDuring,
    })
    .from(bookSettingVersion)
    .innerJoin(bookSetting, eq(bookSetting.id, bookSettingVersion.bookSettingId))
    .where(
      and(
        eq(bookSetting.bookId, bookId),
        eq(bookSetting.kind, 'cost'),
        eq(bookSettingVersion.decision, 'Approved'),
        sql`${bookSettingVersion.validDuring} @> ${date}::date`,
      ),
    )
    .limit(1);
  if (row?.formula == null || row.poolMode === null) return { kind: 'not-set' };
  const dates = datesOf(row.validDuring);
  return {
    kind: 'set',
    versionId: row.versionId,
    formula: row.formula,
    poolMode: row.poolMode,
    origin: row.origin,
    validFrom: dates.start,
    ...(dates.end === undefined ? {} : { validTo: dates.end }),
  };
}
