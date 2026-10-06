import { createHash } from 'node:crypto';
import { Secret, type FieldClass } from '@apparel-os/schemas';
import { CommandDefect } from '../command-runner/command-errors.js';

/**
 * The version of the canonical form below, kept beside each hash (code-house-rules 12.4 "What is hashed"). A key
 * whose row was made under another version is answered `conflict` saying so, and the two hashes are never compared.
 * A change to how the form is built takes the next version.
 */
export const IDEMPOTENCY_FORM_VERSION = 1;

/** A value JSON can hold. Amounts are integer paise and rates decimal strings, so no number here needs more. */
export type JsonValue = null | boolean | number | string | readonly JsonValue[] | { readonly [key: string]: JsonValue };
export type JsonObject = Readonly<Record<string, JsonValue>>;

/**
 * Where a field sits in a request body, as the property names from the top, such as `['newPassword']` or
 * `['lines', '*', 'cost']`. A `*` stands for every element of a list; only a restricted field's path may use one.
 */
export type FieldPath = readonly string[];

/**
 * A secret field of the request (code-house-rules 12.5; access-and-approvals 3.2). It never enters the hash, a kept
 * request or a log in any form; only its name does (PRD-SEC-014).
 *
 * - `authenticator-code`: proves presence and is not content, so a replay is never compared on it (CH-8).
 * - `new-secret`: a password or a temporary password the request sets. A replay is compared on it against the
 *   credential the first run wrote, while that credential is current (12.5).
 * - `presented-secret`: the password presented at sign-in. Only the public sign-in route carries one, and it has no
 *   key (12.4), so a keyed request holding one is a defect.
 */
export interface SecretField {
  readonly path: FieldPath;
  readonly kind: 'authenticator-code' | 'new-secret' | 'presented-secret';
}

/**
 * A field of a restricted field class (access-and-approvals 6; PRD-ACS-008, PRD-SEC-010). Its value is kept in a
 * refused request only encrypted under the Organisation's key (code-house-rules 12.4 "Changed content"; PRD-SEC-006).
 */
export interface RestrictedField {
  readonly path: FieldPath;
  readonly fieldClass: FieldClass;
}

/**
 * What a command request carries, as the route's schemas parsed it (code-house-rules 12.2, 12.4). The route states
 * its secret and restricted fields: none is found by guessing, and each list is given even when it is empty.
 */
export interface RequestContent {
  /** The path parameters, such as the record's identifier. */
  readonly pathParameters: Readonly<Record<string, string>>;
  /** The body as the route's schema parsed it. A secret in it is a `Secret`, or a string at a declared secret path. */
  readonly body: unknown;
  readonly secretFields: readonly SecretField[];
  readonly restrictedFields: readonly RestrictedField[];
}

/** One restricted value found in the body, with where it sits in the canonical form. */
export interface RestrictedLeaf {
  /** Its concrete path in the body, a list index standing where the declared path had `*`. */
  readonly path: readonly (string | number)[];
  readonly fieldClass: FieldClass;
  readonly value: JsonValue;
}

/** A request in its canonical form, with what the helper needs beside it. */
export interface PreparedRequest {
  /** The canonical form, with restricted values in it in plain (it is hashed, never stored as it is). */
  readonly form: JsonObject;
  /** SHA-256 of the canonical JSON of `form`, as lower-case hex. */
  readonly hash: string;
  readonly formVersion: number;
  /** The names (dotted paths) of the secret fields present, sorted. */
  readonly secretFieldNames: readonly string[];
  /** The new secrets present, by name, for the comparison of 12.5. Never stored, logged or hashed. */
  readonly newSecrets: ReadonlyMap<string, Secret>;
  readonly restrictedLeaves: readonly RestrictedLeaf[];
}

const WILDCARD = '*';

/**
 * Builds the canonical form of a request and its hash (code-house-rules 12.4 "What is hashed"): the operation, the
 * path parameters, and the body (which carries the version token, 12.7) as the route's schema parsed it, with every secret field left out
 * and the names of the secret fields present added (12.5; access-and-approvals 3.2; PRD-SEC-014). It is pure.
 *
 * It refuses, as a defect, a `Secret` anywhere but at a declared secret path, so no secret can enter the hash or a
 * kept request by being left undeclared; and any value JSON cannot hold.
 */
export function prepareRequest(operation: string, content: RequestContent): PreparedRequest {
  checkPaths(content);
  for (const value of Object.values(content.pathParameters) as unknown[]) {
    if (typeof value !== 'string') throw new CommandDefect('A path parameter is a string');
  }
  const body = toJson(content.body, []);
  const { body: withoutSecrets, names, newSecrets } = removeSecrets(body, content.secretFields);
  const restrictedLeaves = findRestricted(withoutSecrets, content.restrictedFields);

  const form: Record<string, JsonValue> = {
    operation,
    pathParameters: content.pathParameters,
    body: withoutSecrets,
    secretFields: names,
  };

  return {
    form,
    hash: sha256Hex(canonicalJson(form)),
    formVersion: IDEMPOTENCY_FORM_VERSION,
    secretFieldNames: names,
    newSecrets,
    restrictedLeaves,
  };
}

