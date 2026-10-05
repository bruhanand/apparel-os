# S1-F01 — First access

> **Not ranked.** Part of the [implementation plan](index.md). It decides nothing. The rules come from the PRD, the policies and the designs cited; where this page and a design disagree, the design wins and this page is fixed.

## 1. Outcome

On synthetic data, a platform operator runs the one-time setup step for a new Organisation. Its first Admin and its first approver of access changes sign in with the Organisation code, their login, their password and an authenticator code. The Admin prepares a role and a role assignment for a third person; a different authorised person approves it from My work with a reason; the assignment takes effect from its date; the third person can then do exactly what it grants and nothing more. Every step is recorded and readable in history. Self-approval, stale versions, repeated requests and anything crossing Organisations are refused, and each refusal says what is missing.

This is the first vertical slice of the shared foundation: it builds the kernel plumbing, `access`, `audit` and `inbox` that every later feature calls.

## 2. Binding references

| Kind | References |
| --- | --- |
| PRD | `PRD-ACS-001` to `PRD-ACS-007`, `PRD-ACS-009`, `PRD-ACS-010`, `PRD-ACS-013`, `PRD-ACS-014`, `PRD-ACS-017`, `PRD-ACS-020`, `PRD-ACS-022`, `PRD-ACS-023`; `PRD-SEC-001`, `PRD-SEC-005` to `PRD-SEC-008`, `PRD-SEC-014`, `PRD-SEC-016`, `PRD-SEC-018`; `PRD-INT-001`, `PRD-INT-002`, `PRD-INT-004`, `PRD-INT-008`; `PRD-MOD-001`, `PRD-MOD-003`, `PRD-MOD-006`, `PRD-MOD-008` to `PRD-MOD-011`; `PRD-ORG-002`; `PRD-UXP-001`, `PRD-UXP-003`; `PRD-EXC-011`; `PRD-PRF-004` |
| Policies | `POL-02.01` to `POL-02.03`, `POL-02.06` to `POL-02.08`, `POL-02.17`, `POL-02.18`, `POL-02.23` |
| Decisions | `DEC-001`, `DEC-093`, `DEC-099`, `DEC-100`, `DEC-101`, `DEC-102`, `DEC-103`, `DEC-104`, `DEC-105` |
| Designs | [access-and-approvals.md](../design/access/access-and-approvals.md) sections 2 to 7, 8, 9.1, 9.3, 9.5, 9.6, 9.11, 11, 13.1, 13.2, 14, 15; [module-map.md](../design/architecture/module-map.md) 4.1, 4.3, 4.5, 4.8, 6.1, 6.2 flow A; [domain-model.md](../design/architecture/domain-model.md) 3.2 to 3.4 and invariants 1 to 3, 11 to 13, 17, 24; [numbering-and-audit.md](../design/platform/numbering-and-audit.md) 4 and 5; [deployment.md](../design/platform/deployment.md) 3, 4, 9; [personas.md](../design/access/personas.md) 1 to 3; [design-language.md](../design/ui/design-language.md) 10.3, 10.5, 10.7, 10.13, 10.14, 10.17 |
| Plan | Code house rules parts A and B (`S0-T04`); migration roles (`S0-T05`); fixtures (`S0-T06`); simulated outside services first ([index.md](index.md) section 5): this feature calls none |

## 3. Actors and scope

| Actor | Persona | What they do here |
| --- | --- | --- |
| Platform operator, acting through the `setup` service identity | None: a service identity has no screens (`PRD-SEC-018`) | Runs the setup step once per Organisation |
| First Admin | P-ADM | Creates users, roles and role assignments; proposes the first reason list |
| First approver of access changes | Holds the approval role the setup step creates | Approves or rejects access changes from My work |
| Third person | P-AUD, for the demo | Signs in after approval and reads history within the role's grant |
| Worker, acting through an internal service identity | None | Delivers outbox rows: work items, live-update identifiers |

Scope: one synthetic Organisation with a second synthetic Organisation for isolation tests ([deployment.md](../design/platform/deployment.md) section 4). Role assignments use all-members or empty scope in each dimension; selected legal entities, places and brands arrive with `S1-F02` and `S1-F03`, because no such records exist yet. Every value is labelled synthetic.

## 4. Preconditions

