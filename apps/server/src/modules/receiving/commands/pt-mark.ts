import { uuidv7 } from '@apparel-os/domain';
import { GRN_TYPE } from '@apparel-os/schemas';
import { eq } from 'drizzle-orm';
import { CommandDefect, lockTable, type LockTarget, type TransactionContext } from '../../../kernel/index.js';
import type { AuditInterface, AuditSource } from '../../audit/index.js';
import { grn, grnPtMark, type PtMarkReason } from '../db/schema.js';
import { currentPtMark } from '../queries/pt-mark.js';
import {
  BUSINESS_DATE_NOT_SET,
  factsOf,
  recordItem,
  recordNotFound,
  refusalOf,
  scopeColumns,
  type Actor,
  type Outcome,
} from './common.js';

// The GRN's "PT attached" mark (goods-in 4.7, 5.1, 5.6, 5.8, 10.3; PRD-REC-019, DEC-137; S2-F04-T02). `merchandise` ·
// PT sets it, in the transaction that submits a PT file for the GRN, and clears it in the one that withdraws that
// draft; rejection and reversal clear it too (S2-F06-T01, S2-F09-T01); a recount is refused while it is set
// (S2-F02-T05). Each set and clear is a dated, attributable change, the next of the GRN's numbered changes, with its
// audit record. The caller locks the GRN's row at step 1 with its own rows, through ptMarkLock, before it calls either
// (code-house-rules 8.2), so the mark is read and changed under that lock.

/** The PT revision this module names by its identifier only (code-house-rules 3.2). */
const PT_REVISION_TYPE = 'merchandise.pt_revision';

/** The GRN's row as a lock target: every change of its mark, and a recount, lock it exclusively at step 1. */
export const ptMarkLock = (grnId: string): LockTarget => ({
  table: lockTable('receiving', 'grn'),
  id: grnId,
  mode: 'exclusive',
});

export interface PtMarkChange {
  readonly grnId: string;
  readonly ptRevisionId: string;
  /** Where the change was made: the screen, or the import that submitted the PT file. */
  readonly source: AuditSource;
}

/** The GRN under the caller's lock, or the refusal naming it as not found (code-house-rules 6.2, 12.3). */
async function lockedGrn(context: TransactionContext, grnId: string) {
  const held = context.heldLock(lockTable('receiving', 'grn'), grnId);
  if (held?.mode !== 'exclusive') throw new CommandDefect('The GRN mark was changed without the GRN locked');
  const [row] = await context.tx.select().from(grn).where(eq(grn.id, grnId));
  return row;
}

async function written(
  context: TransactionContext,
  audit: AuditInterface,
  actor: Actor,
  row: typeof grn.$inferSelect,
  change: PtMarkChange & { readonly kind: 'set' | 'cleared'; readonly reason: PtMarkReason; readonly number: number },
): Promise<Outcome<{ readonly markChangeId: string }>> {
  const date = await context.businessDate();
  if (date.kind === 'not-set') return refusalOf(BUSINESS_DATE_NOT_SET);
  const id = uuidv7();
  await context.tx.insert(grnPtMark).values({
    id,
    grnId: row.id,
    changeNumber: change.number,
    ...scopeColumns(row),
    change: change.kind,
    ptRevisionId: change.ptRevisionId,
    reason: change.reason,
    changedByUserId: actor.userId,
    roleAssignmentId: actor.roleAssignmentId,
    occurredAt: context.startedAt,
    businessDate: date.date,
  });
  await audit.record(context, {
    actor: { kind: 'user', id: actor.userId },
    roleAssignmentId: actor.roleAssignmentId,
    scope: factsOf(row),
    record: { module: 'receiving', type: GRN_TYPE, id: row.id },
    operation: change.kind === 'set' ? 'set-pt-attached' : 'clear-pt-attached',
    changes: [
      { kind: 'value', field: 'ptAttached', before: change.kind !== 'set', after: change.kind === 'set' },
      { kind: 'value', field: 'ptRevisionId', before: null, after: change.ptRevisionId },
      { kind: 'value', field: 'reason', before: null, after: change.reason },
    ],
    source: change.source,
  });
  return { kind: 'success', answer: { markChangeId: id } };
}

/**
 * Sets the mark for a PT revision submitted for the GRN; refused while it is set already, naming the revision that set
 * it (`receiving.pt-attached`; goods-in 5.1: one PT per GRN).
 */
export async function setPtMark(
  context: TransactionContext,
  audit: AuditInterface,
  actor: Actor,
  change: PtMarkChange,
): Promise<Outcome<{ readonly markChangeId: string }>> {
  const row = await lockedGrn(context, change.grnId);
  if (row === undefined) return refusalOf(recordNotFound(GRN_TYPE, change.grnId));
  const now = await currentPtMark(context, row.id);
  if (now?.change === 'set') {
    return refusalOf({
      kind: 'refused',
      code: 'receiving.pt-attached',
      missing: [recordItem(GRN_TYPE, row.id), recordItem(PT_REVISION_TYPE, now.ptRevisionId)],
    });
  }
  return written(context, audit, actor, row, {
    ...change,
    kind: 'set',
    reason: 'pt-submitted',
    number: (now?.changeNumber ?? 0) + 1,
  });
}

/**
 * Clears the mark the PT revision set, for the reason given; refused unless that revision's mark is set
 * (`receiving.pt-not-attached`).
 */
export async function clearPtMark(
  context: TransactionContext,
  audit: AuditInterface,
  actor: Actor,
  change: PtMarkChange & { readonly reason: Exclude<PtMarkReason, 'pt-submitted'> },
): Promise<Outcome<{ readonly markChangeId: string }>> {
  const row = await lockedGrn(context, change.grnId);
  if (row === undefined) return refusalOf(recordNotFound(GRN_TYPE, change.grnId));
  const now = await currentPtMark(context, row.id);
  if (now?.change !== 'set' || now.ptRevisionId !== change.ptRevisionId) {
    return refusalOf({
      kind: 'refused',
      code: 'receiving.pt-not-attached',
      missing: [recordItem(GRN_TYPE, row.id), recordItem(PT_REVISION_TYPE, change.ptRevisionId)],
    });
  }
  return written(context, audit, actor, row, { ...change, kind: 'cleared', number: now.changeNumber + 1 });
}
