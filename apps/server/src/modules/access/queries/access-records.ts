import type {
  AssignmentList,
  AssignmentRecord,
  FieldClass,
  Permission,
  PermissionAction,
  PersonaId,
  ReasonList,
  RoleList,
  UserList,
} from '@apparel-os/schemas';
import { asc, desc, inArray, sql, type AnyColumn } from 'drizzle-orm';
import { businessDateIn, CommandDefect, type TransactionContext } from '../../../kernel/index.js';
import {
  appUser,
  appUserVersion,
  approvalReason,
  approvalReasonVersion,
  approvalRequest,
  personaHeld,
  role,
  roleAssignment,
  roleAssignmentWithdrawal,
  roleAssignmentWithdrawalVersion,
  roleVersion,
  serviceIdentity,
} from '../db/schema.js';
import { recordState } from '../domain/record-state.js';
import { permissionsOf, scopesOf } from './assignments.js';

// The reads behind the access setup screens (access-and-approvals 2.1, 4, 5, 9.5, 14; S1-F01-T16; RR-326): every
// user, role, role assignment and reason with each version's state (design-language 7; DEC-105, DEC-117). The
// route's Authorise on the type has run before; these records carry no scope fact (5.3). Only access reads these
// tables (code-house-rules 6.3).

type RequestState = 'Awaiting approval' | 'Approved' | 'Rejected' | 'Superseded' | 'Withdrawn';
type LatestRequests = ReadonlyMap<string, { id: string; state: RequestState }>;

/** The first day of a dated row, and the day after its last, or null while open-ended (code-house-rules 7.3). */
const startOf = (range: AnyColumn) => sql<string>`lower(${range})::text`;
const endOf = (range: AnyColumn) => sql<string | null>`upper(${range})::text`;

/** The latest approval request of each document version named (access-and-approvals 9.1, 9.6). */
async function latestRequests(context: TransactionContext, versionIds: readonly string[]): Promise<LatestRequests> {
  const latest = new Map<string, { id: string; state: RequestState }>();
  if (versionIds.length === 0) return latest;
  const rows = await context.tx
    .select({ id: approvalRequest.id, versionId: approvalRequest.documentVersionId, state: approvalRequest.state })
    .from(approvalRequest)
    .where(inArray(approvalRequest.documentVersionId, [...versionIds]))
    .orderBy(desc(approvalRequest.recordedAt), desc(approvalRequest.id));
  for (const row of rows) {
    if (!latest.has(row.versionId)) latest.set(row.versionId, { id: row.id, state: row.state as RequestState });
  }
  return latest;
}

/** The fields every version shows: dates, state and latest request. */
function versionView(
  row: { id: string; decision: string; start: string; end: string | null },
  today: string,
  requests: LatestRequests,
  withdrawn = false,
) {
  const request = requests.get(row.id);
  return {
    id: row.id,
    validFrom: row.start,
    ...(row.end === null ? {} : { validTo: row.end }),
    state: recordState({
      decision: row.decision,
      start: row.start,
      end: row.end ?? undefined,
      today,
      requestState: request?.state,
      withdrawn,
    }),
    ...(request === undefined ? {} : { request }),
  };
}

/** The instants of a row dated by instants, as ISO 8601 in UTC, which compare as text (code-house-rules 7.3, 9). */
const instantOf = (bound: 'lower' | 'upper', range: AnyColumn) =>
  sql<string | null>`to_char(${sql.raw(bound)}(${range}) at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`;

/**
 * Every user, by login, each with every version, newest first (access-and-approvals 2.1; RR-214). User versions are
 * dated by instants (9.5; DEC-118): each version's state is worked out at the instant of the read, and its dates are
 * the business days of its instants under the Organisation's timezone, so a version approved and replaced the same
 * day shows that day as both (code-house-rules 9; PRD-MOD-017).
 */
