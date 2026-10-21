import { uuidv7 } from '@apparel-os/domain';
import { ARRIVAL_TYPE, type MissingItem } from '@apparel-os/schemas';
import { desc, eq, inArray } from 'drizzle-orm';
import { LOCK_STEP, lockTable, type CommandRefusal, type TransactionContext } from '../../../kernel/index.js';
import type { RecordFacts } from '../../access/index.js';
import type { AuditChange, AuditInterface, AuditScope } from '../../audit/index.js';
import { entryFacts } from '../db/columns.js';
import { arrival, arrivalChange, countEntry, grn, type ArrivalChangeKind } from '../db/schema.js';
import type { CountEntryFacts } from '../domain/lines.js';

// What every command and read of `receiving` shares (code-house-rules 8.1, 8.2, 12.3, 12.7).

/** A command's answer: its success, or a refusal naming what is missing (PRD-UXP-003). */
export type Outcome<Answer> =
  | { readonly kind: 'success'; readonly answer: Answer }
  | { readonly kind: 'refusal'; readonly refusal: CommandRefusal };

/** A refusal outcome from a refusal (code-house-rules 12.3). */
export const refusalOf = (refusal: CommandRefusal): Outcome<never> => ({ kind: 'refusal', refusal });

export function refused<Answer>(
  kind: CommandRefusal['kind'],
  code: string,
  missing: readonly MissingItem[] = [],
): Outcome<Answer> {
  return { kind: 'refusal', refusal: { kind, code, missing } };
}

/** Who acts: the signed-in person and the assignment Authorise used (access-and-approvals 7.1). */
export interface Actor {
  readonly userId: string;
  readonly roleAssignmentId: string;
}

/** The refusal while the Organisation has no timezone, so no business date (code-house-rules 9; PRD-SEC-017). */
export const BUSINESS_DATE_NOT_SET: CommandRefusal = {
  kind: 'unavailable',
  code: 'access.business-date-not-set',
  missing: [{ kind: 'setting', setting: 'configuration.timezone' }],
};

/** Today under the Organisation's timezone, or the business date of `at`; the refusal while it has none. */
export async function today(context: TransactionContext, at?: Date): Promise<string | CommandRefusal> {
  const date = await context.businessDate(at);
  return date.kind === 'set' ? date.date : BUSINESS_DATE_NOT_SET;
}

/** A record named in a refusal (PRD-UXP-003). */
export const recordItem = (recordType: string, recordId: string): MissingItem => ({
  kind: 'record',
  recordType,
  recordId,
});

/** No record of the type with that identifier, or none the actor may see (code-house-rules 6.2). */
export const recordNotFound = (recordType: string, recordId: string): CommandRefusal => ({
  kind: 'not-found',
  code: 'receiving.record-not-found',
  missing: [recordItem(recordType, recordId)],
});

export const arrivalNotFound = (arrivalId: string): Outcome<never> =>
  refusalOf(recordNotFound(ARRIVAL_TYPE, arrivalId));

/** A business unit not in force today at a Site (goods-in 4.2). */
export const unitNotAtSite = (businessUnitId: string): CommandRefusal => ({
  kind: 'refused',
  code: 'receiving.unit-not-at-site',
  missing: [recordItem('organisation.business_unit', businessUnitId)],
});

export type ArrivalRow = typeof arrival.$inferSelect;
type Scoped = Pick<ArrivalRow, 'siteId' | 'storeId' | 'businessUnitId' | 'legalEntityId' | 'brandId'>;

/** The scope columns every row of an Arrival carries: its place, legal entity and brand (code-house-rules 6.1). */
export function scopeColumns(row: Scoped): Scoped {
  return {
    siteId: row.siteId,
    storeId: row.storeId,
    businessUnitId: row.businessUnitId,
    legalEntityId: row.legalEntityId,
    brandId: row.brandId,
  };
}

/** The same as scope facts, which its routes authorise with (access-and-approvals 5.3), a Store only when it has one. */
export function factsOf(row: Scoped): RecordFacts & AuditScope {
  const { storeId, ...facts } = scopeColumns(row);
  return storeId === null ? facts : { ...facts, storeId };
}

/** The Arrival as the actor may see it, or undefined (code-house-rules 6.2). */
export async function arrivalRow(context: TransactionContext, arrivalId: string): Promise<ArrivalRow | undefined> {
  const [row] = await context.tx.select().from(arrival).where(eq(arrival.id, arrivalId));
  return row;
}

