import { z } from 'zod';
import { businessDateSchema, idSchema } from './common.js';

// Permissions, roles, role assignments and scope (access-and-approvals 4 and 5).

/**
 * POL-02.03: the explicit actions. Broad labels such as All, Full or Manage are expanded before saving and are
 * never stored, so this list refuses them.
 */
export const permissionActionSchema = z.enum(['view', 'create', 'edit', 'approve', 'cancel', 'export', 'override']);
export type PermissionAction = z.infer<typeof permissionActionSchema>;

/** The restricted field classes (PRD-ACS-008, PRD-SEC-010; access-and-approvals 4.1). */
export const fieldClassSchema = z.enum([
  'salary-and-payroll',
  'identity-documents',
  'bank-details',
  'customer-contact',
  'cost',
  'margin',
  'employee-photos',
  'location-evidence',
]);
export type FieldClass = z.infer<typeof fieldClassSchema>;

/** A record type as a module declares it in the permission registry (access-and-approvals 4.1). */
export const recordTypeSchema = z.string().min(1);

/**
 * One permission: an action on a record type, or a field class (POL-02.03, POL-02.04, PRD-ACS-008). Whether it is
 * a self-service permission is always stated, never defaulted (PRD-ACS-022, DEC-100).
 */
export const permissionSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('action'),
    recordType: recordTypeSchema,
    action: permissionActionSchema,
    selfService: z.boolean(),
  }),
  z.strictObject({
    kind: z.literal('field-class'),
    fieldClass: fieldClassSchema,
    access: z.enum(['view', 'view-and-edit']),
    selfService: z.boolean(),
  }),
]);
export type Permission = z.infer<typeof permissionSchema>;

/**
 * A role draft: a code unique in the Organisation, a name, its permissions and the start of the version (POL-02.01;
 * access-and-approvals 4.2). A role that holds a self-service permission holds nothing else (PRD-ACS-022, DEC-100),
 * and whether a role is a self-service role is fixed when it is created (access-and-approvals 13.1).
 */
const roleFields = {
  code: z.string().min(1),
  name: z.string().min(1),
  permissions: z.array(permissionSchema),
  /** The first day of the version, today or later under the Organisation's timezone (GC2-7, DEC-105). */
  validFrom: businessDateSchema,
};

function selfServiceAlone(role: { readonly permissions: readonly Permission[] }): boolean {
  const selfService = role.permissions.filter((permission) => permission.selfService).length;
  return selfService === 0 || selfService === role.permissions.length;
}

const SELF_SERVICE_ALONE = {
  message: 'A role with a self-service permission holds no other permission (PRD-ACS-022)',
  path: ['permissions'],
};

export const roleDraftSchema = z.strictObject(roleFields).refine(selfServiceAlone, SELF_SERVICE_ALONE);
export type RoleDraft = z.infer<typeof roleDraftSchema>;

/** A place member of a scope: a Site, a Store or a business unit (PRD-ACS-021, DEC-094). */
export const placeMemberSchema = z.strictObject({
  type: z.enum(['site', 'store', 'business-unit']),
  id: idSchema,
});

/**
 * One dimension of a scope (PRD-ACS-005, POL-02.02): all members, which includes later members; selected members,
 * which stay fixed and name at least one; or empty, which grants nothing. Empty is stated, never inferred from an
 * empty selection.
 */
function dimensionScopeSchema<Member extends z.ZodType>(member: Member) {
  return z.discriminatedUnion('kind', [
    z.strictObject({ kind: z.literal('all') }),
    z.strictObject({ kind: z.literal('selected'), members: z.array(member).min(1) }),
    z.strictObject({ kind: z.literal('empty') }),
  ]);
}

/**
 * A role assignment's scope: the three dimensions, or own-record scope, which has no dimension and belongs only to
 * an assignment of the self-service role (PRD-ACS-001, PRD-ACS-021, PRD-ACS-022; access-and-approvals 5.1, 5.4).
 */
export const assignmentScopeSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('dimensions'),
    legalEntity: dimensionScopeSchema(idSchema),
    place: dimensionScopeSchema(placeMemberSchema),
    brand: dimensionScopeSchema(idSchema),
  }),
  z.strictObject({ kind: z.literal('own-records') }),
]);
export type AssignmentScope = z.infer<typeof assignmentScopeSchema>;

/** PRD-ACS-005: a scope empty in any dimension grants nothing; the assignment editor warns of it. */
export function scopeGrantsNothing(scope: AssignmentScope): boolean {
  return (
    scope.kind === 'dimensions' &&
    (scope.legalEntity.kind === 'empty' || scope.place.kind === 'empty' || scope.brand.kind === 'empty')
  );
}

/**
 * A role assignment draft: an actor, a role, a scope and effective dates, half-open [validFrom, validTo)
 * (PRD-ACS-005, PRD-MOD-010; code-house-rules 7.3). A start in the past, an overlap with an approved assignment of
 * the same actor, role and exact scope (DEC-112, CH-7), and a self-service role with any other scope are refused
 * by `access`, which knows today and the role (access-and-approvals 4.3, 5.4).
 */
export const roleAssignmentDraftSchema = z
  .strictObject({
    actor: z.discriminatedUnion('kind', [
      z.strictObject({ kind: z.literal('user'), userId: idSchema }),
      z.strictObject({ kind: z.literal('service-identity'), serviceIdentityId: idSchema }),
    ]),
    roleId: idSchema,
    scope: assignmentScopeSchema,
    validFrom: businessDateSchema,
    validTo: businessDateSchema.optional(),
  })
  .refine((draft) => draft.validTo === undefined || draft.validTo > draft.validFrom, {
    message: 'An assignment ends after it starts',
    path: ['validTo'],
  });
export type RoleAssignmentDraft = z.infer<typeof roleAssignmentDraftSchema>;

/** A new version of an existing role: its name, its permissions and its start (access-and-approvals 4.2). */
export const roleVersionDraftSchema = z
  .strictObject({ name: roleFields.name, permissions: roleFields.permissions, validFrom: roleFields.validFrom })
  .refine(selfServiceAlone, SELF_SERVICE_ALONE);
export type RoleVersionDraft = z.infer<typeof roleVersionDraftSchema>;

/**
 * A withdrawal of a Scheduled role assignment before its start: a document with its reason (access-and-approvals
 * 4.3, 13.1; code-house-rules 7.3; RR-202, CH-11).
 */
export const assignmentWithdrawalDraftSchema = z.strictObject({ reason: z.string().min(1) });
export type AssignmentWithdrawalDraft = z.infer<typeof assignmentWithdrawalDraftSchema>;

/** What preparing a role answers: the role and its draft version. */
export const rolePreparedSchema = z.strictObject({ roleId: idSchema, versionId: idSchema, requestId: idSchema });
/** What preparing a role assignment answers. */
export const assignmentPreparedSchema = z.strictObject({ assignmentId: idSchema, requestId: idSchema });
/** What preparing a withdrawal answers: the withdrawal and its draft version. */
export const withdrawalPreparedSchema = z.strictObject({
  withdrawalId: idSchema,
  versionId: idSchema,
  requestId: idSchema,
});

/** One effective grant as the shell reads it: an action on a record type (access-and-approvals 7.2; RR-261). */
export const grantSchema = z.strictObject({ recordType: recordTypeSchema, action: permissionActionSchema });
export type GrantView = z.infer<typeof grantSchema>;