- The start gate of [stage-0-preparation.md](stage-0-preparation.md) section 2 is met: Doc check green in CI, toolchain verified, house rules part A reviewed and approved, migration runner, roles and fixtures proved, the `AGENTS.md` sections reviewed.
- Before `S1-F01-T04`: house rules part B reviewed and approved, with [deployment.md](../design/platform/deployment.md) sections 5 and 9 (`S0-T08` round 2).
- Before `S1-F01-T10`: RR-017 settled in the access design by `S1-F01-T01`.
- Before `S1-F01-T14`: the design-language and blueprint parts the screens use are reviewed (DR-1b).
- On `dev` only: synthetic settings for session limits, sign-in throttling and the first reason list, each labelled synthetic. No KDPS value is used.
- Not preconditions: the number of builders (RR-031), the extra worktree, which stays preserved and untouched (RR-050), whether this plan is gated (RR-052), `S0-T07`, and every KDPS answer.

## 5. Workflow

1. **Setup.** The platform operator runs the setup step with an Organisation code, the two people's logins and temporary passwords, and the Organisation's settings (synthetic on `dev`). It creates the Organisation's database and, in one transaction there, the two users, their roles and all-members assignments, the settings, a setup record and the audit records, under the `setup` service identity; then it registers the code in the directory (`PRD-ACS-023`, `DEC-101`; access-and-approvals 9.11). Run again with the same code, it completes an interrupted setup and refuses a finished or conflicting one (section 9). Temporary passwords are handed over in person: nothing is sent before stage 5 (`DEC-099`).
2. **First sign-in.** Each of the two gives the Organisation code, login and temporary password, enrols an authenticator app and confirms it with a code, then sets a new password after a fresh code. A session starts; its idle and absolute limits come from settings (`PRD-SEC-001`, `POL-02.17`, `PRD-ACS-017`; access-and-approvals 3).
3. **First reason list.** The Admin proposes the approve and reject reasons and submits them. The approver decides with a free-text reason, which only a reason-list change may use (`POL-02.23`, `DEC-104`). Until a list is in force, every other decision is unavailable and says so.
4. **A role.** The Admin creates a role, starting from a template's permission set or by choosing permissions on the record types registered so far. Broad labels are expanded into explicit actions before saving (`POL-02.01`, `POL-02.03`). Saved as a draft, then submitted for approval.
5. **A user and an assignment.** The Admin creates the third user with persona P-AUD and prepares a role assignment: user, role, scope per dimension (all members or empty), start date today or later. Draft, then submit. Request approval binds the request to that version and records every user who changed it as a preparer (`PRD-ACS-007`; GC3-1, `DEC-105`).
6. **Approval.** The approver opens My work, where the request shows by due time and exposure (none here: an access change has no value). The approval panel shows the version, the material facts and the preparers. The approver gives a fresh authenticator code, picks a reason and approves. In one transaction the decision is recorded, the role and the assignment take effect from their dates, effective grants are rebuilt, audit and permission-change records are written, and outbox rows are saved (module-map 6.2 flow A).
7. **The new access.** The third person signs in (enrolling first) and reads the history of the assignment: who prepared it, who approved it, the reason, the versions. Opening the role editor is refused with the missing permission named (`PRD-UXP-003`).
8. **Refusals shown along the way.** The Admin trying to approve their own preparation is refused; editing a submitted draft supersedes its request, and a decision on the old version is refused.

## 6. UI states

| Screen | States |
| --- | --- |
| Sign-in | Ready; submitting; refused with one generic message; slowed after repeated failures (setting); locked session asking for the password again |
| Authenticator enrolment and password change | Secret shown once; code confirmed; refused code; new password refused by the password rules (setting) |
| Users, roles, assignments | Draft; Awaiting approval; Scheduled; In force; Ended; Rejected; Superseded request (DM-4, `DEC-105`). The assignment editor shows each dimension's scope and warns that an empty dimension grants nothing |
| Approval reasons | Draft; Awaiting approval; In force |
| My work | Loading; empty; list ordered by due time then exposure, Unknown above known; error; stale data shown with its as-of time (`PRD-PRF-004`) |
| Approval panel | Available; unavailable, naming what is missing (no reason list in force, not eligible, self-preparation); fresh code required; decided; superseded |
| History | List for a record or an actor, within the reader's scope; restricted values masked; as-of time |
| Every screen | Environment banner showing SYNTHETIC on `dev`; unfinished work kept when a session locks or expires (`PRD-ACS-017`, `PRD-UXP-003`) |

## 7. Business invariants

