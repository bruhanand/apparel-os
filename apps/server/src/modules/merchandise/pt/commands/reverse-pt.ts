import { paise, uuidv7 } from '@apparel-os/domain';
import { PT_REVERSAL_APPROVAL, PT_TYPE } from '@apparel-os/schemas';
import { CommandDefect, LOCK_STEP, type CommandRefusal, type TransactionContext } from '../../../../kernel/index.js';
import type { DocumentEffect, EffectDecider, EffectOutcome } from '../../../access/index.js';
import { coverageAndCostOfSource, ptRevisionGoods, type LedgerItem, type Place } from '../../../stock/ledger/index.js';
import { ptReversalDecision } from '../db/schema.js';
import { PT_MODULE, PT_REVERSAL_SOURCE_TYPE, PT_REVERSAL_TYPE, PT_STOCK_SOURCE_TYPE } from '../domain/kinds.js';
import { BUSINESS_DATE_NOT_SET, recordItem, reversalNotFound } from '../domain/refusals.js';
import { ptReversed } from '../events.js';
import { revisionStanding, type RevisionStanding } from '../queries/approval.js';
import { originsOfApproval, reversalOf, type ReversalRow } from '../queries/reversal.js';
import { ptGateRefusal } from './post-pt.js';
import { deciding, scopeColumnsOfAudit, type PtDecisionDependencies, type PtDecisionServices } from './pt-decision.js';
import { goodsRefusal, officialRefusal } from './reversal-checks.js';
import { ptLock } from './pt-lock.js';
import { scopeColumnsOf } from './scope-columns.js';

// A PT reversal's decision (goods-in 6.4, 6.7, 10.3; stock-ledger 7.5, 13.21; access-and-approvals 9.5, 9.7, 9.8b;
// DEC-137, PRD-REC-019, PRD-ACS-006, PRD-INT-004; S2-F09-T01): the effect `access`'s Decide runs in the decision's
// transaction, once it has refused the reversal's proposer (9.3) and checked the approver's limit on the cost it
// reverses. Decide locks, with the request at step 1, the PT's identity row and the GRN's row, which every scan locks
// too (goods-in 7.5), so a reversal never passes a scan, a submit or another decision of the PT. Under them:
//
// - **Approve** asks the policy gate, the PT's approval's operations (goods-in 10.5), and again that the revision is
//   the PT's newest Official one and no piece of the GRN is scanned in (DEC-137); then one ledger request in the order of
//   stock-ledger 13.1: each cost the approval established reversed, value only, at the value it added, with its journal
//   (`stock.cost-established-reversal`; 7.5), and each coverage it recorded removed (13.5). Under the ledger's locks,
//   before anything is written, no piece the PT covers may be held or damaged since (domain/reversed.ts), and the
//   decision is verified and used on the cost reversed then (9.7). Then the decision's record, the GRN's "PT attached"
//   mark cleared (`pt-reversed`; goods-in 5.8), the audit record and `merchandise.pt-reversed`. The PT and its
//   reversal stay as linked records; the products it confirmed and the identity its approval gave the pieces stay
//   (domain/reversed.ts), and the GRN waits for a corrected file (goods-in 6.4). Any refusal rolls all of it back.
// - **Reject** changes nothing but the decision's record and its audit record; it asks no gate (DEC-116).

const decided = (reversalId: string): CommandRefusal => ({
  kind: 'refused',
  code: 'merchandise.pt-reversal-decided',
  missing: [recordItem(PT_REVERSAL_TYPE, reversalId)],
});

const refusal = (refused: CommandRefusal): EffectOutcome => ({ kind: 'refusal', refusal: refused });

/** The approver may not see the ledger's rows of the PT's goods, which the reversal writes (stock-ledger 14.3). */
const goodsHidden: CommandRefusal = {
  kind: 'not-authorised',
  code: 'access.not-authorised',
  missing: [{ kind: 'permission', recordType: 'stock.receipt_origin', action: 'view' }],
};

/** The reversal still waiting, of the PT's newest Official revision, under the locks; else why not. */
async function openReversal(
  context: TransactionContext,
  reversalId: string,
): Promise<
  | {
      readonly reversal: ReversalRow;
      readonly ptId: string;
      readonly grnId: string;
      readonly standing: RevisionStanding;
    }
  | CommandRefusal
> {
  const found = await reversalOf(context, reversalId);
  if (found === undefined) return reversalNotFound(reversalId);
  if (found.decision !== undefined) return decided(reversalId);
  const standing = await revisionStanding(context, found.reversal.ptRevisionId);
  const official = await officialRefusal(context, standing, found.reversal.ptRevisionId);
  if (official !== undefined || standing === undefined) return decided(reversalId);
  return { reversal: found.reversal, ptId: found.ptId, grnId: found.grnId, standing };
}

