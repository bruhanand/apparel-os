# S1-F01-T15 — Sign-in in the browser

Status: done
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
- Built 7 Oct 2026 on `s1/f01-t15` (commit `S1-F01-T15: sign-in screens and the first browser journey`).
  - Screens in `apps/web/src/sign-in/` (design-language 10.20, added with the code): sign-in, enrolment, password change. After each step they read the session, so a reload returns to the step still to do. Manual check against design-language: done on the journey's screenshots (one primary per card, solid e1 card, banners per 10.12, form fields per 10.7, focus ring).
  - `useRouteForm` now hands on the typed input (`routeResolver`), not the schema's output, so a secret field is sent as typed, never as the `Secret` placeholder.
  - Playwright in `apps/web/e2e/` (config `e2e/playwright.config.ts`), `pnpm test:e2e`; the journeys' server is `apps/server/test/browser/serve.ts` (code-house-rules 11.2), which gives the synthetic timezone, throttling and password rules in the test composition only (RR-250). CI job `browser-journeys` uploads `apps/web/test-results` (traces) and the report as the `playwright-traces` artefact.
  - Follow-ups: RR-280 (no QR code), RR-281 (no personas held or grants after sign-in; T11), RR-262 (fonts) moved to the product owner and T16.
