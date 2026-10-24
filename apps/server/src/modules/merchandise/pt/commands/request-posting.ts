import { uuidv7 } from '@apparel-os/domain';
import { PT_TYPE } from '@apparel-os/schemas';
import type { TransactionContext } from '../../../../kernel/index.js';
import type { AuditInterface } from '../../../audit/index.js';
import { mappingOn } from '../../../organisation/index.js';
import { ptPostRequest } from '../db/schema.js';
import { PT_MODULE } from '../domain/kinds.js';
import { BUSINESS_DATE_NOT_SET, refusalOutcome, type Outcome } from '../domain/refusals.js';
import { ptPostRequested } from '../events.js';
import type { RevisionRow } from '../queries/approval.js';
import { ptGateRefusal, type PostingServices } from './post-pt.js';
import { auditScopeOf, scopeColumnsOf } from './scope-columns.js';

// A request to post an approved PT revision through its queued job (goods-in 6.6; stock-ledger 10.6;
// access-and-approvals 9.8 steps 1 and 5; module-map 6.2 flow E; S2-F06-T01): written by the approval click of a large
// PT, and by Post again once a failed posting's cause is fixed (books-and-posting 10 step 5; code review 7). It asks the
// policy gate first, so an operation still unavailable is refused before anything is written (books-and-posting 10 step
// 1), then records the request naming the decision, its approver and the accounting book of the GRN unit's mapping in
// force, its audit record and `merchandise.pt-post-requested`, with no stock or money effect. The PT shows Posting until
// its job posts it, one at a time per book.

export interface RequestPostingInput {
  readonly revision: RevisionRow;
  readonly revisionId: string;
  /** The approval decision the job will verify and use, and its approver, on whose behalf it posts (9.8 step 2). */
  readonly decisionId: string;
  readonly approverUserId: string;
  /** Who asks: the approver at the click, or whoever posts it again. */
  readonly requester: { readonly userId: string; readonly roleAssignmentId: string };
  /** The state the PT leaves: Awaiting approval at the click, Failed when posted again (design-language 7). */
  readonly from: 'Awaiting approval' | 'Failed';
  readonly reason?: string;
}

export async function requestPosting(
  context: TransactionContext,
  services: { readonly audit: AuditInterface; readonly configuration: PostingServices['configuration'] },
  input: RequestPostingInput,
): Promise<Outcome<{ readonly revisionId: string; readonly postRequestId: string }>> {
  const { revision, revisionId, requester } = input;
  const date = await context.businessDate();
  if (date.kind === 'not-set') return refusalOutcome(BUSINESS_DATE_NOT_SET);
  const place = { siteId: revision.siteId, businessUnitId: revision.businessUnitId };
  const gate = await ptGateRefusal(context, services.configuration, place);
  if (gate !== undefined) return refusalOutcome(gate);
  const mapping = await mappingOn(context, revision.businessUnitId, date.date);
  if (mapping === undefined) {
    return refusalOutcome({
      kind: 'unavailable',
      code: 'configuration.operation-unavailable',
      missing: [{ kind: 'mapping', businessUnitId: revision.businessUnitId, lacks: 'mapping' }],
    });
  }
  const postRequestId = uuidv7();
  await context.tx.insert(ptPostRequest).values({
    id: postRequestId,
    ptRevisionId: revisionId,
    ...scopeColumnsOf(revision),
    approvalDecisionId: input.decisionId,
    approvedByUserId: input.approverUserId,
    accountingBookId: mapping.accountingBookId,
    requestedByUserId: requester.userId,
    roleAssignmentId: requester.roleAssignmentId,
    requestedAt: context.startedAt,
  });
  const scope = auditScopeOf(revision);
  await services.audit.record(context, {
    actor: { kind: 'user', id: requester.userId },
    roleAssignmentId: requester.roleAssignmentId,
    approval: { decisionId: input.decisionId },
    ...(input.reason === undefined ? {} : { reason: input.reason }),
    scope,
    record: { module: PT_MODULE, type: PT_TYPE, id: revision.ptId, versionId: revisionId },
    operation: input.from === 'Failed' ? 'post-pt-again' : 'request-pt-posting',
    changes: [
      { kind: 'value', field: 'state', before: input.from, after: 'Posting' },
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
