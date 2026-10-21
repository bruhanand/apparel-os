import { uuidv7 } from '@apparel-os/domain';
import type { MissingItem } from '@apparel-os/schemas';
import { and, desc, eq } from 'drizzle-orm';
import { LOCK_STEP, lockTable, type CommandRefusal, type TransactionContext } from '../../../kernel/index.js';
import type { RecordFacts } from '../../access/index.js';
import type { AuditScope } from '../../audit/index.js';
import { arrival, arrivalChange, grn, type ArrivalChangeKind } from '../db/schema.js';

// What every command of `receiving` shares (code-house-rules 8.1, 8.2, 12.3, 12.7).

/** A command's answer: its success, or a refusal naming what is missing (PRD-UXP-003). */
export type Outcome<Answer> =
  | { readonly kind: 'success'; readonly answer: Answer }
  | { readonly kind: 'refusal'; readonly refusal: CommandRefusal };

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

/** Today under the Organisation's timezone, or the refusal while it has none (code-house-rules 9). */
export async function today(context: TransactionContext, at?: Date): Promise<string | CommandRefusal> {
  const date = await context.businessDate(at);
  if (date.kind === 'set') return date.date;
  return {
    kind: 'unavailable',
    code: 'access.business-date-not-set',
    missing: [{ kind: 'setting', setting: 'configuration.timezone' }],
  };
}

export type ArrivalRow = typeof arrival.$inferSelect;

/** An Arrival named in a refusal (PRD-UXP-003). */
export const arrivalItem = (arrivalId: string): MissingItem => ({
  kind: 'record',
  recordType: 'receiving.arrival',
  recordId: arrivalId,
});

export const arrivalNotFound = <Answer>(arrivalId: string): Outcome<Answer> =>
  refused('not-found', 'receiving.record-not-found', [arrivalItem(arrivalId)]);

/** The scope facts of an Arrival, which its routes authorise with (access-and-approvals 5.3). */
export function factsOf(row: Pick<ArrivalRow, 'siteId' | 'storeId' | 'businessUnitId' | 'legalEntityId' | 'brandId'>) {
  const facts: RecordFacts & AuditScope = {
    siteId: row.siteId,
    businessUnitId: row.businessUnitId,
    legalEntityId: row.legalEntityId,
    brandId: row.brandId,
    ...(row.storeId === null ? {} : { storeId: row.storeId }),
  };
  return facts;
}

/** The scope columns every row of an Arrival carries (code-house-rules 6.1). */
export function scopeColumns(row: ArrivalRow) {
  return {
    siteId: row.siteId,
    storeId: row.storeId,
    businessUnitId: row.businessUnitId,
    legalEntityId: row.legalEntityId,
    brandId: row.brandId,
  };
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

/** The Arrival's GRN, once issued. */
export async function grnOf(context: TransactionContext, arrivalId: string) {
  const [row] = await context.tx
    .select()
    .from(grn)
    .where(and(eq(grn.arrivalId, arrivalId)));
  return row;
}

/**
 * The refusal of a change to an Arrival whose GRN is issued: a GRN is never changed or issued again; a miscount is a
 * linked recount (goods-in 4.5, 4.7; PRD-REC-019).
 */
export const grnIssued = <Answer>(grnId: string): Outcome<Answer> =>
  refused('refused', 'receiving.grn-issued', [{ kind: 'record', recordType: 'receiving.grn', recordId: grnId }]);

/** Text as the receiver typed it, without spaces at its ends (goods-in 4.2, 4.3). */
export const trimmed = (text: string): string => text.trim();

/** Text compared ignoring case and spaces at the ends (goods-in 3.7, 5.4). */
export const textKey = (text: string): string => text.trim().toUpperCase();
