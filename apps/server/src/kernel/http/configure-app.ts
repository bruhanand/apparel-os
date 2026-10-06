import type { INestApplication } from '@nestjs/common';
import { correlationIdMiddleware, correlationIdOf } from '../command-runner/correlation.js';
import { LOGGER } from '../logging/logging.module.js';
import type { StructuredLogger } from '../logging/pino-logger.service.js';
import type { Clock } from '../time/clock.js';
import { systemClock } from '../time/clock.js';
import { ERROR_CODE_LOCAL } from './error-envelope.filter.js';
import type { HttpRequest, HttpResponse } from './http-types.js';

/**
 * Settings every HTTP entry point shares: the real server and the tests that start it. The route conventions
 * themselves (input parsing, the key, answer encoding, the envelope) are KernelModule's global interceptor and filter.
 */
export function configureApp(app: INestApplication, clock: Clock = systemClock): void {
  app.setGlobalPrefix('api');
  // One correlation identifier per request, made by the server, before any route runs (code-house-rules 12.11).
  app.use(correlationIdMiddleware);
  // No browser or proxy cache keeps API data (code-house-rules 12.1 "No caching"; PRD-SEC-006).
  app.use((_request: HttpRequest, response: HttpResponse, next: () => void) => {
    response.setHeader('Cache-Control', 'no-store');
    next();
  });
  app.use(requestLog(app.get<StructuredLogger>(LOGGER), clock));
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
