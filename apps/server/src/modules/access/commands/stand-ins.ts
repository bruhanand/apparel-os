import { paise, uuidv7 } from '@apparel-os/domain';
import { SETUP_PAGE_CAP } from '@apparel-os/schemas';
import type {
  AssignmentScope,
  LimitAuthority,
  MissingItem,
  MoneyBasis,
  RecordTypeDeclaration,
  SettingOrigin,
  StandInGrantDraft,
  StandInGrantList,
  StandInGrantRecord,
} from '@apparel-os/schemas';
import { and, asc, desc, eq, inArray, lt, sql } from 'drizzle-orm';
import {
  lockTable,
  sqlStateOf,
  type CommandRefusal,
  type LockMode,
  type LockTarget,
  type TransactionContext,
} from '../../../kernel/index.js';
import type { AuditInterface } from '../../audit/index.js';
import { standInGrant, standInGrantAction, standInGrantChange } from '../db/schema.js';
import { limitsThrough } from '../domain/approval-limits.js';
import type { ApprovalRule } from '../domain/approval-rules.js';
import { scopeKeyOf } from '../domain/scope.js';
import { limitGivesAction, placeKey, scopeWithin, type GrantAction, type PlaceCover } from '../domain/stand-ins.js';
import type { ScopeMembers } from '../contracts/scope-members.js';
import { standInChanged } from '../events.js';
import { assignmentsInForce } from '../queries/assignments.js';
import { latestRequests, userNames, versionView } from '../queries/access-records.js';
import { userInForce } from '../queries/users.js';
import {
  lockUnlessHeld,
  rangeOf,
  refusal,
  today,
  type Decider,
  type EffectOptions,
  type Prepared,
  type Preparer,
} from './access-changes.js';
import { limitsInForce } from './approval-limits.js';
import { requestApproval } from './request-approval.js';

// Stand-in grants (access-and-approvals 10, 9.3, 9.11, 13.1; code-house-rules 7.3, 8.2; PRD-ACS-018, POL-02.20; GC3-7,
// DEC-105; S1-F05-T02). A grant is a dated row, its own version: recorded by a holder of the stand-in permission and
// saved Awaiting approval with its request (9.1), it takes effect only when a different authorised person approves it,
// and it ends by itself at its end, since every read checks its dates against today (7.2; DEC-120). No grant is written
// by default: the stand-ins, their scopes, limits and periods are KDPS's (POL-02.20; KDPS Owner question 5).

const STAND_IN_GRANT = lockTable('access', 'stand_in_grant');
const EXCLUSION_VIOLATION = '23P01';

/** A stand-in grant, as a step-0 lock target (code-house-rules 8.2 "Authority first"). */
export function grantTarget(grantId: string, mode: LockMode): LockTarget {
  return { table: STAND_IN_GRANT, id: grantId, mode };
}

/** A page of a setup list (code-house-rules 12.1): after the record `after` names, at most `limit` (the cap). */
export interface SetupPage {
  readonly after?: string | undefined;
  readonly limit?: number | undefined;
}

/** A grant in force for one action type, as who may decide reads it (9.3, 10). */
export interface GrantInForce {
  readonly id: string;
  readonly forUserId: string;
  readonly scope: AssignmentScope;
  readonly action: GrantAction;
}

function actionOf(row: typeof standInGrantAction.$inferSelect): GrantAction {
  return {
    actionType: row.actionType,
    amount: row.amount === null ? null : paise(row.amount),
    unlimited: row.unlimited,
    coversUnknown: row.coversUnknown,
  };
}

function limitOf(action: GrantAction): LimitAuthority {
  if (action.amount !== null) return { kind: 'amount', amount: action.amount };
  return action.unlimited ? { kind: 'unlimited' } : { kind: 'none' };
}

/**
 * The Approved grants to a stand-in in force on a business date that give an action type (10; DEC-120): the dates are
 * checked when read, so a grant ends by itself at its end and a Scheduled one counts from its start.
 */
