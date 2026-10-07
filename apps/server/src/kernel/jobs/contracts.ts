import type { TransactionContext } from '../command-runner/transaction-context.js';
import type { ReplayAccess, ReplayAccessRefusal } from '../idempotency/contracts.js';

/**
 * The one action on one record type a job step needs (access-and-approvals 7.1: every job step goes through
 * Authorise under its own actor; RR-273). The record type is one the permission registry declares.
 */
export interface JobAuthority {
  readonly action: 'view' | 'create' | 'edit' | 'approve' | 'cancel' | 'export' | 'override';
  readonly recordType: string;
}

/**
 * Authenticate and Authorise for an internal service identity, under which the worker runs a job step or delivers
 * the outbox (access-and-approvals 2.3, 7.1 steps 1 and 3; PRD-SEC-018). `kernel` cannot read `access`, so it defines
 * this contract and `access`, which owns service identities and role assignments, implements it (module-map
 * section 3, rule 6).
 *
 * - `authenticate` runs on the authenticate path, with no actor set (code-house-rules 6.3), and answers the
 *   identity's identifier when the identity is enabled today under the Organisation's timezone, undefined otherwise.
 * - `authorise` answers whether one role assignment of the identity in force today grants the step's action on its
 *   record type (RR-273). It answers a redelivery before it is replayed, in a read-only transaction, taking no lock
 *   (code-house-rules 12.4, CH-14).
 * - `hold` runs first in the step's own transaction, with the identity set as the actor: it finds the assignment as
 *   `authorise` does, takes the step-0 locks (the identity row, the assignment and the role it grants, all shared),
 *   and rechecks under them that the identity is Active, the role's version in force is the one seen before the
 *   locks and the same assignment still grants the action, as `holdAuthority` does for a route's command
 *   (code-house-rules 8.2; DEC-118, RR-360).
 */
export interface JobIdentities {
  authenticate(context: TransactionContext, code: string): Promise<string | undefined>;
  authorise(context: TransactionContext, actorId: string, need: JobAuthority): Promise<ReplayAccess>;
  hold(context: TransactionContext, actorId: string, need: JobAuthority): Promise<JobAuthorityHeld>;
}

/**
 * What `hold` answers: `held` when the step-0 locks are taken and the authority still holds under them; `refused`
 * when it no longer does (kept and never retried); `stale` when a version of the role took effect while the locks
 * were taken, so the step is tried again (code-house-rules 8.2, 12.9; DEC-118, RR-360).
 */
export type JobAuthorityHeld =
  | { readonly kind: 'held' }
  | { readonly kind: 'refused'; readonly refusal: ReplayAccessRefusal }
  | { readonly kind: 'stale' };

/**
 * Thrown by a job step whose authority went stale under its step-0 locks (`hold` answered `stale`). The retry rule
 * retries it: nothing was written, and the next attempt authorises again (code-house-rules 12.9; DEC-118).
 */
export class StaleAuthority extends Error {
  constructor() {
    super('The step’s authority changed while its step-0 locks were taken');
    this.name = 'StaleAuthority';
  }
}

/** The token of the JobIdentities contract. Inject it with @Inject(JOB_IDENTITIES). */
export const JOB_IDENTITIES = 'kernel.JobIdentities';
