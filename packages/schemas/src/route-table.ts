import { z } from 'zod';
import { errorCodes, type ErrorCode } from './errors.js';
import { healthResponseSchema } from './health.js';
import {
  enrolmentConfirmRequestSchema,
  enrolmentConfirmResponseSchema,
  enrolmentStartRequestSchema,
  enrolmentStartResponseSchema,
  passwordChangeRequestSchema,
  passwordChangeResponseSchema,
  sessionViewSchema,
  signInOutcomeSchema,
  signInRequestSchema,
} from './sign-in.js';
import { idSchema } from './common.js';
import {
  assignmentPreparedSchema,
  assignmentWithdrawalDraftSchema,
  roleAssignmentDraftSchema,
  roleDraftSchema,
  rolePreparedSchema,
  roleVersionDraftSchema,
  withdrawalPreparedSchema,
  type FieldClass,
  type PermissionAction,
} from './roles.js';
import { secretRegistry } from './secret.js';
import {
  accessHistoryPageSchema,
  accessHistoryQuerySchema,
  actorHistoryQuerySchema,
  auditHistoryPageSchema,
  recordHistoryQuerySchema,
} from './history.js';

// The route table (code-house-rules 12.1, 12.2). The server, the web app's typed client and the OpenAPI document are
// all made from it, so they cannot drift apart (PRD Stack: API).

/**
 * Who may call a route (code-house-rules 12.1 "Access on every route"; access-and-approvals 7.1). `public`: sign-in
 * and the health check only, no session. `own`: a signed-in user's own credentials and sessions, Authenticate only.
 * `action`: Authenticate, Available and Authorise for that action on that record type (PRD-INT-001, PRD-SEC-005).
 */
export type RouteAccess =
  | { readonly kind: 'public' }
  | { readonly kind: 'own'; readonly signInStep?: SignInStep }
  | {
      readonly kind: 'action';
      readonly action: PermissionAction;
      readonly recordType: string;
      /**
       * `command`: the record type carries scope facts, so the guard Authenticates only and the command runs
       * Authorise with each record's facts (access-and-approvals 5.3, 7.1 step 3; RR-296). Any other route on such a
       * type is a defect.
       */
      readonly authorisedIn?: 'command';
    };

/**
 * A step of first sign-in, or of sign-in after a reset (access-and-approvals 3.2, 7.1 step 1). Until each is done, a
 * session reaches only the `own` routes of the first step still to do: enrolment, then the password change.
 */
export type SignInStep = 'enrolment' | 'password-change';

/**
 * A secret field of a command's body (code-house-rules 12.4, 12.5; access-and-approvals 3.2). It never enters the
 * idempotency hash, a kept request or a log in any form; only its name does (PRD-SEC-014). A path is the property
 * names from the top of the body, with no list wildcard.
 *
 * - `authenticator-code`: proves presence and is not content, so a replay is never compared on it (CH-8).
 * - `new-secret`: a password or temporary password the request sets, parsed by secretString() into a `Secret`.
 * - `presented-secret`: the password a person presents at sign-in, parsed by secretString(). Only a `public` route,
 *   which carries no key, presents one, so it never meets the idempotency hash (12.4).
 */
export interface SecretFieldDeclaration {
  readonly path: readonly string[];
  readonly kind: 'authenticator-code' | 'new-secret' | 'presented-secret';
}

/**
 * A field of a restricted field class (access-and-approvals 6). A kept refused request holds its value only
 * encrypted (code-house-rules 12.4). A `*` in its path stands for every element of a list.
 */
export interface RestrictedFieldDeclaration {
  readonly path: readonly string[];
  readonly fieldClass: FieldClass;
}

type ObjectSchema = z.ZodObject;

interface RouteBase {
  /** The full path, `/api/…`, with each path parameter as `{name}`. After `/api`, the unit that owns it. */
  readonly path: string;
  readonly params?: ObjectSchema;
  readonly query?: ObjectSchema;
  /** The success answer, encoded through this schema by the server and decoded by the client. */
  readonly response: z.ZodType;
  readonly access: RouteAccess;
  /** The route's own refusal codes; the shared ones of codesOfRoute come beside them. */
  readonly codes: readonly ErrorCode[];
}

/** A read: `GET`, never changes a record (code-house-rules 12.1). */
export interface ReadRoute extends RouteBase {
  readonly method: 'GET';
  readonly command: false;
}

