import { sql } from 'drizzle-orm';
import { CommandDefect, sqlStateOf } from './command-errors.js';
import type { TransactionContext } from './transaction-context.js';

// A write tried under a savepoint, so a constraint the database holds behind a service check is answered as a
// refusal and the command goes on, never failed (code-house-rules 8.1; the race behind a check of 6.2 and 7.3).

/** SQLSTATE 23505 unique_violation. */
export const UNIQUE_VIOLATION = '23505';
/** SQLSTATE 23P01 exclusion_violation. */
export const EXCLUSION_VIOLATION = '23P01';

/** The constraint a database error names, looking through the causes a library wraps it in. */
export function constraintOf(error: unknown): string | undefined {
  let current: unknown = error;
  for (let depth = 0; depth < 8 && current instanceof Error; depth += 1) {
    if ('constraint' in current && typeof current.constraint === 'string') return current.constraint;
    current = current.cause;
  }
  return undefined;
}

/** What a database error was, as a savepoint's caller tells one race from another. */
export interface CaughtViolation {
  readonly sqlState: string;
  readonly constraint: string | undefined;
}

/** The work ran and its writes stand. */
export interface SavepointDone<T> {
  readonly kind: 'done';
  readonly value: T;
}

/** The work failed with one of the SQLSTATEs named, and was rolled back to the savepoint. */
export interface SavepointCaught {
  readonly kind: 'caught';
  readonly violation: CaughtViolation;
}

/** The work answered what its caller does not keep, and was rolled back to the savepoint. */
export interface SavepointRolledBack<T> {
  readonly kind: 'rolled-back';
  readonly value: T;
}

/**
 * Runs the work under a savepoint. When it fails with one of the SQLSTATEs named, the work is rolled back to the
 * savepoint and the violation answered; any other error is thrown as it was, and fails the command.
 */
export function withSavepoint<T>(
  context: TransactionContext,
  name: string,
  sqlStates: readonly string[],
  work: () => Promise<T>,
): Promise<SavepointDone<T> | SavepointCaught>;
/**
 * With `keep`, the work's answer also says whether its writes stay: when `keep` is false, such as for a refusal an
 * effect answers after the decision it uses was written, the work is rolled back to the savepoint and its answer is
 * given back, for the caller to answer in turn (access-and-approvals 9.8b; code-house-rules 8.1).
 */
export function withSavepoint<T>(
  context: TransactionContext,
  name: string,
  sqlStates: readonly string[],
  work: () => Promise<T>,
  keep: (value: T) => boolean,
): Promise<SavepointDone<T> | SavepointCaught | SavepointRolledBack<T>>;
export async function withSavepoint<T>(
  context: TransactionContext,
  name: string,
  sqlStates: readonly string[],
  work: () => Promise<T>,
  keep?: (value: T) => boolean,
): Promise<SavepointDone<T> | SavepointCaught | SavepointRolledBack<T>> {
  if (!/^[a-z][a-z0-9_]*$/.test(name)) throw new CommandDefect(`Savepoint name ${name} is not a plain identifier`);
  await context.tx.execute(sql.raw(`savepoint ${name}`));
  try {
    const value = await work();
    if (keep !== undefined && !keep(value)) {
      await context.tx.execute(sql.raw(`rollback to savepoint ${name}`));
      return { kind: 'rolled-back', value };
    }
    await context.tx.execute(sql.raw(`release savepoint ${name}`));
    return { kind: 'done', value };
  } catch (error) {
    const sqlState = sqlStateOf(error);
    if (sqlState === undefined || !sqlStates.includes(sqlState)) throw error;
    await context.tx.execute(sql.raw(`rollback to savepoint ${name}`));
    return { kind: 'caught', violation: { sqlState, constraint: constraintOf(error) } };
  }
}
