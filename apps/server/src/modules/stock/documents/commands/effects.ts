import { uuidv7 } from '@apparel-os/domain';
import {
  DAMAGE_DECISION,
  DAMAGE_REPORT_TYPE,
  DAMAGE_REVERSAL_APPROVAL,
  DAMAGE_REVERSAL_TYPE,
} from '@apparel-os/schemas';
import { eq } from 'drizzle-orm';
import { CommandDefect, type LockTarget, type TransactionContext } from '../../../../kernel/index.js';
import type {
  AccessInterface,
  DocumentEffect,
  EffectDecider,
  EffectOutcome,
  ModuleApprovals,
} from '../../../access/index.js';
import type { AuditInterface } from '../../../audit/index.js';
import type { ConfigurationInterface } from '../../../configuration/index.js';
import type { StockLedgerInterface } from '../../ledger/index.js';
import { damageDecision, damageReversal, damageReversalDecision, damageRound } from '../db/schema.js';
import {
  DAMAGE_SOURCE_TYPE,
  DOCUMENTS_MODULE,
  REVERSAL_SOURCE_TYPE,
  stockDocumentsApprovalRules,
} from '../domain/kinds.js';
import { confirmationItems, rejectionItems, reversalItems } from '../domain/items.js';
import { goodsOf, placeOfReport } from '../domain/goods.js';
import { damageConfirmed, damageRejected, damageReversed } from '../events.js';
import { damageUnavailable } from '../queries/availability.js';
import {
  audited,
  decisionsOf,
  factsOf,
  ledgerSource,
  recordItem,
  refused,
  reportLock,
  reportRow,
  requestValueOf,
  roundsOf,
  scopeColumns,
  valueChange,
  type Actor,
  type ReportRow,
  type RoundRow,
} from './common.js';
import { post, valueOfLine } from './posting.js';

// What a decision does to a damage report or to a reversal of its confirmation (goods-in 8.3, 10.3; access-and-approvals
// 9.8b; stock-ledger 13.15; PRD-DMG-002, PRD-DMG-003, PRD-DMG-006, PRD-STK-017; S2-F08-T01), in the decision's
// transaction under the report's lock, which Decide takes with the request at step 1:
//
// - A report's decision, approved: the damage is confirmed. The report's damage hold ends by its own event, the goods
//   take the damaged condition where they are and are quarantined, posted through the ledger, which verifies and uses
//   the decision under its locks, on the goods' cost then (access-and-approvals 9.7). Rejected: only that damage hold
//   ends; every other hold and reservation stays.
// - A reversal's approval: the quarantine ends by the approved decision, the condition change is reversed by a linked
//   movement and the damage hold is placed again, so the goods have their earlier condition and holds; the report waits
//   for a decision again, in a round of its own. Rejected: nothing changes.
//
// Neither is decided by its preparer, the reporter or the reversal's proposer: `access` refuses every preparer (9.3;
// PRD-ACS-006). Each asks the policy gate first, for either outcome (goods-in 10.5).

/** What the decision effects use, bound late, since `access` is built with them (access-and-approvals 9.8b). */
export interface EffectServices {
  readonly access: Pick<AccessInterface, 'verifyUnderLock' | 'recordUse' | 'requestApproval'>;
  readonly ledger: StockLedgerInterface;
  readonly configuration: Pick<ConfigurationInterface, 'checkAvailability'>;
}

export interface EffectDependencies {
  readonly audit: AuditInterface;
  readonly services: () => EffectServices;
}

/** Who decides: the person and the assignment relied on, with the decision, which every effect has (9.5). */
function deciding(decider: EffectDecider): { readonly actor: Actor; readonly decisionId: string } {
  if (decider.roleAssignmentId === undefined || decider.approvalDecisionId === undefined) {
    throw new CommandDefect('A damage decision ran without its decision or the assignment relied on');
  }
  return {
    actor: { userId: decider.actor.id, roleAssignmentId: decider.roleAssignmentId },
    decisionId: decider.approvalDecisionId,
  };
}

