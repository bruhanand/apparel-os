import { uuidv7 } from '@apparel-os/domain';
import type { AccessActionType, LimitStanding, MissingItem, RecordTypeDeclaration } from '@apparel-os/schemas';
import { and, eq, inArray, sql } from 'drizzle-orm';
import {
  CommandDefect,
  LOCK_STEP,
  lockTable,
  scopeFactsOf,
  type CommandRefusal,
  type LockTarget,
  type TransactionContext,
} from '../../../kernel/index.js';
import type { AuditInterface, AuditScope } from '../../audit/index.js';
import { DECISION_EVIDENCE_KIND, type DecisionEvidence } from '../contracts/decision-evidence.js';
import { approvalDecision, approvalReason, approvalReasonVersion, approvalRequest } from '../db/schema.js';
import { authorityOf, offeredTo, type Authority, type LimitedValue, type LimitRow } from '../domain/approval-limits.js';
import type { ApprovalRule, DocumentEffect } from '../domain/approval-rules.js';
import type { OrganisationKeys } from '../domain/organisation-keys.js';
import { scopeCoversMove } from '../domain/scope.js';
import { approvalDecided } from '../events.js';
import { userNames } from '../queries/access-records.js';
import { assignmentsInForce } from '../queries/assignments.js';
import { authorise, authorisingAssignments } from '../queries/authorise.js';
import { limitsInForce, type ApprovalLimitChanges } from './approval-limits.js';
import { identityTarget, limitTarget, reliedAuthority } from './authority.js';
import { batchRefusal, bulkAllowedToday, openBatch, type BatchInput, type BatchOutcome } from './bulk.js';
import { grantsInForce, grantTarget, type GrantInForce, type StandInGrantChanges } from './stand-ins.js';
import { grantActionCovers, type GrantAction } from '../domain/stand-ins.js';
import { userInForce } from '../queries/users.js';
import type { AccessChanges, Decider, Prepared } from './access-changes.js';
import type { ApprovalSettingsChanges } from './approval-settings.js';
import type { SecuritySettingsChanges } from './security-settings.js';
import { checkFreshCode, takeFreshCode } from './fresh-code.js';
import { approvalValueOf, preparersOf, requestFacts, storedPreparers } from './request-approval.js';
import type { UserChanges } from './user-changes.js';

// Deciding an approval request (access-and-approvals 9.3, 9.5, 9.6; module-map 6.2 flow A; PRD-ACS-006,
// PRD-ACS-007, PRD-ACS-010; POL-02.07, POL-02.08, POL-02.23; DEC-104, DEC-116, DEC-117; S1-F01-T13).

const APPROVAL_REQUEST = lockTable('access', 'approval_request');

/** Who decides: a person, or, refused, a service identity (access-and-approvals 2.3, 9.3; PRD-SEC-018). */
export interface DecidingActor {
  readonly kind: 'user' | 'service-identity';
  readonly id: string;
}

/** A decision as the route gives it (access-and-approvals 9.5). */
export interface DecisionInput {
  readonly requestId: string;
  readonly versionId: string;
  readonly outcome: 'approve' | 'reject';
  readonly reason:
    { readonly kind: 'listed'; readonly reasonId: string } | { readonly kind: 'free-text'; readonly text: string };
  readonly comment?: string | undefined;
  /** The evidence files, each stored first through files-imports and linked in the decision (9.5; S1-F08-T03). */
  readonly evidence?: readonly { readonly storedFileId: string; readonly fileReceiptId: string }[] | undefined;
  readonly totpCode: string;
}

/** One item of a bulk approval, decided in its own transaction under its batch (9.9; S1-F05-T02). */
export interface BatchItemInput {
  readonly batchId: string;
  readonly requestId: string;
  readonly versionId: string;
  readonly reason: { readonly kind: 'listed'; readonly reasonId: string };
  readonly comment?: string | undefined;
}

export interface DecisionAnswer {
  readonly requestId: string;
  readonly decisionId: string;
  readonly outcome: 'Approved' | 'Rejected';
}

/** A decision's outcome; a refusal says whether a secret caused it, so it is never kept (code-house-rules 12.5). */
export type DecisionOutcome =
  | { readonly kind: 'success'; readonly answer: DecisionAnswer }
  | { readonly kind: 'refusal'; readonly refusal: CommandRefusal; readonly causedBySecret: boolean };

/** Whether a reader may decide a request now, or what is missing (PRD-UXP-003). */
export type Decidable =
  | {
      readonly kind: 'available';
      readonly reason: 'listed' | 'free-text';
      readonly outcomes: ('approve' | 'reject')[];
      readonly missing: MissingItem[];
    }
  | { readonly kind: 'unavailable'; readonly code: string; readonly missing: MissingItem[] };

type RequestRow = typeof approvalRequest.$inferSelect;

/**
 * Whether a person may decide a request now (access-and-approvals 9.3): the assignment and the limit relied on, and,
 * through a stand-in grant, the grant and the person stood in for, whose assignment and limit they are (10); or the
 * refusal.
 */
type Eligibility =
  | {
      readonly kind: 'eligible';
      readonly roleAssignmentId: string;
      readonly alsoRelied: readonly string[];
      /** The limit relied on, for a value on a basis (9.5). */
      readonly limit?: LimitRow;
      /** The stand-in grant relied on (10; S1-F05-T02). */
      readonly standIn?: { readonly grantId: string; readonly forUserId: string; readonly action: GrantAction };
    }
  | { readonly kind: 'refused'; readonly refusal: CommandRefusal };

/** What Decide does with one kind of document (module-map 6.2 flow A). */
interface DocumentHandler {
  /**
   * The authority rows the decision changes, which Decide locks exclusively at step 0 with the approver's own
   * (code-house-rules 8.2 "Authority first"; RR-325): a user being changed, an assignment taking effect or withdrawn.
   */
  authorityTargets?(context: TransactionContext, versionId: string): Promise<LockTarget[]>;
  /** The rows Decide locks with the request at step 1 (code-house-rules 8.2). */
  targets(context: TransactionContext, versionId: string): Promise<LockTarget[]>;
  /** The action types of other documents the decision decides with it, whose approve the decider needs too. */
  decidesWith?(context: TransactionContext, versionId: string): Promise<readonly string[]>;
  /**
   * The people the document names who may not decide it besides its preparers, such as the two people of a stand-in
   * grant (access-and-approvals 10; product owner, 9 Oct 2026).
   */
  parties?(context: TransactionContext, versionId: string): Promise<readonly string[]>;
  /** A check of the document's own, under the locks, before the code is taken. */
  precheck?(context: TransactionContext, versionId: string): Promise<CommandRefusal | undefined>;
  approve(context: TransactionContext, decider: Decider, versionId: string): Promise<Prepared<unknown>>;
  reject(
    context: TransactionContext,
    decider: Decider & { readonly approvalDecisionId: string },
    versionId: string,
  ): Promise<Prepared<unknown>>;
}

function refused(kind: CommandRefusal['kind'], code: string, missing: MissingItem[] = []): DecisionOutcome {
  return { kind: 'refusal', refusal: { kind, code, missing }, causedBySecret: false };
}

