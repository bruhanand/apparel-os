import { createHash } from 'node:crypto';
import type { SignInStep } from '@apparel-os/schemas';
import { and, eq } from 'drizzle-orm';
import type { TransactionContext } from '../../../kernel/index.js';
import { session } from '../db/schema.js';
import { credentialState, pendingSteps, userInForce } from './users.js';

/** A request's session, found and in force (access-and-approvals 3.3, 7.1 step 1). */
export interface AuthenticatedSession {
  readonly sessionId: string;
  readonly userId: string;
  readonly displayName: string;
  /** What first sign-in, or sign-in after a reset, still needs; empty once done (access-and-approvals 3.2). */
  readonly pendingSteps: readonly SignInStep[];
}

/** The SHA-256 hash the database keeps of a session identifier (access-and-approvals 3.3). */
export function sessionIdentifierHash(identifier: string): string {
  return createHash('sha256').update(identifier, 'utf8').digest('hex');
}

/**
 * Authenticate (access-and-approvals 7.1 step 1; code-house-rules 6.3): the session whose identifier hash matches, in
 * force, of a user Active on today's date under the Organisation's timezone. Undefined otherwise, which the request
 * answers as not signed in, like a request with no session (access-and-approvals 3.3). Runs with no actor set: it is
 * how the actor is learned. The idle and absolute limits and locking are S1-F01-T09's.
 */
export async function authenticateSession(
  context: TransactionContext,
  identifier: string,
): Promise<AuthenticatedSession | undefined> {
  const today = await context.businessDate();
  // With no timezone, no user has a state in force today, so no session reaches anything (fail-safe).
  if (today.kind === 'not-set') return undefined;
  const rows = await context.tx
    .select({ id: session.id, userId: session.appUserId })
    .from(session)
    .where(and(eq(session.identifierHash, sessionIdentifierHash(identifier)), eq(session.state, 'In force')));
  const found = rows[0];
  if (found === undefined) return undefined;
  const inForce = await userInForce(context, found.userId, today.date);
  if (inForce?.state !== 'Active') return undefined;
  const credentials = await credentialState(context, found.userId);
  return {
    sessionId: found.id,
    userId: found.userId,
    displayName: inForce.displayName,
    pendingSteps: pendingSteps(credentials),
  };
}
