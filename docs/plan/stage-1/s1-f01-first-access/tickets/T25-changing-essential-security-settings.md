# S1-F01-T25 — Changing essential security settings

Status: ready-for-agent
Blocked by: T22 (done; both change `access` versions and Decide)
Feature: [S1-F01 First access](../spec.md)

## Build

- **Setup validates the required settings** (code-house-rules 12.14; `PRD-SEC-017`; `DEC-118`). The setup step refuses a request that leaves out any required security setting (the timezone, the sign-in throttling, the password rules, the office session limits), naming what is missing, before it creates anything; sign-in stays unavailable while any is not set (access-and-approvals 3.1, 9.11). Update the setup request schema, the fingerprint tests and the synthetic request files.
- **Changing a setting after setup** (RR-334; `POL-02.06`, `POL-02.07`, `PRD-MOD-010`; `DEC-118`). Prepare and Decide for a new version of the sign-in throttling, the password rules or the office session limits: prepared by a person with edit on the setting's record type, approved by a different authorised person with approve on it, with a fresh authenticator code (protected action), effective from its decision or a later date, never earlier; audited, with a permission-change access record; the version records its origin; a required setting can never be removed (access-and-approvals 3.3, 9.11; code-house-rules 7.3, 12.14). Validation by a person who did not enter the values (V-04, DM-6) stays with `S1-F04`.
- **A small form** (design-language 10.19 "Security settings"): each setting with its version in force and origin, a form to prepare a new version, decided from My work with the approval panel. The general settings screen stays with `S1-F04`.
- No setting value is chosen here: tests use labelled synthetic values only.

## Expected outputs

`access` routes, schemas and commands for the three settings; the setup step's validation; the web form; `openapi.json` regenerated; tests.

## Done when

- access-and-approvals 15 test 19j passes: the setup step refuses a request without any one of the required settings and names it; sign-in names a missing setting.
- Test 19k passes: a change prepared by one person takes effect only when a different authorised person approves it with a fresh code; the preparer cannot approve it; the history shows both versions, the preparer, the approver and the reason.
- An integration test: a new throttling or session-limit version approved now applies to the next sign-in or request; a password-rules version applies to the next password set.
- A browser journey: the Admin prepares a session-limit change, the approver approves it from My work.
- The full check set and the browser journeys pass.
