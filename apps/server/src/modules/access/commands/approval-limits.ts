import { paise, uuidv7 } from '@apparel-os/domain';
import type {
  ApprovalLimitDraft,
  ApprovalLimitList,
  ApprovalLimitRecord,
  AssignmentScope,
  LimitAuthority,
  MoneyBasis,
  SettingOrigin,
} from '@apparel-os/schemas';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { sqlStateOf, type LockTarget, type TransactionContext } from '../../../kernel/index.js';
import type { AuditInterface } from '../../audit/index.js';
import { approvalLimit, approvalLimitChange, role, roleAssignment } from '../db/schema.js';
import type { LimitRow } from '../domain/approval-limits.js';
import type { ApprovalRule } from '../domain/approval-rules.js';
import { scopeKeyOf } from '../domain/scope.js';
import { latestRequests, userNames, versionView } from '../queries/access-records.js';
import {
  lockUnlessHeld,
  rangeOf,
  refusal,
  today,
  type AccessChanges,
  type Decider,
  type EffectOptions,
  type Prepared,
  type Preparer,
} from './access-changes.js';
import { limitTarget } from './authority.js';
import { requestApproval } from './request-approval.js';

// Approval limits (access-and-approvals 9.2, 9.11, 13.1; code-house-rules 7.3; POL-02.07, POL-02.09, POL-02.15,
// PRD-ACS-015, PRD-ACS-016; DM-8, DEC-105; S1-F05-T01). A limit is a dated row, its own version: prepared and saved
// Awaiting approval with its request (9.1), approved by an authorised person other than its preparers, and kept with
// its history. No limit is written by default: a missing limit grants nothing (POL-02.09), and the real limits and
// their holders are KDPS's (V-02, RR-065).

const EXCLUSION_VIOLATION = '23P01';

/** The overlap key's holder of a limit (code-house-rules 7.3; migration 0040). */
function holderKeyOf(holder: ApprovalLimitDraft['holder']): string {
  return holder.kind === 'role'
    ? `role:${holder.roleId}:${scopeKeyOf(holder.scope)}`
    : `user:${holder.userId}:${holder.roleAssignmentId}`;
}

type LimitColumns = typeof approvalLimit.$inferSelect;

/** A limit's authority as the screens state it (9.2): a value, explicit unlimited, or none besides Unknown. */
function authorityOf(row: Pick<LimitColumns, 'amount' | 'unlimited'>): LimitAuthority {
  if (row.amount !== null) return { kind: 'amount', amount: paise(row.amount) };
  return row.unlimited ? { kind: 'unlimited' } : { kind: 'none' };
}

/** A limit row as who may decide reads it (9.3). */
function limitRowOf(row: LimitColumns): LimitRow {
  return {
    id: row.id,
    holder:
      row.holderKind === 'role'
        ? { kind: 'role', roleId: row.roleId ?? '', scope: row.scope as AssignmentScope }
        : { kind: 'individual', userId: row.appUserId ?? '', roleAssignmentId: row.roleAssignmentId ?? '' },
    amount: row.amount === null ? null : paise(row.amount),
    unlimited: row.unlimited,
    coversUnknown: row.coversUnknown,
  };
}

/** The Approved limits of an action type in force on a business date (9.2, 9.3). */
export async function limitsInForce(
  context: TransactionContext,
  businessDate: string,
  actionType: string,
): Promise<LimitRow[]> {
  const rows = await context.tx
    .select()
    .from(approvalLimit)
    .where(
      and(
        eq(approvalLimit.actionType, actionType),
        eq(approvalLimit.decision, 'Approved'),
        sql`${approvalLimit.validDuring} @> ${businessDate}::date`,
      ),
    )
    .orderBy(approvalLimit.id);
  return rows.map(limitRowOf);
}

/** One limit row, by identifier, as a decision reads it back (9.7). */
export async function limitById(context: TransactionContext, limitId: string): Promise<LimitRow | undefined> {
  const [row] = await context.tx.select().from(approvalLimit).where(eq(approvalLimit.id, limitId));
  return row === undefined ? undefined : limitRowOf(row);
}

/**
 * Setup › Approval limits (access-and-approvals 14): every limit, newest first, with its basis beside it
 * (PRD-ACS-015), its holder named, its authority and state; and the action types a limit can be set for, those whose
 * rule has a money basis (8; DM-8). The route's Authorise for view on the type has run; limits carry no scope fact.
 */
