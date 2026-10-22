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
  // A command refused while the Organisation is held after a restore, until it is reopened; `missing` names the hold
  // (backup-and-restore 4.3; POL-18.03; S1-F14-T03).
  'kernel.recovery-hold': 'unavailable',
  // A delivery to an outside system of an event recorded at or before the recovery point, kept undelivered until its
  // outcome is reconciled with that system (backup-and-restore 4.5; PRD-INT-006).
  'kernel.outside-outcome-unreconciled': 'refused',
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
  // A document decided in two steps is decided at its second by none who decided its first, such as Accounts' check
  // of an open-to-buy budget version and its approval (access-and-approvals 9.8b; DEC-142); `missing` names the person
  // as `earlier-step-decider`.
  'access.earlier-step-decider': 'refused',
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
  // The recovery commands of a restored Organisation (backup-and-restore 4.3, 5.3; GC9-8; S1-F14-T03):
  // - `configuration.not-held`: the Organisation is not held after a restore, so there is nothing to validate or reopen.
  // - `configuration.restore-check-failed`: a step or check of the restore failed, and neither has it passed since when
  //   the checks ran again nor has the exception raised for it been settled (5.1; product owner, 12 Oct 2026);
  //   `missing` names each.
  // - `configuration.recovery-gaps-unsettled`: a recovery gap after the recovery point waits for the exception raised
  //   for it to be settled, resolved or accepted (4.5; product owner, 12 Oct 2026); `missing` names each.
  // - `configuration.validations-missing`: reopening needs the Operations and the Accounts validations of this restore;
  //   `missing` names each one not recorded.
  // - `configuration.series-not-reconciled`: reopening needs every series the restore paused reconciled; `missing`
  //   names each one waiting.
  'configuration.not-held': 'refused',
  'configuration.restore-check-failed': 'refused',
  'configuration.recovery-gaps-unsettled': 'refused',
  'configuration.validations-missing': 'refused',
  'configuration.series-not-reconciled': 'refused',
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
 * - `finance.period-locked`: the accounting date lies in a Locked period, or a Reopened one whose reopenings do not
 *   name the posting's source as a correction still to post (4.2, 4.3; PRD-LED-009, PRD-LED-020; S1-F09-T03).
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
  // A posting whose source is an import of historical reference (imports-and-opening-data 4.2; books-and-posting 9.1;
  // PRD-LIF-014, PRD-IMP-010; S1-F13-T01): a last guard behind the handler's own rule.
  'finance.historical-reference-source': 'refused',
  'finance.store-mismatch': 'refused',
  'finance.no-journal-series': 'unavailable',
  'finance.journal-series-paused': 'unavailable',
  'finance.already-reversed': 'refused',
  'finance.period-locked': 'refused',
});

/**
 * The codes of lock and reopening (books-and-posting 4.2, 4.3, 9.1; PRD-LED-009, PRD-LED-019, PRD-LED-020; DEC-106,
 * DEC-107; S1-F09-T03).
 *
 * - `finance.period-not-open`: the period is Locked or Reopened already, so it cannot be locked.
 * - `finance.earlier-period-open`: an earlier period of the book is still Open; periods lock in date order (4.2).
 * - `finance.period-not-locked`: a reopening is asked for a period that is still Open (4.3 step 1).
 * - `finance.no-correction-named`: a reopening names no correction (4.3 step 1; PRD-LED-020).
 * - `finance.reopening-not-in-force`: only a reopening in force can be withdrawn; one awaiting its decision is
 *   rejected by its approver instead (4.3 step 4).
 */
