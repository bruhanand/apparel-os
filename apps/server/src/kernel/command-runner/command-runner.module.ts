import { Module } from '@nestjs/common';
import { LOGGER, LoggingModule } from '../logging/logging.module.js';
import type { PinoLoggerService } from '../logging/pino-logger.service.js';
import type { Clock } from '../time/clock.js';
import { systemClock } from '../time/clock.js';
import { timezoneNotConfigured, type OrganisationTimezoneSource } from '../time/organisation-timezone.js';
import { CommandRunner } from './command-runner.js';

/** The token of the CommandRunner. Inject it with @Inject(COMMAND_RUNNER). */
export const COMMAND_RUNNER = 'kernel.CommandRunner';
/** The token of the kernel's clock (code-house-rules 9). Inject it with @Inject(CLOCK); tests give their own. */
export const CLOCK = 'kernel.Clock';
/**
 * The token of the source of the Organisation's timezone the runner reads. It is the source `configuration` provides
 * under CONFIGURED_TIMEZONE_SOURCE where the composition imports it (RR-231); without it, timezoneNotConfigured: no
 * timezone is set, so nothing that needs a business date is available (PRD-SEC-017). Tests may override it.
 */
export const ORGANISATION_TIMEZONE_SOURCE = 'kernel.OrganisationTimezoneSource';
/**
 * The token under which `configuration`, one tier above, provides its implementation of the timezone contract from
 * a global module (module-map section 3, rule 6; code-house-rules 9). Kernel never imports it; it is injected.
 */
export const CONFIGURED_TIMEZONE_SOURCE = 'kernel.ConfiguredTimezoneSource';

/** The command runner for the application (code-house-rules 8.1; module-map 4.1). */
@Module({
  imports: [LoggingModule],
  providers: [
    { provide: CLOCK, useValue: systemClock },
    {
      provide: ORGANISATION_TIMEZONE_SOURCE,
      useFactory: (configured: OrganisationTimezoneSource | undefined) => configured ?? timezoneNotConfigured,
      inject: [{ token: CONFIGURED_TIMEZONE_SOURCE, optional: true }],
    },
    {
      provide: COMMAND_RUNNER,
      useFactory: (clock: Clock, timezones: OrganisationTimezoneSource, logger: PinoLoggerService) =>
        new CommandRunner({ clock, timezones, logger }),
      inject: [CLOCK, ORGANISATION_TIMEZONE_SOURCE, LOGGER],
    },
  ],
  exports: [COMMAND_RUNNER, CLOCK],
})
export class CommandRunnerModule {}
