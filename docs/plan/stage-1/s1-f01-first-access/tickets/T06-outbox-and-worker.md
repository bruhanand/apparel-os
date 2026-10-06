# S1-F01-T06 — Outbox and worker

Status: done
Blocked by: T04, T08 (its internal service identity)
Feature: [S1-F01 First access](../spec.md)

## Build

The outbox table written in the business transaction; the worker as a second start command of the same build, using pg-boss under an internal service identity; consumer registration and receipts; the retry rule of the house rules ([deployment.md](../../../../design/platform/deployment.md) section 2)

## Expected outputs

Kernel outbox and worker; tests

## Done when

A rolled-back command leaves no outbox row; a redelivered event has one effect

## Notes

- Built on branch `s1/f01-t06`, test-first (commit named in the branch's `S1-F01-T06: outbox and worker` commit): migrations `organisation/0007__kernel__outbox.sql` (`kernel.outbox_event`, `outbox_consumer`, `outbox_dispatch`), `0008__kernel__job_schema.sql` (pg-boss 12.35.1's schema, compared with the package by `pgboss-schema.test.ts`, listed as a third-party entry in the register) and `0009__kernel__job_queues.sql`; `kernel/outbox` (`defineEvent`, `context.publish`), `kernel/jobs` (registry, worker settings, retry rule, pg-boss per Organisation, `Worker`, `workerModuleWith`), the worker's start command `src/worker.ts` (`start:worker`), `access`'s `AccessJobIdentitiesModule`, and the audit job kinds (RR-241, done).
- Tests: `outbox.int.test.ts` (a rolled-back command leaves no row), `worker.int.test.ts` (one dispatch however many workers; a redelivery replays with no second effect; a transient failure is retried; a defect fails at once; a refusal is kept), `job-queue.int.test.ts` (pg-boss as the runtime role; the singleton key holds a second job; nothing deleted, CH-9), `worker-app.int.test.ts` (the start command, the audit job kinds in both Organisations).
- Migration numbers: the run reserved 0010 to 0012, but the runner refuses a gap after 0006, so the files are 0007 to 0009; whoever holds 0007 to 0009 renumbers at merge (house rules 4.1).
- Follow-ups: RR-270 (synthetic worker settings, for the product owner), RR-271 (setup writes `outbox` and `audit-jobs`), RR-272 (LISTEN wake-up), RR-273 (Authorise for job steps, T11), RR-274 (bound the dispatch read), RR-276 (Railway `worker` service and `AGENTS.md`).
