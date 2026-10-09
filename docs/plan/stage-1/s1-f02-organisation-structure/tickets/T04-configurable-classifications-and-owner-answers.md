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
