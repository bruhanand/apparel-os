import { Inject, Module, type OnModuleInit } from '@nestjs/common';
import { CommandDefect, jobFailed, workerModuleWith, type JobRegistry } from './kernel/index.js';
import {
  AccessJobIdentitiesModule,
  accessJobKinds,
  approvalDecided,
  approvalRequested,
  assignmentChanged,
  sessionRevoked,
} from './modules/access/index.js';
import { ApplicationModulesModule } from './app.module.js';
import { Audit, auditJobKinds } from './modules/audit/index.js';
import { bookingJobKinds, overdueExceptionType } from './modules/booking/index.js';
import { Exceptions, exceptionsConsumers, exceptionsJobKinds } from './modules/exceptions/index.js';
import { Inbox, inboxConsumers, inboxJobKinds } from './modules/inbox/index.js';
import { ConfigurationTimezoneModule } from './modules/configuration/index.js';
import {
  PT,
  ptPostingConsumers,
  ptPostingFailed,
  ptPostRequested,
  type PtInterface,
} from './modules/merchandise/pt/index.js';
import { mappingChanged } from './modules/organisation/index.js';
import { posConsumers } from './modules/pos/index.js';
import { composedNumbering } from './numbered-kinds.js';

/** `numbering` with every declared kind, handed to the consumers and job kinds that number (module-map section 3, rule 6). */
const numbering = composedNumbering();

/**
 * The booking job kinds' dependencies (goods-in 3.8; S2-F01-T04): audit, and `exceptions` with the overdue balance's
 * type, which the job raises to Booking, built here since `booking` is built with no module above it (module-map
 * section 3, rule 6).
 */
const bookingJobs = bookingJobKinds({
  audit: (logger) => new Audit(logger),
  exceptions: (logger) =>
    new Exceptions({ numbering, inbox: new Inbox(), audit: new Audit(logger), types: [overdueExceptionType] }),
});

/**
 * The application's PT, which the PT's posting consumers post through: bound when the worker's composition is built,
 * from the same modules `app` composes (ApplicationModulesModule), before the worker starts taking jobs.
 */
let composedPt: PtInterface | undefined;

function ptOfTheWorker(): PtInterface {
  if (composedPt === undefined) throw new CommandDefect('A PT posting step ran before the worker composed its PT');
  return composedPt;
}

/**
 * Everything the worker runs (code-house-rules 12.8, 12.9): the event types the units declare, their consumers and
 * the job kinds, each from its unit's `jobs/` folder. Stage 1 so far: the audit job kinds (RR-241), the rebuild of
 * effective grants (access-and-approvals 7.2), the inbox's consumers of approval requests (11.1; S1-F01-T13), and the
 * exceptions consumer that raises an unfinished operation for a failed job and the escalation of overdue exceptions
 * (code-house-rules 12.9; access-and-approvals 11.3; S1-F08-T02), and `pos`'s consumer of mapping changes, which
 * defines a billing device's series for a new registration (offline-counter 4.3; S1-F12-T02). From stage 2, the
 * posting of a large PT's approval and the exception of a posting that failed (goods-in 6.6; stock-ledger 10.6;
 * books-and-posting 10 step 3; S2-F06-T01, code review 7).
 * Each consumer needs a retry setting in `AOS_WORKER_SETTINGS` (CH-10; RR-270).
 */
export const jobRegistry: JobRegistry = {
  events: [
    approvalRequested,
    approvalDecided,
    assignmentChanged,
    sessionRevoked,
    jobFailed,
    mappingChanged,
    ptPostRequested,
    ptPostingFailed,
  ],
  // `pos` defines a billing device's series when a unit's mapping changes (offline-counter 4.3; S1-F12-T02).
  consumers: [
    ...inboxConsumers,
    ...exceptionsConsumers(numbering),
    ...posConsumers(numbering),
    ...ptPostingConsumers(ptOfTheWorker),
  ],
  // The escalation of overdue tasks and approvals (access-and-approvals 11.3; S1-F05-T02).
  // The overdue follow-up of bookings (goods-in 3.8; S2-F01-T04).
  jobKinds: [...auditJobKinds, ...accessJobKinds, ...exceptionsJobKinds(numbering), ...inboxJobKinds, ...bookingJobs],
};

/**
 * The worker's composition root: the same build as the app, another start command (deployment.md section 2), with the
 * application's modules, so its jobs work through them, and none of the app's HTTP layer or live updates. It reads the
 * variables those modules read at start besides its own (deployment.md section 9; code review 7 of stage 2).
 */
@Module({
  imports: [
    ConfigurationTimezoneModule,
    ApplicationModulesModule,
    workerModuleWith(AccessJobIdentitiesModule, jobRegistry),
  ],
})
export class WorkerModule implements OnModuleInit {
  constructor(@Inject(PT) private readonly pt: PtInterface) {}

  /** Binds the application's PT to its posting consumers, before the worker starts (worker.ts). */
  onModuleInit(): void {
    composedPt = this.pt;
  }
}
