import { Module } from '@nestjs/common';
import { LOGGER, LoggingModule } from '../logging/logging.module.js';
import type { PinoLoggerService } from '../logging/pino-logger.service.js';
import { OrganisationRouter } from './organisation-router.js';
import { routingConfigFromEnvironment } from './routing-config.js';

/** The token of the OrganisationRouter. Inject it with @Inject(ORGANISATION_ROUTER). */
export const ORGANISATION_ROUTER = 'kernel.OrganisationRouter';
/** The variables routing reads its configuration from: the process's, unless a test gives others. */
export const ROUTING_ENVIRONMENT = 'kernel.RoutingEnvironment';

/**
 * Organisation routing for the application (module-map 4.1). The router is made at start from
 * AOS_RUNTIME_DATABASE_URL and AOS_DATABASE_POOL_MAX, and the application refuses to start without them; it opens
 * no connection until the first request needs one, and closes every pool when the application shuts down.
 */
@Module({
  imports: [LoggingModule],
  providers: [
    { provide: ROUTING_ENVIRONMENT, useValue: process.env },
    {
      provide: ORGANISATION_ROUTER,
      useFactory: (env: Readonly<Record<string, string | undefined>>, logger: PinoLoggerService) =>
        new OrganisationRouter(routingConfigFromEnvironment(env), logger),
      inject: [ROUTING_ENVIRONMENT, LOGGER],
    },
  ],
  exports: [ORGANISATION_ROUTER],
})
export class OrganisationRoutingModule {}
