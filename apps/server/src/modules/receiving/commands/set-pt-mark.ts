import { GRN_TYPE } from '@apparel-os/schemas';
import type { TransactionContext } from '../../../kernel/index.js';
import type { AuditInterface } from '../../audit/index.js';
import { currentPtMark } from '../queries/pt-mark.js';
import { recordItem, recordNotFound, refusalOf, type Actor, type Outcome } from './common.js';
import { lockedGrn, PT_REVISION_TYPE, writtenChange, type PtMarkChange } from './pt-mark.js';

/**
 * Sets the GRN's "PT attached" mark for a PT revision submitted for it (goods-in 5.1, 5.8; DEC-137; S2-F04-T02), under
 * the GRN's lock the caller took; refused while it is set already, naming the revision that set it
 * (`receiving.pt-attached`; one PT per GRN).
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
  return writtenChange(context, audit, actor, row, {
    ...change,
    kind: 'set',
    reason: 'pt-submitted',
    number: (now?.changeNumber ?? 0) + 1,
  });
}
