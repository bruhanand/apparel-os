// Public interface of the audit module (module-map 4.5). Other code imports only from here.
export { AUDIT, AuditModule } from './audit.module.js';
export { Audit } from './audit.js';
export type {
  AccessEntry,
  AuditActor,
  AuditedRecord,
  AuditEntry,
  AuditHistoryEntry,
  AuditInterface,
  AuditRecordReference,
  AuditScope,
  AuditSource,
  HistoryQuery,
  PartitionCoverage,
  PlainAccessKind,
  SealProblem,
} from './contracts.js';
export { AUDIT_CHANGES_FORMAT, AuditChangeRefused } from './domain/changes.js';
export { AUDIT_JOBS_IDENTITY, auditJobKinds } from './jobs/job-kinds.js';
export type { AuditChange, VersionReference } from './domain/changes.js';