export const financePeriodCodes = declareCodes({
  'finance.period-not-open': 'refused',
  'finance.earlier-period-open': 'refused',
  'finance.period-not-locked': 'refused',
  'finance.no-correction-named': 'refused',
  'finance.reopening-not-in-force': 'refused',
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
 *
 * Imports (S1-F06-T01; imports-and-opening-data 3.1, 3.2, 13.1, 13.2):
 *
 * - `files-imports.type-not-allowed` also refuses an import upload that is not XLSX (9.2); PDF, JPEG and PNG are kept
 *   only as evidence.
 * - `files-imports.import-file-not-found`: the stored file or receipt named is not an XLSX file this person handed in.
 * - `files-imports.file-unreadable`: the reader could not open the stored workbook.
 * - `files-imports.layout-not-found`: the layout or mapping version named does not exist, or the mapping is not of
 *   that layout version or that target.
 * - `files-imports.layout-not-matched`: the file lacks the layout's sheet or a required column; `missing` names them.
 * - `files-imports.no-import-handler`: no handler of the target accepts the kind (4.2).
 * - `files-imports.no-import-batch-series` / `files-imports.import-batch-series-paused`: no Open series gives batch
 *   codes, so starting an import is unavailable, naming the series (GC9-9; numbering-and-audit 3.5).
 * - `files-imports.batch-not-found`: no batch with that identifier is visible to the reader.
 * - `files-imports.batch-not-staged` / `files-imports.batch-not-validated`: the batch is not in the state the step
 *   needs (3.2).
 * - `files-imports.document-refused`: the target's handler refused a document at publishing; `missing` names the
 *   document and the handler's reason. From S1-F06-T04 it is the refusal of that document's own transaction, and
 *   the reason a failed outcome keeps; the other documents publish.
 *
 * Layouts, mappings, mapping rules and the validation report (S1-F06-T03; imports-and-opening-data 3.2, 5, 6, 8,
 * 13.1, 13.2):
 *
 * - `files-imports.layout-code-taken` / `files-imports.mapping-code-taken`: another layout or mapping has the code.
 * - `files-imports.mapping-not-found`: the mapping named does not exist.
 * - `files-imports.mapping-field-unknown`: the mapping fills a field the target's handler does not have; `missing`
 *   names it.
 * - `files-imports.mapping-column-unknown`: the mapping reads a column its layout version does not name, or one it
 *   ignores; `missing` names it.
 * - `files-imports.mapping-encrypted-column`: the mapping fills a field from a column of an encrypted class that the
 *   field does not hold (section 11); `missing` names the column and class.
 * - `files-imports.rule-attribute-unknown`: no handler of the attribute's target has that field.
 * - `files-imports.rule-target-refused`: the handler that owns the target does not accept it (6.3); `missing` says why.
 * - `files-imports.rule-scope-not-found`: the layout a layout-scope rule names does not exist.
 * - `files-imports.rule-conflict`: the version would overlap a Confirmed version of the same rule that it cannot end:
 *   one starting on or after its own start (6.3, 15.1; code-house-rules 7.3); `missing` names it.
 * - `files-imports.starts-in-past`: a mapping rule version never starts on a past date, proposed or confirmed (GC2-7,
 *   DEC-105; code-house-rules 7.3).
 * - `files-imports.proposal-not-found` / `files-imports.proposal-not-open`: the version decided does not exist, or is
 *   no longer Proposed.
 * - `files-imports.layout-version-rejected`: a batch never starts with a Rejected layout or mapping version (6.4).
 * - `files-imports.batch-not-open`: the batch is Published or Failed, and is never edited (3.2).
 * - `files-imports.staged-row-not-found` / `files-imports.document-not-found` / `files-imports.issue-not-found`: not
 *   of this batch, or not visible to the reader.
 * - `files-imports.field-unknown`: the target's handler has no such field.
 * - `files-imports.document-not-staged`: the document is published, so it is neither excluded nor put back.
 * - `files-imports.ai-suggestions-unavailable`: AI drafts arrive with the AI gateway, switched off by default as a
 *   capability control (section 5; DEC-105, PRD-SEC-017); `missing` names the capability.
 * - `files-imports.not-validated-at-this-version`: the batch's report is not of its current version; validate again.
 * - `files-imports.blocking-issues-remain` / `files-imports.warnings-not-seen`: Submit for review refuses a batch with
 *   Blocking issues, or with Warnings nobody marked seen (8.2, 13.1); `missing` counts them.
 * - `files-imports.already-submitted`: the batch version is already submitted.
 * - `files-imports.review-missing`: Publish needs the batch version submitted, and where its handler requires one,
 *   an approval decision of that version (3.1 step 8, 13.1).
 * - `files-imports.version-not-confirmed`: Publish needs the batch's layout and mapping versions Confirmed (6.4).
 * - `files-imports.not-a-warning`: only a Warning is marked seen (8.2).
 *
 * Duplicate control, publishing per document and outcomes (S1-F06-T04; imports-and-opening-data 3.2, 7, 13.1):
 *
 * - `files-imports.file-already-imported`: the same file is read by a batch for the same target and layout that has
 *   not Failed (7.2); `missing` names the earlier batches the person may see. Withdraw them first.
 * - `files-imports.document-already-published`: the document reference claimed at the hand-in is already published
 *   for the target, and the batch is no governed revision of it (7.2, 7.3); `missing` names the published document
 *   only where the person may view its batch.
 * - `files-imports.document-conflict`: at publishing, a document's source identity is published with other content
 *   (7.2); `missing` names the document and the published one. The other documents publish.
 * - `files-imports.counts-do-not-close`: the rows staged differ from the rows the reader read, so the counts cannot
 *   close; Submit and Publish refuse the batch (7.4). `missing` names both counts.
 * Intake refusals and caps (S1-F06-T02; imports-and-opening-data 9.3, 11; PRD-SEC-011; DEC-112 GC6-3, GC6-5,
 * GC6-6). Each is answered before anything is stored; a stored file read again later answers the same:
 *
 * - `files-imports.file-unreadable` also refuses a damaged workbook at intake; `missing` names the reader's error as a
 *   word (`reader-error`), never its message, which may quote the file.
 * - `files-imports.workbook-active-content`: macros, active controls or embedded objects; `missing` names which.
 * - `files-imports.workbook-depends-on-another`: the workbook depends on data in another workbook; `missing` asks
 *   for a self-contained copy (A-9). Nothing is stripped and no linked value is trusted.
 * - `files-imports.workbook-unapproved-link`: a link that fetches something, such as an external image or object, or
 *   a data connection; an ordinary hyperlink is not one (GC6-17). `missing` names it.
 * - `files-imports.over-intake-cap`: over a cap at intake (uploaded size, expanded size, rows, parser memory,
 *   processing time); `missing` names the cap and its limit. Nothing is truncated.
 * - `files-imports.customer-contact-columns`: on the test setup, the file has columns its Confirmed layout marks as
 *   customer contact (section 11; DEC-052); `missing` names them. Upload it again without them.
 * - `files-imports.layout-needed-on-test-setup`: on the test setup, a sheet of the file that holds cells fits no
 *   Confirmed layout version, so its columns cannot be known to hold no customer contact; `missing` names it.
 * Opening batches and queued publishing (imports-and-opening-data 4.2, 10.1, 10.6; S1-F13-T03):
 *
 * - `files-imports.cutover-complete`: the unit's switch has completed its day-close cutover, so no opening batch is
 *   started or published for it; a later correction is a live correction (PRD-LIF-011). `missing` names the switch.
 * - `files-imports.publish-queued`: a request to post the batch already waits for its job; `missing` names it.
 * - `files-imports.nothing-to-publish`: every document of the batch is published or excluded.
 * - `files-imports.several-books`: a queued publish posts in one book's queue, and the documents post into several;
 *   `missing` names the books.
 * - `files-imports.publish-request-not-found`, `files-imports.publish-request-answered`,
 *   `files-imports.publish-request-superseded`: a queued publish's job finds its request gone, answered already, or
 *   followed by a later one.
 * A batch about one record (imports-and-opening-data 13.1, 13.2; S2-F04-T02), such as the GRN a PT file is for:
 *
 * - `files-imports.subject-required`: the target's handler imports a file for one record, and the request names
 *   none; `files-imports.subject-not-taken`: it names one for a handler that takes none.
 * - `files-imports.subject-not-found`: no record of the handler's type the person may see has that identifier.
 * - `files-imports.subject-refused`: the handler refuses a file for the record now; `missing` names its reason as a
 *   code (`import-subject`) and what it names, as `files-imports.document-refused` does.
 * - `files-imports.header-rows-not-allowed`: the layout looks for the header on a row the target's files never have
 *   it on, such as a PT file's, on row 1 or row 2 (goods-in 5.2); `missing` names each row the target allows.
 */
export const filesImportsCodes = declareCodes({
  'files-imports.type-not-allowed': 'refused',
  'files-imports.file-too-large': 'refused',
  'files-imports.active-content': 'refused',
  'files-imports.pdf-not-inspectable': 'refused',
  'files-imports.file-store-not-configured': 'unavailable',
  'files-imports.attachment-not-found': 'not-found',
  'files-imports.restricted-file-is-an-export': 'refused',
  'files-imports.import-file-not-found': 'not-found',
  'files-imports.file-unreadable': 'refused',
  'files-imports.layout-not-found': 'not-found',
  'files-imports.layout-not-matched': 'refused',
  'files-imports.no-import-handler': 'refused',
  'files-imports.no-import-batch-series': 'unavailable',
  'files-imports.import-batch-series-paused': 'unavailable',
  'files-imports.batch-not-found': 'not-found',
  'files-imports.batch-not-staged': 'refused',
  'files-imports.batch-not-validated': 'refused',
  'files-imports.document-refused': 'refused',
  'files-imports.workbook-active-content': 'refused',
  'files-imports.workbook-depends-on-another': 'refused',
  'files-imports.workbook-unapproved-link': 'refused',
  'files-imports.over-intake-cap': 'refused',
  'files-imports.customer-contact-columns': 'refused',
  'files-imports.layout-needed-on-test-setup': 'refused',
  'files-imports.layout-code-taken': 'refused',
  'files-imports.mapping-code-taken': 'refused',
  'files-imports.mapping-not-found': 'not-found',
  'files-imports.mapping-field-unknown': 'refused',
  'files-imports.mapping-column-unknown': 'refused',
  'files-imports.mapping-encrypted-column': 'refused',
  'files-imports.rule-attribute-unknown': 'refused',
  'files-imports.rule-target-refused': 'refused',
  'files-imports.rule-scope-not-found': 'not-found',
  'files-imports.rule-conflict': 'refused',
  'files-imports.proposal-not-found': 'not-found',
  'files-imports.proposal-not-open': 'refused',
  'files-imports.layout-version-rejected': 'refused',
  'files-imports.batch-not-open': 'refused',
  'files-imports.staged-row-not-found': 'not-found',
  'files-imports.document-not-found': 'not-found',
  'files-imports.issue-not-found': 'not-found',
  'files-imports.field-unknown': 'refused',
  'files-imports.document-not-staged': 'refused',
  'files-imports.ai-suggestions-unavailable': 'unavailable',
  'files-imports.not-validated-at-this-version': 'refused',
  'files-imports.blocking-issues-remain': 'refused',
  'files-imports.warnings-not-seen': 'refused',
  'files-imports.already-submitted': 'refused',
  'files-imports.review-missing': 'refused',
  'files-imports.version-not-confirmed': 'refused',
  'files-imports.not-a-warning': 'refused',
  'files-imports.file-already-imported': 'refused',
  'files-imports.document-already-published': 'refused',
  'files-imports.document-conflict': 'refused',
  'files-imports.counts-do-not-close': 'refused',
  'files-imports.starts-in-past': 'refused',
  // Comparison runs (imports-and-opening-data 10.3, 13.1; S1-F13-T01).
  'files-imports.comparison-run-not-found': 'not-found',
  'files-imports.comparison-set-not-found': 'not-found',
  'files-imports.comparison-set-wrong': 'refused',
  'files-imports.comparison-side-masked': 'not-authorised',
  'files-imports.comparison-places-differ': 'refused',
  // Opening batches and queued publishing (imports-and-opening-data 4.2, 10.1, 10.6; S1-F13-T03).
  'files-imports.cutover-complete': 'refused',
  'files-imports.publish-queued': 'refused',
  'files-imports.nothing-to-publish': 'refused',
  'files-imports.several-books': 'refused',
  'files-imports.publish-request-not-found': 'not-found',
  'files-imports.publish-request-answered': 'refused',
  'files-imports.publish-request-superseded': 'refused',
  // A batch about one record (imports-and-opening-data 13.1, 13.2 "As built"; S2-F04-T02).
  'files-imports.subject-required': 'refused',
  'files-imports.subject-not-taken': 'refused',
  'files-imports.subject-not-found': 'not-found',
  'files-imports.subject-refused': 'refused',
  'files-imports.header-rows-not-allowed': 'refused',
});

/**
 * The codes of `ebo-imports` (module-map section 5; imports-and-opening-data 4.1, 12; S1-F13-T01), named by the
 * historical-reference handler's preview: the batch names no Store, a row names no barcode and no item code, a
 * quantity is not a whole number, or the report date is not a date.
 */
export const eboImportsCodes = declareCodes({
  'ebo-imports.store-not-named': 'refused',
  'ebo-imports.identity-missing': 'refused',
  'ebo-imports.quantity-not-whole': 'refused',
  'ebo-imports.date-not-accepted': 'refused',
});

/**
 * The codes of `stock` · ledger (stock-ledger 13.8; S1-F10-T02). Each refusal names the item and what failed, so the
 * caller can show the reason (PRD-UXP-003). `stock.blocked` is the one generic refusal of a recheck that a hold, a
 * reservation or a count freeze the actor cannot see covers the units: it names nothing of that record (DEC-117).
 * `stock.plan-stale` is `refused`, kept under its key, so the person or job submits the request again under a new one
 * (13.1, 13.8; code-house-rules 12.3: the one conflict a command decides is a stale version; S1-F13-T03 review).
 */
export const stockLedgerCodes = declareCodes({
  'stock.caller-not-registered': 'refused',
  'stock.item-not-registered': 'refused',
  'stock.historical-reference-source': 'refused',
  'stock.business-date-not-set': 'unavailable',
  'stock.invalid-item': 'refused',
  'stock.place-invalid': 'refused',
  'stock.route-not-allowed': 'refused',
  'stock.plan-stale': 'refused',
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
  // The valued items (S1-F10-T03).
  'stock.no-cost-setting': 'unavailable',
  'stock.not-sellable': 'refused',
  'stock.posting-refused': 'refused',
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
 * - `organisation.mapping-incomplete`: a unit version names some of a mapping's three fields and its origin, not all
 *   (3.4; RR-558).
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
 * - `numbering.financial-year-invalid`, `numbering.financial-year-label-taken`, `numbering.financial-year-overlaps`: a
 *   financial year needs a label of its own and a last day on or after its first, and never overlaps another (3.3;
 *   S1-F12-T01).
 */
export const numberingCodes = declareCodes({
  'numbering.financial-year-invalid': 'refused',
  'numbering.financial-year-label-taken': 'refused',
  'numbering.financial-year-overlaps': 'refused',
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
  // Reconcile after a restore (numbering-and-audit 3.6, 3.7; backup-and-restore 5.3; S1-F14-T03): the series is not
  // waiting for a reconciliation after a restore.
  'numbering.series-not-paused-after-restore': 'refused',
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
 * - `exceptions.not-a-recovery-gap`: only an exception raised for a recovery gap or a failed check of a restore is
 *   settled this way (backup-and-restore 4.5).
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
  'exceptions.not-a-recovery-gap': 'refused',
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
 * - `merchandise.attribute-not-list`: a value is proposed for an attribute that is not list-type, or such an
 *   attribute is marked as the season or the size list (4.2; GC2-9).
 * - `merchandise.office-unit-has-no-brand`: an office unit operates without a brand (3.3; PRD-ORG-006).
 * - `merchandise.brand-counter-one-brand`: a brand-counter unit covers at most one brand (3.3; PRD-ORG-006).
 * - `merchandise.proposal-not-found`: no proposal has that identifier.
 * - `merchandise.proposal-not-open`: the proposal is already confirmed or rejected (4.2).
 * - `merchandise.attribute-not-marked`: no attribute is marked as the season, or as the size list, in force now, so a
 *   budget's season or a count line's size cannot be read (4.2 "As built"; RR-550, RR-556); `missing` names the
 *   setting, `merchandise.season-attribute` or `merchandise.size-attribute`.
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
  'merchandise.attribute-not-marked': 'unavailable',
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
 * - `merchandise.code-conflict`: an active mapping of the code in an overlapping scope names another target; between
 *   two mappings of a supplier barcode under one brand, which may name more than one SKU, the same SKU in another unit
 *   (4.3; PRD-MER-007, DEC-135; RR-554).
 * - `merchandise.code-ambiguous`: more than one target matches the code, other than SKUs each named by a barcode
 *   recorded under the brand given, or under any brand where none is given, which are answered as candidates (4.7;
 *   PRD-MER-007, DEC-135; RR-554).
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

/**
 * The codes of devices and billing devices (offline-counter 3.1 to 3.4, 12.1; access-and-approvals 2.4; S1-F12-T01).
 *
 * - `access.device-code-taken`: another device of the Organisation has the code, without regard to letter case (2.4).
 * - `access.device-not-found`: no device has that identifier.
 * - `access.device-already-enrolled`: a device is enrolled once; its key never changes (offline-counter 3.2).
 * - `access.device-proof-refused`: the signature over the challenge did not verify with the key, or the challenge is
 *   unknown or used (offline-counter 3.3; PRD-OFF-010).
 * - `pos.store-not-found`: no Store has that identifier.
 * - `pos.unit-not-of-store`: a unit listed is not a whole-store or brand-counter unit of the device's Store, such as a
 *   unit of another Store, an office or a warehouse; `missing` names it (offline-counter 3.1; PRD-ORG-005).
 * - `pos.unit-listed-twice`: a unit is listed more than once.
 * - `access.device-ended`: the device is Revoked or Ended already, which are final (offline-counter 3.1, 3.5;
 *   S1-F12-T02).
 * - `pos.device-not-active`: a device's units change only while it is Active (offline-counter 12.1).
 * - `pos.starts-in-past`: a unit change starts before today (code-house-rules 7.3; GC2-7, DEC-105).
 * - `pos.unit-change-scheduled`: the device already has a unit listed from that date or later; a later change starts
 *   after it (offline-counter 3.6).
 * - `pos.units-unchanged`: the list is the one in force on that date.
 * - `pos.bill-format-without-device`: a bill-number format carries no part taken from the device, so two devices of
 *   one registration and year could give the same number (numbering-and-audit 3.5; S1-F12-T03).
 * - `pos.format-code-taken`: the format code names a format other than the bill-number format in force, such as
 *   another kind's; a new bill format takes a new code (offline-counter 4.3b).
 * - `pos.change-not-found`: no financial-year or bill-format change has that identifier.
 * - `pos.change-not-awaiting`: the change no longer awaits its decision, being decided or withdrawn already, so it
 *   cannot be withdrawn (offline-counter 4.3b; RR-489).
 */
export const deviceCodes = declareCodes({
  'access.device-code-taken': 'refused',
  'access.device-not-found': 'not-found',
  'access.device-already-enrolled': 'refused',
  'access.device-proof-refused': 'refused',
  'pos.store-not-found': 'not-found',
  'pos.unit-not-of-store': 'refused',
  'pos.unit-listed-twice': 'refused',
  'access.device-ended': 'refused',
  'pos.device-not-active': 'refused',
  'pos.starts-in-past': 'refused',
  'pos.unit-change-scheduled': 'refused',
  'pos.units-unchanged': 'refused',
  'pos.bill-format-without-device': 'refused',
  'pos.format-code-taken': 'refused',
  'pos.change-not-found': 'not-found',
  'pos.change-not-awaiting': 'refused',
});

/**
 * `booking`'s codes (goods-in 3.3, 10.3; S2-F01-T02):
 *
 * - `booking.record-not-found`: no open-to-buy budget, or no version of one, has that identifier.
 * - `booking.brand-not-in-force`: the brand has no approved version in force today that does not retire it
 *   (structure-and-masters 2.5).
 * - `booking.season-not-in-vocabulary`: the season is not an approved value of its attribute in force today
 *   (structure-and-masters 4.2; goods-in 3.1).
 * - `booking.budget-exists`: the brand and season have a budget already; a change is its next version (3.3).
 * - `booking.version-not-awaiting`: the version is decided already, or a newer version replaced it.
 * - `booking.budget-not-checked`: the version's approval is refused until Accounts' check is recorded (POL-05.09).
 *
 * A booking's own (goods-in 3.1 to 3.4, 10.3; S2-F01-T03):
 *
 * - `booking.record-not-found` also: no booking has that identifier, or none the reader may see.
 * - `booking.site-not-in-force`: the destination is not a Site in force today (goods-in 3.1).
 * - `booking.supplier-not-linked`: the supplier is not linked to the brand, or holds no supplier role, on the booking's
 *   date (PRD-MER-021).
 * - `booking.not-draft`: the booking takes no such change now: its version waits for a decision, or, for booking
 *   documents, it has been approved (goods-in 3.4, 3.5).
 * - `booking.no-document`: a booking is submitted only with at least one booking document attached (goods-in 3.1).
 * - `booking.no-lines`: a booking is submitted only with at least one line (goods-in 3.1).
 * - `booking.no-agreement-in-force`: the brand has no Agreement version in force on the approval's date; `missing`
 *   names the brand (goods-in 3.2; DEC-129).
 * - `booking.open-to-buy-missing`: the brand and season have no approved open-to-buy budget (goods-in 3.3;
 *   PRD-SEC-017).
 * - `booking.open-to-buy-short`: the booking's value at cost is more than the remaining open-to-buy; `missing` names
 *   the brand and season, and the screen shows the amounts from the booking's and the budget's reads (goods-in 3.3,
 *   3.9).
 * - `booking.no-booking-series`, `booking.booking-series-paused`: no Open booking number series
 *   (numbering-and-audit 3.2; goods-in 3.1).
 *
 * An approved booking's lifecycle (goods-in 3.4 to 3.8, 3.10; S2-F01-T04):
 *
 * - `booking.not-approved`: the booking has no approved version yet, so it is not issued, confirmed, cancelled,
 *   extended or received against (goods-in 3.4).
 * - `booking.already-issued`, `booking.already-confirmed`: the version in force is recorded as Issued, or Confirmed,
 *   already (POL-05.01).
 * - `booking.not-issued`: Confirmed is recorded only once the version in force is Issued (POL-05.01).
 * - `booking.date-in-future`: the date given is later than today (code-house-rules 9).
 * - `booking.date-too-early`: Issued is dated before the approval's date, or Confirmed before the issue's date.
 * - `booking.no-change`: an approved booking is submitted again only with a newer version, a change (goods-in 3.5).
 * - `booking.communication-required`: after issue, a change, a cancellation or an extension carries the supplier's
 *   communication (POL-05.04).
 * - `booking.line-not-found`: no line of the booking, or of its version in force, has that key.
 * - `booking.line-repeated`: one version names a line's key twice.
 * - `booking.line-below-received`: a change lowers a line, or leaves it out, below what is delivered and cancelled of
 *   it (PRD-BKG-013, POL-05.04).
 * - `booking.line-received`: a change alters the style code, colour or size of a line with goods linked to it.
 * - `booking.nothing-outstanding`: a cancellation names a line, or a booking, with nothing outstanding (goods-in 3.6).
 * - `booking.balance-changed`: the outstanding balance changed since the cancellation was proposed; propose it again.
 * - `booking.version-not-in-force`: the cancellation or extension amends a version a change has since replaced.
 * - `booking.not-an-extension`: a date given is not later than the one it replaces, or nothing is extended.
 * - `booking.receipt-already-linked`: the GRN line is linked to a booking line already (goods-in 3.7; PRD-BKG-008).
 * - `booking.amendment-pending`: a cancellation, or an extension, of the booking waits for its decision already;
 *   `missing` names it, to decide first, so no proposal is dropped unseen (goods-in 3.10).
 * - `booking.goods-not-of-line`: a later receipt link names a booking line the GRN line's goods do not match: its
 *   style code, and its colour and size where the booking line gives them (goods-in 3.7, 3.10; PRD-BKG-008).
 * - `booking.receipt-link-proposed`: the GRN line waits in a proposal to link it into a booking already; that proposal
 *   is decided first (goods-in 4.10; POL-05.08).
 * - `booking.link-proposal-pending`: a proposal to link late or excess goods into the booking waits for its decision
 *   already; `missing` names it, to decide first, so no proposal is dropped unseen (goods-in 4.10).
 */
export const bookingCodes = declareCodes({
  'booking.record-not-found': 'not-found',
  'booking.brand-not-in-force': 'refused',
  'booking.season-not-in-vocabulary': 'refused',
  'booking.budget-exists': 'refused',
  'booking.version-not-awaiting': 'refused',
  'booking.budget-not-checked': 'refused',
  'booking.site-not-in-force': 'refused',
  'booking.supplier-not-linked': 'refused',
  'booking.not-draft': 'refused',
  'booking.no-document': 'refused',
  'booking.no-lines': 'refused',
  'booking.no-agreement-in-force': 'refused',
  'booking.open-to-buy-missing': 'refused',
  'booking.open-to-buy-short': 'refused',
  'booking.no-booking-series': 'unavailable',
  'booking.booking-series-paused': 'unavailable',
  'booking.not-approved': 'refused',
  'booking.already-issued': 'refused',
  'booking.already-confirmed': 'refused',
  'booking.not-issued': 'refused',
  'booking.date-in-future': 'refused',
  'booking.date-too-early': 'refused',
  'booking.no-change': 'refused',
  'booking.communication-required': 'refused',
  'booking.line-not-found': 'refused',
  'booking.line-repeated': 'refused',
  'booking.line-below-received': 'refused',
  'booking.line-received': 'refused',
  'booking.nothing-outstanding': 'refused',
  'booking.balance-changed': 'refused',
  'booking.version-not-in-force': 'refused',
  'booking.not-an-extension': 'refused',
  'booking.receipt-already-linked': 'refused',
  'booking.amendment-pending': 'refused',
  'booking.goods-not-of-line': 'refused',
  'booking.receipt-link-proposed': 'refused',
  'booking.link-proposal-pending': 'refused',
});

/**
 * `receiving`'s codes (goods-in 4.1 to 4.5, 10.3; S2-F02-T02):
 *
 * - `receiving.record-not-found`: no Arrival, or no count line of it, has that identifier.
 * - `receiving.unit-not-at-site`: the business unit is not in force today, or not at a Site.
 * - `receiving.location-not-of-unit`: the receiving location is not a location of the unit in force today
 *   (structure-and-masters 3.5).
 * - `receiving.brand-not-in-force`: the brand has no approved version in force on the arrival date.
 * - `receiving.supplier-not-linked`: the supplier is not linked to the brand, or holds no supplier role, on the arrival
 *   date (PRD-MER-021).
 * - `receiving.arrival-in-future`: the arrival time is later than now (PRD-MOD-009).
 * - `receiving.grn-issued`: the Arrival's GRN is issued; it is never changed or issued again (goods-in 4.5, 4.7).
 * - `receiving.invoice-number-repeated`: the Arrival holds an invoice with that number already.
 * - `receiving.possible-duplicate-invoice`: another Arrival of the supplier holds the number; `missing` names those
 *   the receiver may see, and the receiver confirms or corrects it (goods-in 4.2).
 * - `receiving.invoice-required`: the count starts, and the GRN is issued, only once an invoice is recorded (DEC-133).
 * - `receiving.size-not-on-list`: the size is not an approved value of its attribute in force today (goods-in 4.3).
 * - `receiving.line-repeated`: another line of the count counts the same style, colour and size; `missing` names it,
 *   the line to change instead (goods-in 4.3, one line per style, colour and size).
 * - `receiving.sku-not-of-line`: the product named is not in force at the Site today, is of another brand, or of
 *   another style code than the line's (goods-in 4.3).
 * - `receiving.no-lines`: a GRN with no counted line is not issued (goods-in 4.5).
 * - `receiving.extra-not-recorded`: a line has extra pieces the count does not record as received or not received
 *   (goods-in 4.4); the line is saved again saying which (S2-F02-T03).
 * - `receiving.batch-required`: the product's tracking profile requires a batch and expiry the line lacks
 *   (PRD-MER-011).
 * - `receiving.batch-not-tracked`: the line gives a batch its product's profile does not track, or has no product.
 * - `receiving.no-grn-series`, `receiving.grn-series-paused`: no Open GRN number series (numbering-and-audit 3.2).
 * - `receiving.held-line-decided`: the held line is decided already; a decision is made once (goods-in 4.6).
 * - `receiving.not-unidentified`: only unidentified goods are named a product before they are taken in (4.6).
 * - `receiving.product-not-named`: unidentified goods are taken in only once Booking names their product (4.6), and
 *   linked to a booking line only then (3.7, 4.10).
 * - `receiving.booking-not-of-arrival`: the booking is of another brand, or its version in force of another supplier,
 *   than the Arrival's; `missing` names it (goods-in 3.7, 4.2, 4.10; S2-F02-T04).
 * - `receiving.nothing-received`: the GRN line received no piece, so it delivers nothing to link (goods-in 4.10).
 * - `receiving.size-required`: a line of goods on the invoice, or of wrong goods named by their product, has no size
 *   recorded; `missing` names each such line, which is saved again with its size before the GRN is issued (goods-in
 *   4.3, 5.4; the product owner, 22 Oct 2026, RR-586).
 * - `receiving.pt-attached`: the GRN has its PT attached; a recount waits until it is withdrawn, rejected or reversed
 *   (goods-in 4.7, 5.8); `missing` names the GRN and the PT revision.
 *
 * A recount (goods-in 4.7, 4.11; PRD-REC-019; S2-F02-T05):
 *
 * - `receiving.recount-pending`: another recount of the GRN waits for its decision; `missing` names it.
 * - `receiving.recount-decided`: the recount is decided already; a decision is made once.
 * - `receiving.recount-unchanged`: a line is recounted at the pieces it counts now.
 * - `receiving.recount-held-line`: the line's extra pieces are held as a held line, whose hold only the PT route or its
 *   decision ends; `missing` names the held line.
 * - `receiving.recount-not-on-invoice`: the line counts wrong or unidentified goods, which a recount does not change.
 * - `receiving.recount-adds-extra`: the recount would count pieces beyond the invoice on a line whose count recorded
 *   none, so what happens to them is not recorded.
 * - `receiving.recount-below-damage`: the recount would count fewer pieces than the count found damaged.
 * - `receiving.recount-linked`: the line delivers its pieces to a booking, linked or proposed (goods-in 3.7, 4.10).
 */
export const receivingCodes = declareCodes({
  'receiving.record-not-found': 'not-found',
  'receiving.unit-not-at-site': 'refused',
  'receiving.location-not-of-unit': 'refused',
  'receiving.brand-not-in-force': 'refused',
  'receiving.supplier-not-linked': 'refused',
  'receiving.arrival-in-future': 'refused',
  'receiving.grn-issued': 'refused',
  'receiving.invoice-number-repeated': 'refused',
  'receiving.possible-duplicate-invoice': 'refused',
  'receiving.invoice-required': 'refused',
  'receiving.size-not-on-list': 'refused',
  'receiving.line-repeated': 'refused',
  'receiving.sku-not-of-line': 'refused',
  'receiving.no-lines': 'refused',
  'receiving.extra-not-recorded': 'refused',
  'receiving.batch-required': 'refused',
  'receiving.batch-not-tracked': 'refused',
  'receiving.no-grn-series': 'unavailable',
  'receiving.grn-series-paused': 'unavailable',
  'receiving.held-line-decided': 'refused',
  'receiving.not-unidentified': 'refused',
  'receiving.product-not-named': 'refused',
  'receiving.booking-not-of-arrival': 'refused',
  'receiving.nothing-received': 'refused',
  'receiving.size-required': 'refused',
  // The GRN's "PT attached" mark (goods-in 5.8; S2-F04-T02).
  'receiving.pt-attached': 'refused',
  'receiving.pt-not-attached': 'refused',
  // A recount (goods-in 4.7, 4.11; S2-F02-T05).
  'receiving.recount-pending': 'refused',
  'receiving.recount-decided': 'refused',
  'receiving.recount-unchanged': 'refused',
  'receiving.recount-held-line': 'refused',
  'receiving.recount-not-on-invoice': 'refused',
  'receiving.recount-adds-extra': 'refused',
  'receiving.recount-below-damage': 'refused',
  'receiving.recount-linked': 'refused',
});

/**
 * `merchandise` · PT's codes (goods-in 5, 10.3; S2-F04-T02). A PT file for a GRN is refused, before a batch starts, by
 * the handler's reasons that `files-imports.subject-refused` names, and, at its submit, by those that
 * `files-imports.document-refused` names (imports-and-opening-data 13.1):
 *
 * - `merchandise.pt-held-lines-open`: a held line or a damage report on the GRN's lines, or a recount of the GRN, waits
 *   for its decision (goods-in 5.1, 4.6, 4.11; DEC-137); `missing` names each.
 * - `merchandise.pt-already-attached`: the GRN has a PT revision waiting for approval, or approved and not reversed
 *   (goods-in 5.1; one PT per GRN); `missing` names it.
 * - `merchandise.pt-file-refused`: at submit, the file no longer passes the checks of 5.3 and 5.4 against the GRN as it
 *   stands; `missing` names every problem, each by its code, row and field, as the validation report lists them
 *   (goods-in 5.6; PRD-IMP-007).
 * - `merchandise.pt-not-a-draft`: the revision is withdrawn, decided, or not the PT's newest (goods-in 5.7).
 *
 * Its approval (goods-in 6.3, 6.6; S2-F06-T01) is refused under the locks, besides the gate, `access`'s and the
 * ledger's own refusals, by:
 *
 * - `merchandise.pt-grn-changed`: the GRN's good pieces per style and size are no longer those the PT covers, as after
 *   a recount, a held line or a damage report decided since the upload; `missing` names the style and size.
 * - `merchandise.no-pt-series`, `merchandise.pt-series-paused`: no Open PT number series (goods-in 10.4).
 * - `merchandise.no-sku-code-series`, `merchandise.sku-code-series-paused`: no Open SKU code series, while the PT
 *   proposes new products, whose codes it draws (RR-585; numbering-and-audit 2).
 * - `merchandise.pt-size-not-in-size-set`: a new product's size, the row's size code, is not in its category's size set
 *   in force; `missing` names the row, the category and the size.
 * - `merchandise.pt-colour-not-identity`: a new product's category does not hold the colour list among its identity
 *   attributes, so the SKU could not keep the row's colour; `missing` names the row and the category.
 * - `merchandise.pt-tracking-unknown`: a new product's category has no tracking profile in force at the GRN's Site, so
 *   how its goods are tracked is Unknown (structure-and-masters 4.6); `missing` names the row and the category.
 *
 * - `merchandise.pt-not-official`: a revision not Official is not downloaded (goods-in 6.5).
 *
 * The problems of a file are the issues of its validation report, by row and column (goods-in 5.3, 5.4, 5.6): a value
 * off its list, a brand not the GRN's, a barcode not digits, an HSN not of six or eight digits, a quantity not whole
 * pieces above zero, an amount not above zero, P RATE above MRP, NAG not QTY, MARGIN that disagrees, a style and size
 * whose quantity differs from the GRN's good pieces, one the GRN lacks and one the file misses, and an ITEM the
 * master sheet's item map does not give that SUB CATEGORY and TYPE (RR-583).
 */
export const ptCodes = declareCodes({
  'merchandise.pt-held-lines-open': 'refused',
  'merchandise.pt-already-attached': 'refused',
  'merchandise.pt-file-refused': 'refused',
  'merchandise.pt-not-a-draft': 'refused',
  'merchandise.pt-grn-changed': 'refused',
  'merchandise.no-pt-series': 'unavailable',
  'merchandise.pt-series-paused': 'unavailable',
  'merchandise.no-sku-code-series': 'unavailable',
  'merchandise.sku-code-series-paused': 'unavailable',
  'merchandise.pt-size-not-in-size-set': 'refused',
  'merchandise.pt-colour-not-identity': 'refused',
  'merchandise.pt-tracking-unknown': 'refused',
  'merchandise.pt-not-official': 'refused',
});

/**
 * `stock` · documents' codes (goods-in 8, 10.3; S2-F08-T01):
 *
 * - `stock.record-not-found`: no damage report, or no reversal of one, has that identifier, or none the reader may see.
 * - `stock.goods-not-found`: the GRN line names no counted goods, or the product is not in force at the Site today.
 * - `stock.location-not-found`: no location has that identifier (structure-and-masters 3.5).
 * - `stock.report-decided`: the report's decision is made already; a mistaken confirmation is reversed instead (8.3).
 * - `stock.report-not-confirmed`: only a confirmation the report stands on is reversed (8.3; PRD-STK-017).
 * - `stock.reversal-open`: a reversal of the confirmation waits for its approval already.
 * - `stock.no-damage-report-series`, `stock.damage-report-series-paused`: no Open damage-report number series
 *   (numbering-and-audit 3.2; goods-in 10.4).
 */
export const stockDocumentsCodes = declareCodes({
  'stock.record-not-found': 'not-found',
  'stock.goods-not-found': 'refused',
  'stock.location-not-found': 'refused',
  'stock.report-decided': 'refused',
  'stock.report-not-confirmed': 'refused',
  'stock.reversal-open': 'refused',
  'stock.no-damage-report-series': 'unavailable',
  'stock.damage-report-series-paused': 'unavailable',
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
  ...financePeriodCodes,
  ...deviceCodes,
  ...eboImportsCodes,
  ...bookingCodes,
  ...receivingCodes,
  ...ptCodes,
  ...stockDocumentsCodes,
} as const;
export type ErrorCode = keyof typeof errorCodes;

/** The kind of a declared code. */
export function errorKindOf(code: ErrorCode): ErrorKind {
  return errorCodes[code];
}
