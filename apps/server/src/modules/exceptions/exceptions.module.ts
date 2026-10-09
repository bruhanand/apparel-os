import { Inject, Module, Optional, type OnModuleInit } from '@nestjs/common';
import {
  CommandRunnerModule,
  FAILED_JOB_EXCEPTIONS,
  LIVE_UPDATES,
  type FailedJobExceptions,
  type LiveUpdates,
} from '../../kernel/index.js';
import { ACCESS, AccessModule, type AccessInterface } from '../access/index.js';
import { AUDIT, AuditModule, type AuditInterface } from '../audit/index.js';
import { FILES_IMPORTS, FilesImportsModule, type FilesImportsInterface } from '../files-imports/index.js';
import { INBOX, InboxModule, type InboxInterface } from '../inbox/index.js';
import { NUMBERING, NumberingModule, type NumberingInterface } from '../numbering/index.js';
import type { ExceptionTypeRegistration } from './domain/types.js';
import { Exceptions } from './exceptions.js';
import { ExceptionsController } from './http/exceptions.controller.js';
import { EXCEPTION_RECORD_TYPE } from './domain/types.js';
import { exceptionsOfJobs, mayViewException } from './queries/admission.js';
import { EXCEPTION_TYPES, EXCEPTIONS } from './tokens.js';

/**
 * The exceptions module (module-map 4.13; access-and-approvals 12): tier 2, uses `access`, `audit`, `inbox`,
 * `numbering`, `files-imports` (evidence, S1-F08-T03) and `kernel`. Exception codes come from its own numbered kind, which the composition root hands to
 * `numbering` under NUMBERED_KINDS; the types the raising modules register reach it there too, under EXCEPTION_TYPES
 * (module-map section 3, rule 6).
 */
@Module({
  imports: [CommandRunnerModule, AuditModule, AccessModule, InboxModule, NumberingModule, FilesImportsModule],
  controllers: [ExceptionsController],
  providers: [
    {
      provide: EXCEPTIONS,
      useFactory: (
        numbering: NumberingInterface,
        inbox: InboxInterface,
        audit: AuditInterface,
        types: readonly ExceptionTypeRegistration[] | undefined,
        files: FilesImportsInterface,
      ) => new Exceptions({ numbering, inbox, audit, types: types ?? [], files }),
      inject: [NUMBERING, INBOX, AUDIT, { token: EXCEPTION_TYPES, optional: true }, FILES_IMPORTS],
    },
    {
      // The exception raised for each failed job, for the operations view (code-house-rules 12.9; S1-F08-T04).
      provide: FAILED_JOB_EXCEPTIONS,
      useFactory:
        (access: AccessInterface): FailedJobExceptions =>
        (context, jobIds) =>
          exceptionsOfJobs(context, access, context.actor.kind === 'actor' ? context.actor.actorId : '', jobIds),
      inject: [ACCESS],
    },
  ],
  exports: [EXCEPTIONS],
})
export class ExceptionsModule implements OnModuleInit {
  constructor(
    @Inject(ACCESS) private readonly access: AccessInterface,
    @Optional() @Inject(LIVE_UPDATES) private readonly live: LiveUpdates | null,
  ) {}

  /** An exception's live updates go to whoever may view it, its owner included (12.4 "As built"; 12.12). */
  onModuleInit(): void {
    this.live?.registerAudience([EXCEPTION_RECORD_TYPE], (context, actorId, event) =>
      mayViewException(context, this.access, actorId, event.subject.recordId),
    );
  }
}
