import { paise } from '@apparel-os/domain';
import { eq } from 'drizzle-orm';
import {
  CommandDefect,
  lockTable,
  type CommandRefusal,
  type LockTarget,
  type TransactionContext,
} from '../../../kernel/index.js';
import { approvalDecision, approvalRequest, approvalUse } from '../db/schema.js';
import { limitCovers } from '../domain/approval-limits.js';
import type { ApprovalRule } from '../domain/approval-rules.js';
import { limitById } from './approval-limits.js';
import { storedPreparers, type ApprovalDocument, type RequestValue } from './request-approval.js';

// The use of an approval decision by a posting (access-and-approvals 9.7, 9.8; module-map 4.3 "Verify under lock",
// "Record use"; stock-ledger 10.4, 13.1; PRD-ACS-006, PRD-ACS-007, PRD-INT-002, PRD-INT-004; POL-02.12; DEC-066,
// DEC-097; S1-F10-T02).

const APPROVAL_REQUEST = lockTable('access', 'approval_request');

/** The document a posting posts: its module, record type, record and the exact version posted (9.7). */
export type PostedDocument = ApprovalDocument & { readonly module: string };

/** What the posting module asks Verify under lock (access-and-approvals 9.7). */
export interface ApprovalCheck {
  readonly decisionId: string;
  readonly actionType: string;
  readonly document: PostedDocument;
  /** Every user who recorded a change in the version posted (9.1, 9.7; PRD-ACS-006). */
  readonly preparers: readonly string[];
  /** The value under the locks, on the rule's basis, or Unknown (stock-ledger 13.1 "Recheck and value"). */
  readonly value: RequestValue;
}

/** Who posts: the user, or the service identity of a job acting for a person (access-and-approvals 2.3, 9.8). */
export type PostingActor =
  | { readonly kind: 'user'; readonly id: string }
  | { readonly kind: 'service-identity'; readonly id: string; readonly onBehalfOfUserId?: string };

/**
 * What Record use writes (access-and-approvals 9.8 step 2): the check Verify under lock passed, which Record use makes
 * again, with the use's identifier and who posts.
 */
export interface ApprovalUseRecord extends ApprovalCheck {
  /** The use's identifier, a UUIDv7 the posting module made, which its own records keep (stock-ledger 13.3). */
  readonly useId: string;
  readonly actor: PostingActor;
}

function refusal(kind: CommandRefusal['kind'], code: string, missing: CommandRefusal['missing'] = []): CommandRefusal {
  return { kind, code, missing };
}

async function decisionWithRequest(context: TransactionContext, decisionId: string) {
  const [row] = await context.tx
    .select({ decision: approvalDecision, request: approvalRequest })
    .from(approvalDecision)
    .innerJoin(approvalRequest, eq(approvalRequest.id, approvalDecision.approvalRequestId))
    .where(eq(approvalDecision.id, decisionId));
  return row;
}

async function isUsed(context: TransactionContext, decisionId: string): Promise<boolean> {
  const rows = await context.tx
    .select({ id: approvalUse.id })
    .from(approvalUse)
    .where(eq(approvalUse.approvalDecisionId, decisionId));
  return rows.length > 0;
}

/**
 * The rows a posting locks with its document at step 1 (stock-ledger 10.3; access-and-approvals 9.7): the decision's
 * request, exclusively, which Decide locks the same way, so two postings of one decision, or a decision and a
 * posting, never pass each other. None when the decision is not found; Verify under lock then refuses.
 */
export async function approvalLockTargets(context: TransactionContext, decisionId: string): Promise<LockTarget[]> {
  const rows = await context.tx
    .select({ requestId: approvalDecision.approvalRequestId })
    .from(approvalDecision)
    .where(eq(approvalDecision.id, decisionId));
  return rows.map((row) => ({ table: APPROVAL_REQUEST, id: row.requestId, mode: 'exclusive' as const }));
}

/**
 * Verify under lock (access-and-approvals 9.7; stock-ledger 10.4), after the posting module has locked the decision's
 * request at step 1: the decision is of this action type and document, Approved and not yet used (DEC-097); the
 * version posted is the version decided (PRD-ACS-007, POL-02.12); the approver is still none of the preparers
 * (PRD-ACS-006); and the value under the lock is within the approved amount (DEC-066), with no tolerance (DEC-105).
 * Answers the refusal, or undefined when the decision may be used. Reads only.
 *
 * The value under the lock is also within the limit the decision relied on (9.7; RR-435; S1-F05-T01). A decision on
 * an Unknown value used for a value now known is refused for renewed approval: authority over Unknown does not cover
 * a known value (product owner, 8 Oct 2026).
 *
 * Not yet: a version the decision carried to (9.6, `approval_carry`), which arrives with the first document whose
 * later step posts it.
 */
