import { uuidv7 } from '@apparel-os/domain';
import { GRN_TYPE, RECOUNT_APPROVAL, RECOUNT_TYPE } from '@apparel-os/schemas';
import { CommandDefect, type LockTarget, type TransactionContext } from '../../../kernel/index.js';
import type { DocumentEffect, EffectDecider, EffectOutcome } from '../../access/index.js';
import type { AuditInterface } from '../../audit/index.js';
import type { ExceptionsInterface } from '../../exceptions/index.js';
import { recountDecision, recountMovement } from '../db/schema.js';
import { RECEIVING_MODULE, RECOUNT_POSTING_REFUSED_TYPE, SHORTAGE_EXCEPTION_TYPE } from '../domain/kinds.js';
import { receivingMissing, receivingUnavailable, type AvailabilityDependencies } from '../queries/availability.js';
import { recountRow, recountsOfGrn, type RecountRecord } from '../queries/recounts.js';
import { grnRow } from '../queries/grns.js';
import {
  audited,
  exceptionFactsOf,
  recordItem,
  recordNotFound,
  refusalOf,
  scopeColumns,
  today,
  valueChange,
  type Actor,
} from './common.js';
import {
  checkedLines,
  heldGrn,
  postRecount,
  recountItems,
  recountLockTargets,
  type CheckDependencies,
  type PostingDependencies,
} from './recount-steps.js';

// A recount's decision (goods-in 4.7, 4.11, 10.3; PRD-REC-019, POL-02.07; access-and-approvals 9.8b; S2-F02-T05): the
// effect `access`'s Decide runs in the decision's transaction, once it has refused whoever proposed it (9.3). Decide
// locks the GRN's Arrival and row at step 1 with the request (code-house-rules 8.2), so a recount is decided only while
// nothing passes it: under them the decision is refused once made, and an approval rechecks the GRN's "PT attached"
// mark and every line as at the proposal, asks receiving's gate at the unit (goods-in 10.5), and posts the recount's
// receipt counts and reversals through the ledger, which verifies and uses the decision under its locks on the goods'
// cost then (access-and-approvals 9.7; stock-ledger 13.1), so the decision is written before the effect, under a
// savepoint. A line whose shortage the recount makes larger raises a shortage follow-up to Booking, linking to the GRN
// (goods-in 2, 4.9). The GRN never changes: the recount and its stock effects are its own records (PRD-REC-019). A
// rejection changes nothing but its decision, and asks no gate: it records no business effect (DEC-116).

/** What the decision effect uses, bound late, since `access` is built with it (access-and-approvals 9.8b). */
export interface RecountEffectServices extends AvailabilityDependencies, CheckDependencies, PostingDependencies {
  readonly exceptions: Pick<ExceptionsInterface, 'codeSeriesTarget' | 'raise' | 'raiseInOwnCommand'>;
}

/** The ledger's refusal of a posting under the locks that the exception follows (books-and-posting 10). */
const POSTING_REFUSED = 'stock.posting-refused';

export interface RecountEffectDependencies {
  readonly audit: AuditInterface;
  readonly services: () => RecountEffectServices;
}

/** Who decides: the person and the assignment relied on, with the decision, which every effect has (9.5). */
function deciding(decider: EffectDecider): { readonly actor: Actor; readonly decisionId: string } {
  if (decider.roleAssignmentId === undefined || decider.approvalDecisionId === undefined) {
    throw new CommandDefect('A recount was decided without its decision or the assignment relied on');
  }
  return {
    actor: { userId: decider.actor.id, roleAssignmentId: decider.roleAssignmentId },
    decisionId: decider.approvalDecisionId,
  };
}

/** The recount waiting for its decision, under the GRN's lock; otherwise not found or decided (12.3). */
async function openRecount(
  context: TransactionContext,
  recountId: string,
): Promise<
  | { readonly record: RecountRecord; readonly records: readonly RecountRecord[] }
  | { readonly kind: 'refusal'; readonly refusal: ReturnType<typeof recordNotFound> }
