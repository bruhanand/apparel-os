# S1-F01-T08 — Sign-in and enrolment (API)

Status: done
Blocked by: T04 (done), T07 (done)
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
- RR-213: settled here (access-and-approvals 3.2, 13.1): the temporary password lives in `password_credential`, naming its user version; a replaced credential keeps no hash; T13's rejection retires it.
- RR-208: done here: the enrolment answer shows the secret once; a replay is `kernel.answer-not-repeatable`.
- RR-245 and RR-248 (from T04): done here. The Origin check is a kernel guard against `AOS_PUBLIC_ORIGIN`; the replay secret check and the restricted-value cipher are `access`'s, under `AOS_ORGANISATION_KEYS`, wired with `idempotencyModuleWith`.
- Built on branch `s1/f01-t08`, test-first (commit `953ad92`): migrations `organisation/0005__access__users_and_credentials.sql` and `0006__access__settings_and_sign_in_failures.sql`; `modules/access` (sign-in, Authenticate guard, enrolment, own password change, service identities, the two contracts); `packages/schemas` sign-in routes and `access` codes. Tests: `test/sign-in.int.test.ts` (tests 2, 3, 3c, 3d, 3e, 3g; numbering-and-audit 7 test 13; the leak checks of house rules 12.11 for sign-in, enrolment and the password change) and `test/access-credentials.int.test.ts`.
- Design details written in the same change: access-and-approvals 3.1 (how throttling works), 3.2 (RR-213, password-rule shape), 3.3 (cookie name), 6 (keys), 13.1; code-house-rules 12.1, 12.3; deployment.md 3, 9.
- Sign-in, Authenticate and the settings need the Organisation's timezone, so outside tests nobody signs in until `configuration` supplies it (RR-250, with RR-231). Settings not set make sign-in or the password change unavailable, naming the setting (code-house-rules 12.14), so `dev` needs synthetic throttling and password rules (RR-054).
- Follow-ups: RR-250 to RR-254 in open-items.
- S1-F01 review fixes (branch `s1/f01-review-fixes`): the one-step TOTP drift is written into access-and-approvals 3.1 as a technical value of RFC 6238; the logger keeps only a database error's SQLSTATE, constraint and table (code-house-rules 12.11).
