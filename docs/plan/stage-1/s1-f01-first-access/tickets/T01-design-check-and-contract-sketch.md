# S1-F01-T01 — Design check and contract sketch

Status: done
Blocked by: —
Feature: [S1-F01 First access](../spec.md)

## Build

Read the design sections of section 2. Sketch the interfaces as Zod schemas and types only. Settle RR-017 in [access-and-approvals.md](../../../../design/access/access-and-approvals.md) 9.11: the permissions of the setup step's two roles (from the Admin template of blueprint grid 3a, confirmed later by KDPS under V-01) and the setup states of section 9 (finished, interrupted, conflicting) across the two databases; and how a request with a session cookie finds its Organisation's database. `DEC-112` already settles the setup states and the two roles' duties and limits (9.11); this task derives the exact matrix within them and has it independently reviewed

## Expected outputs

Schemas in `packages/schemas`; a reviewed design edit

## Done when

Typecheck passes; the design edit is independently reviewed; the product owner agrees the edit

## Notes

- Done: commit `eb81f53` (PR #5), 6 Oct 2026. Schemas in `packages/schemas/src/` (`setup`, `sign-in`, `roles`, `approvals`, `work-item`, `secret`, `common`); access-and-approvals 9.11 written and agreed (RR-017).
- Left open by this task: RR-206 (restoring the first users' lost credentials) and GC3-5 (temporary-password expiry), both in [open-items.md](../../../open-items.md).
