import { and, eq, inArray } from 'drizzle-orm';
import type { CommandRunner, OrganisationRouter, SessionProbe } from '../../../kernel/index.js';
import { session } from '../db/schema.js';
import { sessionCookieOf } from '../http/session-cookie.js';
import { sessionIdentifierHash } from './authenticate-session.js';

const OPEN_STATES = ['In force', 'Locked'];

/**
 * Whether the cookie names a session that is open (In force or Locked), and nothing more (access-and-approvals 3.3,
 * 7.1 step 1). It reads only: it keeps no activity and ends nothing, and it does not replace Authenticate, which
 * still runs in full on the route. The kernel asks it before it holds a request body larger than the ordinary limit,
 * so a caller who is not signed in cannot make the server hold one (imports-and-opening-data 9.3). Any failure is
 * "no".
 */
export function sessionProbe(router: OrganisationRouter, runner: CommandRunner): SessionProbe {
  return async (cookieHeader, correlationId) => {
    const routed = await router.resolveFromSessionCookie(sessionCookieOf(cookieHeader));
    if (!routed.routed) return false;
    const found = await runner.read(
      {
        commandName: 'access.probe-session',
        organisation: routed.organisation,
        correlationId,
        actor: { kind: 'no-actor', path: 'authenticate' },
      },
      (context) =>
        context.tx
          .select({ id: session.id })
          .from(session)
          .where(
            and(
              eq(session.identifierHash, sessionIdentifierHash(routed.sessionIdentifier)),
              inArray(session.state, OPEN_STATES),
            ),
          ),
    );
    return found.length > 0;
  };
}
