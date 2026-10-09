import { Global, Module } from '@nestjs/common';
import type { CommandRunner } from '../command-runner/command-runner.js';
import { COMMAND_RUNNER, CommandRunnerModule } from '../command-runner/command-runner.module.js';
import { FailedJobsController } from '../jobs/failed-jobs.controller.js';
import { LOGGER, LoggingModule } from '../logging/logging.module.js';
import type { StructuredLogger } from '../logging/pino-logger.service.js';
import { LiveController } from './live.controller.js';
import { LIVE_UPDATES } from './live.module-tokens.js';
import { LIVE_SETTINGS, LiveUpdates, PLATFORM_LIVE_SETTINGS, type LiveSettings } from './live-updates.js';

/**
 * Live updates and the operations view (module-map 4.1; code-house-rules 12.9, 12.12; S1-F08-T04): the stream of
 * `GET /api/kernel/live` and the failed jobs of `GET /api/kernel/failed-jobs`. Global, so the owning modules reach
 * LIVE_UPDATES to register their audiences without importing it (module-map section 3, rule 6). What it asks of
 * `access` and `exceptions` it reads at the request, under SESSION_ACCESS and FAILED_JOB_EXCEPTIONS.
 */
@Global()
@Module({
  imports: [CommandRunnerModule, LoggingModule],
  controllers: [LiveController, FailedJobsController],
  providers: [
    { provide: LIVE_SETTINGS, useValue: PLATFORM_LIVE_SETTINGS },
    {
      provide: LIVE_UPDATES,
      useFactory: (runner: CommandRunner, logger: StructuredLogger, settings: LiveSettings) =>
        new LiveUpdates(runner, logger, settings),
      inject: [COMMAND_RUNNER, LOGGER, LIVE_SETTINGS],
    },
  ],
  exports: [LIVE_UPDATES],
})
export class LiveUpdatesModule {}
