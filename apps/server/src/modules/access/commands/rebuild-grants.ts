import { uuidv7 } from '@apparel-os/domain';
import type { RecordTypeDeclaration } from '@apparel-os/schemas';
import { inArray } from 'drizzle-orm';
import { CommandDefect, type TransactionContext } from '../../../kernel/index.js';
import type { AuditInterface } from '../../audit/index.js';
import { effectiveGrant } from '../db/schema.js';
import { grantRowsOf } from '../domain/scope.js';
import { assignmentChanged } from '../events.js';
import { actorsWithAssignments, assignmentsInForce } from '../queries/assignments.js';

/**
 * Rebuilds the effective grants of the actors named, or of every actor that has an Approved assignment or a grant
 * now (access-and-approvals 7.2): deletes their rows and writes those of their assignments in force today under the
 * Organisation's timezone, so a start or end date that passed takes effect and a withdrawn or ended assignment grants
 * nothing (PRD-ACS-005; code-house-rules 7.3). Returns how many rows it wrote.
 */
export async function rebuildGrants(
  context: TransactionContext,
  registry: ReadonlyMap<string, RecordTypeDeclaration>,
  actorIds?: readonly string[],
): Promise<number> {
  const date = await context.businessDate();
  if (date.kind === 'not-set') throw new CommandDefect('Effective grants are rebuilt only once today is known');
  const actors = actorIds === undefined ? await actorsWithAssignments(context) : [...new Set(actorIds)];
  if (actors.length === 0) return 0;
  await context.tx.delete(effectiveGrant).where(inArray(effectiveGrant.actorId, actors));
  const inForce = (await assignmentsInForce(context, date.date)).filter((assignment) =>
    actors.includes(assignment.actorId),
  );
  const rows = inForce.flatMap((assignment) => grantRowsOf(assignment, registry));
  if (rows.length > 0) {
    await context.tx.insert(effectiveGrant).values(rows.map((row) => ({ ...row, id: uuidv7(), asOf: date.date })));
  }
  return rows.length;
}

/** The grants of each assignment as comparable text: record type and actions, sorted (access-and-approvals 7.2). */
async function grantsByAssignment(
  context: TransactionContext,
): Promise<Map<string, { actorId: string; grants: string[] }>> {
  const rows = await context.tx
    .select({
      actorId: effectiveGrant.actorId,
      roleAssignmentId: effectiveGrant.roleAssignmentId,
      recordType: effectiveGrant.recordType,
      actions: effectiveGrant.actions,
    })
    .from(effectiveGrant);
  const byAssignment = new Map<string, { actorId: string; grants: string[] }>();
  for (const row of rows) {
    const entry = byAssignment.get(row.roleAssignmentId) ?? { actorId: row.actorId, grants: [] };
    entry.grants.push(`${row.recordType}:${[...row.actions].sort().join(',')}`);
    byAssignment.set(row.roleAssignmentId, entry);
  }
  for (const entry of byAssignment.values()) entry.grants.sort();
  return byAssignment;
}

/**
 * The scheduled rebuild as dates pass (access-and-approvals 7.2; spec section 9, "Date passes for a start or end";
 * PRD-ACS-005): rebuilds every actor's effective grants, then, for each role assignment whose grants changed, because
 * its own start or end date or its role version's passed, writes an audit record under the job's service identity
 * and an `access.assignment-changed` outbox row naming its actor (module-map section 8; PRD-MOD-006), in the same
 * transaction. A run that changes nothing writes nothing else. Returns the rows written and the assignments changed.
 */
export async function rebuildGrantsAsDatesPass(
  context: TransactionContext,
  registry: ReadonlyMap<string, RecordTypeDeclaration>,
  audit: AuditInterface,
): Promise<{ rows: number; changedAssignments: number }> {
  if (context.actor.kind !== 'actor') throw new CommandDefect('A job step runs under its service identity');
  const jobIdentity = context.actor.actorId;
  const before = await grantsByAssignment(context);
  const rows = await rebuildGrants(context, registry);
  const after = await grantsByAssignment(context);
  const changed = [...new Set([...before.keys(), ...after.keys()])]
    .filter((id) => JSON.stringify(before.get(id)?.grants ?? []) !== JSON.stringify(after.get(id)?.grants ?? []))
    .sort();
  for (const assignmentId of changed) {
    const actorId = after.get(assignmentId)?.actorId ?? before.get(assignmentId)?.actorId;
    if (actorId === undefined) throw new CommandDefect('A changed assignment has no actor');
    await audit.record(context, {
      actor: { kind: 'service-identity', id: jobIdentity },
      record: { module: 'access', type: 'role_assignment', id: assignmentId },
      operation: 'rebuild-grants-date-passed',
      changes: [
        {
          kind: 'value',
          field: 'effectiveGrants',
          before: before.get(assignmentId)?.grants ?? [],
          after: after.get(assignmentId)?.grants ?? [],
        },
      ],
      source: { kind: 'job' },
    });
    await context.publish(assignmentChanged, {
      subject: { module: 'access', recordType: 'access.role_assignment', recordId: assignmentId },
      payload: { actorIds: [actorId] },
    });
  }
  return { rows, changedAssignments: changed.length };
}
