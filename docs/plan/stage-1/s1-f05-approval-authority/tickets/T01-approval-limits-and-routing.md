# S1-F05-T01 — Approval limits and routing

Status: blocked
Blocked by: S1-F01-T13, S1-F02-T03
Feature: [S1-F05 Approval authority](../../spec.md)

## Build

Approval limits in `access`, and the routing of requests by them ([access-and-approvals.md](../../../../design/access/access-and-approvals.md) 8, 9.2 to 9.5, 13.1, 14; [domain-model.md](../../../../design/architecture/domain-model.md) section 5; [module-map.md](../../../../design/architecture/module-map.md) 4.3).

- **Limits** (9.2; `POL-02.09`, `POL-02.15`): `approval_limit`, dated, for one action type, held either by an approver role within a scope or by a named user and the assignment it applies to. Its basis comes from the action's approval rule (`PRD-ACS-015`; DM-8, `DEC-105`): an amount in paise on that basis, a quantity with its unit, or a discount percentage where configured. Explicit unlimited authority and explicit authority over Unknown value are kept apart from the value (`PRD-ACS-016`). An individual limit replaces the role's limit for that user and action. Approved, not withdrawn rows for one action and holder never overlap (13.1; house rules 7.3). A change is prepared, approved by a different authorised person, effective-dated and kept with its history (9.11; `POL-02.07`).
- **Who may decide** (9.3): through one assignment, approve on the record type, the request's scope, and a limit covering the value on its basis, or explicit authority over Unknown value when the value is Unknown. A missing limit grants nothing. An action with no value, or no value limit, needs only approve. The decision records the limit version it relied on (9.5). Stand-in grants join this check in S1-F05-T02.
- **Routing** (9.4; `DEC-043`): a request is offered to the eligible approvers with the lowest limit that covers its value; explicit unlimited authority comes after every finite limit; with nobody eligible it stays Awaiting approval and is never approved by itself. There is no "Send to ‹next approver›" action: a request waits for an approver whose limit covers it and escalates as S1-F05-T02 says (product owner, 6 Oct 2026, DEC-116). Eligibility is worked out when My work is read and again at Decide, so a change to limits applies as soon as it is in force.
- **Screens**: Setup › Approval limits (ui-blueprint), each limit with its basis beside it (`PRD-ACS-015`); the approval panel's value, basis and limit bar, with its states: within limit, above limit, no approver set up, preparer, Unknown value, no upper limit ([design-language.md](../../../../design/ui/design-language.md) 10.14), and no send-on action.
- Test-only action types in a `test_` schema (house rules 11.4) carry the `DEC-105` bases of test 13a, since bookings, day close and offers arrive in later stages.

## Expected outputs

Approval limits and routing in `access`, with their migration and `tables.json` entries; schemas and routes; the Approval limits screen and the panel's limit states; tests

## Done when

- access-and-approvals 15 tests 13 and 13a pass, with labelled synthetic limits
- Of two eligible approvers whose limits cover a value, only the one with the lower limit is offered the request; explicit unlimited authority is offered it only when no finite limit covers it; an Unknown value reaches only an approver with explicit authority over Unknown
- A limit change approved by its preparer, a limit starting on a past date, and two overlapping approved limits for one action and holder are refused
- Browser journey: an Admin prepares a synthetic limit and a different authorised person approves it; an approver opens a synthetic valued request and sees its value, basis and limit; a request above every limit shows "No approver set up" with Approve disabled and no send-on action

## Notes

- design-language 10.14's "Send to ‹next approver›" action is removed: a request waits for an approver whose limit covers it and escalates as S1-F05-T02 says (access-and-approvals 9.4; product owner, 6 Oct 2026, DEC-116).
- Real limits and their holders are OPEN (V-02, RR-065; KDPS Owner; live S1); an empty table grants nothing. RR-177 confirms the DM-8 bases. The Withdrawn state name is approved (RR-202; product owner, 6 Oct 2026, DEC-116).
- Built (9 Oct 2026, branch `s1/f05-t01`): migration `0040__access__approval_limits.sql` (`approval_limit`, dated, with its exclusion constraint over the action type and `holder_key`; `approval_limit_change`; `approval_decision.approval_limit_id`) and its `tables.json` entries; the record type `access.approval_limit` (view, create, approve) and the access action type `access.approval_limit.change`; preparing a limit (`prepareApprovalLimit`, route `POST /api/access/approval-limits`) and listing them (`listApprovalLimits`, `GET /api/access/approval-limits`), with the basis from the rule and the origin of each limit; deciding a limit change like any access change, a later limit ending the one it follows on its start; who may decide a valued request through one assignment and the lowest covering limit, with the refusals `access.no-approval-limit`, `access.above-approval-limit` and `access.unknown-value-not-covered`; routing in My work; the decision keeping the limit relied on, locked shared at step 0; Verify under lock and Record use checking the value under the lock against that limit (RR-435 closed); the panel's value, basis, limit bar and states; Setup › Approval limits, in the Owner's and Admin's menus. Tests: `domain/approval-limits.test.ts`, `test/approval-limits.int.test.ts` (access-and-approvals 15 tests 13, 13a and 15, with test-only booking, day-close and offer action types in a `test_approvals` schema the test makes, code-house-rules 11.4), web unit tests of the limit states, and the journey `apps/web/e2e/approval-limits.spec.ts`. Design written into access-and-approvals 9.2 to 9.5, 9.8a, 13.1 and 14, and design-language 10.14.
- Beyond the ticket: the limit change's facts on its approval panel (`DocumentFacts`); a test-support option of `startAccessApp` for synthetic approval rules (`extraApprovalRules`), used by the journeys' server; the decide route now lists the limit codes it can answer.
- Follow-ups: RR-459 (who sees a valued request no limit covers; product owner), RR-460 (an approval work item of a valued request carries no exposure yet), RR-461 (quantity and discount-percentage bases, withdrawing or ending a limit early).
