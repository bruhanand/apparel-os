import { uuidv7 } from '@apparel-os/domain';
import { and, eq, inArray, isNotNull, lte, sql } from 'drizzle-orm';
import { LOCK_STEP, lockTable, type TransactionContext } from '../../../kernel/index.js';
import { workItem, workItemActor, workItemEscalation, workItemRoutingVersion } from '../db/schema.js';
import { announceItems } from '../events.js';
import { recipientOf } from './routing.js';

const WORK_ITEM = lockTable('inbox', 'work_item');

/** The open tasks and approvals past their due time and not yet escalated (11.3), by identifier. */
function overdue(context: TransactionContext, ids?: readonly string[]) {
  return context.tx
    .select({ item: workItem, version: workItemRoutingVersion })
    .from(workItem)
    .innerJoin(workItemRoutingVersion, eq(workItemRoutingVersion.id, workItem.routingVersionId))
    .where(
      and(
        ids === undefined ? undefined : inArray(workItem.id, [...ids]),
        eq(workItem.open, true),
        inArray(workItem.kind, ['task', 'approval']),
        isNotNull(workItem.dueAt),
        lte(workItem.dueAt, context.startedAt),
        sql`not exists (select 1 from inbox.work_item_escalation e where e.work_item_id = ${workItem.id})`,
      ),
    )
    .orderBy(workItem.id);
}

/**
 * Escalate overdue tasks and approvals (access-and-approvals 9.4, 11.3; module-map 4.8; PRD-ACS-010; S1-F05-T02): each
 * open task or approval item past the due time its routing version gave it, not yet escalated, gets one escalation to
 * that version's recipient: the recipient is added as an actor, every actor it had is kept, and the escalation is
 * recorded in `work_item_escalation` (S1-F08-T02). The items are locked at step 1 and read again under the locks, so a
 * second run at the same time waits and finds them escalated; the escalation's key records it once in any case
 * (code-house-rules 8.2; migration 0043). The item shows Overdue from its due time. An item that was given no due time,
 * since no routing was in force, never escalates. Answers how many were escalated (PRD-INT-008).
 */
export async function escalateOverdueWork(context: TransactionContext): Promise<number> {
  const found = await overdue(context);
  if (found.length === 0) return 0;
  await context.lock(
    LOCK_STEP.document,
    found.map(({ item }) => ({ table: WORK_ITEM, id: item.id, mode: 'exclusive' as const })),
  );
  const due = await overdue(
    context,
    found.map(({ item }) => item.id),
  );
  const escalated: string[] = [];
  for (const { item, version } of due) {
    const recipient = recipientOf(version);
    const userId = recipient.kind === 'user' ? recipient.userId : null;
    const roleId = recipient.kind === 'role' ? recipient.roleId : null;
    const recorded = await context.tx
      .insert(workItemEscalation)
      .values({
        id: uuidv7(),
        workItemId: item.id,
        recipientUserId: userId,
        recipientRoleId: roleId,
        escalatedAt: context.startedAt,
      })
      .onConflictDoNothing()
      .returning({ id: workItemEscalation.id });
    if (recorded.length === 0) continue;
    await context.tx
      .insert(workItemActor)
      .values({ id: uuidv7(), workItemId: item.id, userId, eligibility: null, roleId });
    escalated.push(item.id);
  }
  await announceItems(context, escalated);
  return escalated.length;
}
