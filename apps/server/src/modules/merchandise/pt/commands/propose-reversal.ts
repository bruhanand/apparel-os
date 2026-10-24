import { paise, uuidv7 } from '@apparel-os/domain';
import { PT_REVERSAL_APPROVAL, PT_TYPE, type PtReversalDraft, type PtReversalProposed } from '@apparel-os/schemas';
import type { TransactionContext } from '../../../../kernel/index.js';
import type { AccessInterface } from '../../../access/index.js';
import type { AuditInterface } from '../../../audit/index.js';
import type { ReceivingInterface } from '../../../receiving/index.js';
import { ptReversal } from '../db/schema.js';
import { PT_MODULE, PT_REVERSAL_TYPE } from '../domain/kinds.js';
import { BUSINESS_DATE_NOT_SET, recordItem, type Outcome } from '../domain/refusals.js';
import { revisionStanding } from '../queries/approval.js';
import { reversalsOf } from '../queries/reversal.js';
import type { Actor } from './withdraw-pt.js';
import { ptAtVersion } from './pt-at-version.js';
import { goodsRefusal, notOfficial, officialRefusal } from './reversal-checks.js';
import { scopeColumnsOf } from './scope-columns.js';

// Propose the reversal of an Official PT before the scan-in, with a reason (goods-in 6.4, 6.7, section 11; DEC-137,
// PRD-REC-019; S2-F09-T01). In one transaction: the PT's row and the GRN's row locked at step 1, as every scan locks
// the GRN's (code-house-rules 8.2; goods-in 7.5), the PT's version token and the revision rechecked under them; refused
// while a piece of the GRN is scanned in (`receiving`'s `anyAccepted`; DEC-137), while a piece the PT covers is held or
// damaged (domain/reversed.ts), or while another reversal of it waits; then the reversal written and its approval
// requested from a different person, on the cost it reverses, the PT's total proposed acquisition cost (domain-model
// 5; PRD-ACS-015); and the audit record. A proposal records no business effect, so it asks no gate (DEC-116); the
// approval does (commands/reverse-pt.ts). The caller has authorised edit on the PT with its facts and holds it at
// step 0.

export interface ProposalDependencies {
  readonly audit: AuditInterface;
  readonly access: Pick<AccessInterface, 'requestApproval'>;
  readonly receiving: Pick<ReceivingInterface, 'ptMarkLock' | 'anyAccepted'>;
}

export async function proposeReversal(
  context: TransactionContext,
  dependencies: ProposalDependencies,
  actor: Actor,
  revisionId: string,
  draft: PtReversalDraft,
): Promise<Outcome<PtReversalProposed>> {
  const opened = await ptAtVersion(context, dependencies.receiving, revisionId, draft.versionToken);
  if (opened.kind === 'refusal') return opened;
  const { owner, facts } = opened.answer;
  const standing = await revisionStanding(context, revisionId);
  const official = await officialRefusal(context, standing, revisionId);
  if (official !== undefined || standing?.approval === undefined) {
    return { kind: 'refusal', refusal: official ?? notOfficial(revisionId) };
  }
  // One at a time: a reversal waiting for its decision is decided first.
  const waiting = (await reversalsOf(context, [revisionId]))
    .get(revisionId)
    ?.find((each) => each.decision === undefined);
  if (waiting !== undefined) {
    return {
      kind: 'refusal',
      refusal: {
        kind: 'refused',
        code: 'merchandise.pt-reversal-open',
        missing: [recordItem(PT_REVERSAL_TYPE, waiting.reversal.id)],
      },
    };
  }
  const goods = await goodsRefusal(context, dependencies.receiving, owner.grnId, revisionId);
  if (goods !== undefined) return { kind: 'refusal', refusal: goods };
  const date = await context.businessDate();
  if (date.kind === 'not-set') return { kind: 'refusal', refusal: BUSINESS_DATE_NOT_SET };
  const { revision } = standing;
  const reversalId = uuidv7();
  const reason = draft.reason.trim();
  await context.tx.insert(ptReversal).values({
    id: reversalId,
    ptRevisionId: revisionId,
    ptApprovalId: standing.approval.id,
    ...scopeColumnsOf(revision),
    reason,
    proposedByUserId: actor.userId,
    roleAssignmentId: actor.roleAssignmentId,
    proposedAt: context.startedAt,
    businessDate: date.date,
  });
  // The cost it reverses: the PT's total proposed acquisition cost, P RATE times QTY over its rows (goods-in 6.1).
  const requestId = await dependencies.access.requestApproval(context, {
    actionType: PT_REVERSAL_APPROVAL,
    document: { module: PT_MODULE, recordType: PT_TYPE, recordId: owner.id, versionId: reversalId },
    value: { kind: 'known', amountPaise: paise(revision.costPaise) },
    preparers: [actor.userId],
    requestedBy: actor,
    facts,
  });
  await dependencies.audit.record(context, {
    actor: { kind: 'user', id: actor.userId },
    roleAssignmentId: actor.roleAssignmentId,
    scope: facts,
    record: { module: PT_MODULE, type: PT_TYPE, id: owner.id, versionId: revisionId },
    operation: 'propose-pt-reversal',
    changes: [
      { kind: 'value', field: 'reversalId', before: null, after: reversalId },
      { kind: 'value', field: 'reason', before: null, after: reason },
    ],
    source: { kind: 'screen' },
  });
  return { kind: 'success', answer: { ptReversalId: reversalId, requestId } };
}
