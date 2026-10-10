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
 * - `access.scope-members-not-available`: selected members of a type no implementation of the scope contract answers
 *   yet: brands, until `merchandise`'s side (S1-F03-T01; 5.1; module-map section 3, rule 6).
 * - `access.scope-member-not-found`: a selected legal entity, Site, Store or business unit that does not exist as the
 *   type named, or is in force on no day of the assignment's dates; `missing` names each (5.1; structure-and-masters
 *   3.8; S1-F02-T03).
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
  'access.scope-member-not-found': 'refused',
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
  // A request with a value on a basis needs an approver whose limit covers it, through the assignment that grants
  // approve; a missing limit grants nothing (9.2, 9.3; POL-02.09, POL-02.15, PRD-ACS-016; S1-F05-T01):
  // `access.no-approval-limit`: the decider holds no limit in force for the action through a covering assignment;
  // `access.above-approval-limit`: their limits fall short of the value; `access.unknown-value-not-covered`: the value
  // is Unknown and no limit of theirs gives explicit authority over Unknown value.
  'access.no-approval-limit': 'not-authorised',
  'access.above-approval-limit': 'not-authorised',
  'access.unknown-value-not-covered': 'not-authorised',
  // Preparing an approval limit (9.2; S1-F05-T01): an action type whose rule has no value basis takes no limit; an
  // individual limit names an assignment of that user; an approved limit of the same action type and holder starting
  // on or after the new one's start is refused as overlapping (code-house-rules 7.3).
  'access.action-type-not-limited': 'refused',
  'access.assignment-not-of-user': 'refused',
  'access.limit-overlaps': 'refused',
  'access.approval-limit-not-found': 'not-found',
  // Verify under lock and Record use (access-and-approvals 9.7, 9.8; DEC-066, DEC-097; S1-F10-T02).
  'access.approval-decision-not-found': 'not-found',
  'access.approval-not-for-document': 'refused',
  'access.approval-not-approved': 'refused',
  'access.approval-used': 'refused',
  'access.approval-version-changed': 'refused',
  'access.approval-value-exceeded': 'refused',
  // Stand-in grants (access-and-approvals 10; PRD-ACS-018, POL-02.20; S1-F05-T02): a grant names two different people;
  // `access.stand-in-wider-than-authority`: on some day of its dates, an action, its scope or its limit goes beyond what
  // the person stood in for may decide through one assignment; `missing` names the action and the day.
  'access.stand-in-for-self': 'refused',
  // A grant is approved by someone other than its preparer, the stand-in and the person stood in for (product owner,
  // 9 Oct 2026); `missing` names the person as `stand-in-party`.
  'access.stand-in-party': 'refused',
  'access.stand-in-wider-than-authority': 'refused',
  'access.stand-in-grant-not-found': 'not-found',
  // An approved grant of the same stand-in, person stood in for and exact scope overlaps its dates (code-house-rules 7.3).
  'access.stand-in-overlaps': 'refused',
  // Bulk approval (9.9; PRD-ACS-011, PRD-ACS-019, POL-02.19; S1-F05-T02): `access.bulk-not-allowed`: an item's action
  // type is not on the allowlist in force today, so nothing is decided; `missing` names the action type.
  'access.bulk-not-allowed': 'refused',
  // Bulk approval's items (9.9): a request named more than once in one selection goes to individual review each time;
  // a selection with no item is refused as a whole.
  'access.bulk-item-duplicated': 'refused',
  'access.bulk-selection-empty': 'refused',
});

/**
 * The codes of `configuration` (module-map 4.4; access-and-approvals 7.1 step 2; code-house-rules 12.3, 12.14;
 * PRD-SEC-017, PRD-UXP-003; S1-F04-T01): the policy gate and the policy status behind it.
 *
 * - `configuration.operation-unavailable`: Available refuses a policy-dependent operation, naming in `missing` the
 *   capability, the policy and what it lacks, the configured records, or the activity and the place.
 * - `configuration.operation-not-found`: no module declared an operation of that code.
 * - `configuration.capability-not-found`: no declared operation uses a capability of that code.
 * - `configuration.origin-not-allowed`: a value of that origin is not accepted in this environment: synthetic outside
 *   local work, tests and `dev`, or on an Organisation that is not synthetic; test-setup outside `kdps-test` (12.14).
 * - `configuration.validator-entered-values`: the person validating a policy's values entered some of them (DM-6).
 * - `configuration.no-values-to-validate`: no module reports a value of the policy yet, so a validation would cover
 *   nothing (RR-480).
 */
