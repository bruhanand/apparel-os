import { Module } from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR, DiscoveryModule } from '@nestjs/core';
import { HealthController } from './health/health.controller.js';
import { ErrorEnvelopeFilter } from './http/error-envelope.filter.js';
import { RouteContractInterceptor } from './http/route-contract.interceptor.js';
import { RouteDeclarationCheck } from './http/route-declaration.check.js';
import { LoggingModule } from './logging/logging.module.js';

/**
 * The kernel's routes and the API conventions every route follows (code-house-rules 12.1 to 12.3): input parsed with
 * the route table's schemas, the idempotency key required of a command, the answer encoded through its schema, every
 * error in the one envelope, and no route served without its declaration.
 */
@Module({
  imports: [LoggingModule, DiscoveryModule],
  controllers: [HealthController],
  providers: [
    { provide: APP_INTERCEPTOR, useClass: RouteContractInterceptor },
    { provide: APP_FILTER, useClass: ErrorEnvelopeFilter },
    RouteDeclarationCheck,
  ],
})
export class KernelModule {}
