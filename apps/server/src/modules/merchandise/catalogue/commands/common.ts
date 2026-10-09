import type { CatalogueKind, MissingItem } from '@apparel-os/schemas';
import { and, asc, eq, gt, sql } from 'drizzle-orm';
import type { CommandRefusal, TransactionContext } from '../../../../kernel/index.js';
import { brandVersion } from '../db/schema.js';
import { catalogueTables } from '../db/tables.js';
import { recordTypeOf } from '../domain/kinds.js';

// What recording a catalogue change and deciding one share (structure-and-masters 2.2, 2.3; S1-F03-T01).

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

export const recordItem = (kind: CatalogueKind, id: string): MissingItem => ({
  kind: 'record',
  recordType: recordTypeOf(kind),
  recordId: id,
});

/** A record a version names. */
export interface Reference {
  readonly kind: CatalogueKind;
  readonly id: string;
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

/** Whether a record of a kind exists. */
export async function exists(context: TransactionContext, kind: CatalogueKind, id: string): Promise<boolean> {
  const tables = catalogueTables[kind];
  const rows = await context.tx
    .select({ id: tables.identityId })
    .from(tables.identity)
    .where(eq(tables.identityId, id));
  return rows.length > 0;
}

/**
 * Whether a record has an approved version in force on a date (structure-and-masters 2.2); a brand whose version then
 * retires it is not (2.5).
 */
export async function inForceOn(
  context: TransactionContext,
  kind: CatalogueKind,
  id: string,
  date: string,
): Promise<boolean> {
  const tables = catalogueTables[kind];
  const rows = await context.tx
    .select({ id: tables.versionId })
    .from(tables.version)
    .where(
      and(
        eq(tables.owner, id),
        eq(tables.decision, 'Approved'),
        sql`${tables.validDuring} @> ${date}::date`,
        kind === 'brand' ? eq(brandVersion.retired, false) : undefined,
      ),
    );
  return rows.length > 0;
}

/** The refusal naming the first reference not in force on the date, or undefined (2.2). */
export async function referencesInForce(
  context: TransactionContext,
  references: readonly Reference[],
  date: string,
): Promise<CommandRefusal | undefined> {
  for (const reference of references) {
    if (!(await inForceOn(context, reference.kind, reference.id, date))) {
      return {
        kind: 'refused',
        code: 'merchandise.reference-not-in-force',
        missing: [recordItem(reference.kind, reference.id)],
      };
    }
  }
  return undefined;
}

/** The refusal while another approved version of the record starts on the date (2.2). */
export async function approvedOn(
  context: TransactionContext,
  kind: CatalogueKind,
  recordId: string,
  start: string,
): Promise<CommandRefusal | undefined> {
  const tables = catalogueTables[kind];
  const [same] = await context.tx
    .select({ id: sql<string>`${tables.versionId}` })
    .from(tables.version)
    .where(
      and(
        eq(tables.owner, recordId),
        eq(tables.decision, 'Approved'),
        sql`lower(${tables.validDuring}) = ${start}::date`,
      ),
    )
    .limit(1);
  return same === undefined
    ? undefined
    : {
        kind: 'refused',
        code: 'merchandise.version-overlaps',
        missing: [{ kind: 'version', recordType: recordTypeOf(kind), recordId, versionId: same.id }],
      };
}

/**
 * A version taking effect from its start (2.2; code-house-rules 7.3): the approved version in force or Scheduled then
 * ends there, and the version ends where an approved version starting after it starts (product owner, 8 Oct 2026).
 */
export async function takeEffect(
  context: TransactionContext,
  kind: CatalogueKind,
  recordId: string,
  versionId: string,
  start: string,
): Promise<void> {
  const tables = catalogueTables[kind];
  const approvedRows = and(eq(tables.owner, recordId), eq(tables.decision, 'Approved'));
  const [next] = await context.tx
    .select({ start: sql<string>`lower(${tables.validDuring})::text` })
    .from(tables.version)
    .where(and(approvedRows, gt(sql`lower(${tables.validDuring})`, sql`${start}::date`)))
    .orderBy(asc(sql`lower(${tables.validDuring})`))
    .limit(1);
  await context.tx.execute(
    sql`update ${tables.version} set valid_during = daterange(lower(valid_during), ${start}::date)
        where ${tables.owner} = ${recordId}::uuid and decision = 'Approved' and valid_during @> ${start}::date`,
  );
  await context.tx.execute(
    sql`update ${tables.version}
        set decision = 'Approved', valid_during = daterange(${start}::date, ${next?.start ?? null}::date)
        where id = ${versionId}::uuid`,
  );
}

/** The newest version of a record, its version token (code-house-rules 12.7), or undefined while it has none. */
export async function newestVersion(
  context: TransactionContext,
  kind: CatalogueKind,
  recordId: string,
): Promise<string | undefined> {
  const tables = catalogueTables[kind];
  const [row] = await context.tx
    .select({ id: sql<string>`max(${tables.versionId}::text)` })
    .from(tables.version)
    .where(eq(tables.owner, recordId));
  return row?.id ?? undefined;
}

/**
 * The records a brand or category is nested under through any approved parent, whatever its dates (4.1): a cycle is
 * refused even where its links would never be in force together, so no day can hold one. **Design choice.**
 */
export async function ancestorsOf(
  context: TransactionContext,
  kind: 'brand' | 'category',
  id: string,
): Promise<string[]> {
  const table = kind === 'brand' ? sql`merchandise.brand_version` : sql`merchandise.category_version`;
  const own = kind === 'brand' ? sql`brand_id` : sql`category_id`;
  const parent = kind === 'brand' ? sql`parent_brand_id` : sql`parent_category_id`;
  const result = await context.tx.execute<{ id: string }>(sql`
    with recursive up(id) as (
      select ${id}::uuid
      union
      select v.${parent} from ${table} v join up on v.${own} = up.id
      where v.decision = 'Approved' and v.${parent} is not null
    )
    select id::text as id from up`);
  return result.rows.map((row) => row.id);
}
