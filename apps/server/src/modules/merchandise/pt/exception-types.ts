import { PT_TYPE, type MissingItem } from '@apparel-os/schemas';
import type { TransactionContext } from '../../../kernel/index.js';
import type { ExceptionTypeRegistration, ResolutionAnswer, ResolutionSubject } from '../../exceptions/index.js';
import { PT_MODULE, PT_POSTING_REFUSED_TYPE, PT_REVERSAL_TYPE, PT_REVISION_TYPE } from './domain/kinds.js';
import { recordItem } from './domain/refusals.js';
import { revisionStanding } from './queries/approval.js';
import { reversalOf } from './queries/reversal.js';

// The exception type `merchandise` · PT raises (access-and-approvals 12.1, 12.3; books-and-posting 10 step 3;
// PRD-EXC-001, PRD-EXC-002; code review 7): an unfinished operation of a PT's posting, refused under the locks or
// failed in its queued job, linking the PT revision. Its owner is whoever the routing of the type at the Site names
// (POL-02.16). Its evidence carries no restricted class (RR-453). **Design choice.**

/**
 * The resolution check (12.3): the operation is finished once each revision it links no longer waits for its posting:
 * Official, or ended otherwise, rejected or withdrawn; and once each reversal it links, whose posting was refused, is
 * decided (goods-in 6.7; S2-F09-T01). A linked version the closer may see as neither is named as missing as what the
 * link is, a version of the PT (code-house-rules 12.3).
 */
async function postingFinished(context: TransactionContext, subject: ResolutionSubject): Promise<ResolutionAnswer> {
  const missing: MissingItem[] = [];
  for (const link of subject.links) {
    if (link.recordType !== PT_TYPE || link.versionId === null) continue;
    const standing = await revisionStanding(context, link.versionId);
    if (standing === undefined) {
      const reversal = await reversalOf(context, link.versionId);
      // Neither a revision nor a reversal the closer may see: named as what the link is, a version of the PT.
      if (reversal === undefined) {
        missing.push({ kind: 'version', recordType: PT_TYPE, recordId: link.recordId, versionId: link.versionId });
      } else if (reversal.decision === undefined) missing.push(recordItem(PT_REVERSAL_TYPE, link.versionId));
      continue;
    }
    const finished = standing.approval !== undefined || standing.rejected || standing.withdrawn;
    if (!finished) missing.push(recordItem(PT_REVISION_TYPE, link.versionId));
  }
  return missing.length === 0 ? { kind: 'verified' } : { kind: 'not-verified', missing };
}

/** The exception types `merchandise` · PT raises, handed to `exceptions` by the composition root (module-map section 3). */
export const ptExceptionTypes: readonly ExceptionTypeRegistration[] = [
  {
    code: PT_POSTING_REFUSED_TYPE,
    category: 'unfinished-operation',
    module: PT_MODULE,
    linksTo: [PT_TYPE],
    evidenceClasses: [],
    resolutionCheck: postingFinished,
  },
];
