import { PT_TYPE } from '@apparel-os/schemas';
import {
  CommandDefect,
  defineConsumer,
  type ConsumerDefinition,
  type TransactionContext,
} from '../../../../kernel/index.js';
import type { PtPostingAnswer, PtPostingPublisher } from '../commands/post-requested.js';
import { ptPostRequested } from '../events.js';

// The posting job of a large PT's approval (goods-in 6.3, 6.6; module-map 6.2 flow E; stock-ledger 10.6;
// access-and-approvals 9.8; code-house-rules 12.8, 12.9; S2-F06-T01): a posting consumer of
// `merchandise.pt-post-requested`, whose delivery goes to the posting queue, one at a time per accounting book (its
// `postingBook`), under its internal service identity on behalf of the approver. Its step calls `merchandise` · PT's
// posting of the request (commands/post-requested.ts). A refusal under the locks is written as the PT's failure and the
// step is done, so the job is never retried for it; only a request gone or answered is kept as the step's refusal.
// **Design choice**: no worker composition registers it yet, so a production composition posts every PT with its
// decision (goods-in 6.6; RR-602); tests compose it with the application's PT.

/** The code of the internal service identity the posting consumer runs as (access-and-approvals 2.3; PRD-SEC-018). */
export const PT_POSTING_IDENTITY = 'merchandise-pt-posting';

/** The PT's posting of a request, as the consumer reaches it: `merchandise` · PT's interface. */
export interface PtPosting {
  postRequested(context: TransactionContext, publisher: PtPostingPublisher, postRequestId: string): Promise<PtPostingAnswer>;
}

/** The posting consumer, with the PT it posts through, bound late; its step runs as its service identity. */
export function ptPostingConsumer(posting: () => PtPosting): ConsumerDefinition {
  return defineConsumer({
    name: 'merchandise.post-pt-approval',
    event: ptPostRequested,
    serviceIdentity: PT_POSTING_IDENTITY,
    authorises: { action: 'edit', recordType: PT_TYPE },
    postingBook: (event) => event.payload.bookId,
    handle: async (context, event) => {
      if (context.actor.kind !== 'actor') throw new CommandDefect('A PT posting step runs with no service identity');
      const answer = await posting().postRequested(
        context,
        { serviceIdentityId: context.actor.actorId },
        event.payload.postRequestId,
      );
      return answer.kind === 'refused' ? { kind: 'refused', refusal: answer.refusal } : { kind: 'done' };
    },
  });
}