/** The reversal's decision record (goods-in 6.7): approved with the decision's use, or rejected. */
async function recordDecision(
  context: TransactionContext,
  reversal: ReversalRow,
  decider: ReturnType<typeof deciding>,
  outcome: { readonly outcome: 'Approved'; readonly useId: string } | { readonly outcome: 'Rejected' },
): Promise<string | CommandRefusal> {
  const date = await context.businessDate();
  if (date.kind === 'not-set') return BUSINESS_DATE_NOT_SET;
  const id = uuidv7();
  await context.tx.insert(ptReversalDecision).values({
    id,
    ptReversalId: reversal.id,
    ...scopeColumnsOf(reversal),
    outcome: outcome.outcome,
    approvalDecisionId: decider.decisionId,
    approvalUseId: outcome.outcome === 'Approved' ? outcome.useId : null,
    decidedByUserId: decider.userId,
    roleAssignmentId: decider.roleAssignmentId,
    decidedAt: context.startedAt,
    businessDate: date.date,
  });
  return id;
}

/**
 * The ledger items of the reversal (stock-ledger 13.21): each cost established reversed at the place its pieces are,
 * then each coverage removed, as the approval's request recorded them. Each new origin of the approval is a line of
 * both its coverage and its cost (goods-in 6.6).
 */
async function reversalItems(
  context: TransactionContext,
  standing: RevisionStanding,
): Promise<LedgerItem[] | CommandRefusal> {
  const { revision, approval } = standing;
  if (approval === undefined) throw new CommandDefect('A PT reversal of a revision with no approval');
  const origins = new Map((await originsOfApproval(context, approval.id)).map((origin) => [origin.id, origin]));
  const where = new Map<string, Place>();
  for (const row of await ptRevisionGoods(context, [revision.id])) {
    if (row.locationId === null) continue;
    where.set(row.receiptOriginId, {
      siteId: revision.siteId,
      businessUnitId: revision.businessUnitId,
      locationId: row.locationId,
    });
  }
  const effects = await coverageAndCostOfSource(context, {
    module: PT_MODULE,
    recordType: PT_STOCK_SOURCE_TYPE,
    recordId: revision.id,
  });
  const items: LedgerItem[] = [];
  for (const cost of effects.costEstablished) {
    const origin = origins.get(cost.lineId);
    const at = origin === undefined ? undefined : where.get(origin.receiptOriginId);
    if (origin === undefined || at === undefined) return goodsHidden;
    items.push({
      kind: 'reversal',
      lineId: uuidv7(),
      movementId: cost.movementId,
      at,
      goods: { skuId: origin.skuId, quantity: origin.quantity, receiptOriginId: origin.receiptOriginId },
    });
  }
  for (const coverage of effects.coverage) {
    items.push({ kind: 'remove-coverage', lineId: uuidv7(), coverageId: coverage.coverageId });
  }
  // Every new origin of the approval had its coverage and its cost (goods-in 6.6): fewer is what the reader may not see.
  if (effects.costEstablished.length !== origins.size || effects.coverage.length !== origins.size) return goodsHidden;
  return items;
}

