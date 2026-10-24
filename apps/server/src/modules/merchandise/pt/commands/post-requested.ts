import { uuidv7 } from '@apparel-os/domain';
import { PT_TYPE } from '@apparel-os/schemas';
import {
  CommandDefect,
  LOCK_STEP,
  withSavepoint,
  type CommandRefusal,
  type TransactionContext,
} from '../../../../kernel/index.js';
import type { AccessInterface } from '../../../access/index.js';
import { ptPostingFailure } from '../db/schema.js';
import { PT_MODULE } from '../domain/kinds.js';
import { notADraft, postRequestNotFound } from '../domain/refusals.js';
import { ptPostingFailed } from '../events.js';
import { postRequestOf, revisionStanding } from '../queries/approval.js';
import { postApproval, type PostingServices } from './post-pt.js';
import { decisionTargets, type PtDecisionServices } from './pt-decision.js';
import { auditScopeOf, scopeColumnsOf } from './scope-columns.js';

// The posting job of a large PT's approval (goods-in 6.3, 6.6; module-map 6.2 flow E; stock-ledger 10.6;
// access-and-approvals 9.8 steps 2 to 4; code-house-rules 12.9; DEC-097; S2-F06-T01). The posting consumer calls it in
// its step's transaction, under its internal service identity on behalf of the approver, one job at a time per
// accounting book. The identity's authority on the PT is authorised with the request's facts, as a person's would be
// (the worker held its assignment at step 0); then it locks at step 1 the rows the decision locked, with the decision's
// request, and rechecks that the request is the revision's latest and unanswered and the revision still waits for its
// posting. Then it posts as the decision's own effect would (post-pt.ts), rechecking the gate, the GRN and the
// products, verifying and using the decision under the ledger's locks. A refusal of any of it, the identity's
// authority included, posts nothing: the work rolls back to a savepoint taken before its first write, the decision
// stays unused, and the failure is written naming the request and the refusal, so the PT shows Failed with why (9.8
// step 4), with `merchandise.pt-posting-failed`, whose consumer raises the unfinished-operation exception in a step of
// its own (books-and-posting 10 step 3; code review 7). A refusal under the locks is never retried (code-house-rules
// 12.9): the job is done, and the PT is posted again by Post again once the cause is fixed (post-again.ts). Only a
// request gone or answered leaves nothing: the job keeps that refusal as its answer.

/** The service identity the posting consumer runs as (access-and-approvals 2.3). */
export interface PtPostingPublisher {
  readonly serviceIdentityId: string;
}

/** What the job came to: posted, its failure written, or a refusal before the revision's lock. */
export type PtPostingAnswer =
  | { readonly kind: 'posted'; readonly ptApprovalId: string; readonly number: string }
  | { readonly kind: 'failed'; readonly refusal: CommandRefusal }
  | { readonly kind: 'refused'; readonly refusal: CommandRefusal };

const SAVEPOINT = 'merchandise_pt_posting';

/** What the job step acts through: the decision's services, and `access`' Authorise and the decision's lock. */
export type PtPostingServices = PtDecisionServices & {
  readonly access: PostingServices['access'] & Pick<AccessInterface, 'authorise' | 'approvalLockTargets'>;
};

export async function postRequested(
  context: TransactionContext,
  services: PtPostingServices,
  publisher: PtPostingPublisher,
  postRequestId: string,
): Promise<PtPostingAnswer> {
  const request = await postRequestOf(context, postRequestId);
  if (request === undefined) return { kind: 'refused', refusal: postRequestNotFound(postRequestId) };
  const authorised = await services.access.authorise(context, {
    actorId: publisher.serviceIdentityId,
    action: 'edit',
    recordType: PT_TYPE,
    facts: auditScopeOf(request),
  });
  await context.lock(LOCK_STEP.document, [
    ...(await decisionTargets(context, services.receiving, request.ptRevisionId)),
    ...(await services.access.approvalLockTargets(context, request.approvalDecisionId)),
  ]);
  const standing = await revisionStanding(context, request.ptRevisionId);
  if (standing === undefined) return { kind: 'refused', refusal: postRequestNotFound(postRequestId) };
  // Only the revision's latest request, unanswered, while the revision is not posted (9.8 steps 2 and 3).
  if (standing.postRequest?.id !== request.id || standing.failure !== undefined || standing.approval !== undefined) {
    return { kind: 'refused', refusal: notADraft(request.ptRevisionId) };
  }
  const tried =
    authorised.kind === 'refused'
      ? undefined
      : await withSavepoint(
          context,
          SAVEPOINT,
          [],
          () =>
            postApproval(context, services, {
              revisionId: request.ptRevisionId,
              decisionId: request.approvalDecisionId,
              approverUserId: request.approvedByUserId,
              poster: {
                kind: 'service-identity',
                serviceIdentityId: publisher.serviceIdentityId,
                roleAssignmentId: authorised.roleAssignmentId,
                onBehalfOfUserId: request.approvedByUserId,
              },
              postRequestId: request.id,
            }),
          (posted) => posted.kind === 'success',
        );
  if (tried?.kind === 'caught') throw new CommandDefect('The PT posting caught a database error it names none of');
  if (tried?.value.kind === 'success') return { kind: 'posted', ...tried.value.answer };
  const refusal = tried === undefined ? identityRefusal(authorised) : tried.value.refusal;
  const failureId = uuidv7();
  await context.tx.insert(ptPostingFailure).values({
    id: failureId,
    ptPostRequestId: request.id,
    ...scopeColumnsOf(request),
    code: refusal.code,
    missing: refusal.missing.map((item) => ({ ...item })),
    failedAt: context.startedAt,
  });
  await services.audit.record(context, {
    actor: { kind: 'service-identity', id: publisher.serviceIdentityId, onBehalfOfUserId: request.approvedByUserId },
    ...(authorised.kind === 'allowed' ? { roleAssignmentId: authorised.roleAssignmentId } : {}),
    scope: auditScopeOf(request),
    record: { module: PT_MODULE, type: PT_TYPE, id: standing.revision.ptId, versionId: request.ptRevisionId },
    operation: 'pt-posting-failed',
    changes: [
      { kind: 'value', field: 'state', before: 'Posting', after: 'Failed' },
      { kind: 'value', field: 'failureId', before: null, after: failureId },
      { kind: 'value', field: 'code', before: null, after: refusal.code },
    ],
    source: { kind: 'job', reference: request.id },
  });
  await context.publish(ptPostingFailed, {
    subject: {
      module: PT_MODULE,
      recordType: PT_TYPE,
      recordId: standing.revision.ptId,
      versionId: request.ptRevisionId,
    },
    scope: auditScopeOf(request),
    onBehalfOfUserId: request.approvedByUserId,
    payload: { failureId, postRequestId: request.id, revisionId: request.ptRevisionId },
  });
  return { kind: 'failed', refusal };
}

/** The refusal of the identity's authority, kept as the posting's failure. */
function identityRefusal(authorised: Awaited<ReturnType<AccessInterface['authorise']>>): CommandRefusal {
  if (authorised.kind === 'refused') return authorised.refusal;
  throw new CommandDefect('A PT posting failed with no refusal');
}
