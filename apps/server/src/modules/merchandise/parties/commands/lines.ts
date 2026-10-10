import type { MissingItem } from '@apparel-os/schemas';
import { and, asc, eq, gt, max, sql, type AnyColumn, type SQL } from 'drizzle-orm';
import type { CommandRefusal, TransactionContext } from '../../../../kernel/index.js';
import { agreementVersion, brandSupplierLinkVersion, partyBankDetails, partyRole, partyVersion } from '../db/schema.js';

// The version lines of the parties part (structure-and-masters 2.2; code-house-rules 7.3; S1-F03-T03): the rows of one
// record's effective-dated versions, such as a party's versions, one of its roles, its bank details, a brand–supplier
// link or an agreement. What every change and decision of them shares, through Drizzle's query builder over the
// part's own table definitions (code-house-rules 3.4).

/** The version tables of the parties part. */
export type VersionTable =
  'party_version' | 'party_role' | 'party_bank_details' | 'brand_supplier_link_version' | 'agreement_version';

/**
 * Each version table by name. They share the version columns (`versionColumns`, db/schema.ts), so a line reads any of
 * them through the shape of one; only those shared columns are named through it.
 */
const tables: Record<VersionTable, typeof partyVersion> = {
  party_version: partyVersion,
  party_role: partyRole as unknown as typeof partyVersion,
  party_bank_details: partyBankDetails as unknown as typeof partyVersion,
  brand_supplier_link_version: brandSupplierLinkVersion as unknown as typeof partyVersion,
  agreement_version: agreementVersion as unknown as typeof partyVersion,
};

/** The column naming a line's record, by table. */
const ownerColumns = {
  party_id: {
    party_version: partyVersion.partyId,
    party_role: partyRole.partyId,
    party_bank_details: partyBankDetails.partyId,
  },
  link_id: { brand_supplier_link_version: brandSupplierLinkVersion.linkId },
  agreement_id: { agreement_version: agreementVersion.agreementId },
} as const;

/** One record's line of versions: its table, the record type it is read as, and the condition naming its rows. */
export interface Line {
  readonly table: VersionTable;
  readonly recordType: string;
  readonly recordId: string;
  readonly where: SQL;
}

/** The line of a record whose rows name it in one column. */
export function lineOf(
  table: VersionTable,
  recordType: string,
  column: 'party_id' | 'link_id' | 'agreement_id',
  recordId: string,
): Line {
  const owner = (ownerColumns[column] as Partial<Record<VersionTable, AnyColumn>>)[table];
  if (owner === undefined) throw new Error(`${table} has no column ${column}`);
  return { table, recordType, recordId, where: eq(owner, recordId) };
}

/** One role's line of a party: the role is its own dated record (5.1). */
export function roleLine(partyId: string, role: string): Line {
  return {
    table: 'party_role',
    recordType: 'merchandise.party',
    recordId: partyId,
    where: sql`${eq(partyRole.partyId, partyId)} and ${partyRole.role} = ${role}`,
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
  const table = tables[line.table];
  const [row] = await context.tx
    .select({ id: max(sql<string>`${table.id}::text`) })
    .from(table)
    .where(line.where);
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
        code: 'merchandise.version-overlaps',
        missing: [{ kind: 'version', recordType: line.recordType, recordId: line.recordId, versionId: same.id }],
      };
}

/** The approved version of the line in force on a date, or undefined (2.2). */
export async function inForceOn(context: TransactionContext, line: Line, date: string): Promise<string | undefined> {
  const table = tables[line.table];
  const [row] = await context.tx
    .select({ id: table.id })
    .from(table)
    .where(and(line.where, eq(table.decision, 'Approved'), sql`${table.validDuring} @> ${date}::date`))
    .limit(1);
  return row?.id;
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

/** Whether the party holds a role in force on the date (5.1). */
export async function holdsRoleOn(
  context: TransactionContext,
  partyId: string,
  role: string,
  date: string,
): Promise<boolean> {
  const rows = await context.tx
    .select({ id: partyRole.id })
    .from(partyRole)
    .where(
      and(
        roleLine(partyId, role).where,
        eq(partyRole.held, true),
        eq(partyRole.decision, 'Approved'),
        sql`${partyRole.validDuring} @> ${date}::date`,
      ),
    )
    .limit(1);
  return rows.length > 0;
}

/** `[start,end)` as PostgreSQL writes a daterange. */
export function datesOf(range: string): { start: string; end?: string } {
  const match = /^\[(\d{4}-\d{2}-\d{2}),(\d{4}-\d{2}-\d{2})?\)$/.exec(range);
  if (match?.[1] === undefined) throw new Error(`Unexpected range ${range}`);
  return match[2] === undefined ? { start: match[1] } : { start: match[1], end: match[2] };
}
