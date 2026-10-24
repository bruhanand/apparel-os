import type { FieldClass, MissingItem, PermissionAction, RecordTypeDeclaration } from '@apparel-os/schemas';
import type { CommandRefusal, ReplayAccessRefusal, TransactionContext } from '../../../kernel/index.js';
import { scopeCoversMove, type AssignmentInForce, type RecordFacts, type StoredPermission } from '../domain/scope.js';
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

/**
 * A refusal of a route's access checks as a replay answers it (code-house-rules 12.3, 12.4 "Replay"; CH-14), keeping
 * its own kind: not found for a record the actor may not view, which never says the record exists (PRD-SEC-005), and
 * not authorised for an authority that no longer holds. Authorising a replay reruns no availability check or
 * validation: any other refusal on the way means Authorise cannot be asked now, as with no business date while no
 * timezone is in force, which admits no grant (code-house-rules 6.2), or facts of a record that no longer has them, so
 * the replay is not authorised, naming what is missing.
 */
export function replayRefusal(refusal: CommandRefusal): ReplayAccessRefusal {
  if (refusal.kind === 'not-found' || refusal.kind === 'not-authorised') {
    return { kind: refusal.kind, code: refusal.code, missing: refusal.missing };
  }
  return { kind: 'not-authorised', code: 'access.not-authorised', missing: refusal.missing };
}

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

/**
 * Every assignment in force that Authorise would accept for the request, not only the first: for who may decide a
 * valued request, whose approve and limit must come through one assignment (access-and-approvals 9.3; PRD-ACS-004;
 * S1-F05-T01). Answers them, or Authorise's refusal when none is.
 */
export async function authorisingAssignments(
  context: TransactionContext,
  registry: ReadonlyMap<string, RecordTypeDeclaration>,
  request: AuthoriseRequest,
): Promise<Refused | { readonly kind: 'allowed'; readonly assignments: readonly AssignmentInForce[] }> {
  const granting = await grantingAssignments(context, registry, request);
  if (granting.kind === 'refused') return granting;
  const facts = request.facts ?? {};
  const allowed = granting.assignments.filter(
    (assignment) =>
      authoriseFacts({ ...granting, assignments: [assignment] }, request, facts, request.movesTo).kind === 'allowed',
  );
  if (allowed.length === 0) return authoriseFacts(granting, request, facts, request.movesTo) as Refused;
  return { kind: 'allowed', assignments: allowed };
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

/**
 * Authorise the restricted field classes alone, for a reader the record's owning module admitted without any grant on
 * its type, such as an exception's owner (imports-and-opening-data 11 "As built"; product owner, 9 Oct 2026, RR-452):
 * one assignment in force today whose scope covers the record's facts and whose role grants every class used (5.3,
 * 6). Each assignment on its own, as Authorise checks them (PRD-ACS-004). A refusal names the class missing.
 */
export async function authoriseFieldClasses(
  context: TransactionContext,
  registry: ReadonlyMap<string, RecordTypeDeclaration>,
  request: {
    readonly actorId: string;
    readonly recordType: string;
    readonly facts: RecordFacts;
    readonly fieldClasses: readonly FieldClassUse[];
  },
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
  const first = request.fieldClasses[0];
  const classMissing: MissingItem[] =
    first === undefined ? [] : [{ kind: 'field-class', fieldClass: first.fieldClass, use: first.use }];
  if (declaration === undefined) return notAuthorised(classMissing);
  const assignments = await assignmentsInForce(context, today.date, request.actorId);
  if (assignments.length === 0) return notAuthorised(classMissing);
  return authoriseFacts(
    { kind: 'granting', declaration, assignments },
    { actorId: request.actorId, action: 'view', recordType: request.recordType, fieldClasses: request.fieldClasses },
    request.facts,
    undefined,
  );
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

/**
 * The reader check a restore makes of every attachment (backup-and-restore 5.1 "Attachments", 4.2 step 7; PRD-SEC-005,
 * PRD-ACP-019; S1-F14-T03): Authorise's own rule for viewing the attached record, put to two synthetic readers held
 * only in memory, never written to the restored database. The authorised one holds view on the record type with
 * all-members scope and every restricted class the attachment carries, and must be allowed; the outsider holds view on
 * it with a scope covering another place than the record's, or another legal entity or brand where the type carries no
 * place, or, for a type that carries no scope fact, no view on it, and must be refused. A record type the registry does
 * not declare is read by no one, so its attachment fails the check.
 */
export function syntheticReaderCheck(
  registry: ReadonlyMap<string, RecordTypeDeclaration>,
  record: { readonly recordType: string; readonly facts: RecordFacts; readonly fieldClasses: readonly FieldClass[] },
): { readonly authorisedAllowed: boolean; readonly outsiderRefused: boolean } {
  const declaration = registry.get(record.recordType);
  const request = {
    actorId: 'synthetic-reader',
    action: 'view' as const,
    recordType: record.recordType,
    fieldClasses: record.fieldClasses.map((fieldClass) => ({ fieldClass, use: 'view' as const })),
  };
  if (declaration?.actions.includes('view') !== true) return { authorisedAllowed: false, outsiderRefused: true };
  const permissions: StoredPermission[] = [
    { kind: 'action', recordType: record.recordType, action: 'view' },
    ...record.fieldClasses.map((fieldClass) => ({ kind: 'field-class' as const, fieldClass, fieldAccess: 'view' })),
  ];
  const all = { kind: 'all' } as const;
  const elsewhere = '00000000-0000-7000-8000-000000000000';
  const reader = (scope: AssignmentInForce['scope']): Granting => ({
    kind: 'granting',
    declaration,
    assignments: [{ assignmentId: 'synthetic', actorId: request.actorId, roleId: 'synthetic', scope, permissions }],
  });
  const authorised = authoriseFacts(
    reader({ kind: 'dimensions', legalEntity: all, place: all, brand: all }),
    request,
    record.facts,
    undefined,
  );
  const declared = declaration.scopeFacts;
  const outsiderScope: AssignmentInForce['scope'] | undefined = declared.place
    ? {
        kind: 'dimensions',
        legalEntity: all,
        place: { kind: 'selected', members: [{ type: 'site', id: elsewhere }] },
        brand: all,
      }
    : declared.legalEntity
      ? { kind: 'dimensions', legalEntity: { kind: 'selected', members: [elsewhere] }, place: all, brand: all }
      : declared.brand
        ? { kind: 'dimensions', legalEntity: all, place: all, brand: { kind: 'selected', members: [elsewhere] } }
        : undefined;
  const outsider =
    outsiderScope === undefined
      ? ({ kind: 'refused' } as const)
      : authoriseFacts(reader(outsiderScope), request, record.facts, undefined);
  return { authorisedAllowed: authorised.kind === 'allowed', outsiderRefused: outsider.kind === 'refused' };
}
