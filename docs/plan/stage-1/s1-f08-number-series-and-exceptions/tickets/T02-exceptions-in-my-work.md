# S1-F08-T02 — Exceptions in My work

Status: blocked
Blocked by: S1-F08-T01, S1-F01-T06, S1-F01-T13
Feature: [S1-F08 Number series and exceptions](../../spec.md)

## Build

The `exceptions` module with its first migration ([access-and-approvals.md](../../../../design/access/access-and-approvals.md) 11, 12, 13.3, 14; [module-map.md](../../../../design/architecture/module-map.md) 4.1, 4.8, 4.13; [code-house-rules.md](../../../../design/platform/code-house-rules.md) 12.9). The live-update stream and the failed-jobs view are S1-F08-T04 (product owner, 6 Oct 2026, DEC-116).

- **Tables** (13.3): `exception_type`, `exception`, `exception_link`, `exception_event` (append-only) and `exception_routing` with versions.
- **Types** (12.1): each raising module registers its types, the record types they link to, and the resolution check it implements through the resolution-check contract `exceptions` defines (module-map section 3, rule 6). The types are those of `PRD-EXC-001`, and source conflict (`POL-03.04`).
- **Raise** (12.1; `PRD-EXC-001`): a code from a `numbering` series (S1-F08-T01); the type; links to the affected records and their versions; exposure in paise or Unknown (`PRD-MOD-015`); the Site, and the Store, business unit and brand where they apply. Keyed by the raising event, so a replay makes no second exception (`PRD-INT-008`). Raised in the transaction that found the problem, or after a rollback in a transaction of its own, so it survives (module-map 4.13; `PRD-EXC-002`). A new exception of the same type on the same record links to the earlier one (`PRD-EXC-004`). A person may raise one too.
- **No open exception-code series** (product owner, 6 Oct 2026, DEC-116): `exceptions` answers whether an Open series exists for its exception-code kind. With none, the operation that would raise a numbered exception stays unavailable and the Available check names the missing series, so no exception is lost. S1-F04-T01 registers this answer with the Available check, beside the routing answer.
- **Routing** (12.2; `POL-02.16`, `DEC-037`): per type and Site, the owner (a named user, or a role within the Site's scope, in the My work of each holder until one takes it), the due-time rule and the escalation, as effective-dated settings kept with their history, with no default. `exceptions` answers whether a type has routing in force at a Site, so an operation whose exceptions have no routing stays unavailable (`POL-02.16`); S1-F04-T01 registers that answer with the Available check.
- **Lifecycle** (12.3; `POL-03.05`): Unresolved when raised, published to the owner's My work through `inbox` in the same transaction (11.1); reassign and comment as events; Resolved once the owning module records the correction; Closed only after the owning module's resolution check passes; Reopened when the problem comes back. Closing changes no stock, money or saleability (`PRD-EXC-003`). Events `exceptions.raised`, `exceptions.assigned`, `exceptions.resolved`, `exceptions.reopened`.
- **Escalation** (11.3): a job escalates an open exception past its due time under its routing: the recipient is added, the owner kept, the escalation recorded on the exception and on its work item (`work_item_escalation`, 13.2), and the item shows Overdue (`PRD-ACS-010`).
- **Unfinished operations** (house rules 12.9; access-and-approvals 9.8 step 4): a job that still fails after its retries raises one unfinished-operation exception. The failed-job record and the operations view are S1-F08-T04.
- **Read model** (12.3): open exceptions by Store, brand and type, with exposure and repeats; Unknown exposure counted apart, never as zero (`PRD-EXC-004`).
- **Screens** (access-and-approvals 14; ui-blueprint): exception items in My work and the exception record (raise, reassign, comment, resolve, reopen); Setup › Exception rules (owner, due time, escalation), to which S1-F05-T02 adds a tab for approvals and tasks. Unavailable actions name what is missing (`PRD-UXP-003`).
- A test-only module in a `test_` schema (house rules 11.4) registers a synthetic type with its resolution check.

## Expected outputs

`exceptions` module with its `index.ts`; first `exceptions` migration with its `tables.json` entries; the series and routing answers; screens; tests

## Done when

- access-and-approvals 15 test 21 passes: an exception raised after a rollback survives; a replay makes no second exception; closing waits for the resolution check
- With labelled synthetic routing, an exception gets its owner and due time for its type and Site and shows in the owner's My work; with no routing in force the answer names the type and Site; past its due time it escalates and keeps its owner; closing changes no stock or money
- With no Open exception-code series, the answer names the missing series and an operation that would raise an exception is unavailable
- A test job that exhausts its synthetic retry setting raises exactly one unfinished-operation exception
- A second synthetic Organisation sees none of these exceptions
- Browser journey: an Operations user opens a synthetic exception from My work, comments, and is refused closing until the resolution check passes, with the reason on screen. Its arrival without reloading is S1-F08-T04's journey

## Notes

- How a failed job reaches `exceptions` is not designed: `kernel` reaches a higher module only by an event or a contract (module-map section 3, rule 4). Write the path into house rules 12.9 with the code, including where the exception's Site comes from.
- The exception-code kind (yearly or not, its scope key, its display scope) is not declared in access-and-approvals 12.1; write it there with the code. No format has a default (numbering-and-audit 3.5); tests use a labelled synthetic format and series. A missing series makes the raising operation unavailable, as Build says (product owner, 6 Oct 2026, DEC-116).
- Real owners, due times and escalation are OPEN (V-03, RR-066; KDPS Owner, Admin; live S1). Alert thresholds and recipients (V-70, RR-129; live S4) are not built here; before stage 5 alerts reach people only in My work (`DEC-099`, `PRD-EXC-013`).
- Evidence files attach in S1-F08-T03.
- Built (9 Oct 2026): the `exceptions` module (`apps/server/src/modules/exceptions`), migrations 0034 (`exceptions`), 0035 (`inbox`: role actors and `work_item_escalation`) and 0036 (the escalation queue), with their register entries; `numbering` wired into the app with the exception-code kind under `NUMBERED_KINDS`; an `inbox` interface (`INBOX`) the owners call in their own transaction; `access` answers `rolesHeld` and `partyNames`; the worker publishes `kernel.job-failed` for a job that fails for good, which `exceptions.raise-unfinished-operation` consumes. Routes for routing, raise, the record and its lifecycle, and the read model, in the route table and OpenAPI. Screens: exception items in My work open the exception record (comment, take, close, reopen; reassign by route only), and Setup › Exception rules. Tests: `apps/server/test/exceptions.int.test.ts` (test 21, routing and its approval, owner, due time, My work, escalation, role routing, the failed job, the second Organisation), `domain/summary.test.ts`, and the journey `apps/web/e2e/exceptions.spec.ts`. The details settled are written in access-and-approvals 12.1 (the exception-code kind) and 12.4 "As built", and code-house-rules 12.9 (how a failed job reaches `exceptions`, and where its Site comes from).
- Beyond the ticket: a routing change is approved by a different authorised person through the decision-effect contract (RR-447 asks the product owner to confirm); the exception record's Take action for a role holder; the read model as a route, with no dashboard screen.
- Open: RR-447 (routing approval), RR-448 (a job failing by its active limit raises nothing), RR-449 (no screen defines formats or series), RR-450 (the escalation interval), RR-451 (the routing's Site is not checked). Evidence files are S1-F08-T03; the live stream and the failed-jobs view S1-F08-T04.
- Review fixes (9 Oct 2026, S1-F08 review): routing changes keep their approval by a second person, and exception codes come from one Organisation-wide series that never restarts, both approved by the product owner (P1, P3; RR-447 closed). Preparing a routing checks its Site exists through the scope contract, `exceptions.site-not-found` (S2; RR-451 closed). A paused or used-up exception-code series is named as such, `exceptions.exception-code-series-paused` and `-exhausted` (S3). The exception record offers reassign, Raise it again, and Resolve shown disabled naming the owning module (S1; access-and-approvals 14), with the journey extended. Escalation selects only exceptions not yet escalated (J5); the failed-job consumer uses the worker's logger (J2); one scope-fact builder, `scopeFactsOf`, in `kernel` (J1). Integration tests write their routed Sites (`writeSyntheticSites`).