| Invariant | Source |
| --- | --- |
| One Organisation's data is never visible to another; a user belongs to one Organisation | `PRD-ORG-002`, `PRD-MOD-001`, `PRD-ACS-020`; domain-model invariant 1 |
| Access comes only from a role assignment, inside its own scope; a persona grants nothing | `PRD-ACS-002` to `PRD-ACS-004`, `PRD-INT-001`; invariant 2 |
| An approver is never a preparer, through any role; a service identity never decides | `PRD-ACS-006`, `POL-02.08`, `PRD-SEC-018`; invariant 3 |
| An approval binds to the version it reviewed; a material change ends it | `PRD-ACS-007`, `POL-02.12`; invariant 4 |
| Every access change after setup is approved by a different authorised person | `PRD-ACS-023`, `POL-02.07` |
| Assignment versions never overlap and never start in the past; empty scope grants nothing; all members includes later members | `PRD-ACS-005`, `PRD-MOD-010`; GC2-7 (`DEC-105`) |
| A self-service role holds nothing else and has only own-record scope | `PRD-ACS-022`, `DEC-100` |
| The same request has its effect once; changed content under the same key is refused and kept | `PRD-INT-002`; invariant 11 |
| The decision, the version taking effect, audit and outbox commit together or not at all | `PRD-INT-004`, `PRD-MOD-006`; invariant 12 |
| Audit and access records are append-only | `PRD-SEC-007`, `PRD-MOD-011`; invariant 13 |
| Secrets and restricted values never reach logs, errors, audit records or live updates | `PRD-SEC-006`, `PRD-SEC-014`; invariant 24 |
| Nothing is sent by message | `DEC-099` |

## 8. Records and versions affected

All tables follow access-and-approvals 13 and numbering-and-audit 6: UUIDv7 keys, one schema per module, effective-dated companions with an exclusion constraint on versions in force, no cross-schema foreign keys.

| Owner | Records written | Versioned |
| --- | --- | --- |
| Directory database | Organisation code and where its database is; nothing else (`DEC-093`) | No |
| `configuration` | Organisation settings needed now, such as the timezone (synthetic on `dev`) | Yes, effective-dated |
| `access` | `app_user`, `password_credential`, `second_factor`, `session`, `service_identity`, `service_credential`, `persona_held`, `role`, `role_permission`, `role_assignment`, `assignment_scope`, `effective_grant`, `approval_rule_setting`, `approval_reason`, `approval_request`, `approval_decision`, and the session-limit and sign-in settings | Users, roles, settings and reasons have versions; assignments are dated; decisions are entries, never edited |
| `inbox` | `work_item`, `work_item_actor`; `work_item_routing` exists with no rows (RR-058) | Work items follow their owner's version |
| `audit` | Audit records; access records (sign-in attempts, permission changes, sensitive access) | Append-only |
| `kernel` | Idempotency records, outbox rows, consumer receipts, job rows | Technical |

Not written in this feature: `assignment_scope_member` for places, legal entities and brands (`S1-F02`, `S1-F03`), `approval_limit`, `stand_in_grant`, `bulk_decision_batch` (`S1-F05`), `approval_use` (`S1-F10`), `device` (`S1-F12`).

## 9. Transaction, audit and outbox boundaries

| Operation | One transaction holds | Outbox rows | Audit or access record |
| --- | --- | --- | --- |
| Setup step | (1) If the directory already holds the code: refused as a duplicate, nothing written. (2) Otherwise create the database if it does not exist, and migrate it. (3) In it, one transaction: users, credentials, roles, assignments, settings, audit, and a setup record holding the code and a fingerprint of the request's non-secret fields. Skipped if a setup record with the same fingerprint exists; refused as a conflict if one with a different fingerprint exists. (4) Register the code in the directory, unique by code, so of two concurrent runs one registers and the other finds the work done. A run interrupted between (3) and (4) leaves an Organisation nobody can reach, and is completed by running the same request again; users are never created twice. Proposed here; settled in the access design by RR-017 | None | Audit under the `setup` service identity |
| Sign-in attempt | Session row on success; the access record on every attempt, in its own transaction so a failure is still recorded | None | Access record |
| Save a draft | The draft version; idempotency record | None | Audit |
| Submit | The version's state; the approval request with its preparers; idempotency record | `access.approval-requested` | Audit |
| Decide | Locks the request and the document version in ascending ID; rechecks eligibility, independence and the current version under the lock; writes the decision, makes the version take effect, rebuilds the actor's effective grants; idempotency record | `access.approval-decided`, `access.assignment-changed` | Audit; permission-change access record |
| Revoke sessions or disable a user | The session states; the user version | `access.session-revoked` | Audit; access record |
| Outbox delivery (worker) | The consumer's own effect (work item published, updated or closed) and its receipt for the event identity | — | — |
| Date passes for a start or end | A scheduled job rebuilds effective grants | `access.assignment-changed` | Audit |

