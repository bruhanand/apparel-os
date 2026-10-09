# S1-F08-T04 — Live updates and the failed-jobs view

Status: done
Blocked by: S1-F08-T02 (done), S1-F01-T06 (done), S1-F01-T13 (done)
Feature: [S1-F08 Number series and exceptions](../../spec.md)

## Build

The live-update stream, and the operations view with its list of failed jobs, split out of S1-F08-T02 (product owner, 6 Oct 2026, DEC-116) ([code-house-rules.md](../../../../design/platform/code-house-rules.md) 12.9, 12.12; [deployment.md](../../../../design/platform/deployment.md) section 5; [access-and-approvals.md](../../../../design/access/access-and-approvals.md) 9.8 step 4, 11.1; [module-map.md](../../../../design/architecture/module-map.md) 4.1).

- **Live updates** (house rules 12.12; deployment.md 5; PRD Stack row Live updates): `GET /api/live`, one stream per session, carrying the outbox event's identity, type and subject only; sent only where the actor's effective grants cover the event's scope facts, and a work item only to those who may act on it; reconnection with `Last-Event-ID`, or a resync; closed on revocation. The browser refetches through the owning routes. My work and the exception record refresh live.
- **Failed jobs kept** (house rules 12.9; access-and-approvals 9.8 step 4; `PRD-SEC-013`, `PRD-SEC-014`): a job that still fails after its retries keeps its failed-job record and diagnostic evidence, with no secret or restricted value. They are kept even when no exception can be numbered, for example while no exception-code series is open, so nothing is lost (product owner, 6 Oct 2026, DEC-116). The job queue's own clean-up never removes them, checked against the pinned pg-boss version, and nothing is deleted while no retention period is set (`POL-18.05`).
- **The operations view** (house rules 12.9; product owner, 6 Oct 2026, DEC-116): for authorised operators, failed jobs as a simple list, built from existing design-language components; each links to the unfinished-operation exception raised for it, where one was. The builder adds the view to the UI blueprint with the code. S1-F14 adds backup and recovery status to it.

## Expected outputs

The live-update route and its schema in `packages/schemas`; the failed-job read and the operations view; the UI blueprint edit; tests

## Done when

- A live-update event reaches only sessions whose actor may view its record, carries no name, amount, restricted value or secret, and a reconnect with an unknown `Last-Event-ID` gets a resync; a revoked session's stream closes
- A test job that exhausts its synthetic retry setting shows in the operations view's list for an authorised operator, with its diagnostic evidence and no secret or restricted value; a user without the permission is refused
- With no Open exception-code series, a failed job's record and evidence are still kept and listed
- A second synthetic Organisation sees none of these events or failed jobs
- Browser journey: an Operations user sees a synthetic exception arrive in My work without reloading and opens it; an authorised operator opens the operations view and sees a failed synthetic job

## Notes

- The permission that opens the operations view is declared in the permission registry (access-and-approvals 4.1) with the code; who holds it is KDPS's (V-01, RR-064), and tests use labelled synthetic roles.
- Built (9 Oct 2026): the live-update stream `GET /api/kernel/live` (`openLiveUpdates`, an `own` route marked `passive` and `stream: 'event-stream'`) and the operations view's `GET /api/kernel/failed-jobs` (`listFailedJobs`, view on `kernel.job`), with `liveMessageSchema` and `failedJobListSchema` in `packages/schemas` and OpenAPI. `kernel` holds both (`src/kernel/live`, `src/kernel/jobs/failed-jobs*.ts`, `LiveUpdatesModule`) and asks `access` through `SESSION_ACCESS` (the session, whether it is still open, its revocation, the default audience by `access.row_visible`) and `exceptions` through `FAILED_JOB_EXCEPTIONS`; `inbox` and `exceptions` register their audiences. `inbox` writes `inbox.work-item-changed` with every change of a work item. No migration. Screens: the web app follows the stream while the session is active and reads My work, the exception record and the failed jobs again; Setup › Operations view lists the failed jobs; the blueprint shows the view in Setup and in the Admin menu. Tests: `apps/server/test/live-updates.int.test.ts`, `failed-jobs.int.test.ts` (with RR-448 and the pg-boss clean-up check), `apps/web/src/live/invalidation.test.ts`, and the journeys `apps/web/e2e/live-updates.spec.ts` and `operations-view.spec.ts`. The details settled are written in code-house-rules 12.9 and 12.12 "As built" and access-and-approvals 11.3 and 14 "As built".
- Beyond the ticket: the `passive` mark, so an open stream never keeps a session from locking (an `own` route option and an argument of Authenticate); the failed jobs reach the operators' streams live; a small refactor so My work and the stream share one "who may act" test (`actableBy`), and the exceptions record route and the stream share one "who owns it" test (`isOwner`). The security settings journey now finds its approval by its record, since live updates add other journeys' approvals to the approver's My work at any moment.
- Open: RR-455 (the stream's own connection per Organisation, for the connection budget). RR-448 is covered by the view and closed. A closed approval item reaches its named and role actors live; whoever was only eligible to decide it sees the change at their next read (access-and-approvals 11.3 "As built").
- Review fixes (9 Oct 2026, S1-F08 review): the failed jobs are read a page at a time by cursor, with Load more (H1); the stream listens again after losing its connection (H3), checks the session before each batch (H4), answers only once it knows where it starts, takes the events committed within the look back as seen so one committing late is still sent (H6), and the browser reads everything again at every open (H5); code-house-rules 12.12 records the look back's dependence on CH-3 (S4; RR-456) and deployment.md section 4 counts the LISTEN connection (S5). The journeys' server starts its worker before any fixture writes an event (S6).
- Closed 9 Oct 2026 on `s1/f08-number-series-and-exceptions`, reviewed with `/code-review` with the feature's other tickets; review fixes `894cd99` to `3100c8f`; no blocking finding left.
- Beyond the ticket (logged at the product owner's request): opening the live stream does not count as session activity (`passive`); failed jobs reach operators live; shared `actableBy` and `isOwner` tests; the security-settings journey finds its approval by record; the shared `scopeFactsOf` in `kernel`; consumers get the worker's logger; the shared person and role picker.
