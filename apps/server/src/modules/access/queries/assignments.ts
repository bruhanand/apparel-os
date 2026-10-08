import type { AssignmentScope, PlaceType } from '@apparel-os/schemas';
import { and, asc, eq, inArray, sql, type SQL } from 'drizzle-orm';
import { CommandDefect, type TransactionContext } from '../../../kernel/index.js';
import { assignmentScope, assignmentScopeMember, roleAssignment, rolePermission, roleVersion } from '../db/schema.js';
import type { AssignmentInForce, StoredPermission } from '../domain/scope.js';

// Reading role assignments and their roles (access-and-approvals 4.2, 4.3, 5.1; code-house-rules 7.3). Only access
// code reads these tables (code-house-rules 6.3).

type DimensionKind = 'all' | 'selected' | 'empty';

/** The scope of each assignment, from its scope rows: none is own-record scope (access-and-approvals 5.1). */
export async function scopesOf(
  context: TransactionContext,
  assignmentIds: readonly string[],
): Promise<Map<string, AssignmentScope>> {
  const scopes = new Map<string, AssignmentScope>();
  if (assignmentIds.length === 0) return scopes;
  const rows = await context.tx
    .select()
    .from(assignmentScope)
    .where(inArray(assignmentScope.roleAssignmentId, [...assignmentIds]));
  const members =
    rows.length === 0
      ? []
      : await context.tx
          .select()
          .from(assignmentScopeMember)
          .where(
            inArray(
              assignmentScopeMember.assignmentScopeId,
              rows.map((row) => row.id),
            ),
          );
  for (const id of assignmentIds) {
    const own = rows.filter((row) => row.roleAssignmentId === id);
    if (own.length === 0) {
      scopes.set(id, { kind: 'own-records' });
      continue;
    }
    const dimension = <Member>(name: string, member: (row: (typeof members)[number]) => Member) => {
      const row = own.find((each) => each.dimension === name);
      if (row === undefined) throw new CommandDefect(`Role assignment ${id} has no ${name} scope row`);
      const kind = row.kind as DimensionKind;
      if (kind !== 'selected') return { kind };
      return {
        kind,
        members: members.filter((each) => each.assignmentScopeId === row.id).map(member),
      };
    };
    scopes.set(id, {
      kind: 'dimensions',
      legalEntity: dimension('legal-entity', (row) => row.memberId),
      place: dimension('place', (row) => ({
        type: row.memberType as PlaceType,
        id: row.memberId,
      })),
      brand: dimension('brand', (row) => row.memberId),
    });
  }
  return scopes;
}

/** The permissions of each role version (access-and-approvals 4.1). */
export async function permissionsOf(
  context: TransactionContext,
  versionIds: readonly string[],
): Promise<Map<string, StoredPermission[]>> {
  const byVersion = new Map<string, StoredPermission[]>();
  if (versionIds.length === 0) return byVersion;
  const rows = await context.tx
    .select()
    .from(rolePermission)
    .where(inArray(rolePermission.roleVersionId, [...versionIds]))
    .orderBy(asc(rolePermission.id));
  for (const row of rows) {
    const list = byVersion.get(row.roleVersionId) ?? [];
    list.push(
      row.kind === 'action'
        ? { kind: 'action', recordType: row.recordType ?? '', action: row.action ?? '' }
        : { kind: 'field-class', fieldClass: row.fieldClass ?? '', fieldAccess: row.fieldAccess ?? '' },
    );
    byVersion.set(row.roleVersionId, list);
  }
  return byVersion;
}

/**
 * The assignments in force on a business date (access-and-approvals 4.3, 7.1 step 3, 7.2): Approved, not withdrawn,
 * the date in their dates, with their role's Approved version in force on the date and its permissions. A withdrawn
 * assignment is never in force (code-house-rules 7.3). Of one actor, or of every actor when `actorId` is left out.
 * Read from the assignments and role versions themselves, never from the effective grants, so validity never waits for
 * the grants rebuild (DEC-120).
 */
