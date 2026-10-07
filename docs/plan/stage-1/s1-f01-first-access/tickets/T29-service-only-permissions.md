# S1-F01-T29 — Service-only permissions never given to people

Status: done
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
- Built: `serviceOnly` on the record type declaration in `packages/schemas/src/permissions.ts` (set by `declareServiceOnly` on the five types, with `isServiceOnly`); `permissionGrid()` in `apps/web/src/setup/permission-grid.ts` leaves them out; `AccessChanges` (`access-changes.ts`) refuses a role or role version holding one with `access.service-only-permission` (kind refused, `missing` names each permission; message in `en-IN.ts`; added to the two prepare routes' codes and `openapi.json`). The setup step writes service identities' roles through its own path, so their authorities are untouched; the integration test in `roles-and-assignments.int.test.ts` shows a service identity holding `audit.audit_seal` still authorised through the job identities. Design: access-and-approvals 2.3.
- Review fixes, 7 Oct 2026: `AccessChanges.prepareAssignment` now refuses a person's assignment of a role that holds, in any version, a permission on a service-only record type (the setup step's `service-identity:<code>` roles among them), with `access.service-only-permission` (added to the assignment route's codes and `openapi.json`); a service identity's own assignment is unchanged. Integration test in `roles-and-assignments.int.test.ts`; design 2.3 says so.
