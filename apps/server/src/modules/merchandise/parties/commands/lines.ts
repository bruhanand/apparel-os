import type { MissingItem } from '@apparel-os/schemas';
import { sql, type SQL } from 'drizzle-orm';
import type { CommandRefusal, TransactionContext } from '../../../../kernel/index.js';

// The version lines of the parties part (structure-and-masters 2.2; code-house-rules 7.3; S1-F03-T03): the rows of one
// record's effective-dated versions, such as a party's versions, one of its roles, its bank details, a brand–supplier
// link or an agreement. What every change and decision of them shares.

/** The version tables of the parties part. */
export type VersionTable =
  'party_version' | 'party_role' | 'party_bank_details' | 'brand_supplier_link_version' | 'agreement_version';

/** One record's line of versions: its table, the record type it is read as, and the condition naming its rows. */
export interface Line {
  readonly table: VersionTable;
  readonly recordType: string;
  readonly recordId: string;
  readonly where: SQL;
}

const tableOf = (line: Line) => sql.raw(`merchandise.${line.table}`);

/** The line of a record whose rows name it in one column. */
export function lineOf(
  table: VersionTable,
  recordType: string,
  column: 'party_id' | 'link_id' | 'agreement_id',
  recordId: string,
): Line {
  return { table, recordType, recordId, where: sql`${sql.raw(column)} = ${recordId}::uuid` };
}

/** One role's line of a party: the role is its own dated record (5.1). */
export function roleLine(partyId: string, role: string): Line {
  return {
    table: 'party_role',
    recordType: 'merchandise.party',
    recordId: partyId,
    where: sql`party_id = ${partyId}::uuid and role = ${role}`,
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

/** The newest version of the line, its version token (code-house-rules 12.7), or undefined while it has none. */
export async function newestVersion(context: TransactionContext, line: Line): Promise<string | undefined> {
  const result = await context.tx.execute<{ id: string | null }>(
    sql`select max(id::text) as id from ${tableOf(line)} where ${line.where}`,
  );
  return result.rows[0]?.id ?? undefined;
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

/** The refusal while another approved version of the line starts on the date (2.2). */
export async function approvedOn(
  context: TransactionContext,
  line: Line,
  start: string,
): Promise<CommandRefusal | undefined> {
  const result = await context.tx.execute<{ id: string }>(
    sql`select id::text as id from ${tableOf(line)}
        where ${line.where} and decision = 'Approved' and lower(valid_during) = ${start}::date limit 1`,
  );
  const same = result.rows[0];
  return same === undefined
    ? undefined
    : {
        kind: 'refused',
        code: 'merchandise.version-overlaps',
        missing: [{ kind: 'version', recordType: line.recordType, recordId: line.recordId, versionId: same.id }],
      };
}

/** The approved version of the line in force on a date, or undefined (2.2). */
export async function inForceOn(context: TransactionContext, line: Line, date: string): Promise<string | undefined> {
  const result = await context.tx.execute<{ id: string }>(
    sql`select id::text as id from ${tableOf(line)}
        where ${line.where} and decision = 'Approved' and valid_during @> ${date}::date limit 1`,
  );
  return result.rows[0]?.id;
}

/**
 * A version taking effect from its start (2.2; code-house-rules 7.3): the approved version in force or Scheduled then
 * ends there, and the version ends where an approved version starting after it starts (product owner, 8 Oct 2026).
 */
export async function takeEffect(
  context: TransactionContext,
  line: Line,
  versionId: string,
  start: string,
): Promise<void> {
  const next = await context.tx.execute<{ start: string }>(
    sql`select lower(valid_during)::text as start from ${tableOf(line)}
        where ${line.where} and decision = 'Approved' and lower(valid_during) > ${start}::date
        order by lower(valid_during) limit 1`,
  );
  await context.tx.execute(
    sql`update ${tableOf(line)} set valid_during = daterange(lower(valid_during), ${start}::date)
        where ${line.where} and decision = 'Approved' and valid_during @> ${start}::date`,
  );
  await context.tx.execute(
    sql`update ${tableOf(line)}
        set decision = 'Approved', valid_during = daterange(${start}::date, ${next.rows[0]?.start ?? null}::date)
        where id = ${versionId}::uuid`,
  );
}

/** Whether the party holds a role in force on the date (5.1). */
export async function holdsRoleOn(
  context: TransactionContext,
  partyId: string,
  role: string,
  date: string,
): Promise<boolean> {
  const result = await context.tx.execute(
    sql`select 1 from merchandise.party_role
        where party_id = ${partyId}::uuid and role = ${role} and held and decision = 'Approved'
          and valid_during @> ${date}::date limit 1`,
  );
  return result.rows.length > 0;
}

/** `[start,end)` as PostgreSQL writes a daterange. */
export function datesOf(range: string): { start: string; end?: string } {
  const match = /^\[(\d{4}-\d{2}-\d{2}),(\d{4}-\d{2}-\d{2})?\)$/.exec(range);
  if (match?.[1] === undefined) throw new Error(`Unexpected range ${range}`);
  return match[2] === undefined ? { start: match[1] } : { start: match[1], end: match[2] };
}
