import type { ExceptionExposure, ExceptionParty } from '@apparel-os/schemas';
import type { TransactionContext } from '../../../kernel/index.js';
import type { InboxInterface, ItemActor } from '../../inbox/index.js';
import { EXCEPTION_RECORD_TYPE } from '../domain/types.js';
import type { ExceptionFacts } from './raise.js';

// The exception's item in My work (access-and-approvals 11.1, 12.3; module-map 4.8). `exceptions` calls `inbox` in its
// own transaction. The item's version is the event that gave the exception its owner (raised, assigned, reopened), so
// a reassignment closes the item and publishes the next one, and a replay never makes a second (PRD-INT-008).

export function actorOf(party: ExceptionParty): ItemActor {
  return party.kind === 'user' ? { userId: party.userId } : { roleId: party.roleId };
}

export async function publishItem(
  context: TransactionContext,
  inbox: InboxInterface,
  item: {
    readonly exceptionId: string;
    readonly versionId: string;
    readonly state: string;
    readonly dueAt: Date;
    readonly exposure: ExceptionExposure;
    readonly facts: ExceptionFacts;
    readonly actors: readonly ExceptionParty[];
  },
): Promise<void> {
  await inbox.publish(context, {
    kind: 'exception',
    owner: {
      module: 'exceptions',
      recordType: EXCEPTION_RECORD_TYPE,
      recordId: item.exceptionId,
      versionId: item.versionId,
    },
    state: item.state,
    dueAt: item.dueAt,
    exposure: item.exposure,
    facts: item.facts,
    actors: item.actors.map(actorOf),
  });
}
