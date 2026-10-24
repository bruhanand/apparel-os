import { permissionRegistry, PT_TYPE } from '@apparel-os/schemas';
import {
  CommandDefect,
  defineConsumer,
  type ConsumerDefinition,
  type JobAuthority,
  type TransactionContext,
} from '../../../../kernel/index.js';
import type { AuditActor } from '../../../audit/index.js';
import type { Outcome, Raised } from '../../../exceptions/index.js';
import type { PtPostingAnswer, PtPostingPublisher } from '../commands/post-requested.js';
import { ptPostingFailed, ptPostRequested } from '../events.js';

// The posting job of a large PT's approval and its follow-up (goods-in 6.3, 6.6; module-map 6.2 flow E; stock-ledger
// 10.6; access-and-approvals 9.8; books-and-posting 10 step 3; code-house-rules 12.8, 12.9; S2-F06-T01, code review 7):
//
// - `merchandise.post-pt-approval`, a posting consumer of `merchandise.pt-post-requested`, whose delivery goes to the
//   posting queue, one at a time per accounting book (its `postingBook`), under its internal service identity on behalf
//   of the approver. Its step calls `merchandise` · PT's posting of the request (commands/post-requested.ts). A refusal
//   under the locks is written as the PT's failure and the step is done, so the job is never retried for it
//   (code-house-rules 12.9); only a request gone or answered is kept as the step's refusal.
// - `merchandise.raise-pt-posting-refused`, a consumer of `merchandise.pt-posting-failed`, which raises the failure's
//   unfinished-operation exception in a step of its own, so the posting's rollback does not lose it (books-and-posting
//   10 step 3; commands/raise-posting-refused.ts). With no Open exception-code series or no routing of the type at the
//   Site it raises nothing and keeps the refusal; the PT still shows Failed with why (DEC-116).
//
// Both run as `merchandise-pt-posting`. The worker composes them with the application's PT (worker.module.ts), and the
// setup step and `add-service-identities` give the identity what the steps declare and what they read (`holds`).

/** The code of the internal service identity the PT's posting consumers run as (access-and-approvals 2.3; PRD-SEC-018). */
export const PT_POSTING_IDENTITY = 'merchandise-pt-posting';

/**
 * What the identity holds besides the actions its steps declare, so row-level security shows it the rows its steps
 * read and write (code-house-rules 6.2; access-and-approvals 2.3): view on the PT, the GRN and its Arrival it covers,
 * and every stock record type the posting reads and writes. **Design choice**: exactly what the posting reads, no
 * more.
 */
export const PT_POSTING_HOLDS: readonly JobAuthority[] = [
  { action: 'view', recordType: PT_TYPE },
  { action: 'view', recordType: 'receiving.arrival' },
  { action: 'view', recordType: 'receiving.grn' },
  ...permissionRegistry
    .filter((declaration) => declaration.code.startsWith('stock.'))
    .map((declaration) => ({ action: 'view' as const, recordType: declaration.code })),
];

/** The PT's posting of a request and its raising of a failure's exception, as the consumers reach them. */
export interface PtPosting {
  postRequested(
    context: TransactionContext,
    publisher: PtPostingPublisher,
    postRequestId: string,
  ): Promise<PtPostingAnswer>;
  raisePostingFailure(context: TransactionContext, raisedBy: AuditActor, failureId: string): Promise<Outcome<Raised>>;
}

function actorIdOf(context: TransactionContext): string {
  if (context.actor.kind !== 'actor') throw new CommandDefect('A PT posting step runs with no service identity');
  return context.actor.actorId;
}

/** The posting consumers, with the PT they post through, bound late; each step runs as the service identity. */
export function ptPostingConsumers(posting: () => PtPosting): readonly ConsumerDefinition[] {
  return [
    defineConsumer({
      name: 'merchandise.post-pt-approval',
      event: ptPostRequested,
      serviceIdentity: PT_POSTING_IDENTITY,
      authorises: { action: 'edit', recordType: PT_TYPE },
      holds: PT_POSTING_HOLDS,
      postingBook: (event) => event.payload.bookId,
      handle: async (context, event) => {
        const answer = await posting().postRequested(
          context,
          { serviceIdentityId: actorIdOf(context) },
          event.payload.postRequestId,
        );
        return answer.kind === 'refused' ? { kind: 'refused', refusal: answer.refusal } : { kind: 'done' };
      },
    }),
    defineConsumer({
      name: 'merchandise.raise-pt-posting-refused',
      event: ptPostingFailed,
      serviceIdentity: PT_POSTING_IDENTITY,
      authorises: { action: 'create', recordType: 'exceptions.exception' },
      holds: PT_POSTING_HOLDS,
      handle: async (context, event) => {
        const raised = await posting().raisePostingFailure(
          context,
          { kind: 'service-identity', id: actorIdOf(context), ...onBehalfOf(event.onBehalfOfUserId) },
          event.payload.failureId,
        );
        return raised.kind === 'done' ? { kind: 'done' } : { kind: 'refused', refusal: raised.refusal };
      },
    }),
  ];
}

const onBehalfOf = (userId: string | null) => (userId === null ? {} : { onBehalfOfUserId: userId });