export async function listUsers(context: TransactionContext, today: string): Promise<UserList> {
  const date = await context.businessDate();
  if (date.kind === 'not-set') throw new CommandDefect('Users are listed only once today is known');
  const dayOf = (instant: string) => businessDateIn(new Date(instant), date.timezone);
  const users = await context.tx.select().from(appUser).orderBy(asc(appUser.login));
  const rows = await context.tx
    .select({
      id: appUserVersion.id,
      userId: appUserVersion.appUserId,
      displayName: appUserVersion.displayName,
      state: appUserVersion.state,
      decision: appUserVersion.decision,
      startsAt: instantOf('lower', appUserVersion.validDuring),
      endsAt: instantOf('upper', appUserVersion.validDuring),
    })
    .from(appUserVersion)
    .orderBy(desc(appUserVersion.recordedAt), desc(appUserVersion.id));
  const now = context.startedAt.toISOString();
  const versions = rows.map((row) => {
    if (row.startsAt === null) throw new CommandDefect('A user version has no start (code-house-rules 7.3)');
    return {
      ...row,
      startsAt: row.startsAt,
      start: dayOf(row.startsAt),
      end: row.endsAt === null ? null : dayOf(row.endsAt),
    };
  });
  const versionIds = versions.map((version) => version.id);
  const personas =
    versionIds.length === 0
      ? []
      : await context.tx
          .select()
          .from(personaHeld)
          .where(inArray(personaHeld.appUserVersionId, versionIds))
          .orderBy(asc(personaHeld.position));
  const requests = await latestRequests(context, versionIds);
  return {
    asOf: context.startedAt.toISOString(),
    users: users.map((user) => ({
      id: user.id,
      login: user.login,
      versions: versions
        .filter((version) => version.userId === user.id)
        .map((version) => ({
          ...versionView(version, today, requests),
          state: recordState({
            decision: version.decision,
            start: version.startsAt,
            end: version.endsAt ?? undefined,
            today: now,
            requestState: requests.get(version.id)?.state,
          }),
          displayName: version.displayName,
          personas: personas
            .filter((each) => each.appUserVersionId === version.id)
            .map((each) => each.persona as PersonaId),
          userState: version.state as 'Active' | 'Disabled' | 'Ended',
        })),
    })),
  };
}

/** Every role, by code, each version with its explicit permissions, newest first (access-and-approvals 4.1, 4.2). */
export async function listRoles(context: TransactionContext, today: string): Promise<RoleList> {
  const roles = await context.tx.select().from(role).orderBy(asc(role.code));
  const versions = await context.tx
    .select({
      id: roleVersion.id,
      roleId: roleVersion.roleId,
      name: roleVersion.name,
      decision: roleVersion.decision,
      start: startOf(roleVersion.validDuring),
      end: endOf(roleVersion.validDuring),
    })
    .from(roleVersion)
    .orderBy(desc(roleVersion.recordedAt), desc(roleVersion.id));
  const versionIds = versions.map((version) => version.id);
  const permissions = await permissionsOf(context, versionIds);
  const requests = await latestRequests(context, versionIds);
  return {
    asOf: context.startedAt.toISOString(),
    roles: roles.map((each) => ({
      id: each.id,
      code: each.code,
      selfService: each.selfService,
      versions: versions
        .filter((version) => version.roleId === each.id)
        .map((version) => ({
          ...versionView(version, today, requests),
          name: version.name,
          permissions: (permissions.get(version.id) ?? []).map((stored): Permission =>
            stored.kind === 'action'
              ? {
                  kind: 'action',
                  recordType: stored.recordType,
                  action: stored.action as PermissionAction,
                  selfService: each.selfService,
                }
              : {
                  kind: 'field-class',
                  fieldClass: stored.fieldClass as FieldClass,
                  access: stored.fieldAccess as 'view' | 'view-and-edit',
                  selfService: each.selfService,
                },
          ),
        })),
    })),
  };
}

/**
 * Every role assignment, newest first, with its actor's name (the display name of the user's latest version, or the
 * service identity's code), its role's code, its scope and its withdrawal (access-and-approvals 4.3, 5.1).
 */