const HELD = { locksHeld: true } as const;

/** The document's scope facts the request froze (9.1), as an attachment keeps them; a null fact is Unknown. */
function scopeOf(request: RequestRow): AuditScope {
  const { legalEntityId, siteId, storeId, businessUnitId, brandId } = request;
  return scopeFactsOf({ legalEntityId, siteId, storeId, businessUnitId, brandId });
}

/** The refusals of a person who would decide a valued request but for their limit (9.3; S1-F05-T01). */
const LIMIT_CODES: ReadonlySet<string> = new Set([
  'access.no-approval-limit',
  'access.above-approval-limit',
  'access.unknown-value-not-covered',
]);

/** A valued request's value on its basis, Unknown unless known (PRD-ACS-016, PRD-MOD-015). */
function valueOf(request: RequestRow): LimitedValue {
  const value = approvalValueOf(request);
  return value.kind === 'known' ? { kind: 'known', amountPaise: value.amount } : { kind: 'unknown' };
}

/** Another module's document: Decide changes nothing of it (module-map 6.2; access-and-approvals 9.5, 9.8). */
const MODULE_DOCUMENT: DocumentHandler = {
  targets: () => Promise.resolve([]),
  approve: () => Promise.resolve({ kind: 'success', answer: {} }),
  reject: () => Promise.resolve({ kind: 'success', answer: {} }),
};

/** A module's decision effect as Decide runs it, with the approver who decides (9.8b). */
function moduleEffect(effect: DocumentEffect): DocumentHandler {
  const decider = (d: Decider) => {
    if (d.actor.kind !== 'user') throw new CommandDefect('Only a person decides (access-and-approvals 9.3)');
    return {
      actor: { kind: 'user' as const, id: d.actor.id },
      ...(d.roleAssignmentId === undefined ? {} : { roleAssignmentId: d.roleAssignmentId }),
      ...(d.approvalDecisionId === undefined ? {} : { approvalDecisionId: d.approvalDecisionId }),
      ...(d.reason === undefined ? {} : { reason: d.reason }),
    };
  };
  return {
    targets: (c, v) => effect.targets(c, v),
    ...(effect.decidesWith === undefined
      ? {}
      : { decidesWith: (c: TransactionContext, v: string) => effect.decidesWith?.(c, v) ?? Promise.resolve([]) }),
    approve: (c, d, v) => effect.approve(c, decider(d), v),
    reject: (c, d, v) => effect.reject(c, decider(d), v),
  };
}

export class Approvals {
  private readonly handlers: ReadonlyMap<AccessActionType, DocumentHandler>;

  constructor(
    private readonly dependencies: {
      readonly audit: AuditInterface;
      readonly registry: ReadonlyMap<string, RecordTypeDeclaration>;
      readonly changes: AccessChanges;
      readonly users: UserChanges;
      readonly settings: ApprovalSettingsChanges;
      readonly securitySettings: SecuritySettingsChanges;
      /** Approval limits: their changes, decided here like any access change (9.2, 9.11; S1-F05-T01). */
      readonly limits: ApprovalLimitChanges;
      /** Stand-in grants: their changes, decided here like any access change (10; S1-F05-T02). */
      readonly standIns: StandInGrantChanges;
      readonly keys?: OrganisationKeys | undefined;
      /** Every approval rule of the composition: access's own and the modules' (access-and-approvals 8). */
      readonly rules: ReadonlyMap<string, ApprovalRule>;
      /** The effects of decisions on modules' master versions, by action type (9.8b; module-map 6.2 flow A). */
      readonly effects?: ReadonlyMap<string, DocumentEffect>;
      /** Where a decision's evidence files are linked: the contract files-imports implements (9.5; S1-F08-T03). */
      readonly evidence?: DecisionEvidence | undefined;
    },
  ) {
    const { changes, users, settings, securitySettings, limits, standIns } = dependencies;
    this.handlers = new Map<AccessActionType, DocumentHandler>([
      [
        'access.stand_in_grant.change',
        {
          // The grant, exclusively at step 0: a decision relying on it locks it shared (code-house-rules 8.2).
          authorityTargets: (_c, v) => Promise.resolve(standIns.authorityTargets(v)),
          targets: () => Promise.resolve([]),
          // Neither the stand-in nor the person stood in for approves the grant (product owner, 9 Oct 2026; GC3-7).
          parties: (c, v) => standIns.partiesOf(c, v),
          approve: (c, d, v) => standIns.approve(c, d, v, HELD),
          reject: (c, d, v) => standIns.reject(c, d, v, HELD),
        },
      ],
      [
        'access.approval_limit.change',
        {
          // The limit, and those its approval ends on its start, exclusively at step 0: a decision relying on one of
          // them locks it shared (code-house-rules 8.2; S1-F05-T01).
          authorityTargets: (c, v) => limits.authorityTargets(c, v),
          targets: () => Promise.resolve([]),
          approve: (c, d, v) => limits.approve(c, d, v, HELD),
          reject: (c, d, v) => limits.reject(c, d, v, HELD),
        },
      ],
      [
        'access.role.change',
        {
          // The role, exclusively at step 0: its version takes effect, and commands relying on it lock it shared
          // (code-house-rules 8.2; DEC-118, RR-360).
          authorityTargets: (c, v) => changes.roleVersionAuthorityTargets(c, v),
          targets: (_c, v) => Promise.resolve(changes.roleVersionTargets(v)),
          approve: (c, d, v) => changes.approveRoleVersion(c, d, v, HELD),
          reject: (c, d, v) => changes.rejectRoleVersion(c, d, v, HELD),
        },
      ],
      [
        'access.role_assignment.change',
        {
          authorityTargets: (_c, v) => Promise.resolve(changes.assignmentTargets(v)),
          targets: () => Promise.resolve([]),
          // A new user's assignment waits until the user's first version is approved (4.3; DEC-116).
          precheck: async (c, v) => {
            const userId = await changes.assignmentUser(c, v);
            if (typeof userId === 'string' && !(await users.hasApprovedVersion(c, userId))) {
              return {
                kind: 'refused',
                code: 'access.user-not-approved',
                missing: [{ kind: 'approval', recordType: 'access.user', recordId: userId }],
              };
            }
            return undefined;
          },
          approve: (c, d, v) => changes.approveAssignment(c, d, v, HELD),
          reject: (c, d, v) => changes.rejectAssignment(c, d, v, HELD),
        },
      ],
      [
        'access.role_assignment.withdrawal',
        {
          authorityTargets: (c, v) => changes.withdrawalAuthorityTargets(c, v),
          targets: (_c, v) => Promise.resolve(changes.withdrawalTargets(v)),
          approve: (c, d, v) => changes.approveWithdrawal(c, d, v, HELD),
          reject: (c, d, v) => changes.rejectWithdrawal(c, d, v, HELD),
        },
      ],
      [
        'access.approval_reason.change',
        {
          targets: (_c, v) => Promise.resolve(settings.reasonVersionTargets(v)),
          approve: (c, d, v) => settings.approveReasonVersion(c, d, v, HELD),
          reject: (c, d, v) => settings.rejectReasonVersion(c, d, v, HELD),
        },
      ],
      [
        'access.approval_rule_setting.change',
        {
          targets: (_c, v) => Promise.resolve(settings.ruleSettingVersionTargets(v)),
          approve: (c, d, v) => settings.approveRuleSettingVersion(c, d, v, HELD),
          reject: (c, d, v) => settings.rejectRuleSettingVersion(c, d, v, HELD),
        },
      ],
      [
        'access.setting.change',
        {
          // The setting with the version at step 1, so two decisions on one setting never pass each other (8.2).
          targets: (c, v) => securitySettings.versionTargets(c, v),
          approve: (c, d, v) => securitySettings.approve(c, d, v, HELD),
          reject: (c, d, v) => securitySettings.reject(c, d, v, HELD),
        },
      ],
      [
        'access.user.change',
        {
          // The user's identity row and pending assignments at step 0, their open requests at step 1: rejecting the
          // user's first version withdraws them in the same transaction (4.3; DEC-116, DEC-117).
          authorityTargets: async (c, v) => {
            const userId = await users.userOfVersion(c, v);
            if (userId === undefined) return [];
            const pending = await changes.pendingAssignmentsOf(c, userId);
            return [
              identityTarget({ kind: 'user', id: userId }, 'exclusive'),
              ...pending.flatMap((id) => changes.assignmentTargets(id)),
            ];
          },
          targets: async (c, v) => {
            const userId = await users.userOfVersion(c, v);
            const pending = userId === undefined ? [] : await changes.pendingAssignmentsOf(c, userId);
            const requests = await this.openRequestsOf(c, pending);
            return [
              ...users.userVersionTargets(v),
              ...requests.map((request) => ({ table: APPROVAL_REQUEST, id: request.id, mode: 'exclusive' as const })),
            ];
          },
          approve: (c, d, v) => users.approveUserVersion(c, d, v, HELD),
          reject: async (c, d, v) => {
            const rejected = await users.rejectUserVersion(c, d, v, HELD);
            if (rejected.kind !== 'success' || !rejected.answer.firstVersionRejected) return rejected;
            for (const assignmentId of await changes.pendingAssignmentsOf(c, rejected.answer.userId)) {
              if (!(await changes.withdrawBeforeApproval(c, d, assignmentId, d.actor.id))) continue;
              for (const request of await this.openRequestsOf(c, [assignmentId])) {
                await this.close(c, d, request, 'Withdrawn');
              }
            }
            return rejected;
          },
        },
      ],
    ]);
  }

