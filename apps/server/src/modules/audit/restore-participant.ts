import { sql } from 'drizzle-orm';
import { CommandDefect, tablesOf, type RestoreCommandStep, type RestoreParticipant } from '../../kernel/index.js';
import { recordChange } from './commands/record.js';
import * as auditTables from './db/schema.js';

/**
 * Audit's last after-restore step (backup-and-restore 4.2 step 7, 5.4, 10.1; PRD-SEC-007, PRD-SEC-018; S1-F14-T03):
 * once every other step and check has run and is kept as a `kernel.recovery_event`, each outcome is recorded as an
 * audit record of that event under the restore's internal service identity, with its check, result and counts. The
 * seal chain itself is checked with the other invariants, and against the manifest's seal, before this runs; the rows
 * this writes come after the last seal and are sealed by the sealing job after reopening.
 */
export const auditRestoreSteps: readonly RestoreCommandStep[] = [
  {
    kind: 'command',
    unit: 'audit',
    tier: 1,
    commandName: 'audit.record-restore',
    last: true,
    async run(context, run) {
      if (context.actor.kind !== 'actor') throw new CommandDefect('The restore records its steps as its identity');
      for (const result of run.recorded) {
        await recordChange(context, {
          actor: { kind: 'service-identity', id: context.actor.actorId },
          record: { module: 'kernel', type: 'recovery_event', id: result.eventId },
          operation: result.kind === 'step' ? 'restore-step' : 'restore-check',
          changes: [
            { kind: 'value', field: 'unit', before: null, after: result.unit },
            { kind: 'value', field: 'check', before: null, after: result.check },
            { kind: 'value', field: 'passed', before: null, after: result.passed },
            { kind: 'value', field: 'checked', before: null, after: result.checked },
            { kind: 'value', field: 'failed', before: null, after: result.failed },
          ],
          source: { kind: 'operator-command', reference: run.restoreId },
        });
      }
      return [
        {
          check: 'every step and check recorded as an audit record',
          passed: true,
          checked: run.recorded.length,
          failed: 0,
        },
      ];
    },
  },
];

/**
 * Audit's part in backup and restore (backup-and-restore 3.2 step 3, 5.4, 10.1, 10.2; PRD-SEC-007): the totals of its
 * tables, the latest seal read in the backup's snapshot, and its own invariant, that the seal chain verifies
 * (`audit.check_seals`, numbering-and-audit 4.4). An audit or access record names records of every kind by type and
 * identifier, including ones no table holds, such as a sign-in attempt; the seal chain proves those rows, so they are
 * not checked as references (backup-and-restore 5.1 "As built").
 */
export const auditRestoreParticipant: RestoreParticipant = {
  unit: 'audit',
  tier: 1,
  tables: tablesOf(auditTables),
  notReferences: {
    'audit.audit_record.actor_id': 'a user or a service identity',
  },
  async latestSeal(context) {
    const rows = await context.tx.execute<{ block_number: string; hash: string }>(
      sql`select block_number::text, hash from audit.audit_seal order by block_number desc limit 1`,
    );
    const row = rows.rows[0];
    return row === undefined ? null : { blockNumber: row.block_number, hash: row.hash };
  },
  async invariants(context) {
    const rows = await context.tx.execute<{ blocks: string; problems: string }>(
      sql`select (select count(*) from audit.audit_seal)::text as blocks,
                 (select count(*) from audit.check_seals())::text as problems`,
    );
    const row = rows.rows[0];
    const problems = Number(row?.problems ?? 0);
    return [
      {
        check: 'audit seal chain verifies',
        passed: problems === 0,
        checked: Number(row?.blocks ?? 0),
        failed: problems,
      },
    ];
  },
};
