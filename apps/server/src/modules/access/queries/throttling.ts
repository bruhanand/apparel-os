import { and, count, eq, gte, sql } from 'drizzle-orm';
import type { TransactionContext } from '../../../kernel/index.js';
import { signInFailure } from '../db/schema.js';
import { isSlowed, type SignInThrottling } from '../domain/sign-in-rules.js';

/**
 * Whether an attempt to present a password is slowed (access-and-approvals 3.1; DEC-116): the failed sign-ins of the
 * typed login, by its keyed digest, or of the source address, within the throttling window, reached the limit.
 * Sign-in and the unlock of a locked session count the same failures (3.3; S1-F01-T09).
 */
export async function attemptSlowed(
  context: TransactionContext,
  throttling: SignInThrottling,
  attempt: { readonly loginDigest: string; readonly networkAddress: string },
): Promise<boolean> {
  const since = new Date(context.startedAt.getTime() - throttling.windowSeconds * 1000);
  const [byLogin] = await context.tx
    .select({ failures: count() })
    .from(signInFailure)
    .where(and(eq(signInFailure.loginDigest, attempt.loginDigest), gte(signInFailure.failedAt, since)));
  const [byAddress] = await context.tx
    .select({ failures: count() })
    .from(signInFailure)
    .where(
      and(sql`${signInFailure.networkAddress} = ${attempt.networkAddress}::inet`, gte(signInFailure.failedAt, since)),
    );
  return isSlowed(throttling, { byLogin: byLogin?.failures ?? 0, byAddress: byAddress?.failures ?? 0 });
}
