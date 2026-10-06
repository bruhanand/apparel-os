import { uuidv7 } from '@apparel-os/domain';
import type {
  AssignmentScope,
  AssignmentWithdrawalDraft,
  Permission,
  RecordTypeDeclaration,
  RoleAssignmentDraft,
  RoleDraft,
  RoleVersionDraft,
} from '@apparel-os/schemas';
import { and, eq, sql } from 'drizzle-orm';
import {
  LOCK_STEP,
  lockTable,
  sqlStateOf,
  type CommandRefusal,
  type EventSubject,
  type LockTarget,
  type TransactionContext,
} from '../../../kernel/index.js';
import type { AuditActor, AuditInterface } from '../../audit/index.js';
import {
  appUser,
  assignmentScope,
  role,
  roleAssignment,
  roleAssignmentChange,
  roleAssignmentWithdrawal,
  roleAssignmentWithdrawalChange,
  roleAssignmentWithdrawalVersion,
  rolePermission,
  roleVersion,
  roleVersionChange,
  serviceIdentity,
} from '../db/schema.js';
import { scopeKeyOf } from '../domain/scope.js';
import { assignmentChanged } from '../events.js';
import { assignmentTarget } from './authority.js';
import { rebuildGrants } from './rebuild-grants.js';
import { requestApproval } from './request-approval.js';

// Roles, role assignments and their withdrawal (access-and-approvals 4, 5, 7.2, 9.11; code-house-rules 7.2, 7.3;
// S1-F01-T11, S1-F01-T13). Preparing saves a version and requests its approval in the same transaction (9.1); a
// different authorised person decides it (POL-02.07); the effects make an approved version take effect in the
// decision's transaction (module-map 6.2 flow A). Every operation joins the caller's transaction through its context
// (code-house-rules 8.1).

/** A command's own outcome: its answer, or a refusal it decides. */
export type Prepared<Answer> =
  | { readonly kind: 'success'; readonly answer: Answer }
  | { readonly kind: 'refusal'; readonly refusal: CommandRefusal };

/** The user preparing a change, and the assignment Authorise used (access-and-approvals 7.1 step 3, 9.1). */
export interface Preparer {
  readonly userId: string;
  readonly roleAssignmentId: string;
}

/**
 * Who makes a decided version take effect: the approver deciding it (S1-F01-T13), or the `setup` service identity
 * writing a new Organisation's first roles (9.11). The caller has checked who may decide (9.3); these effects do not.
 */
export interface Decider {
  readonly actor: AuditActor;
  readonly roleAssignmentId?: string;
  readonly approvalDecisionId?: string;
  /** The reason the decision gave, for the audit records of its effects (numbering-and-audit 4.2). */
  readonly reason?: string;
}

/**
 * How an effect runs. `locksHeld`: Decide has locked the effect's rows already, with its own rows, one call of the
 * lock helper per step (code-house-rules 8.2), so the effect takes no lock of its own. Otherwise it locks them itself:
 * the authority rows it changes at step 0, its own record rows at step 1.
 */
export interface EffectOptions {
  readonly locksHeld?: boolean;
}

const ROLE_VERSION = lockTable('access', 'role_version');
const WITHDRAWAL_VERSION = lockTable('access', 'role_assignment_withdrawal_version');
const EXCLUSION_VIOLATION = '23P01';

export function refusal<Answer>(
  kind: CommandRefusal['kind'],
  code: string,
  missing: CommandRefusal['missing'] = [],
): Prepared<Answer> {
  return { kind: 'refusal', refusal: { kind, code, missing } };
}

/** Today under the Organisation's timezone, or the refusal that says it is not set (code-house-rules 9). */
export async function today(context: TransactionContext): Promise<string | CommandRefusal> {
  const date = await context.businessDate();
  if (date.kind === 'set') return date.date;
  return {
    kind: 'unavailable',
    code: 'access.business-date-not-set',
    missing: [{ kind: 'setting', setting: 'configuration.timezone' }],
  };
}

/** The upper end of a half-open daterange in PostgreSQL's text form, or undefined when unbounded. */
export function rangeOf(validFrom: string, validTo: string | undefined): string {
  return `[${validFrom},${validTo ?? ''})`;
}

/** The locks of an effect run on its own: authority rows at step 0, record rows at step 1 (code-house-rules 8.2). */
export async function lockUnlessHeld(
  context: TransactionContext,
  options: EffectOptions,
  targets: { readonly authority?: readonly LockTarget[]; readonly document?: readonly LockTarget[] },
): Promise<void> {
  if (options.locksHeld === true) return;
  if ((targets.authority ?? []).length > 0) await context.lock(LOCK_STEP.authority, targets.authority ?? []);
  if ((targets.document ?? []).length > 0) await context.lock(LOCK_STEP.document, targets.document ?? []);
}

export class AccessChanges {
  constructor(
    private readonly audit: AuditInterface,
    private readonly registry: ReadonlyMap<string, RecordTypeDeclaration>,
  ) {}