export async function grantsInForce(
  context: TransactionContext,
  businessDate: string,
  standInUserId: string,
  actionType: string,
): Promise<GrantInForce[]> {
  const rows = await context.tx
    .select({ grant: standInGrant, action: standInGrantAction })
    .from(standInGrant)
    .innerJoin(standInGrantAction, eq(standInGrantAction.standInGrantId, standInGrant.id))
    .where(
      and(
        eq(standInGrant.standInUserId, standInUserId),
        eq(standInGrant.decision, 'Approved'),
        eq(standInGrantAction.actionType, actionType),
        sql`${standInGrant.validDuring} @> ${businessDate}::date`,
      ),
    )
    .orderBy(asc(standInGrant.id));
  return rows.map(({ grant, action }) => ({
    id: grant.id,
    forUserId: grant.forUserId,
    scope: grant.scope as AssignmentScope,
    action: actionOf(action),
  }));
}

/**
 * Whether a grant is wider than the authority of the person stood in for on its dates (access-and-approvals 10): on
 * every day from its start to the day before its end, for each action, one assignment of that person in force grants
 * approve on the action's record type with a scope the grant's is within, and, for a value on a basis, a limit through
 * that same assignment, whose scope the grant's is within, gives the action's limit (9.2, 9.3; PRD-ACS-004,
 * PRD-ACS-016). Authority changes only where an assignment, a version of its role or a limit starts or ends, so each
 * such day within the dates is checked, with the start. Answers the refusal naming the action and the day, or
 * undefined.
 */
async function widerRefusal(
  context: TransactionContext,
  dependencies: {
    readonly rules: ReadonlyMap<string, ApprovalRule>;
    readonly registry: ReadonlyMap<string, RecordTypeDeclaration>;
    readonly scopeMembers: readonly ScopeMembers[];
  },
  draft: Pick<StandInGrantDraft, 'forUserId' | 'scope' | 'validFrom' | 'validTo'> & {
    readonly actions: readonly GrantAction[];
  },
): Promise<CommandRefusal | undefined> {
  const { rules, registry, scopeMembers } = dependencies;
  const actionTypes = sql.join(
    draft.actions.map((action) => sql`${action.actionType}`),
    sql`, `,
  );
  const bounds = await context.tx.execute<{ day: string | null }>(sql`
    with assignments as (
      select role_id, valid_during from access.role_assignment
      where app_user_id = ${draft.forUserId}::uuid and decision = 'Approved' and withdrawal_id is null
    )
    select to_char(day, 'YYYY-MM-DD') as day from (
      select lower(valid_during) as day from assignments union select upper(valid_during) from assignments
      union select lower(v.valid_during) from access.role_version v join assignments a on a.role_id = v.role_id
        where v.decision = 'Approved'
      union select upper(v.valid_during) from access.role_version v join assignments a on a.role_id = v.role_id
        where v.decision = 'Approved'
      union select lower(valid_during) from access.approval_limit
        where decision = 'Approved' and action_type in (${actionTypes})
      union select upper(valid_during) from access.approval_limit
        where decision = 'Approved' and action_type in (${actionTypes})
    ) days where day > ${draft.validFrom}::date and day < ${draft.validTo}::date`);
  const days = [draft.validFrom, ...bounds.rows.flatMap((row) => (row.day === null ? [] : [row.day]))].sort();
  for (const day of days) {
    const assignments = await assignmentsInForce(context, day, draft.forUserId);
    for (const action of draft.actions) {
      const rule = rules.get(action.actionType);
      if (rule === undefined) return { kind: 'refused', code: 'access.action-type-not-declared', missing: [] };
      const limits = rule.value === 'none' ? [] : await limitsInForce(context, day, action.actionType);
      // The places the giver's assignments and limits select, expanded on the day (5.2; PRD-ACS-021).
      const covers = await placeCovers(context, scopeMembers, day, [
        ...assignments.map((assignment) => assignment.scope),
        ...limits.flatMap((limit) => (limit.holder.kind === 'role' ? [limit.holder.scope] : [])),
      ]);
      const covering = assignments.filter(
        (assignment) =>
          assignment.permissions.some(
            (permission) =>
              permission.kind === 'action' &&
              permission.recordType === rule.recordType &&
              permission.action === 'approve',
          ) &&
          registry.has(rule.recordType) &&
          scopeWithin(draft.scope, assignment.scope, covers),
      );
      const given = covering.some(
        (assignment) =>
          rule.value === 'none' ||
          limitsThrough(draft.forUserId, assignment, limits, (scope) => scopeWithin(draft.scope, scope, covers)).some(
            (limit) => limitGivesAction(limit, action),
          ),
      );
      if (!given) {
        const missing: MissingItem[] = [{ kind: 'stand-in-authority', actionType: action.actionType, date: day }];
        return { kind: 'refused', code: 'access.stand-in-wider-than-authority', missing };
      }
    }
  }
  return undefined;
}

