# S1-F01-T26 — First roles change the security settings; assignment validity checked at once

Status: done
Blocked by: T25 (done), T24 (done)
Feature: [S1-F01 First access](../spec.md)

## Build

- **The first roles and the security settings** (`DEC-120`, RR-402; access-and-approvals 9.11; `PRD-ACS-006`, `POL-02.07`). The setup step gives the first Admin's role view and edit (prepare) on `access.setting`, and the first approver's role view and approve on it; nothing lets one person both prepare and approve. Update the exact-matrix test (`S1-F01-AT01`, test 19d) and the T25 browser journey, which then needs no extra role.
- **Validity decided when authorising, never by the sweep** (`DEC-120`, RR-390; access-and-approvals 7.1, 7.2; `PRD-ACS-005`). An assignment, and the role version it grants through, authorise only while their dates hold today under the Organisation's timezone, with the user in force, checked by Authorise on the route and job-step paths and again under the step-0 locks. Row-level security follows the same rule. The grants rebuild becomes a refresh of the cache and a notice: it still writes its audit record and `access.assignment-changed` event when a date passes.
- **Synthetic rebuild interval.** The grants rebuild every 60 seconds in the synthetic worker settings only (test fixtures and the SYNTHETIC local file), labelled with `DEC-120`.

## Done when

- Test 19d gives each first user exactly the 9.11 matrix, settings included; the first Admin never approves and the first approver never prepares.
- An assignment whose end passed authorises nothing in the very next request, and its rows stop showing, without the rebuild running; a Scheduled assignment authorises nothing before its start and authorises, and shows its rows, at its start, without the rebuild; a role version's start does the same for row-level security; a job step holds no authority from an ended assignment.
- The security settings journey passes with the two users holding only the first two roles.
- The full check set and the browser journeys pass.

## Notes

- Built on branch `s1/f01-answers-3` (commit subject `S1-F01-T26: first roles change the security settings; assignment validity checked at once`).
- What Authorise did before: on the route guard, in `holdAuthority` under the step-0 locks and in `JobIdentities.hold`, it already read the assignments and role versions themselves by today's business date (`assignmentsInForce`), with the user Active checked by Authenticate and under the locks; it never read `effective_grant`. The gap was row-level security: `access.row_visible` admitted every `effective_grant` row with no date check, and the rows held only what was in force at the last rebuild, so an ended assignment kept showing rows and a Scheduled one showed none until the hourly sweep. The shell's grant list (`ownAccess`) read the same rows.
- After: migration `0022__access__grants_checked_at_read.sql` keeps one grant row per assignment and Approved role version still holding today or later, with `role_version_id` and `valid_during` (the intersection of both ranges), and `access.row_visible` admits a row only while `valid_during` holds `aos.business_date`, which the command runner now sets beside the actor at the start of each transaction (cleared with it before the connection is pooled again). `ownAccess` filters the same way. `rebuildGrantsAsDatesPass` compares what was in force on the rows' `as_of` with what is in force now, so its audit and event are unchanged.
- Migration 0022 is not compatible with the version running: a planned brief interruption on `dev` (`DEC-120`; code-house-rules 4.2).
- Test helper `assignSyntheticRole` (`apps/server/test/support/grants.ts`) assigns an existing role, such as one the setup step made; the journey's settings users hold `first-admin` and `first-approver`.
- Existing Organisations: the seed re-creates its two synthetic Organisations through the setup step, so they get the new permissions. An Organisation already set up on `dev` (synthetic data only) keeps its old first roles until it is set up again, or until its roles get a new version through the ordinary approved role change.
- Tests: `apps/server/test/setup-step.int.test.ts` (19d), `apps/server/test/roles-and-assignments.int.test.ts` (validity describe), `apps/server/test/command-runner.int.test.ts` (the business date setting), `apps/web/e2e/security-settings.spec.ts`.
- RR-402, RR-370, RR-400 and RR-390 closed by `DEC-120`.
