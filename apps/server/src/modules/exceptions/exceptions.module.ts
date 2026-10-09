import { Module } from '@nestjs/common';
import { CommandRunnerModule } from '../../kernel/index.js';
import { AccessModule } from '../access/index.js';
import { AUDIT, AuditModule, type AuditInterface } from '../audit/index.js';
import { INBOX, InboxModule, type InboxInterface } from '../inbox/index.js';
import { NUMBERING, NumberingModule, type NumberingInterface } from '../numbering/index.js';
import type { ExceptionTypeRegistration } from './domain/types.js';
import { Exceptions } from './exceptions.js';
import { ExceptionsController } from './http/exceptions.controller.js';
import { EXCEPTION_TYPES, EXCEPTIONS } from './tokens.js';

/**
 * The exceptions module (module-map 4.13; access-and-approvals 12): tier 2, uses `access`, `audit`, `inbox`,
 * `numbering` and `kernel`. Exception codes come from its own numbered kind, which the composition root hands to
 * `numbering` under NUMBERED_KINDS; the types the raising modules register reach it there too, under EXCEPTION_TYPES
 * (module-map section 3, rule 6).
 */
@Module({
  imports: [CommandRunnerModule, AuditModule, AccessModule, InboxModule, NumberingModule],
  controllers: [ExceptionsController],
  providers: [
    {
      provide: EXCEPTIONS,
      useFactory: (
        numbering: NumberingInterface,
        inbox: InboxInterface,
        audit: AuditInterface,
        types: readonly ExceptionTypeRegistration[] | undefined,
      ) => new Exceptions({ numbering, inbox, audit, types: types ?? [] }),
      inject: [NUMBERING, INBOX, AUDIT, { token: EXCEPTION_TYPES, optional: true }],
    },
  ],
  exports: [EXCEPTIONS],
})
export class ExceptionsModule {}