> {
  const row = await recountRow(context, recountId);
  if (row === undefined) return { kind: 'refusal', refusal: recordNotFound(RECOUNT_TYPE, recountId) };
  const records = await recountsOfGrn(context, row.grnId);
  const record = records.find((each) => each.row.id === recountId);
  if (record === undefined) throw new CommandDefect(`Recount ${recountId} is not among its GRN's`);
  if (record.decision !== undefined) {
    return {
      kind: 'refusal',
      refusal: { kind: 'refused', code: 'receiving.recount-decided', missing: [recordItem(RECOUNT_TYPE, recountId)] },
    };
  }
  return { record, records };
}

/** Records the decision of a recount, by the decider, under the decision, scoped as the GRN is. */
async function recordDecision(
  context: TransactionContext,
  record: RecountRecord,
  decided: { readonly actor: Actor; readonly decisionId: string },
  outcome: 'approved' | 'rejected',
): Promise<string> {
  const id = uuidv7();
  await context.tx.insert(recountDecision).values({
    id,
    recountId: record.row.id,
    ...scopeColumns(record.row),
    outcome,
    approvalDecisionId: decided.decisionId,
    decidedByUserId: decided.actor.userId,
    roleAssignmentId: decided.actor.roleAssignmentId,
    decidedAt: context.startedAt,
  });
  return id;
}