/**
 * A command: `POST`, exactly one command of code-house-rules 8.1. Every command carries an `Idempotency-Key`, except
 * the one public command, sign-in (12.4). Its secret and restricted fields are stated, each list even when empty, and
 * whether its answer shows a secret or a restricted value unmasked, which is then never repeated (12.6).
 */
export interface CommandRoute extends RouteBase {
  readonly method: 'POST';
  readonly command: true;
  readonly body: z.ZodType;
  readonly secretFields: readonly SecretFieldDeclaration[];
  readonly restrictedFields: readonly RestrictedFieldDeclaration[];
  readonly shows: 'nothing' | 'secret' | 'restricted-value';
}

export type Route = ReadRoute | CommandRoute;

const PATH = /^\/api(\/(?:[a-z0-9-]+|\{[a-zA-Z][a-zA-Z0-9]*\}))+$/;

/**
 * Declares one route and checks what can be checked before any request: the path is under `/api` and names exactly
 * the parameters its schema names, and every secret in a command's body is declared as one.
 */
export function defineRoute<const R extends Route>(route: R): R {
  if (!PATH.test(route.path)) throw new Error(`Route path ${route.path} is not /api/… in lower-case words`);
  const inPath = [...route.path.matchAll(/\{([a-zA-Z0-9]+)\}/g)].map((match) => match[1]).sort();
  const inSchema = Object.keys(route.params?.shape ?? {}).sort();
  if (JSON.stringify(inPath) !== JSON.stringify(inSchema)) {
    throw new Error(`Route ${route.path} names path parameters its schema does not, or the other way round`);
  }
  for (const code of route.codes) {
    if (!(code in errorCodes)) throw new Error(`Route ${route.path} lists an undeclared code ${code}`);
  }
  if (route.command) checkSecretFields(route);
  return route;
}

/** Whether a route needs the `Idempotency-Key` header: every command but the public one, sign-in (12.4). */
export function needsIdempotencyKey(route: Route): boolean {
  return route.command && route.access.kind !== 'public';
}

const READ_CODES: readonly ErrorCode[] = ['kernel.invalid-request', 'kernel.timed-out', 'kernel.failed'];
const KEYED_CODES: readonly ErrorCode[] = [
  'kernel.idempotency-key-required',
  'kernel.idempotency-key-reused',
  'kernel.request-in-progress',
  'kernel.outcome-unknown',
];

/** Every code a route can answer: the shared ones its kind brings, and its own (code-house-rules 12.2, 12.3). */
export function codesOfRoute(route: Route): ErrorCode[] {
  const codes = new Set<ErrorCode>([...READ_CODES, ...route.codes]);
  if (needsIdempotencyKey(route)) {
    for (const code of KEYED_CODES) codes.add(code);
    if (route.command && route.secretFields.some((field) => field.kind === 'new-secret')) {
      codes.add('kernel.secret-not-comparable');
    }
    if (route.command && route.shows !== 'nothing') codes.add('kernel.answer-not-repeatable');
  }
  return [...codes].sort();
}

function checkSecretFields(route: CommandRoute): void {
  const registered = new Set(registeredSecretPaths(route.body, []).map((path) => path.join('.')));
  const declared = new Map(route.secretFields.map((field) => [field.path.join('.'), field.kind]));
  for (const path of registered) {
    if (!declared.has(path)) throw new Error(`Route ${route.path} does not declare its secret field ${path}`);
  }
  for (const [path, kind] of declared) {
    if ((kind === 'new-secret' || kind === 'presented-secret') && !registered.has(path)) {
      throw new Error(`Route ${route.path}: secret ${path} must be a secretString()`);
    }
    if (kind === 'presented-secret' && route.access.kind !== 'public') {
      throw new Error(`Route ${route.path}: only a public route presents a secret, since it carries no key`);
    }
  }
}

/** The paths of the schemas registered as secrets within a body schema, through objects and optional fields. */
function registeredSecretPaths(schema: z.ZodType, at: readonly string[]): string[][] {
  if (secretRegistry.has(schema)) return [[...at]];
  if (schema instanceof z.ZodOptional || schema instanceof z.ZodNullable) {
    return registeredSecretPaths(schema.unwrap() as z.ZodType, at);
  }
  if (schema instanceof z.ZodObject) {
    return Object.entries(schema.shape).flatMap(([key, value]) =>
      registeredSecretPaths(value as z.ZodType, [...at, key]),
    );
  }
  return [];
}

