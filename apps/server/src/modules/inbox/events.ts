import { z } from 'zod';
import { defineEvent, type TransactionContext } from '../../kernel/index.js';

// The inbox's event (module-map 4.8, section 8; code-house-rules 12.12; S1-F08-T04): identifiers only, saved in the
// transaction that changed the item. No consumer reads it; the live-update stream sends it to those who may act on
// the item (access-and-approvals 11.1, 11.3), whose My work then reads itself again.

/** The record type of a work item, as an event's subject. */
export const WORK_ITEM_RECORD_TYPE = 'inbox.work_item';

/** A work item was published, changed state, was escalated or was closed (11.1, 11.3). */
export const workItemChanged = defineEvent({
  type: 'inbox.work-item-changed',
  version: 1,
  payload: z.strictObject({ workItemId: z.uuid() }),
});

/** Publishes `inbox.work-item-changed` for each item, in the transaction that changed it. */
export async function announceItems(context: TransactionContext, workItemIds: readonly string[]): Promise<void> {
  for (const workItemId of workItemIds) {
    await context.publish(workItemChanged, {
      subject: { module: 'inbox', recordType: WORK_ITEM_RECORD_TYPE, recordId: workItemId },
      payload: { workItemId },
    });
  }
}
