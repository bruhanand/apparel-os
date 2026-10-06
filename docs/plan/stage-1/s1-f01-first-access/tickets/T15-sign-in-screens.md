# S1-F01-T15 — Sign-in in the browser

Status: blocked
Blocked by: T08, T14
Feature: [S1-F01 First access](../spec.md)

## Build

- Screens: sign-in, enrolment and password change
- Playwright (from T19): added to the workspace and to CI in Chromium (PRD Stack: Verification); one sign-in journey whose user comes from the synthetic test fixtures, never from application code (house rules 11)

## Expected outputs

Screens; Playwright config; the sign-in journey; CI job

## Done when

- Manual check of the screens against design-language
- The sign-in journey passes in CI and keeps its trace as an artefact; the other `S1-F01-AT18` journeys are in T20

## Notes

- On 6 Oct 2026 (product owner) the session-lock screen moved to T09, and T19's Playwright setup and first journey moved here.
- RR-192: persona browser journeys; Playwright lands here and unblocks the counter run of S1-F11-T10.
- Synthetic users for the journeys come from the fixtures (house rules 11).
