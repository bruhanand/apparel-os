import { Inject, Module, type OnModuleInit } from '@nestjs/common';
import { CommandRunnerModule } from '../../../kernel/index.js';
import { ACCESS, AccessModule, type AccessInterface } from '../../access/index.js';
import { AUDIT, AuditModule, type AuditInterface } from '../../audit/index.js';
import { CONFIGURATION, type ConfigurationInterface } from '../../configuration/index.js';
import { FILES_IMPORTS, FilesImportsModule, type FilesImportsInterface } from '../../files-imports/index.js';
import { NUMBERING, NumberingModule, type NumberingInterface } from '../../numbering/index.js';
import { Books } from './books.js';
import { BOOK_HELD_STOCK, type BookHeldStock } from './contracts/book-held-stock.js';
import { checkEventKinds, type PostingEventKind } from './domain/posting.js';
import { BooksController } from './http/books.controller.js';
import { postingConfigurationCheck } from './queries/validity.js';
import { BOOKS, POSTING_EVENT_KINDS } from './tokens.js';

/**
 * finance · books (module-map 4.14; books-and-posting): tier 2, uses `access`, `audit`, `configuration`,
 * `files-imports`, `numbering`, `kernel` and `organisation`'s interface for books and mappings. Book settings, the
 * chart of accounts and the CA's approval evidence (S1-F09-T01); periods, posting maps, Post and the read models
 * (S1-F09-T02). Its approval rules and decision effects reach `access` through the composition root (booksApprovals;
 * access-and-approvals 9.8b); "has this book held stock?" reaches it from `stock` the same way, optional while no
 * implementation answers (2.2); and the posting event kinds the posting modules declare, checked by checkEventKinds
 * in the composition that hands them over, under POSTING_EVENT_KINDS (7.1). Its check of the posting configuration goes to the policy gate (11).
 */
@Module({
  imports: [CommandRunnerModule, AuditModule, AccessModule, FilesImportsModule, NumberingModule],
  controllers: [BooksController],
  providers: [
    {
      provide: BOOKS,
      useFactory: (
        audit: AuditInterface,
        access: AccessInterface,
        files: FilesImportsInterface,
        bookHeldStock: BookHeldStock | undefined,
        numbering: NumberingInterface,
        kinds: ReadonlyMap<string, PostingEventKind> | undefined,
      ) => new Books({ audit, access, files, bookHeldStock, numbering, kinds: kinds ?? checkEventKinds([]) }),
      inject: [
        AUDIT,
        ACCESS,
        FILES_IMPORTS,
        { token: BOOK_HELD_STOCK, optional: true },
        NUMBERING,
        { token: POSTING_EVENT_KINDS, optional: true },
      ],
    },
  ],
  exports: [BOOKS],
})
export class BooksModule implements OnModuleInit {
  constructor(@Inject(CONFIGURATION) private readonly configuration: ConfigurationInterface) {}

  /** The policy 9 validity check (books-and-posting 11; module-map 4.4, section 3 rule 6). */
  onModuleInit(): void {
    this.configuration.registerCheck(postingConfigurationCheck);
  }
}
