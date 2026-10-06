import { z } from 'zod';
import { errorCodes, type ErrorCode } from './errors.js';
import { healthResponseSchema } from './health.js';
import type { FieldClass, PermissionAction } from './roles.js';
import { secretRegistry } from './secret.js';

// The route table (code-house-rules 12.1, 12.2). The server, the web app's typed client and the OpenAPI document are
// all made from it, so they cannot drift apart (PRD Stack: API).

/**
 * Who may call a route (code-house-rules 12.1 "Access on every route"; access-and-approvals 7.1). `public`: sign-in
 * and the health check only, no session. `own`: a signed-in user's own credentials and sessions, Authenticate only.
 * `action`: Authenticate, Available and Authorise for that action on that record type (PRD-INT-001, PRD-SEC-005).
 */
export type RouteAccess =
  | { readonly kind: 'public' }
  | { readonly kind: 'own' }
  | { readonly kind: 'action'; readonly action: PermissionAction; readonly recordType: string };

/**
 * A secret field of a command's body (code-house-rules 12.4, 12.5; access-and-approvals 3.2). It never enters the
 * idempotency hash, a kept request or a log in any form; only its name does (PRD-SEC-014). A path is the property
 * names from the top of the body, with no list wildcard.
 *
 * - `authenticator-code`: proves presence and is not content, so a replay is never compared on it (CH-8).
 * - `new-secret`: a password or temporary password the request sets, parsed by secretString() into a `Secret`.
 */
export interface SecretFieldDeclaration {
  readonly path: readonly string[];
  readonly kind: 'authenticator-code' | 'new-secret';
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
    if (kind === 'new-secret' && !registered.has(path)) {
      throw new Error(`Route ${route.path}: new secret ${path} must be a secretString()`);
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
} as const satisfies Readonly<Record<string, Route>>;

export type RouteTable = Readonly<Record<string, Route>>;