No outside system is called inside any of these transactions (`PRD-INT-006`).

## 10. Failure and concurrency cases

| Case | Expected behaviour | Test |
| --- | --- | --- |
| Wrong Organisation code, login, password or code | One generic refusal; an access record for a known Organisation; the service log only, without what was typed, for an unknown code | `S1-F01-AT03` |
| Repeated failed sign-ins | Attempts slow or stop under the configured setting | `S1-F01-AT03` |
| The Admin approves their own preparation, directly or through another role | Refused, naming self-preparation | `S1-F01-AT10` |
| Someone who edited the version, though not the submitter, approves it | Refused | `S1-F01-AT10` |
| The draft changes after submission | The request becomes Superseded; a decision on the old version is refused | `S1-F01-AT11` |
| Two approvers decide the same request at once | One decision commits; the other is refused because the request is no longer open | `S1-F01-AT14` |
| A decision is sent twice with the same idempotency key | One decision; the second call returns the first result | `S1-F01-AT14` |
| The same key with different content | Refused and kept for investigation | `S1-F01-AT14` |
| The database fails during Decide | Nothing commits: no decision, no effective version, no audit, no outbox row | `S1-F01-AT15` |
| The worker crashes after delivering and before acknowledging | The event is delivered again; the work item exists once | `S1-F01-AT13` |
| No reason list is in force | Deciding is unavailable and says so, except for the reason-list change itself | `S1-F01-AT12` |
| An assignment version starts in the past, overlaps another, or mixes self-service with other scope | Refused with the reason | `S1-F01-AT06`, `S1-F01-AT08` |
| The session passes its idle limit while a form is half filled | The session locks; the same user unlocks with the password; the input is kept, except restricted fields | `S1-F01-AT05` |
| A user is disabled or their sessions are revoked | The next request is refused | `S1-F01-AT05` |
| Setup run again after it finished | Refused as a duplicate; nothing is written | `S1-F01-AT01` |
| Setup interrupted after its database transaction, before the directory entry | The Organisation cannot be reached; running the same request again registers it without creating users again | `S1-F01-AT01` |
| Setup run with a different request for a code whose database holds another setup record | Refused as a conflict; the operator removes the unregistered database deliberately before trying again | `S1-F01-AT01` |
| Two setup runs for one code at once | One registers the code; the other is refused or finds the work done | `S1-F01-AT01` |
| A request without an actor reaches a scoped table | No rows | `S1-F01-AT09` |
| A browser reloads in the middle of the approval journey | The approval panel reloads the request and its current state; nothing is decided twice | `S1-F01-AT18` |

## 11. Idempotency and replay

- Every write carries the idempotency key of the house rules, scoped by operation kind and actor (`PRD-INT-002`; stock-ledger 10.1). The key, a hash of the request and the result are kept in the command's transaction.
- Identical replay returns the first result with no second effect. Changed content under the same key is refused, and the refused request is kept in its own transaction for investigation.
- Every outbox event carries its own identity. Consumers keep a receipt per event and do nothing on a second delivery (`PRD-INT-008`). A work item is keyed by the owner's record, version and kind (access-and-approvals 11.1).
- The setup step is keyed by the Organisation code and the fingerprint of its request's non-secret fields. A finished setup (directory entry present) is refused; an interrupted one with the same fingerprint is completed; a different fingerprint is refused as a conflict. A completing run never changes the users, roles or passwords the first run created.

## 12. Dependencies and gates