  private ruleOf(actionType: string): ApprovalRule {
    const rule = this.dependencies.rules.get(actionType);
    if (rule === undefined) throw new CommandDefect(`No approval rule for action type ${actionType}`);
    return rule;
  }

  private handlerOf(actionType: string): DocumentHandler {
    // Another module's document. A master version takes effect in the decision's transaction through the effect its
    // module implements (9.8b; module-map 6.2 flow A). Otherwise the decision is recorded and nothing else happens in
    // Decide; the owning module posts it in its own command, verifying the decision under its locks and recording its
    // use there (9.7, 9.8; DEC-097).
    if (this.ruleOf(actionType).module !== 'access') {
      const effect = this.dependencies.effects?.get(actionType);
      return effect === undefined ? MODULE_DOCUMENT : moduleEffect(effect);
    }
    const handler = this.handlers.get(actionType as AccessActionType);
    if (handler === undefined) throw new CommandDefect(`No document handler for action type ${actionType}`);
    return handler;
  }

  /** The open requests on the documents named (by document version, an assignment being its own version). */
  private async openRequestsOf(context: TransactionContext, versionIds: readonly string[]): Promise<RequestRow[]> {
    if (versionIds.length === 0) return [];
    return context.tx
      .select()
      .from(approvalRequest)
      .where(
        and(
          inArray(approvalRequest.documentVersionId, [...versionIds]),
          eq(approvalRequest.state, 'Awaiting approval'),
        ),
      );
  }

  private async findRequest(context: TransactionContext, requestId: string): Promise<RequestRow | undefined> {
    const [row] = await context.tx.select().from(approvalRequest).where(eq(approvalRequest.id, requestId));
    return row;
  }

  /** Closes a request that leaves Awaiting approval without a decision of its own (9.6; DEC-117), and publishes it. */
  private async close(
    context: TransactionContext,
    decider: Decider,
    request: RequestRow,
    state: 'Withdrawn',
  ): Promise<void> {
    await context.tx.update(approvalRequest).set({ state }).where(eq(approvalRequest.id, request.id));
    await this.dependencies.audit.record(context, {
      actor: decider.actor,
      ...(decider.roleAssignmentId === undefined ? {} : { roleAssignmentId: decider.roleAssignmentId }),
      ...(decider.approvalDecisionId === undefined ? {} : { approval: { decisionId: decider.approvalDecisionId } }),
      record: { module: 'access', type: 'approval_request', id: request.id, versionId: request.documentVersionId },
      operation: 'withdraw-approval-request',
      changes: [{ kind: 'value', field: 'state', before: 'Awaiting approval', after: state }],
      source: { kind: 'screen' },
    });
    await this.publishClosed(context, request, state);
  }

  private async publishClosed(
    context: TransactionContext,
    request: RequestRow,
    state: 'Approved' | 'Rejected' | 'Withdrawn',
    decisionId?: string,
  ): Promise<void> {
    await context.publish(approvalDecided, {
      subject: {
        module: 'access',
        recordType: 'access.approval_request',
        recordId: request.id,
        versionId: request.documentVersionId,
      },
      payload: {
        requestId: request.id,
        state,
        ...(decisionId === undefined ? {} : { decisionId }),
        preparerIds: await storedPreparers(context, request.id),
        documentRecordType: request.documentRecordType,
        documentRecordId: request.documentRecordId,
        documentVersionId: request.documentVersionId,
      },
    });
  }

  /**
   * Who may decide (access-and-approvals 9.3): a person, never a service identity (PRD-SEC-018); Active today; holding
   * one assignment in force that grants approve on the request's record type, covering its facts (PRD-ACS-001,
   * PRD-ACS-004); none of its preparers, through any role (PRD-ACS-006, POL-02.08); and, for a value on a basis, a
   * limit through that same assignment that covers it, or explicit authority over Unknown value (9.2; POL-02.09,
   * PRD-ACS-016; S1-F05-T01). An action with no value, or no value limit, needs only approve (DM-8). Answers the
   * assignment and the limit relied on, or the refusal.
   */
  private async eligibility(
    context: TransactionContext,
    actor: DecidingActor,
    request: RequestRow,
    through: 'any' | 'own-assignments' = 'any',
  ): Promise<Eligibility> {
    const own = await this.ownEligibility(context, actor, request);
    // Through a stand-in grant (access-and-approvals 9.3, 10; PRD-ACS-018): only when the person's own assignments do
    // not make them eligible, and never past a refusal that no grant changes, such as their own preparation.
    if (own.kind === 'eligible' || through === 'own-assignments' || actor.kind !== 'user') return own;
    if (!['access.not-eligible', ...LIMIT_CODES].includes(own.refusal.code)) return own;
    if (own.refusal.missing.some((item) => item.kind === 'user-state' || item.kind === 'person')) return own;
    return (await this.grantEligibility(context, actor, request)) ?? own;
  }

