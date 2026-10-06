# S1-F01-T19 — Browser journeys

Status: blocked
Blocked by: T10, T15 to T18
Feature: [S1-F01 First access](../spec.md)

## Build

Playwright added to the workspace and to CI in Chromium (PRD Stack: Verification); journeys of section 14 test `S1-F01-AT18`, including a keyboard-only path through sign-in and approval

## Expected outputs

Playwright config; journeys; CI job

## Done when

Journeys pass in CI and keep their traces as artefacts

## Notes

- RR-192: persona browser journeys; Playwright arrives here and unblocks the counter run of S1-F11-T10.
- Synthetic users and role assignments for the journeys come from the fixtures (house rules 11).
