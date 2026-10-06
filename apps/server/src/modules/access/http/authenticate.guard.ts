import { registryByCode, type MissingItem, type Route, type SignInStep } from '@apparel-os/schemas';
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
import { AUDIT, type AuditInterface } from '../../audit/index.js';
import type { AccessInterface } from '../access.js';
import { authenticateSession } from '../queries/authenticate.js';
import { ACCESS } from '../tokens.js';
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
  /** For an `action` route, the role assignment Authorise used (access-and-approvals 7.1 step 3). */
  readonly roleAssignmentId?: string;
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
 * Authenticate also keeps the session's limits (3.3; PRD-ACS-017, POL-02.18): past its absolute limit the session
 * ends, and the request is not signed in; past its idle limit it locks, and every route but the unlock and the
 * sign-out (`whileLocked`) answers `access.session-locked`, so the screen keeps its work under the lock (S1-F01-T09).
 *
 * Until enrolment and the password change are done, the session reaches only the `own` routes of the first step
 * still to do; anything else is `access.sign-in-incomplete`, naming the steps left (3.2).
 *
 * An `action` route then passes Authorise for its action on its record type (7.1 step 3; PRD-INT-001, PRD-UXP-003):
 * one role assignment in force today must grant it, or the request is refused as `access.not-authorised`, naming
 * what is missing. The guard can do this only for a record type that declares no scope fact, since it does not know
 * the record; a route on a record type that carries facts authorises in its command, with the record's facts, and is
 * refused here as a defect until one exists (5.3). Available (7.1 step 2) asks nothing of the access setup operations,
 * which are not policy-gated (DEC-116).
 */
@Injectable()
export class AuthenticateGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(ORGANISATION_ROUTER) private readonly router: OrganisationRouter,
    @Inject(COMMAND_RUNNER) private readonly runner: CommandRunner,
    @Inject(ACCESS) private readonly access: AccessInterface,
    @Inject(AUDIT) private readonly audit: AuditInterface,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const route = this.reflector.get<Route | undefined>(ROUTE_METADATA, context.getHandler());
    if (route === undefined || route.access.kind === 'public') return true;
    const request = context.switchToHttp().getRequest<HttpRequest>();
    const correlationId = correlationIdOf(request) ?? newCorrelationId();
    const routed = await this.router.resolveFromSessionCookie(sessionCookieOf(request.headers.cookie));
    if (!routed.routed) throw notSignedIn();
    const networkAddress = networkAddressOf(request);
    // Authenticate writes: it ends, locks or marks the activity of the session (3.3), in a transaction of its own.
    const result = await this.runner.run(
      {
        commandName: 'access.authenticate',
        organisation: routed.organisation,
        correlationId,
        actor: { kind: 'no-actor', path: 'authenticate' },
      },
      (transaction) => authenticateSession(transaction, this.audit, routed.sessionIdentifier, networkAddress),
    );
    if (result.kind === 'not-signed-in') throw notSignedIn();
    const whileLocked = route.access.kind === 'own' && route.access.whileLocked === true;
    // A locked session reaches only the unlock and the sign-out; the web app tells it from an ended one (RR-264).
    if (result.kind === 'locked' && !whileLocked) throw sessionLocked();
    const found = result.session;
    const [next] = found.pendingSteps;
    if (next !== undefined && !whileLocked && !(route.access.kind === 'own' && route.access.signInStep === next)) {
      throw incomplete(found.pendingSteps);
    }
    let roleAssignmentId: string | undefined;
    if (route.access.kind === 'action') {
      const declared = registryByCode().get(route.access.recordType);
      if (declared === undefined)
        throw new CommandDefect(`Route record type ${route.access.recordType} is not declared`);
      if (
        declared.scopeFacts.legalEntity ||
        declared.scopeFacts.place ||
        declared.scopeFacts.brand ||
        declared.subject
      ) {
        throw new CommandDefect('A route on a record type with scope facts authorises in its command (5.3)');
      }
      const need = { actorId: found.userId, action: route.access.action, recordType: route.access.recordType };
      const authorised = await this.runner.read(
        {
          commandName: 'access.authorise',
          organisation: routed.organisation,
          correlationId,
          actor: { kind: 'actor', actorId: found.userId },
        },
        (transaction) => this.access.authorise(transaction, need),
      );
      if (authorised.kind === 'refused') {
        throw new ApiRefusal({
          kind: authorised.refusal.kind,
          code: authorised.refusal.code,
          missing: [...authorised.refusal.missing],
        });
      }
      roleAssignmentId = authorised.roleAssignmentId;
    }
    signedIn.set(request, {
      organisation: routed.organisation,
      sessionId: found.sessionId,
      userId: found.userId,
      displayName: found.displayName,
      correlationId,
      networkAddress,
      ...(roleAssignmentId === undefined ? {} : { roleAssignmentId }),
    });
    return true;
  }
}

function notSignedIn(): ApiRefusal {
  return new ApiRefusal({ kind: 'not-signed-in', code: 'access.not-signed-in' });
}

function sessionLocked(): ApiRefusal {
  return new ApiRefusal({ kind: 'not-signed-in', code: 'access.session-locked', next: 'access.unlock-session' });
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
