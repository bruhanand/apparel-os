import { CommandDefect, type TransactionContext } from '../../../kernel/index.js';

/** A record is written only by a command, never by a read (code-house-rules 8.1). */
export function refuseInRead(context: TransactionContext, what: string): void {
  if (context.readOnly) throw new CommandDefect(`${what} is written by a command, never by a read`);
}

/**
 * The actor of an audit record is the actor the command runs as, when one is set: a record never names someone else
 * as its actor (PRD-ACS-013, PRD-SEC-018). On the paths with no actor (code-house-rules 6.3) the caller names the
 * actor it has just authenticated, such as the user changing their own password.
 */
export function refuseOtherActor(context: TransactionContext, actorId: string): void {
  if (context.actor.kind === 'actor' && context.actor.actorId !== actorId) {
    throw new CommandDefect('An audit record names the actor the command runs as');
  }
}

/** The business date of `at` under the Organisation's timezone, or null, Unknown, while it is not set (PRD-MOD-009). */
export async function businessDateOrUnknown(context: TransactionContext, at: Date): Promise<string | null> {
  const businessDate = await context.businessDate(at);
  return businessDate.kind === 'set' ? businessDate.date : null;
}
