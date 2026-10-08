import type { Database } from '../db/create-db.js';
import type { EventDefinition, PublishedEvent } from '../outbox/event-definition.js';
import type { LockMode, LockResult, LockStep, LockTable, LockTarget } from './lock-helper.js';

/** The command's one database transaction, as Drizzle gives it. Modules read and write through it (code-house-rules 3.4). */
export type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];

/**
 * The paths that run with no actor set (code-house-rules 6.3): authenticating a request or a job step, sign-in with
 * a user's actions on their own credentials and sessions, and the setup step of a new Organisation until it acts
 * under its service identity. Every other query runs after the actor is set.
 */
export type NoActorPath = 'authenticate' | 'sign-in' | 'setup';

/**
 * Who a command runs as. An actor is a user or a service identity that Authenticate has found (access-and-approvals
 * 7.1 step 1; PRD-SEC-018); the runner sets it for row-level security and never checks it itself. No actor is
 * allowed only on the paths of 6.3, named so that each such command says which one it is.
 */
export type ActorSetting =
  { readonly kind: 'actor'; readonly actorId: string } | { readonly kind: 'no-actor'; readonly path: NoActorPath };

/**
 * The business date a command acts on, under the Organisation's timezone (code-house-rules 9; PRD-MOD-009), with
 * the timezone and the identifier of the setting version it came from, which the command stores (code-house-rules
 * 7.3; PRD-MOD-010). "not-set" when the Organisation has no timezone yet: an operation that needs a business date is
 * then unavailable (PRD-SEC-017), and the command refuses it.
 */
export type BusinessDate =
  | { readonly kind: 'set'; readonly date: string; readonly timezone: string; readonly timezoneVersionId: string }
  | { readonly kind: 'not-set' };

/**
 * The command's transaction context (code-house-rules 8.1). Every interface operation that reads or writes takes it
 * as its first argument; there is no hidden ambient transaction. A called module joins this transaction and never
 * opens or commits its own (PRD-MOD-006, PRD-INT-004; module-map section 3, rule 3).
 */
export interface TransactionContext {
  /** The command's name, for logs; later also the operation of its idempotency key (code-house-rules 12.4). */
  readonly commandName: string;
  readonly organisationCode: string;
  /** The request's or job's correlation identifier (code-house-rules 12.11). */
  readonly correlationId: string;
  readonly actor: ActorSetting;
  /** A read runs in a READ ONLY transaction (code-house-rules 8.1, 12.1). */
  readonly readOnly: boolean;
  /** When the command started, by the kernel's clock: the event time of an online action (code-house-rules 9). */
  readonly startedAt: Date;
  /** The transaction. Usable only while the command runs. */
  readonly tx: Transaction;
  /**
   * Locks the rows of one step of stock-ledger 10.3, from every table the step covers, in ascending identifier order
   * (code-house-rules 8.2; PRD-INT-003). Read every fact the command rechecks after this returns (code-house-rules 8.1).
   */
  lock(step: LockStep, targets: readonly LockTarget[]): Promise<LockResult>;
  /**
   * The lock this command holds on a row through `lock`, with its step and mode, or undefined when it took none. A
   * module that draws only on rows the command has locked, such as `numbering`'s Allocate on a series it holds
   * (numbering-and-audit 3.2; code-house-rules 8.2), asks here.
   */
  heldLock(table: LockTable, id: string): { readonly step: LockStep; readonly mode: LockMode } | undefined;
  /** The business date of `at`, by default the command's start, under the Organisation's timezone (PRD-MOD-009). */
  businessDate(at?: Date): Promise<BusinessDate>;
  /**
   * Saves an event in this transaction's outbox, with the context's actor and correlation identifier
   * (code-house-rules 12.8; PRD-MOD-006, PRD-INT-004): it commits with the command's other writes, or none do.
   * Refused in a read. Returns the event's identity.
   */
  publish<Payload extends Record<string, unknown>>(
    definition: EventDefinition<Payload>,
    event: PublishedEvent<Payload>,
  ): Promise<string>;
}
