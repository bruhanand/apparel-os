import type { MissingItem } from '@apparel-os/schemas';
import { and, eq, sql } from 'drizzle-orm';
import { lockTable, type TransactionContext } from '../../../../kernel/index.js';
import type { ValidityCheck } from '../../../configuration/index.js';
import { mappingOn } from '../../../organisation/index.js';
import {
  account,
  accountVersion,
  bookSetting,
  bookSettingVersion,
  financialPeriod,
  postingMap,
  postingMapVersion,
} from '../db/schema.js';
import { today } from '../commands/lines.js';
import { mapVersionOn } from './maps.js';
import { periodOn } from './periods.js';
import { costSettingOn } from './records.js';

// The policy gate's check of the books' posting configuration (books-and-posting 11; module-map 4.4, section 3 rule
// 6; PRD-SEC-017, PRD-UXP-003; S1-F09-T02). The Financial posting policy (9) is valid for a book only when it is
// Signed and its real values validated, which `configuration` checks, and the book has an approved cost setting, a
// chart in force, a period covering today and an approved map for each event kind the operation posts, which this
// check answers. An operation names it once for each event kind it posts, as its subject.

/** The code an operation names among its validity checks, once per event kind it posts (11). */
export const POSTING_CONFIGURATION_CHECK = 'finance.posting-configuration';

/** The books the check covers: the asked unit's book today, or else every book finance holds records of. */
async function booksAsked(
  context: TransactionContext,
  businessUnitId: string | null,
  date: string,
): Promise<{ books: string[] } | { missing: MissingItem[] }> {
  if (businessUnitId !== null) {
    const mapping = await mappingOn(context, businessUnitId, date);
    if (mapping === undefined) {
      return {
        missing: [{ kind: 'record', recordType: 'organisation.business_unit_mapping', recordId: businessUnitId }],
      };
    }
    return { books: [mapping.accountingBookId] };
  }
  const rows = await context.tx.execute<{ book_id: string }>(sql`
    select book_id from ${bookSetting} union select book_id from ${account}
    union select book_id from ${financialPeriod} union select book_id from ${postingMap} order by 1`);
  if (rows.rows.length === 0) return { missing: [{ kind: 'setting', setting: 'finance.book' }] };
  return { books: rows.rows.map((row) => row.book_id) };
}

/** Whether the book has an account with an approved, unretired version in force on the date (3.1). */
async function chartInForce(context: TransactionContext, bookId: string, date: string): Promise<boolean> {
  const [row] = await context.tx
    .select({ id: account.id })
    .from(account)
    .innerJoin(accountVersion, eq(accountVersion.accountId, account.id))
    .where(
      and(
        eq(account.bookId, bookId),
        eq(accountVersion.decision, 'Approved'),
        eq(accountVersion.retired, false),
        sql`${accountVersion.validDuring} @> ${date}::date`,
      ),
    )
    .limit(1);
  return row !== undefined;
}

export const postingConfigurationCheck: ValidityCheck = {
  code: POSTING_CONFIGURATION_CHECK,
  policy: 9,
  async check(context, subject) {
    const date = await today(context);
    if (typeof date !== 'string') return { kind: 'invalid', missing: date.missing };
    const asked = await booksAsked(context, subject.businessUnitId, date);
    if ('missing' in asked) return { kind: 'invalid', missing: asked.missing };
    const missing: MissingItem[] = [];
    for (const bookId of asked.books) {
      if ((await costSettingOn(context, bookId, date)).kind === 'not-set') {
        missing.push({ kind: 'book-setting', bookId, setting: 'cost' });
      }
      if (!(await chartInForce(context, bookId, date))) missing.push({ kind: 'chart-of-accounts', bookId });
      if ((await periodOn(context, bookId, date)) === undefined) {
        missing.push({ kind: 'financial-period', bookId, date });
      }
      if (subject.subject !== null && (await mapVersionOn(context, bookId, subject.subject, date)) === undefined) {
        missing.push({ kind: 'posting-map', bookId, eventKind: subject.subject });
      }
    }
    return missing.length === 0 ? { kind: 'valid' } : { kind: 'invalid', missing };
  },
  // Policy 9's values held here (DM-6): every approved cost, voucher-model, account and posting map version in force
  // now or later, with its origin and its preparer, who cannot validate it (books-and-posting 11 "As built"; RR-487,
  // product owner, 10 Oct 2026).
  async values(context) {
    const date = await today(context);
    if (typeof date !== 'string') return [];
    const later = (range: unknown) =>
      sql`(pg_catalog.upper_inf(${range}) or pg_catalog.upper(${range}) > ${date}::date)`;
    const settings = await context.tx
      .select({
        id: bookSettingVersion.id,
        validDuring: bookSettingVersion.validDuring,
        origin: bookSettingVersion.origin,
        preparedBy: bookSettingVersion.preparedByUserId,
      })
      .from(bookSettingVersion)
      .where(and(eq(bookSettingVersion.decision, 'Approved'), later(bookSettingVersion.validDuring)));
    const maps = await context.tx
      .select({
        id: postingMapVersion.id,
        validDuring: postingMapVersion.validDuring,
        origin: postingMapVersion.origin,
        preparedBy: postingMapVersion.preparedByUserId,
      })
      .from(postingMapVersion)
      .where(and(eq(postingMapVersion.decision, 'Approved'), later(postingMapVersion.validDuring)));
    const accounts = await context.tx
      .select({
        id: accountVersion.id,
        validDuring: accountVersion.validDuring,
        origin: accountVersion.origin,
        preparedBy: accountVersion.preparedByUserId,
      })
      .from(accountVersion)
      .where(and(eq(accountVersion.decision, 'Approved'), later(accountVersion.validDuring)));
    return [...settings, ...accounts, ...maps].map((row) => ({
      key: row.id,
      version: row.validDuring,
      origin: row.origin,
      enteredBy: [row.preparedBy],
    }));
  },
  // Every change of a setting, an account or a map locks its identity row (maintain.ts, maps.ts).
  async locks(context) {
    const settings = await context.tx.select({ id: bookSetting.id }).from(bookSetting);
    const accounts = await context.tx.select({ id: account.id }).from(account);
    const maps = await context.tx.select({ id: postingMap.id }).from(postingMap);
    return [
      ...settings.map((row) => ({ table: lockTable('finance', 'book_setting'), id: row.id, mode: 'shared' as const })),
      ...accounts.map((row) => ({ table: lockTable('finance', 'account'), id: row.id, mode: 'shared' as const })),
      ...maps.map((row) => ({ table: lockTable('finance', 'posting_map'), id: row.id, mode: 'shared' as const })),
    ];
  },
};