export async function assignmentsInForce(
  context: TransactionContext,
  businessDate: string,
  actorId?: string,
): Promise<AssignmentInForce[]> {
  const dated = await datedAssignments(context, {
    version: sql`${roleVersion.validDuring} @> ${businessDate}::date`,
    assignment: sql`${roleAssignment.validDuring} @> ${businessDate}::date`,
    actorId,
  });
  return dated.map(({ assignmentId, actorId: actor, scope, permissions }) => ({
    assignmentId,
    actorId: actor,
    scope,
    permissions,
  }));
}

/** An assignment with one Approved version of its role, and the business days both hold (access-and-approvals 7.2). */
export interface DatedAssignment extends AssignmentInForce {
  readonly roleVersionId: string;
  /** The intersection of the assignment's and the role version's dates, `[start, end)` in PostgreSQL's text form. */
  readonly validDuring: string;
}

/**
 * Every assignment with each Approved version of its role whose dates meet the assignment's and still hold on the
 * business date or later (access-and-approvals 7.2; DEC-120): what the effective grants keep, so that row-level
 * security checks the dates against today when it reads them. Approved and not withdrawn (code-house-rules 7.3).
 */
export async function assignmentsInForceOrLater(
  context: TransactionContext,
  businessDate: string,
): Promise<DatedAssignment[]> {
  const both = sql`(${roleAssignment.validDuring} * ${roleVersion.validDuring})`;
  return datedAssignments(context, {
    version: sql`${roleVersion.validDuring} && ${roleAssignment.validDuring}`,
    assignment: sql`(upper_inf(${both}) or upper(${both}) > ${businessDate}::date)`,
  });
}

async function datedAssignments(
  context: TransactionContext,
  where: { readonly version: SQL; readonly assignment: SQL; readonly actorId?: string | undefined },
): Promise<DatedAssignment[]> {
  const actor = sql<string>`coalesce(${roleAssignment.appUserId}, ${roleAssignment.serviceIdentityId})`;
  const rows = await context.tx
    .select({
      id: roleAssignment.id,
      actorId: actor,
      roleVersionId: roleVersion.id,
      validDuring: sql<string>`(${roleAssignment.validDuring} * ${roleVersion.validDuring})::text`,
    })
    .from(roleAssignment)
    .innerJoin(
      roleVersion,
      and(eq(roleVersion.roleId, roleAssignment.roleId), eq(roleVersion.decision, 'Approved'), where.version),
    )
    .where(
      and(
        eq(roleAssignment.decision, 'Approved'),
        sql`${roleAssignment.withdrawalId} is null`,
        where.assignment,
        where.actorId === undefined ? undefined : sql`${actor} = ${where.actorId}::uuid`,
      ),
    )
    .orderBy(asc(roleAssignment.id), asc(roleVersion.id));
  const scopes = await scopesOf(context, [...new Set(rows.map((row) => row.id))]);
  const permissions = await permissionsOf(context, [...new Set(rows.map((row) => row.roleVersionId))]);
  return rows.map((row) => {
    const scope = scopes.get(row.id);
    if (scope === undefined) throw new CommandDefect(`Role assignment ${row.id} has no scope`);
    return {
      assignmentId: row.id,
      actorId: row.actorId,
      scope,
      permissions: permissions.get(row.roleVersionId) ?? [],
      roleVersionId: row.roleVersionId,
      validDuring: row.validDuring,
    };
  });
}

/** Every actor with an Approved assignment, or with an effective grant now: the actors a full rebuild covers. */
export async function actorsWithAssignments(context: TransactionContext): Promise<string[]> {
  const rows = await context.tx.execute<{ actor_id: string }>(
    sql`select distinct coalesce(app_user_id, service_identity_id) as actor_id from access.role_assignment
        where decision = 'Approved'
        union select actor_id from access.effective_grant order by 1`,
  );
  return rows.rows.map((row) => row.actor_id);
}