export const configurationCodes = declareCodes({
  'configuration.operation-unavailable': 'unavailable',
  'configuration.operation-not-found': 'not-found',
  'configuration.capability-not-found': 'not-found',
  'configuration.origin-not-allowed': 'refused',
  'configuration.validator-entered-values': 'refused',
  'configuration.no-values-to-validate': 'refused',
});

/**
 * The codes of `finance` · books (books-and-posting 2.2, 3.1, 6.3; S1-F09-T01).
 *
 * - `finance.record-not-found`: the book, account, setting or version named does not exist.
 * - `finance.code-taken`: the book already has an account with that code (3.1).
 * - `finance.starts-in-past`: a version never starts on a past date (6.3; GC2-7, DEC-105).
 * - `finance.version-overlaps`: another approved version of the record starts on the same date (6.3).
 * - `finance.no-ca-evidence`: the version has no CA approval evidence attached or referenced, so a decision gives it
 *   no effect (6.3; POL-09.01; DEC-112, GC4-2).
 * - `finance.version-not-awaiting`: CA evidence names a version that is no longer awaiting its decision (6.3).
 * - `finance.cost-change-after-stock`: the version changes the formula or pool mode of a book that has held stock,
 *   refused until the CA says how value is divided at the change; `missing` names SL-6 (2.2; stock-ledger 7.12).
 * - `finance.book-stock-unanswered`: no implementation of "has this book held stock?" answers, so a formula or pool
 *   change is refused (2.2; DEC-116).
 */
export const financeBooksCodes = declareCodes({
  'finance.record-not-found': 'not-found',
  'finance.code-taken': 'refused',
  'finance.starts-in-past': 'refused',
  'finance.version-overlaps': 'refused',
  'finance.no-ca-evidence': 'refused',
  'finance.version-not-awaiting': 'refused',
  'finance.cost-change-after-stock': 'refused',
  'finance.book-stock-unanswered': 'unavailable',
});

/**
 * The codes of the posting half of `finance` · books (books-and-posting 4.1, 5, 6, 8, 9; S1-F09-T02).
 *
 * - `finance.event-kind-not-declared`: no module declares that posting event kind in this build (7.1).
 * - `finance.component-not-of-kind`: a map line names a component its event kind does not carry (6.1).
 * - `finance.component-without-line`: a component of the event kind has no line on the map version (6.1; 6.2
 *   condition 2).
 * - `finance.account-not-in-book`: a map line names an account of another book, or none (6.1).
 * - `finance.period-code-taken`, `finance.period-overlaps`, `finance.period-gap`: a period's code is taken in its
 *   book; it overlaps another period of the book; it would leave a gap after the book's first period (4.1).
 * - `finance.period-dates-invalid`: a period's last day comes before its first day.
 * - `finance.no-posting-map`: no approved map version for the book and event kind is in force on the accounting date
 *   (6.2 condition 1; POL-09.12; SL-23).
 * - `finance.map-account-not-in-force`: an account on the map's lines is not in force, or retired, on the date (6.2
 *   condition 3).
 * - `finance.missing-dimension`: a dimension a line requires is missing (6.2 condition 4; 3.2).
 * - `finance.journal-unbalanced`: the journal the lines make would not balance (6.2 condition 5; 5.2; POL-09.13).
 * - `finance.no-period`: the accounting date lies in no period of the book (4.1, 4.4).
 * - `finance.unknown-amount`: an amount is Unknown, so it is never posted (8.4; PRD-MOD-015).
 * - `finance.item-changed`: the item was already posted with different content (9.3; PRD-INT-002).
 * - `finance.store-mismatch`: the Store the caller passed is not the business unit's (8.1).
 * - `finance.no-journal-series`, `finance.journal-series-paused`: the book has no open journal series for the
 *   financial year (5.4; numbering-and-audit 3.2).
 * - `finance.already-reversed`: a journal is reversed at most once (5.3).
 */
