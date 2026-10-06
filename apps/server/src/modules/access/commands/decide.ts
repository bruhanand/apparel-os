import { uuidv7 } from '@apparel-os/domain';
import type { AccessActionType, MissingItem, RecordTypeDeclaration } from '@apparel-os/schemas';
import { and, eq, inArray, sql } from 'drizzle-orm';
import {
  CommandDefect,
  LOCK_STEP,
  lockTable,
  type CommandRefusal,
  type LockTarget,
  type TransactionContext,
} from '../../../kernel/index.js';
import type { AuditInterface } from '../../audit/index.js';
import { approvalDecision, approvalReason, approvalReasonVersion, approvalRequest } from '../db/schema.js';
import { accessApprovalRules, type ApprovalRule } from '../domain/approval-rules.js';
import type { OrganisationKeys } from '../domain/organisation-keys.js';
import { approvalDecided } from '../events.js';
import { authorise } from '../queries/authorise.js';
import { identityTarget, reliedAuthorityTargets } from './authority.js';
import { userInForce } from '../queries/users.js';
import type { AccessChanges, Decider, Prepared } from './access-changes.js';
import type { ApprovalSettingsChanges } from './approval-settings.js';
import { checkFreshCode } from './fresh-code.js';
import { preparersOf, storedPreparers } from './request-approval.js';
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
  readonly totpCode: string;
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

/** What Decide does with one kind of document (module-map 6.2 flow A). */
interface DocumentHandler {
  /**
   * The authority rows the decision changes, which Decide locks exclusively at step 0 with the approver's own
   * (code-house-rules 8.2 "Authority first"; RR-325): a user being changed, an assignment taking effect or withdrawn.
   */
  authorityTargets?(context: TransactionContext, versionId: string): Promise<LockTarget[]>;
  /** The rows Decide locks with the request at step 1 (code-house-rules 8.2). */
  targets(context: TransactionContext, versionId: string): Promise<LockTarget[]>;
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

export class Approvals {
  private readonly handlers: ReadonlyMap<AccessActionType, DocumentHandler>;

