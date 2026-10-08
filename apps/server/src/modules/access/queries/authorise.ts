import type { FieldClass, MissingItem, PermissionAction, RecordTypeDeclaration } from '@apparel-os/schemas';
import type { CommandRefusal, TransactionContext } from '../../../kernel/index.js';
import { scopeCoversMove, type AssignmentInForce, type RecordFacts } from '../domain/scope.js';
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
  /**
   * The facts a change under preparation or decision gives the record, where they differ from `facts`, such as a Store
   * version linking it to another Site: the one assignment must cover both (structure-and-masters 6.1; product owner,
   * 9 Oct 2026).
   */
  readonly movesTo?: RecordFacts;
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
  const granting = await grantingAssignments(context, registry, request);
  if (granting.kind === 'refused') return granting;
  return authoriseFacts(granting, request, request.facts ?? {}, request.movesTo);
}

/**
 * Authorise each of several records of one type for one action (7.1 step 3: "in a list, each row's"; RR-296): the
 * assignments in force are read once, and each record's facts are matched as Authorise matches them. Refused as a
 * whole when no assignment grants the action on the type at all, or today is not known.
 */
export async function authoriseEach(
  context: TransactionContext,
  registry: ReadonlyMap<string, RecordTypeDeclaration>,
  request: Omit<AuthoriseRequest, 'facts' | 'movesTo'>,
  facts: readonly RecordFacts[],
): Promise<Refused | { readonly kind: 'checked'; readonly each: Authorisation[] }> {
  const granting = await grantingAssignments(context, registry, request);
  if (granting.kind === 'refused') return granting;
  return { kind: 'checked', each: facts.map((each) => authoriseFacts(granting, request, each, undefined)) };
}

type Refused = Extract<Authorisation, { kind: 'refused' }>;

interface Granting {
  readonly kind: 'granting';
  readonly declaration: RecordTypeDeclaration;
  readonly assignments: readonly AssignmentInForce[];
}

/** The assignments in force today whose role grants the action on the record type, or the refusal (7.1 step 3). */
async function grantingAssignments(
  context: TransactionContext,
  registry: ReadonlyMap<string, RecordTypeDeclaration>,
  request: Omit<AuthoriseRequest, 'facts' | 'movesTo'>,
): Promise<Granting | Refused> {
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
  const assignments = (await assignmentsInForce(context, today.date, request.actorId)).filter((assignment) =>
    assignment.permissions.some(
      (permission) =>
        permission.kind === 'action' &&
        permission.recordType === request.recordType &&
        permission.action === request.action,
    ),
  );
  if (assignments.length === 0) return notAuthorised([permissionMissing]);
  return { kind: 'granting', declaration, assignments };
}

/**
 * The first granting assignment that covers the record's facts, and those a change moves it to, and grants every field
 * class used (5.3, 6).
 */
function authoriseFacts(
  granting: Granting,
  request: Omit<AuthoriseRequest, 'facts' | 'movesTo'>,
  facts: RecordFacts,
  movesTo: RecordFacts | undefined,
): Authorisation {
  let nearest: MissingItem | undefined;
  for (const assignment of granting.assignments) {
    const coverage = scopeCoversMove(assignment.scope, granting.declaration, request.actorId, facts, movesTo);
    if (!coverage.covered) {
      // The refusal names the place or legal entity missing, where the record carries it (PRD-UXP-003).
      nearest ??= {
        kind: 'scope',
        dimension: coverage.dimension,
        roleAssignmentId: assignment.assignmentId,
        ...(coverage.fact === undefined ? {} : { factType: coverage.fact.type, factId: coverage.fact.id }),
      };
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
  return notAuthorised([nearest ?? { kind: 'permission', recordType: request.recordType, action: request.action }]);
}

function notAuthorised(missing: MissingItem[]): Refused {
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
