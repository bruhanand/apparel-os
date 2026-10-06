# S1-F01-T08 — Sign-in and enrolment

Status: blocked
Blocked by: T05, T07
Feature: [S1-F01 First access](../spec.md)

## Build

Users and versions, service identities and their credentials (access-and-approvals 2.3), Argon2 password credentials, the encrypted authenticator secret under a per-Organisation key held outside the database, sessions stored as a hash, the sign-in steps, enrolment at first sign-in, own password change after a fresh code, access records for every attempt, throttling from a setting (access-and-approvals 3.1, 3.2, 6)

## Expected outputs

`access` sign-in; tests

## Done when

access-and-approvals 15 tests 2, 3, 3c, 3d and 3e and numbering-and-audit 7 test 13 pass; no secret appears in logs

## Notes

- RR-209: a "slowed" sign-in answer may reveal which logins exist if throttling counts per login; settle with GC3-5.
- RR-213: where a pending user's temporary password lives, and for how long.
- RR-208: the enrolment secret, shown once (house rules 12.6).
