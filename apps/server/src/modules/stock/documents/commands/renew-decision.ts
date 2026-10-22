import { uuidv7 } from '@apparel-os/domain';
import {
  DAMAGE_DECISION,
  DAMAGE_REPORT_TYPE,
  type DamageDecisionRenewal,
  type DamageDecisionRenewed,
} from '@apparel-os/schemas';
import type { TransactionContext } from '../../../../kernel/index.js';
import type { AccessInterface } from '../../../access/index.js';
import type { AuditInterface } from '../../../audit/index.js';
import type { ConfigurationInterface } from '../../../configuration/index.js';
import type { StockLedgerInterface } from '../../ledger/index.js';
import { damageRound } from '../db/schema.js';
import { DAMAGE_SOURCE_TYPE, DOCUMENTS_MODULE } from '../domain/kinds.js';
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
  reportRow,
  roundsOf,
  scopeColumns,
  staleReport,
  valueChange,
  type Actor,
  type Outcome,
} from './common.js';
import { valueOfReportGoods } from './posting.js';

export interface RenewalDependencies {
  readonly audit: AuditInterface;
  readonly access: Pick<AccessInterface, 'requestApproval' | 'requestLockTargets'>;
  readonly configuration: Pick<ConfigurationInterface, 'checkAvailability'>;
  readonly ledger: StockLedgerInterface;
}

/**
 * Asks for the report's decision again (goods-in 8.5; PRD-ACS-007; DEC-066; S2-F08-T01): while its latest round
 * waits, when the goods' cost changed since it was asked and the decision is refused for it (access-and-approvals 9.7).
 * Locks the report at step 1 and names its version, the latest round (code-house-rules 8.2, 12.7), and asks the policy
 * gate (goods-in 10.5). A new round on the same damage hold, whose request supersedes the round's open one (9.6), on
 * the goods' cost now, read under the ledger's locks as the posting will read it (stock-ledger 13.1, 13.10); preparers
 * as before.
 */
export async function renewDecision(
  context: TransactionContext,
  dependencies: RenewalDependencies,
  actor: Actor,
  reportId: string,
  draft: DamageDecisionRenewal,
): Promise<Outcome<DamageDecisionRenewed>> {
  const found = await reportRow(context, reportId);
  if (found === undefined) return refusalOf(reportNotFound(reportId));
  // The round's open request is locked with the report at step 1, so a decision and the renewal never pass each other
  // (access-and-approvals 9.1a; code-house-rules 8.2).
  const open = await dependencies.access.requestLockTargets(context, {
    module: DOCUMENTS_MODULE,
    recordType: DAMAGE_REPORT_TYPE,
    recordId: reportId,
    versionId: draft.versionToken,
    actionType: DAMAGE_DECISION,
  });
  const report = await lockReport(context, reportId, open);
  if (report === undefined) return refusalOf(reportNotFound(reportId));
  const rounds = await roundsOf(context, reportId);
  const latest = rounds.at(-1);
  if (latest?.id !== draft.versionToken) return staleReport(reportId);
  if ((await decisionsOf(context, reportId)).some((each) => each.damageRoundId === latest.id)) {
    return refused('refused', 'stock.report-decided', [recordItem(DAMAGE_REPORT_TYPE, reportId)]);
  }
  const unavailable = await damageUnavailable(context, dependencies, report);
  if (unavailable !== undefined) return refusalOf(unavailable);
  const value = await valueOfReportGoods(
    context,
    dependencies,
    actor,
    report,
    { recordType: DAMAGE_SOURCE_TYPE, recordId: reportId },
    'good',
  );
  if (value.kind === 'refusal') return value;
  const roundId = uuidv7();
  await context.tx.insert(damageRound).values({
    id: roundId,
    damageReportId: reportId,
    roundNumber: rounds.length + 1,
    kind: 'renewed',
    holdId: latest.holdId,
    damageReversalId: null,
    ...scopeColumns(report),
    requestedByUserId: actor.userId,
  });
  const requestId = await dependencies.access.requestApproval(context, {
    actionType: DAMAGE_DECISION,
    document: { module: DOCUMENTS_MODULE, recordType: DAMAGE_REPORT_TYPE, recordId: reportId, versionId: roundId },
    value: value.answer,
    preparers: [report.reportedByUserId],
    requestedBy: actor,
    facts: factsOf(report),
  });
  await audited(context, dependencies.audit, actor, report, {
    record: { type: DAMAGE_REPORT_TYPE, id: reportId, versionId: roundId },
    operation: 'renew-damage-decision',
    changes: [valueChange('replaces', null, latest.id)],
  });
  return { kind: 'success', answer: { versionToken: roundId, requestId } };
}