  /**
   * Eligibility through a stand-in grant (access-and-approvals 9.3, 10; PRD-ACS-018, POL-02.20; S1-F05-T02): a grant to
   * the person in force today for the request's action type, whose scope covers the request's facts (5.3) and whose
   * limit covers its value (9.2); the person is none of its preparers (PRD-ACS-006); and the person stood in for is
   * eligible for it through their own assignments today, so a grant is never wider than their authority, and ends with
   * it. Grants do not chain. The decision relies on the stood-in-for person's assignment and limit, and on the grant.
   * The first such grant by identifier, or undefined.
   */
  private async grantEligibility(
    context: TransactionContext,
    actor: DecidingActor,
    request: RequestRow,
  ): Promise<Eligibility | undefined> {
    const date = await context.businessDate();
    if (date.kind === 'not-set') return undefined;
    for (const grant of await this.grantsCovering(context, date.date, actor.id, request)) {
      const independence = await this.independenceRefusal(context, actor.id, request);
      if (independence !== undefined) return independence;
      const giver = await this.eligibility(context, { kind: 'user', id: grant.forUserId }, request, 'own-assignments');
      if (giver.kind !== 'eligible') continue;
      return { ...giver, standIn: { grantId: grant.id, forUserId: grant.forUserId, action: grant.action } };
    }
    return undefined;
  }

  /**
   * The Approved grants to a person in force on a date for the request's action type whose scope covers the request's
   * facts as an assignment's would (5.3) and whose limit covers its value on the rule's basis (9.2, 10), first by
   * identifier.
   */
  private async grantsCovering(
    context: TransactionContext,
    date: string,
    actorId: string,
    request: RequestRow,
  ): Promise<GrantInForce[]> {
    const rule = this.ruleOf(request.actionType);
    const declaration = this.dependencies.registry.get(rule.recordType);
    if (declaration === undefined) throw new CommandDefect(`Record type ${rule.recordType} is not declared`);
    const { facts, movesTo } = requestFacts(request);
    return (await grantsInForce(context, date, actorId, request.actionType)).filter(
      (grant) =>
        scopeCoversMove(grant.scope, declaration, actorId, facts, movesTo).covered &&
        (rule.value === 'none' || grantActionCovers(grant.action, valueOf(request))),
    );
  }

  /**
   * Independence (access-and-approvals 9.3; PRD-ACS-006, POL-02.08): the decider is none of the request's preparers,
   * through any role, an access change's read again from its change rows and another module's those it named (9.1);
   * nor one of the people its document names as parties, such as the two people of a stand-in grant (10; product owner,
   * 9 Oct 2026). Answers the refusal, or undefined.
   */
  private async independenceRefusal(
    context: TransactionContext,
    actorId: string,
    request: RequestRow,
  ): Promise<Eligibility | undefined> {
    const rule = this.ruleOf(request.actionType);
    const preparers = new Set([
      ...(await storedPreparers(context, request.id)),
      ...(rule.module === 'access' ? await preparersOf(context, request.actionType, request.documentVersionId) : []),
    ]);
    if (preparers.has(actorId)) {
      return {
        kind: 'refused',
        refusal: { kind: 'refused', code: 'access.self-preparation', missing: [{ kind: 'preparer', userId: actorId }] },
      };
    }
    const parties = (await this.handlerOf(request.actionType).parties?.(context, request.documentVersionId)) ?? [];
    if (parties.includes(actorId)) {
      return {
        kind: 'refused',
        refusal: {
          kind: 'refused',
          code: 'access.stand-in-party',
          missing: [{ kind: 'stand-in-party', userId: actorId }],
        },
      };
    }
    return undefined;
  }

  /** Who may decide through their own assignments (access-and-approvals 9.3), as built before stand-in grants. */
  private async ownEligibility(
    context: TransactionContext,
    actor: DecidingActor,
    request: RequestRow,
  ): Promise<Eligibility> {
    if (actor.kind !== 'user') {
      return {
        kind: 'refused',
        refusal: { kind: 'not-authorised', code: 'access.not-eligible', missing: [{ kind: 'person' }] },
      };
    }
    const date = await context.businessDate();
    if (date.kind === 'not-set') {
      return {
        kind: 'refused',
        refusal: {
          kind: 'unavailable',
          code: 'access.business-date-not-set',
          missing: [{ kind: 'setting', setting: 'configuration.timezone' }],
        },
      };
    }
    if ((await userInForce(context, actor.id))?.state !== 'Active') {
      return {
        kind: 'refused',
        refusal: { kind: 'not-authorised', code: 'access.not-eligible', missing: [{ kind: 'user-state' }] },
      };
    }
    const rule = this.ruleOf(request.actionType);
    // Approve on the request's record type, and on that of each document the decision decides with it, such as a new
    // business unit's first mapping (structure-and-masters 3.4; product owner, 8 Oct 2026).
    const decidesWith =
      (await this.handlerOf(request.actionType).decidesWith?.(context, request.documentVersionId)) ?? [];
    const notEligible = (refusal: CommandRefusal) =>
      ({
        kind: 'refused',
        refusal: {
          kind: refusal.kind === 'unavailable' ? 'unavailable' : 'not-authorised',
          code: refusal.kind === 'unavailable' ? refusal.code : 'access.not-eligible',
          missing: [...refusal.missing],
        },
      }) as const;
    // Covering the document's scope facts, which the request froze (9.3; RR-435). Every assignment that does, since a
    // valued request's limit must come through the assignment that grants approve (PRD-ACS-004).
    const covering = await authorisingAssignments(context, this.dependencies.registry, {
      actorId: actor.id,
      action: 'approve',
      recordType: rule.recordType,
      ...requestFacts(request),
    });
    if (covering.kind === 'refused') return notEligible(covering.refusal);
    const alsoRelied: string[] = [];
    for (const recordType of decidesWith.map((each) => this.ruleOf(each).recordType)) {
      const authorised = await authorise(context, this.dependencies.registry, {
        actorId: actor.id,
        action: 'approve',
        recordType,
        ...requestFacts(request),
      });
      if (authorised.kind === 'refused') return notEligible(authorised.refusal);
      alsoRelied.push(authorised.roleAssignmentId);
    }
    const first = covering.assignments[0];
    if (first === undefined) throw new CommandDefect('Eligibility relied on no assignment');
    let roleAssignmentId = first.assignmentId;
    const independence = await this.independenceRefusal(context, actor.id, request);
    if (independence !== undefined) return independence;
    // A value on a basis needs a limit of the approver's that covers it, through the same assignment, or explicit
    // authority over Unknown value; a missing limit grants nothing (9.2, 9.3; POL-02.09, POL-02.15, PRD-ACS-016).
    if (rule.value === 'none') return { kind: 'eligible', roleAssignmentId, alsoRelied };
    const authority = await this.limitAuthority(context, actor.id, request, covering.assignments);
    if (authority.kind !== 'covered') {
      const missing = [{ kind: 'approval-limit', actionType: rule.actionType, basis: rule.value }];
      const code = {
        'no-limit': 'access.no-approval-limit',
        above: 'access.above-approval-limit',
        'unknown-not-covered': 'access.unknown-value-not-covered',
      }[authority.kind];
      return { kind: 'refused', refusal: { kind: 'not-authorised', code, missing } };
    }
    roleAssignmentId = authority.assignmentId;
    return { kind: 'eligible', roleAssignmentId, alsoRelied, limit: authority.limit };
  }

