import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import { LOGGER, LoggingModule } from '../logging/logging.module.js';
import { PinoLoggerService } from '../logging/pino-logger.service.js';
import {
  ORGANISATION_ROUTER,
  OrganisationRoutingModule,
  ROUTING_ENVIRONMENT,
} from '../routing/organisation-routing.module.js';
import { systemClock } from '../time/clock.js';
import { timezoneNotConfigured } from '../time/organisation-timezone.js';
import { CommandRunner } from './command-runner.js';
import { CLOCK, COMMAND_RUNNER, CommandRunnerModule, ORGANISATION_TIMEZONE_SOURCE } from './command-runner.module.js';

// S1-F01-T03: the command runner is wired for the application by token (AGENTS.md "Code workspace"). Until
// `configuration` implements the timezone contract, no Organisation has a timezone (code-house-rules 9).

describe('CommandRunnerModule', () => {
  it('provides the runner, the system clock and a timezone source that sets nothing', async () => {
    const moduleRef = await Test.createTestingModule({ imports: [CommandRunnerModule] }).compile();
    expect(moduleRef.get(COMMAND_RUNNER)).toBeInstanceOf(CommandRunner);
    expect(moduleRef.get(CLOCK)).toBe(systemClock);
    expect(moduleRef.get(ORGANISATION_TIMEZONE_SOURCE)).toBe(timezoneNotConfigured);
    await moduleRef.close();
  });

  it('code-house-rules 12.11 shares the one application logger with routing, by injection', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [CommandRunnerModule, OrganisationRoutingModule, LoggingModule],
    })
      .overrideProvider(ROUTING_ENVIRONMENT)
      .useValue({
        // SYNTHETIC: never connected to; the router opens no connection until a request needs one.
        AOS_RUNTIME_DATABASE_URL: 'postgres://aos_runtime:synthetic@127.0.0.1:1/aos_directory',
        AOS_DATABASE_POOL_MAX: '1',
      })
      .compile();
    const logger = moduleRef.get<PinoLoggerService>(LOGGER);
    expect(logger).toBeInstanceOf(PinoLoggerService);
    const runner = moduleRef.get<CommandRunner>(COMMAND_RUNNER);
    const router = moduleRef.get<{ logger: unknown }>(ORGANISATION_ROUTER);
    // Both were built with the same instance (read through their private fields, for this test only).
    expect((runner as unknown as { dependencies: { logger: unknown } }).dependencies.logger).toBe(logger);
    expect(router.logger).toBe(logger);
    await moduleRef.close();
  });

  it('PRD-SEC-017 answers "not set" for the timezone until configuration sets one', async () => {
    const answer = await timezoneNotConfigured.read(
      undefined as unknown as Parameters<typeof timezoneNotConfigured.read>[0],
      new Date(0),
    );
    expect(answer).toEqual({ kind: 'not-set' });
  });
});