/**
 * The canonical JSON of a value: object keys sorted by UTF-16 code unit, no insignificant space, list order kept
 * (code-house-rules 12.4). A key whose value is undefined is left out.
 */
export function canonicalJson(value: JsonValue): string {
  if (value === null) return 'null';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new CommandDefect('The canonical form holds only finite numbers');
    return JSON.stringify(value);
  }
  if (typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${(value as readonly JsonValue[]).map((item) => canonicalJson(item)).join(',')}]`;
  const record = value as JsonObject;
  const keys = Object.keys(record)
    .filter((key) => record[key] !== undefined)
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key] as JsonValue)}`).join(',')}}`;
}

export function sha256Hex(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

/** The dotted name of a field path, as kept in the key row and the hash. */
export function fieldName(path: FieldPath): string {
  return path.join('.');
}

/**
 * Copies a value into plain JSON, refusing anything JSON cannot hold. A `Secret` is kept as itself here, so the
 * next step can take it out at its declared path, and refuse it anywhere else.
 */
function toJson(value: unknown, path: readonly (string | number)[]): JsonValue {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value))
      throw new CommandDefect(`The request holds a number JSON cannot hold at ${where(path)}`);
    return value;
  }
  if (value instanceof Secret) return value as unknown as JsonValue;
  if (Array.isArray(value)) return value.map((item: unknown, index) => toJson(item, [...path, index]));
  if (typeof value === 'object' && isPlainObject(value)) {
    const copy: Record<string, JsonValue> = {};
    for (const [key, item] of Object.entries(value)) {
      if (item !== undefined) copy[key] = toJson(item, [...path, key]);
    }
    return copy;
  }
  throw new CommandDefect(`The request holds a value JSON cannot hold at ${where(path)}`);
}

/** Checks that an answer to keep is plain JSON and holds no secret (code-house-rules 12.4, 12.6). */
export function checkKeptAnswer(answer: unknown): JsonValue {
  const json = toJson(answer, []);
  if (holdsSecret(json)) {
    throw new CommandDefect(
      'An answer that holds a secret is never kept; a command that shows a secret says so (code-house-rules 12.6)',
    );
  }
  return json;
}

function holdsSecret(value: JsonValue): boolean {
  if ((value as unknown) instanceof Secret) return true;
  if (Array.isArray(value)) return (value as readonly JsonValue[]).some((item) => holdsSecret(item));
  if (value !== null && typeof value === 'object') return Object.values(value).some((item) => holdsSecret(item));
  return false;
}

function isPlainObject(value: object): boolean {
  const prototype = Object.getPrototypeOf(value) as unknown;
  return prototype === Object.prototype || prototype === null;
}

function where(path: readonly (string | number)[]): string {
  return path.length === 0 ? 'the top' : path.join('.');
}

function checkPaths(content: RequestContent): void {
  const seen = new Set<string>();
  for (const field of content.secretFields) {
    if (field.kind === 'presented-secret') {
      throw new CommandDefect('A presented secret is carried only by sign-in, which has no idempotency key (12.4)');
    }
    if (field.path.length === 0 || field.path.some((segment) => segment === '' || segment === WILDCARD)) {
      throw new CommandDefect('A secret field is named by its property names, with no list wildcard');
    }
    const name = fieldName(field.path);
    if (seen.has(name)) throw new CommandDefect(`Secret field ${name} is declared twice`);
    seen.add(name);
  }
  for (const field of content.restrictedFields) {
    if (field.path.length === 0 || field.path.some((segment) => segment === '')) {
      throw new CommandDefect('A restricted field is named by its property names');
    }
  }
}

/** Takes every declared secret field out of the body, keeping its name, and refuses a secret anywhere else. */
function removeSecrets(
  body: JsonValue,
  secretFields: readonly SecretField[],
): { body: JsonValue; names: string[]; newSecrets: Map<string, Secret> } {
  const names: string[] = [];
  const newSecrets = new Map<string, Secret>();
  let result = body;
  for (const field of secretFields) {
    const parentPath = field.path.slice(0, -1);
    // checkPaths refused an empty path.
    const last = field.path.at(-1) ?? '';
    const parent = readPath(result, parentPath);
    if (parent === undefined || parent === null) continue;
    if (typeof parent !== 'object' || Array.isArray(parent)) {
      throw new CommandDefect(`Secret field ${fieldName(field.path)} does not sit in an object`);
    }
    const record = parent as JsonObject;
    if (!(last in record)) continue;
    const value = record[last] as unknown;
    if (field.kind === 'new-secret') {
      if (!(value instanceof Secret)) {
        throw new CommandDefect(`New secret ${fieldName(field.path)} must be parsed into a Secret (secretString())`);
      }
      newSecrets.set(fieldName(field.path), value);
    } else if (!(value instanceof Secret) && typeof value !== 'string') {
      throw new CommandDefect(`Authenticator code ${fieldName(field.path)} must be a string or a Secret`);
    }
    names.push(fieldName(field.path));
    result = withoutKey(result, parentPath, last);
  }
  if (holdsSecret(result)) {
    throw new CommandDefect(
      'The request holds a secret its route did not declare; no secret enters the hash or a kept request (code-house-rules 12.5; PRD-SEC-014)',
    );
  }
  names.sort();
  return { body: result, names, newSecrets };
}

function readPath(value: JsonValue, path: FieldPath): JsonValue | undefined {
  let current: JsonValue | undefined = value;
  for (const segment of path) {
    if (current === null || current === undefined) return current;
    if (typeof current !== 'object' || Array.isArray(current)) return undefined;
    current = (current as JsonObject)[segment];
  }
  return current;
}

/** A copy of `value` with the key `last` taken out of the object at `parentPath`. */
function withoutKey(value: JsonValue, parentPath: FieldPath, last: string): JsonValue {
  if (parentPath.length === 0) {
    return Object.fromEntries(Object.entries(value as JsonObject).filter(([key]) => key !== last));
  }
  const [head, ...rest] = parentPath as [string, ...string[]];
  const record = value as JsonObject;
  return { ...record, [head]: withoutKey(record[head] as JsonValue, rest, last) };
}

/**
 * Finds every value at a declared restricted path. A path that meets a value of the wrong shape on the way is a
 * defect, never skipped, so a restricted value can never stay in plain because its route described it wrongly. A
 * field that is absent, or a step that is null, holds nothing to keep.
 */
function findRestricted(body: JsonValue, fields: readonly RestrictedField[]): RestrictedLeaf[] {
  const leaves: RestrictedLeaf[] = [];
  const visit = (
    value: JsonValue,
    rest: readonly string[],
    at: readonly (string | number)[],
    field: RestrictedField,
  ): void => {
    if (rest.length === 0) {
      leaves.push({ path: at, fieldClass: field.fieldClass, value });
      return;
    }
    if (value === null) return;
    const [segment, ...remaining] = rest as [string, ...string[]];
    if (segment === WILDCARD) {
      if (!Array.isArray(value)) {
        throw new CommandDefect(`Restricted field ${fieldName(field.path)} expects a list at ${where(at)}`);
      }
      (value as readonly JsonValue[]).forEach((item, index) => {
        visit(item, remaining, [...at, index], field);
      });
      return;
    }
    if (typeof value !== 'object' || Array.isArray(value)) {
      throw new CommandDefect(`Restricted field ${fieldName(field.path)} expects an object at ${where(at)}`);
    }
    const record = value as JsonObject;
    if (!(segment in record)) return;
    visit(record[segment] as JsonValue, remaining, [...at, segment], field);
  };
  for (const field of fields) visit(body, field.path, [], field);
  return leaves;
}

/** A restricted value as a kept request holds it: encrypted under the Organisation's key, its class beside it. */
export interface EncryptedLeaf {
  readonly fieldClass: FieldClass;
  readonly scheme: string;
  readonly ciphertext: string;
}

/**
 * The canonical form as a refused request is kept (code-house-rules 12.4 "Changed content"): every restricted value
 * replaced by its encrypted form, under the key `encrypted`. Secrets are already out of the form.
 */
export function formWithEncryptedLeaves(prepared: PreparedRequest, encrypted: readonly EncryptedLeaf[]): JsonObject {
  if (encrypted.length !== prepared.restrictedLeaves.length) {
    throw new CommandDefect('Every restricted value of a kept request is encrypted');
  }
  let body = prepared.form.body as JsonValue;
  prepared.restrictedLeaves.forEach((leaf, index) => {
    const value = encrypted[index];
    if (value === undefined) throw new CommandDefect('Every restricted value of a kept request is encrypted');
    body = replaceAt(body, leaf.path, {
      encrypted: { fieldClass: value.fieldClass, scheme: value.scheme, ciphertext: value.ciphertext },
    });
  });
  return { ...prepared.form, body };
}

function replaceAt(value: JsonValue, path: readonly (string | number)[], replacement: JsonValue): JsonValue {
  if (path.length === 0) return replacement;
  const [head, ...rest] = path as [string | number, ...(string | number)[]];
  if (typeof head === 'number') {
    const list = [...(value as readonly JsonValue[])];
    list[head] = replaceAt(list[head] as JsonValue, rest, replacement);
    return list;
  }
  const record = value as JsonObject;
  return { ...record, [head]: replaceAt(record[head] as JsonValue, rest, replacement) };
}