  /**
   * Checks a role's permissions against the permission registry (access-and-approvals 4.1, 5.4): every action on a
   * declared record type that takes it, and a self-service action only on a type with a subject person
   * (PRD-ACS-022). Broad labels never reach here: the schema refuses them (POL-02.03).
   */
  private undeclared(permissions: readonly Permission[]): CommandRefusal | undefined {
    const missing = permissions.flatMap((permission) => {
      if (permission.kind !== 'action') return [];
      const declaration = this.registry.get(permission.recordType);
      const declared =
        declaration?.actions.includes(permission.action) === true && (!permission.selfService || declaration.subject);
      return declared ? [] : [{ kind: 'permission', recordType: permission.recordType, action: permission.action }];
    });
    return missing.length === 0 ? undefined : { kind: 'refused', code: 'access.permission-not-declared', missing };
  }

  private async writeRoleVersion(
    context: TransactionContext,
    preparer: Preparer,
    roleId: string,
    draft: RoleVersionDraft,
    operation: 'prepare-role' | 'prepare-role-version',
  ): Promise<{ versionId: string; requestId: string }> {
    const versionId = uuidv7();
    await context.tx.insert(roleVersion).values({
      id: versionId,
      roleId,
      name: draft.name,
      validDuring: rangeOf(draft.validFrom, undefined),
      decision: 'Awaiting approval',
    });
    if (draft.permissions.length > 0) {
      await context.tx.insert(rolePermission).values(
        draft.permissions.map((permission) =>
          permission.kind === 'action'
            ? {
                id: uuidv7(),
                roleVersionId: versionId,
                kind: 'action',
                recordType: permission.recordType,
                action: permission.action,
                fieldClass: null,
                fieldAccess: null,
              }
            : {
                id: uuidv7(),
                roleVersionId: versionId,
                kind: 'field-class',
                recordType: null,
                action: null,
                fieldClass: permission.fieldClass,
                fieldAccess: permission.access,
              },
        ),
      );
    }
    await context.tx
      .insert(roleVersionChange)
      .values({ id: uuidv7(), roleVersionId: versionId, changedByUserId: preparer.userId });
    await this.audit.record(context, {
      actor: { kind: 'user', id: preparer.userId },
      roleAssignmentId: preparer.roleAssignmentId,
      record: { module: 'access', type: 'role', id: roleId, versionId },
      operation,
      changes: [
        { kind: 'value', field: 'name', before: null, after: draft.name },
        { kind: 'value', field: 'validFrom', before: null, after: draft.validFrom },
        { kind: 'value', field: 'permissions', before: null, after: draft.permissions },
      ],
      source: { kind: 'screen' },
    });
    const requestId = await requestApproval(context, this.audit, {
      actionType: 'access.role.change',
      document: { recordType: 'access.role', recordId: roleId, versionId },
      preparer,
    });
    return { versionId, requestId };
  }

  /**
   * Prepares a new role and its first version, Awaiting approval, and requests its approval (access-and-approvals
   * 4.2, 9.1; POL-02.01). Whether it is a self-service role is fixed by its permissions now (PRD-ACS-022, DEC-100).
   * Refused when it starts before today (GC2-7), a permission is not declared, or the code is taken.
   */
  async prepareRole(
    context: TransactionContext,
    preparer: Preparer,
    draft: RoleDraft,
  ): Promise<Prepared<{ roleId: string; versionId: string; requestId: string }>> {
    const date = await today(context);
    if (typeof date !== 'string') return { kind: 'refusal', refusal: date };
    if (draft.validFrom < date) return refusal('refused', 'access.starts-in-past');
    const undeclared = this.undeclared(draft.permissions);
    if (undeclared !== undefined) return { kind: 'refusal', refusal: undeclared };
    const taken = await context.tx.select({ id: role.id }).from(role).where(eq(role.code, draft.code));
    if (taken.length > 0) return refusal('refused', 'access.role-code-taken');
    const selfService = draft.permissions.some((permission) => permission.selfService);
    // The schema refuses a mix already; the command refuses it too, whoever calls it (PRD-ACS-022, DEC-100).
    if (selfService && draft.permissions.some((permission) => !permission.selfService)) {
      return refusal('refused', 'access.self-service-scope');
    }
    const roleId = uuidv7();
    await context.tx.insert(role).values({ id: roleId, code: draft.code, selfService });
    const written = await this.writeRoleVersion(context, preparer, roleId, draft, 'prepare-role');
    return { kind: 'success', answer: { roleId, ...written } };
  }

