import type { INestApplication } from '@nestjs/common';

/** Settings every HTTP entry point shares: the real server and the tests that start it. */
export function configureApp(app: INestApplication): void {
  app.setGlobalPrefix('api');
}
