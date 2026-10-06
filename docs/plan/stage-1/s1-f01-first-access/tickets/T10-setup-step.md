# S1-F01-T10 — Setup step

Status: done
Blocked by: T01 (done), T07, T08, T09 (session revocation and the credential reset the recovery command uses), T11 (roles and assignments)
Feature: [S1-F01 First access](../spec.md)

## Build

- The setup command of section 5 step 1 and section 9, run under the `setup` service identity
- The recovery command for the first two users (access-and-approvals 3.2; GC3-13; product owner, 6 Oct 2026, DEC-116): an operator command like setup, never an API route, that restores a lost password or authenticator of the first Admin or the first approver, only while no user of the Organisation holds the credential-reset permission. It verifies the person's identity and records how it was verified, revokes the user's sessions, writes an access record, and grants no role or permission; the user completes the reset at the next sign-in, as after any other reset

## Expected outputs

Setup and recovery commands; operator note; tests

## Done when

- Tests 19a, 19d and 19e and the setup cases of section 10 pass; the audit record names the service identity
- The recovery command restores a lost password and a lost authenticator for the first Admin and for the first approver of a synthetic Organisation: it records how identity was verified, revokes the user's sessions, writes an access record and grants no role or permission; it is refused once a user of the Organisation holds the credential-reset permission, and no API route reaches it

## Notes

- RR-194: the setup step must deal with the `syn_org_a` and `syn_org_b` databases the seed already made, or the seed moves onto the setup step.
- RR-211: the canonical form of the setup fingerprint (login case, persona order, settings normalisation, first version).
- RR-206 answered (product owner, 6 Oct 2026, DEC-116): the recovery command of Build. It uses T09's session revocation and credential reset.
- Built (7 Oct 2026, branch `s1/f01-t10`, commit 1428367): `runSetupStep` and `runRecovery` in `apps/server/src/modules/access/operator/`, with the operator commands `setup-organisation` and `recover-first-user` (`apps/server/src/*.ts`); the `configuration` module with the Organisation's timezone (RR-231, RR-250); migrations 0013 (configuration) and 0014 (`access.setup_record`). Tests: `test/setup-step.int.test.ts` (19a, 19d, 19e, the setup cases of section 10), `test/recovery.int.test.ts` (3f). RR-194, RR-211, RR-271, RR-290 closed; follow-ups RR-330 to RR-334.
- The approval-side parts of `S1-F01-AT01` (the next access change needs a different approver) are proved with Decide in `S1-F01-T13`; this ticket proves the first approver holds no create or edit and the first Admin no approve.
- S1-F01 review fixes (branch `s1/f01-review-fixes`): the password rules are checked only once the step knows it will create the Organisation, so a finished setup is refused as a duplicate before any password is checked, and the refusal names neither user (spec section 10).
