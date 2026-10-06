import type { MissingItem, Route, SignInStep } from '@apparel-os/schemas';
import { createParamDecorator, Inject, Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  ApiRefusal,
  COMMAND_RUNNER,
  CommandDefect,
  correlationIdOf,
  newCorrelationId,
  ORGANISATION_ROUTER,
  ROUTE_METADATA,
  type CommandRunner,
  type HttpRequest,
  type OrganisationRouter,
  type RoutedOrganisation,
} from '../../../kernel/index.js';
import { authenticateSession } from '../queries/authenticate.js';
import { sessionCookieOf } from './session-cookie.js';

/** The signed-in user of a request that passed Authenticate (access-and-approvals 7.1 step 1). */
export interface SignedInUser {
  readonly organisation: RoutedOrganisation;
  readonly sessionId: string;
  readonly userId: string;
  readonly displayName: string;
  readonly correlationId: string;
  /** The source address, through the proxies trusted (numbering-and-audit 5.2). */
  readonly networkAddress: string;
}

const signedIn = new WeakMap<object, SignedInUser>();

/** The signed-in user of the request, for an `own` or `action` route. */
export const SignedIn = createParamDecorator((_data: unknown, context: ExecutionContext): SignedInUser => {
  const user = signedIn.get(context.switchToHttp().getRequest<object>());
  if (user === undefined) throw new CommandDefect('A route read the signed-in user without Authenticate');
  return user;
});

/** The source address of a request (Express's `ip` through the proxies trusted, else the socket's peer). */
export function networkAddressOf(request: HttpRequest): string {
  const address = request.ip ?? request.socket.remoteAddress;
  if (address === undefined) throw new CommandDefect('A request has no source address');
  return address;
}

/**
 * Authenticate for every route that needs it (access-and-approvals 7.1 step 1; code-house-rules 12.1 "Access on
 * every route"; PRD-INT-001). A `public` route passes. Any other finds the Organisation from the code in the session
 * cookie, then the session there by its identifier's hash, in force, of an Active user; otherwise
 * `access.not-signed-in`, the same answer whatever was wrong, with nothing of the cookie logged (3.3; PRD-SEC-014).
 *
 * Until enrolment and the password change are done, the session reaches only the `own` routes of the first step
 * still to do; anything else is `access.sign-in-incomplete`, naming the steps left (3.2). An `action` route is
 * refused as a defect until Authorise exists (S1-F01-T11): no route of the table declares one yet.
 */
@Injectable()
export class AuthenticateGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(ORGANISATION_ROUTER) private readonly router: OrganisationRouter,
    @Inject(COMMAND_RUNNER) private readonly runner: CommandRunner,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const route = this.reflector.get<Route | undefined>(ROUTE_METADATA, context.getHandler());
    if (route === undefined || route.access.kind === 'public') return true;
    const request = context.switchToHttp().getRequest<HttpRequest>();
    const correlationId = correlationIdOf(request) ?? newCorrelationId();
    const routed = await this.router.resolveFromSessionCookie(sessionCookieOf(request.headers.cookie));
    if (!routed.routed) throw notSignedIn();
    const found = await this.runner.read(
      {
        commandName: 'access.authenticate',
        organisation: routed.organisation,
        correlationId,
        actor: { kind: 'no-actor', path: 'authenticate' },
      },
      (transaction) => authenticateSession(transaction, routed.sessionIdentifier),
    );
    if (found === undefined) throw notSignedIn();
    const [next] = found.pendingSteps;
    if (next !== undefined && !(route.access.kind === 'own' && route.access.signInStep === next)) {
      throw incomplete(found.pendingSteps);
    }
    if (route.access.kind === 'action') {
      throw new CommandDefect('An action route needs Authorise, which S1-F01-T11 builds (access-and-approvals 7.1)');
    }
    signedIn.set(request, {
      organisation: routed.organisation,
      sessionId: found.sessionId,
      userId: found.userId,
      displayName: found.displayName,
      correlationId,
      networkAddress: networkAddressOf(request),
    });
    return true;
  }
}

function notSignedIn(): ApiRefusal {
  return new ApiRefusal({ kind: 'not-signed-in', code: 'access.not-signed-in' });
}

function incomplete(steps: readonly SignInStep[]): ApiRefusal {
  const missing: MissingItem[] = steps.map((step) => ({ kind: 'sign-in-step', step }));
  return new ApiRefusal({
    kind: 'not-signed-in',
    code: 'access.sign-in-incomplete',
    missing,
    next: steps[0] === 'enrolment' ? 'access.start-enrolment' : 'access.change-password',
  });
}
