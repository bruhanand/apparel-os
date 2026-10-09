import { Module } from '@nestjs/common';
import { jobFailed, workerModuleWith, type JobRegistry } from './kernel/index.js';
import {
  AccessJobIdentitiesModule,
  accessJobKinds,
  approvalDecided,
  approvalRequested,
  assignmentChanged,
  sessionRevoked,
} from './modules/access/index.js';
import { auditJobKinds } from './modules/audit/index.js';
import { exceptionsConsumers, exceptionsJobKinds } from './modules/exceptions/index.js';
import { inboxConsumers, inboxJobKinds } from './modules/inbox/index.js';
import { ConfigurationTimezoneModule } from './modules/configuration/index.js';

/**
 * Everything the worker runs (code-house-rules 12.8, 12.9): the event types the units declare, their consumers and
 * the job kinds, each from its unit's `jobs/` folder. Stage 1 so far: the audit job kinds (RR-241), the rebuild of
 * effective grants (access-and-approvals 7.2), the inbox's consumers of approval requests (11.1; S1-F01-T13), and the
 * exceptions consumer that raises an unfinished operation for a failed job and the escalation of overdue exceptions
 * (code-house-rules 12.9; access-and-approvals 11.3; S1-F08-T02).
 * Each consumer needs a retry setting in `AOS_WORKER_SETTINGS` (CH-10; RR-270).
 */
export const jobRegistry: JobRegistry = {
  events: [approvalRequested, approvalDecided, assignmentChanged, sessionRevoked, jobFailed],
  consumers: [...inboxConsumers, ...exceptionsConsumers],
  // The escalation of overdue tasks and approvals (access-and-approvals 11.3; S1-F05-T02).
  jobKinds: [...auditJobKinds, ...accessJobKinds, ...exceptionsJobKinds, ...inboxJobKinds],
};

/** The worker's composition root: the same build as the app, another start command (deployment.md section 2). */
@Module({ imports: [ConfigurationTimezoneModule, workerModuleWith(AccessJobIdentitiesModule, jobRegistry)] })
export class WorkerModule {}
