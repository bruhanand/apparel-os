import { uuidv7 } from '@apparel-os/domain';
import { asc, desc, eq } from 'drizzle-orm';
import { CommandDefect } from '../command-runner/command-errors.js';
import { lockTable, type LockTarget } from '../command-runner/lock-helper.js';
import type { TransactionContext } from '../command-runner/transaction-context.js';
import { recoveryEvent, recoveryHold } from '../db/schema.js';

// A restored Organisation's history and its hold, as `kernel`'s interface gives them to the module above that owns
// the recovery commands, `configuration` (backup-and-restore 4.3, section 11; GC9-8): read in the caller's transaction,
// and the hold lifted there, writing the `hold-lifted` event as the runtime role (section 11).

const HOLD = lockTable('kernel', 'recovery_hold');

/** The hold on the Organisation, while there is one (4.3). */
export interface RecoveryHoldState {
  readonly holdId: string;
  readonly restoreId: string;
  readonly placedAt: Date;
}

/** One fact of a restore, as `kernel.recovery_event` keeps it: counts, names and identifiers only. */
export interface RecoveryEventRead {
  readonly id: string;
  readonly restoreId: string;
  readonly kind: 'restored' | 'hold-placed' | 'step' | 'check' | 'gap' | 'hold-lifted';
  readonly backupId: string | null;
  readonly recoveryPoint: Date | null;
  readonly unit: string | null;
  readonly name: string | null;
  readonly passed: boolean | null;
  readonly checked: number | null;
  readonly failed: number | null;
  readonly subject: string | null;
  readonly subjectAt: Date | null;
  readonly actorId: string | null;
  readonly occurredAt: Date;
}

/** The hold, or undefined when the Organisation is not held. */
export async function recoveryHoldOf(context: TransactionContext): Promise<RecoveryHoldState | undefined> {
  const rows = await context.tx.select().from(recoveryHold);
  const row = rows[0];
  return row === undefined ? undefined : { holdId: row.id, restoreId: row.restoreId, placedAt: row.placedAt };
}

/** The hold row as a lock target, for the reopen command's lock at its document step (code-house-rules 8.2). */
export function recoveryHoldLockTarget(holdId: string): LockTarget {
  return { table: HOLD, id: holdId, mode: 'exclusive' };
}

/** The facts of one restore, in the order they happened. */
export async function recoveryEventsOf(context: TransactionContext, restoreId: string): Promise<RecoveryEventRead[]> {
  const rows = await context.tx
    .select()
    .from(recoveryEvent)
    .where(eq(recoveryEvent.restoreId, restoreId))
    .orderBy(asc(recoveryEvent.occurredAt), asc(recoveryEvent.id));
  return rows.map(readOf);
}

/** The latest restore of the Organisation: its `restored` fact, or undefined when it was never restored. */
export async function latestRestoreOf(context: TransactionContext): Promise<RecoveryEventRead | undefined> {
  const rows = await context.tx
    .select()
    .from(recoveryEvent)
    .where(eq(recoveryEvent.kind, 'restored'))
    .orderBy(desc(recoveryEvent.occurredAt), desc(recoveryEvent.id))
    .limit(1);
  return rows[0] === undefined ? undefined : readOf(rows[0]);
}

/**
 * Lifts the hold (4.3): on a hold the command holds exclusively, deletes it and appends the `hold-lifted` event naming
 * who reopened, through which assignment, at the command's start, which ends the measured recovery time (section 6).
 */
export async function liftRecoveryHold(
  context: TransactionContext,
  hold: RecoveryHoldState,
  by: { readonly userId: string; readonly roleAssignmentId: string },
): Promise<string> {
  const held = context.heldLock(HOLD, hold.holdId);
  if (held?.mode !== 'exclusive') throw new CommandDefect('The hold is lifted only by a command that holds it');
  await context.tx.delete(recoveryHold).where(eq(recoveryHold.id, hold.holdId));
  const id = uuidv7();
  await context.tx.insert(recoveryEvent).values({
    id,
    restoreId: hold.restoreId,
    kind: 'hold-lifted',
    actorId: by.userId,
    roleAssignmentId: by.roleAssignmentId,
    occurredAt: context.startedAt,
  });
  return id;
}

function readOf(row: typeof recoveryEvent.$inferSelect): RecoveryEventRead {
  return {
    id: row.id,
    restoreId: row.restoreId,
    kind: row.kind as RecoveryEventRead['kind'],
    backupId: row.backupId,
    recoveryPoint: row.recoveryPoint,
    unit: row.unit,
    name: row.name,
    passed: row.passed,
    checked: row.checked,
    failed: row.failed,
    subject: row.subject,
    subjectAt: row.subjectAt,
    actorId: row.actorId,
    occurredAt: row.occurredAt,
  };
}
