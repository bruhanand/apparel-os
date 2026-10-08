import {
  CommandDefect,
  LOCK_STEP,
  lockTable,
  type LockTarget,
  type TransactionContext,
} from '../../../kernel/index.js';

// The series row as a lock target (numbering-and-audit 3.2; code-house-rules 8.2 "Number series").

const SERIES = lockTable('numbering', 'series');

/**
 * The lock target of a series row (code-house-rules 8.2 "Number series"): the command passes it, with every other series
 * it draws from, to its one lock call at step 8 of stock-ledger 10.3, last, before its first write.
 */
export function seriesLockTarget(seriesId: string): LockTarget {
  return { table: SERIES, id: seriesId, mode: 'exclusive' };
}

/** Refuses, as a defect of the calling command, a series the transaction does not hold exclusively at step 8. */
export function requireHeld(context: TransactionContext, seriesId: string, operation: string): void {
  const held = context.heldLock(SERIES, seriesId);
  if (held?.step !== LOCK_STEP.numberSeries || held.mode !== 'exclusive') {
    throw new CommandDefect(
      `${operation} draws only on a series the command has locked exclusively at step 8 (numbering-and-audit 3.2; code-house-rules 8.2)`,
    );
  }
}
