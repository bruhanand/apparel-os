import { GRN_TYPE, STOCK_RECEIPT_ORIGIN_TYPE } from '@apparel-os/schemas';
import type { CommandRefusal, TransactionContext } from '../../../../kernel/index.js';
import type { ReceivingInterface } from '../../../receiving/index.js';
import { ptGoodsNotWaiting, ptRevisionGoods } from '../../../stock/ledger/index.js';
import { PT_REVISION_TYPE } from '../domain/kinds.js';
import { recordItem, revisionNotFound } from '../domain/refusals.js';
import { originsNotWaiting } from '../domain/reversed.js';
import type { RevisionStanding } from '../queries/approval.js';
import { reversalsOf, reversedBy } from '../queries/reversal.js';

// What a PT reversal's proposal and its approval both check (goods-in 6.4, 6.7; DEC-137, PRD-REC-019; S2-F09-T01): the
// revision is the PT's newest Official one, and no piece of its GRN is scanned in, nor any piece it covers held,
// damaged or accepted since its approval. Each caller holds the PT's and the GRN's row locks at step 1, as every scan
// holds the GRN's. The goods are read under the actor's own actor, and the origins they may see are named; goods they
// may not see are rechecked through the one narrowly authorised `ptGoodsNotWaiting`, which answers only whether any
// blocks it, so the refusal then names the revision alone, nothing of what the actor may not see (code-house-rules
// 6.2, 12.3; DEC-117; code review 8 of stage 2).

/** Only the PT's newest revision, Official and not reversed, is reversed (goods-in 6.4, 6.5). */
export const notOfficial = (revisionId: string): CommandRefusal => ({
  kind: 'refused',
  code: 'merchandise.pt-not-official',
  missing: [recordItem(PT_REVISION_TYPE, revisionId)],
});

/** Whether a piece the revision covers is no longer waiting where its approval left it, or the GRN's is scanned in. */
export async function goodsRefusal(
  context: TransactionContext,
  receiving: Pick<ReceivingInterface, 'anyAccepted'>,
  grnId: string,
  revisionId: string,
): Promise<CommandRefusal | undefined> {
  // The scan-in's own record, read under the GRN's lock every scan takes (goods-in 7.5; DEC-137).
  if (await receiving.anyAccepted(context, grnId)) {
    return { kind: 'refused', code: 'merchandise.pt-scanned-in', missing: [recordItem(GRN_TYPE, grnId)] };
  }
  const held = originsNotWaiting(await ptRevisionGoods(context, [revisionId]));
  if (held.length > 0) {
    return {
      kind: 'refused',
      code: 'merchandise.pt-goods-held',
      missing: held.map((originId) => recordItem(STOCK_RECEIPT_ORIGIN_TYPE, originId)),
    };
  }
  // Goods the actor may not see: refused generically, naming the revision only (DEC-117).
  if (await ptGoodsNotWaiting(context, revisionId)) {
    return { kind: 'refused', code: 'merchandise.pt-goods-held', missing: [recordItem(PT_REVISION_TYPE, revisionId)] };
  }
  return undefined;
}

/** The revision a reversal is about: the PT's newest, approved and posted, and not reversed (goods-in 6.4). */
export async function officialRefusal(
  context: TransactionContext,
  standing: RevisionStanding | undefined,
  revisionId: string,
): Promise<CommandRefusal | undefined> {
  if (standing === undefined) return revisionNotFound(revisionId);
  if (!standing.newest || standing.approval === undefined) return notOfficial(revisionId);
  if (reversedBy((await reversalsOf(context, [revisionId])).get(revisionId))) return notOfficial(revisionId);
  return undefined;
}