  /**
   * One approver's authority for a valued request (9.2, 9.3): the limits of its action type in force today that apply
   * through each assignment granting approve and covering the request's facts, a role's limit only where its scope
   * covers them too (5.3), and the lowest that covers the value (DEC-043).
   */
  private async limitAuthority(
    context: TransactionContext,
    actorId: string,
    request: RequestRow,
    assignments: readonly { readonly assignmentId: string; readonly roleId: string }[],
  ): Promise<Authority> {
    const date = await context.businessDate();
    if (date.kind === 'not-set') return { kind: 'no-limit' };
    const rule = this.ruleOf(request.actionType);
    const declaration = this.dependencies.registry.get(rule.recordType);
    if (declaration === undefined) throw new CommandDefect(`Record type ${rule.recordType} is not declared`);
    const { facts, movesTo } = requestFacts(request);
    const limits = await limitsInForce(context, date.date, request.actionType);
    return authorityOf(
      actorId,
      assignments,
      limits,
      (scope) => scopeCoversMove(scope, declaration, actorId, facts, movesTo).covered,
      valueOf(request),
    );
  }

  /**
   * To whom a valued request is offered now (9.4; DEC-043): of every person eligible for it (9.3), those whose limit
   * relied on is the lowest that covers its value, explicit unlimited authority after every finite limit; for an
   * Unknown value, everyone with explicit authority over Unknown. Worked out at each read, so a limit change applies as
   * soon as it is in force. A request with no value is offered to everyone eligible.
   */
  private async offeredFor(
    context: TransactionContext,
    request: RequestRow,
    /** Every assignment in force today, when the caller has read them already for several requests. */
    inForce?: Awaited<ReturnType<typeof assignmentsInForce>>,
  ): Promise<string[]> {
    const date = await context.businessDate();
    if (date.kind === 'not-set') return [];
    const rule = this.ruleOf(request.actionType);
    const actors = [
      ...new Set(
        (inForce ?? (await assignmentsInForce(context, date.date)))
          .filter((assignment) =>
            assignment.permissions.some(
              (permission) =>
                permission.kind === 'action' &&
                permission.recordType === rule.recordType &&
                permission.action === 'approve',
            ),
          )
          .map((assignment) => assignment.actorId),
      ),
    ].sort();
    const candidates: { actorId: string; authority: Authority }[] = [];
    for (const actorId of actors) {
      const eligible = await this.eligibility(context, { kind: 'user', id: actorId }, request, 'own-assignments');
      if (eligible.kind !== 'eligible') continue;
      candidates.push({
        actorId,
        authority:
          eligible.limit === undefined
            ? { kind: 'no-limit' }
            : { kind: 'covered', assignmentId: eligible.roleAssignmentId, limit: eligible.limit },
      });
    }
    if (rule.value === 'none') return candidates.map((candidate) => candidate.actorId);
    return offeredTo(candidates, valueOf(request));
  }

  /**
   * Where the reader stands against a valued request, for the approval panel's limit bar (design-language 10.14;
   * 9.2 to 9.4): within their limit, under unlimited or Unknown authority, or short of it, with an approver it is
   * offered to now, or none, which the panel shows as "No approver set up". Undefined for a request with no value.
   */
  private async standing(
    context: TransactionContext,
    actor: DecidingActor,
    request: RequestRow,
  ): Promise<LimitStanding | undefined> {
    const rule = this.ruleOf(request.actionType);
    if (rule.value === 'none' || request.state !== 'Awaiting approval') return undefined;
    // Through a stand-in grant, the reader stands against the grant's own limit (10; S1-F05-T02).
    const eligible = await this.eligibility(context, actor, request);
    if (eligible.kind === 'eligible' && eligible.standIn !== undefined) {
      const action = eligible.standIn.action;
      if (request.valueKind === 'unknown') return { kind: 'unknown-covered' };
      return action.amount === null ? { kind: 'unlimited' } : { kind: 'within', limit: action.amount };
    }
    const covering = await authorisingAssignments(context, this.dependencies.registry, {
      actorId: actor.id,
      action: 'approve',
      recordType: rule.recordType,
      ...requestFacts(request),
    });
    const authority =
      covering.kind === 'refused'
        ? ({ kind: 'no-limit' } as const)
        : await this.limitAuthority(context, actor.id, request, covering.assignments);
    if (authority.kind === 'covered') {
      if (request.valueKind === 'unknown') return { kind: 'unknown-covered' };
      return authority.limit.amount === null
        ? { kind: 'unlimited' }
        : { kind: 'within', limit: authority.limit.amount };
    }
    const others = (await this.offeredFor(context, request)).filter((id) => id !== actor.id);
    const names = await userNames(context);
    const next = others.map((id) => names.get(id) ?? id).sort()[0] ?? null;
    if (authority.kind === 'above' && authority.highest.amount !== null) {
      return { kind: 'above', limit: authority.highest.amount, next };
    }
    return { kind: authority.kind === 'unknown-not-covered' ? 'unknown-not-covered' : 'no-limit', next };
  }

  /** The reason versions in force today of a kind (access-and-approvals 9.5). */
  async reasonsInForce(
    context: TransactionContext,
    kind?: 'approve' | 'reject',
  ): Promise<{ id: string; versionId: string; code: string; kind: 'approve' | 'reject'; text: string }[]> {
    const date = await context.businessDate();
    if (date.kind === 'not-set') return [];
    const rows = await context.tx
      .select({
        id: approvalReason.id,
        versionId: approvalReasonVersion.id,
        code: approvalReason.code,
        kind: approvalReason.kind,
        text: approvalReasonVersion.text,
      })
      .from(approvalReasonVersion)
      .innerJoin(approvalReason, eq(approvalReason.id, approvalReasonVersion.approvalReasonId))
      .where(
        and(
          eq(approvalReasonVersion.decision, 'Approved'),
          sql`${approvalReasonVersion.validDuring} @> ${date.date}::date`,
          kind === undefined ? undefined : eq(approvalReason.kind, kind),
        ),
      )
      .orderBy(approvalReason.code);
    return rows.map((row) => ({ ...row, kind: row.kind as 'approve' | 'reject' }));
  }