  /**
   * Prepares a new version of an existing role, Awaiting approval, effective from its start (4.2). A request still
   * open on an earlier version of the role is Superseded (9.6; PRD-ACS-007): editing a submitted role is a new version.
   */
  async prepareRoleVersion(
    context: TransactionContext,
    preparer: Preparer,
    roleId: string,
    draft: RoleVersionDraft,
  ): Promise<Prepared<{ roleId: string; versionId: string; requestId: string }>> {
    const date = await today(context);
    if (typeof date !== 'string') return { kind: 'refusal', refusal: date };
    const [found] = await context.tx.select().from(role).where(eq(role.id, roleId));
    if (found === undefined) return refusal('not-found', 'access.role-not-found');
    if (draft.validFrom < date) return refusal('refused', 'access.starts-in-past');
    const undeclared = this.undeclared(draft.permissions);
    if (undeclared !== undefined) return { kind: 'refusal', refusal: undeclared };
    if (draft.permissions.some((permission) => permission.selfService !== found.selfService)) {
      return refusal('refused', 'access.self-service-scope');
    }
    const written = await this.writeRoleVersion(context, preparer, roleId, draft, 'prepare-role-version');
    return { kind: 'success', answer: { roleId, ...written } };
  }

  /**
   * Prepares a role assignment, Awaiting approval, and requests its approval (access-and-approvals 4.3, 5, 9.1): a
   * user or service identity, a role, a scope and dates. Refused when it starts before today (GC2-7, DEC-105); when
   * own-record scope meets a role that is not self-service, or other scope a self-service role (PRD-ACS-022); when a
   * dimension selects members, which need the scope contract of S1-F02 and S1-F03 (5.1); or when an Approved, not
   * withdrawn assignment of the same actor, role and exact scope overlaps it (DEC-112, CH-7). An empty dimension is
   * allowed and grants nothing (PRD-ACS-005). A new user's assignment may wait with the user's first version (DEC-116).
   */
  async prepareAssignment(
    context: TransactionContext,
    preparer: Preparer,
    draft: RoleAssignmentDraft,
  ): Promise<Prepared<{ assignmentId: string; requestId: string }>> {
    const date = await today(context);
    if (typeof date !== 'string') return { kind: 'refusal', refusal: date };
    if (draft.validFrom < date) return refusal('refused', 'access.starts-in-past');
    const [foundRole] = await context.tx.select().from(role).where(eq(role.id, draft.roleId));
    if (foundRole === undefined) return refusal('not-found', 'access.role-not-found');
    const actorFound =
      draft.actor.kind === 'user'
        ? await context.tx.select({ id: appUser.id }).from(appUser).where(eq(appUser.id, draft.actor.userId))
        : await context.tx
            .select({ id: serviceIdentity.id })
            .from(serviceIdentity)
            .where(eq(serviceIdentity.id, draft.actor.serviceIdentityId));
    if (actorFound.length === 0) return refusal('not-found', 'access.actor-not-found');
    const ownRecords = draft.scope.kind === 'own-records';
    if (ownRecords !== foundRole.selfService || (ownRecords && draft.actor.kind !== 'user')) {
      return refusal('refused', 'access.self-service-scope');
    }
    const selectedIn = selectedDimensions(draft.scope);
    if (selectedIn.length > 0) {
      return refusal(
        'unavailable',
        'access.scope-members-not-available',
        selectedIn.map((dimension) => ({ kind: 'scope', dimension })),
      );
    }
    const scopeKey = scopeKeyOf(draft.scope);
    const range = rangeOf(draft.validFrom, draft.validTo);
    const actorId = draft.actor.kind === 'user' ? draft.actor.userId : draft.actor.serviceIdentityId;
    if (await this.overlapping(context, actorId, draft.roleId, scopeKey, range)) {
      return refusal('refused', 'access.assignment-overlaps');
    }
    const assignmentId = uuidv7();
    await context.tx.insert(roleAssignment).values({
      id: assignmentId,
      appUserId: draft.actor.kind === 'user' ? draft.actor.userId : null,
      serviceIdentityId: draft.actor.kind === 'service-identity' ? draft.actor.serviceIdentityId : null,
      roleId: draft.roleId,
      roleSelfService: foundRole.selfService,
      ownRecords,
      scopeKey,
      validDuring: range,
      decision: 'Awaiting approval',
      withdrawalId: null,
    });
    if (draft.scope.kind === 'dimensions') {
      const dimensions = [
        ['legal-entity', draft.scope.legalEntity.kind],
        ['place', draft.scope.place.kind],
        ['brand', draft.scope.brand.kind],
      ] as const;
      await context.tx
        .insert(assignmentScope)
        .values(
          dimensions.map(([dimension, kind]) => ({ id: uuidv7(), roleAssignmentId: assignmentId, dimension, kind })),
        );
    }
    await context.tx
      .insert(roleAssignmentChange)
      .values({ id: uuidv7(), roleAssignmentId: assignmentId, changedByUserId: preparer.userId });
    await this.audit.record(context, {
      actor: { kind: 'user', id: preparer.userId },
      roleAssignmentId: preparer.roleAssignmentId,
      record: { module: 'access', type: 'role_assignment', id: assignmentId },
      operation: 'prepare-role-assignment',
      changes: [
        { kind: 'value', field: 'actor', before: null, after: draft.actor },
        { kind: 'value', field: 'roleId', before: null, after: draft.roleId },
        { kind: 'value', field: 'scope', before: null, after: draft.scope },
        { kind: 'value', field: 'validFrom', before: null, after: draft.validFrom },
        { kind: 'value', field: 'validTo', before: null, after: draft.validTo ?? null },
      ],
      source: { kind: 'screen' },
    });
    // An assignment is a dated row, its own version (code-house-rules 7.3).
    const requestId = await requestApproval(context, this.audit, {
      actionType: 'access.role_assignment.change',
      document: { recordType: 'access.role_assignment', recordId: assignmentId, versionId: assignmentId },
      preparer,
    });
    return { kind: 'success', answer: { assignmentId, requestId } };
  }

