import { uuidv7 } from '@apparel-os/domain';
import {
  dueRuleSchema,
  SETUP_PAGE_CAP,
  type ExceptionParty,
  type MissingItem,
  type WorkItemRoutingDraft,
  type WorkItemRoutingList,
} from '@apparel-os/schemas';
import { and, asc, eq, gt, inArray, sql } from 'drizzle-orm';
import {
  LOCK_STEP,
  lockTable,
  type CommandRefusal,
  type LockTarget,
  type TransactionContext,
} from '../../../kernel/index.js';
import type {
  ApprovalRule,
  DocumentEffect,
  EffectDecider,
  EffectOutcome,
  LatestRequest,
  ModuleApprovals,
} from '../../access/index.js';
import type { AuditInterface } from '../../audit/index.js';
import { workItemRouting, workItemRoutingVersion } from '../db/schema.js';

// Task and approval routing (access-and-approvals 9.4, 11.1, 11.3, 13.2; module-map 4.8; PRD-ACS-010, PRD-MOD-010;
// GC3-8, DEC-105; S1-F05-T02): per action type and Site, the due-time rule and the escalation recipient, as
// effective-dated versions kept with their history, with no default. Set like exception routing (12.2, 12.4 "As
// built"): a version is frozen when prepared and takes effect from its first day once a different authorised person
// approves it, through `access`'s decision-effect contract (9.8b; module-map section 3, rule 6). The values are KDPS's
// (KDPS question 52); tests use labelled synthetic ones.

const ROUTING = lockTable('inbox', 'work_item_routing');
const ROUTING_VERSION = lockTable('inbox', 'work_item_routing_version');

/** The action type of a routing change and its record type (access-and-approvals 8). */
export const WORK_ITEM_ROUTING_ACTION_TYPE = 'inbox.work_item_routing.change';
export const WORK_ITEM_ROUTING_RECORD_TYPE = 'inbox.work_item_routing';

/** The approval rule of a routing change: independent, no value (DM-8), a reason from the list (POL-02.23). */
export const workItemRoutingApprovalRule: ApprovalRule = {
  actionType: WORK_ITEM_ROUTING_ACTION_TYPE,
  module: 'inbox',
  recordType: WORK_ITEM_ROUTING_RECORD_TYPE,
  independent: true,
  value: 'none',
  freeTextReason: false,
  decisionEvidenceClasses: [],
  synthetic: false,
};

export type Outcome<Value> =
  { readonly kind: 'done'; readonly value: Value } | { readonly kind: 'refused'; readonly refusal: CommandRefusal };

function refused<Value>(kind: CommandRefusal['kind'], code: string, missing: MissingItem[] = []): Outcome<Value> {
  return { kind: 'refused', refusal: { kind, code, missing } };
}

async function today(context: TransactionContext): Promise<Outcome<string>> {
  const date = await context.businessDate();
  if (date.kind === 'set') return { kind: 'done', value: date.date };
  return refused('unavailable', 'access.business-date-not-set', [
    { kind: 'setting', setting: 'configuration.timezone' },
  ]);
}

/** The routing version in force for an action type and Site on a date (9.4), or undefined. A null Site is its own key. */
export async function routingInForce(
  context: TransactionContext,
  actionType: string,
  siteId: string | null,
  date: string,
): Promise<typeof workItemRoutingVersion.$inferSelect | undefined> {
  const rows = await context.tx
    .select({ version: workItemRoutingVersion })
    .from(workItemRoutingVersion)
    .innerJoin(workItemRouting, eq(workItemRouting.id, workItemRoutingVersion.workItemRoutingId))
    .where(
      and(
        eq(workItemRouting.actionType, actionType),
        sql`${workItemRouting.siteId} is not distinct from ${siteId}::uuid`,
        eq(workItemRoutingVersion.decision, 'Approved'),
        sql`${workItemRoutingVersion.validDuring} @> ${date}::date`,
      ),
    );
  return rows[0]?.version;
}

/**
 * The due time a routing version gives an item received at an instant (11.1): `elapsed-minutes-v1` is due that whole
 * number of minutes after it. A format this build does not know gives no due time, never a guessed one.
 */
