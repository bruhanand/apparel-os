# S1-F05-T02 — Stand-ins, bulk approval and escalation

Status: blocked
Blocked by: S1-F05-T01, S1-F08-T02
Feature: [S1-F05 Approval authority](../../spec.md)

## Build

Stand-in grants and bulk approval in `access`, and due times and escalation for approvals and tasks in `inbox` ([access-and-approvals.md](../../../../design/access/access-and-approvals.md) 9.4, 9.9, 10, 11, 13; [module-map.md](../../../../design/architecture/module-map.md) 4.3, 4.8).

- **Stand-in grants** (10; `PRD-ACS-018`, `POL-02.20`): `stand_in_grant` names the stand-in, the person stood in for, the actions, scope and limits it gives, and its start and end. It is never wider than the authority of the person stood in for on those dates. A holder of the stand-in permission records it, and it takes effect only when a different authorised person approves it (GC3-7, `DEC-105`). It ends by itself at its end time, with effective grants rebuilt when the date passes (7.2). The stand-in sees the covered items in My work, never approves work they prepared (9.3), and a decision records the grant it relied on. Emits `access.stand-in-changed`.
- **Bulk approval** (9.9; `PRD-ACS-011`, `PRD-ACS-019`, `POL-02.19`): only for action types whose approval rule setting allows it (the allowlist, with no default: an empty one allows nothing). The selection shows its items and, for each shared basis, the sum of the known values and the number of items of Unknown value, never adding Unknown as zero (`PRD-MOD-015`) and never totalling different bases together. Each item is its own decision in its own transaction, rechecked for permission, scope, limit, state and independence; a failing item goes to individual review while the others go on; `bulk_decision_batch` links the decisions.
- **Due times and escalation for approvals and tasks** (9.4, 11.1, 11.3; GC3-8, `DEC-105`; `PRD-ACS-010`): `work_item_routing` versions per action type and Site, with the due-time rule and the escalation recipient and no default. `inbox` sets them when it receives an item; with no routing in force an item carries no due time. A job escalates an item past its due time: the recipient is added, the owner kept, the escalation recorded in the `work_item_escalation` record S1-F08-T02 builds, and the item shows Overdue.
- **Screens**: stand-in grants from My work's "delegate during absence" action (ui-blueprint); the bulk bar on My work's approvals, with the items, the total and the number of items of Unknown value ([design-language.md](../../../../design/ui/design-language.md) 10.9; access-and-approvals 14); due times and escalation recipients for approvals and tasks on a tab of Setup › Exception rules (S1-F08-T02), built from existing design-language components; the builder adds the tab to the UI blueprint with the code (product owner, 6 Oct 2026, DEC-116).

## Expected outputs

Stand-in grants, bulk decisions and approval and task routing, with their migrations and `tables.json` entries; schemas and routes; screens; tests

## Done when

- access-and-approvals 15 tests 17, 18, 18a and 20a pass, with a labelled synthetic allowlist, grants and routing
- A stand-in grant wider than the authority of the person stood in for is refused; once ended, the stand-in no longer sees the covered items
- Browser journey: an approver selects several synthetic requests, one of Unknown value, sees the known total and the count of Unknown items, and approves them in bulk; an item that fails its recheck stays for individual review, with its reason on screen

## Notes

- Blocked by S1-F08-T02 because approvals and tasks escalate through the `inbox` escalation record it builds for exceptions.
- Due times and escalation for approvals and tasks get a tab on Setup › Exception rules, using existing design-language components (product owner, 6 Oct 2026, DEC-116).
- The allowlist, named stand-ins, their scopes, limits and periods are OPEN (B-9, RR-059; KDPS Owner, Admin; live S1); so are the due times and recipients (KDPS question 52, RR-058). RR-177 confirms the GC3-7 and GC3-8 picks.