export const financePostingCodes = declareCodes({
  'finance.event-kind-not-declared': 'refused',
  'finance.component-not-of-kind': 'refused',
  'finance.component-without-line': 'refused',
  'finance.account-not-in-book': 'refused',
  'finance.period-code-taken': 'refused',
  'finance.period-overlaps': 'refused',
  'finance.period-gap': 'refused',
  'finance.period-dates-invalid': 'refused',
  'finance.no-posting-map': 'refused',
  'finance.map-account-not-in-force': 'refused',
  'finance.missing-dimension': 'refused',
  'finance.journal-unbalanced': 'refused',
  'finance.no-period': 'refused',
  'finance.unknown-amount': 'refused',
  'finance.item-changed': 'refused',
  'finance.store-mismatch': 'refused',
  'finance.no-journal-series': 'unavailable',
  'finance.journal-series-paused': 'unavailable',
  'finance.already-reversed': 'refused',
});

/**
 * The codes of `site-lifecycle` (module-map 4.16; domain-model 3.6; PRD-LIF-001 to PRD-LIF-003; S1-F04-T02).
 *
 * - `site-lifecycle.check-failed`: a readiness check fails; `missing` names each check and what it lacks.
 * - `site-lifecycle.unit-not-found`: no business unit has that identifier.
 * - `site-lifecycle.record-not-found`: no readiness record has that identifier.
 * - A run that a later run for the unit and activity replaced answers `kernel.stale-version` (12.7).
 * - `site-lifecycle.activity-already-granted`: the unit holds the activity already.
 * - `site-lifecycle.site-not-found`: no Site has that identifier.
 * - `site-lifecycle.site-already-ready`: the Site's latest run for the activity is approved already.
 * - `site-lifecycle.unit-holds-stock`: the stock ledger holds stock at the unit, so it cannot declare it holds none
 *   (PRD-LIF-003; RR-483).
 */
export const siteLifecycleCodes = declareCodes({
  'site-lifecycle.check-failed': 'refused',
  'site-lifecycle.unit-not-found': 'not-found',
  'site-lifecycle.record-not-found': 'not-found',
  'site-lifecycle.activity-already-granted': 'refused',
  'site-lifecycle.site-not-found': 'not-found',
  'site-lifecycle.site-already-ready': 'refused',
  'site-lifecycle.unit-holds-stock': 'refused',
});

/**
 * The codes of `inbox` (access-and-approvals 9.4, 11.3; module-map 4.8; S1-F05-T02): routing of approvals and tasks.
 *
 * - `inbox.action-type-not-routable`: no approval rule, or registered task, has the action type.
 * - `inbox.starts-in-past`: a routing version never starts on a past date (GC2-7, DEC-105).
 * - `inbox.version-overlaps`: a version of the routing starts on or after this one's start (code-house-rules 7.3).
 * - `inbox.party-not-found`: the escalation names a user or a role that does not exist.
 * - `inbox.site-not-found`: the routing names a Site that does not exist in `organisation` (as exceptions' routing).
 */
