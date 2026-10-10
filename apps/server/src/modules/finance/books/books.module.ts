import { Module } from '@nestjs/common';
import { CommandRunnerModule } from '../../../kernel/index.js';
import { ACCESS, AccessModule, type AccessInterface } from '../../access/index.js';
import { AUDIT, AuditModule, type AuditInterface } from '../../audit/index.js';
import { FILES_IMPORTS, FilesImportsModule, type FilesImportsInterface } from '../../files-imports/index.js';
import { Books } from './books.js';
import { BOOK_HELD_STOCK, type BookHeldStock } from './contracts/book-held-stock.js';
import { BooksController } from './http/books.controller.js';
import { BOOKS } from './tokens.js';

/**
 * finance · books (module-map 4.14; books-and-posting): tier 2, uses `access`, `audit`, `files-imports`, `kernel` and
 * `organisation`'s interface for books and mappings. Book settings, the chart of accounts and the CA's approval
 * evidence (S1-F09-T01). Its approval rules and decision effects reach `access` through the composition root
 * (booksApprovals; access-and-approvals 9.8b), and "has this book held stock?" reaches it from `stock` the same way,
 * optional while no implementation answers (books-and-posting 2.2).
 */
@Module({
  imports: [CommandRunnerModule, AuditModule, AccessModule, FilesImportsModule],
  controllers: [BooksController],
  providers: [
    {
      provide: BOOKS,
      useFactory: (
        audit: AuditInterface,
        access: AccessInterface,
        files: FilesImportsInterface,
        bookHeldStock: BookHeldStock | undefined,
      ) => new Books({ audit, access, files, bookHeldStock }),
      inject: [AUDIT, ACCESS, FILES_IMPORTS, { token: BOOK_HELD_STOCK, optional: true }],
    },
  ],
  exports: [BOOKS],
})
export class BooksModule {}
