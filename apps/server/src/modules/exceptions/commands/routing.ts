import { uuidv7 } from '@apparel-os/domain';
import type { ExceptionParty, RoutingList, RoutingVersionDraft } from '@apparel-os/schemas';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { LOCK_STEP, lockTable, type LockTarget, type TransactionContext } from '../../../kernel/index.js';
import type {
  ApprovalRule,
  DocumentEffect,
  EffectDecider,
  EffectOutcome,
  LatestRequest,
  ModuleApprovals,
} from '../../access/index.js';
import type { AuditInterface } from '../../audit/index.js';
import { exceptionRouting, exceptionRoutingVersion, exceptionType } from '../db/schema.js';
import { storedDueRule, type ExceptionTypeRegistration } from '../domain/types.js';
import { done, ensureType, partyColumns, partyOf, refused, today, type Outcome } from './common.js';

// Exception routing (access-and-approvals 12.2; POL-02.16, POL-03.05, DEC-037; PRD-MOD-010; S1-F08-T02): per type
// and Site, the owner, the due-time rule and the escalation, as effective-dated versions kept with their history,
// with no default. The values are KDPS's (V-03); tests use labelled synthetic ones. A version is prepared, then takes
// effect when a different authorised person approves it (12.4 "As built"; POL-02.11), through `access`'s decision
// effect contract (access-and-approvals 9.8b; module-map section 3, rule 6).

const ROUTING = lockTable('exceptions', 'exception_routing');
const ROUTING_VERSION = lockTable('exceptions', 'exception_routing_version');

/** The action type of a routing change and its record type (access-and-approvals 8). */
export const ROUTING_ACTION_TYPE = 'exceptions.exception_routing.change';
export const ROUTING_RECORD_TYPE = 'exceptions.exception_routing';

/**
 * The approval rule of a routing change (access-and-approvals 8): approved by a different authorised person, with no
 * value basis (DM-8), its decision giving a reason from the list (POL-02.23).
 */
export const routingApprovalRule: ApprovalRule = {
  actionType: ROUTING_ACTION_TYPE,
  module: 'exceptions',
  recordType: ROUTING_RECORD_TYPE,
  independent: true,
  value: 'none',
  freeTextReason: false,
  // A routing decision's evidence carries no restricted field class (access-and-approvals 9.5; S1-F08-T03).
  decisionEvidenceClasses: [],
  synthetic: false,
};

/** A routing version that names a later approved one, or starts in the past, cannot take effect (7.3; GC2-7). */
async function startRefusal(
  context: TransactionContext,
  routingId: string,
  validFrom: string,
  except?: string,
): Promise<Outcome<never> | undefined> {
  const date = await today(context);
  if (date.kind === 'refused') return date;
  if (validFrom < date.value) return refused('refused', 'exceptions.starts-in-past');
  const later = await context.tx
    .select({ id: exceptionRoutingVersion.id })
    .from(exceptionRoutingVersion)
    .where(
      and(
        eq(exceptionRoutingVersion.exceptionRoutingId, routingId),
        eq(exceptionRoutingVersion.decision, 'Approved'),
        sql`lower(${exceptionRoutingVersion.validDuring}) >= ${validFrom}::date`,
        except === undefined ? undefined : sql`${exceptionRoutingVersion.id} <> ${except}::uuid`,
      ),
    );
  if (later.length > 0) return refused('refused', 'exceptions.version-overlaps');
  return undefined;
}

/**
 * Prepare a routing version (12.2): frozen as prepared, Awaiting approval, its start today or later (GC2-7, DEC-105),
 * refused while an approved version starts on or after it. The caller has authorised edit on
 * `exceptions.exception_routing`, checked that the owner and the escalation name a user or role that exists, and
 * requests its approval in the same transaction.
 */