  /**
   * Prepares the withdrawal of a Scheduled assignment before its start: a new version of its withdrawal document,
   * Awaiting approval, and its request (access-and-approvals 4.3, 9.1; code-house-rules 7.3; RR-202, CH-11). Refused
   * unless the assignment is Approved, not withdrawn, and starts after today; one that has started is ended early
   * instead. A request open on an earlier version of the same withdrawal is Superseded (9.6).
   */
  async prepareWithdrawal(
    context: TransactionContext,
    preparer: Preparer,
    assignmentId: string,
    draft: AssignmentWithdrawalDraft,
  ): Promise<Prepared<{ withdrawalId: string; versionId: string; requestId: string }>> {
    const date = await today(context);
    if (typeof date !== 'string') return { kind: 'refusal', refusal: date };
    const [assignment] = await context.tx
      .select({
        decision: roleAssignment.decision,
        withdrawalId: roleAssignment.withdrawalId,
        startsAfterToday: sql<boolean>`lower(${roleAssignment.validDuring}) > ${date}::date`,
      })
      .from(roleAssignment)
      .where(eq(roleAssignment.id, assignmentId));
    if (assignment === undefined) return refusal('not-found', 'access.assignment-not-found');
    if (assignment.decision !== 'Approved' || assignment.withdrawalId !== null || !assignment.startsAfterToday) {
      return refusal('refused', 'access.not-withdrawable');
    }
    const [existing] = await context.tx
      .select({ id: roleAssignmentWithdrawal.id })
      .from(roleAssignmentWithdrawal)
      .where(eq(roleAssignmentWithdrawal.roleAssignmentId, assignmentId));
    const withdrawalId = existing?.id ?? uuidv7();
    if (existing === undefined) {
      await context.tx.insert(roleAssignmentWithdrawal).values({ id: withdrawalId, roleAssignmentId: assignmentId });
    }
    const versionId = uuidv7();
    await context.tx.insert(roleAssignmentWithdrawalVersion).values({
      id: versionId,
      withdrawalId,
      reason: draft.reason,
      decision: 'Awaiting approval',
      kind: 'before-start',
      causedByDecisionId: null,
    });
    await context.tx
      .insert(roleAssignmentWithdrawalChange)
      .values({ id: uuidv7(), withdrawalVersionId: versionId, changedByUserId: preparer.userId });
    await this.audit.record(context, {
      actor: { kind: 'user', id: preparer.userId },
      roleAssignmentId: preparer.roleAssignmentId,
      record: { module: 'access', type: 'role_assignment', id: assignmentId },
      operation: 'prepare-withdrawal',
      changes: [
        { kind: 'value', field: 'withdrawalId', before: null, after: withdrawalId },
        { kind: 'value', field: 'withdrawalVersionId', before: null, after: versionId },
        { kind: 'value', field: 'reason', before: null, after: draft.reason },
      ],
      source: { kind: 'screen' },
    });
    const requestId = await requestApproval(context, this.audit, {
      actionType: 'access.role_assignment.withdrawal',
      document: { recordType: 'access.role_assignment', recordId: withdrawalId, versionId },
      preparer,
    });
    return { kind: 'success', answer: { withdrawalId, versionId, requestId } };
  }

  private async overlapping(
    context: TransactionContext,
    actorId: string,
    roleId: string,
    scopeKey: string,
    range: string,
    except?: string,
  ): Promise<boolean> {
    const rows = await context.tx
      .select({ id: roleAssignment.id })
      .from(roleAssignment)
      .where(
        and(
          sql`coalesce(${roleAssignment.appUserId}, ${roleAssignment.serviceIdentityId}) = ${actorId}::uuid`,
          eq(roleAssignment.roleId, roleId),
          eq(roleAssignment.scopeKey, scopeKey),
          eq(roleAssignment.decision, 'Approved'),
          sql`${roleAssignment.withdrawalId} is null`,
          sql`${roleAssignment.validDuring} && ${range}::daterange`,
          except === undefined ? undefined : sql`${roleAssignment.id} <> ${except}::uuid`,
        ),
      );
    return rows.length > 0;
  }

  /** The rows a decision on a role version locks at step 1 (code-house-rules 8.2). */
  roleVersionTargets(versionId: string): LockTarget[] {
    return [{ table: ROLE_VERSION, id: versionId, mode: 'exclusive' }];
  }

