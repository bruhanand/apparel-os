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
export { backupFileName, copyOrganisationFiles } from './file-store/backup-copy.js';
export type { FileCopyOutcome } from './file-store/backup-copy.js';
// The import handler contract the target modules implement and register at start (imports-and-opening-data 13.2;
// module-map 4.7; S1-F06-T01), and the batch code kind the composition root hands to `numbering` (GC9-9).
export { IMPORT_HANDLERS, ImportHandlers, knownValue } from './contracts/import-handlers.js';
export { closeSuggestions, MOST_SUGGESTIONS, optionSuggestions } from './domain/suggestions.js';
export type {
  HandlerDocument,
  HandlerPublished,
  HandlerRow,
  ImportField,
  ImportHandler,
  ImportMeasure,
  ImportNeed,
  ImportPublisher,
  ImportReview,
  ImportRevisions,
  ImportSource,
} from './contracts/import-handlers.js';
export type { StagedValue, SuppliedOrigin } from './domain/staging.js';
export type { EffectiveValue } from './domain/report.js';
// The approval rules and decision effects of layout, mapping and mapping rule versions (imports-and-opening-data 6.4;
// S1-F06-T03), and the event a confirmation emits (13.3).
export { filesImportsApprovals } from './commands/effects.js';
export { importFailed, importPublished, mappingConfirmed } from './events.js';
export { IMPORT_BATCH_KIND, IMPORT_BATCH_SCOPE_KEY } from './domain/batch-code.js';
export { filesImportsRestoreParticipant } from './restore-participant.js';
