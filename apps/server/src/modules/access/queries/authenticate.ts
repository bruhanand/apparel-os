import { createHash } from 'node:crypto';
import type { SignInStep } from '@apparel-os/schemas';
import { and, eq, inArray } from 'drizzle-orm';
import type { TransactionContext } from '../../../kernel/index.js';
import type { AuditInterface } from '../../audit/index.js';
import { session } from '../db/schema.js';
import { sessionLimitReached } from '../domain/sign-in-rules.js';
import { readSetting } from './settings.js';
import { credentialState, pendingSteps, userInForce } from './users.js';

/** A request's session, found and in force or locked (access-and-approvals 3.3, 7.1 step 1). */
export interface AuthenticatedSession {
  readonly sessionId: string;
  readonly userId: string;
  readonly displayName: string;
  /** What first sign-in, or sign-in after a reset, still needs; empty once done (access-and-approvals 3.2). */
  readonly pendingSteps: readonly SignInStep[];
}

/**
 * What Authenticate makes of a request's session (access-and-approvals 3.3, 7.1 step 1): in force; locked, so it
 * reaches only the unlock and sign-out; or not signed in, whatever was wrong (no such session, ended, revoked, a user
 * not Active, no limits set), so the answer says nothing more (PRD-SEC-014).
 */
export type AuthenticateResult =
  | { readonly kind: 'in-force'; readonly session: AuthenticatedSession }
  | { readonly kind: 'locked'; readonly session: AuthenticatedSession }
  | { readonly kind: 'not-signed-in' };

/** The SHA-256 hash the database keeps of a session identifier (access-and-approvals 3.3). */
export function sessionIdentifierHash(identifier: string): string {
  return createHash('sha256').update(identifier, 'utf8').digest('hex');
}

const NOT_SIGNED_IN: AuthenticateResult = { kind: 'not-signed-in' };

/**
 * Authenticate (access-and-approvals 3.3, 7.1 step 1; code-house-rules 6.3): the session whose identifier hash
 * matches, In force or Locked, of a user Active on today's date under the Organisation's timezone, within its limits.
 * Runs with no actor set, since it is how the actor is learned, and writes, so it runs as a command of its own before
 * the request's (S1-F01-T09):
 *
 * - Past its absolute limit, locked or not, the session ends here, with a `session-ended` access record (PRD-ACS-017).
 * - Past its idle limit since its last activity, an In force session locks here, with a `session-locked` access
 *   record, and stays Locked until the same user unlocks it with their password (3.3).
 * - Otherwise the request is its activity: the last activity moves to now.
 *
 * The limits are the settings of the session's kind in force today (POL-02.18). With none set, no session is kept
 * (fail-safe; code-house-rules 12.14). Only the office kind has a setting yet; a shared POS session needs a registered
 * device (S1-F12, RR-303). The session row is locked for the change, so two requests at once agree.
 */
export async function authenticateSession(
  context: TransactionContext,
  audit: AuditInterface,
  identifier: string,
  networkAddress: string,
): Promise<AuthenticateResult> {
  const today = await context.businessDate();
  // With no timezone, no user has a state in force today, so no session reaches anything (fail-safe).
  if (today.kind === 'not-set') return NOT_SIGNED_IN;
  const [found] = await context.tx
    .select({
      id: session.id,
      userId: session.appUserId,
      kind: session.kind,
      state: session.state,
      startedAt: session.startedAt,
      lastActivityAt: session.lastActivityAt,
    })
    .from(session)
    .where(
      and(
        eq(session.identifierHash, sessionIdentifierHash(identifier)),
        inArray(session.state, ['In force', 'Locked']),
      ),
    )
    .for('update');
  if (found === undefined) return NOT_SIGNED_IN;
  if (found.kind !== 'office') return NOT_SIGNED_IN;
  const limits = await readSetting(context, 'access.office-session-limits', today.date);
  if (limits.kind === 'not-set') return NOT_SIGNED_IN;
  const now = context.startedAt;
  const reached = sessionLimitReached(limits.value, found, now);
  const record = (kind: 'session-ended' | 'session-locked') =>
    audit.recordAccess(context, { kind, outcome: 'succeeded', userId: found.userId, networkAddress });
  if (reached === 'absolute') {
    await context.tx.update(session).set({ state: 'Ended' }).where(eq(session.id, found.id));
    await record('session-ended');
    return NOT_SIGNED_IN;
  }
  const inForce = await userInForce(context, found.userId, today.date);
  if (inForce?.state !== 'Active') return NOT_SIGNED_IN;
  const authenticated: AuthenticatedSession = {
    sessionId: found.id,
    userId: found.userId,
    displayName: inForce.displayName,
    pendingSteps: pendingSteps(await credentialState(context, found.userId)),
  };
  if (found.state === 'Locked') return { kind: 'locked', session: authenticated };
  if (reached === 'idle') {
    await context.tx.update(session).set({ state: 'Locked' }).where(eq(session.id, found.id));
    await record('session-locked');
    return { kind: 'locked', session: authenticated };
  }
  if (now > found.lastActivityAt) {
    await context.tx.update(session).set({ lastActivityAt: now }).where(eq(session.id, found.id));
  }
  return { kind: 'in-force', session: authenticated };
}