  /**
   * The rows a decision on an assignment locks: the assignment, an authority row, exclusively at step 0
   * (code-house-rules 8.2 "Authority first"; RR-325).
   */
  assignmentTargets(assignmentId: string): LockTarget[] {
    return [assignmentTarget(assignmentId, 'exclusive')];
  }

  /** The authority rows a decision on a withdrawal version locks at step 0: the assignment it withdraws. */
  async withdrawalAuthorityTargets(context: TransactionContext, withdrawalVersionId: string): Promise<LockTarget[]> {
    const target = await this.withdrawalTarget(context, withdrawalVersionId);
    return target === undefined ? [] : this.assignmentTargets(target.assignmentId);
  }

  /** The rows a decision on a withdrawal version locks at step 1: the version. */
  withdrawalTargets(withdrawalVersionId: string): LockTarget[] {
    return [{ table: WITHDRAWAL_VERSION, id: withdrawalVersionId, mode: 'exclusive' }];
  }

  /**
   * Makes an approved role version take effect (access-and-approvals 4.2; module-map 6.2 flow A): locks it, rechecks
   * that it is Awaiting approval and starts today or later, ends the Approved version it follows on its start, records
   * the decision and rebuilds the effective grants of every actor holding the role (7.2). Refused when an Approved
   * version starts on or after its start, which only a new version can follow.
   */
  async approveRoleVersion(
    context: TransactionContext,
    decider: Decider,
    versionId: string,
    options: EffectOptions = {},
  ): Promise<Prepared<{ roleId: string }>> {
    const date = await today(context);
    if (typeof date !== 'string') return { kind: 'refusal', refusal: date };
    await lockUnlessHeld(context, options, { document: this.roleVersionTargets(versionId) });
    const [version] = await context.tx
      .select({
        roleId: roleVersion.roleId,
        decision: roleVersion.decision,
        start: sql<string>`lower(${roleVersion.validDuring})::text`,
      })
      .from(roleVersion)
      .where(eq(roleVersion.id, versionId));
    if (version === undefined) return refusal('not-found', 'access.role-not-found');
    if (version.decision !== 'Awaiting approval') return refusal('conflict', 'kernel.stale-version');
    if (version.start < date) return refusal('refused', 'access.starts-in-past');
    const later = await context.tx
      .select({ id: roleVersion.id })
      .from(roleVersion)
      .where(
        and(
          eq(roleVersion.roleId, version.roleId),
          eq(roleVersion.decision, 'Approved'),
          sql`lower(${roleVersion.validDuring}) >= ${version.start}::date`,
        ),
      );
    if (later.length > 0) return refusal('refused', 'access.version-overlaps');
    // The version it follows ends on its start (code-house-rules 7.3).
    await context.tx
      .update(roleVersion)
      .set({ validDuring: sql`daterange(lower(${roleVersion.validDuring}), ${version.start}::date)` })
      .where(
        and(
          eq(roleVersion.roleId, version.roleId),
          eq(roleVersion.decision, 'Approved'),
          sql`${roleVersion.validDuring} @> ${version.start}::date`,
        ),
      );
    await context.tx.update(roleVersion).set({ decision: 'Approved' }).where(eq(roleVersion.id, versionId));
    const holders = await context.tx
      .selectDistinct({
        actorId: sql<string>`coalesce(${roleAssignment.appUserId}, ${roleAssignment.serviceIdentityId})`,
      })
      .from(roleAssignment)
      .where(and(eq(roleAssignment.roleId, version.roleId), eq(roleAssignment.decision, 'Approved')));
    const actorIds = holders.map((holder) => holder.actorId);
    await this.rebuildGrants(context, actorIds);
    await this.publishGrantsChanged(
      context,
      { module: 'access', recordType: 'access.role', recordId: version.roleId, versionId },
      actorIds,
    );
    await this.recordEffect(context, decider, {
      record: { module: 'access', type: 'role', id: version.roleId, versionId },
      operation: 'approve-role-version',
    });
    return { kind: 'success', answer: { roleId: version.roleId } };
  }

  /** Records a role version Rejected; it never takes effect (access-and-approvals 9.5). */
  async rejectRoleVersion(
    context: TransactionContext,
    decider: Decider,
    versionId: string,
    options: EffectOptions = {},
  ): Promise<Prepared<{ roleId: string }>> {
    await lockUnlessHeld(context, options, { document: this.roleVersionTargets(versionId) });
    const [version] = await context.tx.select().from(roleVersion).where(eq(roleVersion.id, versionId));
    if (version === undefined) return refusal('not-found', 'access.role-not-found');
    if (version.decision !== 'Awaiting approval') return refusal('conflict', 'kernel.stale-version');
    await context.tx.update(roleVersion).set({ decision: 'Rejected' }).where(eq(roleVersion.id, versionId));
    await this.audit.record(context, {
      ...this.auditActor(decider),
      record: { module: 'access', type: 'role', id: version.roleId, versionId },
      operation: 'reject-role-version',
      changes: [{ kind: 'value', field: 'decision', before: 'Awaiting approval', after: 'Rejected' }],
      source: { kind: 'screen' },
    });
    return { kind: 'success', answer: { roleId: version.roleId } };
  }