async function roundRow(context: TransactionContext, roundId: string) {
  const [row] = await context.tx.select().from(damageRound).where(eq(damageRound.id, roundId));
  return row;
}

async function reversalRow(context: TransactionContext, reversalId: string) {
  const [row] = await context.tx.select().from(damageReversal).where(eq(damageReversal.id, reversalId));
  return row;
}

/**
 * The round a decision binds to, under the report's lock: it is the report's latest round and is not decided yet
 * (goods-in 8.5); otherwise `stock.report-decided`.
 */
async function openRound(
  context: TransactionContext,
  roundId: string,
): Promise<{ readonly report: ReportRow; readonly round: RoundRow } | EffectOutcome> {
  const round = await roundRow(context, roundId);
  const report = round === undefined ? undefined : await reportRow(context, round.damageReportId);
  if (round === undefined || report === undefined) {
    return refused('not-found', 'stock.record-not-found', [recordItem(DAMAGE_REPORT_TYPE, roundId)]);
  }
  const latest = (await roundsOf(context, report.id)).at(-1);
  const decided = (await decisionsOf(context, report.id)).some((each) => each.damageRoundId === roundId);
  if (latest?.id !== roundId || decided) {
    return refused('refused', 'stock.report-decided', [recordItem(DAMAGE_REPORT_TYPE, report.id)]);
  }
  return { report, round };
}

/** A line identifier for each item, a UUIDv7 (stock-ledger 13.3). */
const lines = () => uuidv7();

/**
 * Records a round's decision (goods-in 8.3): confirmed, with the condition change and the quarantine it posted, or
 * rejected, with neither; by the decider, under the decision, scoped as the report is. Answers its identifier.
 */
async function recordReportDecision(
  context: TransactionContext,
  report: ReportRow,
  round: RoundRow,
  decided: { readonly actor: Actor; readonly decisionId: string },
  outcome:
    | { readonly outcome: 'Confirmed'; readonly movementId: string; readonly quarantineHoldId: string }
    | { readonly outcome: 'Rejected' },
): Promise<string> {
  const id = uuidv7();
  await context.tx.insert(damageDecision).values({
    id,
    damageReportId: report.id,
    damageRoundId: round.id,
    outcome: outcome.outcome,
    approvalDecisionId: decided.decisionId,
    decidedByUserId: decided.actor.userId,
    roleAssignmentId: decided.actor.roleAssignmentId,
    decidedAt: context.startedAt,
    movementId: outcome.outcome === 'Confirmed' ? outcome.movementId : null,
    quarantineHoldId: outcome.outcome === 'Confirmed' ? outcome.quarantineHoldId : null,
    ...scopeColumns(report),
  });
  return id;
}

/**
 * Records a reversal's decision (goods-in 8.3): approved, with the reversal movement and the damage hold placed again,
 * or rejected, with neither; by the decider, under the decision, scoped as the report is.
 */
async function recordReversalDecision(
  context: TransactionContext,
  report: ReportRow,
  reversalId: string,
  decided: { readonly actor: Actor; readonly decisionId: string },
  outcome:
    | { readonly outcome: 'Approved'; readonly movementId: string; readonly restoredHoldId: string }
    | { readonly outcome: 'Rejected' },
): Promise<void> {
  await context.tx.insert(damageReversalDecision).values({
    id: uuidv7(),
    damageReversalId: reversalId,
    outcome: outcome.outcome,
    approvalDecisionId: decided.decisionId,
    decidedByUserId: decided.actor.userId,
    roleAssignmentId: decided.actor.roleAssignmentId,
    decidedAt: context.startedAt,
    movementId: outcome.outcome === 'Approved' ? outcome.movementId : null,
    restoredHoldId: outcome.outcome === 'Approved' ? outcome.restoredHoldId : null,
    ...scopeColumns(report),
  });
}

