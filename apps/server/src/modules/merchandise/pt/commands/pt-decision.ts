import { uuidv7 } from '@apparel-os/domain';
import { PT_APPROVAL, PT_TYPE } from '@apparel-os/schemas';
import { CommandDefect, type LockTarget, type TransactionContext } from '../../../../kernel/index.js';
import type { DocumentEffect, EffectDecider, EffectOutcome, ModuleApprovals } from '../../../access/index.js';
import type { ExceptionsInterface } from '../../../exceptions/index.js';
import { ptProductLockTargets } from '../../catalogue/index.js';
import type { ReceivingInterface } from '../../../receiving/index.js';
import { ptRejection } from '../db/schema.js';
import { POSTING_REFUSED, PT_MODULE, ptApprovalRules } from '../domain/kinds.js';
import { BUSINESS_DATE_NOT_SET, refusalOutcome, revisionNotFound } from '../domain/refusals.js';
import { productTargetsOf, revisionRowCount, revisionStanding } from '../queries/approval.js';
import { draftRefusal, postApproval, type PostingServices } from './post-pt.js';
import { ptLock } from './pt-lock.js';
import { raisePostingRefused } from './raise-posting-refused.js';
import { requestPosting } from './request-posting.js';
import { auditScopeOf, scopeColumnsOf } from './scope-columns.js';

// A PT revision's decision (goods-in 6.1 to 6.3, 6.6, 10.3; access-and-approvals 9.5, 9.8, 9.8b; module-map 6.2 flows C
// and E; PRD-REC-017, PRD-ACS-006, PRD-ACS-007, POL-02.07; DEC-097; S2-F06-T01): the effect `access`'s Decide runs in
// the decision's transaction, once it has refused every preparer of the revision, its uploader among them (9.3), and
// checked the approver's limit on the PT's total proposed acquisition cost (6.1; PRD-ACS-015). Decide locks, with the
// request at step 1, the PT's identity row, as every submit and withdrawal does, the GRN's row, as its "PT attached"
// mark's changes and a recount do (goods-in 4.7, 5.8), and the catalogue's rows the approval writes: the styles its new
// products join and its rows' barcodes (structure-and-masters 4.2, 4.3). So a decision never passes a withdrawal, a
// recount, a second decision or a mapping of the same barcode (goods-in 12 test 12). Under them:
//
// - **Approve** a PT of at most `queue.rows` rows posts it in this transaction (post-pt.ts), the decision written first
//   under a savepoint so the ledger verifies and uses it under its locks (9.8b "before-effect"); any refusal rolls both
//   back and nothing is written, the request still waiting, so the approver approves again once the cause is fixed
//   (books-and-posting 10 step 5). A posting the ledger refuses under the locks raises its unfinished-operation exception
//   in a command of its own once the refusal is kept (`refused`; books-and-posting 10 step 3). A larger PT asks the
//   policy gate, then records a request to post (request-posting.ts), with no stock or money effect: the posting job
//   posts it, one at a time per book (jobs/posting.ts; stock-ledger 10.6). The application queues above
//   PT_POSTED_WITH_DECISION_ROWS rows, and its worker composes the job (goods-in 6.6; code review 7).
// - **Reject** ends the draft: the rejection, the GRN's mark cleared (`pt-rejected`), the audit record. It records no
//   business effect, so it asks no gate (DEC-116); the uploader uploads a corrected file (goods-in 6.3).

/** How a PT's approval posts (goods-in 6.6): with its decision, or above a number of rows through the queued job. */
export type PtPostingQueue =
  { readonly kind: 'with-decision' } | { readonly kind: 'queued-above'; readonly rows: number };

/** What the decision's effect acts through, bound late, since `access` is built with it (access-and-approvals 9.8b). */
export interface PtDecisionServices extends PostingServices {
  readonly receiving: Pick<ReceivingInterface, 'ptBasis' | 'grnForPt' | 'ptMarkLock' | 'clearPtMark'>;
  /** Where a refused posting's unfinished-operation exception is raised (books-and-posting 10 step 3). */
  readonly exceptions: Pick<ExceptionsInterface, 'raiseInOwnCommand'>;
}

export interface PtDecisionDependencies {
  readonly services: () => PtDecisionServices;
  readonly queue: PtPostingQueue;
}

/** Who decides: the person and the assignment relied on, with the decision, which every effect has (9.5). */
function deciding(decider: EffectDecider): {
  readonly userId: string;
  readonly roleAssignmentId: string;
  readonly decisionId: string;
} {
  if (decider.roleAssignmentId === undefined || decider.approvalDecisionId === undefined) {
    throw new CommandDefect('A PT revision was decided without its decision or the assignment relied on');
  }
  return {
    userId: decider.actor.id,
    roleAssignmentId: decider.roleAssignmentId,
    decisionId: decider.approvalDecisionId,
  };
}

/**
 * The rows a decision of the revision locks at step 1 with its request (code-house-rules 8.2), and a posting job with
 * the decision's: the PT's, the GRN's, and the catalogue's the approval writes. None for a revision the reader may not
 * see; the effect then answers it not found.
 */