export async function listApprovalLimits(
  context: TransactionContext,
  todayDate: string,
  rules: ReadonlyMap<string, ApprovalRule>,
): Promise<ApprovalLimitList> {
  const rows = await context.tx
    .select({
      limit: approvalLimit,
      roleCode: role.code,
      start: sql<string>`lower(${approvalLimit.validDuring})::text`,
      end: sql<string | null>`upper(${approvalLimit.validDuring})::text`,
    })
    .from(approvalLimit)
    .leftJoin(role, eq(role.id, approvalLimit.roleId))
    .orderBy(desc(approvalLimit.recordedAt), desc(approvalLimit.id));
  const assignmentIds = rows.flatMap((row) =>
    row.limit.roleAssignmentId === null ? [] : [row.limit.roleAssignmentId],
  );
  const assignmentRoles =
    assignmentIds.length === 0
      ? []
      : await context.tx
          .select({ id: roleAssignment.id, roleId: role.id, roleCode: role.code })
          .from(roleAssignment)
          .innerJoin(role, eq(role.id, roleAssignment.roleId))
          .where(inArray(roleAssignment.id, assignmentIds));
  const names = await userNames(context);
  const requests = await latestRequests(
    context,
    rows.map((row) => row.limit.id),
  );
  return {
    asOf: context.startedAt.toISOString(),
    actionTypes: [...rules.values()]
      .filter((each) => each.value !== 'none')
      .map((each) => ({ actionType: each.actionType, basis: each.value as MoneyBasis }))
      .sort((a, b) => (a.actionType < b.actionType ? -1 : 1)),
    limits: rows.map(({ limit, roleCode, start, end }): ApprovalLimitRecord => {
      const dated = versionView({ id: limit.id, decision: limit.decision, start, end }, todayDate, requests);
      const assignmentRole = assignmentRoles.find((each) => each.id === limit.roleAssignmentId);
      return {
        ...dated,
        actionType: limit.actionType,
        basis: limit.basis as MoneyBasis,
        holder:
          limit.holderKind === 'role'
            ? {
                kind: 'role',
                role: { id: limit.roleId ?? '', code: roleCode ?? '' },
                scope: limit.scope as AssignmentScope,
              }
            : {
                kind: 'individual',
                userId: limit.appUserId ?? '',
                name: names.get(limit.appUserId ?? '') ?? null,
                roleAssignmentId: limit.roleAssignmentId ?? '',
                role: { id: assignmentRole?.roleId ?? '', code: assignmentRole?.roleCode ?? '' },
              },
        limit: authorityOf(limit),
        coversUnknown: limit.coversUnknown,
        origin: limit.origin as SettingOrigin,
      };
    }),
  };
}

export class ApprovalLimitChanges {
  constructor(
    private readonly audit: AuditInterface,
    /** Every approval rule of the composition, whose value basis a limit takes (8; PRD-ACS-015). */
    private readonly rules: ReadonlyMap<string, ApprovalRule>,
    /** For the scope contract's check of a role limit's selected members (5.1). */
    private readonly changes: AccessChanges,
  ) {}

