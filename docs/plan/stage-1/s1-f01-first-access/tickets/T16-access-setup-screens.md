# S1-F01-T16 — Access setup screens and the approval panel

Status: done
Blocked by: T13, T15
Feature: [S1-F01 First access](../spec.md)

## Build

- Access setup: users, personas held, the role editor, the assignment editor with scope per dimension, approval reasons (access-and-approvals 14)
- My work and the approval panel (from T17): the list and the panel of section 6, including the fresh-code prompt and the reason picker or free-text field (design-language 10.5, 10.14)

## Expected outputs

Screens

## Done when

Covered by the journeys of T20

## Notes

- T17 (My work and the approval panel) merged into this ticket on 6 Oct 2026 (product owner).
- Built 7 Oct 2026 on `s1/f01-t16`. Server (RR-326): four list reads in `access` (`listUsers`, `listRoles`, `listRoleAssignments`, `listApprovalReasonRecords`, schemas in `packages/schemas/src/access-records.ts`), each version with the state the screen shows (`domain/record-state.ts`). Web: Setup › Users, Roles (role editor with the permission grid), Role assignments (assignment editor with scope per dimension and the empty-dimension warning; withdrawal of a Scheduled assignment), Reason codes; each record in a right drawer with Details and History (RR-312); Home › My work with the counter in the top bar; the approval panel with the reason picker or free text and the fresh code. Forms keep their input across a lock and offer it back after a session ends (`useKeptDraft`). No migration. Design: access-and-approvals 14 "As built", design-language 10.14 rule for no-value actions.
- Tests: `apps/server/src/modules/access/domain/record-state.test.ts`, `apps/server/test/access-records.int.test.ts`; `apps/web/src/setup/setup.test.tsx`, `apps/web/src/approvals/approvals.test.tsx`, `apps/web/src/inbox/my-work.test.tsx`. The browser journeys are T20's.
- Not built here, each with its owner in open-items: ending an assignment early and separate drafts (RR-292), templates' permission sets (RR-340), approval rule settings screen (RR-341), self-service permissions (RR-342), assignments of service identities (RR-343), names on the panel without view on users (RR-344), session controls (RR-302), the rejection task (RR-323), fonts (RR-262, product owner).