export async function decisionTargets(
  context: TransactionContext,
  receiving: Pick<ReceivingInterface, 'ptMarkLock'>,
  revisionId: string,
): Promise<LockTarget[]> {
  const standing = await revisionStanding(context, revisionId);
  if (standing === undefined) return [];
  return [
    ptLock(standing.revision.ptId),
    receiving.ptMarkLock(standing.grnId),
    ...(await ptProductLockTargets(context, await productTargetsOf(context, revisionId))),
  ];
}

export function ptDecisionEffect(dependencies: PtDecisionDependencies): DocumentEffect {
  return {
    decisionWritten: 'before-effect',
    targets: (context, revisionId) => decisionTargets(context, dependencies.services().receiving, revisionId),
    async precheck(context, revisionId) {
      return draftRefusal(await revisionStanding(context, revisionId), revisionId);
    },
    async approve(context, decider, revisionId): Promise<EffectOutcome> {
      const services = dependencies.services();
      const decided = deciding(decider);
      const { queue } = dependencies;
      if (queue.kind === 'queued-above' && (await revisionRowCount(context, revisionId)) > queue.rows) {
        const standing = await revisionStanding(context, revisionId);
        const notDraft = draftRefusal(standing, revisionId);
        if (notDraft !== undefined || standing === undefined)
          return refusalOutcome(notDraft ?? revisionNotFound(revisionId));
        return requestPosting(context, services, {
          revision: standing.revision,
          revisionId,
          decisionId: decided.decisionId,
          approverUserId: decided.userId,
          requester: { userId: decided.userId, roleAssignmentId: decided.roleAssignmentId },
          from: 'Awaiting approval',
          ...(decider.reason === undefined ? {} : { reason: decider.reason }),
        });
      }
      const posted = await postApproval(context, services, {
        revisionId,
        decisionId: decided.decisionId,
        approverUserId: decided.userId,
        poster: { kind: 'user', userId: decided.userId, roleAssignmentId: decided.roleAssignmentId },
        ...(decider.reason === undefined ? {} : { reason: decider.reason }),
      });
      return posted.kind === 'success' ? { kind: 'success', answer: { ...posted.answer } } : posted;
    },
    async reject(context, decider, revisionId): Promise<EffectOutcome> {
      const services = dependencies.services();
      const decided = deciding(decider);
      const standing = await revisionStanding(context, revisionId);
      const notDraft = draftRefusal(standing, revisionId);
      if (notDraft !== undefined || standing === undefined) {
        throw new CommandDefect(`A PT revision ${revisionId} was rejected past its check`);
      }
      const date = await context.businessDate();
      if (date.kind === 'not-set') return refusalOutcome(BUSINESS_DATE_NOT_SET);
      const { revision } = standing;
      const rejectionId = uuidv7();
      await context.tx.insert(ptRejection).values({
        id: rejectionId,
        ptRevisionId: revisionId,
        ...scopeColumnsOf(revision),
        approvalDecisionId: decided.decisionId,
        rejectedByUserId: decided.userId,
        roleAssignmentId: decided.roleAssignmentId,
        occurredAt: context.startedAt,
        businessDate: date.date,
      });
      // The draft ends, so the GRN may take a corrected file (goods-in 5.8, 6.3).
      const cleared = await services.receiving.clearPtMark(
        context,
        { userId: decided.userId, roleAssignmentId: decided.roleAssignmentId },
        { grnId: standing.grnId, ptRevisionId: revisionId, reason: 'pt-rejected', source: { kind: 'screen' } },
      );
      if (cleared.kind === 'refusal') return cleared;
      await services.audit.record(context, {
        actor: { kind: 'user', id: decided.userId },
        roleAssignmentId: decided.roleAssignmentId,
        approval: { decisionId: decided.decisionId },
        ...(decider.reason === undefined ? {} : { reason: decider.reason }),
        scope: auditScopeOf(revision),
        record: { module: PT_MODULE, type: PT_TYPE, id: revision.ptId, versionId: revisionId },
        operation: 'reject-pt',
        changes: [
          { kind: 'value', field: 'state', before: 'Awaiting approval', after: 'Rejected' },
          { kind: 'value', field: 'rejectionId', before: null, after: rejectionId },
        ],
        source: { kind: 'screen' },
      });
      return { kind: 'success', answer: { revisionId, rejectionId } };
    },
    /**
     * A posting the ledger refused under the locks rolled the approval back (books-and-posting 10 step 2): its
     * unfinished-operation exception, in a command of its own, keyed by the decision's command (step 3). Any other
     * refusal leaves nothing unfinished: nothing was decided, and the approver sees why.
     */
    async refused(context, revisionId, decision) {
      if (decision.refusal.code !== POSTING_REFUSED) return;
      const standing = await revisionStanding(context, revisionId);
      if (standing === undefined) return;
      await raisePostingRefused(context, dependencies.services().exceptions, {
        revision: standing.revision,
        revisionId,
        raisingEvent: decision.raisingEvent,
        refusal: decision.refusal,
        raisedBy: decision.actor,
      });
    },
  };
}

/**
 * The approval rule `merchandise` · PT declares to `access` with its decision's effect (access-and-approvals 8, 9.8b;
 * module-map section 3, rule 6), which the composition root hands over at start, with the services the effect acts
 * through, bound late, and how a large PT posts.
 */
export function ptApprovals(dependencies: PtDecisionDependencies): ModuleApprovals {
  return { rules: ptApprovalRules, effects: new Map([[PT_APPROVAL, ptDecisionEffect(dependencies)]]) };
}
