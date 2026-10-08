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
  // A command whose Origin is not the app's own: a write from another site (code-house-rules 12.1; RR-245).
  'kernel.cross-site-request': 'invalid',
});

/**
 * The codes of `access` for sign-in, enrolment and the own password change (access-and-approvals 3.1, 3.2, 7.1;
 * code-house-rules 12.3; S1-F01-T08).
 *
 * - `access.sign-in-refused`: the one refusal for a wrong Organisation code, login, password or code; it names no
 *   part and carries no `missing` (access-and-approvals 3.1).
 * - `access.sign-in-slowed`: repeated failures for the typed login or the source address reached the throttling
 *   setting; the same answer whether the login exists or not (DEC-116).
 * - `access.sign-in-unavailable`: a setting sign-in needs is not set; `missing` names it (code-house-rules 12.14).
 * - `access.not-signed-in`: no session in force (code-house-rules 12.3).
 * - `access.session-locked`: the session passed its idle limit and is locked; only the same user's password unlocks
 *   it, and `next` is `access.unlock-session` (access-and-approvals 3.3; S1-F01-T09).
 * - `access.sign-in-incomplete`: the session reaches only enrolment and the password change until both are done;
 *   `missing` names the steps (access-and-approvals 3.2, 7.1 step 1).
 * - `access.authenticator-code-refused`: a wrong or already used authenticator code; never kept under the key (12.5).
 * - `access.already-enrolled`, `access.enrolment-not-started`: enrolment asked for when it does not apply.
 * - `access.password-refused`: the new password fails the password rules; caused by a secret, never kept (12.5).
 * - `access.password-rules-not-set`: no password rules are in force, so no password can be set (GC3-5).
 */
export const accessCodes = declareCodes({
  'access.sign-in-refused': 'not-signed-in',
  'access.sign-in-slowed': 'not-signed-in',
  'access.sign-in-unavailable': 'unavailable',
  'access.not-signed-in': 'not-signed-in',
  'access.session-locked': 'not-signed-in',
  'access.sign-in-incomplete': 'not-signed-in',
  'access.authenticator-code-refused': 'not-authorised',
  'access.already-enrolled': 'refused',
  'access.enrolment-not-started': 'refused',
  'access.password-refused': 'refused',
  'access.password-rules-not-set': 'unavailable',
});

/**
 * The codes of `access` for roles, role assignments, scope and Authorise (access-and-approvals 4, 5, 7.1;
 * code-house-rules 12.3; S1-F01-T11).
 *
 * - `access.not-authorised`: no role assignment in force grants the action on the record type, covering its scope
 *   facts and field classes; `missing` names what is missing (7.1 step 3; PRD-UXP-003).
 * - `access.business-date-not-set`: the Organisation's timezone is not set, so today is not known; `missing` names
 *   the setting (code-house-rules 9; PRD-SEC-017).
 * - `access.starts-in-past`: a version or an assignment starting before today (GC2-7, DEC-105).
 * - `access.assignment-overlaps`: another approved assignment of the same actor, role and exact scope overlaps it
 *   (DEC-112, CH-7).
 * - `access.version-overlaps`: an approved role version starts on or after the start of the one being approved, so
 *   it cannot follow it (code-house-rules 7.3).
 * - `access.self-service-scope`: own-record scope with a role that is not self-service, or other scope with one that
 *   is (PRD-ACS-022, DEC-100).
 * - `access.permission-not-declared`: a permission on a record type or action the registry does not declare, or a
 *   self-service permission on a type with no subject person (4.1, 5.4).
 * - `access.service-only-permission`: a role holds a permission on a record type only service identities hold, never
 *   a person's role; `missing` names each (access-and-approvals 2.3; PRD-SEC-018; S1-F01-T29).
 * - `access.scope-members-not-available`: selected members, which need the scope contract of `organisation` and
 *   `merchandise` (S1-F02, S1-F03; 5.1).
 * - `access.role-code-taken`, `access.role-not-found`, `access.actor-not-found`, `access.assignment-not-found`.
 * - `access.not-withdrawable`: the assignment is not approved, is withdrawn already, or has started (7.3).
 */