export async function prepareRouting(
  context: TransactionContext,
  audit: AuditInterface,
  types: ReadonlyMap<string, ExceptionTypeRegistration>,
  preparer: { readonly userId: string; readonly roleAssignmentId: string },
  draft: RoutingVersionDraft,
): Promise<Outcome<{ routingId: string; versionId: string }>> {
  const type = types.get(draft.typeCode);
  if (type === undefined) {
    return refused('refused', 'exceptions.type-not-registered', [
      { kind: 'exception-type', exceptionType: draft.typeCode },
    ]);
  }
  const date = await today(context);
  if (date.kind === 'refused') return date;
  if (draft.validFrom < date.value) return refused('refused', 'exceptions.starts-in-past');
  const typeId = await ensureType(context, type);
  await context.tx
    .insert(exceptionRouting)
    .values({ id: uuidv7(), exceptionTypeId: typeId, siteId: draft.siteId })
    .onConflictDoNothing();
  const routing = (
    await context.tx
      .select()
      .from(exceptionRouting)
      .where(
        and(
          eq(exceptionRouting.exceptionTypeId, typeId),
          sql`${exceptionRouting.siteId} is not distinct from ${draft.siteId}::uuid`,
        ),
      )
  )[0];
  if (routing === undefined) throw new Error('The routing was not recorded');
  // The routing's versions are prepared and decided under its row's lock at step 1 (code-house-rules 8.2).
  await context.lock(LOCK_STEP.document, [{ table: ROUTING, id: routing.id, mode: 'exclusive' }]);
  const blocked = await startRefusal(context, routing.id, draft.validFrom);
  if (blocked !== undefined) return blocked;
  const versionId = uuidv7();
  const owner = partyColumns(draft.owner);
  const escalation = partyColumns(draft.escalation);
  const { format, ...rule } = draft.dueRule;
  await context.tx.insert(exceptionRoutingVersion).values({
    id: versionId,
    exceptionRoutingId: routing.id,
    ownerUserId: owner.userId,
    ownerRoleId: owner.roleId,
    dueRuleFormat: format,
    dueRule: rule,
    escalationUserId: escalation.userId,
    escalationRoleId: escalation.roleId,
    validDuring: `[${draft.validFrom},)`,
    origin: draft.origin,
    preparedByUserId: preparer.userId,
    decision: 'Awaiting approval',
  });
  await audit.record(context, {
    actor: { kind: 'user', id: preparer.userId },
    roleAssignmentId: preparer.roleAssignmentId,
    record: { module: 'exceptions', type: ROUTING_RECORD_TYPE, id: routing.id, versionId },
    operation: 'prepare-exception-routing-version',
    changes: [
      { kind: 'value', field: 'typeCode', before: null, after: draft.typeCode },
      { kind: 'value', field: 'siteId', before: null, after: draft.siteId },
      { kind: 'value', field: 'owner', before: null, after: draft.owner },
      { kind: 'value', field: 'dueRule', before: null, after: draft.dueRule },
      { kind: 'value', field: 'escalation', before: null, after: draft.escalation },
      { kind: 'value', field: 'validFrom', before: null, after: draft.validFrom },
      { kind: 'value', field: 'origin', before: null, after: draft.origin },
    ],
    source: { kind: 'screen' },
  });
  return done({ routingId: routing.id, versionId });
}

/** The version and its routing, read under the decision's locks. */
async function versionOf(context: TransactionContext, versionId: string) {
  return (
    await context.tx
      .select({
        version: exceptionRoutingVersion,
        from: sql<string>`to_char(lower(${exceptionRoutingVersion.validDuring}), 'YYYY-MM-DD')`,
      })
      .from(exceptionRoutingVersion)
      .where(eq(exceptionRoutingVersion.id, versionId))
  )[0];
}

/**
 * The decision effect of a routing change (access-and-approvals 9.8b; module-map 6.2 flow A step 3): Decide locks the
 * routing and the version at step 1 with the request; approve rechecks under those locks that the version still waits,
 * starts today or later and follows every approved version, ends the open-ended one before it where it starts, and
 * records Approved; reject records Rejected. Each writes its audit record.
 */
