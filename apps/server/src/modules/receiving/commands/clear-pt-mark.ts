import { GRN_TYPE } from '@apparel-os/schemas';
import type { TransactionContext } from '../../../kernel/index.js';
import type { AuditInterface } from '../../audit/index.js';
import type { PtMarkReason } from '../db/schema.js';
import { currentPtMark } from '../queries/pt-mark.js';
import { recordItem, recordNotFound, refusalOf, refused, type Actor, type Outcome } from './common.js';
import { lockedGrn, PT_REVISION_TYPE, writtenChange, type PtMarkChange } from './pt-mark.js';

/** Why a mark is cleared: its draft withdrawn, or, with S2-F06-T01 and S2-F09-T01, the PT rejected or reversed. */
export type PtMarkClearReason = Exclude<PtMarkReason, 'pt-submitted'>;

/**
 * Clears the GRN's "PT attached" mark the PT revision set, for the reason given (goods-in 5.8; S2-F04-T02), under the
 * GRN's lock the caller took; refused unless that revision's mark is set (`receiving.pt-not-attached`).
 */
export async function clearPtMark(
  context: TransactionContext,
  audit: AuditInterface,
  actor: Actor,
  change: PtMarkChange & { readonly reason: PtMarkClearReason },
): Promise<Outcome<{ readonly markChangeId: string }>> {
  const row = await lockedGrn(context, change.grnId);
  if (row === undefined) return refusalOf(recordNotFound(GRN_TYPE, change.grnId));
  const now = await currentPtMark(context, row.id);
  if (now?.change !== 'set' || now.ptRevisionId !== change.ptRevisionId) {
    return refused('refused', 'receiving.pt-not-attached', [
      recordItem(GRN_TYPE, row.id),
      recordItem(PT_REVISION_TYPE, change.ptRevisionId),
    ]);
  }
  return writtenChange(context, audit, actor, row, { ...change, kind: 'cleared', number: now.changeNumber + 1 });
}