  /**
   * Makes an approved role assignment take effect (access-and-approvals 4.3; module-map 6.2 flow A): locks it,
   * rechecks under the lock that it is Awaiting approval, starts today or later (GC2-7) and overlaps no Approved, not
   * withdrawn assignment of the same actor, role and exact scope (DEC-112, CH-7), records the decision and rebuilds
   * the actor's effective grants (7.2). Two overlapping ones approved at the same moment: the second meets the
   * exclusion constraint under a savepoint and is refused as overlapping, never failed (RR-295).
   */
  async approveAssignment(
    context: TransactionContext,
    decider: Decider,
    assignmentId: string,
    options: EffectOptions = {},
  ): Promise<Prepared<{ assignmentId: string }>> {
    const date = await today(context);
    if (typeof date !== 'string') return { kind: 'refusal', refusal: date };
    await lockUnlessHeld(context, options, { authority: this.assignmentTargets(assignmentId) });
    const found = await this.assignmentRow(context, assignmentId);
    if (found === undefined) return refusal('not-found', 'access.assignment-not-found');
    if (found.decision !== 'Awaiting approval') return refusal('conflict', 'kernel.stale-version');
    if (found.start < date) return refusal('refused', 'access.starts-in-past');
    if (await this.overlapping(context, found.actorId, found.roleId, found.scopeKey, found.range, assignmentId)) {
      return refusal('refused', 'access.assignment-overlaps');
    }
    await context.tx.execute(sql`savepoint access_approve_assignment`);
    try {
      await context.tx.update(roleAssignment).set({ decision: 'Approved' }).where(eq(roleAssignment.id, assignmentId));
      await context.tx.execute(sql`release savepoint access_approve_assignment`);
    } catch (error) {
      if (sqlStateOf(error) !== EXCLUSION_VIOLATION) throw error;
      await context.tx.execute(sql`rollback to savepoint access_approve_assignment`);
      return refusal('refused', 'access.assignment-overlaps');
    }
    await this.rebuildGrants(context, [found.actorId]);
    await this.publishGrantsChanged(context, assignmentId, [found.actorId]);
    await this.recordEffect(
      context,
      decider,
      { record: { module: 'access', type: 'role_assignment', id: assignmentId }, operation: 'approve-role-assignment' },
      found.userId,
    );
    return { kind: 'success', answer: { assignmentId } };
  }

  /** Records a role assignment Rejected; it never takes effect (access-and-approvals 9.5). */
  async rejectAssignment(
    context: TransactionContext,
    decider: Decider,
    assignmentId: string,
    options: EffectOptions = {},
  ): Promise<Prepared<{ assignmentId: string }>> {
    await lockUnlessHeld(context, options, { authority: this.assignmentTargets(assignmentId) });
    const found = await this.assignmentRow(context, assignmentId);
    if (found === undefined) return refusal('not-found', 'access.assignment-not-found');
    if (found.decision !== 'Awaiting approval') return refusal('conflict', 'kernel.stale-version');
    await context.tx.update(roleAssignment).set({ decision: 'Rejected' }).where(eq(roleAssignment.id, assignmentId));
    await this.audit.record(context, {
      ...this.auditActor(decider),
      record: { module: 'access', type: 'role_assignment', id: assignmentId },
      operation: 'reject-role-assignment',
      changes: [{ kind: 'value', field: 'decision', before: 'Awaiting approval', after: 'Rejected' }],
      source: { kind: 'screen' },
    });
    return { kind: 'success', answer: { assignmentId } };
  }