  /**
   * Prepares an approval limit (access-and-approvals 9.2, 9.11): for an action type whose rule has a money basis,
   * which the limit takes (PRD-ACS-015); held by a role within a scope, whose selected members the scope contract
   * checks (5.1), or by a named user through one of their assignments; starting today or later (GC2-7, DEC-105). An
   * approved limit of the same action type and holder starting on or after its start would overlap it, whatever its
   * end, so it is refused (`access.limit-overlaps`; code-house-rules 7.3); one starting before it is ended on its
   * start when it is approved. Saves it Awaiting approval and requests its approval in the same transaction (9.1).
   */
  async prepare(
    context: TransactionContext,
    preparer: Preparer,
    draft: ApprovalLimitDraft,
  ): Promise<Prepared<{ limitId: string; requestId: string }>> {
    const date = await today(context);
    if (typeof date !== 'string') return { kind: 'refusal', refusal: date };
    if (draft.validFrom < date) return refusal('refused', 'access.starts-in-past');
    const rule = this.rules.get(draft.actionType);
    if (rule === undefined) return refusal('refused', 'access.action-type-not-declared');
    // An action with no value, or no value limit, needs only approve (9.3; DM-8): it takes no limit.
    if (rule.value === 'none') return refusal('refused', 'access.action-type-not-limited');
    const holder = draft.holder;
    if (holder.kind === 'role') {
      const found = await context.tx.select({ id: role.id }).from(role).where(eq(role.id, holder.roleId));
      if (found.length === 0) return refusal('not-found', 'access.role-not-found');
      const members = await this.changes.checkMembers(context, {
        scope: holder.scope,
        validFrom: draft.validFrom,
        validTo: draft.validTo,
      });
      if (members !== undefined) return { kind: 'refusal', refusal: members };
    } else {
      const [assignment] = await context.tx
        .select({ userId: roleAssignment.appUserId })
        .from(roleAssignment)
        .where(eq(roleAssignment.id, holder.roleAssignmentId));
      if (assignment === undefined) return refusal('not-found', 'access.assignment-not-found');
      if (assignment.userId !== holder.userId) return refusal('refused', 'access.assignment-not-of-user');
    }
    const holderKey = holderKeyOf(holder);
    if (await this.approvedFrom(context, draft.actionType, holderKey, draft.validFrom)) {
      return refusal('refused', 'access.limit-overlaps');
    }
    const limitId = uuidv7();
    await context.tx.insert(approvalLimit).values({
      id: limitId,
      actionType: draft.actionType,
      basis: rule.value,
      holderKind: holder.kind,
      roleId: holder.kind === 'role' ? holder.roleId : null,
      scope: holder.kind === 'role' ? holder.scope : null,
      scopeKey: holder.kind === 'role' ? scopeKeyOf(holder.scope) : null,
      appUserId: holder.kind === 'individual' ? holder.userId : null,
      roleAssignmentId: holder.kind === 'individual' ? holder.roleAssignmentId : null,
      holderKey,
      amount: draft.limit.kind === 'amount' ? draft.limit.amount : null,
      unlimited: draft.limit.kind === 'unlimited',
      coversUnknown: draft.coversUnknown,
      origin: draft.origin,
      validDuring: rangeOf(draft.validFrom, draft.validTo),
      decision: 'Awaiting approval',
    });
    await context.tx
      .insert(approvalLimitChange)
      .values({ id: uuidv7(), approvalLimitId: limitId, changedByUserId: preparer.userId });
    await this.audit.record(context, {
      actor: { kind: 'user', id: preparer.userId },
      roleAssignmentId: preparer.roleAssignmentId,
      record: { module: 'access', type: 'approval_limit', id: limitId, versionId: limitId },
      operation: 'prepare-approval-limit',
      changes: [
        { kind: 'value', field: 'actionType', before: null, after: draft.actionType },
        { kind: 'value', field: 'basis', before: null, after: rule.value },
        { kind: 'value', field: 'holder', before: null, after: holder },
        { kind: 'value', field: 'limit', before: null, after: draft.limit },
        { kind: 'value', field: 'coversUnknown', before: null, after: draft.coversUnknown },
        { kind: 'value', field: 'origin', before: null, after: draft.origin },
        { kind: 'value', field: 'validFrom', before: null, after: draft.validFrom },
        { kind: 'value', field: 'validTo', before: null, after: draft.validTo ?? null },
      ],
      source: { kind: 'screen' },
    });
    // A limit is a dated row, its own version (code-house-rules 7.3).
    const requestId = await requestApproval(context, this.audit, {
      actionType: 'access.approval_limit.change',
      document: { recordType: 'access.approval_limit', recordId: limitId, versionId: limitId },
      preparer,
    });
    return { kind: 'success', answer: { limitId, requestId } };
  }

  /** Whether an Approved limit of the action type and holder starts on or after the date (code-house-rules 7.3). */
  private async approvedFrom(
    context: TransactionContext,
    actionType: string,
    holderKey: string,
    start: string,
  ): Promise<boolean> {
    const rows = await context.tx
      .select({ id: approvalLimit.id })
      .from(approvalLimit)
      .where(
        and(
          eq(approvalLimit.actionType, actionType),
          eq(approvalLimit.holderKey, holderKey),
          eq(approvalLimit.decision, 'Approved'),
          sql`lower(${approvalLimit.validDuring}) >= ${start}::date`,
        ),
      );
    return rows.length > 0;
  }

  /**
   * The authority rows a decision on a limit locks at step 0, exclusively (code-house-rules 8.2): the limit, and the
   * Approved limits of its action type and holder whose dates hold its start, which its approval ends there. A decision
   * relying on one of them locks it shared, so the two never pass each other.
   */
  async authorityTargets(context: TransactionContext, limitId: string): Promise<LockTarget[]> {
    const [found] = await context.tx.select().from(approvalLimit).where(eq(approvalLimit.id, limitId));
    if (found === undefined) return [];
    const ended = await this.endedBy(context, found);
    return [limitId, ...ended].map((id) => limitTarget(id, 'exclusive'));
  }

  private async endedBy(context: TransactionContext, limit: LimitColumns): Promise<string[]> {
    const rows = await context.tx
      .select({ id: approvalLimit.id })
      .from(approvalLimit)
      .where(
        and(
          eq(approvalLimit.actionType, limit.actionType),
          eq(approvalLimit.holderKey, limit.holderKey),
          eq(approvalLimit.decision, 'Approved'),
          sql`${approvalLimit.validDuring} @> lower(${limit.validDuring}::daterange)`,
        ),
      );
    return rows.map((row) => row.id);
  }

