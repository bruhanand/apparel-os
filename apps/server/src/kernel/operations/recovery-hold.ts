import { sql } from 'drizzle-orm';
import type { Transaction } from '../command-runner/transaction-context.js';

// The recovery hold (backup-and-restore 4.3, 4.5; POL-18.03, POL-18.04; S1-F14-T03). A restored Organisation is held
// until Operations and Accounts have validated it and it is reopened: `kernel`'s command runner refuses every command
// except sign-in, session and access commands (revocations included, 4.4), reads, the recovery commands and the
// restore's own steps, naming the hold as the reason. Jobs and outbox delivery wait too: the worker serves no held
// Organisation (kernel/jobs/worker.ts). The hold is the one row of `kernel.recovery_hold`, placed by the restore
// command and lifted by the reopen command (section 11).

/** The refusal code of a command refused while the Organisation is held (code-house-rules 12.3). */
export const RECOVERY_HOLD_CODE = 'kernel.recovery-hold';

/**
 * The commands that run while the hold is on, besides every read: every command of `access` (sign-in, sessions,
 * credentials, devices, users, roles and assignments, and their approvals, so a revocation known from outside evidence
 * can be applied again before reopening, 4.4; a decision on another module's document is refused by `access` itself
 * while held), the three recovery commands of `configuration` (GC9-8) and the restore's own steps, which run under
 * the restore's internal service identity (4.2 step 7).
 */
const WHILE_HELD_PREFIXES = ['access.'] as const;
const WHILE_HELD_NAMES: ReadonlySet<string> = new Set([
  'configuration.reconcile-series-after-restore',
  'configuration.record-recovery-validation',
  'configuration.reopen-after-restore',
  'numbering.pause-series-after-restore',
  'audit.record-restore',
]);

/** Whether a command, by its name, may run while the Organisation is held (4.3). */
export function runsWhileHeld(commandName: string): boolean {
  return WHILE_HELD_NAMES.has(commandName) || WHILE_HELD_PREFIXES.some((prefix) => commandName.startsWith(prefix));
}

/** Whether the Organisation whose database the transaction is in is held, read in that transaction. */
export async function isRecoveryHeld(tx: Pick<Transaction, 'execute'>): Promise<boolean> {
  const rows = await tx.execute<{ held: boolean }>(sql`select exists (select 1 from kernel.recovery_hold) as held`);
  return rows.rows[0]?.held === true;
}

/**
 * A command refused because the Organisation is held after a restore (4.3). Its kind and code are those of the error
 * envelope (code-house-rules 12.3): `unavailable`, `kernel.recovery-hold`. A job step refused by it is retried, so it
 * runs once the Organisation reopens (12.9).
 */
export class RecoveryHoldRefused extends Error {
  readonly kind = 'unavailable';
  readonly code = RECOVERY_HOLD_CODE;

  constructor(readonly commandName: string) {
    super(`Command ${commandName} was refused: the Organisation is held after a restore until it is reopened`);
    this.name = 'RecoveryHoldRefused';
  }
}
