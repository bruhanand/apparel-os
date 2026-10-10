import { Inject, Module, type OnApplicationShutdown } from '@nestjs/common';
import {
  COMMAND_RUNNER,
  CommandRunnerModule,
  deploymentEnvironmentFromEnvironment,
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
import { NUMBERING, NumberingModule, type NumberingInterface } from '../numbering/index.js';
import type { ImportDependencies } from './commands/import-common.js';
import { IMPORT_HANDLERS, ImportHandlers } from './contracts/import-handlers.js';
import { ATTACHED_RECORD_READERS, AttachedRecordReaders } from './contracts/record-readers.js';
import { FilesImports } from './files-imports.js';
import { FILE_STORE, FILE_STORE_ENVIRONMENT, type FileStoreHandle } from './file-store/file-store.js';
import { fileStoreFromEnvironment, S3FileStore } from './file-store/s3-file-store.js';
import { FilesController, READ_ATTACHED_DEPENDENCIES, STORE_FILE_DEPENDENCIES } from './http/files.controller.js';
import { IMPORT_DEPENDENCIES, ImportsController } from './http/imports.controller.js';

/** The token of the module's interface for other modules. */
export const FILES_IMPORTS = 'files-imports.FilesImports';
/**
 * The token of the variables the environment's name is read from (AOS_ENVIRONMENT; code-house-rules 12.14): the
 * process's, unless a test gives others. It decides the publishing limit of S1-F06-T01.
 */
export const FILES_IMPORTS_ENVIRONMENT = 'files-imports.Environment';

/**
 * The files-imports module (module-map 4.7): tier 1, uses `access`, `audit`, `numbering` and `kernel`. It holds the
 * stored files, their receipts and the attachments that link a file to a record of any module as evidence
 * (S1-F06-T05), and imports: the import upload, layouts and mappings, batches with their staged rows, and publishing
 * through the handlers the target modules register at start under IMPORT_HANDLERS (S1-F06-T01). Batch codes come from
 * `numbering` (GC9-9). The file store is read from the environment at start: with none set, storing and reading a file
 * are unavailable and say so (nothing is on by default; code-house-rules 12.14).
 */
@Module({
  imports: [CommandRunnerModule, LoggingModule, AccessModule, AccessContractsModule, AuditModule, NumberingModule],
  controllers: [FilesController, ImportsController],
  providers: [
    { provide: FILES_IMPORTS_ENVIRONMENT, useValue: process.env },
    // The target modules' import handlers, which they register with at start (13.2; module-map 4.7).
    { provide: IMPORT_HANDLERS, useFactory: () => new ImportHandlers() },
    {
      provide: IMPORT_DEPENDENCIES,
      useFactory: (
        runner: CommandRunner,
        helper: IdempotencyHelper,
        access: AccessInterface,
        audit: AuditInterface,
        keys: OrganisationKeys,
        fileStore: FileStoreHandle,
        logger: StructuredLogger,
        numbering: NumberingInterface,
        handlers: ImportHandlers,
        env: Readonly<Record<string, string | undefined>>,
      ): ImportDependencies => ({
        runner,
        helper,
        access,
        audit,
        keys,
        fileStore,
        logger,
        numbering,
        handlers,
        environment: deploymentEnvironmentFromEnvironment(env),
      }),
      inject: [
        COMMAND_RUNNER,
        IDEMPOTENCY_HELPER,
        ACCESS,
        AUDIT,
        ORGANISATION_KEYS,
        FILE_STORE,
        LOGGER,
        NUMBERING,
        IMPORT_HANDLERS,
        FILES_IMPORTS_ENVIRONMENT,
      ],
    },
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
  exports: [FILES_IMPORTS, ATTACHED_RECORD_READERS, IMPORT_HANDLERS],
})
export class FilesImportsModule implements OnApplicationShutdown {
  constructor(@Inject(FILE_STORE) private readonly fileStore: FileStoreHandle) {}

  onApplicationShutdown(): void {
    if (this.fileStore.kind === 'configured' && this.fileStore.store instanceof S3FileStore) {
      this.fileStore.store.destroy();
    }
  }
}
