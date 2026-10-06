import { Module } from '@nestjs/common';
import { workerModuleWith, type JobRegistry } from './kernel/index.js';
import { AccessJobIdentitiesModule } from './modules/access/index.js';
import { auditJobKinds } from './modules/audit/index.js';

/**
 * Everything the worker runs (code-house-rules 12.8, 12.9): the event types the units declare, their consumers and
 * the job kinds, each from its unit's `jobs/` folder. Stage 1 so far has the audit job kinds (RR-241); the first
 * consumers arrive with S1-F01-T11 and T12.
 */
export const jobRegistry: JobRegistry = { events: [], consumers: [], jobKinds: [...auditJobKinds] };

/** The worker's composition root: the same build as the app, another start command (deployment.md section 2). */
@Module({ imports: [workerModuleWith(AccessJobIdentitiesModule, jobRegistry)] })
export class WorkerModule {}