| Item | Gate | Status |
| --- | --- | --- |
| Stage 0 start gate ([stage-0-preparation.md](stage-0-preparation.md) section 2), which holds RR-006, RR-011 part A, RR-020, RR-185, RR-186 | Code: the feature's start | To do |
| RR-011 part B and RR-021 ([deployment.md](../design/platform/deployment.md) sections 5, 9) | Code: `S1-F01-T04` | `S0-T04`, `S0-T08` round 2 |
| RR-017 setup-step roles and setup states | Code: `S1-F01-T10` | `S1-F01-T01` |
| RR-019, RR-023: the design-language and blueprint parts the screens use (DR-1b) | Code: `S1-F01-T14` | Review before the first screen |
| RR-054 password rules and throttling; RR-055 code freshness; RR-056 reason list | Live S1 | Synthetic settings on `dev`; with no freshness setting every protected action asks again |
| RR-064 role map; RR-067 validated sign-in settings; RR-158 policy 2 Signed; RR-177 confirmations of GC3-1, GC3-4, GC3-6, GC3-12 | Live S1 | Not needed to build, test or demo |
| RR-031, RR-050, RR-052, `S0-T07` | None | Outside every gate; the worktree stays preserved |

## 13. Ordered tasks

Each task leaves the full check set green and adds the tests named. "After" lists hard prerequisites; tasks without a shared prerequisite may run in parallel lanes.

