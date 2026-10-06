import type { Route } from '@apparel-os/schemas';
import { Inject, Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ApiRefusal } from './api-refusal.js';
import { ROUTE_METADATA } from './api-route.js';
import type { HttpRequest } from './http-types.js';
import type { HttpSettings } from './http-settings.js';

/** The token of the HTTP settings (HttpSettings). Inject it with @Inject(HTTP_SETTINGS). */
export const HTTP_SETTINGS = 'kernel.HttpSettings';
/** The variables the HTTP settings are read from: the process's, unless a test gives others. */
export const HTTP_ENVIRONMENT = 'kernel.HttpEnvironment';

/**
 * Writes from another site (code-house-rules 12.1; RR-245). Every command, sign-in included, carries an `Origin`
 * header equal to the app's own origin, or is refused `invalid` with `kernel.cross-site-request` before anything
 * else runs. With the `SameSite=Lax` session cookie and the `Idempotency-Key` header that a page on another site
 * cannot send without a preflight the server never grants, another site cannot write under a person's session, nor
 * sign a browser in to an account of its choosing. Browsers send `Origin` on every `POST`, same-origin included.
 */
@Injectable()
export class OriginCheck implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(HTTP_SETTINGS) private readonly settings: HttpSettings,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const route = this.reflector.get<Route | undefined>(ROUTE_METADATA, context.getHandler());
    // A route with no declaration is refused by the route conventions; a read changes nothing.
    if (!route?.command) return true;
    const origin = context.switchToHttp().getRequest<HttpRequest>().headers.origin;
    if (origin !== this.settings.publicOrigin) {
      throw new ApiRefusal({ kind: 'invalid', code: 'kernel.cross-site-request' });
    }
    return true;
  }
}
