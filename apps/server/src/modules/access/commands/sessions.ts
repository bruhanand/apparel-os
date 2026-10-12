import { uuidv7 } from '@apparel-os/domain';
import type { Secret } from '@apparel-os/schemas';
import { and, eq, inArray, sql } from 'drizzle-orm';
import {
  CommandDefect,
  type CommandOutcome,
  type CommandRefusal,
  type CommandRunner,
  type IdempotencyHelper,
  type IdempotentAnswer,
  type ReplayAuthorisation,
  type TransactionContext,
} from '../../../kernel/index.js';
import type { AuditActor, AuditInterface, AuditScope } from '../../audit/index.js';
import { session, signInFailure } from '../db/schema.js';
import type { OrganisationKeys } from '../domain/organisation-keys.js';
import { verifyPassword } from '../domain/password-hash.js';
import { sessionRevoked } from '../events.js';
import { readSetting } from '../queries/settings.js';
import { attemptSlowed } from '../queries/throttling.js';
import { credentialState, findUser } from '../queries/users.js';
import type { OwnRequest } from './own-credentials.js';

/** Who revokes: a person, through the assignment Authorise used where one was needed, or a service identity. */
export interface Revoker {
  readonly actor: AuditActor;
  readonly roleAssignmentId?: string;
  readonly approvalDecisionId?: string;
  readonly networkAddress?: string;
  /** The place the sessions' audit records are read in, where the revocation has one: a device's Store (4.1). */
  readonly scope?: AuditScope;
}

/**
 * Whose sessions: one of a user's, every one of a user's (access-and-approvals 3.3), or every one bound to a device, of
 * whichever user, when the device is revoked or retired (offline-counter 3.5; S1-F12-T02).
 */
export type RevocationTarget =
  | { readonly userId: string; readonly sessionId?: string }
  | { readonly deviceId: string }
  /** Every session of the Organisation, of every user: after a restore (backup-and-restore 4.4; PRD-SEC-008). */
  | { readonly every: true };

/**
 * Revokes sessions (access-and-approvals 3.3; offline-counter 3.5; PRD-SEC-008): one of a user's, every one of a
 * user's, or every one bound to a device, In force or Locked. Revoked is final, and the next request of a revoked
 * session is not signed in. Joins the caller's transaction, so a credential reset, the decision that disables a user
 * (2.1, 4.3) or a device's end revokes in its own transaction. Writes an audit record per session, with the state it
 * had, and per user one `session-revoked` access record and one `access.session-revoked` event; nothing when no session
 * was there to revoke. Answers the sessions revoked, or undefined when the one named is not the user's or is over.
 */
export async function revokeSessions(
  context: TransactionContext,
  audit: AuditInterface,
  by: Revoker,
  target: RevocationTarget,
  operation: string,
): Promise<string[] | undefined> {
  const whose =
    'every' in target
      ? sql`true`
      : 'deviceId' in target
        ? sql`device_id = ${target.deviceId}`
        : target.sessionId === undefined
          ? sql`app_user_id = ${target.userId}`
          : sql`app_user_id = ${target.userId} and id = ${target.sessionId}`;
  // Each session's state as it is when this transaction holds its row: the locking read waits for a change in progress
  // and answers the row as committed, and the update changes only the rows that read holds, so the audit record's
  // before-value is the state the session really had, In force or Locked. These are the row locks the update always
  // took; no other row is locked here.
  const revoked = await context.tx.execute<{ id: string; userId: string; before: string }>(sql`
    with prior as (
      select id, app_user_id, state from access.session
       where ${whose} and state in ('In force', 'Locked')
       order by id
       for no key update)
    update access.session s set state = 'Revoked'
      from prior
     where s.id = prior.id
    returning s.id as "id", prior.app_user_id as "userId", prior.state as "before"`);
  const rows = [...revoked.rows].sort((a, b) => a.id.localeCompare(b.id));
  if ('userId' in target && target.sessionId !== undefined && rows.length === 0) return undefined;
  const byUser = new Map<string, string[]>();
  for (const row of rows) {
    byUser.set(row.userId, [...(byUser.get(row.userId) ?? []), row.id]);
    await audit.record(context, {
      actor: by.actor,
      ...(by.roleAssignmentId === undefined ? {} : { roleAssignmentId: by.roleAssignmentId }),
      ...(by.approvalDecisionId === undefined ? {} : { approval: { decisionId: by.approvalDecisionId } }),
      ...(by.scope === undefined ? {} : { scope: by.scope }),
      record: { module: 'access', type: 'session', id: row.id },
      operation,
      changes: [{ kind: 'value', field: 'state', before: row.before, after: 'Revoked' }],
      source: { kind: by.actor.kind === 'service-identity' ? 'operator-command' : 'screen' },
    });
  }
  for (const [userId, sessionIds] of [...byUser].sort(([a], [b]) => a.localeCompare(b))) {
    await audit.recordAccess(context, {
      kind: 'session-revoked',
      outcome: 'succeeded',
      userId,
      ...(by.networkAddress === undefined ? {} : { networkAddress: by.networkAddress }),
    });
    await context.publish(sessionRevoked, {
      subject: { module: 'access', recordType: 'user', recordId: userId },
      scope: { subjectUserId: userId },
      payload: { userId, sessionIds },
    });
  }
  return rows.map((row) => row.id);
}