export async function verifyUnderLock(
  context: TransactionContext,
  rules: ReadonlyMap<string, ApprovalRule>,
  check: ApprovalCheck,
): Promise<CommandRefusal | undefined> {
  const found = await decisionWithRequest(context, check.decisionId);
  const named = [{ kind: 'approval', actionType: check.actionType, recordId: check.document.recordId }];
  if (found === undefined) return refusal('not-found', 'access.approval-decision-not-found', named);
  const { decision, request } = found;
  if (
    request.actionType !== check.actionType ||
    request.documentModule !== check.document.module ||
    request.documentRecordType !== check.document.recordType ||
    request.documentRecordId !== check.document.recordId
  ) {
    return refusal('refused', 'access.approval-not-for-document', named);
  }
  if (decision.outcome !== 'Approved') return refusal('refused', 'access.approval-not-approved', named);
  if (await isUsed(context, decision.id)) return refusal('refused', 'access.approval-used', named);
  if (decision.documentVersionId !== check.document.versionId) {
    return refusal('refused', 'access.approval-version-changed', named);
  }
  const preparers = new Set([...check.preparers, ...(await storedPreparers(context, request.id))]);
  if (preparers.has(decision.approverUserId)) {
    return refusal('refused', 'access.self-preparation', [{ kind: 'preparer', userId: decision.approverUserId }]);
  }
  const rule = rules.get(check.actionType);
  if (rule === undefined) throw new CommandDefect(`No approval rule for action type ${check.actionType}`);
  if (rule.value === 'none') {
    if (check.value.kind !== 'none') throw new CommandDefect(`Approval rule ${rule.actionType} has no value basis`);
    return undefined;
  }
  if (check.value.kind === 'none') throw new CommandDefect(`Approval rule ${rule.actionType} has a value basis`);
  const exceeded = refusal('refused', 'access.approval-value-exceeded', named);
  if (check.value.kind === 'known' && check.value.amountPaise < 0) {
    throw new CommandDefect(`A value on ${rule.actionType}'s basis is never below zero (PRD-MOD-014)`);
  }
  // The limit the decision relied on (9.7; RR-435): the value under the lock within it, as the approver's authority
  // was judged when they decided. A limit row is never changed but to end it, so its amount is the one relied on.
  const limit = decision.approvalLimitId === null ? undefined : await limitById(context, decision.approvalLimitId);
  if (decision.approvalLimitId !== null && limit === undefined) {
    throw new CommandDefect(`Approval decision ${decision.id} relied on a limit that does not exist`);
  }
  if (check.value.kind === 'known' && limit !== undefined && !limitCovers(limit, check.value)) return exceeded;
  if (decision.valueKind === 'known') {
    if (check.value.kind !== 'known' || decision.valueAmount === null) return exceeded;
    // The amount decided, read back as whole paise (PRD-MOD-014); no tolerance above it (DEC-105).
    return check.value.amountPaise > paise(decision.valueAmount) ? exceeded : undefined;
  }
  // Authority over an Unknown value does not cover a value now known: it needs a fresh approval (product owner,
  // 8 Oct 2026; access-and-approvals 9.8a).
  return check.value.kind === 'unknown' ? undefined : exceeded;
}

/**
 * Record use (access-and-approvals 9.8 step 2; module-map 4.3): inside the posting transaction, that this decision
 * authorised this posting, under the identifier the posting module made. It commits with the stock and money records
 * and is the approval evidence of PRD-INT-004 (DEC-097). It first makes every check of Verify under lock again, with
 * the same codes: a decision of another action type or document, not Approved, already used, of another version, by
 * one of the preparers or below the value is refused; the unique key on the decision is the last guard (PRD-INT-002).
 */
export async function recordUse(
  context: TransactionContext,
  rules: ReadonlyMap<string, ApprovalRule>,
  use: ApprovalUseRecord,
): Promise<CommandRefusal | undefined> {
  const refused = await verifyUnderLock(context, rules, use);
  if (refused !== undefined) return refused;
  await context.tx.insert(approvalUse).values({
    id: use.useId,
    approvalDecisionId: use.decisionId,
    postingModule: use.document.module,
    postingRecordType: use.document.recordType,
    postingRecordId: use.document.recordId,
    postingVersionId: use.document.versionId,
    actorUserId: use.actor.kind === 'user' ? use.actor.id : null,
    actorServiceIdentityId: use.actor.kind === 'service-identity' ? use.actor.id : null,
    onBehalfOfUserId: use.actor.kind === 'service-identity' ? (use.actor.onBehalfOfUserId ?? null) : null,
  });
  return undefined;
}
