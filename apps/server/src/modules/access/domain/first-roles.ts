import type { PermissionAction, RecordTypeCode } from '@apparel-os/schemas';

// The two roles the setup step creates (access-and-approvals 9.11, the matrix; DEC-112 baseline; KDPS Owner confirms,
// V-01). Each is a list of explicit actions on record types of the permission registry (POL-02.03): no broad label,
// no field class (so every restricted field stays masked to both, 6), no own-record scope and no self-service
// permission (5.4). Cancel, export and override are never granted; approve never to the first Admin; create and edit
// never to the first approver, so the first approver can never be a preparer (PRD-ACS-006, POL-02.08). The essential
// security settings (access-and-approvals 3.3) are prepared (edit) by the first Admin and approved by the first approver
// (DEC-120, RR-402).

/** One permission: an action on a declared record type. */
export interface FirstRolePermission {
  readonly recordType: RecordTypeCode;
  readonly action: PermissionAction;
}

/** The records of access changes the first Admin prepares and the first approver decides (9.11). */
const PREPARED_TYPES: readonly RecordTypeCode[] = [
  'access.user',
  'access.role',
  'access.role_assignment',
  'access.approval_rule_setting',
  'access.approval_reason',
];

/**
 * Read by both: the approval requests and decisions, and the history of the records above and of sign-ins, sessions,
 * second-factor and password events and permission changes (9.11; numbering-and-audit 4, 5.1). Sensitive-access and
 * device records are types apart, which neither holds.
 */
const VIEWED_TYPES: readonly RecordTypeCode[] = [
  'access.approval_request',
  'access.approval_decision',
  'audit.audit_record',
  'audit.access_record',
];

function each(types: readonly RecordTypeCode[], actions: readonly PermissionAction[]): FirstRolePermission[] {
  return types.flatMap((recordType) => actions.map((action) => ({ recordType, action })));
}

/**
 * The first Admin: view, create and edit on the records of access changes; view and edit (prepare) on the essential
 * security settings, which are never created (DEC-120); view of their requests and history.
 */
export const FIRST_ADMIN_PERMISSIONS: readonly FirstRolePermission[] = [
  ...each(PREPARED_TYPES, ['view', 'create', 'edit']),
  ...each(['access.setting'], ['view', 'edit']),
  ...each(VIEWED_TYPES, ['view']),
];

/**
 * The first approver: view and approve on exactly what the first Admin prepares, the essential security settings
 * included (DEC-120); view of requests and history.
 */
export const FIRST_APPROVER_PERMISSIONS: readonly FirstRolePermission[] = [
  ...each(PREPARED_TYPES, ['view', 'approve']),
  ...each(['access.setting'], ['view', 'approve']),
  ...each(VIEWED_TYPES, ['view']),
];

/**
 * The codes and names of the two roles. Identifiers the step gives its own records, not business values: the KDPS
 * Owner may rename or replace the roles through an approved change (V-01).
 */
export const FIRST_ADMIN_ROLE = { code: 'first-admin', name: 'First Admin' } as const;
export const FIRST_APPROVER_ROLE = { code: 'first-approver', name: 'First approver of access changes' } as const;

/** The code of the internal service identity the setup step and the recovery command act under (9.11; 3.2). */
export const SETUP_IDENTITY = 'setup';