  /**
   * Makes an approved withdrawal take effect (code-house-rules 7.3; access-and-approvals 4.3; RR-202, CH-11): locks
   * the assignment as its own record with the withdrawal version, rechecks under the lock that the version is
   * Awaiting approval and the assignment Approved, not withdrawn and starting after today, then records the decision
   * and the withdrawal on the assignment, once. The withdrawn assignment is never in force and no effective grant
   * comes from it; its history stays.
   */
  async approveWithdrawal(
    context: TransactionContext,
    decider: Decider,
    withdrawalVersionId: string,
    options: EffectOptions = {},
  ): Promise<Prepared<{ assignmentId: string }>> {
    const date = await today(context);
    if (typeof date !== 'string') return { kind: 'refusal', refusal: date };
    const target = await this.withdrawalTarget(context, withdrawalVersionId);
    if (target === undefined) return refusal('not-found', 'access.assignment-not-found');
    await lockUnlessHeld(context, options, {
      authority: this.assignmentTargets(target.assignmentId),
      document: this.withdrawalTargets(withdrawalVersionId),
    });
    const [version] = await context.tx
      .select({ decision: roleAssignmentWithdrawalVersion.decision })
      .from(roleAssignmentWithdrawalVersion)
      .where(eq(roleAssignmentWithdrawalVersion.id, withdrawalVersionId));
    if (version?.decision !== 'Awaiting approval') return refusal('conflict', 'kernel.stale-version');
    const found = await this.assignmentRow(context, target.assignmentId);
    if (found === undefined) return refusal('not-found', 'access.assignment-not-found');
    if (found.decision !== 'Approved' || found.withdrawalId !== null || !(found.start > date)) {
      return refusal('refused', 'access.not-withdrawable');
    }
    await context.tx
      .update(roleAssignmentWithdrawalVersion)
      .set({ decision: 'Approved' })
      .where(eq(roleAssignmentWithdrawalVersion.id, withdrawalVersionId));
    await context.tx
      .update(roleAssignment)
      .set({ withdrawalId: target.withdrawalId })
      .where(eq(roleAssignment.id, target.assignmentId));
    await this.rebuildGrants(context, [found.actorId]);
    await this.publishGrantsChanged(context, target.assignmentId, [found.actorId]);
    await this.recordEffect(
      context,
      decider,
      {
        record: { module: 'access', type: 'role_assignment', id: target.assignmentId },
        operation: 'withdraw-role-assignment',
        changes: [{ kind: 'value', field: 'withdrawalId', before: null, after: target.withdrawalId }],
      },
      found.userId,
    );
    return { kind: 'success', answer: { assignmentId: target.assignmentId } };
  }

  /** Records a withdrawal version Rejected; the assignment stays as it was (access-and-approvals 9.5). */
  async rejectWithdrawal(
    context: TransactionContext,
    decider: Decider,
    withdrawalVersionId: string,
    options: EffectOptions = {},
  ): Promise<Prepared<{ assignmentId: string }>> {
    const target = await this.withdrawalTarget(context, withdrawalVersionId);
    if (target === undefined) return refusal('not-found', 'access.assignment-not-found');
    await lockUnlessHeld(context, options, { document: this.withdrawalTargets(withdrawalVersionId) });
    const [version] = await context.tx
      .select({ decision: roleAssignmentWithdrawalVersion.decision })
      .from(roleAssignmentWithdrawalVersion)
      .where(eq(roleAssignmentWithdrawalVersion.id, withdrawalVersionId));
    if (version?.decision !== 'Awaiting approval') return refusal('conflict', 'kernel.stale-version');
    await context.tx
      .update(roleAssignmentWithdrawalVersion)
      .set({ decision: 'Rejected' })
      .where(eq(roleAssignmentWithdrawalVersion.id, withdrawalVersionId));
    await this.audit.record(context, {
      ...this.auditActor(decider),
      record: { module: 'access', type: 'role_assignment', id: target.assignmentId },
      operation: 'reject-withdrawal',
      changes: [{ kind: 'value', field: 'withdrawalVersionId', before: null, after: withdrawalVersionId }],
      source: { kind: 'screen' },
    });
    return { kind: 'success', answer: { assignmentId: target.assignmentId } };
  }

  /** The assignments of a user still Awaiting approval, which a rejection of the user's first version withdraws. */
  async pendingAssignmentsOf(context: TransactionContext, userId: string): Promise<string[]> {
    const rows = await context.tx
      .select({ id: roleAssignment.id })
      .from(roleAssignment)
      .where(and(eq(roleAssignment.appUserId, userId), eq(roleAssignment.decision, 'Awaiting approval')));
    return rows.map((row) => row.id).sort();
  }

  /**
   * Withdraws an assignment before approval, because the user's first version was rejected (access-and-approvals
   * 4.3; DEC-116, DEC-117). Its locks are held by the decision. The withdrawal document keeps that it was withdrawn
   * before approval and the decision that caused it; the assignment takes the final decision Withdrawn and never
   * takes effect. Answers false when the assignment no longer waits.
   */
  async withdrawBeforeApproval(
    context: TransactionContext,
    decider: Decider & { readonly approvalDecisionId: string },
    assignmentId: string,
    withdrawnByUserId: string,
  ): Promise<boolean> {
    const found = await this.assignmentRow(context, assignmentId);
    if (found?.decision !== 'Awaiting approval') return false;
    const withdrawalId = uuidv7();
    const versionId = uuidv7();
    await context.tx.insert(roleAssignmentWithdrawal).values({ id: withdrawalId, roleAssignmentId: assignmentId });
    await context.tx.insert(roleAssignmentWithdrawalVersion).values({
      id: versionId,
      withdrawalId,
      reason: 'user-first-version-rejected',
      decision: 'Approved',
      kind: 'before-approval',
      causedByDecisionId: decider.approvalDecisionId,
    });
    await context.tx
      .insert(roleAssignmentWithdrawalChange)
      .values({ id: uuidv7(), withdrawalVersionId: versionId, changedByUserId: withdrawnByUserId });
    await context.tx
      .update(roleAssignment)
      .set({ decision: 'Withdrawn', withdrawalId })
      .where(eq(roleAssignment.id, assignmentId));
    await this.audit.record(context, {
      ...this.auditActor(decider),
      record: { module: 'access', type: 'role_assignment', id: assignmentId },
      operation: 'withdraw-role-assignment-before-approval',
      changes: [
        { kind: 'value', field: 'decision', before: 'Awaiting approval', after: 'Withdrawn' },
        { kind: 'value', field: 'withdrawalId', before: null, after: withdrawalId },
        { kind: 'value', field: 'withdrawalKind', before: null, after: 'before-approval' },
      ],
      source: { kind: 'screen' },
    });
    return true;
  }

