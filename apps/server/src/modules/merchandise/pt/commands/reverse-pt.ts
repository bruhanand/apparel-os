import { uuidv7 } from '@apparel-os/domain';
import { PT_REVERSAL_APPROVAL, PT_TYPE, STOCK_COVERAGE_TYPE, STOCK_MOVEMENT_TYPE } from '@apparel-os/schemas';
import { CommandDefect, LOCK_STEP, type CommandRefusal, type TransactionContext } from '../../../../kernel/index.js';
import type { DocumentEffect, EffectDecider, EffectOutcome } from '../../../access/index.js';
import {
  coverageAndCostOfSource,
  PT_GOODS_READS,
  ptRevisionGoods,
  type CheckedRequest,
  type LedgerItem,
  type Place,
} from '../../../stock/ledger/index.js';
import { ptReversalDecision } from '../db/schema.js';
import {
  POSTING_REFUSED,
  PT_MODULE,
  PT_REVERSAL_SOURCE_TYPE,
  PT_REVERSAL_TYPE,
  PT_STOCK_SOURCE_TYPE,
} from '../domain/kinds.js';
import {
  BUSINESS_DATE_NOT_SET,
  recordItem,
  refusalOutcome,
  reversalNotFound,
  type Outcome,
} from '../domain/refusals.js';
import { costReversed } from '../domain/reversed.js';
import { ptReversed } from '../events.js';
import { revisionStanding, type RevisionStanding } from '../queries/approval.js';
import { originsOfApproval, reversalOf, type ReversalRow } from '../queries/reversal.js';
import { ptGateRefusal } from './post-pt.js';
import { deciding, type PtDecisionDependencies, type PtDecisionServices } from './pt-decision.js';
import { ptLock } from './pt-lock.js';
import { raisePostingRefused } from './raise-posting-refused.js';
import { goodsRefusal, officialRefusal } from './reversal-checks.js';
import { auditScopeOf, scopeColumnsOf } from './scope-columns.js';

// A PT reversal's decision (goods-in 6.4, 6.7, 10.3; stock-ledger 7.5, 13.21; access-and-approvals 9.5, 9.7, 9.8b;
// books-and-posting 10; DEC-137, PRD-REC-019, PRD-ACS-006, PRD-INT-004; S2-F09-T01): the effect `access`'s Decide runs
// in the decision's transaction, the decision written first under a savepoint, once it has refused the reversal's
// proposer (9.3) and checked the approver's limit on the cost it reverses. Decide locks, with the request at step 1,
// the PT's identity row and the GRN's row, which every scan locks too (goods-in 7.5), so a reversal never passes a
// scan, a submit or another decision of the PT. It undoes the approval through the steps the approval posts by
// (post-pt.ts), each a function below:
//
// - **Under the locks** (recheckUnderLocks): the reversal still waiting, of the PT's newest Official revision; the
//   policy gate, the PT's approval's operations (goods-in 10.5); no piece of the GRN scanned in (DEC-137) and none the
//   PT covers held, damaged or accepted since its approval (domain/reversed.ts).
// - **Steps 4 and 5 undone, planned** (reversalItems): each cost the approval established reversed, value only, at
//   the value it added (stock-ledger 7.5, 13.21), then each coverage it recorded removed (13.5), from the approval's
//   own ledger lines.
// - **The ledger request** (lockAndValue): Plan, the locks of steps 2 to 7, the journal series at step 8, the goods
//   checked again under those locks, Recheck and value.
// - **Step 1** (verifyAndUse): `access` verifies and uses the decision under those locks on the cost reversed then
//   (9.7).
// - **Steps 4 to 6 undone, written**, which `finance` · books posts as `stock.cost-established-reversal` for owned goods
//   and records only for goods the brand or supplier still owns (7.2).
// - **Step 7** (recordReversal): the decision's record, the GRN's "PT attached" mark cleared (`pt-reversed`; goods-in
//   5.8), the audit record and `merchandise.pt-reversed`.
//
// The PT and its reversal stay as linked records; the products it confirmed and the identity its approval gave the
// pieces stay (domain/reversed.ts), and the GRN waits for a corrected file (goods-in 6.4). Any refusal rolls all of it
// back, the decision with it; one of the ledger's posting raises the unfinished operation in a command of its own
// (refused, below; books-and-posting 10 step 3), and the reversal waits for its approval again. A reversal posts with
// its decision whatever the PT's size: it carries two ledger items for each new receipt origin of the approval and no
// product, barcode or number work (**Design choice**, RR-616). **Reject** changes nothing but the decision's record and
// its audit record; it asks no gate (DEC-116).