/**
 * The Stores and business units each selected Site and Store of the scopes covers on a day, through the scope
 * contract's place expansion (access-and-approvals 5.1, 5.2; structure-and-masters 3.9), keyed by `placeKey`. A place
 * no implementation expands is left out, and is then matched only by itself (10).
 */
async function placeCovers(
  context: TransactionContext,
  scopeMembers: readonly ScopeMembers[],
  day: string,
  scopes: readonly AssignmentScope[],
): Promise<Map<string, PlaceCover>> {
  const covers = new Map<string, PlaceCover>();
  for (const scope of scopes) {
    if (scope.kind !== 'dimensions' || scope.place.kind !== 'selected') continue;
    for (const member of scope.place.members) {
      if (member.type === 'business-unit' || covers.has(placeKey(member))) continue;
      const expander = scopeMembers.find((each) => each.answers.includes(member.type) && each.expand !== undefined);
      const expanded = await expander?.expand?.(context, member, day);
      if (expanded !== undefined) covers.set(placeKey(member), expanded);
    }
  }
  return covers;
}

/** The actions of a draft, with their limits, as the domain reads them. */
function actionsOf(draft: StandInGrantDraft): GrantAction[] {
  return draft.actions.map((action) => ({
    actionType: action.actionType,
    amount: action.limit.kind === 'amount' ? action.limit.amount : null,
    unlimited: action.limit.kind === 'unlimited',
    coversUnknown: action.coversUnknown,
  }));
}

/**
 * Every stand-in grant, newest first, with its actions, each with its rule's basis (PRD-ACS-015), the people named and
 * its state; and the approval action types a grant can give (10, 14). The route's Authorise for view has run; grants
 * carry no scope fact.
 */
