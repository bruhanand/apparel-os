import { Module } from '@nestjs/common';
import { PinoLoggerService } from './pino-logger.service.js';

/**
 * The token of the application's one logger, a PinoLoggerService. Inject it with @Inject(LOGGER); main.ts hands the
 * same instance to Nest, so every line of the service comes from one logger (code-house-rules 12.11).
 */
export const LOGGER = 'kernel.Logger';

/** Provides the application's logger. Each module that logs imports it; Nest makes the instance once per application. */
@Module({
  providers: [{ provide: LOGGER, useFactory: () => new PinoLoggerService() }],
  exports: [LOGGER],
})
export class LoggingModule {}