/** A recount's decision: approve corrects custody by the difference; reject changes nothing (goods-in 4.11). */
export function recountEffect(dependencies: RecountEffectDependencies): DocumentEffect {
  return {
    decisionWritten: 'before-effect',
    async targets(context, recountId): Promise<LockTarget[]> {
      const row = await recountRow(context, recountId);
      const grn = row === undefined ? undefined : await grnRow(context, row.grnId);
      return grn === undefined ? [] : recountLockTargets(grn.id, grn.arrivalId);
    },
    async precheck(context, recountId) {
      const open = await openRecount(context, recountId);
      return 'refusal' in open ? open.refusal : undefined;
    },
    async approve(context, decider, recountId): Promise<EffectOutcome> {
      const open = await openRecount(context, recountId);
      if ('refusal' in open) return refusalOf(open.refusal);
      const { record, records } = open;
      const locked = await heldGrn(context, record.row.grnId);
      if (locked === undefined) return refusalOf(recordNotFound(GRN_TYPE, record.row.grnId));
      const decided = deciding(decider);
      const { actor, decisionId } = decided;
      const services = dependencies.services();
      const date = await today(context);
      if (typeof date !== 'string') return refusalOf(date);
      // Receiving's gate at the unit: a recount adds or reverses receipt counts, as a GRN's issue makes them (10.5).
      const place = { siteId: locked.arrival.siteId, businessUnitId: locked.arrival.businessUnitId };
      const unavailable = receivingUnavailable(await receivingMissing(context, services, place, date));
      if (unavailable !== undefined) return refusalOf(unavailable);
      const decidedBefore = records.filter((each) => each.row.id !== record.row.id);
      const planned = await checkedLines(
        context,
        services,
        locked.grn,
        decidedBefore,
        record.lines.map((line) => ({ grnLineId: line.grnLineId, countedQuantity: line.countedAfter })),
      );
      if (planned.kind === 'refusal') return planned;
      for (const line of planned.answer) {
        const proposed = record.lines.find((each) => each.grnLineId === line.line.id);
        // One recount of a GRN waits at a time, so the counts it was proposed against are the counts now.
        if (proposed?.countedBefore !== line.countedBefore) {
          throw new CommandDefect(`Recount ${record.row.id} was proposed against another count of its line`);
        }
      }
      const shorter = planned.answer.filter((line) => line.after.shortage > line.before.shortage);
      const series: LockTarget[] = [];
      if (shorter.length > 0) {
        const codes = await services.exceptions.codeSeriesTarget(context);
        if (codes.kind === 'refused') return refusalOf(codes.refusal);
        series.push(codes.value);
      }
      const { items, effects } = await recountItems(context, locked, decidedBefore, planned.answer);
      const posted = await postRecount(
        context,
        services,
        {
          recountId: record.row.id,
          actor,
          items,
          series,
          approval: {
            decisionId,
            actionType: RECOUNT_APPROVAL,
            recountId: record.row.id,
            preparers: [record.row.proposedByUserId],
          },
        },
        true,
      );
      if (posted.kind === 'refusal') return posted;
      const movementIds = posted.answer.written?.movementIds ?? [];
      // Each item makes one movement, written in the order of the items (stock-ledger 13.4).
      if (movementIds.length !== effects.length) throw new CommandDefect('A recount wrote another number of movements');
      if (effects.length > 0) {
        await context.tx.insert(recountMovement).values(
          effects.map((effect, index) => {
            const recountLineId = record.lines.find((line) => line.grnLineId === effect.grnLineId)?.id;
            const movementId = movementIds[index];
            if (recountLineId === undefined || movementId === undefined) {
              throw new CommandDefect('A recount effect lost its line or its movement');
            }
            return {
              id: effect.id,
              recountId: record.row.id,
              recountLineId,
              grnLineId: effect.grnLineId,
              ...scopeColumns(record.row),
              kind: effect.kind,
              receiptOriginId: effect.receiptOriginId,
              reversesMovementId: effect.reversesMovementId,
              movementId,
              quantity: effect.quantity,
            };
          }),
        );
      }
      const recountDecisionId = await recordDecision(context, record, decided, 'approved');
      // A shortage the recount makes larger reaches Booking, as the GRN's own does, linking to the GRN (2, 4.9).
      if (shorter.length > 0) {
        const raised = await services.exceptions.raise(context, {
          raisingEvent: `${SHORTAGE_EXCEPTION_TYPE}:${record.row.id}`,
          typeCode: SHORTAGE_EXCEPTION_TYPE,
          facts: exceptionFactsOf(locked.arrival),
          links: [{ module: RECEIVING_MODULE, recordType: GRN_TYPE, recordId: locked.grn.id, versionId: null }],
          exposure: { kind: 'unknown' },
          raisedBy: { kind: 'user', id: actor.userId },
          roleAssignmentId: actor.roleAssignmentId,
        });
        if (raised.kind === 'refused') return refusalOf(raised.refusal);
      }
      await audited(context, dependencies.audit, actor, record.row, {
        record: { type: RECOUNT_TYPE, id: record.row.id, versionId: record.row.id },
        operation: 'approve-recount',
        changes: [
          valueChange('decision', null, 'approved'),
          valueChange('movements', null, [...movementIds]),
          valueChange(
            'effects',
            null,
            effects.map((effect) => ({
              grnLineId: effect.grnLineId,
              kind: effect.kind,
              receiptOriginId: effect.receiptOriginId,
              quantity: effect.quantity,
            })),
          ),
        ],
        approval: { decisionId },
        ...(decider.reason === undefined ? {} : { reason: decider.reason }),
      });
      return { kind: 'success', answer: { recountId: record.row.id, recountDecisionId } };
    },
    /**
     * A reversal the ledger refused to post under the locks, such as into a locked period, rolled the approval back
     * (books-and-posting 10 step 2): its unfinished-operation exception, in a command of its own once the refusal is
     * kept, keyed by the decision's command, linking the recount (step 3; code review 7). The recount still waits, so
     * it is approved again once the cause is fixed (step 5). Any other refusal leaves nothing unfinished.
     */
    async refused(context, recountId, decision) {
      if (decision.refusal.code !== POSTING_REFUSED) return;
      const row = await recountRow(context, recountId);
      if (row === undefined) return;
      await dependencies.services().exceptions.raiseInOwnCommand(context, {
        raisingEvent: decision.raisingEvent,
        typeCode: RECOUNT_POSTING_REFUSED_TYPE,
        facts: exceptionFactsOf(row),
        links: [{ module: RECEIVING_MODULE, recordType: RECOUNT_TYPE, recordId: recountId, versionId: recountId }],
        exposure: { kind: 'unknown' },
        raisedBy: decision.actor,
        comment: JSON.stringify({ code: decision.refusal.code, missing: decision.refusal.missing }),
      });
    },
    async reject(context, decider, recountId): Promise<EffectOutcome> {
      const open = await openRecount(context, recountId);
      if ('refusal' in open) return refusalOf(open.refusal);
      const decided = deciding(decider);
      const recountDecisionId = await recordDecision(context, open.record, decided, 'rejected');
      await audited(context, dependencies.audit, decided.actor, open.record.row, {
        record: { type: RECOUNT_TYPE, id: recountId, versionId: recountId },
        operation: 'reject-recount',
        changes: [valueChange('decision', null, 'rejected')],
        approval: { decisionId: decided.decisionId },
        ...(decider.reason === undefined ? {} : { reason: decider.reason }),
      });
      return { kind: 'success', answer: { recountId, recountDecisionId } };
    },
  };
}
