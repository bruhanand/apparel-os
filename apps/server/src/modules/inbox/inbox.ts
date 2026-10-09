import { uuidv7 } from '@apparel-os/domain';
import { and, desc, eq } from 'drizzle-orm';
import { CommandDefect, type TransactionContext } from '../../kernel/index.js';
import { workItem, workItemActor, workItemEscalation } from './db/schema.js';
import { announceItems } from './events.js';

// The inbox's interface for the modules that own work (access-and-approvals 11.1, 11.3; module-map 4.8). `exceptions`
// and higher modules call it in their own transaction; `access` publishes through the outbox (module-map section 3,
// rule 6). The inbox keeps only a reference to the owner's record and never reads the owner's tables.

/** The token of the inbox's interface (InboxInterface). Inject it with @Inject(INBOX). */
export const INBOX = 'inbox.Inbox';

/** Who may act on an item: a named user, or the holders of a role whose assignment covers the item's facts (12.2). */
export type ItemActor = { readonly userId: string } | { readonly roleId: string };

/** The owner's record a work item points to: its module, record type, record and version (domain-model 3.3). */
export interface ItemOwner {
  readonly module: string;
  readonly recordType: string;
  readonly recordId: string;
  readonly versionId: string;
}

/** A work item as its owner publishes it (11.1). */
export interface PublishedItem {
  readonly kind: 'task' | 'exception';
  readonly owner: ItemOwner;
  readonly state: string;
  readonly dueAt: Date;
  /** In paise, or Unknown, never Unknown as zero (PRD-MOD-015). */
  readonly exposure: { readonly kind: 'unknown' } | { readonly kind: 'known'; readonly amount: number };
  readonly facts: {
    readonly siteId: string | null;
    readonly storeId: string | null;
    readonly businessUnitId: string | null;
    readonly brandId: string | null;
  };
  readonly actors: readonly ItemActor[];
}

export interface InboxInterface {
  /**
   * Publish a work item (module-map 4.8): keyed by the owner's record, version and kind, so a replay never makes a
   * second item (11.1; PRD-INT-008). Its actors are written only with the item.
   */
  publish(context: TransactionContext, item: PublishedItem): Promise<void>;
  /** Keeps the open items of an owner's record in step with its state (11.1). */
  updateState(context: TransactionContext, module: string, recordId: string, state: string): Promise<void>;
  /** Closes the open items of an owner's record with its state (11.1). */
  close(context: TransactionContext, module: string, recordId: string, state: string): Promise<void>;
  /**
   * Escalate (11.3; PRD-ACS-010): adds the recipient to the open item of the owner's record, keeps every actor it
   * has, and records the escalation. Refuses, as a defect of the owner, a record with no open item.
   */
  escalate(context: TransactionContext, module: string, recordId: string, recipient: ItemActor): Promise<void>;
}

export class Inbox implements InboxInterface {
  async publish(context: TransactionContext, item: PublishedItem): Promise<void> {
    const id = uuidv7();
    const inserted = await context.tx
      .insert(workItem)
      .values({
        id,
        kind: item.kind,
        ownerModule: item.owner.module,
        ownerRecordType: item.owner.recordType,
        ownerRecordId: item.owner.recordId,
        ownerVersionId: item.owner.versionId,
        state: item.state,
        open: true,
        dueAt: item.dueAt,
        exposureKind: item.exposure.kind,
        exposureAmount: item.exposure.kind === 'known' ? item.exposure.amount : null,
        siteId: item.facts.siteId,
        storeId: item.facts.storeId,
        businessUnitId: item.facts.businessUnitId,
        legalEntityId: null,
        brandId: item.facts.brandId,
      })
      .onConflictDoNothing()
      .returning({ id: workItem.id });
    if (inserted.length === 0) return;
    if (item.actors.length > 0) {
      await context.tx.insert(workItemActor).values(item.actors.map((actor) => actorRow(id, actor)));
    }
    await announceItems(context, [id]);
  }

  async updateState(context: TransactionContext, module: string, recordId: string, state: string): Promise<void> {
    const changed = await context.tx
      .update(workItem)
      .set({ state })
      .where(and(eq(workItem.ownerModule, module), eq(workItem.ownerRecordId, recordId), eq(workItem.open, true)))
      .returning({ id: workItem.id });
    await announceItems(
      context,
      changed.map((row) => row.id),
    );
  }

  async close(context: TransactionContext, module: string, recordId: string, state: string): Promise<void> {
    const closed = await context.tx
      .update(workItem)
      .set({ state, open: false })
      .where(and(eq(workItem.ownerModule, module), eq(workItem.ownerRecordId, recordId), eq(workItem.open, true)))
      .returning({ id: workItem.id });
    await announceItems(
      context,
      closed.map((row) => row.id),
    );
  }

  async escalate(context: TransactionContext, module: string, recordId: string, recipient: ItemActor): Promise<void> {
    const item = (
      await context.tx
        .select({ id: workItem.id })
        .from(workItem)
        .where(and(eq(workItem.ownerModule, module), eq(workItem.ownerRecordId, recordId), eq(workItem.open, true)))
        .orderBy(desc(workItem.id))
        .limit(1)
    )[0];
    if (item === undefined) throw new CommandDefect('Escalate names a record with no open work item (11.3)');
    await context.tx.insert(workItemActor).values(actorRow(item.id, recipient));
    await context.tx.insert(workItemEscalation).values({
      id: uuidv7(),
      workItemId: item.id,
      recipientUserId: 'userId' in recipient ? recipient.userId : null,
      recipientRoleId: 'roleId' in recipient ? recipient.roleId : null,
      escalatedAt: context.startedAt,
    });
    await announceItems(context, [item.id]);
  }
}

function actorRow(workItemId: string, actor: ItemActor) {
  return {
    id: uuidv7(),
    workItemId,
    userId: 'userId' in actor ? actor.userId : null,
    eligibility: null,
    roleId: 'roleId' in actor ? actor.roleId : null,
  };
}
