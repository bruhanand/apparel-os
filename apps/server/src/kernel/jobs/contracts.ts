import type { TransactionContext } from '../command-runner/transaction-context.js';

/**
 * Authenticate for an internal service identity, under which the worker runs a job step or delivers the outbox
 * (access-and-approvals 2.3, 7.1 step 1; PRD-SEC-018). `kernel` cannot read `access`, so it defines this contract and
 * `access`, which owns service identities, implements it (module-map section 3, rule 6). It runs on the
 * authenticate path, with no actor set (code-house-rules 6.3), and answers the identity's identifier when the
 * identity is enabled today under the Organisation's timezone, undefined otherwise.
 */
export interface JobIdentities {
  authenticate(context: TransactionContext, code: string): Promise<string | undefined>;
}

/** The token of the JobIdentities contract. Inject it with @Inject(JOB_IDENTITIES). */
export const JOB_IDENTITIES = 'kernel.JobIdentities';
