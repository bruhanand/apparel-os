import { sql } from 'drizzle-orm';
import {
  CommandDefect,
  type LiveEvent,
  type SessionAccess,
  type SignedInSession,
  type TransactionContext,
} from '../../../kernel/index.js';
import { sessionStillOpen } from '../commands/authenticate-session.js';
import { sessionRevoked } from '../events.js';
import { signedInOf } from '../http/authenticate.guard.js';

/**
 * What `kernel`'s live-update stream and operations view ask of `access` (code-house-rules 12.12; access-and-approvals
 * 3.3, 7.2; module-map section 3, rule 6; S1-F08-T04), provided under SESSION_ACCESS.
 *
 * - The signed-in session of a request this module's guard authenticated.
 * - Whether the session is still open, at each heartbeat: In force, within its limits, of an Active user.
 * - Whether an event revokes it: `access.session-revoked` naming it (PRD-SEC-008).
 * - The default audience: the test row-level security makes, `access.row_visible`, one effective grant of the actor on
 *   the subject's record type, in force today, covering the event's scope facts (7.2; PRD-SEC-005). A fact the
 *   event does not carry is Unknown, covered only by all-members scope (PRD-MOD-015).
 */
export const sessionAccess: SessionAccess = {
  signedInOf(request): SignedInSession {
    const user = signedInOf(request);
    if (user === undefined) throw new CommandDefect('The live stream read the session without Authenticate');
    return {
      organisation: user.organisation,
      sessionId: user.sessionId,
      userId: user.userId,
      correlationId: user.correlationId,
    };
  },
  stillOpen: (context: TransactionContext, sessionId: string) => sessionStillOpen(context, sessionId),
  endsSession(event: LiveEvent, sessionId: string): boolean {
    if (event.type !== sessionRevoked.type) return false;
    const payload = sessionRevoked.payload.safeParse(event.payload);
    return payload.success && payload.data.sessionIds.includes(sessionId);
  },
  async mayView(context: TransactionContext, actorId: string, event: LiveEvent): Promise<boolean> {
    if (context.actor.kind !== 'actor' || context.actor.actorId !== actorId) {
      throw new CommandDefect('The live audience runs as the actor it answers for');
    }
    const facts = event.scope;
    const rows = await context.tx.execute<{ visible: boolean }>(
      sql`select access.row_visible(${event.subject.recordType}, ${facts.siteId ?? null}::uuid, ${facts.storeId ?? null}::uuid,
        ${facts.businessUnitId ?? null}::uuid, ${facts.legalEntityId ?? null}::uuid, ${facts.brandId ?? null}::uuid,
        ${facts.subjectUserId ?? null}::uuid) as visible`,
    );
    return rows.rows[0]?.visible === true;
  },
};