| Task | Builds | After | Expected outputs | Completion criteria |
| --- | --- | --- | --- | --- |
| `S1-F01-T01` Design check and contract sketch | Read the design sections of section 2. Sketch the interfaces as Zod schemas and types only. Settle RR-017 in [access-and-approvals.md](../design/access/access-and-approvals.md) 9.11: the permissions of the setup step's two roles (from the Admin template of blueprint grid 3a, confirmed later by KDPS under V-01) and the setup states of section 9 (finished, interrupted, conflicting) across the two databases; and how a request with a session cookie finds its Organisation's database | Stage 0 start gate | Schemas in `packages/schemas`; a reviewed design edit | Typecheck passes; the doc checker passes with an honest review record; the product owner agrees the edit |
| `S1-F01-T02` Directory and Organisation routing | The directory database and its migration; resolution by Organisation code at sign-in and from the session afterwards; a pool per Organisation database; the generic refusal for an unknown code (`DEC-093`, `PRD-MOD-001`) | T01 | Kernel routing code; integration tests | Two synthetic Organisations route to their own databases; the directory holds only codes and locations; an unknown code leaves only a service-log line without the typed values |
| `S1-F01-T03` Command context | One transaction per command shared by called modules; the transaction-local actor setting read by row-level security; a lock helper taking rows in ascending ID; correlation identifier; business date from the Organisation's timezone (`PRD-MOD-006`, `PRD-MOD-009`, `PRD-INT-003`) | T02 | Kernel command runner; tests | Nested module calls share one transaction; a rollback undoes all of them; with no actor a scoped test table shows no row |
| `S1-F01-T04` Idempotency helper | The kernel idempotency table and helper of section 11 (`PRD-INT-002`) | T03; house rules part B approved | Helper; tests | Same key and content: one effect, same result; changed content: refused and kept; two concurrent calls with one key: one effect |
| `S1-F01-T05` API conventions in code | Validation from Zod, the error envelope and refusal codes, the idempotency-key requirement on writes, the version token, correlation identifier, generated OpenAPI and the typed client; the health endpoint moved onto them | T04 | Nest wiring; OpenAPI output; typed client; contract tests | A write without a key is refused; every error matches the envelope; OpenAPI is generated in CI; the web app compiles against the typed client |
| `S1-F01-T06` Outbox and worker | The outbox table written in the business transaction; the worker as a second start command of the same build, using pg-boss under an internal service identity; consumer registration and receipts; the retry rule of the house rules ([deployment.md](../design/platform/deployment.md) section 2) | T03, T08 (its internal service identity) | Kernel outbox and worker; tests | A rolled-back command leaves no outbox row; a redelivered event has one effect |
| `S1-F01-T07` Audit and access records | The `audit` schema: records partitioned by recording month, the append-only trigger with deletion only through the retention function (which deletes nothing while no period is set), Record, Record access, Read history within scope, the sealing job and seal check (numbering-and-audit 4) | T03 | `audit` module; tests | numbering-and-audit 7 tests 8 to 11 and 14 pass; test 12 passes once T11 lands |
| `S1-F01-T08` Sign-in and enrolment | Users and versions, service identities and their credentials (access-and-approvals 2.3), Argon2 password credentials, the encrypted authenticator secret under a per-Organisation key held outside the database, sessions stored as a hash, the sign-in steps, enrolment at first sign-in, own password change after a fresh code, access records for every attempt, throttling from a setting (access-and-approvals 3.1, 3.2, 6) | T05, T07 | `access` sign-in; tests | access-and-approvals 15 tests 2, 3 and 3c and numbering-and-audit 7 test 13 pass; no secret appears in logs |
| `S1-F01-T09` Sessions and protected actions | Idle and absolute limits per session kind from settings; lock and unlock; revoking one or all sessions; disabling a user; the fresh-code check for protected actions with no freshness setting; resetting another user's credential (access-and-approvals 3.3, GC3-4, GC3-6) | T08, T11 (Authorise for resets and disabling) | `access` sessions; tests | Tests 3a, 3b, 4 and 5 (sessions part) pass |
| `S1-F01-T10` Setup step | The setup command of section 5 step 1 and section 9, run under the `setup` service identity | T01, T07, T08, T11 (roles and assignments) | Command; operator note; tests | Test 19a and the four setup cases of section 10 pass; the audit record names the service identity |
| `S1-F01-T11` Roles, assignments and scope | The permission registry (each module declares its record types, actions and field classes); roles with versions and expanded permissions; the self-service rule; persona held; role assignments with all, selected or empty scope per dimension and own-record scope; effective grants rebuilt on change and by a scheduled job when dates pass; Authorise returning the assignment it used; the Restrict-fields hook for `S1-F03` (access-and-approvals 4, 5, 7) | T06, T08 | `access` roles and assignments; tests | Tests 5a, 6, 9 (all members and empty), 10 and 11 pass |
| `S1-F01-T12` Inbox and My work | Work items published, updated and closed from `access` events through the outbox; List my work with eligibility checked at read; ordering by due time then exposure with Unknown above known; no due time while routing has no rows (access-and-approvals 11) | T06, T11 | `inbox` module; tests | Test 20 passes; a replayed event makes no second item; an ineligible reader sees nothing |
| `S1-F01-T13` Approval rules, reasons and decisions | Approval rule settings for access-change actions; the reason list and its free-text exception; Request approval with preparers; Decide with the fresh code, the rechecks and the version taking effect in the same transaction; supersession on material change; rejection back to the preparers (access-and-approvals 8, 9.1, 9.3, 9.5, 9.6, 9.11) | T09, T11, T12 | `access` approvals; tests | Tests 12, 12a, 14 (access-change part), 19, 19b and 22 pass |
| `S1-F01-T14` Web shell | Router, data layer, forms with Zod, components themed from the reviewed design-language tokens, back-office shell, environment banner, message catalogue for every screen string, the lock overlay that keeps unsaved input without restricted fields, the standard empty, loading, error and unavailable states (design-language 6, 10.13, 10.17) | T05; DR-1b | `apps/web` shell | Builds and typechecks; every string comes from the catalogue; the unavailable state names what is missing |
| `S1-F01-T15` Sign-in screens | Sign-in, enrolment, password change and session lock | T08, T09, T14 | Screens | Manual check against design-language; covered by T19 |
| `S1-F01-T16` Access setup screens | Users, personas held, the role editor, the assignment editor with scope per dimension, approval reasons (access-and-approvals 14) | T11, T13, T14 | Screens | Covered by T19 |
| `S1-F01-T17` My work and the approval panel | The list and the panel of section 6, including the fresh-code prompt and the reason picker or free-text field (design-language 10.5, 10.14) | T12, T13, T14 | Screens | Covered by T19 |
| `S1-F01-T18` History screens | History of a record or an actor within scope; the access history report of stage 1 ([phases.md](../phases.md) stage 1 "Reports"); masked restricted values; as-of time | T07, T11, T14 | Screens | Covered by T19 |
| `S1-F01-T19` Browser journeys | Playwright added to the workspace and to CI in Chromium (PRD Stack: Verification); journeys of section 14 test `S1-F01-AT18`, including a keyboard-only path through sign-in and approval | T10, T15 to T18 | Playwright config; journeys; CI job | Journeys pass in CI and keep their traces as artefacts |
| `S1-F01-T20` Concurrency, isolation and leak suite | Integration tests on real PostgreSQL under the runtime role for the concurrency, isolation and leak cases of section 10 | T10, T13 | Tests | `S1-F01-AT02`, `S1-F01-AT09`, `S1-F01-AT14`, `S1-F01-AT15`, `S1-F01-AT17` pass in CI |
| `S1-F01-T21` Acceptance run and records | Run every acceptance test; gather the evidence of section 15; update `AGENTS.md` "Current state" and any design text the code proved wrong, through the doc gate | T19, T20 | Evidence bundle; reviewed doc edits | Section 15 complete; doc checker passes; product owner accepts |