async function approve(
  dependencies: PtDecisionDependencies,
  context: TransactionContext,
  decider: EffectDecider,
  reversalId: string,
): Promise<EffectOutcome> {
  const services: PtDecisionServices = dependencies.services();
  const who = deciding(decider);
  const open = await openReversal(context, reversalId);
  if ('code' in open) return refusal(open);
  const { reversal, ptId, grnId, standing } = open;
  const { revision } = standing;
  const place = { siteId: revision.siteId, businessUnitId: revision.businessUnitId };
  // The policy gate, under the locks (goods-in 10.5; PRD-SEC-017): the PT's approval's operations.
  const gate = await ptGateRefusal(context, services.configuration, place);
  if (gate !== undefined) return refusal(gate);
  const before = await goodsRefusal(context, services.receiving, grnId, revision.id);
  if (before !== undefined) return refusal(before);
  const items = await reversalItems(context, standing);
  if (!Array.isArray(items)) return refusal(items);
  // The ledger request (stock-ledger 13.1 "The caller's sequence"): Plan; Lock, steps 2 to 6; the periods at step 7
  // and the journal series at step 8; then, every lock held, the goods checked again; Recheck and value.
  const useId = uuidv7();
  const planned = await services.ledger.plan(context, {
    source: {
      module: PT_MODULE,
      recordType: PT_REVERSAL_SOURCE_TYPE,
      recordId: reversal.id,
      versionId: reversal.id,
      importKind: 'none',
    },
    actor: { kind: 'user', userId: who.userId, roleAssignmentId: who.roleAssignmentId },
    approval: { decisionId: who.decisionId, useId },
    items,
  });
  if (planned.kind === 'refused') return refusal(planned.refusal);
  const locked = await services.ledger.lock(context, planned.value);
  const periods = await services.ledger.holdPeriods(context, planned.value);
  if (periods.kind === 'refused') return refusal(periods.refusal);
  if (periods.value.length > 0) await context.lock(LOCK_STEP.numberSeries, periods.value);
  // A scan holds the GRN's lock, and a hold or a condition change the balances the ledger locked: neither passes now.
  const goods = await goodsRefusal(context, services.receiving, grnId, revision.id);
  if (goods !== undefined) return refusal(goods);
  const recheck = await services.ledger.recheck(context, locked);
  if (recheck.kind === 'refused') return refusal(recheck.refusal);
  // The approval is on the cost it reverses (domain-model 5; PRD-ACS-015): the value each reversal takes off, under
  // the locks now; Unknown when any is (PRD-ACS-016).
  let cost = 0;
  let unknown = false;
  for (const [index, value] of recheck.value.itemValues.entries()) {
    if (items[index]?.kind !== 'reversal') continue;
    if (value.kind === 'known') cost += value.amountPaise;
    else unknown = true;
  }
  const check = {
    decisionId: who.decisionId,
    actionType: PT_REVERSAL_APPROVAL,
    document: { module: PT_MODULE, recordType: PT_TYPE, recordId: ptId, versionId: reversal.id },
    preparers: [reversal.proposedByUserId],
    value: unknown ? { kind: 'unknown' as const } : { kind: 'known' as const, amountPaise: paise(cost) },
  };
  const verified = await services.access.verifyUnderLock(context, check);
  if (verified !== undefined) return refusal(verified);
  const used = await services.access.recordUse(context, { ...check, useId, actor: { kind: 'user', id: who.userId } });
  if (used !== undefined) return refusal(used);
  const written = await services.ledger.write(context, recheck.value, { kind: 'screen' });
  if (written.kind === 'refused') return refusal(written.refusal);
  const decisionId = await recordDecision(context, reversal, who, { outcome: 'Approved', useId });
  if (typeof decisionId !== 'string') return refusal(decisionId);
  // The GRN waits for a corrected file (goods-in 5.8, 6.4).
  const cleared = await services.receiving.clearPtMark(
    context,
    { userId: who.userId, roleAssignmentId: who.roleAssignmentId },
    { grnId, ptRevisionId: revision.id, reason: 'pt-reversed', source: { kind: 'screen' } },
  );
  if (cleared.kind === 'refusal') return cleared;
  await services.audit.record(context, {
    actor: { kind: 'user', id: who.userId },
    roleAssignmentId: who.roleAssignmentId,
    approval: { decisionId: who.decisionId },
    ...(decider.reason === undefined ? {} : { reason: decider.reason }),
    scope: scopeColumnsOfAudit(reversal),
    record: { module: PT_MODULE, type: PT_TYPE, id: ptId, versionId: revision.id },
    operation: 'reverse-pt',
    changes: [
      { kind: 'value', field: 'state', before: 'Official', after: 'Reversed' },
      { kind: 'value', field: 'reversalId', before: null, after: reversal.id },
      { kind: 'value', field: 'movements', before: null, after: [...written.value.movementIds] },
      { kind: 'value', field: 'grn', before: null, after: grnId },
    ],
    source: { kind: 'screen' },
  });
  await context.publish(ptReversed, {
    subject: { module: PT_MODULE, recordType: PT_TYPE, recordId: ptId, versionId: revision.id },
    scope: scopeColumnsOfAudit(reversal),
    payload: { ptId, revisionId: revision.id, reversalId: reversal.id },
  });
  return { kind: 'success', answer: { reversalId: reversal.id, decisionId } };
}

async function reject(
  context: TransactionContext,
  dependencies: PtDecisionDependencies,
  decider: EffectDecider,
  reversalId: string,
): Promise<EffectOutcome> {
  const services = dependencies.services();
  const who = deciding(decider);
  const found = await reversalOf(context, reversalId);
  if (found === undefined) return refusal(reversalNotFound(reversalId));
  if (found.decision !== undefined) return refusal(decided(reversalId));
  const decisionId = await recordDecision(context, found.reversal, who, { outcome: 'Rejected' });
  if (typeof decisionId !== 'string') return refusal(decisionId);
  await services.audit.record(context, {
    actor: { kind: 'user', id: who.userId },
    roleAssignmentId: who.roleAssignmentId,
    approval: { decisionId: who.decisionId },
    ...(decider.reason === undefined ? {} : { reason: decider.reason }),
    scope: scopeColumnsOfAudit(found.reversal),
    record: { module: PT_MODULE, type: PT_TYPE, id: found.ptId, versionId: found.reversal.ptRevisionId },
    operation: 'reject-pt-reversal',
    changes: [{ kind: 'value', field: 'reversalId', before: null, after: found.reversal.id }],
    source: { kind: 'screen' },
  });
  return { kind: 'success', answer: { reversalId: found.reversal.id, decisionId } };
}

/** The effect of a PT reversal's decision, which the composition root hands `access` (ptApprovals; 9.8b). */
export function ptReversalEffect(dependencies: PtDecisionDependencies): DocumentEffect {
  return {
    decisionWritten: 'before-effect',
    async targets(context, reversalId) {
      const found = await reversalOf(context, reversalId);
      if (found === undefined) return [];
      return [ptLock(found.ptId), dependencies.services().receiving.ptMarkLock(found.grnId)];
    },
    async precheck(context, reversalId) {
      const open = await openReversal(context, reversalId);
      return 'code' in open ? open : undefined;
    },
    approve: (context, decider, reversalId) => approve(dependencies, context, decider, reversalId),
    reject: (context, decider, reversalId) => reject(context, dependencies, decider, reversalId),
  };
}