export const accessRoleCodes = declareCodes({
  'access.not-authorised': 'not-authorised',
  'access.business-date-not-set': 'unavailable',
  'access.starts-in-past': 'refused',
  'access.assignment-overlaps': 'refused',
  'access.version-overlaps': 'refused',
  'access.self-service-scope': 'refused',
  'access.permission-not-declared': 'refused',
  'access.service-only-permission': 'refused',
  'access.scope-members-not-available': 'unavailable',
  'access.role-code-taken': 'refused',
  'access.role-not-found': 'not-found',
  'access.actor-not-found': 'not-found',
  'access.assignment-not-found': 'not-found',
  'access.not-withdrawable': 'refused',
});

/**
 * The codes of `access` for sessions and credential resets (access-and-approvals 3.2, 3.3; S1-F01-T09).
 *
 * - `access.own-credential-reset`: nobody resets their own credential, even holding the permission (GC3-4, DEC-105).
 * - `access.user-not-found`: no user has that identifier.
 * - `access.session-not-found`: the user has no session in force or locked with that identifier.
 */
export const accessSessionCodes = declareCodes({
  'access.own-credential-reset': 'refused',
  'access.user-not-found': 'not-found',
  'access.session-not-found': 'not-found',
});

/**
 * The codes of `access` for users, reasons, approval rule settings, approval requests and decisions
 * (access-and-approvals 2.1, 8, 9.1, 9.3, 9.5, 9.6, 9.11; code-house-rules 12.3; S1-F01-T13). The reasons a decision
 * is unavailable or refused are among them, each with its kind (RR-246); a wrong or used authenticator code on a
 * decision is `access.authenticator-code-refused`, as on every protected action (3.3).
 *
 * - `access.no-reason-list-in-force`: no approve or reject reason of the outcome's kind is in force, so deciding is
 *   unavailable, except a reason-list change, which takes free text (POL-02.23, DEC-104); `missing` names the list.
 * - `access.free-text-not-allowed`: free text on a decision that is not a reason-list change (DEC-104).
 * - `access.free-text-required`: a listed reason on a reason-list change, which gives free text (DEC-104).
 * - `access.reason-not-in-force`: the reason picked is not one of the outcome's kind in force today.
 * - `access.not-eligible`: the decider holds no assignment granting approve on the request's record type, or is not a
 *   person (9.3; PRD-ACS-006, PRD-SEC-018); `missing` names what is missing.
 * - `access.self-preparation`: the decider recorded a change in the version, so is one of its preparers (9.3;
 *   PRD-ACS-006, POL-02.08).
 * - `access.approval-not-open`: the request is decided or withdrawn already (9.5).
 * - `access.approval-superseded`: a later version of the document superseded the request (9.6; PRD-ACS-007).
 * - `access.user-not-approved`: an assignment of a user whose first version is not yet approved (4.3; DEC-116).
 * - `access.login-taken`: another user has that login, compared without regard to letter case (2.1).
 * - `access.reason-code-taken`, `access.rule-setting-exists`: the code or action type has its record already.
 * - `access.action-type-not-declared`: a rule setting for an action type with no approval rule in code (8).
 * - `access.approval-request-not-found`, `access.reason-not-found`, `access.rule-setting-not-found`,
 *   `access.setting-not-found` (a security setting version, access-and-approvals 3.3; S1-F01-T25).
 */
export const accessApprovalCodes = declareCodes({
  'access.no-reason-list-in-force': 'unavailable',
  'access.free-text-not-allowed': 'refused',
  'access.free-text-required': 'refused',
  'access.reason-not-in-force': 'refused',
  'access.not-eligible': 'not-authorised',
  'access.self-preparation': 'refused',
  'access.approval-not-open': 'refused',
  'access.approval-superseded': 'refused',
  'access.user-not-approved': 'refused',
  'access.login-taken': 'refused',
  'access.reason-code-taken': 'refused',
  'access.rule-setting-exists': 'refused',
  'access.action-type-not-declared': 'refused',
  'access.approval-request-not-found': 'not-found',
  'access.reason-not-found': 'not-found',
  'access.rule-setting-not-found': 'not-found',
  'access.setting-not-found': 'not-found',
  // A request with a value basis needs an approver whose limit covers it; limits arrive with S1-F05 (9.2, 9.3).
  'access.no-approval-limit': 'not-authorised',
  // Verify under lock and Record use (access-and-approvals 9.7, 9.8; DEC-066, DEC-097; S1-F10-T02).
  'access.approval-decision-not-found': 'not-found',
  'access.approval-not-for-document': 'refused',
  'access.approval-not-approved': 'refused',
  'access.approval-used': 'refused',
  'access.approval-version-changed': 'refused',
  'access.approval-value-exceeded': 'refused',
});

