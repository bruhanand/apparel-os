import { uuidv7 } from '@apparel-os/domain';
import { and, eq } from 'drizzle-orm';
import { defineConsumer, type ConsumerDefinition, type TransactionContext } from '../../../kernel/index.js';
import { approvalDecided, approvalRequested } from '../../access/index.js';
import { workItem, workItemActor } from '../db/schema.js';

/**
 * The code of the internal service identity the inbox's consumers run as (access-and-approvals 2.3; PRD-SEC-018). The
 * setup step writes it with the Organisation's other service identities and a role assignment granting edit on
 * `inbox.work_item` (S1-F01-T10; RR-322).
 */
export const INBOX_IDENTITY = 'inbox';

/** The eligibility reference of an approval item: `access` answers who may decide it when My work is read (11.2). */
export const APPROVAL_ELIGIBILITY = 'access.approval-request';

const AUTHORITY = { action: 'edit', recordType: 'inbox.work_item' } as const;

/**
 * Adds a work item once: keyed by the owner's record, version and kind, so a replayed or redelivered event never makes
 * a second item (access-and-approvals 11.1; PRD-INT-008). Its actors are written only with the item. The due time
 * stays unset: task and approval routing has no rows and its rule's format is not designed yet (RR-058), so no due
 * time is ever defaulted.
 */
async function publishItem(
  context: TransactionContext,
  item: {
    readonly kind: 'task' | 'approval';
    readonly owner: { recordType: string; recordId: string; versionId: string };
    readonly state: string;
    readonly actors: readonly ({ userId: string } | { eligibility: string })[];
  },
): Promise<void> {
  const id = uuidv7();
  const inserted = await context.tx
    .insert(workItem)
    .values({
      id,
      kind: item.kind,
      ownerModule: 'access',
      ownerRecordType: item.owner.recordType,
      ownerRecordId: item.owner.recordId,
      ownerVersionId: item.owner.versionId,
      state: item.state,
      open: true,
      dueAt: null,
      exposureKind: 'none',
      exposureAmount: null,
      siteId: null,
      storeId: null,
      businessUnitId: null,
      legalEntityId: null,
      brandId: null,
    })
    .onConflictDoNothing()
    .returning({ id: workItem.id });
  if (inserted.length === 0 || item.actors.length === 0) return;
  await context.tx.insert(workItemActor).values(
    item.actors.map((actor) => ({
      id: uuidv7(),
      workItemId: id,
      userId: 'userId' in actor ? actor.userId : null,
      eligibility: 'eligibility' in actor ? actor.eligibility : null,
    })),
  );
}

/** Closes the open items of an owner's record, of one kind, with the owner's new state (11.1). */
async function closeItems(
  context: TransactionContext,
  kind: 'task' | 'approval',
  ownerRecordId: string,
  state: string,
): Promise<void> {
  await context.tx
    .update(workItem)
    .set({ state, open: false })
    .where(
      and(
        eq(workItem.ownerModule, 'access'),
        eq(workItem.ownerRecordId, ownerRecordId),
        eq(workItem.kind, kind),
        eq(workItem.open, true),
      ),
    );
}

/**
 * The inbox's consumers of `access` events (access-and-approvals 9.1, 9.5, 11.1; module-map 4.8, section 8). An open
 * approval request becomes an approval item that whoever may decide it sees (11.2); its decision, supersession or
 * withdrawal closes the item. A rejection returns the document to its preparers through its Rejected state; a task for
 * them in My work waits for a rule that closes it (RR-323). Each runs under the `inbox` identity, authorised for edit
 * on `inbox.work_item` (RR-273).
 */
export const inboxConsumers: readonly ConsumerDefinition[] = [
  defineConsumer({
    name: 'inbox.publish-approval',
    event: approvalRequested,
    serviceIdentity: INBOX_IDENTITY,
    authorises: AUTHORITY,
    handle: async (context, event) => {
      const payload = event.payload;
      await publishItem(context, {
        kind: 'approval',
        owner: {
          recordType: 'access.approval_request',
          recordId: payload.requestId,
          versionId: payload.documentVersionId,
        },
        state: 'Awaiting approval',
        actors: [{ eligibility: APPROVAL_ELIGIBILITY }],
      });
      return { kind: 'done' };
    },
  }),
  defineConsumer({
    name: 'inbox.close-approval',
    event: approvalDecided,
    serviceIdentity: INBOX_IDENTITY,
    authorises: AUTHORITY,
    handle: async (context, event) => {
      await closeItems(context, 'approval', event.payload.requestId, event.payload.state);
      return { kind: 'done' };
    },
  }),
];
