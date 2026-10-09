# S1-F02-T04 — Configurable classifications and grouping kinds, with the 9 Oct answers

Status: ready-for-agent
Blocked by: S1-F02-T03 (done)
Feature: [S1-F02 Organisation structure and verified mappings](../../spec.md)

## Build

The product owner's answers of 9 Oct 2026 to RR-440, RR-444 and RR-453 ([open-items.md](../../../open-items.md)).

- **Classifications of Sites and Stores** (RR-440; `PRD-ORG-008`; [structure-and-masters.md](../../../../design/masters/structure-and-masters.md) 3.1, 3.3, 6.1): a configurable baseline, following the PRD. The Organisation defines its own classification kinds and their values for Sites and for Stores. Each Site or Store version may carry them, kept with its other versioned fields. Every change goes through flow A with a different authorised approver, as the other masters do. No kind or value is set in code, a migration or a seed; tests use labelled synthetic ones.
- **Grouping kinds** (RR-440; `PRD-ORG-007`; structure-and-masters 3.1, 3.6): region and cluster stop being fixed in the database. The Organisation defines its grouping kinds, region and cluster included, as records under the same approval. Existing synthetic groupings on `dev` keep working.
- **Preparing a unit with its first mapping** (RR-444; access-and-approvals 9.8b): preparing needs create on the unit and edit on the mapping, matching the approval rule, which needs approve on both. A refusal names the missing permission (`PRD-UXP-003`).
- **Identity documents on user-change evidence** (RR-453; access-and-approvals 9.5, 12.4): evidence attached to a user change (a new user, a change to a user, a credential reset) carries the restricted class `identity-documents`. Every other approval rule and exception type declares none, as now. The KDPS Admin confirms before live use.
- **Screens** (structure-and-masters 8): Setup › Organisation structure lists the classification kinds and grouping kinds with their versions. The Site and Store editors offer the Organisation's own classifications.
- Write each design detail into structure-and-masters 3.1, 3.6, 6.1 and 8 and access-and-approvals 9.5 and 9.8b with the code.

## Expected outputs

Migration and `tables.json` entries; schemas and routes; screens; tests; design edits

## Done when

- An Organisation defines a Site classification kind with two values and a grouping kind other than region and cluster; a different person approves each; a Site and a Store carry a classification, and a Store joins a grouping of the new kind; the master lists show them as of a date
- No classification kind, value or grouping kind exists in a fresh Organisation
- Preparing a unit with its first mapping without edit on the mapping is refused, naming the permission
- Evidence attached to a user-change decision is listed as restricted, and only a reader with `identity-documents` can open it
- Browser journey: an Admin defines a classification kind and value; an approver approves; the Admin gives a Site that classification

## Notes

- KDPS's starting list of classifications and groupings is KDPS Owner question 63 ([questions-for-kdps.md](../../../../questions-for-kdps.md)); the identity-document class is confirmed by the KDPS Admin (Admin questions).
- How reports use classifications and groupings is for the report designs in later stages.
- Built (9 Oct 2026, branch `s1/f02-t04`): migration `0044__organisation__classifications_and_grouping_kinds.sql` (grouping kinds, classification kinds and values with their versions, the classifications Site and Store versions carry, the grouping's kind as a grouping kind's code) with its `tables.json` entries; the three new kinds in the per-kind descriptor, the version rules, approval rules and decision effects, paged lists and one-record reads, and the master lists; `classificationValueIds` on Site and Store versions, refused for a value of the other's kind (`organisation.classification-of-another-kind`); a grouping names its `groupingKindId`; the three tabs on Setup › Organisation structure and the classifications in the Site and Store editors; RR-444: preparing a unit with its first mapping, or re-dating its draft, needs edit on the mapping too, held at step 0 with the unit's (`holdAuthority`'s further needs); RR-453: `access.user.change` declares `identity-documents`. Tests: `organisation-classifications.int.test.ts` (with the legacy-grouping migration case), route cases in `organisation-routes.int.test.ts` and `organisation-unit-routes.int.test.ts`, the user-change evidence case in `evidence.int.test.ts`, a rule test in `approval-rules.test.ts`, and the classifications journey in `organisation-structure.spec.ts`, run after the Site journey in the same file so neither sees the other's Site change in My work.
- Design details settled in the design with this change (structure-and-masters 3.1, 3.6, 6.1, 8; access-and-approvals 9.5, 9.8b, 12.4): what a classification kind classifies is fixed at creation; a version may carry several values of one kind; a value's code is unique in its kind; the database holds a Site to Site kinds' values by a foreign key on what the value classifies; a grouping keeps its kind by the kind's code, and migration `0044` records each kind earlier groupings name as a grouping kind with no version, writing nothing in a fresh Organisation; a grouping's kind is checked in force for its first version only; the further permission is checked after the route's and held in one step-0 call; a credential reset takes no approval, so has no decision evidence.
- Beyond the ticket: the `further` parameter of `access`'s `holdAuthority` (a small change, needed because step 0 is one lock call); the table-register test now sorts both sides alike, since the new table names exposed a collation difference; the `approvedGroupingKind` test helper.
- Left open: RR-454, the screen's download of a restricted evidence file, is now due (the first class is declared here); the KDPS starting list (KDPS Owner 63) and the Admin's confirmation of the identity-document class stay with KDPS.