export function dueAtFrom(version: typeof workItemRoutingVersion.$inferSelect, from: Date): Date | null {
  const rule = dueRuleSchema.safeParse({ ...(version.dueRule as object), format: version.dueRuleFormat });
  if (!rule.success) return null;
  return new Date(from.getTime() + rule.data.minutes * 60_000);
}

/** The escalation recipient of a routing version: a named user or a role (11.3). */
export function recipientOf(version: typeof workItemRoutingVersion.$inferSelect): ExceptionParty {
  if (version.escalationUserId !== null) return { kind: 'user', userId: version.escalationUserId };
  if (version.escalationRoleId !== null) return { kind: 'role', roleId: version.escalationRoleId };
  throw new Error('A routing version names an escalation recipient');
}

/** A version that starts in the past, or before an approved one, cannot take effect (code-house-rules 7.3; GC2-7). */
async function startRefusal(
  context: TransactionContext,
  routingId: string,
  validFrom: string,
  except?: string,
): Promise<Outcome<never> | undefined> {
  const date = await today(context);
  if (date.kind === 'refused') return date;
  if (validFrom < date.value) return refused('refused', 'inbox.starts-in-past');
  const later = await context.tx
    .select({ id: workItemRoutingVersion.id })
    .from(workItemRoutingVersion)
    .where(
      and(
        eq(workItemRoutingVersion.workItemRoutingId, routingId),
        eq(workItemRoutingVersion.decision, 'Approved'),
        sql`lower(${workItemRoutingVersion.validDuring}) >= ${validFrom}::date`,
        except === undefined ? undefined : sql`${workItemRoutingVersion.id} <> ${except}::uuid`,
      ),
    );
  if (later.length > 0) return refused('refused', 'inbox.version-overlaps');
  return undefined;
}

/**
 * Prepare a routing version (9.4, 11.3): for an action type an approval rule has, which its approvals and the tasks
 * of its work carry; frozen as prepared, Awaiting approval, starting today or later; refused while an approved version
 * starts on or after it. The caller has authorised edit on `inbox.work_item_routing`, checked that the escalation names
 * a user or role that exists and that the Site exists, and requests its approval in the same transaction.
 */
export async function prepareRouting(
  context: TransactionContext,
  audit: AuditInterface,
  routable: ReadonlySet<string>,
  preparer: { readonly userId: string; readonly roleAssignmentId: string },
  draft: WorkItemRoutingDraft,
): Promise<Outcome<{ routingId: string; versionId: string }>> {
  if (!routable.has(draft.actionType)) {
    return refused('refused', 'inbox.action-type-not-routable', [
      { kind: 'action-type', actionType: draft.actionType },
    ]);
  }
  const date = await today(context);
  if (date.kind === 'refused') return date;
  if (draft.validFrom < date.value) return refused('refused', 'inbox.starts-in-past');
  await context.tx
    .insert(workItemRouting)
    .values({ id: uuidv7(), actionType: draft.actionType, siteId: draft.siteId })
    .onConflictDoNothing();
  const routing = (
    await context.tx
      .select()
      .from(workItemRouting)
      .where(
        and(
          eq(workItemRouting.actionType, draft.actionType),
          sql`${workItemRouting.siteId} is not distinct from ${draft.siteId}::uuid`,
        ),
      )
  )[0];
  if (routing === undefined) throw new Error('The routing was not recorded');
  // The routing's versions are prepared and decided under its row's lock at step 1 (code-house-rules 8.2).
  await context.lock(LOCK_STEP.document, [{ table: ROUTING, id: routing.id, mode: 'exclusive' }]);
  const blocked = await startRefusal(context, routing.id, draft.validFrom);
  if (blocked !== undefined) return blocked;
  const versionId = uuidv7();
  const { format, ...rule } = draft.dueRule;
  await context.tx.insert(workItemRoutingVersion).values({
    id: versionId,
    workItemRoutingId: routing.id,
    dueRuleFormat: format,
    dueRule: rule,
    escalationUserId: draft.escalation.kind === 'user' ? draft.escalation.userId : null,
    escalationRoleId: draft.escalation.kind === 'role' ? draft.escalation.roleId : null,
    validDuring: `[${draft.validFrom},)`,
    origin: draft.origin,
    preparedByUserId: preparer.userId,
    decision: 'Awaiting approval',
  });
  await audit.record(context, {
    actor: { kind: 'user', id: preparer.userId },
    roleAssignmentId: preparer.roleAssignmentId,
    record: { module: 'inbox', type: WORK_ITEM_ROUTING_RECORD_TYPE, id: routing.id, versionId },
    operation: 'prepare-work-item-routing-version',
    changes: [
      { kind: 'value', field: 'actionType', before: null, after: draft.actionType },
      { kind: 'value', field: 'siteId', before: null, after: draft.siteId },
      { kind: 'value', field: 'dueRule', before: null, after: draft.dueRule },
      { kind: 'value', field: 'escalation', before: null, after: draft.escalation },
      { kind: 'value', field: 'validFrom', before: null, after: draft.validFrom },
      { kind: 'value', field: 'origin', before: null, after: draft.origin },
    ],
    source: { kind: 'screen' },
  });
  return { kind: 'done', value: { routingId: routing.id, versionId } };
}

