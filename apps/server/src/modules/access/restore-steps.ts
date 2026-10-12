import { permissionRegistry, registryByCode, type FieldClass, type RecordTypeDeclaration } from '@apparel-os/schemas';
import { sql } from 'drizzle-orm';
import { CommandDefect, type RestoreCommandStep } from '../../kernel/index.js';
import type { AuditInterface } from '../audit/index.js';
import { revokeSessions } from './commands/sessions.js';
import type { RecordFacts } from './domain/scope.js';
import { syntheticReaderCheck } from './queries/authorise.js';

/**
 * Access's after-restore step (backup-and-restore 4.2 step 7, 4.4, 10.2; PRD-SEC-001, PRD-SEC-008; S1-F14-T03): a
 * restore can bring back a session that was ended or revoked after the recovery point, so every session of the
 * restored Organisation is ended, with an audit record of each, and everyone signs in again with the second factor. It
 * runs under the restore's internal service identity, which holds edit on `access.session`, the permission that
 * revokes another user's sessions (access-and-approvals 3.3), and then checks that no session is in force.
 */
export function accessRestoreSteps(audit: AuditInterface): RestoreCommandStep[] {
  return [
    {
      kind: 'command',
      unit: 'access',
      tier: 1,
      commandName: 'access.end-sessions-after-restore',
      authorises: { action: 'edit', recordType: 'access.session' },
      async run(context) {
        if (context.actor.kind !== 'actor')
          throw new CommandDefect('The restore ends sessions as its service identity');
        const ended = await revokeSessions(
          context,
          audit,
          { actor: { kind: 'service-identity', id: context.actor.actorId } },
          { every: true },
          'end-session-after-restore',
        );
        const left = await context.tx.execute<{ n: string }>(
          sql`select count(*)::text as n from access.session where state in ('In force', 'Locked')`,
        );
        const inForce = Number(left.rows[0]?.n ?? 0);
        return [
          {
            check: 'every session ended after the restore',
            passed: inForce === 0,
            checked: (ended?.length ?? 0) + inForce,
            failed: inForce,
          },
        ];
      },
    },
  ];
}

/**
 * The reader check of an attachment after a restore (backup-and-restore 5.1 "Attachments"), against the declared
 * permission registry, or another a test gives: whether a synthetic reader authorised for the attached record is
 * allowed and one outside its scope refused, by Authorise's own rule, never writing a reader.
 */
export function attachmentReaderCheck(
  record: { readonly recordType: string; readonly facts: RecordFacts; readonly fieldClasses: readonly FieldClass[] },
  registry: readonly RecordTypeDeclaration[] = permissionRegistry,
): { readonly authorisedAllowed: boolean; readonly outsiderRefused: boolean } {
  return syntheticReaderCheck(registryByCode(registry), record);
}
