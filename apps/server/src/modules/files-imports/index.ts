// Public interface of the files-imports module (module-map 4.7). Other code imports only from here.
export { FILES_IMPORTS, FILES_IMPORTS_ENVIRONMENT, FilesImportsModule } from './files-imports.module.js';
export type { FilesImportsInterface } from './files-imports.js';
export { decisionEvidence, policyEvidence } from './files-imports.js';
export { ATTACHED_RECORD_READERS, AttachedRecordReaders } from './contracts/record-readers.js';
export type { AttachedRecordReader } from './contracts/record-readers.js';
export type { Attached, AttachedRecord, AttachRequest, EvidenceKind } from './commands/attach.js';
export { FILE_STORE, FILE_STORE_ENVIRONMENT } from './file-store/file-store.js';
export type { FileStore, FileStoreHandle } from './file-store/file-store.js';
export { FILE_STORE_VARIABLES } from './file-store/s3-file-store.js';
// The import handler contract the target modules implement and register at start (imports-and-opening-data 13.2;
// module-map 4.7; S1-F06-T01), and the batch code kind the composition root hands to `numbering` (GC9-9).
export { IMPORT_HANDLERS, ImportHandlers } from './contracts/import-handlers.js';
export type {
  HandlerDocument,
  HandlerPublished,
  HandlerRow,
  ImportField,
  ImportHandler,
  ImportPublisher,
  ImportSource,
} from './contracts/import-handlers.js';
export type { StagedValue, SuppliedOrigin } from './domain/staging.js';
export { IMPORT_BATCH_KIND, IMPORT_BATCH_SCOPE_KEY } from './domain/batch-code.js';
