import { LOCK_STEP, type TransactionContext } from '../../../../kernel/index.js';
import type { AccessInterface } from '../../../access/index.js';
import type { AuditInterface } from '../../../audit/index.js';
import { PT_REVISION_TYPE } from '../domain/kinds.js';
import { recordItem, refused, refusalOutcome, revisionNotFound, type Outcome } from '../domain/refusals.js';
import { revisionStanding } from '../queries/approval.js';
import type { PostingServices } from './post-pt.js';
import { ptLock } from './pt-lock.js';
import { requestPosting } from './request-posting.js';

// Post a failed PT again (goods-in 6.6; access-and-approvals 9.8 step 5; books-and-posting 10 step 5; stock-ledger 10.6;
// DEC-097; code review 7 of stage 2): once the cause of a queued posting's refusal is fixed, such as a map approved or
// a reopening naming the PT, whoever may approve PTs at its place asks for it to be posted again. A further request to
// post names the same decision and its approver, on whose behalf the job posts, and is used only while the revision is
// unchanged and its value under the lock within the decision's limit, as the job checks (9.7); otherwise the job fails
// again. Locks the PT's identity row and the decision's request at step 1 (code-house-rules 8.2), so two never pass each
// other or the job; under them the revision's latest posting must have failed (`merchandise.pt-not-failed`), then the
// request is recorded as the click records one (request-posting.ts), the gate asked first. No version token: it acts
// only on a revision whose latest posting failed, which the lock rechecks. The caller has authorised approve on the PT
// with its facts and holds it at step 0. **Design choice.**

export interface PostAgainDependencies {
  readonly audit: AuditInterface;
  readonly access: Pick<AccessInterface, 'approvalLockTargets'>;
  readonly configuration: PostingServices['configuration'];
}

export async function postAgain(
  context: TransactionContext,
  dependencies: PostAgainDependencies,
  actor: { readonly userId: string; readonly roleAssignmentId: string },
  revisionId: string,
): Promise<Outcome<{ readonly revisionId: string; readonly postRequestId: string }>> {
  const before = await revisionStanding(context, revisionId);
  if (before === undefined) return refusalOutcome(revisionNotFound(revisionId));
  const notFailed = refused('refused', 'merchandise.pt-not-failed', [recordItem(PT_REVISION_TYPE, revisionId)]);
  if (before.postRequest === undefined) return notFailed;
  await context.lock(LOCK_STEP.document, [
    ptLock(before.revision.ptId),
    ...(await dependencies.access.approvalLockTargets(context, before.postRequest.approvalDecisionId)),
  ]);
  const standing = await revisionStanding(context, revisionId);
  if (standing === undefined) return refusalOutcome(revisionNotFound(revisionId));
  const { postRequest, failure } = standing;
  if (postRequest === undefined || failure === undefined || standing.approval !== undefined) return notFailed;
  return requestPosting(context, dependencies, {
    revision: standing.revision,
    revisionId,
    decisionId: postRequest.approvalDecisionId,
    approverUserId: postRequest.approvedByUserId,
    requester: actor,
    from: 'Failed',
  });
}
