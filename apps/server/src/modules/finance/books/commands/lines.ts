import type { MissingItem } from '@apparel-os/schemas';
import { and, asc, eq, gt, max, sql, type AnyColumn } from 'drizzle-orm';
import type { CommandRefusal, TransactionContext } from '../../../../kernel/index.js';
import { accountVersion, bookSettingVersion, postingMapVersion } from '../db/schema.js';

// The version lines of `finance` (structure-and-masters 2.2; code-house-rules 7.3; books-and-posting 6.3;
// shared-calculations 10.1, 10.3; S1-F09-T01, S1-F09-T04): the rows of one record's effective-dated versions, whichever
// part of `finance` keeps them. What every change and decision of them shares, through Drizzle's query builder over
// the owning part's own table definitions (3.4). The tax rules part uses them through the books part's interface
// (module-map 4.14; product owner, 10 Oct 2026, RR-486).

/**
 * A version table of `finance`. Every one shares the version columns (`id`, `valid_during`, `decision`), so a line
 * reads any of them through the shape of one; only those shared columns are named through it.
 */
type VersionTable = typeof accountVersion;

/** One record's line of versions: its version table, the column naming the record, and the record it is read as. */
export interface Line {
  readonly table: VersionTable;
  readonly owner: AnyColumn;
  readonly recordType: string;
  readonly recordId: string;
}

/** The line of a record's versions in `table`, a version table of `finance`, whose `owner` column names the record. */
export function versionLine(table: object, owner: AnyColumn, recordType: string, recordId: string): Line {
  return { table: table as VersionTable, owner, recordType, recordId };
}

export const accountLine = (recordType: string, accountId: string) =>
  versionLine(accountVersion, accountVersion.accountId, recordType, accountId);

export const settingLine = (recordType: string, settingId: string) =>
  versionLine(bookSettingVersion, bookSettingVersion.bookSettingId, recordType, settingId);

export const mapLine = (recordType: string, mapId: string) =>
  versionLine(postingMapVersion, postingMapVersion.postingMapId, recordType, mapId);

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

/** The newest version of a line, its version token (code-house-rules 12.7), or undefined while it has none. */
export async function newestVersion(context: TransactionContext, line: Line): Promise<string | undefined> {
  const [row] = await context.tx
    .select({ id: max(sql<string>`${line.table.id}::text`) })
    .from(line.table)
    .where(eq(line.owner, line.recordId));
  return row?.id ?? undefined;
}

/** The refusal of a change made on a stale screen, naming the newest version (12.7), or undefined. */
export async function staleToken(
  context: TransactionContext,
  line: Line,
  token: string | undefined,
): Promise<CommandRefusal | undefined> {
  const newest = await newestVersion(context, line);
  if (newest === undefined || newest === token) return undefined;
  return {
    kind: 'conflict',
    code: 'kernel.stale-version',
    missing: [{ kind: 'version', recordType: line.recordType, recordId: line.recordId, versionId: newest }],
  };
}

/** The refusal while another approved version of the line starts on the date: they never overlap (2.2). */
export async function approvedOn(
  context: TransactionContext,
  line: Line,
  start: string,
): Promise<CommandRefusal | undefined> {
  const table = line.table;
  const [same] = await context.tx
    .select({ id: table.id })
    .from(table)
    .where(
      and(
        eq(line.owner, line.recordId),
        eq(table.decision, 'Approved'),
        sql`lower(${table.validDuring}) = ${start}::date`,
      ),
    )
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
  const table = line.table;
  const ofRecord = eq(line.owner, line.recordId);
  const lower = sql`lower(${table.validDuring})`;
  const [next] = await context.tx
    .select({ start: sql<string>`${lower}::text` })
    .from(table)
    .where(and(ofRecord, eq(table.decision, 'Approved'), gt(lower, sql`${start}::date`)))
    .orderBy(asc(lower))
    .limit(1);
  await context.tx
    .update(table)
    .set({ validDuring: sql`daterange(${lower}, ${start}::date)` })
    .where(and(ofRecord, eq(table.decision, 'Approved'), sql`${table.validDuring} @> ${start}::date`));
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