Lanes after `T05`, each owning its modules ([index.md](index.md) section 7): the access lane runs `T08`, `T11`, `T09`, `T10`, `T13` in that order and is the critical path; the platform lane runs `T07` (from `T03`), then `T06` (after `T08`), then `T12` (after `T11`); the web lane runs `T14` from `T05` once DR-1b is done, then each screen as its API merges.

## 14. Tests

Unit tests in Vitest; integration tests on real PostgreSQL in Testcontainers under the runtime role; browser journeys in Playwright. All data is labelled synthetic. Each test cites the IDs it proves.

| Test | What it proves | Design test | IDs |
| --- | --- | --- | --- |
| `S1-F01-AT01` | Setup creates the first Admin and approver once; a finished setup run again is refused; an interrupted setup run again with the same request completes without creating users twice; a different request for the same code is refused; concurrent runs register once; the next access change needs a different approver | access-and-approvals 15 test 19a | `PRD-ACS-023`, `DEC-101` |
| `S1-F01-AT02` | Two Organisations: a user of one cannot sign in with the other's code, and no row crosses | test 2 | `PRD-ACS-020`, `PRD-ORG-002`, `PRD-MOD-001` |
| `S1-F01-AT03` | Sign-in needs the password and the authenticator code; every wrong part gets the same refusal; attempts are recorded; a failed attempt keeps no password, code or unmatched login; throttling follows its setting | tests 3, 3c; numbering-and-audit 7 test 13 | `PRD-SEC-001`, `PRD-SEC-007`, `PRD-SEC-014`, `POL-02.17` |
| `S1-F01-AT04` | A protected action asks for a fresh code, every time while no freshness setting exists; a reset of another user's credential revokes their sessions and is recorded; nobody resets their own | tests 3a, 3b | `PRD-SEC-001`, `PRD-SEC-008`, `DEC-105` |
| `S1-F01-AT05` | Idle lock and absolute limit with synthetic settings; unfinished work offered back; a revoked session or disabled user is refused at the next request | tests 4, 5 | `PRD-ACS-017`, `PRD-SEC-008`, `POL-02.18` |
| `S1-F01-AT06` | An assignment version starting in the past is refused; versions never overlap | test 5a | `PRD-ACS-005`, `PRD-MOD-010` |
| `S1-F01-AT07` | A persona alone grants nothing; an empty dimension grants nothing; all members covers a member added later (proved for places in `S1-F02`) | tests 6, 9 | `PRD-ACS-002`, `PRD-ACS-003`, `PRD-ACS-005` |
| `S1-F01-AT08` | A role mixing self-service with other permissions, or a self-service assignment with any other scope, is refused | test 10 | `PRD-ACS-022`, `DEC-100` |
| `S1-F01-AT09` | Row-level security: with no actor set no scoped row shows; with an actor only covered rows | test 11 | `PRD-SEC-005` |
| `S1-F01-AT10` | Self-approval is refused, also through another role; every preparer of a version is refused; a service identity cannot decide; an access change approved by its preparer is refused | tests 12, 12a, 19, 22 | `PRD-ACS-006`, `POL-02.07`, `POL-02.08`, `PRD-SEC-018` |
| `S1-F01-AT11` | A change to a submitted version supersedes its request; a decision on the old version is refused | test 14 (access-change part) | `PRD-ACS-007`, `POL-02.12` |
| `S1-F01-AT12` | The first reason list is decided with a free-text reason; every other decision needs a reason from the list in force; with no list in force deciding is unavailable and says why | test 19b | `POL-02.23`, `DEC-104`, `PRD-UXP-003` |
| `S1-F01-AT13` | My work orders by due time then exposure, Unknown above known; a replayed or redelivered event makes no second item; an ineligible reader does not see it | test 20 | `PRD-ACS-009`, `PRD-INT-008`, `PRD-MOD-015` |
| `S1-F01-AT14` | Same key and content: one effect and the first result; changed content refused and kept; concurrent decisions on one request: one wins | — | `PRD-INT-002`, `PRD-INT-003` |
| `S1-F01-AT15` | The decision, the version taking effect, audit and outbox commit together or not at all; an audit record commits with its change | numbering-and-audit 7 test 8 | `PRD-INT-004`, `PRD-MOD-006` |
| `S1-F01-AT16` | The runtime role cannot update or delete audit or access records; sealing detects an altered row; history shows only what the reader's scope covers; nothing is deleted while no retention period is set | numbering-and-audit 7 tests 9, 10, 12, 14 | `PRD-SEC-007`, `PRD-MOD-011`, `PRD-ACS-013`, `PRD-ACS-014` |
| `S1-F01-AT17` | No password, authenticator secret, code or session identifier appears in a log, an error, an audit record or a live-update event | test 23 (part); numbering-and-audit 7 test 11 | `PRD-SEC-006`, `PRD-SEC-014` |
| `S1-F01-AT18` | Browser journeys: the Admin prepares, the approver approves from My work, the third person signs in and reads history; a reload mid-journey decides nothing twice; refusals name what is missing; a keyboard-only path works | — | `PRD-SEC-016`, `PRD-UXP-001`, `PRD-UXP-003` |

