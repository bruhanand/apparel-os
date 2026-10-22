import { uuidv7 } from '@apparel-os/domain';
import {
  DAMAGE_DECISION,
  DAMAGE_REPORT_TYPE,
  DAMAGE_REVERSAL_APPROVAL,
  DAMAGE_REVERSAL_TYPE,
  type DamageDecisionRenewal,
  type DamageDecisionRenewed,
  type DamageReversalDraft,
  type DamageReversalProposed,
} from '@apparel-os/schemas';
import { CommandDefect, type TransactionContext } from '../../../../kernel/index.js';
import type { AccessInterface } from '../../../access/index.js';
import type { AuditInterface } from '../../../audit/index.js';
import type { ConfigurationInterface } from '../../../configuration/index.js';
import type { LedgerItem, StockLedgerInterface } from '../../ledger/index.js';
import { damageReversal, damageRound } from '../db/schema.js';
import { goodsOf, placeOfReport } from '../domain/goods.js';
import { damageHoldItem } from '../domain/items.js';
import { DAMAGE_SOURCE_TYPE, DOCUMENTS_MODULE, REVERSAL_SOURCE_TYPE } from '../domain/kinds.js';
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
  requestValueOf,
  reversalsOf,
  roundsOf,
  scopeColumns,
  valueChange,
  type Actor,
  type Outcome,
  type ReportRow,
} from './common.js';
import { valued } from './posting.js';

// The changes of a report after it is made (goods-in 8.3, 8.5; PRD-STK-017; S2-F08-T01): asking for its decision
// again, on the goods' cost now; and proposing a reversal of its confirmation, with a reason, for a different person to
// approve. Each locks the report at step 1 and names its version, the latest round (code-house-rules 8.2, 12.7), and
// asks the policy gate (goods-in 10.5). The value a request carries is read under the ledger's locks as its posting
// will read it, nothing written (stock-ledger 13.1, 13.10).

export interface ChangeDependencies {
  readonly audit: AuditInterface;
  readonly access: Pick<AccessInterface, 'requestApproval' | 'requestLockTargets'>;
  readonly configuration: Pick<ConfigurationInterface, 'checkAvailability'>;
  readonly ledger: StockLedgerInterface;
}

const stale = (reportId: string): Outcome<never> =>
  refused('conflict', 'kernel.stale-version', [recordItem(DAMAGE_REPORT_TYPE, reportId)]);

/** The cost of the report's goods now in the condition given, as a damage hold on them is valued (13.15). */
async function goodsValue(
  context: TransactionContext,
  dependencies: ChangeDependencies,
  actor: Actor,
  report: ReportRow,
  source: { readonly recordType: string; readonly recordId: string },
  condition: 'good' | 'damaged',
) {
  const item: LedgerItem = {
    ...damageHoldItem(uuidv7(), placeOfReport(report), goodsOf(report), report.description),
    condition,
  } as LedgerItem;
  const values = await valued(
    context,
    { ledger: dependencies.ledger },
    {
      source: { module: DOCUMENTS_MODULE, ...source, versionId: source.recordId, importKind: 'none' },
      actor,
      items: [item],
    },
  );
  if (values.kind === 'refusal') return values;
  const [value] = values.answer;
  if (value === undefined) throw new CommandDefect('A valued hold without its value');
  return { kind: 'success' as const, answer: requestValueOf(value) };
}

/**
 * Asks for the report's decision again (goods-in 8.5): while its latest round waits, when the goods' cost changed
 * since it was asked and the decision is refused for it (access-and-approvals 9.7; DEC-066). A new round on the same
 * damage hold, whose request supersedes the round's open one (9.6), on the goods' cost now; preparers as before.
 */
export async function renewDecision(
  context: TransactionContext,
  dependencies: ChangeDependencies,
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
  if (latest?.id !== draft.versionToken) return stale(reportId);
  if ((await decisionsOf(context, reportId)).some((each) => each.damageRoundId === latest.id)) {
    return refused('refused', 'stock.report-decided', [recordItem(DAMAGE_REPORT_TYPE, reportId)]);
  }
  const unavailable = await damageUnavailable(context, dependencies, report);
  if (unavailable !== undefined) return refusalOf(unavailable);
  const value = await goodsValue(
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

/**
 * Proposes a reversal of the report's confirmation, with a reason (goods-in 8.3; PRD-STK-017): only of the confirmation
 * the report stands on now, and one at a time. Its approval is requested from a different authorised person, on the
 * cost of the goods it returns to good condition now.
 */
export async function proposeReversal(
  context: TransactionContext,
  dependencies: ChangeDependencies,
  actor: Actor,
  reportId: string,
  draft: DamageReversalDraft,
): Promise<Outcome<DamageReversalProposed>> {
  const report = await lockReport(context, reportId);
  if (report === undefined) return refusalOf(reportNotFound(reportId));
  const latest = (await roundsOf(context, reportId)).at(-1);
  if (latest?.id !== draft.versionToken) return stale(reportId);
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
  const value = await goodsValue(
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
