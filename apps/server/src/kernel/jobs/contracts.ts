import type { TransactionContext } from '../command-runner/transaction-context.js';
import type { ReplayAccess } from '../idempotency/contracts.js';

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
 * - `authorise` runs in the step's own transaction, with the identity set as the actor, and answers whether one role
 *   assignment of the identity in force today grants the step's action on its record type (RR-273). The same check
 *   answers a redelivery before it is replayed (code-house-rules 12.4, CH-14).
 */
export interface JobIdentities {
  authenticate(context: TransactionContext, code: string): Promise<string | undefined>;
  authorise(context: TransactionContext, actorId: string, need: JobAuthority): Promise<ReplayAccess>;
}

/** The token of the JobIdentities contract. Inject it with @Inject(JOB_IDENTITIES). */
export const JOB_IDENTITIES = 'kernel.JobIdentities';