  /**
   * The reason a decision gives (access-and-approvals 9.5; POL-02.23, DEC-104): on a reason-list change, free text
   * only; on any other, one reason of the outcome's kind from the list in force, and while none of that kind is in
   * force deciding is unavailable. Answers the reason version, or the free text, or the refusal.
   */
  private async checkReason(
    context: TransactionContext,
    rule: ApprovalRule,
    input: DecisionInput,
  ): Promise<
    | {
        readonly kind: 'reason';
        readonly reason: { kind: 'listed'; versionId: string; text: string } | { kind: 'free-text'; text: string };
      }
    | { readonly kind: 'refusal'; readonly refusal: CommandRefusal }
  > {
    const refuse = (kind: CommandRefusal['kind'], code: string, missing: MissingItem[] = []) =>
      ({ kind: 'refusal', refusal: { kind, code, missing } }) as const;
    if (rule.freeTextReason) {
      if (input.reason.kind !== 'free-text') return refuse('refused', 'access.free-text-required');
      return { kind: 'reason', reason: { kind: 'free-text', text: input.reason.text } };
    }
    if (input.reason.kind === 'free-text') return refuse('refused', 'access.free-text-not-allowed');
    const reasonKind = input.outcome === 'approve' ? 'approve' : 'reject';
    const inForce = await this.reasonsInForce(context, reasonKind);
    if (inForce.length === 0) {
      return refuse('unavailable', 'access.no-reason-list-in-force', [{ kind: 'reason-list', reasonKind }]);
    }
    const reasonId = input.reason.reasonId;
    const picked = inForce.find((each) => each.id === reasonId);
    if (picked === undefined) return refuse('refused', 'access.reason-not-in-force');
    return { kind: 'reason', reason: { kind: 'listed', versionId: picked.versionId, text: picked.text } };
  }

  /** Whether the reader may decide the request now, for the approval panel (spec section 6; PRD-UXP-003). */
  async decidable(context: TransactionContext, actor: DecidingActor, request: RequestRow): Promise<Decidable> {
    if (request.state === 'Superseded') return { kind: 'unavailable', code: 'access.approval-superseded', missing: [] };
    if (request.state !== 'Awaiting approval')
      return { kind: 'unavailable', code: 'access.approval-not-open', missing: [] };
    const eligible = await this.eligibility(context, actor, request);
    if (eligible.kind === 'refused') {
      return { kind: 'unavailable', code: eligible.refusal.code, missing: [...eligible.refusal.missing] };
    }
    const handler = this.handlerOf(request.actionType);
    const own = await handler.precheck?.(context, request.documentVersionId);
    if (own !== undefined) return { kind: 'unavailable', code: own.code, missing: [...own.missing] };
    const rule = this.ruleOf(request.actionType);
    if (rule.freeTextReason)
      return { kind: 'available', reason: 'free-text', outcomes: ['approve', 'reject'], missing: [] };
    // Each outcome needs a reason of its own kind in force (9.5; POL-02.23), so each is open or not on its own.
    const inForce = new Set((await this.reasonsInForce(context)).map((reason) => reason.kind));
    const kinds = ['approve', 'reject'] as const;
    const outcomes = kinds.filter((kind) => inForce.has(kind));
    const missing: MissingItem[] = kinds
      .filter((kind) => !inForce.has(kind))
      .map((reasonKind) => ({ kind: 'reason-list', reasonKind }));
    if (outcomes.length === 0) return { kind: 'unavailable', code: 'access.no-reason-list-in-force', missing };
    return { kind: 'available', reason: 'listed', outcomes, missing };
  }

  /** The open requests among those named that the user may decide now: My work's eligibility check (11.2). */
  async eligibleRequests(
    context: TransactionContext,
    userId: string,
    requestIds: readonly string[],
  ): Promise<string[]> {
    if (requestIds.length === 0) return [];
    const rows = await context.tx
      .select()
      .from(approvalRequest)
      .where(and(inArray(approvalRequest.id, [...requestIds]), eq(approvalRequest.state, 'Awaiting approval')));
    const listed: string[] = [];
    // Every assignment in force today, read once for all the requests My work lists (11.2).
    const date = await context.businessDate();
    const inForce = date.kind === 'set' ? await assignmentsInForce(context, date.date) : [];
    for (const row of rows) {
      const eligible = await this.eligibility(context, { kind: 'user', id: userId }, row);
      if (this.ruleOf(row.actionType).value === 'none') {
        if (eligible.kind === 'eligible') listed.push(row.id);
        continue;
      }
      // A valued request is offered only to the eligible approvers with the lowest limit that covers it (9.4). While
      // no limit covers it, it stays Awaiting approval with those who would decide it but for the limit, so it is not
      // hidden: their panel says "No approver set up" and Approve stays disabled (design-language 10.14).
      const offered = await this.offeredFor(context, row, inForce);
      const shortOfLimit = eligible.kind === 'refused' && LIMIT_CODES.has(eligible.refusal.code);
      // A stand-in sees what the grant covers of what the person stood in for is offered (10; PRD-ACS-010).
      const standingIn =
        eligible.kind === 'eligible' && eligible.standIn !== undefined && offered.includes(eligible.standIn.forUserId);
      if (offered.includes(userId) || standingIn || (offered.length === 0 && shortOfLimit)) listed.push(row.id);
    }
    return listed;
  }

  /** Authorise for a replayed decision: the same actor, still eligible (code-house-rules 12.4, CH-14). */
  async replayAccess(context: TransactionContext, actor: DecidingActor, requestId: string) {
    const request = await this.findRequest(context, requestId);
    if (request === undefined) return { kind: 'allowed' } as const;
    const rule = this.ruleOf(request.actionType);
    const authorised = await authorise(context, this.dependencies.registry, {
      actorId: actor.id,
      action: 'approve',
      recordType: rule.recordType,
      ...requestFacts(request),
    });
    if (authorised.kind === 'allowed') return authorised;
    // A stand-in's replay, while a grant of theirs in force still covers the request's scope facts and its value, as
    // the decision needed (10; code-house-rules 12.4; S1-F05-T02).
    const date = await context.businessDate();
    if (date.kind === 'set' && (await this.grantsCovering(context, date.date, actor.id, request)).length > 0) {
      return { kind: 'allowed' } as const;
    }
    return authorised;
  }

  /**
   * Decide (access-and-approvals 9.5; module-map 6.2 flow A). Reads the request, locks the authority rows at step 0
   * (the approver's user row, assignment and its role, shared; the user, assignment or role the decision changes,
   * exclusive; DEC-118), then
   * the request with the document's rows at step 1, each step in one call (code-house-rules 8.2; RR-325), then
   * rechecks under the locks: the request is still open and not
   * superseded (9.6), the version reviewed is its version (PRD-ACS-007), the decider is eligible (9.3), the reason
   * fits (POL-02.23, DEC-104), the document's own checks pass, and a fresh authenticator code is given (3.3). Then,
   * in this one transaction: the decision, the request's state, the version taking effect or rejected, effective
   * grants, audit and permission-change records, and the outbox rows (PRD-INT-004, PRD-MOD-006).
   */
  async decide(context: TransactionContext, actor: DecidingActor, input: DecisionInput): Promise<DecisionOutcome> {
    return this.decideWith(context, actor, input, { kind: 'code', totpCode: input.totpCode });
  }

