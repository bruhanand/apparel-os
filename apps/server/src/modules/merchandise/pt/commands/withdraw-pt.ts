import { uuidv7 } from '@apparel-os/domain';
import { PT_APPROVAL, PT_TYPE, type MissingItem } from '@apparel-os/schemas';
import { eq } from 'drizzle-orm';
import { LOCK_STEP, type CommandRefusal, type TransactionContext } from '../../../../kernel/index.js';
import type { AccessInterface } from '../../../access/index.js';
import type { AuditInterface } from '../../../audit/index.js';
import type { ReceivingInterface } from '../../../receiving/index.js';
import { pt, ptRevisionWithdrawal } from '../db/schema.js';
import { PT_MODULE, PT_REVISION_TYPE } from '../domain/kinds.js';
import { ptVersionToken, revisionFacts } from '../queries/pt-records.js';
import { ptLock } from './submit-pt.js';

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

type Outcome<Answer> =
  | { readonly kind: 'success'; readonly answer: Answer }
  | { readonly kind: 'refusal'; readonly refusal: CommandRefusal };

const recordItem = (recordType: string, recordId: string): MissingItem => ({ kind: 'record', recordType, recordId });

export const revisionNotFound = (revisionId: string): CommandRefusal => ({
  kind: 'not-found',
  code: 'merchandise.record-not-found',
  missing: [recordItem(PT_REVISION_TYPE, revisionId)],
});

export async function withdrawPt(
  context: TransactionContext,
  dependencies: WithdrawDependencies,
  actor: Actor,
  revisionId: string,
  versionToken: string,
): Promise<Outcome<{ readonly ptId: string; readonly revisionId: string; readonly withdrawalId: string }>> {
  const found = await revisionFacts(context, revisionId);
  if (found === undefined) return { kind: 'refusal', refusal: revisionNotFound(revisionId) };
  const [owner] = await context.tx.select().from(pt).where(eq(pt.id, found.ptId));
  if (owner === undefined) return { kind: 'refusal', refusal: revisionNotFound(revisionId) };
  const document = {
    module: PT_MODULE,
    recordType: PT_TYPE,
    recordId: owner.id,
    versionId: revisionId,
    actionType: PT_APPROVAL,
  };
  await context.lock(LOCK_STEP.document, [
    ptLock(owner.id),
    dependencies.receiving.ptMarkLock(owner.grnId),
    ...(await dependencies.access.requestLockTargets(context, document)),
  ]);
  // Rechecked under the locks (code-house-rules 8.1, 12.7).
  const token = await ptVersionToken(context, owner.id);
  if (token !== versionToken) {
    return {
      kind: 'refusal',
      refusal: {
        kind: 'conflict',
        code: 'kernel.stale-version',
        missing: [{ kind: 'version', recordType: PT_TYPE, recordId: owner.id, versionId: token ?? '' }],
      },
    };
  }
  const notADraft: Outcome<never> = {
    kind: 'refusal',
    refusal: { kind: 'refused', code: 'merchandise.pt-not-a-draft', missing: [recordItem(PT_REVISION_TYPE, revisionId)] },
  };
  if (token !== revisionId) return notADraft;
  const by = { userId: actor.userId, roleAssignmentId: actor.roleAssignmentId };
  if ((await dependencies.access.withdrawRequest(context, document, by)) !== 'withdrawn') return notADraft;
  const date = await context.businessDate();
  if (date.kind === 'not-set') {
    return {
      kind: 'refusal',
      refusal: {
        kind: 'unavailable',
        code: 'access.business-date-not-set',
        missing: [{ kind: 'setting', setting: 'configuration.timezone' }],
      },
    };
  }
  const withdrawalId = uuidv7();
  await context.tx.insert(ptRevisionWithdrawal).values({
    id: withdrawalId,
    ptRevisionId: revisionId,
    siteId: owner.siteId,
    storeId: owner.storeId,
    businessUnitId: owner.businessUnitId,
    legalEntityId: owner.legalEntityId,
    brandId: owner.brandId,
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
    scope: found.facts,
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