/**
 * The codes of `files-imports` for stored files and evidence attachments (imports-and-opening-data 9.3, 11, 13.1;
 * DEC-117; S1-F06-T05). A refusal names its reason, and nothing is stored (9.3).
 *
 * - `files-imports.type-not-allowed`: the content is not a PDF, JPEG or PNG, whatever the name says (9.2, A-1).
 * - `files-imports.file-too-large`: over the evidence size limit; `missing` names the limit in bytes, never truncated.
 * - `files-imports.active-content`: a PDF holding scripts, embedded files or launch actions; `missing` names which.
 * - `files-imports.pdf-not-inspectable`: a PDF whose content cannot be checked for active content (encrypted, or
 *   expanding past the checking budget), refused rather than trusted.
 * - `files-imports.file-store-not-configured`: no file storage is set for this environment (code-house-rules 12.14).
 * - `files-imports.attachment-not-found`: no attachment with that identifier is visible to the reader; a file out of
 *   the reader's scope answers the same as one that does not exist.
 * - `files-imports.restricted-file-is-an-export`: the attachment carries a restricted class, so reading it is an
 *   export: use the download command, which writes an access record (numbering-and-audit 5.1).
 */
export const filesImportsCodes = declareCodes({
  'files-imports.type-not-allowed': 'refused',
  'files-imports.file-too-large': 'refused',
  'files-imports.active-content': 'refused',
  'files-imports.pdf-not-inspectable': 'refused',
  'files-imports.file-store-not-configured': 'unavailable',
  'files-imports.attachment-not-found': 'not-found',
  'files-imports.restricted-file-is-an-export': 'refused',
});

/**
 * The codes of `stock` · ledger (stock-ledger 13.8; S1-F10-T02). Each refusal names the item and what failed, so the
 * caller can show the reason (PRD-UXP-003). `stock.blocked` is the one generic refusal of a recheck that a hold, a
 * reservation or a count freeze the actor cannot see covers the units: it names nothing of that record (DEC-117).
 */
export const stockLedgerCodes = declareCodes({
  'stock.caller-not-registered': 'refused',
  'stock.item-not-registered': 'refused',
  'stock.historical-reference-source': 'refused',
  'stock.business-date-not-set': 'unavailable',
  'stock.invalid-item': 'refused',
  'stock.place-invalid': 'refused',
  'stock.route-not-allowed': 'refused',
  'stock.plan-stale': 'conflict',
  'stock.insufficient-available': 'refused',
  'stock.not-in-custody': 'refused',
  'stock.piece-not-at-place': 'refused',
  'stock.count-freeze-active': 'refused',
  'stock.held': 'refused',
  'stock.reserved': 'refused',
  'stock.blocked': 'refused',
  'stock.not-covered': 'refused',
  'stock.not-accepted': 'refused',
  'stock.coverage-overlap': 'refused',
  'stock.reservation-overlap': 'refused',
  'stock.exceeds-source': 'refused',
  'stock.wrong-release-event': 'refused',
  'stock.condition-route': 'refused',
  'stock.rule-not-set': 'unavailable',
});

/** Every declared code, of every unit. A unit adds its own here as it declares them (code-house-rules 12.3). */
export const errorCodes = {
  ...kernelCodes,
  ...accessCodes,
  ...accessRoleCodes,
  ...accessSessionCodes,
  ...accessApprovalCodes,
  ...filesImportsCodes,
  ...stockLedgerCodes,
} as const;
export type ErrorCode = keyof typeof errorCodes;

/** The kind of a declared code. */
export function errorKindOf(code: ErrorCode): ErrorKind {
  return errorCodes[code];
}