  /**
   * One item of a bulk approval (access-and-approvals 9.9; PRD-ACS-019, POL-02.19; S1-F05-T02): its own decision in its
   * own transaction, approving, rechecked under the locks for permission, scope, limit, state and independence as any
   * decision is; the fresh code is the batch's (3.3), so the batch must be the approver's and name the request.
   */
  async decideInBatch(context: TransactionContext, actor: DecidingActor, input: BatchItemInput) {
    return this.decideWith(
      context,
      actor,
      { ...input, outcome: 'approve', totpCode: '' },
      { kind: 'batch', batchId: input.batchId },
    );
  }

  /** Opens a bulk approval's batch with its one fresh code (9.9; 3.3; S1-F05-T02); never by a service identity. */
  async openBatch(context: TransactionContext, actor: DecidingActor, input: BatchInput): Promise<BatchOutcome> {
    if (actor.kind !== 'user') {
      return {
        kind: 'refusal',
        refusal: { kind: 'not-authorised', code: 'access.not-eligible', missing: [{ kind: 'person' }] },
        causedBySecret: false,
      };
    }
    return openBatch(
      context,
      {
        audit: this.dependencies.audit,
        keys: this.dependencies.keys,
        approveReasons: () => this.reasonsInForce(context, 'approve'),
      },
      actor.id,
      input,
    );
  }

  private async decideWith(
    context: TransactionContext,
    actor: DecidingActor,
    input: DecisionInput,
    proof: { readonly kind: 'code'; readonly totpCode: string } | { readonly kind: 'batch'; readonly batchId: string },
  ): Promise<DecisionOutcome> {
    const date = await context.businessDate();
    if (date.kind === 'not-set') {
      return refused('unavailable', 'access.business-date-not-set', [
        { kind: 'setting', setting: 'configuration.timezone' },
      ]);
    }
    const found = await this.findRequest(context, input.requestId);
    if (found === undefined) return refused('not-found', 'access.approval-request-not-found');
    if (actor.kind !== 'user') return refused('not-authorised', 'access.not-eligible', [{ kind: 'person' }]);
    const rule = this.ruleOf(found.actionType);
    const handler = this.handlerOf(found.actionType);
    // Step 0: the approver's user row, the assignment they rely on and its role, shared, with the authority rows the
    // decision changes, exclusive (code-house-rules 8.2 "Authority first"; RR-325, RR-360). The assignment is the one Authorise finds
    // before the locks; an approver who is not eligible then locks none of theirs and is refused under the locks.
    const relied = await this.eligibility(context, actor, found);
    // Through a stand-in grant, the authority relied on is the stood-in-for person's: their user row, assignment and
    // role, with the grant and the stand-in's own user row, all shared (code-house-rules 8.2; 10; S1-F05-T02).
    const standIn = relied.kind === 'eligible' ? relied.standIn : undefined;
    const reliedActor: DecidingActor = standIn === undefined ? actor : { kind: 'user', id: standIn.forUserId };
    const held =
      relied.kind === 'eligible' ? await reliedAuthority(context, reliedActor, relied.roleAssignmentId) : undefined;
    // The assignments relied on for the documents decided with it, shared too (structure-and-masters 3.4).
    const alsoHeld = [];
    for (const assignmentId of relied.kind === 'eligible' ? relied.alsoRelied : []) {
      alsoHeld.push(await reliedAuthority(context, reliedActor, assignmentId));
    }
    // The lock helper takes a row named twice once, exclusively when either names it so (code-house-rules 8.2).
    await context.lock(LOCK_STEP.authority, [
      ...(held?.targets ?? []),
      ...alsoHeld.flatMap((each) => each.targets),
      // The approval limit relied on, shared (9.5; S1-F05-T01).
      ...(relied.kind === 'eligible' && relied.limit !== undefined ? [limitTarget(relied.limit.id, 'shared')] : []),
      ...(standIn === undefined ? [] : [identityTarget(actor, 'shared'), grantTarget(standIn.grantId, 'shared')]),
      ...((await handler.authorityTargets?.(context, found.documentVersionId)) ?? []),
    ]);
    await context.lock(LOCK_STEP.document, [
      { table: APPROVAL_REQUEST, id: found.id, mode: 'exclusive' },
      ...(await handler.targets(context, found.documentVersionId)),
    ]);
    const request = await this.findRequest(context, input.requestId);
    if (request === undefined) return refused('not-found', 'access.approval-request-not-found');
    if (request.state === 'Superseded') return refused('refused', 'access.approval-superseded');
    if (request.state !== 'Awaiting approval') return refused('refused', 'access.approval-not-open');
    if (request.documentVersionId !== input.versionId) return refused('conflict', 'kernel.stale-version');
    const eligible = await this.eligibility(context, actor, request);
    if (eligible.kind === 'refused') return { kind: 'refusal', refusal: eligible.refusal, causedBySecret: false };
    // Eligible now through another assignment than the one locked: the authority changed while the locks were taken.
    if (
      relied.kind !== 'eligible' ||
      relied.roleAssignmentId !== eligible.roleAssignmentId ||
      relied.alsoRelied.join() !== eligible.alsoRelied.join() ||
      relied.limit?.id !== eligible.limit?.id ||
      relied.standIn?.grantId !== eligible.standIn?.grantId
    ) {
      return refused('conflict', 'kernel.stale-version');
    }
    // A version of the approver's role took effect while the locks were taken (DEC-118, RR-360).
    for (const each of held === undefined ? alsoHeld : [held, ...alsoHeld]) {
      if (await each.roleChanged()) return refused('conflict', 'kernel.stale-version');
    }
    const checked = await this.checkReason(context, rule, input);
    if (checked.kind === 'refusal') return { kind: 'refusal', refusal: checked.refusal, causedBySecret: false };
    const reason = checked.reason;
    const own = await handler.precheck?.(context, request.documentVersionId);
    if (own !== undefined) return { kind: 'refusal', refusal: own, causedBySecret: false };
    if (proof.kind === 'code') {
      const keys = this.dependencies.keys;
      if (keys === undefined) throw new CommandDefect('Deciding needs the Organisation keys for the fresh code');
      const code = await checkFreshCode(context, keys, actor.id, proof.totpCode);
      const codeRefused = await takeFreshCode(code);
      if (codeRefused !== undefined) return { kind: 'refusal', ...codeRefused };
    } else {
      // An item of a bulk approval: its batch, recorded with the fresh code in its own command, is the approver's and
      // names the request, and the action type is still on the allowlist today (9.9; S1-F05-T02).
      const batchRefused = await batchRefusal(context, proof.batchId, actor.id, request);
      if (batchRefused !== undefined) return { kind: 'refusal', refusal: batchRefused, causedBySecret: false };
    }

    const decisionId = uuidv7();
    const outcome = input.outcome === 'approve' ? 'Approved' : 'Rejected';
    const decider = {
      actor: { kind: 'user' as const, id: actor.id },
      roleAssignmentId: eligible.roleAssignmentId,
      approvalDecisionId: decisionId,
      // The words of the reason given, kept on every audit record the decision writes (numbering-and-audit 4.2
      // "Reason"; PRD-ACS-013), so a record's history says why it was approved or rejected.
      reason: reason.text,
    };
    const evidenceAttachmentIds: string[] = [];
    const writeDecision = async () => {
      // The evidence files, stored before this transaction, are linked to the document decided in it, so a decision
      // that does not commit leaves no link (9.5; S1-F08-T03). The reader of a link needs view on the rule's record
      // type covering the request's facts, and the classes the rule declares for its evidence (imports 11).
      for (const file of input.evidence ?? []) {
        const attacher = this.dependencies.evidence;
        if (attacher === undefined) throw new CommandDefect('A decision was given evidence with no files-imports');
        const attached = await attacher.attach(context, {
          storedFileId: file.storedFileId,
          fileReceiptId: file.fileReceiptId,
          record: {
            module: request.documentModule,
            type: rule.recordType,
            id: request.documentRecordId,
            versionId: request.documentVersionId,
          },
          evidence: { kind: DECISION_EVIDENCE_KIND, restrictedClasses: rule.decisionEvidenceClasses },
          scope: scopeOf(request),
          attachedBy: { kind: 'user', id: actor.id },
          roleAssignmentId: eligible.roleAssignmentId,
        });
        evidenceAttachmentIds.push(attached.attachmentId);
      }
      await context.tx.insert(approvalDecision).values({
        id: decisionId,
        approvalRequestId: request.id,
        approverUserId: actor.id,
        roleAssignmentId: eligible.roleAssignmentId,
        outcome,
        documentVersionId: request.documentVersionId,
        approvalReasonVersionId: reason.kind === 'listed' ? reason.versionId : null,
        reasonText: reason.kind === 'free-text' ? reason.text : null,
        comment: input.comment ?? null,
        valueKind: request.valueKind,
        valueBasis: request.valueBasis,
        valueAmount: request.valueAmount,
        evidenceAttachmentIds,
        decidedAt: context.startedAt,
        // The limit relied on, which the recheck under a posting's locks uses (9.5, 9.7; RR-435).
        approvalLimitId: eligible.limit?.id ?? null,
        // The stand-in grant relied on, and the bulk batch the decision was made in (9.5, 9.9, 10; S1-F05-T02).
        standInGrantId: eligible.standIn?.grantId ?? null,
        bulkDecisionBatchId: proof.kind === 'batch' ? proof.batchId : null,
      });
      await context.tx.update(approvalRequest).set({ state: outcome }).where(eq(approvalRequest.id, request.id));
    };
    if (outcome === 'Approved') {
      // The effect rechecks its own record and may still refuse, so nothing of the decision is written before it.
      const effect = await handler.approve(context, decider, request.documentVersionId);
      if (effect.kind === 'refusal') return { kind: 'refusal', refusal: effect.refusal, causedBySecret: false };
      await writeDecision();
    } else {
      // A rejection's withdrawals name the decision that caused them (DEC-117), so the decision is written first.
      await writeDecision();
      const effect = await handler.reject(context, decider, request.documentVersionId);
      if (effect.kind === 'refusal') {
        throw new CommandDefect(`A rejection refused under its locks: ${effect.refusal.code}`);
      }
    }
    await this.dependencies.audit.record(context, {
      actor: decider.actor,
      roleAssignmentId: eligible.roleAssignmentId,
      approval: { decisionId },
      record: { module: 'access', type: 'approval_request', id: request.id, versionId: request.documentVersionId },
      operation: 'decide-approval-request',
      reason: reason.text,
      changes: [
        { kind: 'value', field: 'state', before: 'Awaiting approval', after: outcome },
        {
          kind: 'value',
          field: 'reason',
          before: null,
          after:
            reason.kind === 'listed'
              ? { kind: 'listed', reasonVersionId: reason.versionId }
              : { kind: 'free-text', text: reason.text },
        },
        { kind: 'value', field: 'comment', before: null, after: input.comment ?? null },
        ...(evidenceAttachmentIds.length === 0
          ? []
          : [{ kind: 'value' as const, field: 'evidence', before: null, after: evidenceAttachmentIds }]),
      ],
      source: { kind: 'screen' },
    });
    await this.publishClosed(context, request, outcome, decisionId);
    return { kind: 'success', answer: { requestId: request.id, decisionId, outcome } };
  }

