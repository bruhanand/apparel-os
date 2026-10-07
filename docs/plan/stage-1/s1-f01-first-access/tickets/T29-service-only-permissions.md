# S1-F01-T29 — Service-only permissions never given to people

Status: ready-for-agent
Blocked by: —
Feature: [S1-F01 First access](../spec.md)

## Build

- Mark the record types only the worker's service identities hold as service-only in the permission catalogue (`packages/schemas/src/permissions.ts`): `access.effective_grant`, `audit.audit_seal`, `audit.audit_partition`, `kernel.outbox_event`, `inbox.work_item` (access-and-approvals 2.6, service identities)
- The role editor's permission grid leaves them out
- The server refuses a role that holds one, with its own error code and message, under the same validation as every role change
- Add the rule to access-and-approvals next to the service identities

## Done when

- A unit test shows the grid without the service-only types
- An integration test shows a role holding one refused, and the worker's service identities still working
- Every check, both test suites and the browser journeys pass

## Notes

- Found in the hands-on test, [test-report.md](../test-report.md) F3.
- Product owner, 7 Oct 2026: people may never hold the background system's permissions; hide and refuse.
