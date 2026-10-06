import { z } from 'zod';

// The error envelope and the refusal codes (code-house-rules 12.3; PRD-UXP-003, PRD-SEC-006). Every answer of the API
// that is not a success has this one shape. It holds identifiers and codes only: never a restricted value, a secret,
// an input value or a database message.

/** The kinds of answer that is not a success, in the order of code-house-rules 12.3. */
export const errorKinds = [
  'invalid',
  'not-signed-in',
  'unavailable',
  'not-authorised',
  'not-found',
  'refused',
  'conflict',
  'timed-out',
  'failed',
] as const;
export type ErrorKind = (typeof errorKinds)[number];
export const errorKindSchema = z.enum(errorKinds);

const STATUS: Readonly<Record<ErrorKind, number>> = {
  invalid: 400,
  'not-signed-in': 401,
  unavailable: 403,
  'not-authorised': 403,
  'not-found': 404,
  refused: 422,
  conflict: 409,
  'timed-out': 503,
  failed: 500,
};

/** The HTTP status of a kind (code-house-rules 12.3). */
export function statusOfKind(kind: ErrorKind): number {
  return STATUS[kind];
}

/** A code: `<unit>.<reason>`, the reason in lower-case words joined by hyphens, such as `access.self-preparation`. */
export const errorCodeSchema = z.string().regex(/^[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*)+$/);

/**
 * One thing that blocks an action, as identifiers and codes only (code-house-rules 12.3 "What is missing"): its kind,
 * such as `scope` or `policy`, and string fields naming what it is, such as `dimension` and `id`. The screen turns it
 * into text from the message catalogue (12.13).
 */
export const missingItemSchema = z.object({ kind: z.string().min(1) }).catchall(z.string());
export type MissingItem = z.infer<typeof missingItemSchema>;

/** One failed check of an `invalid` answer: where it failed and the issue's code, never the input. */
export const issueSchema = z.strictObject({
  path: z.array(z.union([z.string(), z.number()])),
  code: z.string().min(1),
});
export type Issue = z.infer<typeof issueSchema>;

/** Every answer that is not a success (code-house-rules 12.3). */
export const errorEnvelopeSchema = z.strictObject({
  error: z.strictObject({
    kind: errorKindSchema,
    code: errorCodeSchema,
    /** What blocks the action. Absent where a design asks for one refusal that names nothing, as sign-in does. */
    missing: z.array(missingItemSchema).optional(),
    /** For `invalid` only: the paths and issue codes that failed. */
    issues: z.array(issueSchema).optional(),
    /** The next action, as a code. */
    next: errorCodeSchema.optional(),
    /** The request's correlation identifier (code-house-rules 12.11). */
    reference: z.uuid(),
  }),
});
export type ErrorEnvelope = z.infer<typeof errorEnvelopeSchema>;
export type ErrorBody = ErrorEnvelope['error'];

/** Declares a unit's codes, each with its one kind (code-house-rules 12.3 "Codes"). */
function declareCodes<const Codes extends Readonly<Record<string, ErrorKind>>>(codes: Codes): Codes {
  for (const code of Object.keys(codes)) {
    if (!errorCodeSchema.safeParse(code).success) throw new Error(`${code} is not <unit>.<reason>`);
  }
  return Object.freeze(codes);
}

/**
 * The shared codes `kernel` declares (code-house-rules 12.3, 12.4, 12.5, 12.6).
 *
 * - `kernel.invalid-request`: the path parameters, query or body fail the route's schema, or the body is not JSON.
 * - `kernel.idempotency-key-required`: a command without an `Idempotency-Key` that is a UUID (12.4).
 * - `kernel.not-found`: no route has that method and path.
 * - The conflicts of 12.4 to 12.7, the time limit of 5.1, an unexpected failure, and an outcome not known.
 */
export const kernelCodes = declareCodes({
  'kernel.invalid-request': 'invalid',
  'kernel.idempotency-key-required': 'invalid',
  'kernel.not-found': 'not-found',
  'kernel.idempotency-key-reused': 'conflict',
  'kernel.request-in-progress': 'conflict',
  'kernel.stale-version': 'conflict',
  'kernel.secret-not-comparable': 'conflict',
  'kernel.answer-not-repeatable': 'conflict',
  'kernel.timed-out': 'timed-out',
  'kernel.failed': 'failed',
  'kernel.outcome-unknown': 'failed',
});

/** Every declared code, of every unit. A unit adds its own here as it declares them (code-house-rules 12.3). */
export const errorCodes = { ...kernelCodes } as const;
export type ErrorCode = keyof typeof errorCodes;

/** The kind of a declared code. */
export function errorKindOf(code: ErrorCode): ErrorKind {
  return errorCodes[code];
}