  /** Rebuilds the effective grants of the actors named, or of every actor (access-and-approvals 7.2). */
  rebuildGrants(context: TransactionContext, actorIds?: readonly string[]): Promise<number> {
    return rebuildGrants(context, this.registry, actorIds);
  }

  /**
   * `access.assignment-changed`: the actors whose grants were rebuilt (module-map section 8). The subject is the
   * record that changed them: the role assignment, or the role and its version taking effect.
   */
  private async publishGrantsChanged(
    context: TransactionContext,
    subject: string | EventSubject,
    actorIds: readonly string[],
  ) {
    await context.publish(assignmentChanged, {
      subject:
        typeof subject === 'string'
          ? { module: 'access', recordType: 'access.role_assignment', recordId: subject }
          : subject,
      payload: { actorIds: [...actorIds].sort() },
    });
  }

  private auditActor(decider: Decider) {
    return {
      actor: decider.actor,
      ...(decider.roleAssignmentId === undefined ? {} : { roleAssignmentId: decider.roleAssignmentId }),
      ...(decider.approvalDecisionId === undefined ? {} : { approval: { decisionId: decider.approvalDecisionId } }),
      ...(decider.reason === undefined ? {} : { reason: decider.reason }),
    };
  }

  /** The audit record of a change of access taking effect, and its permission-change access record (9.11). */
  private async recordEffect(
    context: TransactionContext,
    decider: Decider,
    entry: {
      readonly record: { module: string; type: string; id: string; versionId?: string };
      readonly operation: string;
      readonly changes?: Parameters<AuditInterface['record']>[1]['changes'];
    },
    userId?: string | null,
  ): Promise<void> {
    const auditRecord = await this.audit.record(context, {
      ...this.auditActor(decider),
      record: entry.record,
      operation: entry.operation,
      changes: entry.changes ?? [{ kind: 'value', field: 'decision', before: 'Awaiting approval', after: 'Approved' }],
      source: { kind: decider.actor.kind === 'service-identity' ? 'operator-command' : 'screen' },
    });
    await this.audit.recordAccess(context, {
      kind: 'permission-changed',
      outcome: 'succeeded',
      auditRecord,
      ...(userId === null || userId === undefined ? {} : { userId }),
    });
  }

  private async assignmentRow(context: TransactionContext, assignmentId: string) {
    const [row] = await context.tx
      .select({
        decision: roleAssignment.decision,
        withdrawalId: roleAssignment.withdrawalId,
        userId: roleAssignment.appUserId,
        actorId: sql<string>`coalesce(${roleAssignment.appUserId}, ${roleAssignment.serviceIdentityId})`,
        roleId: roleAssignment.roleId,
        scopeKey: roleAssignment.scopeKey,
        range: sql<string>`${roleAssignment.validDuring}::text`,
        start: sql<string>`lower(${roleAssignment.validDuring})::text`,
      })
      .from(roleAssignment)
      .where(eq(roleAssignment.id, assignmentId));
    return row;
  }

  /** The user an assignment is of, if a user (4.3). */
  async assignmentUser(context: TransactionContext, assignmentId: string): Promise<string | null | undefined> {
    return (await this.assignmentRow(context, assignmentId))?.userId;
  }

  private async withdrawalTarget(context: TransactionContext, withdrawalVersionId: string) {
    const [row] = await context.tx
      .select({ withdrawalId: roleAssignmentWithdrawal.id, assignmentId: roleAssignmentWithdrawal.roleAssignmentId })
      .from(roleAssignmentWithdrawalVersion)
      .innerJoin(
        roleAssignmentWithdrawal,
        eq(roleAssignmentWithdrawal.id, roleAssignmentWithdrawalVersion.withdrawalId),
      )
      .where(eq(roleAssignmentWithdrawalVersion.id, withdrawalVersionId));
    return row;
  }
}

/** The dimensions of a scope that select members (access-and-approvals 5.1). */
function selectedDimensions(scope: AssignmentScope): ('legal-entity' | 'place' | 'brand')[] {
  if (scope.kind === 'own-records') return [];
  const selected: ('legal-entity' | 'place' | 'brand')[] = [];
  if (scope.legalEntity.kind === 'selected') selected.push('legal-entity');
  if (scope.place.kind === 'selected') selected.push('place');
  if (scope.brand.kind === 'selected') selected.push('brand');
  return selected;
}