  constructor(
    private readonly dependencies: {
      readonly audit: AuditInterface;
      readonly registry: ReadonlyMap<string, RecordTypeDeclaration>;
      readonly changes: AccessChanges;
      readonly users: UserChanges;
      readonly settings: ApprovalSettingsChanges;
      readonly keys?: OrganisationKeys | undefined;
    },
  ) {
    const { changes, users, settings } = dependencies;
    this.handlers = new Map<AccessActionType, DocumentHandler>([
      [
        'access.role.change',
        {
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
    const rule = accessApprovalRules.get(actionType);
    if (rule === undefined) throw new CommandDefect(`No approval rule for action type ${actionType}`);
    return rule;
  }

  private handlerOf(actionType: string): DocumentHandler {
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
   * PRD-ACS-004); and none of its preparers, through any role (PRD-ACS-006, POL-02.08). An access change has no value,
   * so no limit applies (9.3, DM-8). Answers the assignment relied on, or the refusal.
   */
  private async eligibility(
    context: TransactionContext,
    actor: DecidingActor,
    request: RequestRow,
  ): Promise<{ kind: 'eligible'; roleAssignmentId: string } | { kind: 'refused'; refusal: CommandRefusal }> {
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
    if ((await userInForce(context, actor.id, date.date))?.state !== 'Active') {
      return {
        kind: 'refused',
        refusal: { kind: 'not-authorised', code: 'access.not-eligible', missing: [{ kind: 'user-state' }] },
      };
    }
    const rule = this.ruleOf(request.actionType);
    const authorised = await authorise(context, this.dependencies.registry, {
      actorId: actor.id,
      action: 'approve',
      recordType: rule.recordType,
    });
    if (authorised.kind === 'refused') {
      return {
        kind: 'refused',
        refusal: {
          kind: authorised.refusal.kind === 'unavailable' ? 'unavailable' : 'not-authorised',
          code: authorised.refusal.kind === 'unavailable' ? authorised.refusal.code : 'access.not-eligible',
          missing: [...authorised.refusal.missing],
        },
      };
    }
    const preparers = new Set([
      ...(await storedPreparers(context, request.id)),
      ...(await preparersOf(context, request.actionType, request.documentVersionId)),
    ]);
    if (preparers.has(actor.id)) {
      return {
        kind: 'refused',
        refusal: {
          kind: 'refused',
          code: 'access.self-preparation',
          missing: [{ kind: 'preparer', userId: actor.id }],
        },
      };
    }
    return { kind: 'eligible', roleAssignmentId: authorised.roleAssignmentId };
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
    const eligible: string[] = [];
    for (const row of rows) {
      if ((await this.eligibility(context, { kind: 'user', id: userId }, row)).kind === 'eligible')
        eligible.push(row.id);
    }
    return eligible;
  }

  /** Authorise for a replayed decision: the same actor, still eligible (code-house-rules 12.4, CH-14). */
  async replayAccess(context: TransactionContext, actor: DecidingActor, requestId: string) {
    const request = await this.findRequest(context, requestId);
    if (request === undefined) return { kind: 'allowed' } as const;
    const rule = this.ruleOf(request.actionType);
    return authorise(context, this.dependencies.registry, {
      actorId: actor.id,
      action: 'approve',
      recordType: rule.recordType,
    });
  }

  /**
   * Decide (access-and-approvals 9.5; module-map 6.2 flow A). Reads the request, locks the authority rows at step 0
   * (the approver's user row and assignment, shared; the user or assignment the decision changes, exclusive), then
   * the request with the document's rows at step 1, each step in one call (code-house-rules 8.2; RR-325), then
   * rechecks under the locks: the request is still open and not
   * superseded (9.6), the version reviewed is its version (PRD-ACS-007), the decider is eligible (9.3), the reason
   * fits (POL-02.23, DEC-104), the document's own checks pass, and a fresh authenticator code is given (3.3). Then,
   * in this one transaction: the decision, the request's state, the version taking effect or rejected, effective
   * grants, audit and permission-change records, and the outbox rows (PRD-INT-004, PRD-MOD-006).
   */
  async decide(context: TransactionContext, actor: DecidingActor, input: DecisionInput): Promise<DecisionOutcome> {
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
    // Step 0: the approver's user row and the assignment they rely on, shared, with the authority rows the decision
    // changes, exclusive (code-house-rules 8.2 "Authority first"; RR-325). The assignment is the one Authorise finds
    // before the locks; an approver who is not eligible then locks none of theirs and is refused under the locks.
    const relied = await this.eligibility(context, actor, found);
    await context.lock(LOCK_STEP.authority, [
      ...(relied.kind === 'eligible' ? reliedAuthorityTargets(actor, relied.roleAssignmentId) : []),
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
    if (relied.kind !== 'eligible' || relied.roleAssignmentId !== eligible.roleAssignmentId) {
      return refused('conflict', 'kernel.stale-version');
    }
    const checked = await this.checkReason(context, rule, input);
    if (checked.kind === 'refusal') return { kind: 'refusal', refusal: checked.refusal, causedBySecret: false };
    const reason = checked.reason;
    const own = await handler.precheck?.(context, request.documentVersionId);
    if (own !== undefined) return { kind: 'refusal', refusal: own, causedBySecret: false };
    const keys = this.dependencies.keys;
    if (keys === undefined) throw new CommandDefect('Deciding needs the Organisation keys for the fresh code');
    const code = await checkFreshCode(context, keys, actor.id, input.totpCode);
    if (code.kind === 'not-enrolled') return refused('refused', 'access.enrolment-not-started');
    if (code.kind === 'refused' || !(await code.take())) {
      return {
        kind: 'refusal',
        refusal: { kind: 'not-authorised', code: 'access.authenticator-code-refused', missing: [] },
        causedBySecret: true,
      };
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
    const writeDecision = async () => {
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
        decidedAt: context.startedAt,
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
    return {
      id: request.id,
      actionType: request.actionType,
      document: {
        module: request.documentModule,
        recordType: request.documentRecordType,
        recordId: request.documentRecordId,
        versionId: request.documentVersionId,
      },
      value: { kind: 'none' as const },
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
              decidedAt: decision.decidedAt.toISOString(),
            },
          }),
      decidable: await this.decidable(context, actor, request),
      asOf: context.startedAt.toISOString(),
    };
  }
}
