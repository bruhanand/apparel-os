import type { TransactionContext } from '../command-runner/transaction-context.js';
import type { HttpRequest } from '../http/http-types.js';
import type { EventScopeFacts, EventSubject } from '../outbox/event-definition.js';
import type { RoutedOrganisation } from '../routing/organisation-router.js';

// The contracts of live updates and the operations view (code-house-rules 12.12, 12.9; module-map 4.1, section 3
// rule 6; S1-F08-T04). `kernel` cannot read `access`, `inbox` or `exceptions`, so it defines what it asks of them and
// they implement it: the composition hands each implementation over at start.

/** An outbox event as the live-update stream reads it (code-house-rules 12.8 "The row"). */
export interface LiveEvent {
  readonly id: string;
  readonly type: string;
  readonly subject: EventSubject;
  readonly scope: EventScopeFacts;
  /** Identifiers and versions only (12.8); read by the audience and the session check, never sent. */
  readonly payload: unknown;
}

/** The signed-in session of a request that passed Authenticate (access-and-approvals 7.1 step 1). */
export interface SignedInSession {
  readonly organisation: RoutedOrganisation;
  readonly sessionId: string;
  readonly userId: string;
  readonly correlationId: string;
}

/**
 * What the stream and the operations view ask of `access`, which owns sessions and effective grants
 * (access-and-approvals 3.3, 7.2). `access` provides it under SESSION_ACCESS.
 *
 * - `signedInOf`: the session of a request its guard authenticated.
 * - `stillOpen`: whether the session is still In force, within its limits, of an Active user; a read on the
 *   authenticate path that keeps no activity, so a stream never keeps a session from locking (3.3; PRD-SEC-008).
 * - `endsSession`: whether an event revokes the session, so its stream closes at once (12.12).
 * - `mayView`: the default audience, the test row-level security makes: one effective grant of the actor on the
 *   event's subject record type covers the event's scope facts (7.2; PRD-SEC-005). Runs as the actor.
 */
export interface SessionAccess {
  signedInOf(request: HttpRequest): SignedInSession;
  stillOpen(context: TransactionContext, sessionId: string): Promise<boolean>;
  endsSession(event: LiveEvent, sessionId: string): boolean;
  mayView(context: TransactionContext, actorId: string, event: LiveEvent): Promise<boolean>;
}

/** The token of SessionAccess, which `access` provides. */
export const SESSION_ACCESS = 'kernel.SessionAccess';

/**
 * Who may receive an event about a record type whose owner decides it otherwise than by grants: a work item only those
 * who may act on it (access-and-approvals 11.1), an exception also its owner (12.4 "As built"). The owning module
 * registers it with the stream; it runs as the actor, in a read.
 */
export type LiveAudience = (context: TransactionContext, actorId: string, event: LiveEvent) => Promise<boolean>;

/**
 * The unfinished-operation exception raised for each failed job, where one was (access-and-approvals 9.8 step 4;
 * DEC-116). `exceptions` provides it under FAILED_JOB_EXCEPTIONS; read as the operator.
 */
export type FailedJobExceptions = (
  context: TransactionContext,
  jobIds: readonly string[],
) => Promise<ReadonlyMap<string, { readonly exceptionId: string; readonly code: string }>>;

/** The token of FailedJobExceptions. */
export const FAILED_JOB_EXCEPTIONS = 'kernel.FailedJobExceptions';