/** The codes every route that prepares an access change can answer (access-and-approvals 7.1, 9.11). */
const PREPARE_CODES = [
  'access.not-signed-in',
  'access.sign-in-incomplete',
  'access.not-authorised',
  'access.business-date-not-set',
  'access.starts-in-past',
  'kernel.cross-site-request',
] as const satisfies readonly ErrorCode[];

/** The codes every history read can answer (access-and-approvals 7.1). */
const HISTORY_CODES = [
  'access.not-signed-in',
  'access.sign-in-incomplete',
  'access.not-authorised',
  'access.business-date-not-set',
] as const satisfies readonly ErrorCode[];

/** The routes of the API. A unit adds its routes here as they are built. */
export const routes = {
  health: defineRoute({
    method: 'GET',
    path: '/api/health',
    access: { kind: 'public' },
    command: false,
    response: healthResponseSchema,
    codes: [],
  }),
  // Sign-in (access-and-approvals 3.1; PRD-SEC-001, POL-02.17). The one public command: it carries no key, so each
  // attempt is its own attempt with its own access record (code-house-rules 12.4). The answer sets the cookie.
  signIn: defineRoute({
    method: 'POST',
    path: '/api/access/sign-in',
    access: { kind: 'public' },
    command: true,
    body: signInRequestSchema,
    secretFields: [
      { path: ['password'], kind: 'presented-secret' },
      { path: ['totpCode'], kind: 'authenticator-code' },
    ],
    restrictedFields: [],
    shows: 'nothing',
    response: signInOutcomeSchema,
    codes: [
      'access.sign-in-refused',
      'access.sign-in-slowed',
      'access.sign-in-unavailable',
      'kernel.cross-site-request',
    ],
  }),
  // The signed-in user (access-and-approvals 3.3). Refused, naming the steps left, until first sign-in is done.
  session: defineRoute({
    method: 'GET',
    path: '/api/access/session',
    access: { kind: 'own' },
    command: false,
    response: sessionViewSchema,
    codes: ['access.not-signed-in', 'access.sign-in-incomplete'],
  }),
  // Enrolment of an authenticator app (access-and-approvals 3.2): the secret is shown once (code-house-rules 12.6).
  startEnrolment: defineRoute({
    method: 'POST',
    path: '/api/access/enrolment/start',
    access: { kind: 'own', signInStep: 'enrolment' },
    command: true,
    body: enrolmentStartRequestSchema,
    secretFields: [],
    restrictedFields: [],
    shows: 'secret',
    response: enrolmentStartResponseSchema,
    codes: [
      'access.not-signed-in',
      'access.sign-in-incomplete',
      'access.already-enrolled',
      'kernel.cross-site-request',
    ],
  }),
  confirmEnrolment: defineRoute({
    method: 'POST',
    path: '/api/access/enrolment/confirm',
    access: { kind: 'own', signInStep: 'enrolment' },
    command: true,
    body: enrolmentConfirmRequestSchema,
    secretFields: [{ path: ['totpCode'], kind: 'authenticator-code' }],
    restrictedFields: [],
    shows: 'nothing',
    response: enrolmentConfirmResponseSchema,
    codes: [
      'access.not-signed-in',
      'access.sign-in-incomplete',
      'access.authenticator-code-refused',
      'access.enrolment-not-started',
      'kernel.cross-site-request',
    ],
  }),
  // The user's own password change, after a fresh authenticator code (access-and-approvals 3.2, 3.3).
  changePassword: defineRoute({
    method: 'POST',
    path: '/api/access/password/change',
    access: { kind: 'own', signInStep: 'password-change' },
    command: true,
    body: passwordChangeRequestSchema,
    secretFields: [
      { path: ['newPassword'], kind: 'new-secret' },
      { path: ['totpCode'], kind: 'authenticator-code' },
    ],
    restrictedFields: [],
    shows: 'nothing',
    response: passwordChangeResponseSchema,
    codes: [
      'access.not-signed-in',
      'access.sign-in-incomplete',
      'access.authenticator-code-refused',
      'access.password-refused',
      'access.password-rules-not-set',
      'kernel.cross-site-request',
    ],
  }),
  // Preparing access changes (access-and-approvals 4, 5, 9.11; POL-02.07). Each saves a draft that a different
  // authorised person approves later (S1-F01-T13); nothing here takes effect. Authorise runs on the route's action and
  // record type before the command (7.1 step 3).
  prepareRole: defineRoute({
    method: 'POST',
    path: '/api/access/roles',
    access: { kind: 'action', action: 'create', recordType: 'access.role' },
    command: true,
    body: roleDraftSchema,
    secretFields: [],
    restrictedFields: [],
    shows: 'nothing',
    response: rolePreparedSchema,
    codes: [...PREPARE_CODES, 'access.permission-not-declared', 'access.role-code-taken'],
  }),
  prepareRoleVersion: defineRoute({
    method: 'POST',
    path: '/api/access/roles/{roleId}/versions',
    params: z.strictObject({ roleId: idSchema }),
    access: { kind: 'action', action: 'edit', recordType: 'access.role' },
    command: true,
    body: roleVersionDraftSchema,
    secretFields: [],
    restrictedFields: [],
    shows: 'nothing',
    response: rolePreparedSchema,
    codes: [...PREPARE_CODES, 'access.permission-not-declared', 'access.role-not-found'],
  }),
  prepareRoleAssignment: defineRoute({
    method: 'POST',
    path: '/api/access/role-assignments',
    access: { kind: 'action', action: 'create', recordType: 'access.role_assignment' },
    command: true,
    body: roleAssignmentDraftSchema,
    secretFields: [],
    restrictedFields: [],
    shows: 'nothing',
    response: assignmentPreparedSchema,
    codes: [
      ...PREPARE_CODES,
      'access.assignment-overlaps',
      'access.self-service-scope',
      'access.scope-members-not-available',
      'access.role-not-found',
      'access.actor-not-found',
    ],
  }),
  prepareAssignmentWithdrawal: defineRoute({
    method: 'POST',
    path: '/api/access/role-assignments/{assignmentId}/withdrawal',
    params: z.strictObject({ assignmentId: idSchema }),
    access: { kind: 'action', action: 'edit', recordType: 'access.role_assignment' },
    command: true,
    body: assignmentWithdrawalDraftSchema,
    secretFields: [],
    restrictedFields: [],
    shows: 'nothing',
    response: withdrawalPreparedSchema,
    codes: [...PREPARE_CODES, 'access.assignment-not-found', 'access.not-withdrawable'],
  }),
  // History (numbering-and-audit 4.5, 5; access-and-approvals 6, 7.2, 9.11; module-map 4.3, 4.5). Served by
  // `access`, which reads the rows through `audit` and masks each restricted value its field permissions do not
  // grant, since `audit` uses only `kernel` (PRD-ACS-008). Each row is shown through one assignment that grants view
  // on it, inside the reader's scope (PRD-SEC-005); the answer names the time it was read (PRD-PRF-004).
  readRecordHistory: defineRoute({
    method: 'GET',
    path: '/api/access/history/record',
    query: recordHistoryQuerySchema,
    access: { kind: 'action', action: 'view', recordType: 'audit.audit_record' },
    command: false,
    response: auditHistoryPageSchema,
    codes: HISTORY_CODES,
  }),
  readActorHistory: defineRoute({
    method: 'GET',
    path: '/api/access/history/actor',
    query: actorHistoryQuerySchema,
    access: { kind: 'action', action: 'view', recordType: 'audit.audit_record' },
    command: false,
    response: auditHistoryPageSchema,
    codes: HISTORY_CODES,
  }),
  // The access history report: sign-ins, sessions, credential events and permission changes.
  readAccessHistory: defineRoute({
    method: 'GET',
    path: '/api/access/history/access-records',
    query: accessHistoryQuerySchema,
    access: { kind: 'action', action: 'view', recordType: 'audit.access_record', authorisedIn: 'command' },
    command: false,
    response: accessHistoryPageSchema,
    codes: HISTORY_CODES,
  }),
  // Sensitive access: an encrypted field shown unmasked, an export with a restricted field (numbering-and-audit 5.1).
  readSensitiveAccessHistory: defineRoute({
    method: 'GET',
    path: '/api/access/history/sensitive-access-records',
    query: accessHistoryQuerySchema,
    access: { kind: 'action', action: 'view', recordType: 'audit.sensitive_access_record', authorisedIn: 'command' },
    command: false,
    response: accessHistoryPageSchema,
    codes: HISTORY_CODES,
  }),
} as const satisfies Readonly<Record<string, Route>>;

export type RouteTable = Readonly<Record<string, Route>>;
