import { z } from 'zod';
import { businessDateSchema, displayNameSchema, idSchema, personasHeldSchema } from './common.js';
import { approvalRequestStateSchema, limitAuthoritySchema, moneyBasisSchema } from './approvals.js';
import { assignmentScopeSchema, permissionSchema } from './roles.js';
import { settingOriginSchema } from './settings.js';

// The reads behind the access setup screens (access-and-approvals 2.1, 4, 5, 9.5, 14; S1-F01-T16; RR-326): users,
// roles, role assignments and approve and reject reasons, each with every version and the state the screen shows
// (docs/plan/stage-1/s1-f01-first-access/spec.md section 6; design-language 7). Each answers the time it was read
// (PRD-PRF-004).

/**
 * The state of one version of a user, role or reason, or of one role assignment (design-language 7; DM-4, DEC-105,
 * DEC-117; code-house-rules 7.3): Awaiting approval; Superseded, when a newer version ended its request (9.6);
 * Scheduled, approved with a later start; In force; Ended; Rejected; Withdrawn, never in force. A separate Draft
 * before submission is not built (RR-292).
 */
export const recordStateSchema = z.enum([
  'Awaiting approval',
  'Superseded',
  'Scheduled',
  'In force',
  'Ended',
  'Rejected',
  'Withdrawn',
]);
export type RecordState = z.infer<typeof recordStateSchema>;

/** What every version shows: its dates, half-open [validFrom, validTo), its state and its latest approval request. */
const versionFields = {
  id: idSchema,
  validFrom: businessDateSchema,
  validTo: businessDateSchema.optional(),
  state: recordStateSchema,
  /** The latest approval request of the version, for the approval panel; absent for a version setup wrote. */
  request: z.strictObject({ id: idSchema, state: approvalRequestStateSchema }).optional(),
};

const asOf = z.iso.datetime({ offset: true });

/**
 * A user with every version (access-and-approvals 2.1; DEC-112): its details, personas held, in order, and the user's
 * state that version sets (Active, Disabled or Ended; RR-214), besides the version's own state. Newest version first.
 */
export const userRecordSchema = z.strictObject({
  id: idSchema,
  login: z.string().min(1),
  versions: z.array(
    z.strictObject({
      ...versionFields,
      displayName: displayNameSchema,
      personas: personasHeldSchema,
      userState: z.enum(['Active', 'Disabled', 'Ended']),
    }),
  ),
});
export type UserRecord = z.infer<typeof userRecordSchema>;
export const userListSchema = z.strictObject({ asOf, users: z.array(userRecordSchema) });
export type UserList = z.infer<typeof userListSchema>;

/** A role with every version and its explicit permissions (access-and-approvals 4.1, 4.2; POL-02.01, POL-02.03). */
export const roleRecordSchema = z.strictObject({
  id: idSchema,
  code: z.string().min(1),
  selfService: z.boolean(),
  versions: z.array(
    z.strictObject({
      ...versionFields,
      name: z.string().min(1),
      permissions: z.array(permissionSchema),
    }),
  ),
});
export type RoleRecord = z.infer<typeof roleRecordSchema>;
export const roleListSchema = z.strictObject({ asOf, roles: z.array(roleRecordSchema) });
export type RoleList = z.infer<typeof roleListSchema>;

/**
 * A role assignment (access-and-approvals 4.3, 5): the actor with the name the screen shows, the role, the scope per
 * dimension, its dates and state, and its withdrawal while one is prepared or decided (RR-202, CH-11).
 */
export const assignmentRecordSchema = z.strictObject({
  ...versionFields,
  actor: z.discriminatedUnion('kind', [
    z.strictObject({ kind: z.literal('user'), userId: idSchema, name: z.string().min(1).nullable() }),
    z.strictObject({ kind: z.literal('service-identity'), serviceIdentityId: idSchema, code: z.string().min(1) }),
  ]),
  role: z.strictObject({ id: idSchema, code: z.string().min(1) }),
  scope: assignmentScopeSchema,
  withdrawal: z
    .strictObject({
      id: idSchema,
      versionId: idSchema,
      reason: z.string().min(1),
      /** A withdrawal is a document with no dates of its own (code-house-rules 7.2): its decision shows. */
      decision: z.enum(['Awaiting approval', 'Approved', 'Rejected']),
      request: versionFields.request,
    })
    .optional(),
});
export type AssignmentRecord = z.infer<typeof assignmentRecordSchema>;
export const assignmentListSchema = z.strictObject({ asOf, assignments: z.array(assignmentRecordSchema) });
export type AssignmentList = z.infer<typeof assignmentListSchema>;

/** An approve or reject reason with every version (access-and-approvals 9.5; POL-02.23). */
export const reasonRecordSchema = z.strictObject({
  id: idSchema,
  code: z.string().min(1),
  kind: z.enum(['approve', 'reject']),
  versions: z.array(z.strictObject({ ...versionFields, text: z.string().min(1) })),
});
export type ReasonRecord = z.infer<typeof reasonRecordSchema>;
export const reasonListSchema = z.strictObject({ asOf, reasons: z.array(reasonRecordSchema) });
export type ReasonList = z.infer<typeof reasonListSchema>;

/**
 * An approval limit (access-and-approvals 9.2, 14; POL-02.09, POL-02.15; S1-F05-T01): its action type and the basis
 * beside it (PRD-ACS-015), its holder, a role within a scope or a named user through one assignment, its authority,
 * with explicit authority over Unknown value apart (PRD-ACS-016), its dates and state. Each row is its own version
 * (code-house-rules 7.3).
 */
export const approvalLimitRecordSchema = z.strictObject({
  ...versionFields,
  actionType: z.string().min(1),
  basis: moneyBasisSchema,
  holder: z.discriminatedUnion('kind', [
    z.strictObject({
      kind: z.literal('role'),
      role: z.strictObject({ id: idSchema, code: z.string().min(1) }),
      scope: assignmentScopeSchema,
    }),
    z.strictObject({
      kind: z.literal('individual'),
      userId: idSchema,
      name: z.string().min(1).nullable(),
      roleAssignmentId: idSchema,
      role: z.strictObject({ id: idSchema, code: z.string().min(1) }),
    }),
  ]),
  limit: limitAuthoritySchema,
  coversUnknown: z.boolean(),
  origin: settingOriginSchema,
});
export type ApprovalLimitRecord = z.infer<typeof approvalLimitRecordSchema>;

/**
 * Setup › Approval limits (access-and-approvals 14): every limit, newest first, and the action types a limit can be
 * set for, those whose approval rule has a value basis, each with its basis (8; DM-8). An empty list grants nothing.
 */
export const approvalLimitListSchema = z.strictObject({
  asOf,
  actionTypes: z.array(z.strictObject({ actionType: z.string().min(1), basis: moneyBasisSchema })),
  limits: z.array(approvalLimitRecordSchema),
  /** The cursor of the next page, or null on the last (code-house-rules 12.1). */
  next: idSchema.nullable(),
});
export type ApprovalLimitList = z.infer<typeof approvalLimitListSchema>;
