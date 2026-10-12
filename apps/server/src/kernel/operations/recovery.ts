import { uuidv7 } from '@apparel-os/domain';
import { and, asc, desc, eq } from 'drizzle-orm';
import { CommandDefect } from '../command-runner/command-errors.js';
import { lockTable, type LockTarget } from '../command-runner/lock-helper.js';
import type { TransactionContext } from '../command-runner/transaction-context.js';
import { recoveryEvent, recoveryHold } from '../db/schema.js';
import { storedAfterRecoveryPoint } from './restore-contract.js';

// A restored Organisation's history and its hold, as `kernel`'s interface gives them to the module above that owns
// the recovery commands, `configuration` (backup-and-restore 4.3, section 11; GC9-8): read in the caller's transaction,
// and the hold lifted there, writing the `hold-lifted` event as the runtime role (section 11). The recovery items, the
// gaps and failed checks that must each be settled before reopening, and the rows that record an exception raised for
// one and its settlement, are kept here too, so `configuration` reads them without calling `exceptions` above it
// (4.3, 4.5, 5.1; product owner, 12 Oct 2026).

/** The name of the check that compares the control totals with the backup's (5.2): run once, by the restore. */
export const CONTROL_TOTALS_CHECK = 'control totals equal the backup';

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
  readonly kind: 'restored' | 'hold-placed' | 'step' | 'check' | 'gap' | 'gap-raised' | 'gap-settled' | 'hold-lifted';
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
  /** The check run of a step or check: 1 for the restore, one more for each run of the checks again. */
  readonly checkRun: number | null;
  /** The gap or failure a raised exception or a settlement is about. */
  readonly aboutEventId: string | null;
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

/**
 * One thing a restore found that must be settled before reopening (4.3, 4.5, 5.1; product owner, 12 Oct 2026): a gap
 * found after the recovery point, such as an object stored with no record, which may be evidence of lost work; or a
 * failed step or check. Each is settled by an exception raised for it, once its exception-code series is reconciled,
 * and then resolved or accepted; a failed check is settled too when the checks run again and it passes.
 */
export interface RecoveryItem {
  readonly eventId: string;
  readonly kind: 'gap' | 'failure';
  readonly unit: string;
  readonly name: string;
  readonly subject: string | null;
  readonly subjectAt: Date | null;
  /** The exception raised for it, once raised. */
  readonly exceptionId: string | null;
  /** How its exception was settled, once settled. */
  readonly settlement: 'resolved' | 'accepted' | null;
}

/**
 * The recovery items of one restore (4.3, 4.5, 5.1): every gap after the recovery point (one before it was stored by a
 * transaction that rolled back, and is listed and kept, 3.3); every failed step, in any run; every failed comparison of
 * the control totals, which the restore alone runs; and every failed check of the latest check run, since a later run
 * of the checks replaces the earlier ones. Each with the exception raised for it and its settlement, where there are.
 */
export async function recoveryItemsOf(context: TransactionContext, restoreId: string): Promise<RecoveryItem[]> {
  const events = await recoveryEventsOf(context, restoreId);
  const restored = events.find((event) => event.kind === 'restored');
  const recoveryPoint = restored?.recoveryPoint ?? restored?.occurredAt;
  const latestRun = Math.max(
    1,
    ...events.flatMap((event) => (event.kind === 'check' && event.checkRun !== null ? [event.checkRun] : [])),
  );
  const raised = new Map(
    events.flatMap((event) =>
      event.kind === 'gap-raised' && event.aboutEventId !== null ? [[event.aboutEventId, event.subject]] : [],
    ),
  );
  const settled = new Map(
    events.flatMap((event) =>
      event.kind === 'gap-settled' && event.aboutEventId !== null ? [[event.aboutEventId, event.name]] : [],
    ),
  );
  const items: RecoveryItem[] = [];
  for (const event of events) {
    const gap =
      event.kind === 'gap' && recoveryPoint !== undefined && storedAfterRecoveryPoint(event.subjectAt, recoveryPoint);
    const failure =
      event.passed === false &&
      (event.kind === 'step' ||
        (event.kind === 'check' && (event.name === CONTROL_TOTALS_CHECK || event.checkRun === latestRun)));
    if (!gap && !failure) continue;
    const settlement = settled.get(event.id);
    items.push({
      eventId: event.id,
      kind: gap ? 'gap' : 'failure',
      unit: event.unit ?? '',
      name: event.name ?? '',
      subject: event.subject,
      subjectAt: event.subjectAt,
      exceptionId: raised.get(event.id) ?? null,
      settlement: settlement === 'resolved' || settlement === 'accepted' ? settlement : null,
    });
  }
  return items;
}

/** One recovery event by its identifier, of any restore. */
export async function recoveryEventOf(
  context: TransactionContext,
  eventId: string,
): Promise<RecoveryEventRead | undefined> {
  const rows = await context.tx.select().from(recoveryEvent).where(eq(recoveryEvent.id, eventId));
  return rows[0] === undefined ? undefined : readOf(rows[0]);
}

/** How a recovery item was settled, resolved or accepted, or undefined while it is not (4.5). */
export async function recoverySettlementOf(
  context: TransactionContext,
  aboutEventId: string,
): Promise<'resolved' | 'accepted' | undefined> {
  const rows = await context.tx
    .select({ name: recoveryEvent.name })
    .from(recoveryEvent)
    .where(and(eq(recoveryEvent.kind, 'gap-settled'), eq(recoveryEvent.aboutEventId, aboutEventId)));
  const name = rows[0]?.name;
  return name === 'resolved' || name === 'accepted' ? name : undefined;
}

/**
 * Records that an exception was raised for a recovery item (4.5), in the raising command's transaction, as the actor
 * that raised it: the restore's internal service identity.
 */
export async function recordGapRaised(
  context: TransactionContext,
  item: { readonly restoreId: string; readonly aboutEventId: string; readonly exceptionId: string },
): Promise<void> {
  if (context.actor.kind !== 'actor') throw new CommandDefect('An exception is raised for a recovery item by an actor');
  await context.tx
    .insert(recoveryEvent)
    .values({
      id: uuidv7(),
      restoreId: item.restoreId,
      kind: 'gap-raised',
      subject: item.exceptionId,
      aboutEventId: item.aboutEventId,
      actorId: context.actor.actorId,
      occurredAt: context.startedAt,
    })
    .onConflictDoNothing();
}

/**
 * Records that the exception raised for a recovery item was settled, resolved or accepted, by the person who settled
 * it, in that command's transaction (4.3, 4.5).
 */
export async function recordGapSettled(
  context: TransactionContext,
  item: {
    readonly restoreId: string;
    readonly aboutEventId: string;
    readonly exceptionId: string;
    readonly settlement: 'resolved' | 'accepted';
    readonly byUserId: string;
    readonly roleAssignmentId: string | null;
  },
): Promise<void> {
  await context.tx.insert(recoveryEvent).values({
    id: uuidv7(),
    restoreId: item.restoreId,
    kind: 'gap-settled',
    name: item.settlement,
    subject: item.exceptionId,
    aboutEventId: item.aboutEventId,
    actorId: item.byUserId,
    roleAssignmentId: item.roleAssignmentId,
    occurredAt: context.startedAt,
  });
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
    checkRun: row.checkRun,
    aboutEventId: row.aboutEventId,
    occurredAt: row.occurredAt,
  };
}
