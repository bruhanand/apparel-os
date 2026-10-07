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
- Built 7 Oct 2026 on `s1/f01-t16`, commit f64b2a8. Server (RR-326): four list reads in `access` (`listUsers`, `listRoles`, `listRoleAssignments`, `listApprovalReasonRecords`, schemas in `packages/schemas/src/access-records.ts`), each version with the state the screen shows (`domain/record-state.ts`). Web: Setup › Users, Roles (role editor with the permission grid), Role assignments (assignment editor with scope per dimension and the empty-dimension warning; withdrawal of a Scheduled assignment), Reason codes; each record in a right drawer with Details and History (RR-312); Home › My work with the counter in the top bar; the approval panel with the reason picker or free text and the fresh code. Forms keep their input across a lock and offer it back after a session ends (`useKeptDraft`). No migration. Design: access-and-approvals 14 "As built", design-language 10.14 rule for no-value actions.
- Tests: `apps/server/src/modules/access/domain/record-state.test.ts`, `apps/server/test/access-records.int.test.ts`; `apps/web/src/setup/setup.test.tsx`, `apps/web/src/approvals/approvals.test.tsx`, `apps/web/src/inbox/my-work.test.tsx`. The browser journeys are T20's.
- Visual review fixes, 7 Oct 2026, branch `s1/f01-visual-fixes`: the shell fits the window and overlays start under the sticky environment banner, the lock covering any drawer and showing no lock error inside it; persona IDs never wrap; My work rows say what each approval is for and who prepared it, and the drawer header follows the decision; status badges hug their text; the unavailable decision says why once; a missing permission shows “Not available to you” with no policy link; permission grid names `access.session`, `access.user_credential` and `inbox.work_item`; service identities' roles and assignments are left out of the setup lists (server, RR-343); setup key groups never break; empty states use design-system 3.7's mark. Design written as built (design-language 5, 6 A, 10.2, 10.5, 10.13 to 10.15, 10.17, 10.18, 10.20; access-and-approvals 14); approval asked in RR-430, follow-up RR-431.
- Not built here, each with its owner in open-items: ending an assignment early and separate drafts (RR-292), templates' permission sets (RR-340), approval rule settings screen (RR-341), self-service permissions (RR-342), assignments of service identities (RR-343), names on the panel without view on users (RR-344), session controls (RR-302), the rejection task (RR-323), fonts (RR-262, product owner).
