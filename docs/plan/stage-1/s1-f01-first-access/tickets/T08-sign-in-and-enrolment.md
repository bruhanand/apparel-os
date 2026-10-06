# S1-F01-T08 — Sign-in and enrolment (API)

Status: blocked
Blocked by: T04, T07
Feature: [S1-F01 First access](../spec.md)

## Build

Users and versions, service identities and their credentials (access-and-approvals 2.3), Argon2 password credentials, the encrypted authenticator secret under a per-Organisation key held outside the database, sessions stored as a hash, the sign-in steps, enrolment at first sign-in, own password change after a fresh code, access records for every attempt, throttling from a setting (access-and-approvals 3.1, 3.2, 6). Throttling counts attempts by the typed login and by the source address, and a login that exists and one that does not get equivalent answers: the same refusal and the same slowing (product owner, 6 Oct 2026, DEC-116)

## Expected outputs

`access` sign-in; tests

## Done when

- access-and-approvals 15 tests 2, 3, 3c, 3d and 3e and numbering-and-audit 7 test 13 pass; no secret appears in logs
- With a labelled synthetic threshold, repeated failures are slowed per typed login and per source address, and an existing and a non-existing login get the same refusal and the same slowing

## Notes

- RR-209 answered (product owner, 6 Oct 2026, DEC-116): throttling counts by typed login and by source address, with equivalent answers, so it never shows which logins exist. The threshold values stay OPEN (GC3-5).
- RR-213: where a pending user's temporary password lives, and for how long.
- RR-208: the enrolment secret, shown once (house rules 12.6).