/** A report's decision: confirm or reject its latest round (goods-in 8.3). */
function decisionEffect(dependencies: EffectDependencies): DocumentEffect {
  return {
    decisionWritten: 'before-effect',
    async targets(context, roundId): Promise<LockTarget[]> {
      const round = await roundRow(context, roundId);
      return round === undefined ? [] : [reportLock(round.damageReportId)];
    },
    async precheck(context, roundId) {
      const open = await openRound(context, roundId);
      if ('kind' in open) return open.kind === 'refusal' ? open.refusal : undefined;
      return damageUnavailable(context, dependencies.services(), open.report);
    },
    async approve(context, decider, roundId) {
      const open = await openRound(context, roundId);
      if ('kind' in open) return open;
      const { report, round } = open;
      const decided = deciding(decider);
      const { actor, decisionId } = decided;
      const services = dependencies.services();
      const { items, valuedLineId } = confirmationItems(lines, placeOfReport(report), goodsOf(report), round.holdId);
      const posted = await post(context, services, {
        source: ledgerSource(DAMAGE_SOURCE_TYPE, report.id, round.id),
        actor,
        items,
        approval: {
          decisionId,
          actionType: DAMAGE_DECISION,
          document: {
            module: DOCUMENTS_MODULE,
            recordType: DAMAGE_REPORT_TYPE,
            recordId: report.id,
            versionId: round.id,
          },
          preparers: [report.reportedByUserId],
          valuedLineId,
        },
      });
      if (posted.kind === 'refusal') return posted;
      const [movementId] = posted.answer.written.movementIds;
      const [quarantineHoldId] = posted.answer.written.holdIds;
      if (movementId === undefined || quarantineHoldId === undefined) {
        throw new CommandDefect('A confirmation posted no condition change or quarantine');
      }
      const damageDecisionId = await recordReportDecision(context, report, round, decided, {
        outcome: 'Confirmed',
        movementId,
        quarantineHoldId,
      });
      await audited(context, dependencies.audit, actor, report, {
        record: { type: DAMAGE_REPORT_TYPE, id: report.id, versionId: round.id },
        operation: 'confirm-damage',
        changes: [
          valueChange('decision', null, 'Confirmed'),
          valueChange('movementId', null, movementId),
          valueChange('quarantineHoldId', null, quarantineHoldId),
        ],
        approval: { decisionId },
        ...(decider.reason === undefined ? {} : { reason: decider.reason }),
      });
      await context.publish(damageConfirmed, {
        subject: { module: DOCUMENTS_MODULE, recordType: DAMAGE_REPORT_TYPE, recordId: report.id, versionId: round.id },
        scope: factsOf(report),
        payload: { damageReportId: report.id, damageDecisionId },
      });
      return { kind: 'success', answer: { damageReportId: report.id, damageDecisionId } };
    },
    async reject(context, decider, roundId) {
      const open = await openRound(context, roundId);
      if ('kind' in open) return open;
      const { report, round } = open;
      const decided = deciding(decider);
      const { actor, decisionId } = decided;
      // Only this report's damage hold ends; every other hold and reservation stays (PRD-DMG-003).
      const posted = await post(context, dependencies.services(), {
        source: ledgerSource(DAMAGE_SOURCE_TYPE, report.id, round.id),
        actor,
        items: rejectionItems(lines(), round.holdId),
      });
      if (posted.kind === 'refusal') return posted;
      const damageDecisionId = await recordReportDecision(context, report, round, decided, { outcome: 'Rejected' });
      await audited(context, dependencies.audit, actor, report, {
        record: { type: DAMAGE_REPORT_TYPE, id: report.id, versionId: round.id },
        operation: 'reject-damage-report',
        changes: [valueChange('decision', null, 'Rejected'), valueChange('releasedHoldId', null, round.holdId)],
        approval: { decisionId },
        ...(decider.reason === undefined ? {} : { reason: decider.reason }),
      });
      await context.publish(damageRejected, {
        subject: { module: DOCUMENTS_MODULE, recordType: DAMAGE_REPORT_TYPE, recordId: report.id, versionId: round.id },
        scope: factsOf(report),
        payload: { damageReportId: report.id, damageDecisionId },
      });
      return { kind: 'success', answer: { damageReportId: report.id, damageDecisionId } };
    },
  };
}