export async function listStandInGrants(
  context: TransactionContext,
  todayDate: string,
  rules: ReadonlyMap<string, ApprovalRule>,
  page: SetupPage = {},
): Promise<Omit<StandInGrantList, 'asOf'>> {
  const size = page.limit ?? SETUP_PAGE_CAP;
  const read = await context.tx
    .select({
      grant: standInGrant,
      start: sql<string>`lower(${standInGrant.validDuring})::text`,
      end: sql<string>`upper(${standInGrant.validDuring})::text`,
    })
    .from(standInGrant)
    .where(page.after === undefined ? undefined : lt(standInGrant.id, page.after))
    // Newest first: an identifier is a UUIDv7, in the order the grants were recorded (PRD-MOD-008).
    .orderBy(desc(standInGrant.id))
    .limit(size + 1);
  const grants = read.slice(0, size);
  const next = read.length > size ? (grants.at(-1)?.grant.id ?? null) : null;
  const actions =
    grants.length === 0
      ? []
      : await context.tx
          .select()
          .from(standInGrantAction)
          .where(
            inArray(
              standInGrantAction.standInGrantId,
              grants.map((each) => each.grant.id),
            ),
          )
          .orderBy(asc(standInGrantAction.actionType));
  const names = await userNames(context);
  const requests = await latestRequests(
    context,
    grants.map((each) => each.grant.id),
  );
  const basisOf = (actionType: string): MoneyBasis | null => {
    const value = rules.get(actionType)?.value;
    return value === undefined || value === 'none' ? null : value;
  };
  return {
    actionTypes: [...rules.values()]
      .map((each) => ({ actionType: each.actionType, basis: basisOf(each.actionType) }))
      .sort((a, b) => (a.actionType < b.actionType ? -1 : 1)),
    grants: grants.map(({ grant, start, end }): StandInGrantRecord => {
      const dated = versionView({ id: grant.id, decision: grant.decision, start, end }, todayDate, requests);
      return {
        id: grant.id,
        standIn: { userId: grant.standInUserId, name: names.get(grant.standInUserId) ?? null },
        forUser: { userId: grant.forUserId, name: names.get(grant.forUserId) ?? null },
        actions: actions
          .filter((action) => action.standInGrantId === grant.id)
          .map((row) => {
            const action = actionOf(row);
            return {
              actionType: action.actionType,
              limit: limitOf(action),
              coversUnknown: action.coversUnknown,
              basis: basisOf(action.actionType),
            };
          }),
        scope: grant.scope as AssignmentScope,
        origin: grant.origin as SettingOrigin,
        validFrom: start,
        validTo: end,
        state: dated.state,
        requestId: dated.request?.id ?? null,
      };
    }),
    next,
  };
}

export class StandInGrantChanges {
  constructor(
    private readonly audit: AuditInterface,
    /** Every approval rule of the composition: a grant gives approval actions only (10). */
    private readonly rules: ReadonlyMap<string, ApprovalRule>,
    private readonly registry: ReadonlyMap<string, RecordTypeDeclaration>,
    /** The scope contract's implementations, whose place expansion the never-wider check uses (5.2, 10). */
    private readonly scopeMembers: readonly ScopeMembers[] = [],
  ) {}

  private get widerDependencies() {
    return { rules: this.rules, registry: this.registry, scopeMembers: this.scopeMembers };
  }

