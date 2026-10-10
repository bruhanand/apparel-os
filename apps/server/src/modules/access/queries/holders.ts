import { permissionRegistry, registryByCode, type PermissionAction } from '@apparel-os/schemas';
import type { TransactionContext } from '../../../kernel/index.js';
import { scopeCovers, type RecordFacts } from '../domain/scope.js';
import { assignmentsInForce } from './assignments.js';
import { userInForce } from './users.js';

// Who holds a permission at a place: what the users-and-access readiness check asks of `access` (module-map 4.16;
// domain-model 3.6; PRD-LIF-002, PRD-ACS-006; DEC-116; S1-F04-T02). Only access code reads its tables.

const declared = registryByCode(permissionRegistry);

/**
 * The people, by identifier, who hold the action on the record type today, under the Organisation's timezone, through
 * one Approved, not withdrawn role assignment in force whose scope covers the record's facts as its type declares them
 * (access-and-approvals 4.3, 5.3; PRD-ACS-004): each assignment on its own. Only Active users: a service identity is no
 * person (PRD-SEC-018). With today not known, or the type or action not declared, nobody does.
 */
export async function permissionHolders(
  context: TransactionContext,
  need: { readonly action: PermissionAction; readonly recordType: string },
  facts: RecordFacts,
): Promise<string[]> {
  const today = await context.businessDate();
  if (today.kind === 'not-set') return [];
  const declaration = declared.get(need.recordType);
  if (declaration?.actions.includes(need.action) !== true) return [];
  const holders = new Set<string>();
  for (const assignment of await assignmentsInForce(context, today.date)) {
    if (holders.has(assignment.actorId)) continue;
    const grants = assignment.permissions.some(
      (permission) =>
        permission.kind === 'action' && permission.recordType === need.recordType && permission.action === need.action,
    );
    if (!grants || !scopeCovers(assignment.scope, declaration, assignment.actorId, facts).covered) continue;
    if ((await userInForce(context, assignment.actorId))?.state === 'Active') holders.add(assignment.actorId);
  }
  return [...holders].sort();
}