export interface SessionsDependencies {
  readonly runner: CommandRunner;
  readonly helper: IdempotencyHelper;
  readonly audit: AuditInterface;
  readonly keys: OrganisationKeys;
}

/** What an unlock comes to: the command's answer, or an attempt refused before it, which is never kept (3.1). */
export type UnlockResult =
  | IdempotentAnswer<{ outcome: 'unlocked' }>
  | { readonly kind: 'attempt-refused'; readonly code: 'access.sign-in-refused' | 'access.sign-in-slowed' }
  /** A setting the unlock needs is not set (code-house-rules 12.14). */
  | { readonly kind: 'attempt-unavailable'; readonly setting: string };

/** A request on the session it came with. */
export interface SessionRequest extends OwnRequest {
  readonly sessionId: string;
}

/** An `own` route's replay needs Authenticate only, which passed for this request (code-house-rules 12.4). */
const allowed = (): Promise<{ readonly kind: 'allowed' }> => Promise.resolve({ kind: 'allowed' });

function refusal(
  kind: CommandRefusal['kind'],
  code: string,
  causedBySecret: boolean,
  missing: CommandRefusal['missing'] = [],
): { kind: 'refusal'; refusal: CommandRefusal; causedBySecret: boolean } {
  return { kind: 'refusal', refusal: { kind, code, missing }, causedBySecret };
}

/**
 * A user's own sessions (access-and-approvals 3.2, 3.3; PRD-SEC-001, PRD-ACS-017): unlocking the locked session the
 * request came with, signing out of it, and revoking one or all of one's own; and revoking another user's, which the
 * route authorises (`access.session` edit). Each runs under its idempotency key (code-house-rules 12.4).
 */
export class Sessions {
  constructor(private readonly dependencies: SessionsDependencies) {}

  /**
   * Unlocks the session with the same user's password (access-and-approvals 3.3): an attempt to sign in again, so it
   * is throttled by the failures sign-in counts, of the user's login and of the source address, answered with the one
   * sign-in refusal, and recorded as a sign-in attempt either way (3.1; PRD-SEC-007). As at sign-in, it runs in steps
   * with the Argon2 check between transactions: a read, the check, then on success the unlock under its idempotency
   * key, and otherwise the failure and the access record. A wrong or slowed attempt is therefore never kept under
   * the key (12.5), and the password proves presence, so a replay is never compared on it. Nothing typed is kept
   * (PRD-SEC-014).
   */
  async unlock(request: SessionRequest, password: Secret): Promise<UnlockResult> {
    const looked = await this.dependencies.runner.read(request.request, async (context) => {
      const today = await context.businessDate();
      if (today.kind === 'not-set') return { kind: 'unavailable' as const, setting: 'configuration.timezone' };
      const throttling = await readSetting(context, 'access.sign-in-throttling');
      if (throttling.kind === 'not-set') {
        return { kind: 'unavailable' as const, setting: 'access.sign-in-throttling' };
      }
      const user = await findUser(context, request.userId);
      if (user === undefined) throw new CommandDefect('An authenticated user has no user row');
      const loginDigest = this.dependencies.keys.digest(
        request.request.organisation.organisationCode,
        'sign-in-throttling',
        user.login.toLowerCase(),
      );
      const slowed = await attemptSlowed(context, throttling.value, {
        loginDigest,
        networkAddress: request.networkAddress,
      });
      const hash = (await credentialState(context, request.userId)).password?.hash;
      return { kind: 'looked' as const, loginDigest, slowed, hash };
    });
    if (looked.kind === 'unavailable') {
      return { kind: 'attempt-unavailable', setting: looked.setting };
    }
    const passes = !looked.slowed && looked.hash !== undefined && (await verifyPassword(looked.hash, password));
    if (!passes) {
      await this.dependencies.runner.run(request.request, async (context) => {
        // A slowed attempt adds no failure, as at sign-in (3.1); a wrong password does.
        if (!looked.slowed) {
          await context.tx.insert(signInFailure).values({
            id: uuidv7(),
            loginDigest: looked.loginDigest,
            networkAddress: request.networkAddress,
            failedAt: context.startedAt,
          });
        }
        await this.recordAttempt(context, request, 'refused');
      });
      return { kind: 'attempt-refused', code: looked.slowed ? 'access.sign-in-slowed' : 'access.sign-in-refused' };
    }
    return this.dependencies.helper.run(request.request, {
      key: request.key,
      content: request.content,
      authoriseReplay: allowed,
      work: async (context): Promise<CommandOutcome<{ outcome: 'unlocked' }>> => {
        const unlocked = await context.tx
          .update(session)
          .set({ state: 'In force', lastActivityAt: context.startedAt })
          .where(and(eq(session.id, request.sessionId), inArray(session.state, ['In force', 'Locked'])))
          .returning({ id: session.id });
        // Revoked or ended since Authenticate passed: nothing to unlock (3.3).
        if (unlocked.length !== 1) return refusal('refused', 'access.session-not-found', false);
        await this.recordAttempt(context, request, 'succeeded');
        return { kind: 'success', answer: { outcome: 'unlocked' }, shows: 'nothing' };
      },
    });
  }

