import type { WorkItem } from '@apparel-os/schemas';
import { eq, inArray } from 'drizzle-orm';
import type { TransactionContext } from '../../../kernel/index.js';
import type { AccessInterface } from '../../access/index.js';
import { workItem, workItemActor } from '../db/schema.js';
import { compareWork, type Orderable } from '../domain/order.js';
import { APPROVAL_ELIGIBILITY } from '../jobs/consumers.js';

/**
 * List my work (access-and-approvals 11.2; module-map 4.8; PRD-ACS-009): the open items the reader may act on now,
 * as a named user or by the owner's eligibility rule, which `access` answers at this read, so an item drops out as
 * soon as its reader is no longer eligible (11.2, 9.4). Ordered by due time, then exposure, Unknown above known
 * (PRD-MOD-015). Each item names its next action as a code (PRD-UXP-003).
 */
export async function listMyWork(
  context: TransactionContext,
  access: AccessInterface,
  userId: string,
): Promise<{ asOf: string; items: WorkItem[] }> {
  const open = await context.tx.select().from(workItem).where(eq(workItem.open, true));
  const actors =
    open.length === 0
      ? []
      : await context.tx
          .select()
          .from(workItemActor)
          .where(
            inArray(
              workItemActor.workItemId,
              open.map((item) => item.id),
            ),
          );
  const approvalRequestIds = open
    .filter((item) =>
      actors.some((actor) => actor.workItemId === item.id && actor.eligibility === APPROVAL_ELIGIBILITY),
    )
    .map((item) => item.ownerRecordId);
  const eligible = new Set(await access.eligibleRequests(context, userId, approvalRequestIds));
  const mine = open.filter((item) =>
    actors.some(
      (actor) =>
        actor.workItemId === item.id &&
        (actor.userId === userId || (actor.eligibility === APPROVAL_ELIGIBILITY && eligible.has(item.ownerRecordId))),
    ),
  );
  const orderable = mine.map((item) => ({
    item,
    id: item.id,
    dueAt: item.dueAt,
    recordedAt: item.recordedAt,
    exposure: exposureOf(item),
  }));
  orderable.sort((a, b) => compareWork(a, b));
  return {
    asOf: context.startedAt.toISOString(),
    items: orderable.map(({ item, exposure }) => ({
      id: item.id,
      kind: item.kind as WorkItem['kind'],
      owner: {
        module: item.ownerModule,
        recordType: item.ownerRecordType,
        recordId: item.ownerRecordId,
        versionId: item.ownerVersionId,
      },
      due: item.dueAt === null ? { kind: 'none' } : { kind: 'at', at: item.dueAt.toISOString() },
      exposure: exposure as WorkItem['exposure'],
      state: item.state,
      ...(item.kind === 'approval' ? { nextAction: 'access.decide-approval' } : {}),
    })),
  };
}

function exposureOf(item: typeof workItem.$inferSelect): Orderable['exposure'] {
  if (item.exposureKind === 'known' && item.exposureAmount !== null) {
    return { kind: 'known', amount: item.exposureAmount };
  }
  return item.exposureKind === 'unknown' ? { kind: 'unknown' } : { kind: 'none' };
}
