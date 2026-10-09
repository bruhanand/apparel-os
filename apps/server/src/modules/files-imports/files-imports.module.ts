import { Inject, Module, type OnApplicationShutdown } from '@nestjs/common';
import {
  COMMAND_RUNNER,
  CommandRunnerModule,
  IDEMPOTENCY_HELPER,
  LOGGER,
  LoggingModule,
  type CommandRunner,
  type IdempotencyHelper,
  type StructuredLogger,
} from '../../kernel/index.js';
import {
  ACCESS,
  AccessContractsModule,
  AccessModule,
  ORGANISATION_KEYS,
  type AccessInterface,
  type OrganisationKeys,
} from '../access/index.js';
import { AUDIT, AuditModule, type AuditInterface } from '../audit/index.js';
import { ATTACHED_RECORD_READERS, AttachedRecordReaders } from './contracts/record-readers.js';
import { FilesImports } from './files-imports.js';
import { FILE_STORE, FILE_STORE_ENVIRONMENT, type FileStoreHandle } from './file-store/file-store.js';
import { fileStoreFromEnvironment, S3FileStore } from './file-store/s3-file-store.js';
import { FilesController, READ_ATTACHED_DEPENDENCIES, STORE_FILE_DEPENDENCIES } from './http/files.controller.js';

/** The token of the module's interface for other modules. */
export const FILES_IMPORTS = 'files-imports.FilesImports';

/**
 * The files-imports module (module-map 4.7): tier 1, uses `access`, `audit` and `kernel`. This part holds the stored
 * files, their receipts and the attachments that link a file to a record of any module as evidence (S1-F06-T05).
 * The file store is read from the environment at start: with none set, storing and reading a file are unavailable and
 * say so (nothing is on by default; code-house-rules 12.14).
 */
@Module({
  imports: [CommandRunnerModule, LoggingModule, AccessModule, AccessContractsModule, AuditModule],
  controllers: [FilesController],
  providers: [
    { provide: FILE_STORE_ENVIRONMENT, useValue: process.env },
    {
      provide: FILE_STORE,
      useFactory: (env: Readonly<Record<string, string | undefined>>): FileStoreHandle => fileStoreFromEnvironment(env),
      inject: [FILE_STORE_ENVIRONMENT],
    },
    // The owning modules' readers of their records, which they register with at start (RR-452).
    { provide: ATTACHED_RECORD_READERS, useFactory: () => new AttachedRecordReaders() },
    {
      provide: FILES_IMPORTS,
      useFactory: (audit: AuditInterface, readers: AttachedRecordReaders) => new FilesImports(audit, readers),
      inject: [AUDIT, ATTACHED_RECORD_READERS],
    },
    {
      provide: STORE_FILE_DEPENDENCIES,
      useFactory: (
        helper: IdempotencyHelper,
        access: AccessInterface,
        audit: AuditInterface,
        keys: OrganisationKeys,
        fileStore: FileStoreHandle,
        logger: StructuredLogger,
      ) => ({ helper, access, audit, keys, fileStore, logger }),
      inject: [IDEMPOTENCY_HELPER, ACCESS, AUDIT, ORGANISATION_KEYS, FILE_STORE, LOGGER],
    },
    {
      provide: READ_ATTACHED_DEPENDENCIES,
      useFactory: (
        runner: CommandRunner,
        helper: IdempotencyHelper,
        access: AccessInterface,
        audit: AuditInterface,
        keys: OrganisationKeys,
        fileStore: FileStoreHandle,
        logger: StructuredLogger,
        readers: AttachedRecordReaders,
      ) => ({ runner, helper, access, audit, keys, fileStore, logger, readers }),
      inject: [
        COMMAND_RUNNER,
        IDEMPOTENCY_HELPER,
        ACCESS,
        AUDIT,
        ORGANISATION_KEYS,
        FILE_STORE,
        LOGGER,
        ATTACHED_RECORD_READERS,
      ],
    },
  ],
  exports: [FILES_IMPORTS, ATTACHED_RECORD_READERS],
})
export class FilesImportsModule implements OnApplicationShutdown {
  constructor(@Inject(FILE_STORE) private readonly fileStore: FileStoreHandle) {}

  onApplicationShutdown(): void {
    if (this.fileStore.kind === 'configured' && this.fileStore.store instanceof S3FileStore) {
      this.fileStore.store.destroy();
    }
  }
}
