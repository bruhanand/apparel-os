import { uuidv7 } from '@apparel-os/domain';
import { PT_APPROVAL, PT_TYPE } from '@apparel-os/schemas';
import { CommandDefect, type LockTarget, type TransactionContext } from '../../../../kernel/index.js';
import type { DocumentEffect, EffectDecider, EffectOutcome, ModuleApprovals } from '../../../access/index.js';
import { ptProductLockTargets } from '../../catalogue/index.js';
import { mappingOn } from '../../../organisation/index.js';
import type { ReceivingInterface } from '../../../receiving/index.js';
import { ptPostRequest, ptRejection } from '../db/schema.js';
import { PT_MODULE, ptApprovalRules } from '../domain/kinds.js';
import { BUSINESS_DATE_NOT_SET } from '../domain/refusals.js';
import { ptPostRequested } from '../events.js';
import { productTargetsOf, revisionRowCount, revisionStanding } from '../queries/approval.js';
import { draftRefusal, postApproval, ptGateRefusal, type PostingServices } from './post-pt.js';
import { ptLock } from './pt-lock.js';
import { scopeColumnsOf } from './scope-columns.js';

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
//   back and nothing is written. A larger PT asks the policy gate, then records a request to post naming the decision
//   and the GRN unit's accounting book and publishes `merchandise.pt-post-requested`, with no stock or money effect: the
//   posting job posts it, one at a time per book (jobs/posting.ts; stock-ledger 10.6). While the composition has no
//   posting job, every PT posts with its decision (goods-in 6.6; RR-602).
// - **Reject** ends the draft: the rejection, the GRN's mark cleared (`pt-rejected`), the audit record. It records no
//   business effect, so it asks no gate (DEC-116); the uploader uploads a corrected file (goods-in 6.3).

/** How a PT's approval posts (goods-in 6.6): with its decision, or above a number of rows through the queued job. */
export type PtPostingQueue =
  { readonly kind: 'with-decision' } | { readonly kind: 'queued-above'; readonly rows: number };

/** What the decision's effect acts through, bound late, since `access` is built with it (access-and-approvals 9.8b). */
export interface PtDecisionServices extends PostingServices {
  readonly receiving: Pick<ReceivingInterface, 'ptBasis' | 'grnForPt' | 'ptMarkLock' | 'clearPtMark'>;
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
        return requestPosting(context, services, decided, revisionId, decider.reason);
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
      if (date.kind === 'not-set') return { kind: 'refusal', refusal: BUSINESS_DATE_NOT_SET };
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
        scope: scopeColumnsOfAudit(revision),
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
  };
}

/** A revision's scope facts as an audit record carries them: no Store is none (numbering-and-audit 4.1). */
function scopeColumnsOfAudit(revision: {
  siteId: string;
  storeId: string | null;
  businessUnitId: string;
  legalEntityId: string;
  brandId: string;
}) {
  return {
    siteId: revision.siteId,
    businessUnitId: revision.businessUnitId,
    legalEntityId: revision.legalEntityId,
    brandId: revision.brandId,
    ...(revision.storeId === null ? {} : { storeId: revision.storeId }),
  };
}

/**
 * The click of a large PT's approval (stock-ledger 10.6; access-and-approvals 9.8 step 1): the gate asked, then a
 * request to post naming the decision and the accounting book of the GRN unit's mapping in force, its audit record
 * and `merchandise.pt-post-requested`, with no stock or money effect. The PT shows Queued until its job posts it.
 */
async function requestPosting(
  context: TransactionContext,
  services: PtDecisionServices,
  decided: { readonly userId: string; readonly roleAssignmentId: string; readonly decisionId: string },
  revisionId: string,
  reason: string | undefined,
): Promise<EffectOutcome> {
  const standing = await revisionStanding(context, revisionId);
  const notDraft = draftRefusal(standing, revisionId);
  if (notDraft !== undefined || standing === undefined)
    return {
      kind: 'refusal',
      refusal: notDraft ?? { kind: 'not-found', code: 'merchandise.record-not-found', missing: [] },
    };
  const { revision } = standing;
  const date = await context.businessDate();
  if (date.kind === 'not-set') return { kind: 'refusal', refusal: BUSINESS_DATE_NOT_SET };
  const place = { siteId: revision.siteId, businessUnitId: revision.businessUnitId };
  const gate = await ptGateRefusal(context, services.configuration, place);
  if (gate !== undefined) return { kind: 'refusal', refusal: gate };
  const mapping = await mappingOn(context, revision.businessUnitId, date.date);
  if (mapping === undefined) {
    return {
      kind: 'refusal',
      refusal: {
        kind: 'unavailable',
        code: 'configuration.operation-unavailable',
        missing: [{ kind: 'mapping', businessUnitId: revision.businessUnitId, lacks: 'mapping' }],
      },
    };
  }
  const postRequestId = uuidv7();
  await context.tx.insert(ptPostRequest).values({
    id: postRequestId,
    ptRevisionId: revisionId,
    ...scopeColumnsOf(revision),
    approvalDecisionId: decided.decisionId,
    accountingBookId: mapping.accountingBookId,
    requestedByUserId: decided.userId,
    roleAssignmentId: decided.roleAssignmentId,
    requestedAt: context.startedAt,
  });
  const scope = scopeColumnsOfAudit(revision);
  await services.audit.record(context, {
    actor: { kind: 'user', id: decided.userId },
    roleAssignmentId: decided.roleAssignmentId,
    approval: { decisionId: decided.decisionId },
    ...(reason === undefined ? {} : { reason }),
    scope,
    record: { module: PT_MODULE, type: PT_TYPE, id: revision.ptId, versionId: revisionId },
    operation: 'request-pt-posting',
    changes: [
      { kind: 'value', field: 'state', before: 'Awaiting approval', after: 'Queued' },
      { kind: 'value', field: 'postRequestId', before: null, after: postRequestId },
    ],
    source: { kind: 'screen' },
  });
  await context.publish(ptPostRequested, {
    subject: { module: PT_MODULE, recordType: PT_TYPE, recordId: revision.ptId, versionId: revisionId },
    scope,
    payload: { postRequestId, revisionId, bookId: mapping.accountingBookId },
  });
  return { kind: 'success', answer: { revisionId, postRequestId } };
}

/**
 * The approval rule `merchandise` · PT declares to `access` with its decision's effect (access-and-approvals 8, 9.8b;
 * module-map section 3, rule 6), which the composition root hands over at start, with the services the effect acts
 * through, bound late, and how a large PT posts.
 */
export function ptApprovals(dependencies: PtDecisionDependencies): ModuleApprovals {
  return { rules: ptApprovalRules, effects: new Map([[PT_APPROVAL, ptDecisionEffect(dependencies)]]) };
}