  /**
   * Records a stand-in grant (access-and-approvals 10, 9.11; PRD-ACS-018, POL-02.20): two different people, each with
   * a user record; approval action types with a rule, each with a limit on its basis; never wider than the authority of
   * the person stood in for on its dates; starting today or later (GC2-7, DEC-105). Saves it Awaiting approval and
   * requests its approval in the same transaction (9.1), for a different authorised person to decide (GC3-7).
   */
  async prepare(
    context: TransactionContext,
    preparer: Preparer,
    draft: StandInGrantDraft,
  ): Promise<Prepared<{ grantId: string; requestId: string }>> {
    const date = await today(context);
    if (typeof date !== 'string') return { kind: 'refusal', refusal: date };
    if (draft.validFrom < date) return refusal('refused', 'access.starts-in-past');
    if (draft.standInUserId === draft.forUserId) return refusal('refused', 'access.stand-in-for-self');
    for (const userId of [draft.standInUserId, draft.forUserId]) {
      if ((await userInForce(context, userId)) === undefined) {
        return refusal('not-found', 'access.user-not-found', [{ kind: 'user', userId }]);
      }
    }
    for (const action of draft.actions) {
      if (!this.rules.has(action.actionType)) return refusal('refused', 'access.action-type-not-declared');
    }
    const wider = await widerRefusal(context, this.widerDependencies, { ...draft, actions: actionsOf(draft) });
    if (wider !== undefined) return { kind: 'refusal', refusal: wider };
    const scopeKey = scopeKeyOf(draft.scope);
    const range = rangeOf(draft.validFrom, draft.validTo);
    if (await this.overlapping(context, draft.standInUserId, draft.forUserId, scopeKey, range)) {
      return refusal('refused', 'access.stand-in-overlaps');
    }
    const grantId = uuidv7();
    await context.tx.insert(standInGrant).values({
      id: grantId,
      standInUserId: draft.standInUserId,
      forUserId: draft.forUserId,
      scope: draft.scope,
      scopeKey,
      origin: draft.origin,
      validDuring: range,
      decision: 'Awaiting approval',
    });
    await context.tx.insert(standInGrantAction).values(
      actionsOf(draft).map((action) => ({
        id: uuidv7(),
        standInGrantId: grantId,
        actionType: action.actionType,
        amount: action.amount,
        unlimited: action.unlimited,
        coversUnknown: action.coversUnknown,
      })),
    );
    await context.tx
      .insert(standInGrantChange)
      .values({ id: uuidv7(), standInGrantId: grantId, changedByUserId: preparer.userId });
    await this.audit.record(context, {
      actor: { kind: 'user', id: preparer.userId },
      roleAssignmentId: preparer.roleAssignmentId,
      record: { module: 'access', type: 'stand_in_grant', id: grantId, versionId: grantId },
      operation: 'prepare-stand-in-grant',
      changes: [
        { kind: 'value', field: 'standInUserId', before: null, after: draft.standInUserId },
        { kind: 'value', field: 'forUserId', before: null, after: draft.forUserId },
        { kind: 'value', field: 'actions', before: null, after: draft.actions },
        { kind: 'value', field: 'scope', before: null, after: draft.scope },
        { kind: 'value', field: 'origin', before: null, after: draft.origin },
        { kind: 'value', field: 'validFrom', before: null, after: draft.validFrom },
        { kind: 'value', field: 'validTo', before: null, after: draft.validTo },
      ],
      source: { kind: 'screen' },
    });
    // A grant is a dated row, its own version (code-house-rules 7.3).
    const requestId = await requestApproval(context, this.audit, {
      actionType: 'access.stand_in_grant.change',
      document: { recordType: 'access.stand_in_grant', recordId: grantId, versionId: grantId },
      preparer,
    });
    return { kind: 'success', answer: { grantId, requestId } };
  }

  /** Whether an Approved grant of the same key overlaps the dates (code-house-rules 7.3; migration 0041). */
  private async overlapping(
    context: TransactionContext,
    standInUserId: string,
    forUserId: string,
    scopeKey: string,
    range: string,
  ): Promise<boolean> {
    const rows = await context.tx
      .select({ id: standInGrant.id })
      .from(standInGrant)
      .where(
        and(
          eq(standInGrant.standInUserId, standInUserId),
          eq(standInGrant.forUserId, forUserId),
          eq(standInGrant.scopeKey, scopeKey),
          eq(standInGrant.decision, 'Approved'),
          sql`${standInGrant.validDuring} && ${range}::daterange`,
        ),
      );
    return rows.length > 0;
  }

  /** The two people a grant names, neither of whom approves it (10; product owner, 9 Oct 2026; GC3-7). */
  async partiesOf(context: TransactionContext, grantId: string): Promise<string[]> {
    const [found] = await context.tx
      .select({ standIn: standInGrant.standInUserId, forUser: standInGrant.forUserId })
      .from(standInGrant)
      .where(eq(standInGrant.id, grantId));
    return found === undefined ? [] : [found.standIn, found.forUser];
  }

  /** The authority row a decision on a grant locks at step 0, exclusively (code-house-rules 8.2). */
  authorityTargets(grantId: string): LockTarget[] {
    return [grantTarget(grantId, 'exclusive')];
  }

