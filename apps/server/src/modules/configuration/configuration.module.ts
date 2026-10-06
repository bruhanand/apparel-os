import { Global, Module } from '@nestjs/common';
import { CONFIGURED_TIMEZONE_SOURCE } from '../../kernel/index.js';
import { configurationTimezoneSource } from './queries/timezone.js';

/**
 * configuration's implementation of the kernel's timezone contract, provided globally so the one command runner reads
 * the Organisation's timezone from configuration (module-map section 3, rule 6; code-house-rules 9; RR-231, RR-250).
 * The app and the worker import it; kernel never imports configuration.
 */
@Global()
@Module({
  providers: [{ provide: CONFIGURED_TIMEZONE_SOURCE, useValue: configurationTimezoneSource }],
  exports: [CONFIGURED_TIMEZONE_SOURCE],
})
export class ConfigurationTimezoneModule {}