  /**
   * Makes an approved limit take effect from its start (code-house-rules 7.3; module-map 6.2 flow A): rechecks under
   * its lock that it is Awaiting approval, starts today or later (GC2-7) and that no Approved limit of the same action
   * type and holder starts on or after its start; ends the one it follows on its start; records the decision and its
   * permission-change access record (9.11). Two approved at the same moment: the second meets the exclusion constraint
   * under a savepoint and is refused as overlapping, never failed (RR-295).
   */
  async approve(
    context: TransactionContext,
    decider: Decider,
    limitId: string,
    options: EffectOptions = {},
  ): Promise<Prepared<{ limitId: string }>> {
    const date = await today(context);
    if (typeof date !== 'string') return { kind: 'refusal', refusal: date };
    await lockUnlessHeld(context, options, { authority: await this.authorityTargets(context, limitId) });
    const [read] = await context.tx
      .select({ limit: approvalLimit, start: sql<string>`lower(${approvalLimit.validDuring})::text` })
      .from(approvalLimit)
      .where(eq(approvalLimit.id, limitId));
    if (read === undefined) return refusal('not-found', 'access.approval-limit-not-found');
    const { limit: found, start } = read;
    if (found.decision !== 'Awaiting approval') return refusal('conflict', 'kernel.stale-version');
    if (start < date) return refusal('refused', 'access.starts-in-past');
    if (await this.approvedFrom(context, found.actionType, found.holderKey, start)) {
      return refusal('refused', 'access.limit-overlaps');
    }
    await context.tx.execute(sql`savepoint access_approve_limit`);
    try {
      for (const endedId of await this.endedBy(context, found)) {
        await context.tx.execute(
          sql`update access.approval_limit set valid_during = daterange(lower(valid_during), ${start}::date)
              where id = ${endedId}::uuid`,
        );
        await this.audit.record(context, {
          ...auditActor(decider),
          record: { module: 'access', type: 'approval_limit', id: endedId, versionId: endedId },
          operation: 'end-approval-limit',
          changes: [{ kind: 'value', field: 'validTo', before: null, after: start }],
          source: { kind: 'screen' },
        });
      }
      await context.tx.update(approvalLimit).set({ decision: 'Approved' }).where(eq(approvalLimit.id, limitId));
      await context.tx.execute(sql`release savepoint access_approve_limit`);
    } catch (error) {
      if (sqlStateOf(error) !== EXCLUSION_VIOLATION) throw error;
      await context.tx.execute(sql`rollback to savepoint access_approve_limit`);
      return refusal('refused', 'access.limit-overlaps');
    }
    const auditRecord = await this.audit.record(context, {
      ...auditActor(decider),
      record: { module: 'access', type: 'approval_limit', id: limitId, versionId: limitId },
      operation: 'approve-approval-limit',
      changes: [{ kind: 'value', field: 'decision', before: 'Awaiting approval', after: 'Approved' }],
      source: { kind: 'screen' },
    });
    await this.audit.recordAccess(context, { kind: 'permission-changed', outcome: 'succeeded', auditRecord });
    return { kind: 'success', answer: { limitId } };
  }

  /** Records a limit Rejected; it never takes effect (access-and-approvals 9.5). */
  async reject(
    context: TransactionContext,
    decider: Decider,
    limitId: string,
    options: EffectOptions = {},
  ): Promise<Prepared<{ limitId: string }>> {
    await lockUnlessHeld(context, options, { authority: [limitTarget(limitId, 'exclusive')] });
    const [found] = await context.tx.select().from(approvalLimit).where(eq(approvalLimit.id, limitId));
    if (found === undefined) return refusal('not-found', 'access.approval-limit-not-found');
    if (found.decision !== 'Awaiting approval') return refusal('conflict', 'kernel.stale-version');
    await context.tx.update(approvalLimit).set({ decision: 'Rejected' }).where(eq(approvalLimit.id, limitId));
    await this.audit.record(context, {
      ...auditActor(decider),
      record: { module: 'access', type: 'approval_limit', id: limitId, versionId: limitId },
      operation: 'reject-approval-limit',
      changes: [{ kind: 'value', field: 'decision', before: 'Awaiting approval', after: 'Rejected' }],
      source: { kind: 'screen' },
    });
    return { kind: 'success', answer: { limitId } };
  }
}

function auditActor(decider: Decider) {
  return {
    actor: decider.actor,
    ...(decider.roleAssignmentId === undefined ? {} : { roleAssignmentId: decider.roleAssignmentId }),
    ...(decider.approvalDecisionId === undefined ? {} : { approval: { decisionId: decider.approvalDecisionId } }),
    ...(decider.reason === undefined ? {} : { reason: decider.reason }),
  };
}