/**
 * Locks an Arrival's identity row exclusively at step 1, the document step (code-house-rules 8.2), and reads it under
 * the lock; undefined when it does not exist or the actor may not see it.
 */
export async function lockArrival(context: TransactionContext, arrivalId: string): Promise<ArrivalRow | undefined> {
  const locked = await context.lock(LOCK_STEP.document, [
    { table: lockTable('receiving', 'arrival'), id: arrivalId, mode: 'exclusive' },
  ]);
  if (locked.missing.some((each) => each.id === arrivalId)) return undefined;
  return arrivalRow(context, arrivalId);
}

/** The newest change of an Arrival: its version token (code-house-rules 12.7). */
export async function newestChange(context: TransactionContext, arrivalId: string) {
  const [row] = await context.tx
    .select({ id: arrivalChange.id, changeNumber: arrivalChange.changeNumber })
    .from(arrivalChange)
    .where(eq(arrivalChange.arrivalId, arrivalId))
    .orderBy(desc(arrivalChange.changeNumber))
    .limit(1);
  return row;
}

/** Records the next change of an Arrival, under its lock; answers the new version token. */
export async function recordChange(
  context: TransactionContext,
  row: ArrivalRow,
  change: ArrivalChangeKind,
  userId: string,
): Promise<string> {
  const newest = await newestChange(context, row.id);
  const id = uuidv7();
  await context.tx.insert(arrivalChange).values({
    id,
    arrivalId: row.id,
    changeNumber: (newest?.changeNumber ?? 0) + 1,
    change,
    ...scopeColumns(row),
    changedByUserId: userId,
  });
  return id;
}

/** Every saved entry of an Arrival's count, as the domain reads them. */
export async function entriesOf(context: TransactionContext, arrivalId: string): Promise<CountEntryFacts[]> {
  const rows = await context.tx.select().from(countEntry).where(eq(countEntry.arrivalId, arrivalId));
  return rows.map(entryFacts);
}

/** Every saved entry of the count of each Arrival given, by Arrival. */
export async function entriesByArrival(
  context: TransactionContext,
  arrivalIds: readonly string[],
): Promise<ReadonlyMap<string, CountEntryFacts[]>> {
  const byArrival = new Map<string, CountEntryFacts[]>(arrivalIds.map((id) => [id, []]));
  if (arrivalIds.length === 0) return byArrival;
  const rows = await context.tx
    .select()
    .from(countEntry)
    .where(inArray(countEntry.arrivalId, [...arrivalIds]));
  for (const row of rows) byArrival.get(row.arrivalId)?.push(entryFacts(row));
  return byArrival;
}

/** The Arrival's GRN, once issued. */
export async function grnOf(context: TransactionContext, arrivalId: string) {
  const [row] = await context.tx.select().from(grn).where(eq(grn.arrivalId, arrivalId));
  return row;
}

/**
 * The refusal of a change to an Arrival whose GRN is issued: a GRN is never changed or issued again; a miscount is a
 * linked recount (goods-in 4.5, 4.7; PRD-REC-019).
 */
export const grnIssued = (grnId: string): Outcome<never> =>
  refused('refused', 'receiving.grn-issued', [recordItem('receiving.grn', grnId)]);

type ValueChange = Extract<AuditChange, { kind: 'value' }>;

/** A field's value before and after a change, as its audit record keeps it (numbering-and-audit 4.1). */
export const valueChange = (
  field: string,
  before: ValueChange['before'],
  after: ValueChange['after'],
): ValueChange => ({ kind: 'value', field, before, after });

/**
 * The audit record of a change to an Arrival or its GRN, made on the screen by the actor and scoped as the Arrival is
 * (numbering-and-audit 4.1; PRD-MOD-006): the record changed, the operation and the fields changed.
 */
export async function audited(
  context: TransactionContext,
  audit: AuditInterface,
  actor: Actor,
  row: ArrivalRow,
  change: {
    readonly record: { readonly type: string; readonly id: string; readonly versionId?: string };
    readonly operation: string;
    readonly changes: readonly ValueChange[];
    readonly idempotencyKey?: string;
  },
): Promise<void> {
  await audit.record(context, {
    actor: { kind: 'user', id: actor.userId },
    roleAssignmentId: actor.roleAssignmentId,
    scope: factsOf(row),
    record: { module: 'receiving', ...change.record },
    operation: change.operation,
    changes: change.changes,
    source: { kind: 'screen' },
    ...(change.idempotencyKey === undefined ? {} : { idempotencyKey: change.idempotencyKey }),
  });
}
