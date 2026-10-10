# S1-F09-T04 — Tax-rule records

Status: done
Blocked by: S1-F02-T01 (tax registrations); S1-F06-T05 (stored files, for the CA's evidence)
Feature: [S1-F09 Books, posting maps, periods and tax-rule records](../../spec.md)

## Build

The tax rules part of `finance` ([shared-calculations.md](../../../../design/calculations/shared-calculations.md) 10; module-map 4.14).

- **Records and tables** (10.1, 10.3; `PRD-TAX-005`, `POL-10.02`): goods classification (HSN code unique in the Organisation, retired never deleted); rate and value rule per classification, with slabs (the lowest at zero, each bound's side stated, the rate an exact decimal, the value compared named in the rule, GC7-2); registration applicability per tax registration, read through `organisation`, with its components (when it charges tax, the shares add up to one; GC7-8); price basis (one version in force; GC7-1); rounding rule per kind (discount, tax, bill), with a unit in paise above zero, one of the four modes of 3.3 and a level for tax only.
- **Versions**: every record is effective-dated, prepared by an authorised Accounts user and in force only when a different authorised Accounts user decides it through `access` ([access-and-approvals.md](../../../../design/access/access-and-approvals.md) 9.3, 9.5), with the CA's evidence attached as a stored file through S1-F06-T05 or referenced, as for posting maps (GC4-2, `POL-10.05`; product owner, 6 Oct 2026, DEC-116); never starting on a past date and never edited in force; approved versions never overlap (house rules 7.3; GC2-7, `DEC-105`). The record checks reuse the pure part in `packages/calculations` (S1-F11-T03).
- **Read tax rules** (10.2): for a business date, a tax registration and a set of classifications, the rate and value rules, the registration applicability, the price basis and the rounding rules in force, each with its version identifier, in the shape the calculations take (section 4). A missing record answers "not set" (house rules 12.14), never a default.
- **API** (API only in stage 1; product owner, 6 Oct 2026, DEC-116): Maintain operations and routes; the record types and actions registered with `access`.

## Expected outputs

Tax-rule tables and migration in `finance`; Maintain and Read tax rules on its `index.ts`; tests

## Done when

- The synthetic rule data of shared-calculations 12.3, entered through Maintain and approved by a different person, is read back by Read tax rules for its date as the same rule inputs and versions the golden cases hold
- Overlapping approved versions, a version on a past date, a version approved by its preparer or by someone outside Accounts, a version decided with no CA evidence attached or referenced, slabs not starting at zero, component shares not adding up to one, a level on a discount or bill rule and a unit of zero are each refused; an unapproved version is never read; a date with no record in force answers not set; a second synthetic Organisation sees none of these records

## Notes

- No rate, slab, component, price basis, rounding rule or date is set here: all are OPEN for Accounts and the CA (V-18, RR-081; GC7-1 to GC7-4 and GC7-8, RR-136 to RR-139 and RR-143). Tests use the labelled synthetic data of 12.3.
- Tax-rule records are approved like posting maps: an Accounts preparer, a different Accounts approver, and the CA's evidence attached or referenced (GC4-2, `POL-10.05`; product owner, 6 Oct 2026, DEC-116). Who holds those roles is KDPS's (V-01); tests use labelled synthetic Accounts users.
- 10.1 says a style's HSN must name a classification in force, but `merchandise` does not call `finance` (module-map 4.12). Until a design places that check, the calculation's refusal of a line with no classification in force (5.8) is the check.
- The validity check that keeps selling unavailable until these records are valid (10.1, `PRD-SEC-017`) belongs with selling (stage 4); nothing here enables an operation.
- Tax configuration is API only in stage 1; Setup › Tax configuration is designed and built before the first live posting in stage 2 (product owner, 6 Oct 2026, DEC-116).
- Review fixes (S1-F09 review, 10 Oct 2026): `finance.tax_rule_ca_evidence` is removed; the tax rules part records and checks the CA's evidence in the books part's one record, `finance.ca_approval_evidence`, through the books part's interface (RR-486, product owner), and its route answers `{ evidenceId }`.
- Closed 10 Oct 2026 on `s1/f09-books-and-periods` (commits `2a69549`, `369d448`), reviewed with `/code-review` with the feature's other tickets; review fixes `732ff78`; no blocking finding left.
- Beyond the ticket: a record read and list (for version tokens) with a routes test; the `finance.code-taken` and `finance.record-not-found` messages made generic; a setting-origin column on each version, checked through `configuration`; module-map 4.14 "Uses" lists `files-imports`.