async function versionOf(context: TransactionContext, versionId: string) {
  return (
    await context.tx
      .select({
        version: workItemRoutingVersion,
        from: sql<string>`to_char(lower(${workItemRoutingVersion.validDuring}), 'YYYY-MM-DD')`,
      })
      .from(workItemRoutingVersion)
      .where(eq(workItemRoutingVersion.id, versionId))
  )[0];
}

/**
 * The decision effect of a routing change (access-and-approvals 9.8b; module-map 6.2 flow A step 3): Decide locks the
 * routing and the version at step 1 with the request; approve rechecks under those locks that the version still waits,
 * starts today or later and follows every approved version, ends the open-ended one before it where it starts, and
 * records Approved; reject records Rejected. Each writes its audit record.
 */
export function workItemRoutingApprovals(audit: AuditInterface): ModuleApprovals {
  const decide = async (
    context: TransactionContext,
    decider: EffectDecider,
    versionId: string,
    decision: 'Approved' | 'Rejected',
  ): Promise<EffectOutcome> => {
    const found = await versionOf(context, versionId);
    if (found === undefined) {
      return {
        kind: 'refusal',
        refusal: { kind: 'not-found', code: 'access.approval-request-not-found', missing: [] },
      };
    }
    const { version, from } = found;
    if (version.decision !== 'Awaiting approval') {
      return { kind: 'refusal', refusal: { kind: 'refused', code: 'access.approval-not-open', missing: [] } };
    }
    if (decision === 'Approved') {
      const blocked = await startRefusal(context, version.workItemRoutingId, from, version.id);
      if (blocked?.kind === 'refused') return { kind: 'refusal', refusal: blocked.refusal };
      await context.tx.execute(
        sql`update inbox.work_item_routing_version
            set valid_during = daterange(lower(valid_during), ${from}::date)
            where work_item_routing_id = ${version.workItemRoutingId}::uuid and decision = 'Approved'
              and upper_inf(valid_during) and lower(valid_during) < ${from}::date`,
      );
    }
    await context.tx.update(workItemRoutingVersion).set({ decision }).where(eq(workItemRoutingVersion.id, version.id));
    await audit.record(context, {
      actor: decider.actor,
      ...(decider.roleAssignmentId === undefined ? {} : { roleAssignmentId: decider.roleAssignmentId }),
      record: { module: 'inbox', type: WORK_ITEM_ROUTING_RECORD_TYPE, id: version.workItemRoutingId, versionId },
      operation: decision === 'Approved' ? 'approve-work-item-routing-version' : 'reject-work-item-routing-version',
      changes: [{ kind: 'value', field: 'decision', before: 'Awaiting approval', after: decision }],
      ...(decider.reason === undefined ? {} : { reason: decider.reason }),
      source: { kind: 'screen' },
      ...(decider.approvalDecisionId === undefined ? {} : { approval: { decisionId: decider.approvalDecisionId } }),
    });
    return { kind: 'success', answer: { routingId: version.workItemRoutingId, versionId, decision } };
  };
  const effect: DocumentEffect = {
    targets: async (context, versionId): Promise<LockTarget[]> => {
      const found = await versionOf(context, versionId);
      if (found === undefined) return [];
      return [
        { table: ROUTING, id: found.version.workItemRoutingId, mode: 'exclusive' },
        { table: ROUTING_VERSION, id: versionId, mode: 'exclusive' },
      ];
    },
    approve: (context, decider, versionId) => decide(context, decider, versionId, 'Approved'),
    reject: (context, decider, versionId) => decide(context, decider, versionId, 'Rejected'),
  };
  return { rules: [workItemRoutingApprovalRule], effects: new Map([[WORK_ITEM_ROUTING_ACTION_TYPE, effect]]) };
}

