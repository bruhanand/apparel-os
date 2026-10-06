import type { INestApplication } from '@nestjs/common';
import { correlationIdMiddleware } from '../command-runner/correlation.js';

/** Settings every HTTP entry point shares: the real server and the tests that start it. */
export function configureApp(app: INestApplication): void {
  app.setGlobalPrefix('api');
  // One correlation identifier per request, made by the server, before any route runs (code-house-rules 12.11).
  app.use(correlationIdMiddleware);
}
