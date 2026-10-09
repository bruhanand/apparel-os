import { uuidv7 } from '@apparel-os/domain';
import type { ExceptionParty, MissingItem } from '@apparel-os/schemas';
import { and, eq, sql } from 'drizzle-orm';
import { lockTable, type CommandRefusal, type LockTarget, type TransactionContext } from '../../../kernel/index.js';
import { exception, exceptionRouting, exceptionRoutingVersion, exceptionType } from '../db/schema.js';
import type { ExceptionTypeRegistration } from '../domain/types.js';

// What the commands of `exceptions` share (access-and-approvals 12; S1-F08-T02).

/** An operation's answer: its value, or the refusal (code-house-rules 12.3). */
export type Outcome<Value> =
  { readonly kind: 'done'; readonly value: Value } | { readonly kind: 'refused'; readonly refusal: CommandRefusal };

export function refused<Value>(
  kind: CommandRefusal['kind'],
  code: string,
  missing: readonly MissingItem[] = [],
): Outcome<Value> {
  return { kind: 'refused', refusal: { kind, code, missing: [...missing] } };
}

export function done<Value>(value: Value): Outcome<Value> {
  return { kind: 'done', value };
}

/** Today under the Organisation's timezone, or the refusal while it has none (PRD-MOD-009; code-house-rules 9). */
export async function today(context: TransactionContext): Promise<Outcome<string>> {
  const date = await context.businessDate();
  if (date.kind === 'set') return done(date.date);
  return refused('unavailable', 'access.business-date-not-set', [
    { kind: 'setting', setting: 'configuration.timezone' },
  ]);
}

/** The row of a type, written the first time the type is routed or raised; it never changes (12.1). */
export async function ensureType(context: TransactionContext, type: ExceptionTypeRegistration): Promise<string> {
  await context.tx
    .insert(exceptionType)
    .values({ id: uuidv7(), code: type.code, category: type.category, module: type.module })
    .onConflictDoNothing({ target: exceptionType.code });
  const row = (await context.tx.select().from(exceptionType).where(eq(exceptionType.code, type.code)))[0];
  if (row === undefined) throw new Error(`Exception type ${type.code} was not recorded`);
  return row.id;
}

/** The approved routing version in force for a type and Site on a date (12.2), or undefined. A null Site is its own key. */
export async function routingInForce(
  context: TransactionContext,
  typeCode: string,
  siteId: string | null,
  date: string,
): Promise<typeof exceptionRoutingVersion.$inferSelect | undefined> {
  const rows = await context.tx
    .select({ version: exceptionRoutingVersion })
    .from(exceptionRoutingVersion)
    .innerJoin(exceptionRouting, eq(exceptionRouting.id, exceptionRoutingVersion.exceptionRoutingId))
    .innerJoin(exceptionType, eq(exceptionType.id, exceptionRouting.exceptionTypeId))
    .where(
      and(
        eq(exceptionType.code, typeCode),
        sql`${exceptionRouting.siteId} is not distinct from ${siteId}::uuid`,
        eq(exceptionRoutingVersion.decision, 'Approved'),
        sql`${exceptionRoutingVersion.validDuring} @> ${date}::date`,
      ),
    );
  return rows[0]?.version;
}

const EXCEPTION = lockTable('exceptions', 'exception');

/** The exception's row as a lock target, at step 1 (code-house-rules 8.2: a command's own record rows). */
export function exceptionTarget(exceptionId: string): LockTarget {
  return { table: EXCEPTION, id: exceptionId, mode: 'exclusive' };
}

export async function exceptionRow(
  context: TransactionContext,
  exceptionId: string,
): Promise<typeof exception.$inferSelect | undefined> {
  return (await context.tx.select().from(exception).where(eq(exception.id, exceptionId)))[0];
}

/** The party a pair of columns names. */
export function partyOf(userId: string | null, roleId: string | null): ExceptionParty {
  if (userId !== null) return { kind: 'user', userId };
  if (roleId !== null) return { kind: 'role', roleId };
  throw new Error('A party names a user or a role');
}

export function partyColumns(party: ExceptionParty): { userId: string | null; roleId: string | null } {
  return party.kind === 'user' ? { userId: party.userId, roleId: null } : { userId: null, roleId: party.roleId };
}

/** Whether an exception's state is open: not Closed (12.3). */
export const isOpen = (state: string): boolean => state !== 'Closed';