/**
 * A reversal waiting for its decision, under the report's lock: undecided, and the confirmation it reverses still the
 * decision of the report's latest round (goods-in 8.3, 8.5).
 */
async function openReversal(context: TransactionContext, reversalId: string) {
  const reversal = await reversalRow(context, reversalId);
  const report = reversal === undefined ? undefined : await reportRow(context, reversal.damageReportId);
  if (reversal === undefined || report === undefined) {
    return refused('not-found', 'stock.record-not-found', [recordItem(DAMAGE_REVERSAL_TYPE, reversalId)]);
  }
  const [decided] = await context.tx
    .select({ id: damageReversalDecision.id })
    .from(damageReversalDecision)
    .where(eq(damageReversalDecision.damageReversalId, reversalId));
  const rounds = await roundsOf(context, report.id);
  const latest = rounds.at(-1);
  const confirmation = (await decisionsOf(context, report.id)).find((each) => each.id === reversal.damageDecisionId);
  if (
    decided !== undefined ||
    confirmation?.outcome !== 'Confirmed' ||
    confirmation.damageRoundId !== latest?.id ||
    confirmation.movementId === null ||
    confirmation.quarantineHoldId === null
  ) {
    return refused('refused', 'stock.report-not-confirmed', [recordItem(DAMAGE_REPORT_TYPE, report.id)]);
  }
  return {
    report,
    reversal,
    rounds,
    confirmation: { movementId: confirmation.movementId, quarantineHoldId: confirmation.quarantineHoldId },
  };
}

