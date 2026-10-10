import type { MissingItem } from '@apparel-os/schemas';
import { and, asc, eq, gt, max, sql, type SQL } from 'drizzle-orm';
import type { CommandRefusal, TransactionContext } from '../../../../kernel/index.js';
import { accountVersion, bookSettingVersion, postingMapVersion } from '../db/schema.js';

// The version lines of the books part (structure-and-masters 2.2; code-house-rules 7.3; books-and-posting 6.3;
// S1-F09-T01): the rows of one record's effective-dated versions, an account's or a book setting's. What every change
// and decision of them shares, through Drizzle's query builder over the part's own table definitions (3.4).

/**
 * The version tables of the books part. They share the version columns (db/schema.ts), so a line reads either through
 * the shape of one; only those shared columns are named through it.
 */
const tables = {
  account_version: accountVersion,
  book_setting_version: bookSettingVersion as unknown as typeof accountVersion,
  posting_map_version: postingMapVersion as unknown as typeof accountVersion,
} as const;

/** One record's line of versions: its table, the record type it is read as, and the condition naming its rows. */
export interface Line {
  readonly table: keyof typeof tables;
  readonly recordType: string;
  readonly recordId: string;
  readonly where: SQL;
}

export function accountLine(recordType: string, accountId: string): Line {
  return { table: 'account_version', recordType, recordId: accountId, where: eq(accountVersion.accountId, accountId) };
}

export function settingLine(recordType: string, settingId: string): Line {
  return {
    table: 'book_setting_version',
    recordType,
    recordId: settingId,
    where: eq(bookSettingVersion.bookSettingId, settingId),
  };
}

export function mapLine(recordType: string, mapId: string): Line {
  return {
    table: 'posting_map_version',
    recordType,
    recordId: mapId,
    where: eq(postingMapVersion.postingMapId, mapId),
  };
}

export type Outcome<Answer> =
  | { readonly kind: 'success'; readonly answer: Answer }
  | { readonly kind: 'refusal'; readonly refusal: CommandRefusal };

export function refused<Answer>(
  kind: CommandRefusal['kind'],
  code: string,
  missing: MissingItem[] = [],
): Outcome<Answer> {
  return { kind: 'refusal', refusal: { kind, code, missing } };
}

/** Today under the Organisation's timezone, or the refusal while it has none (PRD-MOD-009; code-house-rules 9). */
export async function today(context: TransactionContext): Promise<string | CommandRefusal> {
  const date = await context.businessDate();
  if (date.kind === 'set') return date.date;
  return {
    kind: 'unavailable',
    code: 'access.business-date-not-set',
    missing: [{ kind: 'setting', setting: 'configuration.timezone' }],
  };
}

/** The refusal of a change made on a stale screen, naming the newest version (12.7), or undefined. */
export async function staleToken(
  context: TransactionContext,
  line: Line,
  token: string | undefined,
): Promise<CommandRefusal | undefined> {
  const table = tables[line.table];
  const [row] = await context.tx
    .select({ id: max(sql<string>`${table.id}::text`) })
    .from(table)
    .where(line.where);
  const newest = row?.id ?? undefined;
  if (newest === undefined || newest === token) return undefined;
  return {
    kind: 'conflict',
    code: 'kernel.stale-version',
    missing: [{ kind: 'version', recordType: line.recordType, recordId: line.recordId, versionId: newest }],
  };
}

/** The refusal while another approved version of the line starts on the date (2.2). */
export async function approvedOn(
  context: TransactionContext,
  line: Line,
  start: string,
): Promise<CommandRefusal | undefined> {
  const table = tables[line.table];
  const [same] = await context.tx
    .select({ id: table.id })
    .from(table)
    .where(and(line.where, eq(table.decision, 'Approved'), sql`lower(${table.validDuring}) = ${start}::date`))
    .limit(1);
  return same === undefined
    ? undefined
    : {
        kind: 'refused',
        code: 'finance.version-overlaps',
        missing: [{ kind: 'version', recordType: line.recordType, recordId: line.recordId, versionId: same.id }],
      };
}

/**
 * A version taking effect from its start (2.2; code-house-rules 7.3): the approved version in force or Scheduled then
 * ends there, and the version ends where an approved version starting after it starts.
 */
export async function takeEffect(
  context: TransactionContext,
  line: Line,
  versionId: string,
  start: string,
): Promise<void> {
  const table = tables[line.table];
  const lower = sql`lower(${table.validDuring})`;
  const [next] = await context.tx
    .select({ start: sql<string>`${lower}::text` })
    .from(table)
    .where(and(line.where, eq(table.decision, 'Approved'), gt(lower, sql`${start}::date`)))
    .orderBy(asc(lower))
    .limit(1);
  await context.tx
    .update(table)
    .set({ validDuring: sql`daterange(${lower}, ${start}::date)` })
    .where(and(line.where, eq(table.decision, 'Approved'), sql`${table.validDuring} @> ${start}::date`));
  await context.tx
    .update(table)
    .set({ decision: 'Approved', validDuring: sql`daterange(${start}::date, ${next?.start ?? null}::date)` })
    .where(eq(table.id, versionId));
}

/** `[start,end)` as PostgreSQL writes a daterange. */
export function datesOf(range: string): { start: string; end?: string } {
  const match = /^\[(\d{4}-\d{2}-\d{2}),(\d{4}-\d{2}-\d{2})?\)$/.exec(range);
  if (match?.[1] === undefined) throw new Error(`Unexpected range ${range}`);
  return match[2] === undefined ? { start: match[1] } : { start: match[1], end: match[2] };
}
