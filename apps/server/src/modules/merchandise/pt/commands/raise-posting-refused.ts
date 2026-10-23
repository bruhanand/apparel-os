import { PT_TYPE } from '@apparel-os/schemas';
import type { CommandRefusal, TransactionContext } from '../../../../kernel/index.js';
import type { AuditActor } from '../../../audit/index.js';
import type { ExceptionsInterface, Outcome, Raised } from '../../../exceptions/index.js';
import { PT_MODULE, PT_POSTING_FAILURE_TYPE, PT_POSTING_REFUSED_TYPE } from '../domain/kinds.js';
import { recordItem } from '../domain/refusals.js';
import { ptPostingFailed } from '../events.js';
import { postingFailureOf, postRequestOf, revisionStanding, type RevisionRow } from '../queries/approval.js';

// The unfinished-operation exception of a PT's posting refused (books-and-posting 10 step 3; access-and-approvals 9.8
// step 4; PRD-EXC-001, PRD-EXC-004, PRD-INT-008; code review 7). Raised in a command of its own, so the rollback of the
// posting does not lose it: after the decision's command that a posting refusal rolled back (the approval panel's,
// through `access`'s follow-up of a refused decision, 9.8b), or by the consumer of a queued posting's failure
// (jobs/posting.ts). It links the PT revision, carries the refusal's code and what it named as its comment, codes and
// identifiers only (code-house-rules 12.3), and is keyed by the event that raised it, so a replay raises none twice; a
// later one on the same revision links to the open one (PRD-EXC-004). Its exposure is Unknown, as every unfinished
// operation's (access-and-approvals 12.4). With no Open exception-code series or no routing of the type at the Site,
// nothing is raised and the refusal stands as the answer (DEC-116): the approver saw the refusal, and a failed queued
// PT shows Failed with why.

export interface PostingRefusal {
  readonly revision: RevisionRow;
  /**
   * The version the exception links under the PT: the revision whose approval was refused, or the reversal whose
   * posting was (goods-in 6.7; S2-F09-T01), which the resolution check reads apart (exception-types.ts).
   */
  readonly revisionId: string;
  readonly raisingEvent: string;
  readonly refusal: CommandRefusal<string>;
  readonly raisedBy: AuditActor;
}

/**
 * The exception of a queued posting's failure, raised by its consumer as its service identity (jobs/posting.ts), keyed by
 * the failure: every failed queued posting leaves an approved decision unused, an operation unfinished. A failure, a
 * request or a revision the identity may not see is not found, and the step keeps that refusal.
 */
export async function raiseForFailure(
  context: TransactionContext,
  exceptions: Pick<ExceptionsInterface, 'raiseInOwnCommand'>,
  raisedBy: AuditActor,
  failureId: string,
): Promise<Outcome<Raised>> {
  const failure = await postingFailureOf(context, failureId);
  const request = failure === undefined ? undefined : await postRequestOf(context, failure.ptPostRequestId);
  const standing = request === undefined ? undefined : await revisionStanding(context, request.ptRevisionId);
  if (failure === undefined || request === undefined || standing === undefined) {
    return {
      kind: 'refused',
      refusal: {
        kind: 'not-found',
        code: 'merchandise.record-not-found',
        missing: [recordItem(PT_POSTING_FAILURE_TYPE, failureId)],
      },
    };
  }
  return raisePostingRefused(context, exceptions, {
    revision: standing.revision,
    revisionId: request.ptRevisionId,
    raisingEvent: `${ptPostingFailed.type}:${failureId}`,
    refusal: { kind: 'refused', code: failure.code, missing: failure.missing },
    raisedBy,
  });
}

export function raisePostingRefused(
  context: TransactionContext,
  exceptions: Pick<ExceptionsInterface, 'raiseInOwnCommand'>,
  input: PostingRefusal,
): Promise<Outcome<Raised>> {
  const { revision } = input;
  return exceptions.raiseInOwnCommand(context, {
    raisingEvent: input.raisingEvent,
    typeCode: PT_POSTING_REFUSED_TYPE,
    facts: {
      siteId: revision.siteId,
      storeId: revision.storeId,
      businessUnitId: revision.businessUnitId,
      brandId: revision.brandId,
    },
    links: [{ module: PT_MODULE, recordType: PT_TYPE, recordId: revision.ptId, versionId: input.revisionId }],
    exposure: { kind: 'unknown' },
    raisedBy: input.raisedBy,
    comment: JSON.stringify({ code: input.refusal.code, missing: input.refusal.missing }),
  });
}