const decided = (reversalId: string): CommandRefusal => ({
  kind: 'refused',
  code: 'merchandise.pt-reversal-decided',
  missing: [recordItem(PT_REVERSAL_TYPE, reversalId)],
});

/**
 * The stock record types a reversal reads and writes (stock-ledger 13.21, 14.3): the goods the PT covers, the coverage
 * its approval recorded and the movements that established their cost. The approver's grants of view on each must cover
 * the PT's facts, so row-level security shows them every row the reversal undoes.
 */
const REVERSAL_STOCK = [...PT_GOODS_READS, STOCK_COVERAGE_TYPE, STOCK_MOVEMENT_TYPE] as const;

/**
 * Whether the approver may see the ledger's rows of the PT's goods, which the reversal reads and writes, asked of
 * `access` with the PT's facts before they are read (access-and-approvals 7.1 step 3; stock-ledger 14.3): their refusal,
 * or none. Then a row the reversal does not find is a defect, never what the approver may not see.
 */
async function stockRefusal(
  context: TransactionContext,
  services: PtDecisionServices,
  userId: string,
  revision: RevisionStanding['revision'],
): Promise<CommandRefusal | undefined> {
  const facts = auditScopeOf(revision);
  for (const recordType of REVERSAL_STOCK) {
    const checked = await services.access.authorise(context, { actorId: userId, action: 'view', recordType, facts });
    if (checked.kind === 'refused') return checked.refusal;
  }
  return undefined;
}

type Decided = ReturnType<typeof deciding>;

/** The reversal still waiting, with the PT and GRN it is of and the revision it reverses as it stands. */
interface OpenReversal {
  readonly reversal: ReversalRow;
  readonly ptId: string;
  readonly grnId: string;
  readonly standing: RevisionStanding;
}

/** The reversal still waiting, of the PT's newest Official revision, under the locks; else why not. */
async function openReversal(context: TransactionContext, reversalId: string): Promise<Outcome<OpenReversal>> {
  const found = await reversalOf(context, reversalId);
  if (found === undefined) return refusalOutcome(reversalNotFound(reversalId));
  if (found.decision !== undefined) return refusalOutcome(decided(reversalId));
  const standing = await revisionStanding(context, found.reversal.ptRevisionId);
  const official = await officialRefusal(context, standing, found.reversal.ptRevisionId);
  if (official !== undefined || standing === undefined) return refusalOutcome(decided(reversalId));
  return { kind: 'success', answer: { reversal: found.reversal, ptId: found.ptId, grnId: found.grnId, standing } };
}

/**
 * Under the locks (goods-in 6.4, 6.7, 10.5): the reversal still waiting, of the PT's newest Official revision; the
 * policy gate; no piece of the GRN scanned in and none the PT covers held, damaged or accepted since its approval.
 */
async function recheckUnderLocks(
  context: TransactionContext,
  services: PtDecisionServices,
  reversalId: string,
): Promise<Outcome<OpenReversal>> {
  const open = await openReversal(context, reversalId);
  if (open.kind === 'refusal') return open;
  const { revision } = open.answer.standing;
  const gate = await ptGateRefusal(context, services.configuration, {
    siteId: revision.siteId,
    businessUnitId: revision.businessUnitId,
  });
  if (gate !== undefined) return refusalOutcome(gate);
  const goods = await goodsRefusal(context, services.receiving, open.answer.grnId, revision.id);
  if (goods !== undefined) return refusalOutcome(goods);
  return open;
}

/**
 * Steps 4 and 5 undone, planned (stock-ledger 13.21): each cost established reversed at the place its pieces are, then
 * each coverage removed, as the approval's request recorded them. Each new origin of the approval is a line of both its
 * coverage and its cost (goods-in 6.6).
 */
