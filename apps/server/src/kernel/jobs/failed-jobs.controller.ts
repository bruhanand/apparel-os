import { routes, type FailedJobList } from '@apparel-os/schemas';
import { Controller, Inject, Req } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import type { CommandRunner } from '../command-runner/command-runner.js';
import { COMMAND_RUNNER } from '../command-runner/command-runner.module.js';
import { ApiRoute } from '../http/api-route.js';
import type { HttpRequest } from '../http/http-types.js';
import {
  FAILED_JOB_EXCEPTIONS,
  SESSION_ACCESS,
  type FailedJobExceptions,
  type SessionAccess,
} from '../live/contracts.js';
import { listFailedJobs } from './failed-jobs.js';

/**
 * The operations view's failed jobs (code-house-rules 12.9; module-map 4.1 "Operations view"; PRD-SEC-013;
 * S1-F08-T04): for whoever holds view on `kernel.job`, which the request's guard authorises (access-and-approvals 7.1
 * step 3). Each links to the unfinished-operation exception raised for it, where one was and the reader may view it.
 */
@Controller()
export class FailedJobsController {
  constructor(
    @Inject(COMMAND_RUNNER) private readonly runner: CommandRunner,
    @Inject(ModuleRef) private readonly moduleRef: ModuleRef,
  ) {}

  @ApiRoute(routes.listFailedJobs)
  async listFailedJobs(@Req() request: HttpRequest): Promise<FailedJobList> {
    const session = this.moduleRef.get<SessionAccess>(SESSION_ACCESS, { strict: false }).signedInOf(request);
    const exceptions = this.failedJobExceptions();
    return this.runner.read(
      {
        commandName: 'kernel.list-failed-jobs',
        organisation: session.organisation,
        correlationId: session.correlationId,
        actor: { kind: 'actor', actorId: session.userId },
      },
      async (context) => {
        const jobs = await listFailedJobs(context);
        const raised =
          exceptions === undefined
            ? new Map<string, { exceptionId: string; code: string }>()
            : await exceptions(
                context,
                jobs.map((job) => job.jobId),
              );
        return {
          asOf: context.startedAt.toISOString(),
          jobs: jobs.map((job) => ({ ...job, exception: raised.get(job.jobId) ?? null })),
        };
      },
    );
  }

  /** The exceptions of failed jobs, where `exceptions` is in the composition. */
  private failedJobExceptions(): FailedJobExceptions | undefined {
    try {
      return this.moduleRef.get<FailedJobExceptions>(FAILED_JOB_EXCEPTIONS, { strict: false });
    } catch {
      return undefined;
    }
  }
}
