import type { WorkItem } from '@apparel-os/schemas';
import { eq, inArray } from 'drizzle-orm';
import type { TransactionContext } from '../../../kernel/index.js';
import type { AccessInterface } from '../../access/index.js';
import { workItem, workItemActor } from '../db/schema.js';
import { compareWork, type Orderable } from '../domain/order.js';
import { APPROVAL_ELIGIBILITY } from '../jobs/consumers.js';

/**
 * List my work (access-and-approvals 11.2; module-map 4.8; PRD-ACS-009): the open items the reader may act on now,
 * as a named user, by the owner's eligibility rule, or as a holder of a role whose assignment covers the item's
 * facts, each of which `access` answers at this read, so an item drops out as
 * soon as its reader is no longer eligible (11.2, 9.4). Ordered by due time, then exposure, Unknown above known
 * (PRD-MOD-015). Each item names its next action as a code (PRD-UXP-003).
 */
export async function listMyWork(
  context: TransactionContext,
  access: AccessInterface,
  userId: string,
): Promise<{ asOf: string; items: WorkItem[] }> {
  const open = await context.tx.select().from(workItem).where(eq(workItem.open, true));
  const mine = await actableBy(context, access, userId, open);
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
      ...(item.kind === 'exception' ? { nextAction: 'exceptions.open-exception' } : {}),
    })),
  };
}

/**
 * The items, of those given, the user may act on now: as a named user, by the owner's eligibility rule, or as a holder
 * of a role whose assignment covers the item's facts, each of which `access` answers at this read (11.1, 11.2, 12.2).
 * My work lists them; the live-update stream sends an item's changes only to them (code-house-rules 12.12).
 */
export async function actableBy(
  context: TransactionContext,
  access: AccessInterface,
  userId: string,
  items: readonly (typeof workItem.$inferSelect)[],
): Promise<(typeof workItem.$inferSelect)[]> {
  const actors =
    items.length === 0
      ? []
      : await context.tx
          .select()
          .from(workItemActor)
          .where(
            inArray(
              workItemActor.workItemId,
              items.map((item) => item.id),
            ),
          );
  const approvalRequestIds = items
    .filter((item) =>
      actors.some((actor) => actor.workItemId === item.id && actor.eligibility === APPROVAL_ELIGIBILITY),
    )
    .map((item) => item.ownerRecordId);
  const eligible = new Set(await access.eligibleRequests(context, userId, approvalRequestIds));
  // A role actor: its holders whose assignment covers the item's facts may act (12.2; S1-F08-T02).
  const byId = new Map(items.map((item) => [item.id, item]));
  const roleActors = actors.filter((actor) => actor.roleId !== null && byId.has(actor.workItemId));
  const held = await access.rolesHeld(
    context,
    userId,
    roleActors.map((actor) => {
      const item = byId.get(actor.workItemId);
      return {
        roleId: actor.roleId ?? '',
        recordType: item?.ownerRecordType ?? '',
        facts: {
          siteId: item?.siteId ?? undefined,
          storeId: item?.storeId ?? undefined,
          businessUnitId: item?.businessUnitId ?? undefined,
          brandId: item?.brandId ?? undefined,
        },
      };
    }),
  );
  const heldItems = new Set(roleActors.filter((_actor, index) => held[index] === true).map((a) => a.workItemId));
  return items.filter(
    (item) =>
      heldItems.has(item.id) ||
      actors.some(
        (actor) =>
          actor.workItemId === item.id &&
          (actor.userId === userId || (actor.eligibility === APPROVAL_ELIGIBILITY && eligible.has(item.ownerRecordId))),
      ),
  );
}

/**
 * Whether the user may act on one work item, open or closed (access-and-approvals 11.1): the live-update audience of
 * `inbox.work_item` (code-house-rules 12.12). A closed approval item reaches its named and role actors; whoever was
 * eligible to decide it reads My work again at their next read.
 */
export async function mayActOn(
  context: TransactionContext,
  access: AccessInterface,
  userId: string,
  workItemId: string,
): Promise<boolean> {
  const item = await context.tx.select().from(workItem).where(eq(workItem.id, workItemId));
  return (await actableBy(context, access, userId, item)).length > 0;
}

function exposureOf(item: typeof workItem.$inferSelect): Orderable['exposure'] {
  if (item.exposureKind === 'known' && item.exposureAmount !== null) {
    return { kind: 'known', amount: item.exposureAmount };
  }
  return item.exposureKind === 'unknown' ? { kind: 'unknown' } : { kind: 'none' };
}