/** Setup › Exception rules, approvals and tasks: the action types, and every routing with its versions (9.4, 14). */
export async function listRouting(
  context: TransactionContext,
  actionTypes: readonly { readonly actionType: string; readonly module: string }[],
  names: (parties: readonly ExceptionParty[]) => Promise<(string | null)[]>,
  requests: (versionIds: readonly string[]) => Promise<ReadonlyMap<string, LatestRequest>>,
  page: { readonly after?: string | undefined; readonly limit?: number | undefined } = {},
): Promise<Omit<WorkItemRoutingList, 'asOf'>> {
  const date = await context.businessDate();
  const size = page.limit ?? SETUP_PAGE_CAP;
  const read = await context.tx
    .select()
    .from(workItemRouting)
    .where(page.after === undefined ? undefined : gt(workItemRouting.id, page.after))
    .orderBy(asc(workItemRouting.id))
    .limit(size + 1);
  const routings = read.slice(0, size);
  const next = read.length > size ? (routings.at(-1)?.id ?? null) : null;
  const versions =
    routings.length === 0
      ? []
      : await context.tx
          .select({
            version: workItemRoutingVersion,
            from: sql<string>`to_char(lower(${workItemRoutingVersion.validDuring}), 'YYYY-MM-DD')`,
            until: sql<string | null>`to_char(upper(${workItemRoutingVersion.validDuring}), 'YYYY-MM-DD')`,
          })
          .from(workItemRoutingVersion)
          .where(
            inArray(
              workItemRoutingVersion.workItemRoutingId,
              routings.map((routing) => routing.id),
            ),
          )
          .orderBy(asc(workItemRoutingVersion.id));
  const named = await names(versions.map(({ version }) => recipientOf(version)));
  const latest = await requests(versions.map(({ version }) => version.id));
  const stateOf = (decision: string, from: string, until: string | null, request: LatestRequest | undefined) => {
    if (decision === 'Rejected') return 'Rejected' as const;
    if (decision === 'Awaiting approval')
      return request?.state === 'Superseded' ? ('Superseded' as const) : ('Awaiting approval' as const);
    if (date.kind === 'set' && from > date.date) return 'Scheduled' as const;
    if (date.kind === 'set' && until !== null && until <= date.date) return 'Ended' as const;
    return 'In force' as const;
  };
  return {
    actionTypes: [...actionTypes].sort((a, b) => (a.actionType < b.actionType ? -1 : 1)),
    routings: routings.map((routing) => ({
      id: routing.id,
      actionType: routing.actionType,
      siteId: routing.siteId,
      versions: versions.flatMap(({ version, from, until }, index) =>
        version.workItemRoutingId !== routing.id
          ? []
          : [
              {
                id: version.id,
                dueRule: dueRuleSchema.parse({
                  ...(version.dueRule as object),
                  format: version.dueRuleFormat,
                }),
                escalation: { party: recipientOf(version), name: named[index] ?? null },
                validFrom: from,
                validUntil: until,
                origin: version.origin as 'kdps' | 'test-setup' | 'synthetic',
                state: stateOf(version.decision, from, until, latest.get(version.id)),
                requestId: latest.get(version.id)?.id ?? null,
              },
            ],
      ),
    })),
    next,
  };
}