export async function listAssignments(context: TransactionContext, today: string): Promise<AssignmentList> {
  const rows = await context.tx
    .select({
      id: roleAssignment.id,
      userId: roleAssignment.appUserId,
      serviceIdentityId: roleAssignment.serviceIdentityId,
      roleId: roleAssignment.roleId,
      roleCode: role.code,
      decision: roleAssignment.decision,
      withdrawalId: roleAssignment.withdrawalId,
      start: startOf(roleAssignment.validDuring),
      end: endOf(roleAssignment.validDuring),
    })
    .from(roleAssignment)
    .innerJoin(role, sql`${role.id} = ${roleAssignment.roleId}`)
    .orderBy(desc(roleAssignment.recordedAt), desc(roleAssignment.id));
  const ids = rows.map((row) => row.id);
  const scopes = await scopesOf(context, ids);
  const names = await userNames(context);
  const identities = new Map(
    (await context.tx.select({ id: serviceIdentity.id, code: serviceIdentity.code }).from(serviceIdentity)).map(
      (row) => [row.id, row.code],
    ),
  );
  const withdrawals =
    ids.length === 0
      ? []
      : await context.tx
          .select({
            id: roleAssignmentWithdrawal.id,
            assignmentId: roleAssignmentWithdrawal.roleAssignmentId,
            versionId: roleAssignmentWithdrawalVersion.id,
            reason: roleAssignmentWithdrawalVersion.reason,
            decision: roleAssignmentWithdrawalVersion.decision,
          })
          .from(roleAssignmentWithdrawal)
          .innerJoin(
            roleAssignmentWithdrawalVersion,
            sql`${roleAssignmentWithdrawalVersion.withdrawalId} = ${roleAssignmentWithdrawal.id}`,
          )
          .where(inArray(roleAssignmentWithdrawal.roleAssignmentId, ids))
          .orderBy(desc(roleAssignmentWithdrawalVersion.recordedAt), desc(roleAssignmentWithdrawalVersion.id));
  const requests = await latestRequests(context, [...ids, ...withdrawals.map((each) => each.versionId)]);
  return {
    asOf: context.startedAt.toISOString(),
    assignments: rows.map((row): AssignmentRecord => {
      const scope = scopes.get(row.id);
      if (scope === undefined) throw new CommandDefect(`Role assignment ${row.id} has no scope`);
      const withdrawal = withdrawals.find((each) => each.assignmentId === row.id);
      let actor: AssignmentRecord['actor'];
      if (row.userId !== null) actor = { kind: 'user', userId: row.userId, name: names.get(row.userId) ?? null };
      else if (row.serviceIdentityId !== null) {
        actor = {
          kind: 'service-identity',
          serviceIdentityId: row.serviceIdentityId,
          code: identities.get(row.serviceIdentityId) ?? row.serviceIdentityId,
        };
      } else throw new CommandDefect(`Role assignment ${row.id} has no actor`);
      const withdrawalRequest = withdrawal === undefined ? undefined : requests.get(withdrawal.versionId);
      return {
        ...versionView(row, today, requests, row.decision === 'Approved' && row.withdrawalId !== null),
        actor,
        role: { id: row.roleId, code: row.roleCode },
        scope,
        ...(withdrawal === undefined
          ? {}
          : {
              withdrawal: {
                id: withdrawal.id,
                versionId: withdrawal.versionId,
                reason: withdrawal.reason,
                decision: withdrawal.decision as 'Awaiting approval' | 'Approved' | 'Rejected',
                ...(withdrawalRequest === undefined ? {} : { request: withdrawalRequest }),
              },
            }),
      };
    }),
  };
}

/** Each user's display name, from the latest version recorded. */
async function userNames(context: TransactionContext): Promise<Map<string, string>> {
  const rows = await context.tx
    .select({ userId: appUserVersion.appUserId, name: appUserVersion.displayName })
    .from(appUserVersion)
    .orderBy(asc(appUserVersion.recordedAt), asc(appUserVersion.id));
  return new Map(rows.map((row) => [row.userId, row.name]));
}

/** Every approve and reject reason, by code, with every version, newest first (access-and-approvals 9.5). */
export async function listReasons(context: TransactionContext, today: string): Promise<ReasonList> {
  const reasons = await context.tx.select().from(approvalReason).orderBy(asc(approvalReason.code));
  const versions = await context.tx
    .select({
      id: approvalReasonVersion.id,
      reasonId: approvalReasonVersion.approvalReasonId,
      text: approvalReasonVersion.text,
      decision: approvalReasonVersion.decision,
      start: startOf(approvalReasonVersion.validDuring),
      end: endOf(approvalReasonVersion.validDuring),
    })
    .from(approvalReasonVersion)
    .orderBy(desc(approvalReasonVersion.recordedAt), desc(approvalReasonVersion.id));
  const requests = await latestRequests(
    context,
    versions.map((version) => version.id),
  );
  return {
    asOf: context.startedAt.toISOString(),
    reasons: reasons.map((reason) => ({
      id: reason.id,
      code: reason.code,
      kind: reason.kind as 'approve' | 'reject',
      versions: versions
        .filter((version) => version.reasonId === reason.id)
        .map((version) => ({ ...versionView(version, today, requests), text: version.text })),
    })),
  };
}
