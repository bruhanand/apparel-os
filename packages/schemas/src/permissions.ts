import type { FieldClass, PermissionAction } from './roles.js';

// The permission registry (access-and-approvals 4.1, 5.3, 5.4). Each module declares here its record types, the
// actions each takes and the scope facts each record carries; a new record type or action is added by a reviewed code
// change, never at run time. The server checks role permissions against it and builds effective grants from it; the
// web shell names the record types its screens need from it (RR-261). A permission on a record type that is not
// declared here grants nothing.

/**
 * Which scope facts a record of the type carries (access-and-approvals 5.3). A dimension it does not carry is not
 * checked; a dimension it carries but a record leaves empty is Unknown, covered only by all-members scope
 * (PRD-MOD-015). `place` covers the Site, the Store and the business unit (7.2).
 */
export interface ScopeFactsDeclared {
  readonly legalEntity: boolean;
  readonly place: boolean;
  readonly brand: boolean;
}

/** One record type as its module declares it (access-and-approvals 4.1). */
export interface RecordTypeDeclaration {
  /** `<module>.<record>`, in lower-case snake_case after the module. */
  readonly code: string;
  readonly actions: readonly PermissionAction[];
  readonly scopeFacts: ScopeFactsDeclared;
  /**
   * Whether a record of the type has a subject person, so own-record scope can cover it (5.4). Only such a type can
   * carry a self-service permission (PRD-ACS-022).
   */
  readonly subject: boolean;
  /** The restricted field classes its fields belong to (access-and-approvals 4.1, 6). */
  readonly fieldClasses: readonly FieldClass[];
}

const NONE: ScopeFactsDeclared = { legalEntity: false, place: false, brand: false };
const ALL: ScopeFactsDeclared = { legalEntity: true, place: true, brand: true };
const PREPARED: readonly PermissionAction[] = ['view', 'create', 'edit', 'approve'];

function declare<const Code extends string>(
  code: Code,
  actions: readonly PermissionAction[],
  scopeFacts: ScopeFactsDeclared,
): RecordTypeDeclaration & { readonly code: Code } {
  return { code, actions, scopeFacts, subject: false, fieldClasses: [] };
}

/**
 * `access`: the records of access changes, each prepared and approved by a different authorised person
 * (access-and-approvals 9.11; POL-02.07). They belong to the Organisation as a whole, so they carry no scope fact: the
 * permission on the type decides (5.3). The approval request and decision are read only; `access.effective_grant` is
 * rebuilt by the scheduled job when a start or end date passes (7.2).
 */
const accessRecordTypes = [
  declare('access.user', PREPARED, NONE),
  declare('access.role', PREPARED, NONE),
  declare('access.role_assignment', PREPARED, NONE),
  declare('access.approval_rule_setting', PREPARED, NONE),
  declare('access.approval_reason', PREPARED, NONE),
  declare('access.approval_request', ['view'], NONE),
  declare('access.approval_decision', ['view'], NONE),
  declare('access.effective_grant', ['edit'], NONE),
] as const;

/**
 * `audit` (numbering-and-audit 4.5, 5; access-and-approvals 9.11). `audit.audit_record` is the history of records: an
 * audit row is read only by a reader who holds view on it and, through one grant, on the audited record's own type
 * covering the row's facts, so history never reaches past the records the reader may see (RR-242). The access
 * records carry the facts of the place where they happened; a sign-in has none, so only all-members scope reads it
 * (the Organisation-wide view of 9.11). Sensitive-access and device records are types apart, which neither first role
 * holds (9.11). The seal and partition types are for the audit jobs (RR-273).
 */
const auditRecordTypes = [
  declare('audit.audit_record', ['view'], NONE),
  declare('audit.access_record', ['view'], ALL),
  declare('audit.sensitive_access_record', ['view'], ALL),
  declare('audit.device_access_record', ['view'], ALL),
  declare('audit.audit_seal', ['view', 'create'], NONE),
  declare('audit.audit_partition', ['view'], NONE),
] as const;

/** `kernel`: the outbox, which the outbox processor dispatches (code-house-rules 12.8; RR-273). */
const kernelRecordTypes = [declare('kernel.outbox_event', ['view', 'edit'], NONE)] as const;

/** Every record type declared so far. */
export const permissionRegistry: readonly RecordTypeDeclaration[] = [
  ...accessRecordTypes,
  ...auditRecordTypes,
  ...kernelRecordTypes,
];

/** The code of a declared record type. */
export type RecordTypeCode =
  | (typeof accessRecordTypes)[number]['code']
  | (typeof auditRecordTypes)[number]['code']
  | (typeof kernelRecordTypes)[number]['code'];

/** A registry, as `access` reads it: the declarations by code. */
export function registryByCode(
  registry: readonly RecordTypeDeclaration[] = permissionRegistry,
): ReadonlyMap<string, RecordTypeDeclaration> {
  const map = new Map<string, RecordTypeDeclaration>();
  for (const declaration of registry) {
    if (map.has(declaration.code)) throw new Error(`Record type ${declaration.code} is declared twice`);
    map.set(declaration.code, declaration);
  }
  return map;
}
