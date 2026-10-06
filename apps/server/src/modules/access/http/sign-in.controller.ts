import { routes } from '@apparel-os/schemas';
import { Controller, Inject, Req, Res } from '@nestjs/common';
import {
  ApiRefusal,
  ApiRoute,
  commandAnswer,
  correlationIdOf,
  newCorrelationId,
  ORGANISATION_ROUTER,
  requestContentOf,
  RouteInput,
  type HttpRequest,
  type HttpResponse,
  type OrganisationRouter,
  type RouteInputOf,
} from '../../../kernel/index.js';
import type { OwnCredentials } from '../commands/own-credentials.js';
import type { SignIn } from '../commands/sign-in.js';
import { verifyPassword } from '../domain/password-hash.js';
import { networkAddressOf, SignedIn, type SignedInUser } from './authenticate.guard.js';
import { sessionCookieHeader } from './session-cookie.js';

/** The tokens of the access commands the controller calls. */
export const SIGN_IN = 'access.SignIn';
export const OWN_CREDENTIALS = 'access.OwnCredentials';
export const UNKNOWABLE_HASH = 'access.UnknowableHash';

/**
 * Sign-in, the session read, enrolment and the own password change (access-and-approvals 3.1 to 3.3; code-house-rules
 * 12.1). The controller holds no rule of its own: it routes, calls the command, sets the cookie and answers.
 */
@Controller()
export class SignInController {
  constructor(
    @Inject(ORGANISATION_ROUTER) private readonly router: OrganisationRouter,
    @Inject(SIGN_IN) private readonly signIn: SignIn,
    @Inject(OWN_CREDENTIALS) private readonly credentials: OwnCredentials,
    @Inject(UNKNOWABLE_HASH) private readonly unknowableHash: () => Promise<string>,
  ) {}

  @ApiRoute(routes.signIn)
  async signInRoute(
    @RouteInput() input: RouteInputOf<typeof routes.signIn>,
    @Req() request: HttpRequest,
    @Res({ passthrough: true }) response: HttpResponse,
  ) {
    const routed = await this.router.resolveForSignIn(input.body.organisationCode);
    if (!routed.routed) {
      // An unknown Organisation costs one Argon2 check too, so its refusal takes as long as any other (DEC-116).
      await verifyPassword(await this.unknowableHash(), input.body.password);
      throw refused();
    }
    const result = await this.signIn.run({
      organisation: routed.organisation,
      correlationId: correlationIdOf(request) ?? newCorrelationId(),
      networkAddress: networkAddressOf(request),
      login: input.body.login,
      password: input.body.password,
      totpCode: input.body.totpCode,
    });
    switch (result.kind) {
      case 'refused':
        throw refused();
      case 'slowed':
        throw new ApiRefusal({ kind: 'not-signed-in', code: 'access.sign-in-slowed' });
      case 'unavailable':
        throw new ApiRefusal({ kind: 'unavailable', code: 'access.sign-in-unavailable', missing: result.missing });
      case 'signed-in':
        // A new sign-in replaces the browser's cookie; the earlier session, in any Organisation, is not ended (3.3).
        response.setHeader(
          'Set-Cookie',
          sessionCookieHeader(routed.organisation.organisationCode, result.sessionIdentifier),
        );
        return result.outcome;
    }
  }

  @ApiRoute(routes.session)
  session(@SignedIn() user: SignedInUser) {
    return {
      organisationCode: user.organisation.organisationCode,
      userId: user.userId,
      displayName: user.displayName,
    };
  }

  @ApiRoute(routes.startEnrolment)
  async startEnrolment(
    @RouteInput() input: RouteInputOf<typeof routes.startEnrolment>,
    @SignedIn() user: SignedInUser,
  ) {
    const { answer, shown } = await this.credentials.startEnrolment(
      ownRequest(user, 'access.start-enrolment', input.idempotencyKey, requestContentOf(routes.startEnrolment, input)),
    );
    // The secret travels only in this answer, encoded by the route's schema at that one place (12.6).
    if (answer.kind === 'success' && shown !== undefined) return shown;
    return commandAnswer(answer);
  }

  @ApiRoute(routes.confirmEnrolment)
  async confirmEnrolment(
    @RouteInput() input: RouteInputOf<typeof routes.confirmEnrolment>,
    @SignedIn() user: SignedInUser,
  ) {
    return commandAnswer(
      await this.credentials.confirmEnrolment(
        ownRequest(
          user,
          'access.confirm-enrolment',
          input.idempotencyKey,
          requestContentOf(routes.confirmEnrolment, input),
        ),
        input.body.totpCode,
      ),
    );
  }

  @ApiRoute(routes.changePassword)
  async changePassword(
    @RouteInput() input: RouteInputOf<typeof routes.changePassword>,
    @SignedIn() user: SignedInUser,
  ) {
    return commandAnswer(
      await this.credentials.changePassword(
        ownRequest(
          user,
          'access.change-password',
          input.idempotencyKey,
          requestContentOf(routes.changePassword, input),
        ),
        input.body,
      ),
    );
  }
}

/** The one refusal of sign-in: names no part and carries no `missing` (access-and-approvals 3.1; 12.3). */
function refused(): ApiRefusal {
  return new ApiRefusal({ kind: 'not-signed-in', code: 'access.sign-in-refused' });
}

function ownRequest(
  user: SignedInUser,
  commandName: string,
  key: string,
  content: ReturnType<typeof requestContentOf>,
) {
  return {
    request: {
      commandName,
      organisation: user.organisation,
      correlationId: user.correlationId,
      actor: { kind: 'actor', actorId: user.userId } as const,
    },
    userId: user.userId,
    networkAddress: user.networkAddress,
    key,
    content,
  };
}
