import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR, DiscoveryModule } from '@nestjs/core';
import { HealthController } from './health/health.controller.js';
import { ErrorEnvelopeFilter } from './http/error-envelope.filter.js';
import { httpSettingsFromEnvironment } from './http/http-settings.js';
import { HTTP_ENVIRONMENT, HTTP_SETTINGS, OriginCheck } from './http/origin-check.guard.js';
import { RouteContractInterceptor } from './http/route-contract.interceptor.js';
import { RouteDeclarationCheck } from './http/route-declaration.check.js';
import { LoggingModule } from './logging/logging.module.js';

/**
 * The kernel's routes and the API conventions every route follows (code-house-rules 12.1 to 12.3): input parsed with
 * the route table's schemas, the idempotency key required of a command, the answer encoded through its schema, every
 * error in the one envelope, no route served without its declaration, and no command from another site (12.1). The
 * HTTP settings (the app's own origin, the proxies trusted) are read at start; the application refuses to start
 * without them.
 */
@Module({
  imports: [LoggingModule, DiscoveryModule],
  controllers: [HealthController],
  providers: [
    { provide: HTTP_ENVIRONMENT, useValue: process.env },
    {
      provide: HTTP_SETTINGS,
      useFactory: (env: Readonly<Record<string, string | undefined>>) => httpSettingsFromEnvironment(env),
      inject: [HTTP_ENVIRONMENT],
    },
    { provide: APP_GUARD, useClass: OriginCheck },
    { provide: APP_INTERCEPTOR, useClass: RouteContractInterceptor },
    { provide: APP_FILTER, useClass: ErrorEnvelopeFilter },
    RouteDeclarationCheck,
  ],
  exports: [HTTP_SETTINGS],
})
export class KernelModule {}