export const inboxCodes = declareCodes({
  'inbox.action-type-not-routable': 'refused',
  'inbox.starts-in-past': 'refused',
  'inbox.version-overlaps': 'refused',
  'inbox.party-not-found': 'refused',
  'inbox.site-not-found': 'refused',
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

/**
 * The codes of `organisation` (structure-and-masters 2.1, 2.2, 3.8; S1-F02-T01). A refusal names what blocks it
 * (PRD-UXP-003).
 *
 * - `organisation.code-taken`: the code is already a record's in its scope; a code is never reused (2.1).
 * - `organisation.record-not-found`: a record the change names, or the record it versions, does not exist.
 * - `organisation.starts-in-past`: a version never starts on a past date (2.2; GC2-7, DEC-105).
 * - `organisation.version-overlaps`: another approved version, a Scheduled one included, starts on or after this one's
 *   start (2.2; code-house-rules 7.3).
 * - `organisation.reference-not-in-force`: a record the version refers to, such as a Site's Area or a Store's Site, has
 *   no approved version in force on the version's start; `missing` names it.
 */
/*
 * S1-F02-T02 (structure-and-masters 3.3 to 3.6, 3.8):
 * - `organisation.mapping-legal-entity-mismatch`: the registration or book belongs to another legal entity than the
 *   mapping's (PRD-ORG-020); `missing` names it.
 * - `organisation.registration-in-another-state`: the registration's State is not the State of the unit's Site on the
 *   mapping's start (3.4; GC2-1, DEC-105).
 * - `organisation.mapping-out-of-step`: a Site or registration version would put a mapping in force out of step with
 *   the State rule (3.4); `missing` names the unit.
 * - `organisation.unit-without-mapping`: a unit would be in force with no mapping (3.4; domain-model invariant 8).
 * - `organisation.whole-store-unit-exists`: the Store already has its whole-store unit at that Site (3.3).
 * - `organisation.store-at-another-site`: the Store is not linked to the unit's Site on its start (3.3).
 * - `organisation.not-a-warehouse`: a default warehouse names a unit that is not a warehouse unit (3.6).
 * - `organisation.location-unit-at-another-site`: the location's unit, or its parent, is not at its Site and unit (3.5).
 * - `organisation.location-in-use-unanswered`: no stock implementation answers whether stock is recorded there (3.5).
 * - `organisation.location-holds-stock`: stock is still recorded at the location to retire (3.5).
 * - `organisation.no-mapping-in-force`: a unit has no mapping in force on the date read (3.8).
 * - `organisation.mapping-not-approved`: only an approved mapping version is verified (3.4).
 * - `organisation.verifier-made-mapping`: the verifier is the person who made the mapping (3.4; GC2-2, DEC-105).
 * - `organisation.mapping-already-verified`: a mapping version has its one verification (3.4).
 * - `organisation.mapping-incomplete`: a unit version names some of a mapping's three fields, not all (3.4).
 * - `organisation.mapping-through-mapping-change`: a unit version of a unit with an approved version names a mapping;
 *   its mapping changes only through a mapping version (3.4; product owner, 8 Oct 2026).
 * - `organisation.location-nesting-cycle`: the parent is nested under the location already (3.5).
 * - `organisation.location-has-children`: a location nested under the one to retire is not retired then (3.5).
 * - `organisation.location-parent-retired`: the parent is retired on a day the location would be under it (3.5).
 *
 * S1-F02-T04 (structure-and-masters 3.1, 6.1; RR-440):
 * - `organisation.classification-of-another-kind`: a Site or Store version names a classification value of a kind that
 *   classifies the other; `missing` names the value.
 * - `organisation.classification-kind-twice`: a Site or Store version names two values of one classification kind; a
 *   version holds at most one of each (product owner, 9 Oct 2026); `missing` names the kind.
 */
export const organisationCodes = declareCodes({
  'organisation.code-taken': 'refused',
  'organisation.record-not-found': 'not-found',
  'organisation.starts-in-past': 'refused',
  'organisation.version-overlaps': 'refused',
  'organisation.reference-not-in-force': 'refused',
  'organisation.mapping-legal-entity-mismatch': 'refused',
  'organisation.registration-in-another-state': 'refused',
  'organisation.mapping-out-of-step': 'refused',
  'organisation.unit-without-mapping': 'refused',
  'organisation.whole-store-unit-exists': 'refused',
  'organisation.store-at-another-site': 'refused',
  'organisation.not-a-warehouse': 'refused',
  'organisation.location-unit-at-another-site': 'refused',
  'organisation.location-in-use-unanswered': 'unavailable',
  'organisation.location-holds-stock': 'refused',
  'organisation.no-mapping-in-force': 'not-found',
  'organisation.mapping-not-approved': 'refused',
  'organisation.verifier-made-mapping': 'refused',
  'organisation.mapping-already-verified': 'refused',
  'organisation.mapping-incomplete': 'refused',
  'organisation.mapping-through-mapping-change': 'refused',
  'organisation.location-nesting-cycle': 'refused',
  'organisation.location-has-children': 'refused',
  'organisation.location-parent-retired': 'refused',
  'organisation.classification-of-another-kind': 'refused',
  'organisation.classification-kind-twice': 'refused',
});

/**
 * The codes of `numbering` (numbering-and-audit 3.1 to 3.3, 3.5, 3.7; S1-F08-T01). The owning module's command passes
 * them on; a series and its format are the owning module's to explain (PRD-UXP-003).
 *
 * - `numbering.kind-not-declared`: no owning module declares the kind (3.1).
 * - `numbering.financial-year-mismatch`: a yearly kind's series needs its financial year; any other kind has none (3.3).
 * - `numbering.invalid-series`: an empty scope key, display scope key or scope text.
 * - `numbering.format-not-found`, `numbering.series-not-found`: no format with that code, no such series.
 * - `numbering.format-invalid`: not exactly one sequence part with a width, empty fixed text, or a repeated part (3.5).
 * - `numbering.format-not-for-kind`: the year label in the format of a kind that never restarts (3.3, 3.5).
 * - `numbering.scope-text-missing`: the format shows the scope part, and the series has no scope text (3.5).
 * - `numbering.format-could-repeat`: the series could give a text another series of its display scope can give, a
 *   closed one included (3.5; PRD-MOD-008, PRD-ACP-019).
 * - `numbering.live-series-exists`: an open or paused series exists for the kind, scope and year (3.1; PRD-POS-020).
 * - `numbering.series-paused`, `numbering.series-closed`: Allocate takes only an open series; Closed is final (3.2).
 * - `numbering.series-not-open`, `numbering.series-not-paused`: pause takes an open series, release a paused one (3.7).
 * - `numbering.series-exhausted`: the next number does not fit the format's width (3.5).
 * - `numbering.document-numbered-elsewhere`: the document already has its number of this kind from another series.
 */
export const numberingCodes = declareCodes({
  'numbering.kind-not-declared': 'refused',
  'numbering.financial-year-mismatch': 'refused',
  'numbering.invalid-series': 'refused',
  'numbering.format-not-found': 'not-found',
  'numbering.format-invalid': 'refused',
  'numbering.format-not-for-kind': 'refused',
  'numbering.scope-text-missing': 'refused',
  'numbering.format-could-repeat': 'refused',
  'numbering.live-series-exists': 'refused',
  'numbering.series-not-found': 'not-found',
  'numbering.series-paused': 'refused',
  'numbering.series-closed': 'refused',
  'numbering.series-not-open': 'refused',
  'numbering.series-not-paused': 'refused',
  'numbering.series-exhausted': 'refused',
  'numbering.document-numbered-elsewhere': 'refused',
});

/**
 * The codes of `exceptions` (access-and-approvals 12; module-map 4.13; S1-F08-T02). A refusal names what blocks it
 * (PRD-UXP-003).
 *
 * - `exceptions.no-exception-code-series`: no Open series of the exception-code kind, so an operation that would raise
 *   a numbered exception is unavailable; `missing` names the series (DEC-116).
 * - `exceptions.exception-code-series-paused`: the exception-code series is Paused, so the same is unavailable until it
 *   is released; `missing` names the series (numbering-and-audit 3.7).
 * - `exceptions.exception-code-series-exhausted`: the series' next number no longer fits its format, so the same is
 *   unavailable until a new series is defined; `missing` names the series (numbering-and-audit 3.5).
 * - `exceptions.no-routing`: no routing in force for the type at the Site, so an operation whose exceptions would have
 *   no owner is unavailable; `missing` names the type and the Site (POL-02.16).
 * - `exceptions.type-not-registered`: no module registers the type (12.1).
 * - `exceptions.link-not-for-type`: the type does not link to that record type (12.1).
 * - `exceptions.exception-not-found`: no exception the reader may see has that identifier.
 * - `exceptions.not-open`: the exception is closed; reopen it first (12.3).
 * - `exceptions.not-closed`: only a closed exception is reopened (12.3).
 * - `exceptions.resolution-not-verified`: the owning module's resolution check does not verify the linked business
 *   outcome, so the exception stays open; `missing` names the check (PRD-EXC-002).
 * - `exceptions.already-owner`: the exception is already assigned to that party.
 * - `exceptions.starts-in-past`: a routing version never starts on a past date (GC2-7, DEC-105).
 * - `exceptions.version-overlaps`: a version of the routing starts on or after this one's start (code-house-rules 7.3).
 * - `exceptions.party-not-found`: the owner or the escalation names a user or a role that does not exist.
 * - `exceptions.site-not-found`: the routing names a Site that does not exist in `organisation`, or is in force on no
 *   day from the version's first; `missing` names it (12.2; RR-451).
 */
export const exceptionsCodes = declareCodes({
  'exceptions.no-exception-code-series': 'unavailable',
  'exceptions.exception-code-series-paused': 'unavailable',
  'exceptions.exception-code-series-exhausted': 'unavailable',
  'exceptions.no-routing': 'unavailable',
  'exceptions.type-not-registered': 'refused',
  'exceptions.link-not-for-type': 'refused',
  'exceptions.exception-not-found': 'not-found',
  'exceptions.not-open': 'refused',
  'exceptions.not-closed': 'refused',
  'exceptions.resolution-not-verified': 'refused',
  'exceptions.already-owner': 'refused',
  'exceptions.starts-in-past': 'refused',
  'exceptions.version-overlaps': 'refused',
  'exceptions.party-not-found': 'refused',
  'exceptions.site-not-found': 'refused',
});

/**
 * The codes of `merchandise` · catalogue (structure-and-masters 2, 3.3, 4.1, 4.2, 4.7; S1-F03-T01). A refusal names
 * what blocks it (PRD-UXP-003).
 *
 * - `merchandise.code-taken`: the code is already a record's in its scope, or an open proposal's (2.1).
 * - `merchandise.record-not-found`: a record the change names, or the record it versions, does not exist.
 * - `merchandise.starts-in-past`: a version never starts on a past date (2.2; GC2-7, DEC-105).
 * - `merchandise.version-overlaps`: another approved version of the record starts on the same date (2.2).
 * - `merchandise.reference-not-in-force`: a record the version names has no approved version in force on its start,
 *   or a brand it names is retired then (2.2, 2.5).
 * - `merchandise.parent-cycle`: the parent brand or category is nested under the record already (4.1).
 * - `merchandise.size-set-of-another-category`: a category names a size set fixed to another category (4.1).
 * - `merchandise.attribute-not-list`: a value is proposed for an attribute that is not list-type (4.2; GC2-9).
 * - `merchandise.office-unit-has-no-brand`: an office unit operates without a brand (3.3; PRD-ORG-006).
 * - `merchandise.brand-counter-one-brand`: a brand-counter unit covers at most one brand (3.3; PRD-ORG-006).
 * - `merchandise.proposal-not-found`: no proposal has that identifier.
 * - `merchandise.proposal-not-open`: the proposal is already confirmed or rejected (4.2).
 */
export const merchandiseCodes = declareCodes({
  'merchandise.code-taken': 'refused',
  'merchandise.record-not-found': 'not-found',
  'merchandise.starts-in-past': 'refused',
  'merchandise.version-overlaps': 'refused',
  'merchandise.reference-not-in-force': 'refused',
  'merchandise.parent-cycle': 'refused',
  'merchandise.size-set-of-another-category': 'refused',
  'merchandise.attribute-not-list': 'refused',
  'merchandise.office-unit-has-no-brand': 'refused',
  'merchandise.brand-counter-one-brand': 'refused',
  'merchandise.proposal-not-found': 'not-found',
  'merchandise.proposal-not-open': 'refused',
  ...merchandisePartiesCodes(),
  ...merchandiseProductCodes(),
});

/**
 * The codes of styles, SKUs, codes, packs and tracking profiles (structure-and-masters 4.1 to 4.7; S1-F03-T02).
 *
 * - `merchandise.value-not-in-vocabulary`: a list-type attribute is given a value that is not an approved value of it
 *   in force, or a text attribute a value, or a list-type one a text (4.2; GC2-9).
 * - `merchandise.not-an-identity-attribute`: a SKU names an attribute its category does not count in a SKU's identity.
 * - `merchandise.size-not-in-size-set`: the size is not one of the category's size set in force (4.1; PRD-MER-002).
 * - `merchandise.sku-exists`: a SKU of the style already has that size and identity, Unknown counting as one value.
 * - `merchandise.stock-recorded`: a SKU's stock unit changes while stock of it is recorded (4.4; GC2-5).
 * - `merchandise.labelling-count-not-planned`: a change to piece-tracked, by a profile version or a category's link,
 *   while stock of the goods is recorded at a Site with no labelling count planned (4.6; PRD-MER-018).
 * - `merchandise.stock-presence-unanswered`: no implementation of the stock-presence contract answers (4.4, 4.6).
 * - `merchandise.pieces-held`: a change from piece-tracked back to quantity, by a profile version or a category's link,
 *   while a Site holds pieces of the goods (4.6; PRD-MER-018; product owner, 10 Oct 2026).
 * - `merchandise.not-a-piece-tracking-change`: the profile version is not a change from quantity to piece-tracked.
 * - `merchandise.pack-of-another-sku`: the pack named is not one of the SKU's (4.3).
 * - `merchandise.code-conflict`: an active mapping of the code in an overlapping scope names another target (4.3).
 * - `merchandise.code-ambiguous`: more than one target matches the code (4.7; PRD-MER-007).
 * - `merchandise.code-not-found`: no mapping of the code matches (4.7).
 * - `merchandise.no-version-in-force`: the SKU has no approved version in force on the date (4.7).
 * - `merchandise.end-not-allowed`: a mapping's end is before today, not after its start, or later than its end.
 */
function merchandiseProductCodes() {
  return {
    'merchandise.value-not-in-vocabulary': 'refused',
    'merchandise.not-an-identity-attribute': 'refused',
    'merchandise.size-not-in-size-set': 'refused',
    'merchandise.sku-exists': 'refused',
    'merchandise.stock-recorded': 'refused',
    'merchandise.labelling-count-not-planned': 'refused',
    'merchandise.stock-presence-unanswered': 'unavailable',
    'merchandise.pieces-held': 'refused',
    'merchandise.not-a-piece-tracking-change': 'refused',
    'merchandise.pack-of-another-sku': 'refused',
    'merchandise.code-conflict': 'refused',
    'merchandise.code-ambiguous': 'refused',
    'merchandise.code-not-found': 'not-found',
    'merchandise.no-version-in-force': 'not-found',
    'merchandise.end-not-allowed': 'refused',
  } as const;
}

/**
 * The codes of `merchandise` · parties (structure-and-masters 5; S1-F03-T03), beside the catalogue's shared ones.
 *
 * - `merchandise.party-not-supplier`: the party named does not hold the supplier role in force on the date (5.1).
 * - `merchandise.agreement-exists`: the brand or supplier already has an agreement; a change is its new version (5.2).
 * - `merchandise.supplier-terms-on-brand-agreement`: cash-discount and interest terms are a supplier's (PRD-PAY-015).
 * - `merchandise.no-terms-in-force`: no approved agreement version is in force on the date (5.5).
 * - `merchandise.bank-details-not-found`: the party has no bank-detail version of that identifier.
 */
function merchandisePartiesCodes() {
  return {
    'merchandise.party-not-supplier': 'refused',
    'merchandise.agreement-exists': 'refused',
    'merchandise.supplier-terms-on-brand-agreement': 'refused',
    'merchandise.no-terms-in-force': 'not-found',
    'merchandise.bank-details-not-found': 'not-found',
  } as const;
}

/**
 * The codes of `finance` · tax rules (shared-calculations 3.3, 10; S1-F09-T04) beside the books part's, which it
 * shares: `finance.code-taken`, `finance.record-not-found`, `finance.starts-in-past`, `finance.version-overlaps`,
 * `finance.no-ca-evidence` and `finance.version-not-awaiting`. A refusal names what blocks it (PRD-UXP-003).
 *
 * - `finance.reference-not-in-force`: the classification a rate rule names has no approved version in force, not
 *   retired, on the rule's start (10.1).
 * - `finance.tax-registration-not-found`: no tax registration of `organisation` has that identifier (10.1).
 * - `finance.rate-rule-invalid`: a rate is not an exact decimal, or the slabs are none, do not start at zero or do not
 *   rise by lower bound (10.3).
 * - `finance.shares-invalid`: a registration that charges tax has component shares that do not add up to one, or one
 *   that charges none has components (10.1; GC7-8).
 * - `finance.rounding-unit-not-positive`: a rounding rule's unit is not whole paise above zero (3.3, 10.3).
 * - `finance.rounding-level-invalid`: a level on a discount or bill rule, or none on a tax rule (3.3, 10.3).
 */
export const financeTaxRulesCodes = declareCodes({
  'finance.reference-not-in-force': 'refused',
  'finance.tax-registration-not-found': 'not-found',
  'finance.rate-rule-invalid': 'refused',
  'finance.shares-invalid': 'refused',
  'finance.rounding-unit-not-positive': 'refused',
  'finance.rounding-level-invalid': 'refused',
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
  ...organisationCodes,
  ...numberingCodes,
  ...exceptionsCodes,
  ...inboxCodes,
  ...merchandiseCodes,
  ...configurationCodes,
  ...siteLifecycleCodes,
  ...financeTaxRulesCodes,
  ...financeBooksCodes,
  ...financePostingCodes,
} as const;
export type ErrorCode = keyof typeof errorCodes;

/** The kind of a declared code. */
export function errorKindOf(code: ErrorCode): ErrorKind {
  return errorCodes[code];
}
