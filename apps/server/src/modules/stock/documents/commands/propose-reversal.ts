import { uuidv7 } from '@apparel-os/domain';
import {
  DAMAGE_REPORT_TYPE,
  DAMAGE_REVERSAL_APPROVAL,
  DAMAGE_REVERSAL_TYPE,
  type DamageReversalDraft,
  type DamageReversalProposed,
} from '@apparel-os/schemas';
import type { TransactionContext } from '../../../../kernel/index.js';
import type { AccessInterface } from '../../../access/index.js';
import type { AuditInterface } from '../../../audit/index.js';
import type { ConfigurationInterface } from '../../../configuration/index.js';
import type { StockLedgerInterface } from '../../ledger/index.js';
import { damageReversal } from '../db/schema.js';
import { DOCUMENTS_MODULE, REVERSAL_SOURCE_TYPE } from '../domain/kinds.js';
import { damageUnavailable } from '../queries/availability.js';
import {
  audited,
  decisionsOf,
  factsOf,
  lockReport,
  recordItem,
  refusalOf,
  refused,
  reportNotFound,
  reversalsOf,
  roundsOf,
  scopeColumns,
  staleReport,
  valueChange,
  type Actor,
  type Outcome,
} from './common.js';
import { valueOfReportGoods } from './posting.js';

export interface ProposalDependencies {
  readonly audit: AuditInterface;
  readonly access: Pick<AccessInterface, 'requestApproval'>;
  readonly configuration: Pick<ConfigurationInterface, 'checkAvailability'>;
  readonly ledger: StockLedgerInterface;
}

/**
 * Proposes a reversal of the report's confirmation, with a reason (goods-in 8.3; PRD-STK-017; S2-F08-T01): only of the
 * confirmation the report stands on now, and one at a time. Locks the report at step 1 and names its version, the
 * latest round (code-house-rules 8.2, 12.7), and asks the policy gate (goods-in 10.5). Its approval is requested from a
 * different authorised person, on the cost of the goods it returns to good condition now, read under the ledger's
 * locks as the posting will read it (stock-ledger 13.1, 13.10).
 */
export async function proposeReversal(
  context: TransactionContext,
  dependencies: ProposalDependencies,
  actor: Actor,
  reportId: string,
  draft: DamageReversalDraft,
): Promise<Outcome<DamageReversalProposed>> {
  const report = await lockReport(context, reportId);
  if (report === undefined) return refusalOf(reportNotFound(reportId));
  const latest = (await roundsOf(context, reportId)).at(-1);
  if (latest?.id !== draft.versionToken) return staleReport(reportId);
  const confirmation = (await decisionsOf(context, reportId)).find((each) => each.damageRoundId === latest.id);
  if (confirmation?.outcome !== 'Confirmed') {
    return refused('refused', 'stock.report-not-confirmed', [recordItem(DAMAGE_REPORT_TYPE, reportId)]);
  }
  const reversals = await reversalsOf(context, reportId);
  const waiting = reversals.find(
    (each) => each.reversal.damageDecisionId === confirmation.id && each.decision === null,
  );
  if (waiting !== undefined) {
    return refused('refused', 'stock.reversal-open', [recordItem(DAMAGE_REVERSAL_TYPE, waiting.reversal.id)]);
  }
  const unavailable = await damageUnavailable(context, dependencies, report);
  if (unavailable !== undefined) return refusalOf(unavailable);
  const reversalId = uuidv7();
  const value = await valueOfReportGoods(
    context,
    dependencies,
    actor,
    report,
    { recordType: REVERSAL_SOURCE_TYPE, recordId: reversalId },
    'damaged',
  );
  if (value.kind === 'refusal') return value;
  const reason = draft.reason.trim();
  await context.tx.insert(damageReversal).values({
    id: reversalId,
    damageReportId: reportId,
    damageDecisionId: confirmation.id,
    reason,
    proposedByUserId: actor.userId,
    roleAssignmentId: actor.roleAssignmentId,
    proposedAt: context.startedAt,
    ...scopeColumns(report),
  });
  const requestId = await dependencies.access.requestApproval(context, {
    actionType: DAMAGE_REVERSAL_APPROVAL,
    document: {
      module: DOCUMENTS_MODULE,
      recordType: DAMAGE_REVERSAL_TYPE,
      recordId: reversalId,
      versionId: reversalId,
    },
    value: value.answer,
    preparers: [actor.userId],
    requestedBy: actor,
    facts: factsOf(report),
  });
  await audited(context, dependencies.audit, actor, report, {
    record: { type: DAMAGE_REVERSAL_TYPE, id: reversalId, versionId: reversalId },
    operation: 'propose-damage-reversal',
    changes: [
      valueChange('damageReportId', null, reportId),
      valueChange('damageDecisionId', null, confirmation.id),
      valueChange('reason', null, reason),
    ],
  });
  return { kind: 'success', answer: { damageReversalId: reversalId, requestId } };
}