  /** A request as the approval panel reads it, with its decision and whether the reader may decide it (9.3, 9.5). */
  async view(context: TransactionContext, actor: DecidingActor, requestId: string) {
    const request = await this.findRequest(context, requestId);
    if (request === undefined) return undefined;
    const [decision] = await context.tx
      .select()
      .from(approvalDecision)
      .where(eq(approvalDecision.approvalRequestId, requestId));
    let reason:
      | { kind: 'listed'; reasonId: string; code: string; text: string }
      | { kind: 'free-text'; text: string }
      | undefined;
    if (decision?.approvalReasonVersionId != null) {
      const [listed] = await context.tx
        .select({ id: approvalReason.id, code: approvalReason.code, text: approvalReasonVersion.text })
        .from(approvalReasonVersion)
        .innerJoin(approvalReason, eq(approvalReason.id, approvalReasonVersion.approvalReasonId))
        .where(eq(approvalReasonVersion.id, decision.approvalReasonVersionId));
      if (listed !== undefined) reason = { kind: 'listed', reasonId: listed.id, code: listed.code, text: listed.text };
    } else if (decision?.reasonText != null) {
      reason = { kind: 'free-text', text: decision.reasonText };
    }
    const standing = await this.standing(context, actor, request);
    const eligible =
      request.state === 'Awaiting approval' ? await this.eligibility(context, actor, request) : undefined;
    return {
      id: request.id,
      actionType: request.actionType,
      document: {
        module: request.documentModule,
        recordType: request.documentRecordType,
        recordId: request.documentRecordId,
        versionId: request.documentVersionId,
      },
      value: approvalValueOf(request),
      preparers: await storedPreparers(context, request.id),
      state: request.state as 'Awaiting approval' | 'Approved' | 'Rejected' | 'Superseded' | 'Withdrawn',
      requestedAt: request.recordedAt.toISOString(),
      ...(decision === undefined || reason === undefined
        ? {}
        : {
            decision: {
              id: decision.id,
              outcome: decision.outcome as 'Approved' | 'Rejected',
              approverId: decision.approverUserId,
              reason,
              ...(decision.comment === null ? {} : { comment: decision.comment }),
              evidence: decision.evidenceAttachmentIds,
              decidedAt: decision.decidedAt.toISOString(),
            },
          }),
      decidable: await this.decidable(context, actor, request),
      ...(standing === undefined ? {} : { limit: standing }),
      bulkAllowed: await bulkAllowedToday(context, request.actionType),
      ...(eligible?.kind === 'eligible' && eligible.standIn !== undefined
        ? { standInGrantId: eligible.standIn.grantId }
        : {}),
      asOf: context.startedAt.toISOString(),
    };
  }
}
