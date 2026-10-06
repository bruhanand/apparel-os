import { routes, type Route } from '@apparel-os/schemas';
import { Controller, Inject, Res } from '@nestjs/common';
import {
  ApiRefusal,
  ApiRoute,
  CommandDefect,
  commandAnswer,
  requestContentOf,
  RouteInput,
  type HttpResponse,
  type ReplayAuthorisation,
  type RequestContent,
  type RouteInputOf,
} from '../../../kernel/index.js';
import type { AccessInterface } from '../access.js';
import type { CredentialResets } from '../commands/credential-reset.js';
import type { OwnRequest } from '../commands/own-credentials.js';
import type { Sessions } from '../commands/sessions.js';
import { ACCESS } from '../tokens.js';
import { SignedIn, type SignedInUser } from './authenticate.guard.js';
import { clearedSessionCookieHeader } from './session-cookie.js';

/** The tokens of the session commands the controller calls. */
export const SESSIONS = 'access.Sessions';
export const CREDENTIAL_RESETS = 'access.CredentialResets';

/**
 * Sessions and credential resets (access-and-approvals 3.2, 3.3; code-house-rules 12.1; S1-F01-T09): unlocking and
 * signing out of the session the request came with, revoking one's own sessions or another user's, and resetting
 * another user's credential. The controller holds no rule of its own.
 */
@Controller()
export class SessionsController {
  constructor(
    @Inject(SESSIONS) private readonly sessions: Sessions,
    @Inject(CREDENTIAL_RESETS) private readonly resets: CredentialResets,
    @Inject(ACCESS) private readonly access: AccessInterface,
  ) {}

  @ApiRoute(routes.unlockSession)
  async unlock(@RouteInput() input: RouteInputOf<typeof routes.unlockSession>, @SignedIn() user: SignedInUser) {
    const content = requestContentOf(routes.unlockSession, input);
    const result = await this.sessions.unlock(
      { ...ownRequest(user, 'access.unlock-session', input.idempotencyKey, content), sessionId: user.sessionId },
      input.body.password,
    );
    // The sign-in refusals: one code, no `missing`, but for the setting not set (access-and-approvals 3.1; 12.3).
    if (result.kind === 'attempt-unavailable') {
      throw new ApiRefusal({
        kind: 'unavailable',
        code: 'access.sign-in-unavailable',
        missing: [{ kind: 'setting', setting: result.setting }],
      });
    }
    if (result.kind === 'attempt-refused') throw new ApiRefusal({ kind: 'not-signed-in', code: result.code });
    return commandAnswer(result);
  }

  @ApiRoute(routes.signOut)
  async signOut(
    @RouteInput() input: RouteInputOf<typeof routes.signOut>,
    @SignedIn() user: SignedInUser,
    @Res({ passthrough: true }) response: HttpResponse,
  ) {
    const content = requestContentOf(routes.signOut, input);
    const answer = await this.sessions.signOut({
      ...ownRequest(user, 'access.sign-out', input.idempotencyKey, content),
      sessionId: user.sessionId,
    });
    if (answer.kind === 'success') response.setHeader('Set-Cookie', clearedSessionCookieHeader());
    return commandAnswer(answer);
  }

  @ApiRoute(routes.revokeOwnSessions)
  async revokeOwnSessions(
    @RouteInput() input: RouteInputOf<typeof routes.revokeOwnSessions>,
    @SignedIn() user: SignedInUser,
  ) {
    const content = requestContentOf(routes.revokeOwnSessions, input);
    return commandAnswer(
      await this.sessions.revokeOwn(
        ownRequest(user, 'access.revoke-own-sessions', input.idempotencyKey, content),
        input.body.sessionId,
      ),
    );
  }

  @ApiRoute(routes.revokeUserSessions)
  async revokeUserSessions(
    @RouteInput() input: RouteInputOf<typeof routes.revokeUserSessions>,
    @SignedIn() user: SignedInUser,
  ) {
    const content = requestContentOf(routes.revokeUserSessions, input);
    return commandAnswer(
      await this.sessions.revokeUser(
        ownRequest(user, 'access.revoke-user-sessions', input.idempotencyKey, content),
        this.authorisation(routes.revokeUserSessions, user),
        input.params.userId,
        input.body.sessionId,
      ),
    );
  }

  @ApiRoute(routes.resetCredential)
  async resetCredential(
    @RouteInput() input: RouteInputOf<typeof routes.resetCredential>,
    @SignedIn() user: SignedInUser,
  ) {
    const content = requestContentOf(routes.resetCredential, input);
    return commandAnswer(
      await this.resets.run(
        ownRequest(user, 'access.reset-credential', input.idempotencyKey, content),
        this.authorisation(routes.resetCredential, user),
        {
          userId: input.params.userId,
          reset: input.body.reset,
          temporaryPassword: input.body.temporaryPassword,
          totpCode: input.body.totpCode,
        },
      ),
    );
  }

  /** The assignment Authorise used in the guard, and the same Authorise for a replay (code-house-rules 12.4). */
  private authorisation(route: Route, user: SignedInUser) {
    if (route.access.kind !== 'action' || user.roleAssignmentId === undefined) {
      throw new CommandDefect(`Route ${route.path} acts on another user without Authorise`);
    }
    const need = { actorId: user.userId, action: route.access.action, recordType: route.access.recordType };
    const authoriseReplay: ReplayAuthorisation = async (context) => {
      const authorised = await this.access.authorise(context, need);
      if (authorised.kind === 'allowed') return { kind: 'allowed' };
      return {
        kind: 'refused',
        refusal: { kind: 'not-authorised', code: authorised.refusal.code, missing: authorised.refusal.missing },
      };
    };
    return { roleAssignmentId: user.roleAssignmentId, authoriseReplay };
  }
}

function ownRequest(user: SignedInUser, commandName: string, key: string, content: RequestContent): OwnRequest {
  return {
    request: {
      commandName,
      organisation: user.organisation,
      correlationId: user.correlationId,
      actor: { kind: 'actor', actorId: user.userId },
    },
    userId: user.userId,
    networkAddress: user.networkAddress,
    key,
    content,
  };
}