### Requirement trace

| IDs | Tests |
| --- | --- |
| `PRD-ACS-001` to `PRD-ACS-004` | AT07, AT09, AT18 |
| `PRD-ACS-005` | AT06, AT07 |
| `PRD-ACS-006` | AT10 |
| `PRD-ACS-007` | AT11 |
| `PRD-ACS-009`, `PRD-ACS-010` | AT12, AT13, AT18 |
| `PRD-ACS-013`, `PRD-ACS-014` | AT15, AT16 |
| `PRD-ACS-017` | AT05 |
| `PRD-ACS-020` | AT02 |
| `PRD-ACS-022` | AT08 |
| `PRD-ACS-023` | AT01 |
| `PRD-SEC-001` | AT03, AT04 |
| `PRD-SEC-005` | AT09 |
| `PRD-SEC-006`, `PRD-SEC-014` | AT17 |
| `PRD-SEC-007` | AT03, AT16 |
| `PRD-SEC-008` | AT04, AT05 |
| `PRD-SEC-016` | AT18 |
| `PRD-SEC-018` | AT01, AT10 |
| `PRD-INT-001` | AT07, AT09 |
| `PRD-INT-002` | AT14 |
| `PRD-INT-004`, `PRD-MOD-006` | AT15 |
| `PRD-INT-008` | AT13 |
| `PRD-MOD-001`, `PRD-ORG-002` | AT02 |
| `PRD-MOD-010` | AT06 |
| `PRD-MOD-011` | AT16 |
| `PRD-UXP-001`, `PRD-UXP-003` | AT12, AT18 |
| `PRD-EXC-011`, `PRD-MOD-003`, `PRD-PRF-004` | AT16 (history within scope), AT18 (as-of shown) |
| `PRD-MOD-008`, `PRD-MOD-009` | Covered by every database test: UUIDv7 keys, event and recording times, business date |

## 15. Acceptance and demo evidence

- CI run links showing Code check green with lint, typecheck, module check, unit tests, integration tests and the Playwright job, and Doc check green.
- The Playwright trace or recording of `S1-F01-AT18` on synthetic data.
- An export or screenshot of the history of the approved assignment: preparer, approver, reason, versions, times.
- A log sample from the journey showing correlation identifiers and no secret.
- The list of synthetic settings used, each labelled synthetic.
- The doc checker passing, with the design edits of `T01` and `T21` reviewed.
- If shown on `dev`: the Railway environment state checked (RR-187) and the migration pre-deploy command wired by the product owner.

## 16. Deferred from this feature

| Requirement or part | Goes to |
| --- | --- |
| Selected places, legal entities and brands in scope; the place tree (`PRD-ACS-021`) | `S1-F02`, `S1-F03` |
| Restricted field classes in use (`PRD-ACS-008`) | `S1-F03` |
| Approval limits, Unknown value, stand-ins, bulk approval, escalation (`PRD-ACS-011`, `PRD-ACS-015`, `PRD-ACS-016`, `PRD-ACS-018`, `PRD-ACS-019`) | `S1-F05` |
| The policy gate and activity grants (`PRD-SEC-017`) | `S1-F04` |
| Live-update stream (SSE) and the operations view of failed jobs (`PRD-SEC-013`) | `S1-F08`; My work refreshes by refetch until then |
| Approval use by a posting (`DEC-097`) | `S1-F10` |
| Devices and shared POS sessions | `S1-F12` |
| Phone approval links (`PRD-ACS-012`) | `S5-F11` |
| Partner users (`PRD-FRN-007`); the table rule is fixed now | `S5-F08` |
| Self-service records | `S6-F01` |
| Hindi screens | `S5-F10`; strings are in the catalogue from the start |
