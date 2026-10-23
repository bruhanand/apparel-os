import { uuidv7 } from '@apparel-os/domain';
import { PT_APPROVAL, PT_TYPE } from '@apparel-os/schemas';
import type { TransactionContext } from '../../../../kernel/index.js';
import type { AccessInterface } from '../../../access/index.js';
import type { AuditInterface } from '../../../audit/index.js';
import type { ReceivingInterface } from '../../../receiving/index.js';
import { ptRevisionWithdrawal } from '../db/schema.js';
import { PT_MODULE, PT_REVISION_TYPE } from '../domain/kinds.js';
import { BUSINESS_DATE_NOT_SET, recordItem, type Outcome } from '../domain/refusals.js';
import { ptAtVersion } from './pt-at-version.js';
import { scopeColumnsOf } from './scope-columns.js';

// Withdraw a draft PT revision (goods-in 5.7, 5.8, section 11; S2-F04-T02): a draft is never edited; a wrong file is
// withdrawn and a corrected one uploaded. In one transaction: the PT's row, the GRN's row and the revision's open
// approval request locked at step 1 (code-house-rules 8.2), the PT's version token and the draft rechecked under them,
// the request withdrawn through `access` (access-and-approvals 9.1a), the withdrawal written, the GRN's mark cleared
// and the audit recorded. Only the PT's newest revision, still waiting for its decision, is withdrawn. The caller has
// authorised edit on the PT with its facts and holds it at step 0.

export interface WithdrawDependencies {
  readonly audit: AuditInterface;
  readonly access: Pick<AccessInterface, 'requestLockTargets' | 'withdrawRequest'>;
  readonly receiving: Pick<ReceivingInterface, 'ptMarkLock' | 'clearPtMark'>;
}

export interface Actor {
  readonly userId: string;
  readonly roleAssignmentId: string;
}

/** The approval request's document: the PT at the revision, under the PT approval's action type (9.1a). */
const documentOf = (ptId: string, revisionId: string) => ({
  module: PT_MODULE,
  recordType: PT_TYPE,
  recordId: ptId,
  versionId: revisionId,
  actionType: PT_APPROVAL,
});

export async function withdrawPt(
  context: TransactionContext,
  dependencies: WithdrawDependencies,
  actor: Actor,
  revisionId: string,
  versionToken: string,
): Promise<Outcome<{ readonly ptId: string; readonly revisionId: string; readonly withdrawalId: string }>> {
  const opened = await ptAtVersion(context, dependencies.receiving, revisionId, versionToken, (owner) =>
    dependencies.access.requestLockTargets(context, documentOf(owner.id, revisionId)),
  );
  if (opened.kind === 'refusal') return opened;
  const { owner, facts, token } = opened.answer;
  const document = documentOf(owner.id, revisionId);
  const notADraft: Outcome<never> = {
    kind: 'refusal',
    refusal: {
      kind: 'refused',
      code: 'merchandise.pt-not-a-draft',
      missing: [recordItem(PT_REVISION_TYPE, revisionId)],
    },
  };
  if (token !== revisionId) return notADraft;
  const by = { userId: actor.userId, roleAssignmentId: actor.roleAssignmentId };
  if ((await dependencies.access.withdrawRequest(context, document, by)) !== 'withdrawn') return notADraft;
  const date = await context.businessDate();
  if (date.kind === 'not-set') return { kind: 'refusal', refusal: BUSINESS_DATE_NOT_SET };
  const withdrawalId = uuidv7();
  await context.tx.insert(ptRevisionWithdrawal).values({
    id: withdrawalId,
    ptRevisionId: revisionId,
    ...scopeColumnsOf(owner),
    withdrawnByUserId: actor.userId,
    roleAssignmentId: actor.roleAssignmentId,
    occurredAt: context.startedAt,
    businessDate: date.date,
  });
  const cleared = await dependencies.receiving.clearPtMark(context, by, {
    grnId: owner.grnId,
    ptRevisionId: revisionId,
    reason: 'pt-withdrawn',
    source: { kind: 'screen' },
  });
  if (cleared.kind === 'refusal') return cleared;
  await dependencies.audit.record(context, {
    actor: { kind: 'user', id: actor.userId },
    roleAssignmentId: actor.roleAssignmentId,
    scope: facts,
    record: { module: PT_MODULE, type: PT_TYPE, id: owner.id, versionId: revisionId },
    operation: 'withdraw-pt',
    changes: [
      { kind: 'value', field: 'state', before: 'Awaiting approval', after: 'Withdrawn' },
      { kind: 'value', field: 'withdrawalId', before: null, after: withdrawalId },
    ],
    source: { kind: 'screen' },
  });
  return { kind: 'success', answer: { ptId: owner.id, revisionId, withdrawalId } };
}
