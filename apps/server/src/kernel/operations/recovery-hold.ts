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
 * The commands that run while the hold is on, besides every read, named one by one so that a new command never runs
 * while held by its name alone (4.3): `access`'s sign-in, credential, session and start-check commands, its changes of
 * users, roles, assignments, stand-ins, settings and limits and their approvals, so a revocation known from outside
 * evidence can be applied again before reopening (4.4; a decision on another module's document is refused by `access`
 * itself while held), and its operator commands; the recovery commands of `configuration` (GC9-8); settling a recovery
 * gap's exception (4.5); and the restore's own steps, which run under its internal service identity (4.2 step 7). A
 * test lists them (recovery-hold.test.ts).
 */
export const WHILE_HELD: ReadonlySet<string> = new Set([
  // access: sign-in, credentials and sessions (PRD-SEC-001, PRD-SEC-008); authenticating a request marks its session.
  'access.authenticate',
  'access.sign-in',
  'access.demo-sign-in',
  'access.start-enrolment',
  'access.confirm-enrolment',
  'access.change-password',
  'access.issue-device-challenge',
  'access.unlock-session',
  'access.sign-out',
  'access.revoke-own-sessions',
  'access.revoke-user-sessions',
  'access.reset-credential',
  'access.probe-session',
  'access.check-key-version',
  // access: changes of access and their approvals (4.4).
  'access.prepare-user',
  'access.prepare-user-version',
  'access.prepare-role',
  'access.prepare-role-version',
  'access.prepare-role-assignment',
  'access.prepare-assignment-withdrawal',
  'access.prepare-stand-in-grant',
  'access.prepare-security-setting-version',
  'access.prepare-approval-limit',
  'access.prepare-approval-reason',
  'access.prepare-approval-reason-version',
  'access.prepare-approval-rule-setting',
  'access.prepare-approval-rule-setting-version',
  'access.decide-approval',
  'access.decide-in-bulk',
  // access: operator commands (access-and-approvals 3.2, 9.11a).
  'access.recover-first-user',
  'access.add-service-identities',
  // The recovery commands (GC9-8) and settling a recovery gap's exception (4.5).
  'configuration.reconcile-series-after-restore',
  'configuration.record-recovery-validation',
  'configuration.reopen-after-restore',
  'exceptions.settle-recovery-gap',
  // The restore's own steps (4.2 step 7, 4.5).
  'access.end-sessions-after-restore',
  'numbering.pause-series-after-restore',
  'exceptions.raise-recovery-gap',
  'audit.record-restore',
]);

/** Each item of a bulk decision runs as a command of its own, named after its request (access-and-approvals 9.6). */
const BULK_DECISION_ITEM =
  /^access\.decide-in-bulk\.item-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Whether a command, by its name, may run while the Organisation is held (4.3). */
export function runsWhileHeld(commandName: string): boolean {
  return WHILE_HELD.has(commandName) || BULK_DECISION_ITEM.test(commandName);
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
