# S1-F01-T23 — Screens: no-access landing, Organisation time zone, enrolment QR code and fonts

Status: ready-for-agent
Blocked by: —
Feature: [S1-F01 First access](../spec.md)

## Build

- **No access assigned** (RR-260; `PRD-ACS-002`; `DEC-118`, `DEC-116` Q5). Landing keeps `DEC-116`'s order; where it falls back, a person who holds a role assignment in force lands on My work, and a person with none lands on a "No access assigned" page: one card, a line saying an Admin must assign a role, and **Sign out** as the one action, with no sidebar menu (personas.md section 2; design-language 10.20). Extend `apps/web/src/shell/landing.ts`.
- **The Organisation's time zone on screens** (RR-310; `PRD-MOD-017`, `PRD-MOD-009`; `DEC-118`). The session read carries the Organisation's timezone; every time on a screen (history, My work, the access screens, version dates) is formatted with `Intl` in that timezone, whatever the device's (design-language 8; code-house-rules 9). Timestamps stay stored in UTC.
- **QR code at enrolment** (RR-280; `PRD-SEC-001`, `PRD-SEC-014`; `DEC-118`). Add one maintained QR code library under the PRD Stack's Authentication row (code-house-rules 10.6); the pull request names that row. The enrolment screen draws the `otpauth:` setup link as a QR code in the browser from the answer that shows the secret once; nothing calls an outside QR service or any other origin, and the image is not stored, cached or logged. The setup key in groups of four stays as the manual fallback, and the QR code has a text alternative saying to type the key (access-and-approvals 3.2; design-language 10.20).
- **Self-hosted fonts** (RR-262; `DEC-118`). Commit the WOFF2 files of Source Sans 3, Source Code Pro and Noto Sans Devanagari in the weights of design-language 3, each with its licence file (SIL Open Font Licence 1.1) beside it, served from the app's own origin with `@font-face`; no package and no font service (code-house-rules 12.1).

## Expected outputs

Web app changes in `apps/web` (shell landing, the no-access page, time formatting, the enrolment screen, fonts and licence files); the session read's timezone field in `packages/schemas` and `access`, with `openapi.json` regenerated; the QR library in `apps/web/package.json` and the lockfile; tests.

## Done when

- A unit test of the landing rule: no assignment in force gives the "No access assigned" page; an assignment with no granted screen of the first persona gives My work; `DEC-116` cases still pass.
- A unit test formats a fixed UTC instant in a synthetic Organisation timezone different from the test machine's and gets the Organisation's local time.
- A browser journey (Playwright): a synthetic user with no role assignment signs in, sees "No access assigned" and signs out; the enrolment screen shows a QR code and the setup key, and the network log shows no request to another origin.
- The browser's network log shows the three font families loaded from the app's own origin; the licence files are in the repository beside the font files.
- The full check set and the browser journeys pass.