async function reversalItems(context: TransactionContext, standing: RevisionStanding): Promise<Outcome<LedgerItem[]>> {
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
  // Every new origin of the approval had its coverage and its cost (goods-in 6.6), and the approver may see each
  // (stockRefusal), its pieces all waiting where the approval left them (recheckUnderLocks): anything else is a defect.
  if (effects.costEstablished.length !== origins.size || effects.coverage.length !== origins.size) {
    throw new CommandDefect(`A PT's approval does not hold one coverage and one cost per new origin: ${revision.id}`);
  }
  const items: LedgerItem[] = [];
  for (const cost of effects.costEstablished) {
    const origin = origins.get(cost.lineId);
    const at = origin === undefined ? undefined : where.get(origin.receiptOriginId);
    if (origin === undefined || at === undefined) {
      throw new CommandDefect(`A PT's cost established names no new origin in custody: ${cost.movementId}`);
    }
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
  return { kind: 'success', answer: items };
}

/**
 * The ledger request (stock-ledger 13.1 "The caller's command"): Plan; Lock, steps 2 to 6; the periods at step 7; the
 * journal series at step 8; then, every lock held, the goods checked again, since a scan holds the GRN's row and a hold
 * or a condition change the balances the ledger locked, so neither passes now; Recheck and value. Writes nothing.
 */
async function lockAndValue(
  context: TransactionContext,
  services: PtDecisionServices,
  open: OpenReversal,
  who: Decided,
  items: readonly LedgerItem[],
  useId: string,
): Promise<Outcome<CheckedRequest>> {
  const { reversal, grnId, standing } = open;
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
    items: [...items],
  });
  if (planned.kind === 'refused') return refusalOutcome(planned.refusal);
  const locked = await services.ledger.lock(context, planned.value);
  const periods = await services.ledger.holdPeriods(context, planned.value);
  if (periods.kind === 'refused') return refusalOutcome(periods.refusal);
  if (periods.value.length > 0) await context.lock(LOCK_STEP.numberSeries, periods.value);
  const goods = await goodsRefusal(context, services.receiving, grnId, standing.revision.id);
  if (goods !== undefined) return refusalOutcome(goods);
  const recheck = await services.ledger.recheck(context, locked);
  if (recheck.kind === 'refused') return refusalOutcome(recheck.refusal);
  return { kind: 'success', answer: recheck.value };
}

/**
 * Step 1 (access-and-approvals 9.7; domain-model 5; PRD-ACS-015): `access` verifies the decision under the ledger's
 * locks on the cost reversed now, the value each reversal takes off, Unknown when any is (PRD-ACS-016), and records its
 * use. Answers the refusal, or undefined.
 */
async function verifyAndUse(
  context: TransactionContext,
  services: PtDecisionServices,
  open: OpenReversal,
  who: Decided,
  items: readonly LedgerItem[],
  valued: CheckedRequest,
  useId: string,
): Promise<CommandRefusal | undefined> {
  const check = {
    decisionId: who.decisionId,
    actionType: PT_REVERSAL_APPROVAL,
    document: { module: PT_MODULE, recordType: PT_TYPE, recordId: open.ptId, versionId: open.reversal.id },
    preparers: [open.reversal.proposedByUserId],
    value: costReversed(items, valued.itemValues),
  };
  const verified = await services.access.verifyUnderLock(context, check);
  if (verified !== undefined) return verified;
  return services.access.recordUse(context, { ...check, useId, actor: { kind: 'user', id: who.userId } });
}

/** The reversal's decision record (goods-in 6.7): approved with the decision's use, or rejected. */
async function recordDecision(
  context: TransactionContext,
  reversal: ReversalRow,
  who: Decided,
  outcome: { readonly outcome: 'Approved'; readonly useId: string } | { readonly outcome: 'Rejected' },
): Promise<Outcome<string>> {
  const date = await context.businessDate();
  if (date.kind === 'not-set') return refusalOutcome(BUSINESS_DATE_NOT_SET);
  const id = uuidv7();
  await context.tx.insert(ptReversalDecision).values({
    id,
    ptReversalId: reversal.id,
    ...scopeColumnsOf(reversal),
    outcome: outcome.outcome,
    approvalDecisionId: who.decisionId,
    approvalUseId: outcome.outcome === 'Approved' ? outcome.useId : null,
    decidedByUserId: who.userId,
    roleAssignmentId: who.roleAssignmentId,
    decidedAt: context.startedAt,
    businessDate: date.date,
  });
  return { kind: 'success', answer: id };
}

/**
 * Step 7 (goods-in 6.4, 6.7): the decision's record, the GRN's mark cleared so it takes a corrected file (5.8), the
 * audit record naming the movements and `merchandise.pt-reversed`.
 */
