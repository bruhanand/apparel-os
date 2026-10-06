# S1-F01-T10 — Setup step

Status: blocked
Blocked by: T01, T07, T08, T11 (roles and assignments)
Feature: [S1-F01 First access](../spec.md)

## Build

The setup command of section 5 step 1 and section 9, run under the `setup` service identity

## Expected outputs

Command; operator note; tests

## Done when

Tests 19a, 19d and 19e and the setup cases of section 10 pass; the audit record names the service identity

## Notes

- RR-194: the setup step must deal with the `syn_org_a` and `syn_org_b` databases the seed already made, or the seed moves onto the setup step.
- RR-211: the canonical form of the setup fingerprint (login case, persona order, settings normalisation, first version).
- RR-206 stays a product-owner question: restoring the first Admin's or approver's lost credentials.
