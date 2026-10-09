import { uuidv7 } from '@apparel-os/domain';
import { and, eq, inArray, isNotNull, lte, sql } from 'drizzle-orm';
import type { TransactionContext } from '../../../kernel/index.js';
import { workItem, workItemActor, workItemEscalation, workItemRoutingVersion } from '../db/schema.js';
import { announceItems } from '../events.js';
import { recipientOf } from './routing.js';

/**
 * Escalate overdue tasks and approvals (access-and-approvals 9.4, 11.3; module-map 4.8; PRD-ACS-010; S1-F05-T02): each
 * open task or approval item past the due time its routing version gave it, not yet escalated, gets one escalation to
 * that version's recipient: the recipient is added as an actor, every actor it had is kept, and the escalation is
 * recorded in `work_item_escalation` (S1-F08-T02). The item shows Overdue from its due time. An item that was given no
 * due time, since no routing was in force, never escalates. Answers how many were escalated; a rerun escalates none of
 * them again (PRD-INT-008).
 */
export async function escalateOverdueWork(context: TransactionContext): Promise<number> {
  const due = await context.tx
    .select({ item: workItem, version: workItemRoutingVersion })
    .from(workItem)
    .innerJoin(workItemRoutingVersion, eq(workItemRoutingVersion.id, workItem.routingVersionId))
    .where(
      and(
        eq(workItem.open, true),
        inArray(workItem.kind, ['task', 'approval']),
        isNotNull(workItem.dueAt),
        lte(workItem.dueAt, context.startedAt),
        sql`not exists (select 1 from inbox.work_item_escalation e where e.work_item_id = ${workItem.id})`,
      ),
    )
    .orderBy(workItem.id);
  for (const { item, version } of due) {
    const recipient = recipientOf(version);
    const userId = recipient.kind === 'user' ? recipient.userId : null;
    const roleId = recipient.kind === 'role' ? recipient.roleId : null;
    await context.tx
      .insert(workItemActor)
      .values({ id: uuidv7(), workItemId: item.id, userId, eligibility: null, roleId });
    await context.tx.insert(workItemEscalation).values({
      id: uuidv7(),
      workItemId: item.id,
      recipientUserId: userId,
      recipientRoleId: roleId,
      escalatedAt: context.startedAt,
    });
  }
  await announceItems(
    context,
    due.map(({ item }) => item.id),
  );
  return due.length;
}
