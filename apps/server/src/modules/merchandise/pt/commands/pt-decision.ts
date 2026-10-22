import { PT_APPROVAL } from '@apparel-os/schemas';
import { CommandDefect, type LockTarget, type TransactionContext } from '../../../../kernel/index.js';
import type { DocumentEffect, ModuleApprovals } from '../../../access/index.js';
import { PT_REVISION_TYPE, ptApprovalRules } from '../domain/kinds.js';
import { recordItem } from '../domain/refusals.js';
import { revisionFacts } from '../queries/pt-records.js';
import { ptLock } from './pt-lock.js';

// A PT revision's decision (goods-in 5.8, 6; access-and-approvals 9.8b; S2-F04-T02, code review 6 of stage 2). "The
// approval makes the PT official and values the stock in one transaction" (goods-in 6): until the PT approval builds
// that effect (S2-F06-T01), neither outcome is taken, so no PT is called approved without coverage or a value, and no
// rejection leaves the GRN's "PT attached" mark set. Decide takes the PT's identity row with the request at step 1, as
// every submit and withdrawal does (code-house-rules 8.2), and the check refuses either outcome under it, naming the
// revision, before anything of the decision is written. The draft stays waiting; a wrong one is withdrawn (5.7).

/** The PT's identity row, which the decision locks with the request at step 1. */
async function targetsOf(context: TransactionContext, revisionId: string): Promise<LockTarget[]> {
  const found = await revisionFacts(context, revisionId);
  return found === undefined ? [] : [ptLock(found.ptId)];
}

/** No outcome of a PT revision's decision is taken until the PT approval is built (S2-F06-T01). */
export const ptDecisionEffect: DocumentEffect = {
  targets: targetsOf,
  precheck(_context, revisionId) {
    return Promise.resolve({
      kind: 'refused',
      code: 'merchandise.pt-decision-not-available',
      missing: [recordItem(PT_REVISION_TYPE, revisionId)],
    });
  },
  approve() {
    throw new CommandDefect('A PT revision was approved past the check that refuses every decision of it');
  },
  reject() {
    throw new CommandDefect('A PT revision was rejected past the check that refuses every decision of it');
  },
};

/**
 * The approval rule `merchandise` · PT declares to `access` with its decision's effect (access-and-approvals 8, 9.8b;
 * module-map section 3, rule 6), which the composition root hands over at start.
 */
export function ptApprovals(): ModuleApprovals {
  return { rules: ptApprovalRules, effects: new Map([[PT_APPROVAL, ptDecisionEffect]]) };
}