  /**
   * Makes an approved grant take effect from its start (module-map 6.2 flow A): rechecks under its lock that it waits,
   * starts today or later and is still within the authority of the person stood in for on its dates (10), records the
   * decision, its audit and permission-change access records (9.11), and publishes `access.stand-in-changed`.
   */
  async approve(
    context: TransactionContext,
    decider: Decider,
    grantId: string,
    options: EffectOptions = {},
  ): Promise<Prepared<{ grantId: string }>> {
    const date = await today(context);
    if (typeof date !== 'string') return { kind: 'refusal', refusal: date };
    await lockUnlessHeld(context, options, { authority: this.authorityTargets(grantId) });
    const [read] = await context.tx
      .select({
        grant: standInGrant,
        start: sql<string>`lower(${standInGrant.validDuring})::text`,
        end: sql<string>`upper(${standInGrant.validDuring})::text`,
      })
      .from(standInGrant)
      .where(eq(standInGrant.id, grantId));
    if (read === undefined) return refusal('not-found', 'access.stand-in-grant-not-found');
    const { grant, start, end } = read;
    if (grant.decision !== 'Awaiting approval') return refusal('conflict', 'kernel.stale-version');
    if (start < date) return refusal('refused', 'access.starts-in-past');
    const actions = (
      await context.tx.select().from(standInGrantAction).where(eq(standInGrantAction.standInGrantId, grantId))
    ).map(actionOf);
    const wider = await widerRefusal(context, this.widerDependencies, {
      forUserId: grant.forUserId,
      scope: grant.scope as AssignmentScope,
      validFrom: start,
      validTo: end,
      actions,
    });
    if (wider !== undefined) return { kind: 'refusal', refusal: wider };
    const range = rangeOf(start, end);
    if (await this.overlapping(context, grant.standInUserId, grant.forUserId, grant.scopeKey, range)) {
      return refusal('refused', 'access.stand-in-overlaps');
    }
    // Two approved at the same moment: the second meets the exclusion constraint and is refused as overlapping.
    await context.tx.execute(sql`savepoint access_approve_stand_in`);
    try {
      await context.tx.update(standInGrant).set({ decision: 'Approved' }).where(eq(standInGrant.id, grantId));
      await context.tx.execute(sql`release savepoint access_approve_stand_in`);
    } catch (error) {
      if (sqlStateOf(error) !== EXCLUSION_VIOLATION) throw error;
      await context.tx.execute(sql`rollback to savepoint access_approve_stand_in`);
      return refusal('refused', 'access.stand-in-overlaps');
    }
    const auditRecord = await this.audit.record(context, {
      ...auditActor(decider),
      record: { module: 'access', type: 'stand_in_grant', id: grantId, versionId: grantId },
      operation: 'approve-stand-in-grant',
      changes: [{ kind: 'value', field: 'decision', before: 'Awaiting approval', after: 'Approved' }],
      source: { kind: 'screen' },
    });
    await this.audit.recordAccess(context, { kind: 'permission-changed', outcome: 'succeeded', auditRecord });
    await context.publish(standInChanged, {
      subject: { module: 'access', recordType: 'access.stand_in_grant', recordId: grantId, versionId: grantId },
      payload: { grantId, standInUserId: grant.standInUserId, forUserId: grant.forUserId },
    });
    return { kind: 'success', answer: { grantId } };
  }

  /** Records a grant Rejected; it never takes effect (access-and-approvals 9.5). */
  async reject(
    context: TransactionContext,
    decider: Decider,
    grantId: string,
    options: EffectOptions = {},
  ): Promise<Prepared<{ grantId: string }>> {
    await lockUnlessHeld(context, options, { authority: this.authorityTargets(grantId) });
    const [found] = await context.tx.select().from(standInGrant).where(eq(standInGrant.id, grantId));
    if (found === undefined) return refusal('not-found', 'access.stand-in-grant-not-found');
    if (found.decision !== 'Awaiting approval') return refusal('conflict', 'kernel.stale-version');
    await context.tx.update(standInGrant).set({ decision: 'Rejected' }).where(eq(standInGrant.id, grantId));
    await this.audit.record(context, {
      ...auditActor(decider),
      record: { module: 'access', type: 'stand_in_grant', id: grantId, versionId: grantId },
      operation: 'reject-stand-in-grant',
      changes: [{ kind: 'value', field: 'decision', before: 'Awaiting approval', after: 'Rejected' }],
      source: { kind: 'screen' },
    });
    return { kind: 'success', answer: { grantId } };
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
