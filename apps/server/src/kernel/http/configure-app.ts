import { routes, type Route } from '@apparel-os/schemas';
import type { INestApplication } from '@nestjs/common';
import { correlationIdMiddleware, correlationIdOf } from '../command-runner/correlation.js';
import { LOGGER } from '../logging/logging.module.js';
import type { StructuredLogger } from '../logging/pino-logger.service.js';
import type { Clock } from '../time/clock.js';
import { systemClock } from '../time/clock.js';
import { ERROR_CODE_LOCAL } from './error-envelope.filter.js';
import type { HttpSettings } from './http-settings.js';
import type { HttpRequest, HttpResponse } from './http-types.js';
import { largeJsonBody, mountPatternOf } from './large-body.js';
import { HTTP_SETTINGS } from './origin-check.guard.js';

/**
 * The headers every answer carries, pages and API alike: one origin, so a page loads scripts, styles, fonts, images
 * and API calls only from its own origin, no site frames it, and no referrer leaves it (deployment.md section 3;
 * code-house-rules 12.1; S1-F01-T27).
 */
const SECURITY_HEADERS: readonly (readonly [string, string])[] = [
  [
    'Content-Security-Policy',
    "default-src 'self'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'; form-action 'self'",
  ],
  ['X-Content-Type-Options', 'nosniff'],
  ['X-Frame-Options', 'DENY'],
  ['Referrer-Policy', 'same-origin'],
];

/**
 * Settings every HTTP entry point shares: the real server and the tests that start it. The route conventions
 * themselves (input parsing, the key, answer encoding, the envelope) are KernelModule's global interceptor and filter.
 */
export function configureApp(app: INestApplication, clock: Clock = systemClock): void {
  app.setGlobalPrefix('api');
  // The source address of a request is the one the nearest untrusted hop gave (AOS_TRUSTED_PROXY_HOPS).
  const settings = app.get<HttpSettings>(HTTP_SETTINGS);
  (app.getHttpAdapter().getInstance() as { set(name: string, value: number | boolean): void }).set(
    'trust proxy',
    settings.trustedProxyHops === 0 ? false : settings.trustedProxyHops,
  );
  // One correlation identifier per request, made by the server, before any route runs (code-house-rules 12.11).
  app.use(correlationIdMiddleware);
  // No browser or proxy cache keeps API data (code-house-rules 12.1 "No caching"; PRD-SEC-006). The web app's files
  // set their own (web-app.ts).
  app.use((_request: HttpRequest, response: HttpResponse, next: () => void) => {
    response.setHeader('Cache-Control', 'no-store');
    for (const [name, value] of SECURITY_HEADERS) response.setHeader(name, value);
    next();
  });
  app.use(requestLog(app.get<StructuredLogger>(LOGGER), clock));
  // A route that takes more than the ordinary body limit, such as storing a file, names its own (route table).
  for (const route of Object.values(routes) as readonly Route[]) {
    if (route.command && route.bodyLimitBytes !== undefined) {
      app.use(mountPatternOf(route), largeJsonBody(route.bodyLimitBytes));
    }
  }
}

/**
 * One line when a request ends: the method, the route template, the status, the error code and the duration; never
 * the query string, the body or the answer (code-house-rules 12.11; PRD-SEC-014).
 */
function requestLog(logger: StructuredLogger, clock: Clock) {
  return (request: HttpRequest, response: HttpResponse, next: () => void): void => {
    const started = clock.now().getTime();
    response.on('finish', () => {
      logger.structured(
        'info',
        {
          correlationId: correlationIdOf(request),
          method: request.method,
          route: request.route?.path,
          status: response.statusCode,
          code: response.locals[ERROR_CODE_LOCAL],
          durationMs: clock.now().getTime() - started,
        },
        'Request ended',
        'Request',
      );
    });
    next();
  };
}
