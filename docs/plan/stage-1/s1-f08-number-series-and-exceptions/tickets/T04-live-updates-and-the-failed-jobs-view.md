# S1-F08-T04 — Live updates and the failed-jobs view

Status: blocked
Blocked by: S1-F08-T02, S1-F01-T06, S1-F01-T13
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
