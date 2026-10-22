import { uuidv7 } from '@apparel-os/domain';
import { GRN_TYPE, RECOUNT_APPROVAL, RECOUNT_TYPE, type RecountDraft, type RecountProposed } from '@apparel-os/schemas';
import type { TransactionContext } from '../../../kernel/index.js';
import type { AccessInterface } from '../../access/index.js';
import type { AuditInterface } from '../../audit/index.js';
import { recount, recountLine } from '../db/schema.js';
import { RECEIVING_MODULE } from '../domain/kinds.js';
import { pendingRecountOf, recountsOfGrn, recountVersionOf } from '../queries/recounts.js';
import {
  audited,
  factsOf,
  recordItem,
  recordNotFound,
  refusalOf,
  refused,
  scopeColumns,
  valueChange,
} from './common.js';
import type { Actor, Outcome } from './common.js';
import {
  checkedLines,
  lockGrn,
  postRecount,
  recountItems,
  requestValueOf,
  type CheckDependencies,
  type PostingDependencies,
} from './recount-steps.js';

// Propose a recount of a GRN's lines (goods-in 4.7, 4.11, 10.3; PRD-REC-019; S2-F02-T05). A GRN is never edited: a
// miscount is corrected by a linked recount of the lines concerned, with a reason, which a different person approves.
// Proposing records no business effect, so it asks no gate (DEC-116). Locks the GRN's Arrival and row at step 1
// (recount-steps.ts), so it never passes a PT file's submit or withdrawal, Booking's later link or another recount, and
// names the GRN's recount version the proposer saw (code-house-rules 12.7). One recount of a GRN waits at a time, since
// each is proposed against the counts the ones before it left. Its approval is requested through `access` from someone
// other than the proposer (POL-02.07), on the cost of the goods its receipt counts and reversals would move now, read
// under the ledger's locks as the posting will read it and writing nothing (stock-ledger 13.1), so a recount the
// ledger would refuse, such as one taking back held pieces, is refused now.

export interface ProposeDependencies extends CheckDependencies, Pick<PostingDependencies, 'ledger'> {
  readonly audit: AuditInterface;
  readonly access: Pick<AccessInterface, 'requestApproval'>;
}

export async function proposeRecount(
  context: TransactionContext,
  dependencies: ProposeDependencies,
  actor: Actor,
  grnId: string,
  draft: RecountDraft,
): Promise<Outcome<RecountProposed>> {
  const locked = await lockGrn(context, grnId);
  if (locked === undefined) return refusalOf(recordNotFound(GRN_TYPE, grnId));
  const records = await recountsOfGrn(context, grnId);
  if (recountVersionOf(grnId, records) !== draft.versionToken) {
    return refused('conflict', 'kernel.stale-version', [recordItem(GRN_TYPE, grnId)]);
  }
  const pending = pendingRecountOf(records);
  if (pending !== undefined) {
    return refused('refused', 'receiving.recount-pending', [recordItem(RECOUNT_TYPE, pending.row.id)]);
  }
  const planned = await checkedLines(context, dependencies, locked.grn, records, draft.lines);
  if (planned.kind === 'refusal') return planned;
  const recountId = uuidv7();
  const { items } = await recountItems(context, locked, records, planned.answer);
  const value = await postRecount(
    context,
    { ledger: dependencies.ledger },
    { recountId, actor, items, series: [] },
    false,
  );
  if (value.kind === 'refusal') return value;
  const reason = draft.reason.trim();
  await context.tx.insert(recount).values({
    id: recountId,
    grnId,
    ...scopeColumns(locked.grn),
    reason,
    proposedByUserId: actor.userId,
    roleAssignmentId: actor.roleAssignmentId,
    proposedAt: context.startedAt,
  });
  await context.tx.insert(recountLine).values(
    planned.answer.map((line) => ({
      id: uuidv7(),
      recountId,
      grnLineId: line.line.id,
      ...scopeColumns(locked.grn),
      countedBefore: line.countedBefore,
      countedAfter: line.countedAfter,
    })),
  );
  const requestId = await dependencies.access.requestApproval(context, {
    actionType: RECOUNT_APPROVAL,
    document: { module: RECEIVING_MODULE, recordType: RECOUNT_TYPE, recordId: recountId, versionId: recountId },
    value: requestValueOf(value.answer.value),
    preparers: [actor.userId],
    requestedBy: actor,
    facts: factsOf(locked.grn),
  });
  await audited(context, dependencies.audit, actor, locked.grn, {
    record: { type: RECOUNT_TYPE, id: recountId, versionId: recountId },
    operation: 'propose-recount',
    changes: [
      valueChange('grnId', null, grnId),
      valueChange('reason', null, reason),
      valueChange(
        'lines',
        null,
        planned.answer.map((line) => ({
          grnLineId: line.line.id,
          countedBefore: line.countedBefore,
          countedAfter: line.countedAfter,
        })),
      ),
    ],
  });
  return { kind: 'success', answer: { recountId, requestId } };
}
