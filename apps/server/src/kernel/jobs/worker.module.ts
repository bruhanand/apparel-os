import { Module, type DynamicModule, type Type } from '@nestjs/common';
import type { CommandRunner } from '../command-runner/command-runner.js';
import { COMMAND_RUNNER, CommandRunnerModule } from '../command-runner/command-runner.module.js';
import type { IdempotencyHelper } from '../idempotency/idempotency-helper.js';
import { IDEMPOTENCY_HELPER, IdempotencyModule } from '../idempotency/idempotency.module.js';
import { LOGGER, LoggingModule } from '../logging/logging.module.js';
import type { PinoLoggerService } from '../logging/pino-logger.service.js';
import type { OrganisationRouter } from '../routing/organisation-router.js';
import { ORGANISATION_ROUTER, OrganisationRoutingModule } from '../routing/organisation-routing.module.js';
import { JOB_IDENTITIES, type JobIdentities } from './contracts.js';
import { checkRegistry, type JobRegistry } from './registry.js';
import { workerSettingsFromEnvironment, type WorkerSettings } from './worker-settings.js';
import { Worker } from './worker.js';

/** The token of the Worker. Inject it with @Inject(WORKER). */
export const WORKER = 'kernel.Worker';
/** The token of the worker's settings, read at start (code-house-rules 12.9; CH-10). */
export const WORKER_SETTINGS = 'kernel.WorkerSettings';
/** The variables the worker reads its settings from: the process's, unless a test gives others. */
export const WORKER_ENVIRONMENT = 'kernel.WorkerEnvironment';

@Module({})
class WorkerHostModule {}

/**
 * The worker's composition (code-house-rules 12.9; deployment.md section 2): routing, the command runner, the
 * idempotency helper, the JobIdentities contract from `identities` (which `access` provides), and everything the
 * `registry` names. It refuses to start with a registry the worker must not run, or without its settings. The
 * idempotency helper keeps its fail-safe stand-ins: no job step carries a secret or a restricted value.
 */
export function workerModuleWith(identities: Type<unknown>, registry: JobRegistry): DynamicModule {
  checkRegistry(registry);
  return {
    module: WorkerHostModule,
    imports: [LoggingModule, OrganisationRoutingModule, CommandRunnerModule, IdempotencyModule, identities],
    providers: [
      { provide: WORKER_ENVIRONMENT, useValue: process.env },
      {
        provide: WORKER_SETTINGS,
        useFactory: (env: Readonly<Record<string, string | undefined>>) => workerSettingsFromEnvironment(env, registry),
        inject: [WORKER_ENVIRONMENT],
      },
      {
        provide: WORKER,
        useFactory: (
          router: OrganisationRouter,
          runner: CommandRunner,
          helper: IdempotencyHelper,
          jobIdentities: JobIdentities,
          logger: PinoLoggerService,
          settings: WorkerSettings,
        ) => new Worker({ router, runner, helper, identities: jobIdentities, logger, registry, settings }),
        inject: [ORGANISATION_ROUTER, COMMAND_RUNNER, IDEMPOTENCY_HELPER, JOB_IDENTITIES, LOGGER, WORKER_SETTINGS],
      },
    ],
    exports: [WORKER],
  };
}
