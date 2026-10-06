import type { FieldClass, MissingItem, PermissionAction, RecordTypeDeclaration } from '@apparel-os/schemas';
import type { CommandRefusal, TransactionContext } from '../../../kernel/index.js';
import { scopeCovers, type AssignmentInForce, type RecordFacts } from '../domain/scope.js';
import { assignmentsInForce } from './assignments.js';

/** A restricted field class an action reads or writes (access-and-approvals 6). */
export interface FieldClassUse {
  readonly fieldClass: FieldClass;
  readonly use: 'view' | 'edit';
}

/** What Authorise is asked (access-and-approvals 7.1 step 3). */
export interface AuthoriseRequest {
  /** The user or service identity Authenticate found. */
  readonly actorId: string;
  readonly action: PermissionAction;
  readonly recordType: string;
  /** The record's scope facts, as its owning module passes them (5.3). */
  readonly facts?: RecordFacts;
  /** The restricted field classes the action reads or writes (6). */
  readonly fieldClasses?: readonly FieldClassUse[];
}

/**
 * Authorise's answer. `allowed` names the one role assignment that grants the action on the record type, covers the
 * record's facts and grants every field class used; the audit record and any approval decision store it (7.1 step 3).
 * `refused` says what is missing (PRD-UXP-003).
 */
export type Authorisation =
  | { readonly kind: 'allowed'; readonly roleAssignmentId: string }
  | { readonly kind: 'refused'; readonly refusal: CommandRefusal<'not-authorised' | 'unavailable'> };

/** Whether one assignment's role grants a field class for a use (4.1: view, or view and edit). */
function grantsFieldClass(assignment: AssignmentInForce, use: FieldClassUse): boolean {
  return assignment.permissions.some(
    (permission) =>
      permission.kind === 'field-class' &&
      permission.fieldClass === use.fieldClass &&
      (use.use === 'view' || permission.fieldAccess === 'view-and-edit'),
  );
}

/**
 * Authorise (access-and-approvals 7.1 step 3; PRD-ACS-001, PRD-ACS-004, PRD-INT-001): finds one role assignment in
 * force today, under the Organisation's timezone, whose role grants the action on the record type, whose scope covers
 * the record's facts (5.3, 5.4), and whose role grants every field class the action uses. Each assignment is checked
 * on its own, so separate assignments never combine to widen authority (PRD-ACS-004). A record type the registry does
 * not declare, or an action it does not take, is granted by no one (4.1). A persona grants nothing (PRD-ACS-002).
 *
 * A refusal names what is missing: the permission when no assignment grants it; otherwise the scope dimension or the
 * field class, and the assignment that nearly covers it (7.1; personas.md section 3; PRD-UXP-003).
 */
export async function authorise(
  context: TransactionContext,
  registry: ReadonlyMap<string, RecordTypeDeclaration>,
  request: AuthoriseRequest,
): Promise<Authorisation> {
  const today = await context.businessDate();
  if (today.kind === 'not-set') {
    return {
      kind: 'refused',
      refusal: {
        kind: 'unavailable',
        code: 'access.business-date-not-set',
        missing: [{ kind: 'setting', setting: 'configuration.timezone' }],
      },
    };
  }
  const declaration = registry.get(request.recordType);
  const permissionMissing: MissingItem = { kind: 'permission', recordType: request.recordType, action: request.action };
  if (declaration?.actions.includes(request.action) !== true) return notAuthorised([permissionMissing]);
  const granting = (await assignmentsInForce(context, today.date, request.actorId)).filter((assignment) =>
    assignment.permissions.some(
      (permission) =>
        permission.kind === 'action' &&
        permission.recordType === request.recordType &&
        permission.action === request.action,
    ),
  );
  if (granting.length === 0) return notAuthorised([permissionMissing]);
  let nearest: MissingItem | undefined;
  for (const assignment of granting) {
    const coverage = scopeCovers(assignment.scope, declaration, request.actorId, request.facts ?? {});
    if (!coverage.covered) {
      nearest ??= { kind: 'scope', dimension: coverage.dimension, roleAssignmentId: assignment.assignmentId };
      continue;
    }
    const missingClass = (request.fieldClasses ?? []).find((use) => !grantsFieldClass(assignment, use));
    if (missingClass !== undefined) {
      nearest ??= {
        kind: 'field-class',
        fieldClass: missingClass.fieldClass,
        use: missingClass.use,
        roleAssignmentId: assignment.assignmentId,
      };
      continue;
    }
    return { kind: 'allowed', roleAssignmentId: assignment.assignmentId };
  }
  return notAuthorised([nearest ?? permissionMissing]);
}

function notAuthorised(missing: MissingItem[]): Authorisation {
  return { kind: 'refused', refusal: { kind: 'not-authorised', code: 'access.not-authorised', missing } };
}

/**
 * The Restrict-fields hook (access-and-approvals 6; PRD-ACS-004, PRD-ACS-008; for S1-F03): of the field classes a
 * record holds, which the assignment Authorise used grants for a use, and which stay masked. A restricted field is
 * shown only when the same assignment that grants the action grants its field class.
 */
export async function restrictFields(
  context: TransactionContext,
  request: {
    readonly roleAssignmentId: string;
    readonly actorId: string;
    readonly fieldClasses: readonly FieldClass[];
  },
  use: 'view' | 'edit',
): Promise<{ readonly granted: FieldClass[]; readonly masked: FieldClass[] }> {
  const today = await context.businessDate();
  const assignment =
    today.kind === 'not-set'
      ? undefined
      : (await assignmentsInForce(context, today.date, request.actorId)).find(
          (each) => each.assignmentId === request.roleAssignmentId,
        );
  const granted: FieldClass[] = [];
  const masked: FieldClass[] = [];
  for (const fieldClass of request.fieldClasses) {
    if (assignment !== undefined && grantsFieldClass(assignment, { fieldClass, use })) granted.push(fieldClass);
    else masked.push(fieldClass);
  }
  return { granted, masked };
}