async function recordReversal(
  context: TransactionContext,
  services: PtDecisionServices,
  open: OpenReversal,
  who: Decided,
  reason: string | undefined,
  movementIds: readonly string[],
  useId: string,
): Promise<EffectOutcome> {
  const { reversal, ptId, grnId, standing } = open;
  const revisionId = standing.revision.id;
  const decisionId = await recordDecision(context, reversal, who, { outcome: 'Approved', useId });
  if (decisionId.kind === 'refusal') return decisionId;
  const cleared = await services.receiving.clearPtMark(
    context,
    { userId: who.userId, roleAssignmentId: who.roleAssignmentId },
    { grnId, ptRevisionId: revisionId, reason: 'pt-reversed', source: { kind: 'screen' } },
  );
  if (cleared.kind === 'refusal') return cleared;
  const scope = auditScopeOf(reversal);
  await services.audit.record(context, {
    actor: { kind: 'user', id: who.userId },
    roleAssignmentId: who.roleAssignmentId,
    approval: { decisionId: who.decisionId },
    ...(reason === undefined ? {} : { reason }),
    scope,
    record: { module: PT_MODULE, type: PT_TYPE, id: ptId, versionId: revisionId },
    operation: 'reverse-pt',
    changes: [
      { kind: 'value', field: 'state', before: 'Official', after: 'Reversed' },
      { kind: 'value', field: 'reversalId', before: null, after: reversal.id },
      { kind: 'value', field: 'movements', before: null, after: [...movementIds] },
      { kind: 'value', field: 'grn', before: null, after: grnId },
    ],
    source: { kind: 'screen' },
  });
  await context.publish(ptReversed, {
    subject: { module: PT_MODULE, recordType: PT_TYPE, recordId: ptId, versionId: revisionId },
    scope,
    payload: { ptId, revisionId, reversalId: reversal.id },
  });
  return { kind: 'success', answer: { reversalId: reversal.id, decisionId: decisionId.answer } };
}

async function approve(
  services: PtDecisionServices,
  context: TransactionContext,
  decider: EffectDecider,
  reversalId: string,
): Promise<EffectOutcome> {
  const who = deciding(decider);
  const open = await recheckUnderLocks(context, services, reversalId);
  if (open.kind === 'refusal') return open;
  const hidden = await stockRefusal(context, services, who.userId, open.answer.standing.revision);
  if (hidden !== undefined) return refusalOutcome(hidden);
  const items = await reversalItems(context, open.answer.standing);
  if (items.kind === 'refusal') return items;
  const useId = uuidv7();
  const valued = await lockAndValue(context, services, open.answer, who, items.answer, useId);
  if (valued.kind === 'refusal') return valued;
  const used = await verifyAndUse(context, services, open.answer, who, items.answer, valued.answer, useId);
  if (used !== undefined) return refusalOutcome(used);
  const written = await services.ledger.write(context, valued.answer, { kind: 'screen' });
  if (written.kind === 'refused') return refusalOutcome(written.refusal);
  return recordReversal(context, services, open.answer, who, decider.reason, written.value.movementIds, useId);
}

async function reject(
  services: PtDecisionServices,
  context: TransactionContext,
  decider: EffectDecider,
  reversalId: string,
): Promise<EffectOutcome> {
  const who = deciding(decider);
  const found = await reversalOf(context, reversalId);
  if (found === undefined) return refusalOutcome(reversalNotFound(reversalId));
  if (found.decision !== undefined) return refusalOutcome(decided(reversalId));
  const decisionId = await recordDecision(context, found.reversal, who, { outcome: 'Rejected' });
  if (decisionId.kind === 'refusal') return decisionId;
  await services.audit.record(context, {
    actor: { kind: 'user', id: who.userId },
    roleAssignmentId: who.roleAssignmentId,
    approval: { decisionId: who.decisionId },
    ...(decider.reason === undefined ? {} : { reason: decider.reason }),
    scope: auditScopeOf(found.reversal),
    record: { module: PT_MODULE, type: PT_TYPE, id: found.ptId, versionId: found.reversal.ptRevisionId },
    operation: 'reject-pt-reversal',
    changes: [{ kind: 'value', field: 'reversalId', before: null, after: found.reversal.id }],
    source: { kind: 'screen' },
  });
  return { kind: 'success', answer: { reversalId: found.reversal.id, decisionId: decisionId.answer } };
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
      return open.kind === 'refusal' ? open.refusal : undefined;
    },
    approve: (context, decider, reversalId) => approve(dependencies.services(), context, decider, reversalId),
    reject: (context, decider, reversalId) => reject(dependencies.services(), context, decider, reversalId),
    /**
     * The ledger refused the reversal's posting under the locks, which rolled the decision back (books-and-posting 10
     * step 2): its unfinished-operation exception, in a command of its own, keyed by the decision's command, linking
     * the reversal (step 3; raise-posting-refused.ts). Any other refusal leaves nothing unfinished.
     */
    async refused(context, reversalId, decision) {
      if (decision.refusal.code !== POSTING_REFUSED) return;
      const found = await reversalOf(context, reversalId);
      const standing = found === undefined ? undefined : await revisionStanding(context, found.reversal.ptRevisionId);
      if (found === undefined || standing === undefined) return;
      await raisePostingRefused(context, dependencies.services().exceptions, {
        revision: standing.revision,
        versionId: reversalId,
        raisingEvent: decision.raisingEvent,
        refusal: decision.refusal,
        raisedBy: decision.actor,
      });
    },
  };
}