/** A reversal's approval (goods-in 8.3; PRD-STK-017). */
function reversalEffect(dependencies: EffectDependencies): DocumentEffect {
  return {
    decisionWritten: 'before-effect',
    async targets(context, reversalId): Promise<LockTarget[]> {
      const reversal = await reversalRow(context, reversalId);
      return reversal === undefined ? [] : [reportLock(reversal.damageReportId)];
    },
    async precheck(context, reversalId) {
      const open = await openReversal(context, reversalId);
      if ('kind' in open) return open.kind === 'refusal' ? open.refusal : undefined;
      return damageUnavailable(context, dependencies.services(), open.report);
    },
    async approve(context, decider, reversalId) {
      const open = await openReversal(context, reversalId);
      if ('kind' in open) return open;
      const { report, reversal, rounds, confirmation } = open;
      const decided = deciding(decider);
      const { actor, decisionId } = decided;
      const services = dependencies.services();
      const goods = goodsOf(report);
      const { items, valuedLineId, restoredHoldLineId } = reversalItems(
        lines,
        placeOfReport(report),
        goods,
        confirmation,
        report.description,
      );
      const posted = await post(context, services, {
        source: ledgerSource(REVERSAL_SOURCE_TYPE, reversal.id, reversal.id),
        actor,
        items,
        approval: {
          decisionId,
          actionType: DAMAGE_REVERSAL_APPROVAL,
          document: {
            module: DOCUMENTS_MODULE,
            recordType: DAMAGE_REVERSAL_TYPE,
            recordId: reversal.id,
            versionId: reversal.id,
          },
          preparers: [reversal.proposedByUserId],
          valuedLineId,
        },
      });
      if (posted.kind === 'refusal') return posted;
      const [movementId] = posted.answer.written.movementIds;
      const [restoredHoldId] = posted.answer.written.holdIds;
      if (movementId === undefined || restoredHoldId === undefined) {
        throw new CommandDefect('A reversal posted no movement or restored hold');
      }
      // The restored round's request is on the damage hold placed again, valued as the posting valued it.
      const restoredValue = valueOfLine(posted.answer.values, restoredHoldLineId);
      await recordReversalDecision(context, report, reversal.id, decided, {
        outcome: 'Approved',
        movementId,
        restoredHoldId,
      });
      // The report waits for its decision again, in a round of its own on the restored hold, decided by none who
      // reported it (goods-in 8.5; PRD-DMG-002).
      const roundId = uuidv7();
      await context.tx.insert(damageRound).values({
        id: roundId,
        damageReportId: report.id,
        roundNumber: rounds.length + 1,
        kind: 'restored',
        holdId: restoredHoldId,
        damageReversalId: reversal.id,
        ...scopeColumns(report),
        requestedByUserId: actor.userId,
      });
      await services.access.requestApproval(context, {
        actionType: DAMAGE_DECISION,
        document: { module: DOCUMENTS_MODULE, recordType: DAMAGE_REPORT_TYPE, recordId: report.id, versionId: roundId },
        value: requestValueOf(restoredValue),
        preparers: [report.reportedByUserId],
        requestedBy: actor,
        facts: factsOf(report),
      });
      await audited(context, dependencies.audit, actor, report, {
        record: { type: DAMAGE_REVERSAL_TYPE, id: reversal.id, versionId: reversal.id },
        operation: 'reverse-damage-confirmation',
        changes: [
          valueChange('decision', null, 'Approved'),
          valueChange('movementId', null, movementId),
          valueChange('restoredHoldId', null, restoredHoldId),
          valueChange('roundId', null, roundId),
        ],
        approval: { decisionId },
        ...(decider.reason === undefined ? {} : { reason: decider.reason }),
      });
      await context.publish(damageReversed, {
        subject: { module: DOCUMENTS_MODULE, recordType: DAMAGE_REVERSAL_TYPE, recordId: reversal.id },
        scope: factsOf(report),
        payload: { damageReportId: report.id, damageReversalId: reversal.id },
      });
      return { kind: 'success', answer: { damageReportId: report.id, damageReversalId: reversal.id } };
    },
    async reject(context, decider, reversalId) {
      const reversal = await reversalRow(context, reversalId);
      const report = reversal === undefined ? undefined : await reportRow(context, reversal.damageReportId);
      if (reversal === undefined || report === undefined) {
        return refused('not-found', 'stock.record-not-found', [recordItem(DAMAGE_REVERSAL_TYPE, reversalId)]);
      }
      const decided = deciding(decider);
      const { actor, decisionId } = decided;
      await recordReversalDecision(context, report, reversal.id, decided, { outcome: 'Rejected' });
      await audited(context, dependencies.audit, actor, report, {
        record: { type: DAMAGE_REVERSAL_TYPE, id: reversal.id, versionId: reversal.id },
        operation: 'reject-damage-reversal',
        changes: [valueChange('decision', null, 'Rejected')],
        approval: { decisionId },
        ...(decider.reason === undefined ? {} : { reason: decider.reason }),
      });
      return { kind: 'success', answer: { damageReportId: report.id, damageReversalId: reversal.id } };
    },
  };
}

/**
 * The approval rules and decision effects `stock` · documents declares to `access` (access-and-approvals 8, 9.8b;
 * module-map section 3, rule 6), which the composition root hands to `access` at start.
 */
export function stockDocumentsApprovals(dependencies: EffectDependencies): ModuleApprovals {
  return {
    rules: stockDocumentsApprovalRules,
    effects: new Map<string, DocumentEffect>([
      [DAMAGE_DECISION, decisionEffect(dependencies)],
      [DAMAGE_REVERSAL_APPROVAL, reversalEffect(dependencies)],
    ]),
  };
}