  /** Signs out: ends the session the request came with, with a `sign-out` access record (access-and-approvals 3.3). */
  async signOut(request: SessionRequest): Promise<IdempotentAnswer<{ outcome: 'signed-out' }>> {
    return this.dependencies.helper.run(request.request, {
      key: request.key,
      content: request.content,
      authoriseReplay: allowed,
      work: async (context): Promise<CommandOutcome<{ outcome: 'signed-out' }>> => {
        await context.tx
          .update(session)
          .set({ state: 'Ended' })
          .where(and(eq(session.id, request.sessionId), inArray(session.state, ['In force', 'Locked'])));
        await this.dependencies.audit.recordAccess(context, {
          kind: 'sign-out',
          outcome: 'succeeded',
          userId: request.userId,
          networkAddress: request.networkAddress,
        });
        return { kind: 'success', answer: { outcome: 'signed-out' }, shows: 'nothing' };
      },
    });
  }

  /** Revokes one or all of the user's own sessions, the current one included (access-and-approvals 3.2, 3.3). */
  revokeOwn(request: OwnRequest, sessionId: string | undefined) {
    return this.revoke(request, { actor: { kind: 'user', id: request.userId } }, request.userId, sessionId, allowed);
  }

  /**
   * Revokes one or all of another user's sessions; the route authorised edit on `access.session` (3.3), and a replay
   * is answered only while that Authorise still passes (code-house-rules 12.4).
   */
  revokeUser(
    request: OwnRequest,
    authorisation: { readonly roleAssignmentId: string; readonly authoriseReplay: ReplayAuthorisation },
    userId: string,
    sessionId: string | undefined,
  ) {
    return this.revoke(
      request,
      { actor: { kind: 'user', id: request.userId }, roleAssignmentId: authorisation.roleAssignmentId },
      userId,
      sessionId,
      authorisation.authoriseReplay,
    );
  }

  private revoke(
    request: OwnRequest,
    by: Revoker,
    userId: string,
    sessionId: string | undefined,
    authoriseReplay: ReplayAuthorisation,
  ): Promise<IdempotentAnswer<{ revokedSessionIds: string[] }>> {
    return this.dependencies.helper.run(request.request, {
      key: request.key,
      content: request.content,
      authoriseReplay,
      work: async (context): Promise<CommandOutcome<{ revokedSessionIds: string[] }>> => {
        if ((await findUser(context, userId)) === undefined) {
          return refusal('not-found', 'access.user-not-found', false);
        }
        const revoked = await revokeSessions(
          context,
          this.dependencies.audit,
          { ...by, networkAddress: request.networkAddress },
          sessionId === undefined ? { userId } : { userId, sessionId },
          'revoke-session',
        );
        if (revoked === undefined) return refusal('not-found', 'access.session-not-found', false);
        return { kind: 'success', answer: { revokedSessionIds: revoked }, shows: 'nothing' };
      },
    });
  }

  private recordAttempt(context: TransactionContext, request: SessionRequest, outcome: 'succeeded' | 'refused') {
    return this.dependencies.audit.recordAccess(context, {
      kind: 'sign-in',
      outcome,
      userId: request.userId,
      networkAddress: request.networkAddress,
    });
  }
}