export function routingApprovals(audit: AuditInterface): ModuleApprovals {
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
      const blocked = await startRefusal(context, version.exceptionRoutingId, from, version.id);
      if (blocked?.kind === 'refused') return { kind: 'refusal', refusal: blocked.refusal };
      await context.tx.execute(
        sql`update exceptions.exception_routing_version
            set valid_during = daterange(lower(valid_during), ${from}::date)
            where exception_routing_id = ${version.exceptionRoutingId}::uuid and decision = 'Approved'
              and upper_inf(valid_during) and lower(valid_during) < ${from}::date`,
      );
    }
    await context.tx
      .update(exceptionRoutingVersion)
      .set({ decision })
      .where(eq(exceptionRoutingVersion.id, version.id));
    await audit.record(context, {
      actor: decider.actor,
      ...(decider.roleAssignmentId === undefined ? {} : { roleAssignmentId: decider.roleAssignmentId }),
      record: { module: 'exceptions', type: ROUTING_RECORD_TYPE, id: version.exceptionRoutingId, versionId },
      operation: decision === 'Approved' ? 'approve-exception-routing-version' : 'reject-exception-routing-version',
      changes: [{ kind: 'value', field: 'decision', before: 'Awaiting approval', after: decision }],
      ...(decider.reason === undefined ? {} : { reason: decider.reason }),
      source: { kind: 'screen' },
      ...(decider.approvalDecisionId === undefined ? {} : { approval: { decisionId: decider.approvalDecisionId } }),
    });
    return { kind: 'success', answer: { routingId: version.exceptionRoutingId, versionId, decision } };
  };
  const effect: DocumentEffect = {
    targets: async (context, versionId): Promise<LockTarget[]> => {
      const found = await versionOf(context, versionId);
      if (found === undefined) return [];
      return [
        { table: ROUTING, id: found.version.exceptionRoutingId, mode: 'exclusive' },
        { table: ROUTING_VERSION, id: versionId, mode: 'exclusive' },
      ];
    },
    approve: (context, decider, versionId) => decide(context, decider, versionId, 'Approved'),
    reject: (context, decider, versionId) => decide(context, decider, versionId, 'Rejected'),
  };
  return { rules: [routingApprovalRule], effects: new Map([[ROUTING_ACTION_TYPE, effect]]) };
}

/** Setup › Exception rules: every registered type and every routing with its versions and their states (12.2). */
export async function listRouting(
  context: TransactionContext,
  types: ReadonlyMap<string, ExceptionTypeRegistration>,
  names: (parties: readonly ExceptionParty[]) => Promise<(string | null)[]>,
  requests: (versionIds: readonly string[]) => Promise<ReadonlyMap<string, LatestRequest>>,
): Promise<Omit<RoutingList, 'asOf'>> {
  const date = await context.businessDate();
  const routings = await context.tx
    .select({ id: exceptionRouting.id, siteId: exceptionRouting.siteId, typeCode: exceptionType.code })
    .from(exceptionRouting)
    .innerJoin(exceptionType, eq(exceptionType.id, exceptionRouting.exceptionTypeId))
    .orderBy(asc(exceptionType.code), asc(exceptionRouting.id));
  const versions =
    routings.length === 0
      ? []
      : await context.tx
          .select({
            version: exceptionRoutingVersion,
            from: sql<string>`to_char(lower(${exceptionRoutingVersion.validDuring}), 'YYYY-MM-DD')`,
            until: sql<string | null>`to_char(upper(${exceptionRoutingVersion.validDuring}), 'YYYY-MM-DD')`,
          })
          .from(exceptionRoutingVersion)
          .where(
            inArray(
              exceptionRoutingVersion.exceptionRoutingId,
              routings.map((routing) => routing.id),
            ),
          )
          .orderBy(asc(exceptionRoutingVersion.id));
  const pairs = versions.map(({ version }) => ({
    owner: partyOf(version.ownerUserId, version.ownerRoleId),
    escalation: partyOf(version.escalationUserId, version.escalationRoleId),
  }));
  const named = await names(pairs.flatMap((pair) => [pair.owner, pair.escalation]));
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
    types: [...types.values()].map((type) => ({ code: type.code, category: type.category, module: type.module })),
    routings: routings.map((routing) => ({
      id: routing.id,
      typeCode: routing.typeCode,
      siteId: routing.siteId,
      versions: versions.flatMap(({ version, from, until }, index) =>
        version.exceptionRoutingId !== routing.id
          ? []
          : [
              {
                id: version.id,
                owner: { party: partyOf(version.ownerUserId, version.ownerRoleId), name: named[index * 2] ?? null },
                dueRule: storedDueRule(version.dueRuleFormat, version.dueRule),
                escalation: {
                  party: partyOf(version.escalationUserId, version.escalationRoleId),
                  name: named[index * 2 + 1] ?? null,
                },
                validFrom: from,
                validUntil: until,
                origin: version.origin as 'kdps' | 'test-setup' | 'synthetic',
                state: stateOf(version.decision, from, until, latest.get(version.id)),
                requestId: latest.get(version.id)?.id ?? null,
              },
            ],
      ),
    })),
  };
}
